// ============================================================
// utils.js — Shared helper functions
// ============================================================

// ── Format date to readable string ───────────────────────────
function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ── Status badge HTML ─────────────────────────────────────────
function statusBadge(status) {
  const map = {
    'Pending':  'badge badge--pending',
    'Resolved': 'badge badge--resolved',
    'Customer Marked as Resolved': 'badge badge--resolved'
  };
  const cls = map[status] || 'badge';
  return `<span class="${cls}">${status}</span>`;
}

// ── Priority badge HTML ───────────────────────────────────────
function priorityBadge(priority) {
  const map = {
    'Low':    'badge badge--low',
    'Medium': 'badge badge--medium',
    'High':   'badge badge--high'
  };
  const cls = map[priority] || 'badge';
  return `<span class="${cls}">${priority}</span>`;
}

// ── Show toast notification ───────────────────────────────────
function showToast(message, type = 'success') {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('toast--visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Show inline form error ────────────────────────────────────
function showError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) { el.textContent = message; el.style.display = 'block'; }
}

// ── Clear inline form error ───────────────────────────────────
function clearError(elementId) {
  const el = document.getElementById(elementId);
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

// ── Escape HTML to prevent XSS ───────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Get URL query param ───────────────────────────────────────
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ── Universal Navigation Helper ────────────────────────────────
function navigateTo(target, ticketId) {
  let url = target;
  // Always strip .html when served over HTTP/HTTPS (Vercel, any web server)
  if (window.location.protocol !== 'file:') {
    url = url.replace('.html', '');
  }
  if (ticketId) {
    url += '?id=' + ticketId;
  }
  window.location.href = url;
}

// ── Build a page href (strips .html on web, keeps it on file://) ──
function pageHref(target, ticketId) {
  let url = target;
  if (window.location.protocol !== 'file:') {
    url = url.replace('.html', '');
  }
  if (ticketId) url += '?id=' + ticketId;
  return url;
}

// ── Truncate long text ────────────────────────────────────────
function truncate(str, maxLen = 60) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

// ── Format ticket number to HELP-0001 style ─────────────────
function formatTicketNumber(num, fallbackId) {
  if (!num) {
    const slice = (fallbackId || '').slice(0, 6).toUpperCase();
    return `HELP-${slice}`;
  }
  const n = parseInt(num, 10);
  if (isNaN(n)) return `HELP-${String(num).toUpperCase()}`;
  
  let relativeNum = n;
  if (n >= 1000) {
    relativeNum = n - 1000;
  }
  const padded = String(relativeNum).padStart(4, '0');
  return `HELP-${padded}`;
}
