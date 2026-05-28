// ============================================================
// notifications.js — In-App Notification Engine
// ============================================================

const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

// ── Resolve current user ID from session ─────────────────────
function _getSessionUserId() {
  for (let key in localStorage) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        const id = parsed?.user?.id || '';
        if (id) return id;
      } catch (e) {}
    }
  }
  try {
    const sess = JSON.parse(localStorage.getItem('db_active_session') || 'null');
    return sess?.user?.id || '';
  } catch (e) { return ''; }
}

// ── Persist notification to localStorage log ─────────────────
function persistNotification({ type, subject, message }) {
  const userId = _getSessionUserId();
  if (!userId) return;

  const key   = 'notifs_' + userId;
  const items = JSON.parse(localStorage.getItem(key) || '[]');
  items.push({ type, subject, message, ts: new Date().toISOString(), read: false });
  if (items.length > 100) items.splice(0, items.length - 100);
  localStorage.setItem(key, JSON.stringify(items));
}

// ── Count unread notifications ────────────────────────────────
function getUnreadCount(userId) {
  const items = JSON.parse(localStorage.getItem('notifs_' + userId) || '[]');
  return items.filter(n => !n.read).length;
}

// ── Mark a single notification as read (by index) ────────────
function markNotificationRead(userId, index) {
  const key   = 'notifs_' + userId;
  const items = JSON.parse(localStorage.getItem(key) || '[]');
  // Items are displayed newest-first, so reverse the index
  const realIndex = items.length - 1 - index;
  if (items[realIndex]) {
    items[realIndex].read = true;
    localStorage.setItem(key, JSON.stringify(items));
  }
}

// ── Mark all notifications as read ───────────────────────────
function markAllNotificationsRead(userId) {
  const key   = 'notifs_' + userId;
  const items = JSON.parse(localStorage.getItem(key) || '[]');
  items.forEach(n => { n.read = true; });
  localStorage.setItem(key, JSON.stringify(items));
}

// ── Real Edge Function Call ───────────────────────────────────
async function callEdgeFunction(fnName, payload) {
  if (window.isDemoMode) {
    console.log(`[Simulated] Notification function "${fnName}" called with payload:`, payload);
    return true;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  const token = session?.access_token;

  try {
    const res = await fetch(`${EDGE_BASE}/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) console.error(`Edge function ${fnName} failed:`, await res.text());
    return res.ok;
  } catch (err) {
    console.error(`Edge function ${fnName} network error:`, err);
    return false;
  }
}

// ── In-App Pop-up Notification ────────────────────────────────

// Pre-unlock audio context on first user interaction (required on iOS/Android)
let _audioCtx = null;
function _getAudioCtx() {
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (_) {}
  }
  return _audioCtx;
}
// Unlock on first touch or click so mobile browsers allow audio playback
['touchstart', 'touchend', 'mousedown', 'keydown'].forEach(evt => {
  document.addEventListener(evt, function unlock() {
    const ctx = _getAudioCtx();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    document.removeEventListener(evt, unlock);
  }, { once: true, passive: true });
});

function _playChime(type) {
  try {
    const ctx = _getAudioCtx();
    if (!ctx) return;
    // Resume if suspended (mobile browsers suspend until user gesture)
    const play = () => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';

      if (type === 'resolved') {
        // Two-tone ascending chime for resolved
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.5);
      } else {
        // Single soft ding for other types
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.35);
      }
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch (_) {}
}

function showAppNotification(type, subject, messageText) {
  const iconMap  = { submitted: '🎫', reply: '💬', status: 'ℹ️', resolved: '✅' };
  const colorMap = { submitted: '#3b82f6', reply: '#4f46e5', status: '#f59e0b', resolved: '#10b981' };

  const icon  = iconMap[type]  || '🔔';
  const color = colorMap[type] || '#6366f1';

  // Container — top-right, stacks downward
  let center = document.getElementById('app-notif-center');
  if (!center) {
    center = document.createElement('div');
    center.id = 'app-notif-center';
    center.style.cssText = `
      position: fixed;
      top: 1.25rem;
      right: 1.25rem;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 0.625rem;
      pointer-events: none;
      width: calc(100vw - 2.5rem);
      max-width: 360px;
    `;
    document.body.appendChild(center);
  }

  const card = document.createElement('div');
  card.style.cssText = `
    background: var(--surface, #1e2535);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-left: 4px solid ${color};
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    padding: 0.875rem 1rem;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    pointer-events: auto;
    transform: translateX(110%);
    opacity: 0;
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease;
    font-family: 'Inter', system-ui, sans-serif;
  `;

  card.innerHTML = `
    <div style="font-size:1.25rem;flex-shrink:0;margin-top:0.1rem;line-height:1;">${icon}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:0.82rem;font-weight:700;color:var(--text,#f1f5f9);margin-bottom:0.2rem;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${subject || 'Notification'}
      </div>
      <div style="font-size:0.78rem;color:var(--text-muted,#94a3b8);line-height:1.45;">
        ${messageText}
      </div>
    </div>
    <button onclick="this.closest('div[style]').style.opacity='0';setTimeout(()=>this.closest('div[style]').remove(),350)" style="
      background:none;border:none;color:var(--text-light,#64748b);
      cursor:pointer;font-size:0.85rem;padding:0;flex-shrink:0;
      margin-top:-0.1rem;line-height:1;transition:color 0.15s;
    " title="Dismiss">✕</button>
  `;

  center.appendChild(card);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      card.style.transform = 'translateX(0)';
      card.style.opacity   = '1';
    });
  });

  // Play chime (works on mobile after first user interaction)
  _playChime(type);

  // Auto-dismiss after 5 s
  setTimeout(() => {
    card.style.transform = 'translateX(110%)';
    card.style.opacity   = '0';
    setTimeout(() => card.remove(), 350);
  }, 5000);
}

// ── Notify on Ticket Submission ───────────────────────────────
async function notifyTicketSubmitted({ ticket, userEmail, userPhone, userName }) {
  const formattedNo = formatTicketNumber(ticket.ticket_number, ticket.id);
  const subject = `Ticket ${formattedNo} Received`;
  const message = `Hi ${userName}, your support request "${ticket.subject}" has been received. We'll get back to you shortly.`;

  persistNotification({ type: 'submitted', subject, message });
  showAppNotification('submitted', subject, message);

  await Promise.allSettled([
    callEdgeFunction('send-email', { to: userEmail, subject, message }),
    callEdgeFunction('send-sms',   { to: userPhone, message }),
    callEdgeFunction('send-whatsapp', { to: userPhone, message })
  ]);
}

// ── Notify on Admin Reply — includes the actual reply text ────
async function notifyAdminReplied({ ticket, replyMessage, userEmail, userPhone, userName, adminEmail }) {
  const formattedNo = formatTicketNumber(ticket.ticket_number, ticket.id);
  const subject = `New Response on Ticket ${formattedNo}`;

  // Show the actual reply content so the customer sees the full message
  const adminText = replyMessage || '';
  const message = adminText
    ? `Admin replied to "${ticket.subject}":\n\n${adminText}`
    : `Hi ${userName || 'Member'}, an admin has responded to your ticket "${ticket.subject}".`;

  persistNotification({ type: 'reply', subject, message });
  showAppNotification('reply', subject, adminText || message);

  await Promise.allSettled([
    callEdgeFunction('send-email', { to: userEmail, subject, message, replyTo: adminEmail || null }),
    callEdgeFunction('send-sms',   { to: userPhone, message }),
    callEdgeFunction('send-whatsapp', { to: userPhone, message })
  ]);
}

// ── Notify on Status Change (non-resolved) ────────────────────
async function notifyTicketStatusChanged({ ticket, userEmail, userPhone, userName }) {
  const formattedNo = formatTicketNumber(ticket.ticket_number, ticket.id);
  const subject = `Ticket ${formattedNo} Status Updated`;
  const message = `Hi ${userName || 'Member'}, your ticket "${ticket.subject}" status changed to: ${ticket.status}.`;

  persistNotification({ type: 'status', subject, message });
  showAppNotification('status', subject, message);

  await Promise.allSettled([
    callEdgeFunction('send-email', { to: userEmail, subject, message }),
    callEdgeFunction('send-sms',   { to: userPhone, message }),
    callEdgeFunction('send-whatsapp', { to: userPhone, message })
  ]);
}

// ── Notify on Ticket Resolved ─────────────────────────────────
async function notifyTicketResolved({ ticket, userEmail, userPhone, userName }) {
  const formattedNo = formatTicketNumber(ticket.ticket_number, ticket.id);
  const subject = `Ticket ${formattedNo} Resolved ✅`;
  const message = `Hi ${userName || 'Member'}, your support ticket "${ticket.subject}" has been resolved. Need more help? Submit a new request.`;

  persistNotification({ type: 'resolved', subject, message });
  showAppNotification('resolved', subject, message);

  await Promise.allSettled([
    callEdgeFunction('send-email', { to: userEmail, subject, message }),
    callEdgeFunction('send-sms',   { to: userPhone, message }),
    callEdgeFunction('send-whatsapp', { to: userPhone, message })
  ]);
}
