// ============================================================
// admin.js — Admin-specific ticket operations
// ============================================================

// ── Fetch All Tickets (with user profile info) ────────────────
async function fetchAllTickets({ status = null, category = null } = {}) {
  let query = supabaseClient
    .from('tickets')
    .select('*, profiles(full_name, phone)')
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ── Update Ticket Status ──────────────────────────────────────
async function updateTicketStatus(ticketId, status) {
  const { data, error } = await supabaseClient
    .from('tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', ticketId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Post Admin Reply ──────────────────────────────────────────
async function postAdminReply({ ticketId, authorId, message }) {
  const { data, error } = await supabaseClient
    .from('ticket_replies')
    .insert([{ ticket_id: ticketId, author_id: authorId, message, is_admin_reply: true }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Fetch Admin Dashboard Stats ───────────────────────────────
async function fetchAdminStats() {
  const { data, error } = await supabaseClient
    .from('tickets')
    .select('status');
  if (error) throw error;
  const total = data.length;
  const pending = data.filter(t => t.status === 'Pending').length;
  const resolved = data.filter(t => t.status === 'Resolved' || t.status === 'Customer Marked as Resolved').length;
  return { total, pending, resolved };
}

// ── Fetch Recent Tickets (last 10) ────────────────────────────
async function fetchRecentTickets() {
  const { data, error } = await supabaseClient
    .from('tickets')
    .select('*, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}
