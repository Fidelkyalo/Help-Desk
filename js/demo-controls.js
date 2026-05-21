// ============================================================
// demo-controls.js — Floating System Controls & Role Switcher
// ============================================================

(function () {
  // Only inject if in demo/local mode
  if (window.isDemoMode === false) {
    console.log("[Help Desk]: Connected to live Supabase project. Sandbox console disabled for security.");
    return;
  }
  
  // Inject style block dynamically
  const styles = `
    #demo-controls-trigger {
      position: fixed;
      bottom: 1.5rem;
      left: 1.5rem;
      z-index: 9999;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      box-shadow: 0 4px 20px rgba(99, 102, 241, 0.4), inset 0 1px 0 rgba(255,255,255,0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s;
      font-size: 1.3rem;
      pointer-events: auto;
    }
    #demo-controls-trigger:hover {
      transform: scale(1.1) rotate(45deg);
      box-shadow: 0 6px 24px rgba(99, 102, 241, 0.5);
    }
    #demo-panel {
      position: fixed;
      bottom: 5.5rem;
      left: 1.5rem;
      z-index: 9998;
      width: 320px;
      background: rgba(10, 15, 30, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05);
      padding: 1.25rem;
      color: #f1f5f9;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      display: none;
      flex-direction: column;
      gap: 1rem;
      transform: translateY(20px) scale(0.95);
      opacity: 0;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
    }
    #demo-panel.active {
      display: flex;
      transform: translateY(0) scale(1);
      opacity: 1;
    }
    .demo-title {
      font-size: 0.95rem;
      font-weight: 700;
      color: #f8fafc;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 0.5rem;
      margin-bottom: 0.25rem;
      font-family: 'Outfit', sans-serif;
    }
    .demo-section-title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 0.5rem;
    }
    .demo-btn {
      width: 100%;
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(255, 255, 255, 0.04);
      color: #e2e8f0;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      text-align: left;
    }
    .demo-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      border-color: rgba(255,255,255,0.15);
    }
    .demo-btn--active {
      background: rgba(99, 102, 241, 0.15);
      border-color: rgba(99, 102, 241, 0.3);
      color: #818cf8;
    }
    .demo-btn--danger {
      color: #fda4af;
    }
    .demo-btn--danger:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.2);
      color: #f43f5e;
    }
    .demo-input {
      width: 100%;
      padding: 0.45rem 0.6rem;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.2);
      color: #fff;
      font-size: 0.75rem;
      outline: none;
      transition: border-color 0.15s;
    }
    .demo-input:focus {
      border-color: #6366f1;
    }
    .demo-badge {
      font-size: 0.65rem;
      padding: 0.1rem 0.35rem;
      border-radius: 99px;
      background: rgba(99, 102, 241, 0.2);
      color: #818cf8;
      font-weight: 600;
    }
  `;

  // Inject CSS
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);

  // Inject UI elements
  const trigger = document.createElement('div');
  trigger.id = 'demo-controls-trigger';
  trigger.textContent = '🛠️';
  trigger.title = 'System Sandbox Console';
  document.body.appendChild(trigger);

  const panel = document.createElement('div');
  panel.id = 'demo-panel';
  document.body.appendChild(panel);

  // Check state
  let currentRole = 'Visitor';
  let activeUserEmail = '';
  let connectionStatus = 'checking';
  let connectionError = '';

  async function checkLiveConnection() {
    if (window.isDemoMode) {
      connectionStatus = 'simulated';
      updateStatusBadge();
      return;
    }
    
    connectionStatus = 'checking';
    updateStatusBadge();
    
    try {
      if (!window.supabaseClient) {
        connectionStatus = 'error';
        connectionError = 'Client not loaded';
        updateStatusBadge();
        return;
      }
      
      const { data, error } = await window.supabaseClient.from('profiles').select('id').limit(1);
      if (error) {
        if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
          connectionStatus = 'no_schema';
        } else {
          connectionStatus = 'error';
          connectionError = error.message;
        }
      } else {
        connectionStatus = 'connected';
      }
    } catch (e) {
      connectionStatus = 'error';
      connectionError = e.message || 'Network error';
    }
    updateStatusBadge();
  }

  function renderStatusBadge() {
    switch (connectionStatus) {
      case 'simulated':
        return '<span style="color: #fbbf24; font-weight: 500; display: flex; align-items: center; gap: 0.35rem;"><span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#f59e0b; box-shadow: 0 0 6px #f59e0b;"></span> Sandbox (Offline)</span>';
      case 'checking':
        return '<span style="color: #94a3b8; display: flex; align-items: center; gap: 0.35rem;"><span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#94a3b8; animation: pulse 1s infinite alternate;"></span> Testing...</span>';
      case 'connected':
        return '<span style="color: #34d399; font-weight: 600; display: flex; align-items: center; gap: 0.35rem;"><span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#10b981; box-shadow: 0 0 6px #10b981;"></span> Connected</span>';
      case 'no_schema':
        return '<span style="color: #f43f5e; font-weight: 600; display: flex; align-items: center; gap: 0.35rem;" title="Connected to Supabase project, but public.profiles table does not exist. Run the SQL schema first!"><span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#f43f5e; box-shadow: 0 0 6px #f43f5e;"></span> No Schema</span>';
      case 'error':
        return `<span style="color: #f43f5e; font-weight: 600; display: flex; align-items: center; gap: 0.35rem;" title="${connectionError}"><span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#ef4444;"></span> Conn Error</span>`;
    }
  }

  function updateStatusBadge() {
    const el = document.getElementById('supabase-connection-status');
    if (el) el.innerHTML = renderStatusBadge();
  }
  
  async function refreshState() {
    if (window.supabaseClient) {
      const { data: { session } } = await window.supabaseClient.auth.getSession();
      if (session) {
        activeUserEmail = session.user.email;
        currentRole = session.user.role === 'admin' ? 'Admin' : 'Member';
      } else {
        currentRole = 'Visitor';
        activeUserEmail = '';
      }
    }
    renderPanelContent();
    checkLiveConnection();
  }

  function renderPanelContent() {
    const isMock = window.isDemoMode;
    const modeBadge = isMock ? '<span class="demo-badge">SANDBOX SIMULATOR</span>' : '<span class="demo-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399">LIVE DB</span>';
    const isInsideAdmin = window.location.pathname.includes('/admin/');
    const guidePath = isInsideAdmin ? '../supabase-guide.html' : 'supabase-guide.html';
    
    panel.innerHTML = `
      <div class="demo-title">
        <span>🛠️ Sandbox Console</span>
        ${modeBadge}
      </div>

      <!-- Section: User Switcher -->
      <div>
        <div class="demo-section-title">Quick Sandbox Role Switcher</div>
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          <button class="demo-btn ${activeUserEmail === 'user@helpdesk.com' ? 'demo-btn--active' : ''}" data-email="user@helpdesk.com">
            👤 Switch to Member <span style="font-size:0.7rem; color:rgba(255,255,255,0.4)">(Alex)</span>
          </button>
          <button class="demo-btn ${activeUserEmail === 'admin@helpdesk.com' ? 'demo-btn--active' : ''}" data-email="admin@helpdesk.com">
            👑 Switch to Administrator
          </button>
          ${currentRole !== 'Visitor' ? `
            <button class="demo-btn demo-btn--danger" id="demo-logout-btn">
              🚪 Terminate Active Session
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Section: Database Connection -->
      <div>
        <div class="demo-section-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>Live Supabase Integration</span>
          <span id="supabase-connection-status">${renderStatusBadge()}</span>
        </div>
        <form id="supabase-config-form" style="display: flex; flex-direction: column; gap: 0.4rem;" onsubmit="return false;">
          <input type="text" class="demo-input" id="db-config-url" placeholder="Supabase Project URL" value="${localStorage.getItem('custom_supabase_url') || ''}" />
          <input type="password" class="demo-input" id="db-config-key" placeholder="Supabase Anon Key" value="${localStorage.getItem('custom_supabase_anon_key') || ''}" />
          <div style="display: flex; gap: 0.4rem; margin-top: 0.2rem;">
            <button class="demo-btn" id="db-save-btn" style="flex: 1; text-align: center; justify-content: center; background: #6366f1; color:#fff;">
              💾 Apply live keys
            </button>
            ${(localStorage.getItem('custom_supabase_url')) ? `
              <button class="demo-btn demo-btn--danger" id="db-clear-keys-btn" style="padding: 0.5rem; justify-content: center;">
                ✕ Clear
              </button>
            ` : ''}
          </div>
        </form>
      </div>

      <!-- Section: Actions -->
      <div>
        <div class="demo-section-title">System Settings & Tools</div>
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          <a href="${guidePath}" class="demo-btn" style="background: rgba(99, 102, 241, 0.15); border-color: rgba(99, 102, 241, 0.3); color: #818cf8; text-decoration: none; justify-content: center; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
            ⚡ Supabase Setup & Migrator
          </a>
          <button class="demo-btn demo-btn--danger" id="demo-reset-db">
            🔄 Factory Reset Simulated Data
          </button>
        </div>
      </div>
    `;

    // Hook events inside rendered panel
    panel.querySelectorAll('[data-email]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const email = btn.getAttribute('data-email');
        const password = 'password123'; // Default seeded password
        
        try {
          // Force signout first
          await window.supabaseClient.auth.signOut();

          // Use the auth.js login() so suspension checks are enforced
          const data = await login(email, password);

          showToast(`Logged in successfully as ${email}`, 'success');
          // Dynamic redirect based on depth
          const isInsideAdmin = window.location.pathname.includes('/admin/');
          if (email.includes('admin')) {
            window.location.href = isInsideAdmin ? 'dashboard.html' : 'admin/dashboard.html';
          } else {
            window.location.href = isInsideAdmin ? '../dashboard.html' : 'dashboard.html';
          }
        } catch (e) {
          // Suspended account — show the overlay instead of a toast error
          if (e.isSuspension && e.profile) {
            showSuspensionOverlay(e.profile);
            return;
          }
          showToast(e.message || 'Failed to switch role', 'error');
        }
      });
    });

    const logoutBtn = document.getElementById('demo-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await window.supabaseClient.auth.signOut();
        showToast('Logged out successfully', 'info');
        const isInsideAdmin = window.location.pathname.includes('/admin/');
        window.location.href = isInsideAdmin ? '../index.html' : 'index.html';
      });
    }

    document.getElementById('db-save-btn').addEventListener('click', () => {
      const url = document.getElementById('db-config-url').value.trim();
      const key = document.getElementById('db-config-key').value.trim();
      
      if (!url || !key) {
        showToast('Both fields are required', 'error');
        return;
      }
      
      localStorage.setItem('custom_supabase_url', url);
      localStorage.setItem('custom_supabase_anon_key', key);
      localStorage.removeItem('db_active_session'); // Clear session so they log in with real db
      
      showToast('Live Supabase keys configured! Reloading...', 'success');
      setTimeout(() => window.location.reload(), 1000);
    });

    const clearKeysBtn = document.getElementById('db-clear-keys-btn');
    if (clearKeysBtn) {
      clearKeysBtn.addEventListener('click', () => {
        localStorage.removeItem('custom_supabase_url');
        localStorage.removeItem('custom_supabase_anon_key');
        localStorage.removeItem('db_active_session');
        showToast('Keys cleared. Reverting to sandbox mode...', 'info');
        setTimeout(() => window.location.reload(), 1000);
      });
    }

    document.getElementById('demo-reset-db').addEventListener('click', () => {
      if (confirm('Are you sure you want to completely clear and reset the simulated local database? All your created tickets and replies will be reset.')) {
        localStorage.removeItem('db_profiles');
        localStorage.removeItem('db_auth_credentials');
        localStorage.removeItem('db_tickets');
        localStorage.removeItem('db_ticket_replies');
        localStorage.removeItem('db_seeded');
        localStorage.removeItem('db_active_session');
        
        showToast('Simulated database reset! Seeding fresh data...', 'info');
        setTimeout(() => {
          // If in admin directory, send them to root, else reload
          const isInsideAdmin = window.location.pathname.includes('/admin/');
          window.location.href = isInsideAdmin ? '../index.html' : 'index.html';
        }, 1000);
      }
    });
  }

  // Toggle Panel
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('active');
  });

  document.addEventListener('click', (e) => {
    if (!panel.contains(e.target) && e.target !== trigger) {
      panel.classList.remove('active');
    }
  });

  // Initial load
  setTimeout(refreshState, 300);
})();
