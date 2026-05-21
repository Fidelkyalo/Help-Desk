// ============================================================
// auth.js — Registration, Login, Logout, Session & Role Guard
// ============================================================

// Helper to handle relative routing safely in subdirectories
function getRelativePath(target) {
  const isInsideAdmin = window.location.pathname.includes('/admin/');
  if (target === 'index.html') return isInsideAdmin ? '../index.html' : 'index.html';
  if (target === 'dashboard.html') return isInsideAdmin ? '../dashboard.html' : 'dashboard.html';
  if (target === 'admin/dashboard.html') return isInsideAdmin ? 'dashboard.html' : 'admin/dashboard.html';
  return target;
}

// ── Route Guard ──────────────────────────────────────────────
async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = getRelativePath('index.html');
    return null;
  }
  return session;
}

// ── Role Guard ───────────────────────────────────────────────
async function getUserRole(userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error) return 'user';
  return data.role;
}

// ── Redirect by Role (with suspension check) ─────────────────
async function redirectByRole(session) {
  const profile = await getCurrentProfile();

  // If user account is suspended, block immediately at login
  if (profile && profile.role !== 'admin' && profile.suspended) {
    const now   = new Date();
    const until = profile.suspension_until ? new Date(profile.suspension_until) : null;

    if (!until || until > now) {
      // Active suspension — show overlay right on the login page, sign out session
      await supabaseClient.auth.signOut();
      showSuspensionOverlay(profile);
      return;
    } else {
      // Suspension expired — auto-lift silently then proceed
      await supabaseClient.from('profiles').update({
        suspended: false,
        suspension_reason: null,
        suspension_until: null
      }).eq('id', profile.id);
    }
  }

  const role = profile ? profile.role : await getUserRole(session.user.id);
  if (role === 'admin') {
    window.location.href = getRelativePath('admin/dashboard.html');
  } else {
    window.location.href = getRelativePath('dashboard.html');
  }
}

// ── Register ─────────────────────────────────────────────────
async function register(fullName, email, phone, password, pfNumber = '') {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone, pf_number: pfNumber || null }
    }
  });
  if (error) throw error;
  return data;
}

// ── Login ────────────────────────────────────────────────────
async function login(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;

  // After credentials are verified, check suspension status before allowing access
  if (data && data.session) {
    const profile = await getCurrentProfile();
    if (profile && profile.role !== 'admin' && profile.suspended) {
      const now   = new Date();
      const until = profile.suspension_until ? new Date(profile.suspension_until) : null;
      if (!until || until > now) {
        // Active suspension — kill the session immediately and block access
        await supabaseClient.auth.signOut();
        const suspendedError = new Error('ACCOUNT_SUSPENDED');
        suspendedError.isSuspension = true;
        suspendedError.profile = profile;
        throw suspendedError;
      } else {
        // Suspension expired — auto-lift silently and allow login
        await supabaseClient.from('profiles').update({
          suspended: false,
          suspension_reason: null,
          suspension_until: null
        }).eq('id', profile.id);
      }
    }
  }

  return data;
}

// ── Logout ───────────────────────────────────────────────────
async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = getRelativePath('index.html');
}

// ── Get Current User Profile ─────────────────────────────────
async function getCurrentProfile() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return null;

  let { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error) {
    if (!window.isDemoMode) {
      console.log('Profile row missing in database. Initializing self-healing recovery...');
      try {
        const userMeta = session.user.user_metadata || {};
        const isOfficialAdmin = session.user.email === 'fidelkm16@gmail.com' ||
                                session.user.email === 'admin@helpdesk.com' ||
                                session.user.email.includes('admin');
        const newProfile = {
          id: session.user.id,
          email: session.user.email,
          full_name: userMeta.full_name || 'User',
          phone: userMeta.phone || '',
          role: isOfficialAdmin ? 'admin' : 'user'
        };
        const { data: healedData, error: healError } = await supabaseClient
          .from('profiles')
          .insert([newProfile])
          .select()
          .single();
        if (!healError) {
          console.log('Profile successfully self-healed on the fly!');
          return healedData;
        }
      } catch (err) {
        console.error('Self-healing error:', err);
      }
    }
    return null;
  }
  return data;
}

// ── Role Guard (full profile lookup) ─────────────────────────
async function getUserRole(userId) {
  const profile = await getCurrentProfile();
  if (profile && profile.id === userId) return profile.role;
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (error) return 'user';
  return data.role;
}

// ── Require Admin ─────────────────────────────────────────────
async function requireAdmin() {
  const session = await requireAuth();
  if (!session) return null;
  const role = await getUserRole(session.user.id);
  if (role !== 'admin') {
    window.location.href = getRelativePath('dashboard.html');
    return null;
  }
  return session;
}

// ── Show Account Suspension Overlay ───────────────────────────
function showSuspensionOverlay(profile) {
  const until = profile.suspension_until ? new Date(profile.suspension_until) : null;
  const untilStr = until
    ? until.toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : 'further notice';

  const safeReason = (profile.suspension_reason || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Remove any existing overlay first
  const existing = document.getElementById('suspensionOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'suspensionOverlay';
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:99999;',
    'background:rgba(0,0,0,0);',
    'display:flex;align-items:center;justify-content:center;',
    'font-family:Inter,sans-serif;padding:2rem;',
    'transition:background 0.4s ease;',
    'backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);',
    'transition:background 0.5s ease, backdrop-filter 0.5s ease;'
  ].join('');

  overlay.innerHTML = `
    <div id="suspensionCard" style="
      text-align:center;max-width:500px;width:100%;
      background:linear-gradient(145deg,#0f0a1e 0%,#1a0a2e 50%,#0a0e1b 100%);
      border:1px solid rgba(239,68,68,0.3);
      border-radius:24px;
      padding:3rem 2.5rem;
      box-shadow:0 0 0 1px rgba(239,68,68,0.1), 0 40px 80px rgba(0,0,0,0.6), 0 0 60px rgba(239,68,68,0.08);
      transform:scale(0.85) translateY(30px);
      opacity:0;
      transition:transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease;
      position:relative;overflow:hidden;
    ">
      <!-- Animated top glow bar -->
      <div style="position:absolute;top:0;left:0;right:0;height:3px;
        background:linear-gradient(90deg,transparent,#ef4444,#f87171,#ef4444,transparent);
        animation:shimmer 2.5s infinite;"></div>

      <!-- Icon -->
      <div style="
        width:88px;height:88px;border-radius:50%;
        background:radial-gradient(circle,rgba(239,68,68,0.2) 0%,rgba(239,68,68,0.05) 70%);
        border:2px solid rgba(239,68,68,0.45);
        display:flex;align-items:center;justify-content:center;
        font-size:2.8rem;margin:0 auto 1.75rem;
        box-shadow:0 0 30px rgba(239,68,68,0.2);
        animation:pulse-ring 2s infinite;
      ">🚫</div>

      <!-- Title -->
      <h1 style="color:#fff;font-size:1.85rem;font-weight:800;margin-bottom:0.5rem;
        letter-spacing:-0.02em;font-family:inherit;">
        Account Suspended
      </h1>
      <p style="color:rgba(255,255,255,0.45);font-size:0.85rem;margin-bottom:1.75rem;
        text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">
        Access Restricted
      </p>

      <!-- Until date -->
      <div style="
        background:rgba(239,68,68,0.08);
        border:1px solid rgba(239,68,68,0.2);
        border-radius:14px;padding:1.25rem 1.5rem;
        margin-bottom:${safeReason ? '1rem' : '2rem'};
      ">
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.35);text-transform:uppercase;
          letter-spacing:0.1em;font-weight:700;margin-bottom:0.5rem;">Suspended Until</div>
        <div style="color:#f87171;font-size:1.15rem;font-weight:700;">${untilStr}</div>
      </div>

      ${safeReason ? `
      <!-- Reason -->
      <div style="
        background:rgba(255,255,255,0.03);
        border:1px solid rgba(255,255,255,0.07);
        border-radius:14px;padding:1.25rem 1.5rem;
        margin-bottom:2rem;text-align:left;
      ">
        <div style="font-size:0.72rem;color:rgba(255,255,255,0.35);text-transform:uppercase;
          letter-spacing:0.1em;font-weight:700;margin-bottom:0.5rem;">Reason</div>
        <div style="color:rgba(255,255,255,0.75);font-size:0.9rem;line-height:1.6;">${safeReason}</div>
      </div>` : ''}

      <p style="color:rgba(255,255,255,0.3);font-size:0.8rem;margin-bottom:1.75rem;line-height:1.6;">
        If you believe this is an error, please contact your system administrator.
      </p>

      <button onclick="logout()" style="
        background:rgba(239,68,68,0.12);color:#f87171;
        border:1px solid rgba(239,68,68,0.3);border-radius:12px;
        padding:0.875rem 2.5rem;font-size:0.9rem;font-weight:700;
        cursor:pointer;font-family:inherit;letter-spacing:0.02em;
        transition:all 0.2s;width:100%;
      "
      onmouseover="this.style.background='rgba(239,68,68,0.22)'"
      onmouseout="this.style.background='rgba(239,68,68,0.12)'">
        Sign Out
      </button>
    </div>

    <style>
      @keyframes shimmer {
        0%   { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      @keyframes pulse-ring {
        0%,100% { box-shadow: 0 0 30px rgba(239,68,68,0.2); }
        50%      { box-shadow: 0 0 50px rgba(239,68,68,0.4), 0 0 80px rgba(239,68,68,0.1); }
      }
    </style>
  `;

  document.body.insertBefore(overlay, document.body.firstChild);

  // Animate in after a short delay
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.style.background = 'rgba(0,0,0,0.75)';
      overlay.style.backdropFilter = 'blur(12px)';
      overlay.style.webkitBackdropFilter = 'blur(12px)';
      const card = document.getElementById('suspensionCard');
      if (card) {
        card.style.transform = 'scale(1) translateY(0)';
        card.style.opacity   = '1';
      }
    });
  });
}

// ── Require Customer ──────────────────────────────────────────
async function requireCustomer() {
  const session = await requireAuth();
  if (!session) return null;

  const profile = await getCurrentProfile();

  // Redirect admins to the admin portal
  if (profile && profile.role === 'admin') {
    window.location.href = getRelativePath('admin/dashboard.html');
    return null;
  }

  // Check if account is currently suspended
  if (profile && profile.suspended) {
    const now   = new Date();
    const until = profile.suspension_until ? new Date(profile.suspension_until) : null;
    if (!until || until > now) {
      // Active suspension — sign out and show overlay
      await supabaseClient.auth.signOut();
      showSuspensionOverlay(profile);
      return null;
    } else {
      // Suspension expired — auto-lift silently
      await supabaseClient.from('profiles').update({
        suspended: false,
        suspension_reason: null,
        suspension_until: null
      }).eq('id', profile.id);
    }
  }

  return session;
}

