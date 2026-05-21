# Help Desk Management System — Requirements

## Overview

A modern, responsive Help Desk Management System built with HTML, CSS, JavaScript, and Supabase. Users can register, log in, submit support tickets, and track their status. Admins manage tickets, respond to users, and update statuses. Automated notifications are sent via Email, SMS, and WhatsApp at key ticket lifecycle events.

---

## Functional Requirements

### 1. User Authentication

**REQ-AUTH-01** — User Registration  
Users shall be able to create an account by providing their full name, email address, phone number (for SMS/WhatsApp), and a password.

**REQ-AUTH-02** — Secure Login  
Users shall be able to log in using their email and password. Authentication is handled via Supabase Auth.

**REQ-AUTH-03** — Logout  
Users shall be able to securely log out from any page.

**REQ-AUTH-04** — Role Assignment  
Each user account shall be assigned a role: `user` or `admin`. Role-based access control shall restrict admin features from regular users.

**REQ-AUTH-05** — Protected Routes  
Unauthenticated users shall be redirected to the login page when attempting to access protected pages.

---

### 2. Ticket Submission (User)

**REQ-TICKET-01** — Submit a Ticket  
Authenticated users shall be able to submit a support request by providing:
- Subject / Title
- Category (e.g., Technical, Billing, General)
- Priority (Low, Medium, High)
- Description of the issue

**REQ-TICKET-02** — Ticket ID  
Each submitted ticket shall be assigned a unique ticket ID automatically.

**REQ-TICKET-03** — Initial Status  
All newly submitted tickets shall have a default status of `Pending`.

**REQ-TICKET-04** — View Own Tickets  
Authenticated users shall be able to view a list of all tickets they have submitted, including status and last updated time.

**REQ-TICKET-05** — View Ticket Detail  
Users shall be able to click into a ticket to view its full details, admin responses, and current status.

---

### 3. Admin Ticket Management

**REQ-ADMIN-01** — View All Tickets  
Admins shall be able to view all tickets submitted by all users, with filtering by status, priority, and category.

**REQ-ADMIN-02** — Respond to Tickets  
Admins shall be able to add a response/reply to any ticket. Responses shall be visible to the submitting user.

**REQ-ADMIN-03** — Update Ticket Status  
Admins shall be able to update a ticket's status to:
- `Pending`
- `Resolved`

**REQ-ADMIN-04** — Admin Dashboard  
Admins shall have a dedicated dashboard showing:
- Total tickets
- Pending tickets count
- Resolved tickets count
- Recent ticket activity

**REQ-ADMIN-05** — Protected Admin Area  
The admin dashboard and management pages shall only be accessible to users with the `admin` role.

---

### 4. Notification System

**REQ-NOTIF-01** — Email on Ticket Submission  
When a user submits a ticket, an email notification shall be sent to the user confirming receipt, including the ticket ID and subject.

**REQ-NOTIF-02** — Email on Admin Response  
When an admin adds a response to a ticket, an email notification shall be sent to the ticket owner.

**REQ-NOTIF-03** — Email on Ticket Resolution  
When a ticket status is changed to `Resolved`, an email notification shall be sent to the ticket owner.

**REQ-NOTIF-04** — SMS Notifications  
SMS alerts shall be sent to the user's registered phone number for:
- Ticket submission confirmation
- Ticket resolution

**REQ-NOTIF-05** — WhatsApp Notifications  
WhatsApp messages shall be sent to the user's registered phone number for:
- Ticket submission confirmation
- Ticket resolution

**REQ-NOTIF-06** — Notification Log  
All sent notifications (email, SMS, WhatsApp) shall be logged in the database with timestamp, type, recipient, and status (sent/failed).

---

### 5. Responsive Design

**REQ-UI-01** — Mobile Responsiveness  
The application shall be fully responsive and usable on mobile phones (320px+), tablets (768px+), and desktops (1024px+).

**REQ-UI-02** — Mobile Navigation  
The navigation shall include a mobile-friendly menu (hamburger menu or bottom nav) for small screens.

**REQ-UI-03** — Modern UI  
The interface shall feature a clean, modern design with a consistent color scheme, readable typography, and clear call-to-action elements.

---

## Non-Functional Requirements

**REQ-SEC-01** — Supabase Row Level Security (RLS)  
Database tables shall have RLS policies ensuring users can only read/write their own data, while admins have broader access.

**REQ-SEC-02** — Input Validation  
All form inputs shall be validated on the client side before submission. Server-side validation is enforced via Supabase policies.

**REQ-SEC-03** — Secure API Keys  
All third-party API keys (email, SMS, WhatsApp) shall not be exposed in client-side code. Calls shall be routed through Supabase Edge Functions.

**REQ-PERF-01** — Real-Time Updates  
Ticket status changes and admin responses shall reflect in the user's dashboard in real time using Supabase Realtime subscriptions.

---

## User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US-01 | New user | Register an account | I can submit support requests |
| US-02 | User | Log in securely | I can access my dashboard |
| US-03 | User | Submit a support ticket | I can report an issue |
| US-04 | User | View my tickets and their statuses | I can track progress |
| US-05 | User | Receive email/SMS/WhatsApp notifications | I stay informed without checking the app |
| US-06 | User | Read admin responses on my tickets | I know what action is being taken |
| US-07 | Admin | View all submitted tickets | I can manage the support queue |
| US-08 | Admin | Respond to a ticket | I can communicate with the user |
| US-09 | Admin | Update ticket status | I can reflect the current state of resolution |
| US-10 | Admin | See dashboard stats | I can monitor overall support activity |

---

## Acceptance Criteria

- A user can register, log in, and submit a ticket within 3 steps
- Submitted tickets appear immediately in the user's dashboard
- Admin can view, respond to, and resolve any ticket
- Notifications are triggered automatically on ticket submit, response, and resolution
- All pages render correctly on mobile, tablet, and desktop
- Non-admin users cannot access admin routes
- All API keys are secured and not exposed in frontend code
