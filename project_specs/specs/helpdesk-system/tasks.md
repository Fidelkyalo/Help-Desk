# Help Desk Management System — Implementation Tasks

## Phase 1: Project Setup & Database

- [ ] 1. Initialize project folder structure (html, css, js, supabase/functions)
- [ ] 2. Create Supabase project and configure environment
- [ ] 3. Create database tables: `profiles`, `tickets`, `ticket_replies`, `notification_logs`
- [ ] 4. Set up RLS policies for all tables
- [ ] 5. Create `profiles` auto-insert trigger on `auth.users`
- [ ] 6. Initialize `supabase-client.js` with project URL and anon key

## Phase 2: Authentication

- [ ] 7. Build `register.html` — registration form (name, email, phone, password)
- [ ] 8. Build `index.html` — login form
- [ ] 9. Implement `auth.js` — register, login, logout, session check, role fetch
- [ ] 10. Implement route guard — redirect unauthenticated users to login
- [ ] 11. Implement role-based redirect — users → dashboard, admins → admin/dashboard

## Phase 3: User Dashboard & Tickets

- [ ] 12. Build `dashboard.html` — ticket list, stats summary, submit button
- [ ] 13. Build `ticket-new.html` — new ticket form (subject, category, priority, description)
- [ ] 14. Build `ticket-detail.html` — ticket info, reply thread, status badge
- [ ] 15. Implement `tickets.js` — submit ticket, fetch user tickets, fetch ticket detail, post reply
- [ ] 16. Implement Supabase Realtime in `realtime.js` — live status and reply updates

## Phase 4: Admin Dashboard

- [ ] 17. Build `admin/dashboard.html` — stats cards (total, pending, resolved), recent tickets
- [ ] 18. Build `admin/tickets.html` — full ticket list with status/priority/category filters
- [ ] 19. Build `admin/ticket-detail.html` — ticket view, reply form, status update dropdown
- [ ] 20. Implement `admin.js` — fetch all tickets, update status, post admin reply

## Phase 5: Notification System

- [ ] 21. Create Supabase Edge Function `send-email` — integrate Resend or SendGrid
- [ ] 22. Create Supabase Edge Function `send-sms` — integrate Twilio or Africa's Talking
- [ ] 23. Create Supabase Edge Function `send-whatsapp` — integrate Twilio or 360dialog
- [ ] 24. Implement `notifications.js` — call edge functions on ticket submit, reply, resolve
- [ ] 25. Log all notification results to `notification_logs` table

## Phase 6: Styling & Responsive Design

- [ ] 26. Build `main.css` — CSS variables, reset, typography, global layout
- [ ] 27. Build `auth.css` — login and register page styles
- [ ] 28. Build `dashboard.css` — sidebar/nav, stats cards, ticket list layout
- [ ] 29. Build `tickets.css` — ticket form, detail view, reply thread styles
- [ ] 30. Build `responsive.css` — media queries for mobile (< 640px), tablet (640–1023px)
- [ ] 31. Implement mobile hamburger navigation

## Phase 7: Testing & Deployment

- [ ] 32. Test full user flow: register → login → submit ticket → receive notification
- [ ] 33. Test admin flow: login → view tickets → respond → resolve → notification sent
- [ ] 34. Test RLS — verify users cannot access other users' tickets
- [ ] 35. Test responsive layout on mobile, tablet, desktop
- [ ] 36. Deploy frontend (Netlify, Vercel, or Supabase hosting)
- [ ] 37. Deploy Supabase Edge Functions and set environment secrets
