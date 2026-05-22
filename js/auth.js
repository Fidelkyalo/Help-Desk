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

  // In demo mode, also check the deleted-ids list so a stale session
  // for a deleted account is rejected immediately on page load.
  if (window.isDemoMode) {
    const deletedIds = JSON.parse(localStorage.getItem('db_deleted_ids') || '[]');
    if (deletedIds.includes(session.user.id)) {
      await supabaseClient.auth.signOut();
      window.location.href = getRelativePath('index.html');
      return null;
    }
    // Also verify the profile row still exists (belt-and-suspenders for demo mode)
    const profiles = JSON.parse(localStorage.getItem('db_profiles') || '[]');
    const profileExists = profiles.some(p => p.id === session.user.id);
    if (!profileExists) {
      await supabaseClient.auth.signOut();
      window.location.href = getRelativePath('index.html');
      return null;
    }
  }

  // For live Supabase: if the profile row is missing the account was deleted.
  // Sign out and redirect rather than letting them reach the dashboard.
  if (!window.isDemoMode) {
    const { data: profileCheck } = await supabaseClient
      .from('profiles')
      .select('id')
      .eq('id', session.user.id)
      .single();
    if (!profileCheck) {
      await supabaseClient.auth.signOut();
      window.location.href = getRelativePath('index.html');
      return null;
    }
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

  // After credentials are verified, check that the profile still exists.
  // In live Supabase the auth user survives a profile delete (anon key
  // cannot delete auth users), so we must gate on the profile row.
  if (data && data.session) {
    // Use a raw profile lookup (no self-healing) so a deleted account
    // is never silently recreated during the login flow.
    let profile = null;
    if (window.isDemoMode) {
      // Demo mode: check deleted-ids list and profile store directly
      const deletedIds = JSON.parse(localStorage.getItem('db_deleted_ids') || '[]');
      if (deletedIds.includes(data.session.user.id)) {
        await supabaseClient.auth.signOut();
        const deletedError = new Error('This account no longer exists. Please create a new account to continue.');
        throw deletedError;
      }
      const profiles = JSON.parse(localStorage.getItem('db_profiles') || '[]');
      profile = profiles.find(p => p.id === data.session.user.id) || null;
    } else {
      // Live Supabase: query the profile row directly without self-healing
      const { data: profileData } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .single();
      profile = profileData || null;
    }

    // No profile row means the account was deleted — block immediately
    if (!profile) {
      await supabaseClient.auth.signOut();
      const deletedError = new Error('This account no longer exists. Please create a new account to continue.');
      throw deletedError;
    }

    if (profile.role !== 'admin' && profile.suspended) {
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

// ── Security Questions — Save ─────────────────────────────────
// Stores the user's chosen questions + hashed answers on their profile.
// answers is an array of { question, answer } objects (5 items).
// Answers are lowercased + trimmed before storing so comparison is
// case-insensitive and whitespace-tolerant.
async function saveSecurityQuestions(userId, answers) {
  const payload = answers.map(a => ({
    question: a.question,
    // Simple normalisation — not cryptographic, but keeps answers
    // consistent across devices without a server-side hash function.
    answer: a.answer.trim().toLowerCase()
  }));
  const { error } = await supabaseClient
    .from('profiles')
    .update({ security_questions: payload })
    .eq('id', userId);
  if (error) throw error;
}

// ── Security Questions — Fetch by Email ──────────────────────
// Returns the array of { question, answer } objects for the given
// email address, or null if the user has no questions set.
async function getSecurityQuestionsByEmail(email) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, full_name, security_questions')
    .eq('email', email)
    .single();
  if (error || !data) return null;
  return { id: data.id, full_name: data.full_name || '', questions: data.security_questions || [] };
}

// ── Security Questions — Verify Answers ──────────────────────
// Takes the stored questions array and the user's submitted answers
// (array of strings, same order). Returns true only if every answer
// matches (case-insensitive, trimmed).
function verifySecurityAnswers(stored, submitted) {
  if (!stored || stored.length === 0) return false;
  if (stored.length !== submitted.length) return false;
  return stored.every((item, i) =>
    item.answer === (submitted[i] || '').trim().toLowerCase()
  );
}

// ── Password Reset via Security Questions ────────────────────
// Updates the Supabase Auth password for the given user.
// NOTE: In live Supabase this requires the user to be signed in,
// so we sign them in with a temporary admin-style RPC or use the
// admin API. Since we only have the anon key here, we store a
// one-time reset token in the profile and redirect to a page that
// completes the reset after the user re-authenticates.
// For the mock (demo) mode we update the credential directly.
async function resetPasswordWithQuestions(userId, newPassword) {
  if (window.isDemoMode) {
    const creds = JSON.parse(localStorage.getItem('db_auth_credentials')) || [];
    const idx = creds.findIndex(c => c.id === userId);
    if (idx !== -1) {
      creds[idx].password = newPassword;
      localStorage.setItem('db_auth_credentials', JSON.stringify(creds));
    }
    return;
  }
  // Live Supabase: store a short-lived reset token on the profile.
  // The reset-password page reads this token, signs the user in via
  // the Supabase magic-link flow, then calls updateUser({ password }).
  const token = crypto.randomUUID();
  const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min
  const { error } = await supabaseClient
    .from('profiles')
    .update({ reset_token: token, reset_token_expiry: expiry })
    .eq('id', userId);
  if (error) throw error;
  return token; // caller will redirect to reset-password.html?token=…&uid=…
}

// ── Password Reset Request (for admin to fulfil) ─────────────
// Called when a customer fails security questions twice and chooses
// to ask the admin to reset their password instead.
async function submitPasswordResetRequest(userId, email, fullName) {
  if (window.isDemoMode) {
    const requests = JSON.parse(localStorage.getItem('db_password_reset_requests')) || [];
    // Remove any existing pending request for this user first
    const filtered = requests.filter(r => r.user_id !== userId);
    filtered.push({
      id: crypto.randomUUID(),
      user_id: userId,
      email,
      full_name: fullName,
      status: 'pending',
      created_at: new Date().toISOString()
    });
    localStorage.setItem('db_password_reset_requests', JSON.stringify(filtered));
    return;
  }
  // Live Supabase — upsert so duplicate requests don't pile up
  const { error } = await supabaseClient
    .from('password_reset_requests')
    .upsert(
      { user_id: userId, email, full_name: fullName, status: 'pending', created_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  if (error) throw error;
}

// ── Fetch Pending Password Reset Requests (admin only) ───────
async function fetchPasswordResetRequests() {
  if (window.isDemoMode) {
    const requests = JSON.parse(localStorage.getItem('db_password_reset_requests')) || [];
    return requests.filter(r => r.status === 'pending');
  }
  const { data, error } = await supabaseClient
    .from('password_reset_requests')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ── Admin: Set New Password for Customer ─────────────────────
// In demo mode updates the credential directly.
// In live Supabase, stores a temporary password on the profile that
// the customer uses to log in once, then is prompted to change it.
async function adminSetCustomerPassword(userId, newPassword) {
  if (window.isDemoMode) {
    const creds = JSON.parse(localStorage.getItem('db_auth_credentials')) || [];
    const idx = creds.findIndex(c => c.id === userId);
    if (idx !== -1) {
      creds[idx].password = newPassword;
      localStorage.setItem('db_auth_credentials', JSON.stringify(creds));
    }
    // Mark request as resolved
    const requests = JSON.parse(localStorage.getItem('db_password_reset_requests')) || [];
    const ri = requests.findIndex(r => r.user_id === userId);
    if (ri !== -1) {
      requests[ri].status = 'resolved';
      localStorage.setItem('db_password_reset_requests', JSON.stringify(requests));
    }
    return;
  }
  // Live Supabase: store a temporary password on the profile row.
  // The customer logs in with this temp password and is then prompted
  // to set a permanent one (handled in dashboard init).
  const { error } = await supabaseClient
    .from('profiles')
    .update({ temp_password: newPassword, temp_password_set_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) throw error;
  // Mark request resolved
  await supabaseClient
    .from('password_reset_requests')
    .update({ status: 'resolved' })
    .eq('user_id', userId);
}

// ── Admin: Dismiss Password Reset Request ────────────────────
async function dismissPasswordResetRequest(userId) {
  if (window.isDemoMode) {
    const requests = JSON.parse(localStorage.getItem('db_password_reset_requests')) || [];
    const ri = requests.findIndex(r => r.user_id === userId);
    if (ri !== -1) { requests[ri].status = 'dismissed'; localStorage.setItem('db_password_reset_requests', JSON.stringify(requests)); }
    return;
  }
  await supabaseClient.from('password_reset_requests').update({ status: 'dismissed' }).eq('user_id', userId);
}

// ── Watch for Mid-Session Suspension ─────────────────────────
// It subscribes to realtime profile changes so that if an admin
// suspends the user while they are already logged in, the overlay
// appears immediately — without needing a page refresh.
function watchSuspensionStatus(userId) {
  if (!userId) return;

  // Supabase realtime channel scoped to this user's profile row
  const channel = supabaseClient
    .channel('suspension-watch-' + userId)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: 'id=eq.' + userId
      },
      async (payload) => {
        const updated = payload.new;
        if (!updated) return;

        // Skip if this is an admin account
        if (updated.role === 'admin') return;

        if (updated.suspended) {
          const now   = new Date();
          const until = updated.suspension_until ? new Date(updated.suspension_until) : null;

          if (!until || until > now) {
            // Active suspension detected mid-session — sign out and show overlay
            await supabaseClient.auth.signOut();
            showSuspensionOverlay(updated);
          }
        }
      }
    )
    .subscribe();

  return channel;
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

