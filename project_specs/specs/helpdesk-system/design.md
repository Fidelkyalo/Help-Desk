# Help Desk Management System — Design

## Architecture Overview

The system is a client-side Single Page Application (SPA) built with vanilla HTML, CSS, and JavaScript. Supabase provides the backend: authentication, database, real-time subscriptions, and edge functions for secure third-party API calls.

```
┌─────────────────────────────────────────────┐
│              Browser (Client)               │
│  HTML + CSS + Vanilla JS                    │
│  - Auth pages (login, register)             │
│  - User dashboard & ticket views            │
│  - Admin dashboard & management views       │
└────────────────┬────────────────────────────┘
                 │ HTTPS / WebSocket
┌────────────────▼────────────────────────────┐
│              Supabase                        │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │   Auth   │  │ Postgres │  │ Realtime  │ │
│  └──────────┘  └──────────┘  └───────────┘ │
│  ┌──────────────────────────────────────┐   │
│  │         Edge Functions               │   │
│  │  - send-email  - send-sms            │   │
│  │  - send-whatsapp                     │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
                 │
    ┌────────────┼────────────┐
    ▼            ▼            ▼
 Email API    SMS API    WhatsApp API
(Resend/     (Twilio/   (Twilio/
 SendGrid)    Africa's   360dialog)
              Talking)
```

---

## Project File Structure

```
helpdesk/
├── index.html                  # Landing / login page
├── register.html               # User registration
├── dashboard.html              # User dashboard
├── ticket-new.html             # Submit new ticket
├── ticket-detail.html          # View single ticket + replies
├── admin/
│   ├── dashboard.html          # Admin overview
│   ├── tickets.html            # All tickets list
│   └── ticket-detail.html      # Admin ticket view + respond
├── css/
│   ├── main.css                # Global styles, variables, reset
│   ├── auth.css                # Login / register styles
│   ├── dashboard.css           # Dashboard layout
│   ├── tickets.css             # Ticket list & detail styles
│   └── responsive.css          # Media queries
├── js/
│   ├── supabase-client.js      # Supabase init & export
│   ├── auth.js                 # Login, register, logout, route guard
│   ├── tickets.js              # Ticket CRUD operations
│   ├── admin.js                # Admin-specific operations
│   ├── notifications.js        # Trigger edge function calls
│   ├── realtime.js             # Supabase Realtime subscriptions
│   └── utils.js                # Helpers (format date, show toast, etc.)
└── supabase/
    └── functions/
        ├── send-email/
        │   └── index.ts
        ├── send-sms/
        │   └── index.ts
        └── send-whatsapp/
            └── index.ts
```

---

## Database Schema

### Table: `profiles`
Extends Supabase Auth users. Created automatically via trigger on `auth.users`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, references auth.users(id) |
| full_name | text | |
| phone | text | For SMS/WhatsApp |
| role | text | `user` or `admin`, default `user` |
| created_at | timestamptz | |

### Table: `tickets`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto-generated |
| ticket_number | serial | Human-readable ID (e.g., #0042) |
| user_id | uuid | FK → profiles(id) |
| subject | text | |
| category | text | `Technical`, `Billing`, `General`, `Other` |
| priority | text | `Low`, `Medium`, `High` |
| description | text | |
| status | text | `Pending`, `Resolved`, default `Pending` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### Table: `ticket_replies`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| ticket_id | uuid | FK → tickets(id) |
| author_id | uuid | FK → profiles(id) |
| message | text | |
| is_admin_reply | boolean | |
| created_at | timestamptz | |

### Table: `notification_logs`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| ticket_id | uuid | FK → tickets(id) |
| user_id | uuid | FK → profiles(id) |
| type | text | `email`, `sms`, `whatsapp` |
| event | text | `submitted`, `replied`, `resolved` |
| status | text | `sent`, `failed` |
| sent_at | timestamptz | |

---

## Row Level Security (RLS) Policies

### `profiles`
- Users can read and update their own profile
- Admins can read all profiles

### `tickets`
- Users can insert tickets (their own user_id)
- Users can read only their own tickets
- Admins can read and update all tickets

### `ticket_replies`
- Users can insert replies on their own tickets
- Users can read replies on their own tickets
- Admins can insert and read replies on all tickets

### `notification_logs`
- Insert only via Edge Functions (service role key)
- Admins can read all logs

---

## Authentication Flow

```
User visits page
      │
      ▼
Check Supabase session (supabase.auth.getSession)
      │
   ┌──┴──┐
   │     │
No session  Active session
   │         │
   ▼         ▼
Redirect   Check role from profiles table
to login        │
           ┌────┴────┐
           │         │
         user       admin
           │         │
           ▼         ▼
      User         Admin
    Dashboard    Dashboard
```

---

## Ticket Lifecycle

```
User submits ticket
        │
        ▼
  Status: Pending ──────────────────────────────┐
        │                                        │
        │  Admin responds                        │
        ▼                                        │
  Reply added (status stays Pending)             │
        │                                        │
        │  Admin marks Resolved                  │
        ▼                                        │
  Status: Resolved ◄──────────────────────────── ┘
```

---

## Notification Flow

Each notification event calls a Supabase Edge Function:

```
Ticket event occurs (submit / reply / resolve)
        │
        ▼
notifications.js calls Edge Function via fetch()
        │
        ▼
Edge Function receives payload (user email, phone, message)
        │
   ┌────┼────┐
   ▼    ▼    ▼
Email  SMS  WhatsApp
API    API   API
        │
        ▼
Log result to notification_logs table
```

Edge Functions use the **service role key** (server-side only) so API credentials are never exposed to the browser.

---

## UI Pages & Components

### Public Pages
| Page | Description |
|------|-------------|
| `index.html` | Login form |
| `register.html` | Registration form |

### User Pages
| Page | Description |
|------|-------------|
| `dashboard.html` | My tickets list, stats summary, submit button |
| `ticket-new.html` | New ticket form |
| `ticket-detail.html` | Ticket info, reply thread, status badge |

### Admin Pages
| Page | Description |
|------|-------------|
| `admin/dashboard.html` | Stats cards, recent tickets table |
| `admin/tickets.html` | Full ticket list with filters |
| `admin/ticket-detail.html` | Ticket info, reply form, status update dropdown |

---

## Responsive Breakpoints

| Breakpoint | Target |
|------------|--------|
| `< 640px` | Mobile phones |
| `640px – 1023px` | Tablets |
| `≥ 1024px` | Desktops |

Navigation collapses to a hamburger menu on mobile. Ticket tables switch to card layout on small screens.

---

## Third-Party Integrations

| Service | Purpose | Recommended Provider |
|---------|---------|---------------------|
| Email | Transactional email notifications | Resend or SendGrid |
| SMS | SMS alerts | Twilio or Africa's Talking |
| WhatsApp | WhatsApp messages | Twilio or 360dialog |

All credentials stored as Supabase Edge Function environment secrets — never in client code.

---

## Security Considerations

- Supabase RLS enforced on all tables
- Admin role checked server-side via `profiles.role` — not just client-side
- Edge Functions use service role key for DB writes and API calls
- All user inputs sanitized before display to prevent XSS
- HTTPS enforced by Supabase hosting
