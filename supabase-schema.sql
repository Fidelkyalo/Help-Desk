-- ============================================================================
-- Help Desk — Full Clean Schema (Safe to re-run)
-- ============================================================================

-- 1. CLEAN SLATE
-- ============================================================================
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_ticket_updated on public.tickets;
drop table if exists public.password_reset_requests cascade;
drop table if exists public.ticket_replies cascade;
drop table if exists public.tickets cascade;
drop table if exists public.profiles cascade;
drop sequence if exists ticket_number_seq;

-- 2. EXTENSIONS
-- ============================================================================
create extension if not exists "uuid-ossp";

-- 3. SEQUENCES
-- ============================================================================
create sequence if not exists ticket_number_seq start with 1001;

-- 4. TABLES
-- ============================================================================
create table public.profiles (
  id                    uuid references auth.users on delete cascade primary key,
  email                 text not null unique,
  full_name             text,
  phone                 text,
  pf_number             text,
  role                  text not null default 'user' check (role in ('user', 'admin')),
  suspended             boolean not null default false,
  suspension_reason     text,
  suspension_until      timestamp with time zone,
  security_questions    jsonb,
  reset_token           text,
  reset_token_expiry    timestamp with time zone,
  temp_password         text,
  temp_password_set_at  timestamp with time zone,
  created_at            timestamp with time zone not null default timezone('utc', now())
);

create table public.tickets (
  id            uuid default gen_random_uuid() primary key,
  ticket_number integer not null default nextval('ticket_number_seq') unique,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  subject       text not null,
  category      text not null,
  status        text not null default 'Pending'
                  check (status in ('Pending', 'Resolved', 'Customer Marked as Resolved')),
  description   text not null,
  created_at    timestamp with time zone not null default timezone('utc', now()),
  updated_at    timestamp with time zone not null default timezone('utc', now())
);

create table public.ticket_replies (
  id             uuid default gen_random_uuid() primary key,
  ticket_id      uuid references public.tickets(id) on delete cascade not null,
  author_id      uuid references public.profiles(id) on delete cascade not null,
  message        text not null,
  is_admin_reply boolean not null default false,
  created_at     timestamp with time zone not null default timezone('utc', now())
);

create table public.password_reset_requests (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null unique,
  email      text not null,
  full_name  text,
  status     text not null default 'pending'
               check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamp with time zone not null default timezone('utc', now())
);

-- 5. FUNCTIONS & TRIGGERS
-- ============================================================================

-- Auto-create profile row when a new auth user signs up
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
      when new.email = 'fidelkm16@gmail.com'
        or new.email = 'admin@helpdesk.com'
        or new.email like '%admin%'
      then 'admin'
      else 'user'
    end
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-update updated_at on ticket changes
create or replace function public.handle_update_timestamp()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

create trigger on_ticket_updated
  before update on public.tickets
  for each row execute procedure public.handle_update_timestamp();

-- Helper: check if current user is admin
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- ============================================================================
-- delete_own_account()
-- Fully deletes the calling user: profile row + auth.users entry.
-- Uses security definer so it runs with elevated privileges to delete
-- from auth.users (which the anon key cannot do directly).
-- Called via: supabaseClient.rpc('delete_own_account')
-- ============================================================================
create or replace function public.delete_own_account()
returns void as $$
declare
  calling_user_id uuid := auth.uid();
begin
  -- Block admins from self-deleting via this function
  if exists (
    select 1 from public.profiles
    where id = calling_user_id and role = 'admin'
  ) then
    raise exception 'Admin accounts cannot be self-deleted.';
  end if;

  -- Delete the profile row (cascades to tickets and replies via FK)
  delete from public.profiles where id = calling_user_id;

  -- Fully delete the auth user so the email is freed for re-registration
  delete from auth.users where id = calling_user_id;
end;
$$ language plpgsql security definer;

-- Grant execute permission to authenticated users
grant execute on function public.delete_own_account() to authenticated;

-- 6. ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles                enable row level security;
alter table public.tickets                 enable row level security;
alter table public.ticket_replies          enable row level security;
alter table public.password_reset_requests enable row level security;

-- Profiles
create policy "Users can read all profiles"
  on public.profiles for select to authenticated using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "Admins can update any profile"
  on public.profiles for update to authenticated
  using (is_admin()) with check (is_admin());

create policy "Users can delete their own profile"
  on public.profiles for delete to authenticated
  using (auth.uid() = id and not is_admin());

create policy "Admins can delete customer profiles"
  on public.profiles for delete to authenticated
  using (is_admin() and id != auth.uid());

-- Tickets
create policy "Users see own tickets, admins see all"
  on public.tickets for select to authenticated
  using (is_admin() or user_id = auth.uid());

create policy "Users submit own tickets, admins submit any"
  on public.tickets for insert to authenticated
  with check (is_admin() or user_id = auth.uid());

create policy "Users update own tickets, admins update any"
  on public.tickets for update to authenticated
  using (is_admin() or user_id = auth.uid())
  with check (is_admin() or user_id = auth.uid());

create policy "Admins can delete tickets"
  on public.tickets for delete to authenticated
  using (is_admin());

-- Ticket Replies
create policy "Users see replies on own tickets, admins see all"
  on public.ticket_replies for select to authenticated
  using (
    is_admin() or exists (
      select 1 from public.tickets
      where tickets.id = ticket_replies.ticket_id
        and tickets.user_id = auth.uid()
    )
  );

create policy "Admins and ticket owners can post replies"
  on public.ticket_replies for insert to authenticated
  with check (
    author_id = auth.uid() and (
      is_admin() or exists (
        select 1 from public.tickets
        where tickets.id = ticket_id
          and tickets.user_id = auth.uid()
      )
    )
  );

-- Password Reset Requests
create policy "Admins can read reset requests"
  on public.password_reset_requests for select to authenticated
  using (is_admin());

create policy "Admins can update reset requests"
  on public.password_reset_requests for update to authenticated
  using (is_admin()) with check (is_admin());

create policy "Users can submit their own reset request"
  on public.password_reset_requests for insert to authenticated
  with check (auth.uid() = user_id);

-- 7. REALTIME
-- ============================================================================
alter publication supabase_realtime add table public.tickets;
alter publication supabase_realtime add table public.ticket_replies;
alter publication supabase_realtime add table public.profiles;

-- 8. RESTORE ADMIN PROFILE
-- ============================================================================
-- Ensures the admin profile row exists even if it was accidentally deleted.
insert into public.profiles (id, email, full_name, phone, role)
select id, email, 'Admin', '', 'admin'
from auth.users
where email = 'fidelkm16@gmail.com'
on conflict (id) do update set role = 'admin', email = excluded.email;
