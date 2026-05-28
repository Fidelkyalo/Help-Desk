// ============================================================
// js/guide.js — Supabase Integration & Cloud Seeding Controller
// ============================================================

// Hardcoded fallback schema in case of direct local file:// protocol loading (avoids local CORS errors)
const SQL_SCHEMA_FALLBACK = `-- ============================================================================
-- Supabase Database Schema — Premium Help Desk Management System
-- ============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Sequence for sequential ticket numbers (starting at 1001)
create sequence if not exists ticket_number_seq start with 1001;

-- Table: public.profiles
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null unique,
  full_name text,
  phone text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Table: public.tickets
create table if not exists public.tickets (
  id uuid default gen_random_uuid() primary key,
  ticket_number integer not null default nextval('ticket_number_seq') unique,
  user_id uuid references public.profiles(id) on delete cascade not null,
  subject text not null,
  category text not null,
  status text not null default 'Pending' check (status in ('Pending', 'Resolved')),
  description text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Table: public.ticket_replies
create table if not exists public.ticket_replies (
  id uuid default gen_random_uuid() primary key,
  ticket_id uuid references public.tickets(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  message text not null,
  is_admin_reply boolean not null default false,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

-- Trigger Function: Auto-populate profile on User Sign-Up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    coalesce(new.raw_user_meta_data->>'phone', ''),
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

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_replies enable row level security;

-- Profiles Policies
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

-- Tickets Policies
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

-- Ticket Replies Policies
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
  );`;

let currentSession = null;
let realtimeChannel = null;

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  loadSQLSchema();
  initializeForm();
  refreshConsoleState();
  
  // Clipboard copy hook
  document.getElementById('copy-schema-btn').addEventListener('click', copySchemaToClipboard);
});

// 1. Dynamic Load SQL Schema
async function loadSQLSchema() {
  const preEl = document.getElementById('sql-schema-pre');
  try {
    const res = await fetch('supabase-schema.sql');
    if (!res.ok) throw new Error('File read blocked by CORS');
    const text = await res.text();
    preEl.textContent = text;
  } catch (e) {
    // Graceful fallback to our embedded schema string
    preEl.textContent = SQL_SCHEMA_FALLBACK;
    console.log('CORS blocked file load. Loaded database schema fallback correctly.');
  }
}

// 2. Clipboard copy with UI transformation
function copySchemaToClipboard() {
  const preEl = document.getElementById('sql-schema-pre');
  const btn = document.getElementById('copy-schema-btn');
  
  navigator.clipboard.writeText(preEl.textContent).then(() => {
    btn.innerHTML = '<span>✅</span> Schema Copied!';
    btn.classList.add('copy-btn--success');
    
    showToast('SQL schema copied to clipboard!', 'success');
    
    setTimeout(() => {
      btn.innerHTML = '<span>📋</span> Copy Schema';
      btn.classList.remove('copy-btn--success');
    }, 2000);
  }).catch(err => {
    showToast('Failed to copy schema: ' + err.message, 'error');
  });
}

// 3. Initialize credentials forms
function initializeForm() {
  const urlInput = document.getElementById('guide-db-url');
  const keyInput = document.getElementById('guide-db-key');
  
  urlInput.value = localStorage.getItem('custom_supabase_url') || window.SUPABASE_URL || '';
  keyInput.value = localStorage.getItem('custom_supabase_anon_key') || window.SUPABASE_ANON_KEY || '';
  
  document.getElementById('guide-apply-btn').addEventListener('click', () => {
    const url = urlInput.value.trim();
    const key = keyInput.value.trim();
    
    if (!url || !key) {
      showToast('Both fields are required to establish a connection', 'error');
      return;
    }
    
    localStorage.setItem('custom_supabase_url', url);
    localStorage.setItem('custom_supabase_anon_key', key);
    localStorage.removeItem('db_active_session'); // Reset session to force real sync
    
    showToast('Live database credentials saved! Reloading integrations...', 'success');
    setTimeout(() => window.location.reload(), 1000);
  });
  
  document.getElementById('guide-clear-btn').addEventListener('click', () => {
    localStorage.removeItem('custom_supabase_url');
    localStorage.removeItem('custom_supabase_anon_key');
    localStorage.removeItem('db_active_session');
    
    showToast('Credentials cleared. Reverting to sandbox console...', 'info');
    setTimeout(() => window.location.reload(), 1000);
  });
}

// 4. Update the console view & check connections
async function refreshConsoleState() {
  const isDemo = window.isDemoMode;
  const statusEl = document.getElementById('guide-connection-status');
  const logBox = document.getElementById('migration-logs-box');
  const migrateBtn = document.getElementById('start-migration-btn');
  
  // Fill offline mock statistics
  const localTickets = JSON.parse(localStorage.getItem('db_tickets')) || [];
  const localReplies = JSON.parse(localStorage.getItem('db_ticket_replies')) || [];
  
  document.getElementById('stat-mock-tickets').textContent = localTickets.length;
  document.getElementById('stat-mock-replies').textContent = localReplies.length;
  
  if (isDemo) {
    statusEl.innerHTML = '<span style="color: #f59e0b; font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 8px; height: 8px; border-radius:50%; background:#f59e0b; display:inline-block;"></span> Sandbox Simulator Mode (Offline)</span>';
    appendLog('migration-logs-box', '[System]: Running in offline simulator mode. Paste your live project credentials to start.', 'info');
    migrateBtn.disabled = true;
    return;
  }
  
  statusEl.innerHTML = '<span style="color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 8px; height: 8px; border-radius:50%; background:#94a3b8; display:inline-block; animation: pulse 1s infinite alternate;"></span> Contacting database...</span>';
  
  try {
    // 1. Connection check
    const { data: pCheck, error: pError } = await window.supabaseClient.from('profiles').select('id').limit(1);
    if (pError) {
      if (pError.code === 'PGRST116' || pError.message.includes('does not exist')) {
        statusEl.innerHTML = '<span style="color: #f43f5e; font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 8px; height: 8px; border-radius:50%; background:#f43f5e; display:inline-block; box-shadow:0 0 6px #f43f5e;"></span> Connected (Schema Missing)</span>';
        appendLog('migration-logs-box', '[Error]: Database reached but profiles table does not exist. Run the SQL schema first!', 'error');
        return;
      }
      throw pError;
    }
    
    // 2. Active Session check
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    currentSession = session;
    
    if (session) {
      statusEl.innerHTML = '<span style="color: #10b981; font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 8px; height: 8px; border-radius:50%; background:#10b981; display:inline-block; box-shadow:0 0 6px #10b981;"></span> Connected to Live Project</span>';
      document.getElementById('stat-live-user').textContent = session.user.email;
      document.getElementById('stat-live-user').style.color = '#34d399';
      
      appendLog('migration-logs-box', `[Connection]: Successfully connected to database as authenticated user: ${session.user.email}`, 'success');
      
      if (localTickets.length > 0) {
        migrateBtn.disabled = false;
        appendLog('migration-logs-box', `[Migrator]: Found ${localTickets.length} local tickets and ${localReplies.length} thread replies ready to migrate.`, 'info');
      } else {
        appendLog('migration-logs-box', '[Migrator]: Local database is empty. No offline data needs to be migrated.', 'info');
      }
      
      // Hook migration action
      migrateBtn.addEventListener('click', startMigration);
      
      // Enable Real-time test box
      initializeRealtimeTest();
    } else {
      statusEl.innerHTML = '<span style="color: #60a5fa; font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 8px; height: 8px; border-radius:50%; background:#3b82f6; display:inline-block;"></span> Connected (Unauthenticated)</span>';
      document.getElementById('stat-live-user').textContent = 'Not Signed In';
      appendLog('migration-logs-box', '[Auth]: Connection secure. To migrate offline data, please first go to index.html and sign in to a valid real user account on your live database.', 'info');
    }
    
  } catch (err) {
    statusEl.innerHTML = '<span style="color: #ef4444; font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem;"><span style="width: 8px; height: 8px; border-radius:50%; background:#ef4444; display:inline-block;"></span> Connection Failure</span>';
    appendLog('migration-logs-box', '[Error]: Client connection failed: ' + err.message, 'error');
  }
}

// 5. Database Migration Engine
async function startMigration() {
  const migrateBtn = document.getElementById('start-migration-btn');
  migrateBtn.disabled = true;
  migrateBtn.textContent = 'Migrating... ⌛';
  
  appendLog('migration-logs-box', '[Migration]: Reading local tickets...', 'info');
  const localTickets = JSON.parse(localStorage.getItem('db_tickets')) || [];
  const localReplies = JSON.parse(localStorage.getItem('db_ticket_replies')) || [];
  const liveUserId = currentSession.user.id;
  
  let migratedCount = 0;
  let replyCount = 0;
  
  try {
    for (const ticket of localTickets) {
      appendLog('migration-logs-box', `[Migration]: Uploading ticket "${ticket.subject}"...`, 'info');
      
      // Upload ticket to public.tickets. Let sequence handle ticket_number, let uuid generator handle ticket ID.
      const dbTicket = {
        user_id: liveUserId,
        subject: ticket.subject,
        category: ticket.category,
        status: ticket.status || 'Pending',
        description: ticket.description,
        created_at: ticket.created_at
      };
      
      const { data: newTicket, error: tErr } = await window.supabaseClient.from('tickets').insert([dbTicket]).select().single();
      if (tErr) throw tErr;
      
      migratedCount++;
      appendLog('migration-logs-box', `[Success]: Migrated ticket #${newTicket.ticket_number} (ID: ${newTicket.id})`, 'success');
      
      // Get replies belonging to this specific ticket
      const ticketReplies = localReplies.filter(r => r.ticket_id === ticket.id);
      if (ticketReplies.length > 0) {
        appendLog('migration-logs-box', `[Migration]: Migrating ${ticketReplies.length} replies belonging to ticket...`, 'info');
        
        for (const reply of ticketReplies) {
          // Map the author. If it was user, set to current authenticated live user ID.
          // If it was admin, we assign it to the current user as a post, but mark is_admin_reply = true
          // so it displays correct admin formatting (or stays as admin reply)!
          const dbReply = {
            ticket_id: newTicket.id,
            author_id: liveUserId, // Keep active user's author reference to bypass foreign key check
            message: reply.message,
            is_admin_reply: reply.is_admin_reply,
            created_at: reply.created_at
          };
          
          const { error: rErr } = await window.supabaseClient.from('ticket_replies').insert([dbReply]);
          if (rErr) throw rErr;
          replyCount++;
        }
      }
    }
    
    appendLog('migration-logs-box', `🎉 [Completed]: Fully migrated ${migratedCount} tickets and ${replyCount} comments to live database successfully!`, 'success');
    showToast('Data Migration Completed!', 'success');
    
    // Clear migrated local data to prevent duplicate runs
    localStorage.removeItem('db_tickets');
    localStorage.removeItem('db_ticket_replies');
    
    // Update dashboard statistics
    document.getElementById('stat-mock-tickets').textContent = '0';
    document.getElementById('stat-mock-replies').textContent = '0';
    migrateBtn.textContent = 'Migration Finished ✅';
    
  } catch (e) {
    appendLog('migration-logs-box', `❌ [Failed]: Migration aborted: ` + (e.message || JSON.stringify(e)), 'error');
    showToast('Migration failed: ' + e.message, 'error');
    migrateBtn.disabled = false;
    migrateBtn.textContent = 'Retry Cloud Migration';
  }
}

// 6. Real-time Subscription Tester
async function initializeRealtimeTest() {
  const rtInput = document.getElementById('rt-test-message');
  const rtSendBtn = document.getElementById('rt-test-send-btn');
  const rtLogs = document.getElementById('rt-logs-box');
  
  rtLogs.innerHTML = '';
  appendLog('rt-logs-box', '[Websocket]: Opening websocket subscription channel...', 'info');
  
  rtInput.disabled = false;
  rtSendBtn.disabled = false;
  
  try {
    // Create channel
    realtimeChannel = window.supabaseClient.channel('realtime_tester_channel');
    
    realtimeChannel
      .on('broadcast', { event: 'ping' }, ({ payload }) => {
        appendLog('rt-logs-box', `📡 [Broadcast Received]: "${payload.message}" (Sent at: ${new Date(payload.timestamp).toLocaleTimeString()})`, 'success');
        showToast('Websocket broadcast captured!', 'info');
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          appendLog('rt-logs-box', '🟢 [Websocket]: Subscription ACTIVE. Channel "realtime_tester_channel" listening.', 'success');
        } else {
          appendLog('rt-logs-box', `⚠️ [Websocket]: Subscription status changed to: ${status}`, 'info');
        }
      });
      
    // Broadcast trigger
    rtSendBtn.addEventListener('click', async () => {
      const msg = rtInput.value.trim();
      if (!msg) return;
      
      appendLog('rt-logs-box', `📤 [Broadcast Sending]: "${msg}"...`, 'info');
      
      try {
        await realtimeChannel.send({
          type: 'broadcast',
          event: 'ping',
          payload: { message: msg, timestamp: new Date().toISOString() }
        });
        rtInput.value = '';
      } catch (err) {
        appendLog('rt-logs-box', `🔴 [Error]: Broadcast failed: ${err.message}`, 'error');
      }
    });
    
  } catch (err) {
    appendLog('rt-logs-box', '🔴 [Error]: Websocket subscription failed: ' + err.message, 'error');
  }
}

// Helper to write color logs
function appendLog(elementId, text, type = 'default') {
  const box = document.getElementById(elementId);
  if (!box) return;
  
  const entry = document.createElement('div');
  entry.className = `migration-log-entry migration-log-entry--${type}`;
  entry.textContent = text;
  box.appendChild(entry);
  box.scrollTop = box.scrollHeight;
}
