-- ============================================================================
-- Supabase Database Schema — Premium Help Desk Management System
-- ============================================================================
-- This script sets up the full database schema in PostgreSQL/Supabase.
-- It includes tables, foreign keys, triggers for automated profile creation,
-- sequential ticket numbering, helper functions, and robust Row-Level Security (RLS).
-- ============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABLES & SEQUENCES
-- ────────────────────────────────────────────────────────────────────────────

-- Sequence for sequential ticket numbers (starting at 1001)
create sequence if not exists ticket_number_seq start with 1001;

-- Table: public.profiles
-- Linked to Supabase Auth.users
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null unique,
  full_name text,
  phone text,
  pf_number text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Table: public.tickets
-- Holds support tickets submitted by users
create table if not exists public.tickets (
  id uuid default gen_random_uuid() primary key,
  ticket_number integer not null default nextval('ticket_number_seq') unique,
  user_id uuid references public.profiles(id) on delete cascade not null,
  subject text not null,
  category text not null,
  priority text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Resolved', 'Customer Marked as Resolved')),
  description text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Table: public.ticket_replies
-- Stores conversation threads under each ticket
create table if not exists public.ticket_replies (
  id uuid default gen_random_uuid() primary key,
  ticket_id uuid references public.tickets(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  message text not null,
  is_admin_reply boolean not null default false,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. AUTOMATION & TRIGGERS
-- ────────────────────────────────────────────────────────────────────────────

-- Trigger Function: Auto-populate profile on User Sign-Up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, phone, pf_number, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'pf_number', '')), ''),
    case 
      when new.email like '%admin%' or new.email = 'admin@helpdesk.com' or new.email = 'fidelkm16@gmail.com' then 'admin'
      else 'user'
    end
  );
  return new;
end;
$$ language plpgsql security definer;

-- Bind Trigger to auth.users table
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger Function: Automatically update "updated_at" timestamp on ticket changes
create or replace function public.handle_update_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Bind Trigger to tickets table
drop trigger if exists on_ticket_updated on public.tickets;
create trigger on_ticket_updated
  before update on public.tickets
  for each row execute procedure public.handle_update_timestamp();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. HELPER FUNCTIONS
-- ────────────────────────────────────────────────────────────────────────────

-- Helper function to check if the current requester is an Administrator
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ────────────────────────────────────────────────────────────────────────────

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_replies enable row level security;

-- --- Profiles Policies ---
create policy "Authenticated users can read all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  to authenticated
  with check (
    auth.uid() = id and (
      role = 'user' or 
      email = 'fidelkm16@gmail.com' or 
      email = 'admin@helpdesk.com' or 
      email like '%admin%'
    )
  );

-- --- Tickets Policies ---
create policy "Admins can view all tickets, and users can view their own tickets"
  on public.tickets for select
  to authenticated
  using (is_admin() or user_id = auth.uid());

create policy "Users can submit tickets for themselves, and admins can submit any ticket"
  on public.tickets for insert
  to authenticated
  with check (is_admin() or user_id = auth.uid());

create policy "Admins can update any ticket, and users can update their own tickets"
  on public.tickets for update
  to authenticated
  using (is_admin() or user_id = auth.uid())
  with check (is_admin() or user_id = auth.uid());

create policy "Admins can delete tickets"
  on public.tickets for delete
  to authenticated
  using (is_admin());

-- --- Ticket Replies Policies ---
create policy "Admins can view all replies, and users can view replies of their own tickets"
  on public.ticket_replies for select
  to authenticated
  using (
    is_admin() or 
    exists (
      select 1 from public.tickets
      where tickets.id = ticket_replies.ticket_id 
        and tickets.user_id = auth.uid()
    )
  );

create policy "Admins and ticket owners can post replies"
  on public.ticket_replies for insert
  to authenticated
  with check (
    author_id = auth.uid() and (
      is_admin() or 
      exists (
        select 1 from public.tickets
        where tickets.id = ticket_id 
          and tickets.user_id = auth.uid()
      )
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 5. INITIAL DATA SEEDING (SQL VERSION)
-- ────────────────────────────────────────────────────────────────────────────
-- Note: Supabase Auth users must be created through Supabase Auth dashboard/API.
-- However, if you are seeding database rows for testing, these match the local
-- demo data provided automatically in local-storage sandbox mode.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 6. ENABLE REALTIME REPLICATION
-- ────────────────────────────────────────────────────────────────────────────
-- Enable realtime updates for the main help desk transaction tables
begin;
  -- Remove tables from publication if they exist to avoid duplication
  alter publication supabase_realtime drop table if exists public.tickets;
  alter publication supabase_realtime drop table if exists public.ticket_replies;
  
  -- Add tables to the realtime publication
  alter publication supabase_realtime add table public.tickets;
  alter publication supabase_realtime add table public.ticket_replies;
commit;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. ACCOUNT MANAGEMENT COLUMNS (run once as a migration)
-- ────────────────────────────────────────────────────────────────────────────
-- Adds suspension tracking fields to the profiles table.
-- Run these statements in your Supabase SQL editor.

alter table public.profiles
  add column if not exists suspended        boolean                  not null default false,
  add column if not exists suspension_reason text,
  add column if not exists suspension_until  timestamp with time zone,
  add column if not exists pf_number         text;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. ADDITIONAL RLS POLICIES FOR ADMIN ACCOUNT MANAGEMENT
-- ────────────────────────────────────────────────────────────────────────────

-- Allow admins to update ANY profile (e.g. to set suspended / suspension fields)
create policy "Admins can update any profile"
  on public.profiles for update
  to authenticated
  using (is_admin())
  with check (is_admin());

-- Allow admins to delete customer profiles (prevents self-deletion via admin panel)
create policy "Admins can delete customer profiles"
  on public.profiles for delete
  to authenticated
  using (is_admin() and id != auth.uid());

