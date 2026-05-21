// ============================================================
// notifications.js — Real & Simulated Notifications Engine
// ============================================================

const EDGE_BASE = `${SUPABASE_URL}/functions/v1`;

// ── Real Edge Function Call ───────────────────────────────────
async function callEdgeFunction(fnName, payload) {
  // If running in local demo mode, bypass actual fetch to avoid network errors
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

    if (!res.ok) {
      console.error(`Edge function ${fnName} failed:`, await res.text());
    }
    return res.ok;
  } catch (err) {
    console.error(`Edge function ${fnName} network error:`, err);
    return false;
  }
}

// ── Interactive Simulated Notification Center ──────────────────
function showSimulatedNotification(type, toAddress, subject, messageText) {
  // Sync preferences from local settings if available
  let userId = '';
  for (let key in localStorage) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        userId = parsed?.user?.id || '';
      } catch (e) {}
      break;
    }
  }
  
  if (userId) {
    if (type === 'email' && localStorage.getItem('pref_email_' + userId) === 'false') return;
    if (type === 'sms' && localStorage.getItem('pref_sms_' + userId) === 'false') return;
    if (type === 'whatsapp' && localStorage.getItem('pref_whatsapp_' + userId) === 'false') return;
  }

  // Ensure notification center container exists
  let center = document.getElementById('simulated-notification-center');
  if (!center) {
    center = document.createElement('div');
    center.id = 'simulated-notification-center';
    center.style.cssText = `
      position: fixed;
      top: 1.5rem;
      right: 1.5rem;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      pointer-events: none;
      width: 100%;
      max-width: 360px;
    `;
    document.body.appendChild(center);
  }

  // Create card element
  const card = document.createElement('div');
  card.style.cssText = `
    background: rgba(19, 28, 49, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255,255,255,0.05);
    padding: 1rem;
    color: #f8fafc;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    display: flex;
    gap: 0.75rem;
    pointer-events: auto;
    transform: translateX(120%);
    opacity: 0;
    transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
    position: relative;
    overflow: hidden;
  `;

  // Custom structure based on notification channel
  let icon = '✉️';
  let badgeColor = '#3b82f6';
  let title = 'New Notification';
  let sub = toAddress;

  if (type === 'email') {
    icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-mail" style="color: #60a5fa"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
    badgeColor = '#3b82f6';
    title = 'Mail Portal';
    sub = `To: ${toAddress}`;
  } else if (type === 'sms') {
    icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-message-square" style="color: #eab308"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    badgeColor = '#eab308';
    title = 'SMS Center';
    sub = `To: ${toAddress}`;
  } else if (type === 'whatsapp') {
    icon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-phone-call" style="color: #10b981"><path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`;
    badgeColor = '#10b981';
    title = 'WhatsApp Business';
    sub = `To: ${toAddress}`;
  }

  card.innerHTML = `
    <!-- Top colored accent glow strip -->
    <div style="position: absolute; top:0; left:0; right:0; height: 3px; background: ${badgeColor};"></div>
    <!-- Icon Container -->
    <div style="
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    ">
      ${icon}
    </div>
    <!-- Text Area -->
    <div style="flex: 1; min-width: 0;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.15rem;">
        <span style="font-weight: 600; font-size: 0.85rem; color: #f8fafc">${title}</span>
        <span style="font-size: 0.7rem; color: rgba(255,255,255,0.35); font-weight: 500">just now</span>
      </div>
      <div style="font-size: 0.72rem; color: rgba(255,255,255,0.45); font-weight: 500; margin-bottom: 0.4rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${sub}
      </div>
      ${subject ? `<div style="font-size: 0.78rem; font-weight: 700; color: #e2e8f0; margin-bottom: 0.2rem;">${subject}</div>` : ''}
      <div style="font-size: 0.78rem; color: rgba(255,255,255,0.8); line-height: 1.4; word-break: break-word;">
        ${messageText}
      </div>
    </div>
    <!-- Dismiss Cross -->
    <button style="
      background: none;
      border: none;
      color: rgba(255,255,255,0.3);
      cursor: pointer;
      font-size: 0.9rem;
      padding: 0.2rem;
      align-self: flex-start;
      margin-top: -0.25rem;
      margin-right: -0.25rem;
      transition: color 0.15s;
    " onclick="this.parentElement.remove()" title="Dismiss">✕</button>
  `;

  // Append & trigger animation
  center.appendChild(card);
  setTimeout(() => {
    card.style.transform = 'translateX(0)';
    card.style.opacity = '1';
  }, 50);

  // Play a soft simulated system chime (using Web Audio API to prevent resource loading issues)
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Play dual beep tone
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
    
    // Alert chime chords
    if (type === 'email') {
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } else {
      osc.frequency.setValueAtTime(880.00, audioCtx.currentTime); // A5
      osc.start();
      osc.stop(audioCtx.currentTime + 0.12);
    }
  } catch (err) {
    // Ignore audio failures if browser blocks audio autoplay context
  }

  // Auto-dismiss after 6.5 seconds
  setTimeout(() => {
    if (card && card.parentElement) {
      card.style.transform = 'translateX(120%)';
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 400);
    }
  }, 6500);
}

// ── Notify on Ticket Submission ───────────────────────────────
async function notifyTicketSubmitted({ ticket, userEmail, userPhone, userName }) {
  const formattedNo = formatTicketNumber(ticket.ticket_number, ticket.id);
  const subject = `Ticket ${formattedNo} Received`;
  const message = `Hi ${userName}, your support request "${ticket.subject}" has been received. We'll get back to you shortly. Ticket ID: ${formattedNo}`;

  // Trigger visual dashboard simulators
  showSimulatedNotification('email', userEmail, subject, message);
  setTimeout(() => showSimulatedNotification('sms', userPhone, null, message), 600);
  setTimeout(() => showSimulatedNotification('whatsapp', userPhone, null, message), 1200);

  await Promise.allSettled([
    callEdgeFunction('send-email', { to: userEmail, subject, message }),
    callEdgeFunction('send-sms', { to: userPhone, message }),
    callEdgeFunction('send-whatsapp', { to: userPhone, message })
  ]);
}

// ── Notify on Admin Reply ─────────────────────────────────────
async function notifyAdminReplied({ ticket, userEmail, userName }) {
  const formattedNo = formatTicketNumber(ticket.ticket_number, ticket.id);
  const subject = `New Response on Ticket ${formattedNo}`;
  const message = `Hi ${userName}, an admin has responded to your ticket "${ticket.subject}". Log in to view the response.`;

  // Trigger visual dashboard simulator
  showSimulatedNotification('email', userEmail, subject, message);

  await callEdgeFunction('send-email', { to: userEmail, subject, message });
}

// ── Notify on Ticket Resolved ─────────────────────────────────
async function notifyTicketResolved({ ticket, userEmail, userPhone, userName }) {
  const formattedNo = formatTicketNumber(ticket.ticket_number, ticket.id);
  const subject = `Ticket ${formattedNo} Resolved`;
  const message = `Hi ${userName}, your support ticket "${ticket.subject}" has been resolved. If you need further help, please submit a new request.`;

  // Trigger visual dashboard simulators
  showSimulatedNotification('email', userEmail, subject, message);
  setTimeout(() => showSimulatedNotification('sms', userPhone, null, message), 600);
  setTimeout(() => showSimulatedNotification('whatsapp', userPhone, null, message), 1200);

  await Promise.allSettled([
    callEdgeFunction('send-email', { to: userEmail, subject, message }),
    callEdgeFunction('send-sms', { to: userPhone, message }),
    callEdgeFunction('send-whatsapp', { to: userPhone, message })
  ]);
}
