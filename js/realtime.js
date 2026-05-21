// ============================================================
// realtime.js — Supabase Realtime subscriptions
// ============================================================

let ticketChannel = null;
let replyChannel = null;
let singleTicketChannel = null;

// ── Subscribe to ticket status changes (user dashboard) ───────
function subscribeToMyTickets(userId, onUpdate) {
  ticketChannel = supabaseClient
    .channel('my-tickets')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tickets', filter: `user_id=eq.${userId}` },
      (payload) => onUpdate(payload)
    )
    .subscribe();
}

// ── Subscribe to replies on a specific ticket ─────────────────
function subscribeToReplies(ticketId, onNewReply) {
  replyChannel = supabaseClient
    .channel(`replies-${ticketId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'ticket_replies', filter: `ticket_id=eq.${ticketId}` },
      (payload) => onNewReply(payload.new)
    )
    .subscribe();
}

// ── Subscribe to a single ticket status/updates ────────────────
function subscribeToSingleTicket(ticketId, onUpdate) {
  singleTicketChannel = supabaseClient
    .channel(`ticket-single-${ticketId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `id=eq.${ticketId}` },
      (payload) => onUpdate(payload.new)
    )
    .subscribe();
}

// ── Subscribe to all tickets (admin) ─────────────────────────
function subscribeToAllTickets(onUpdate) {
  ticketChannel = supabaseClient
    .channel('all-tickets')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tickets' },
      (payload) => onUpdate(payload)
    )
    .subscribe();
}

// ── Unsubscribe ───────────────────────────────────────────────
function unsubscribeAll() {
  if (ticketChannel) supabaseClient.removeChannel(ticketChannel);
  if (replyChannel) supabaseClient.removeChannel(replyChannel);
  if (singleTicketChannel) supabaseClient.removeChannel(singleTicketChannel);
}
