// ============================================================
// tickets.js — Ticket CRUD for regular users
// ============================================================

// ── Submit a New Ticket ───────────────────────────────────────
async function submitTicket({ userId, subject, category, priority, description }) {
  const { data, error } = await supabaseClient
    .from('tickets')
    .insert([{ user_id: userId, subject, category, priority, description, status: 'Pending' }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Fetch All Tickets for Current User ───────────────────────
async function fetchMyTickets(userId) {
  const { data, error } = await supabaseClient
    .from('tickets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// ── Fetch Single Ticket Detail ────────────────────────────────
async function fetchTicketById(ticketId) {
  const { data, error } = await supabaseClient
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .single();
  if (error) throw error;
  return data;
}

// ── Fetch Replies for a Ticket ────────────────────────────────
async function fetchReplies(ticketId) {
  const { data, error } = await supabaseClient
    .from('ticket_replies')
    .select('*, profiles(full_name, role)')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// ── Post a Reply (User) ───────────────────────────────────────
async function postReply({ ticketId, authorId, message, isAdminReply = false }) {
  const { data, error } = await supabaseClient
    .from('ticket_replies')
    .insert([{ ticket_id: ticketId, author_id: authorId, message, is_admin_reply: isAdminReply }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Get Ticket Stats for User ─────────────────────────────────
async function fetchUserStats(userId) {
  const { data, error } = await supabaseClient
    .from('tickets')
    .select('status')
    .eq('user_id', userId);
  if (error) throw error;
  const total = data.length;
  const pending = data.filter(t => t.status === 'Pending').length;
  const resolved = data.filter(t => t.status === 'Resolved' || t.status === 'Customer Marked as Resolved').length;
  return { total, pending, resolved };
}

// ── Close Ticket (User) ───────────────────────────────────────
async function closeTicketUser(ticketId) {
  const { data, error } = await supabaseClient
    .from('tickets')
    .update({ status: 'Customer Marked as Resolved', updated_at: new Date().toISOString() })
    .eq('id', ticketId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
