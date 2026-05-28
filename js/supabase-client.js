// ============================================================
// Supabase Client Initialization & LocalStorage Mock Fallback
// ============================================================

// 1. Supabase Configuration Details
// Replace these with your actual Supabase credentials if connecting to a real database.
// Replace these placeholders with your actual live Supabase credentials to permanently bind the site!
const LIVE_SUPABASE_URL = 'https://dolioyiurxmatpuoqbbj.supabase.co';
const LIVE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvbGlveWl1cnhtYXRwdW9xYmJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjAyNDEsImV4cCI6MjA5NDgzNjI0MX0.d6ydfNyNIXG77-oCNuzbGtw_mea2x7_-LGwrOia855I';

const SUPABASE_URL = (LIVE_SUPABASE_URL && LIVE_SUPABASE_URL !== 'https://YOUR_PROJECT_ID.supabase.co') 
  ? LIVE_SUPABASE_URL 
  : (localStorage.getItem('custom_supabase_url') || '');

const SUPABASE_ANON_KEY = (LIVE_SUPABASE_ANON_KEY && LIVE_SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY') 
  ? LIVE_SUPABASE_ANON_KEY 
  : (localStorage.getItem('custom_supabase_anon_key') || '');

let supabaseClient;
let isDemoMode = false;

// Cross-tab Realtime Synced Broadcast Channel (in Demo Mode)
const mockBroadcastChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('supabase_mock_realtime') : null;
if (mockBroadcastChannel) {
  mockBroadcastChannel.addEventListener('message', (e) => {
    window.dispatchEvent(new CustomEvent('db_changes', {
      detail: e.data
    }));
  });
}


// 2. Local Database Mock Engine (Frosted-LocalDB)
class MockChannel {
  constructor(name) {
    this.name = name;
    this.listeners = [];
    this.eventHandler = null;
  }
  on(event, filter, callback) {
    this.listeners.push({ event, filter, callback });
    return this;
  }
  subscribe() {
    this.eventHandler = (e) => {
      const { table, event: eventType, new: newRow } = e.detail;
      for (const listener of this.listeners) {
        let match = true;
        if (listener.filter && listener.filter.table !== table) match = false;
        
        if (listener.filter && listener.filter.filter) {
          const filterStr = listener.filter.filter;
          if (filterStr.includes('user_id=eq.')) {
            const filterUserId = filterStr.split('user_id=eq.')[1];
            if (newRow.user_id !== filterUserId) match = false;
          }
          if (filterStr.includes('ticket_id=eq.')) {
            const filterTicketId = filterStr.split('ticket_id=eq.')[1];
            if (newRow.ticket_id !== filterTicketId) match = false;
          }
          if (filterStr.includes('id=eq.')) {
            const filterId = filterStr.split('id=eq.')[1];
            if (newRow.id !== filterId) match = false;
          }
        }
        if (match) {
          listener.callback({
            new: newRow,
            eventType: eventType
          });
        }
      }
    };
    window.addEventListener('db_changes', this.eventHandler);
    return this;
  }
  unsubscribe() {
    if (this.eventHandler) {
      window.removeEventListener('db_changes', this.eventHandler);
    }
  }
}

class MockQueryBuilder {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.isSingle = false;
    this.sortField = null;
    this.sortAscending = true;
    this.limitCount = null;
    this.insertRows = null;
    this.updateValues = null;
    this.deleteFlag = false;
  }

  select(fields) { this.selectFields = fields; return this; }
  insert(rows) { this.insertRows = rows; return this; }
  update(values) { this.updateValues = values; return this; }
  eq(field, value) { this.filters.push({ type: 'eq', field, value }); return this; }
  single() { this.isSingle = true; return this; }
  order(field, { ascending } = { ascending: true }) {
    this.sortField = field;
    this.sortAscending = ascending;
    return this;
  }
  limit(count) { this.limitCount = count; return this; }
  delete() { this.deleteFlag = true; return this; }

  async execute() {
    await new Promise(resolve => setTimeout(resolve, 250)); // Simulating network latency
    try {
      let data = JSON.parse(localStorage.getItem(`db_${this.table}`)) || [];

      if (this.insertRows) {
        const newRows = this.insertRows.map(row => {
          const newRow = {
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            ...row
          };
          if (this.table === 'tickets') {
            newRow.ticket_number = data.length + 1001;
            newRow.status = newRow.status || 'Pending';
          }
          return newRow;
        });
        data = [...data, ...newRows];
        localStorage.setItem(`db_${this.table}`, JSON.stringify(data));

        // Realtime dispatch
        for (const row of newRows) {
          const detail = { table: this.table, event: 'INSERT', new: row };
          window.dispatchEvent(new CustomEvent('db_changes', { detail }));
          if (mockBroadcastChannel) {
            mockBroadcastChannel.postMessage(detail);
          }
        }
        return { data: this.isSingle ? newRows[0] : newRows, error: null };
      }

      if (this.deleteFlag) {
        const deleted = [];
        data = data.filter(row => {
          let matches = true;
          for (const filter of this.filters) {
            if (filter.type === 'eq' && row[filter.field] !== filter.value) {
              matches = false;
              break;
            }
          }
          if (matches) deleted.push(row);
          return !matches;
        });
        localStorage.setItem(`db_${this.table}`, JSON.stringify(data));
        return { data: deleted, error: null };
      }

      if (this.updateValues) {
        let updatedRows = [];
        data = data.map(row => {
          let matches = true;
          for (const filter of this.filters) {
            if (filter.type === 'eq' && row[filter.field] !== filter.value) {
              matches = false;
            }
          }
          if (matches) {
            const updated = { ...row, ...this.updateValues, updated_at: new Date().toISOString() };
            updatedRows.push(updated);
            return updated;
          }
          return row;
        });
        localStorage.setItem(`db_${this.table}`, JSON.stringify(data));

        // Realtime dispatch
        for (const row of updatedRows) {
          const detail = { table: this.table, event: 'UPDATE', new: row };
          window.dispatchEvent(new CustomEvent('db_changes', { detail }));
          if (mockBroadcastChannel) {
            mockBroadcastChannel.postMessage(detail);
          }
        }
        return { data: this.isSingle ? updatedRows[0] : updatedRows, error: null };
      }

      // Read actions (SELECT)
      let result = [...data];
      for (const filter of this.filters) {
        if (filter.type === 'eq') {
          result = result.filter(row => row[filter.field] === filter.value);
        }
      }

      // Joins simulations
      if (this.table === 'tickets' && this.selectFields && this.selectFields.includes('profiles')) {
        const profiles = JSON.parse(localStorage.getItem('db_profiles')) || [];
        result = result.map(ticket => {
          const profile = profiles.find(p => p.id === ticket.user_id);
          return { ...ticket, profiles: profile || null };
        });
      }

      if (this.table === 'ticket_replies' && this.selectFields && this.selectFields.includes('profiles')) {
        const profiles = JSON.parse(localStorage.getItem('db_profiles')) || [];
        result = result.map(reply => {
          const profile = profiles.find(p => p.id === reply.author_id);
          return { ...reply, profiles: profile || null };
        });
      }

      // Sorting
      if (this.sortField) {
        result.sort((a, b) => {
          const valA = a[this.sortField] || '';
          const valB = b[this.sortField] || '';
          if (valA < valB) return this.sortAscending ? -1 : 1;
          if (valA > valB) return this.sortAscending ? 1 : -1;
          return 0;
        });
      }

      // Limiting
      if (this.limitCount) {
        result = result.slice(0, this.limitCount);
      }

      if (this.isSingle) {
        if (result.length === 0) return { data: null, error: { message: 'Record not found' } };
        return { data: result[0], error: null };
      }

      return { data: result, error: null };
    } catch (e) {
      return { data: null, error: { message: e.message } };
    }
  }

  then(onfulfilled, onrejected) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class MockAuth {
  async getSession() {
    const session = localStorage.getItem('db_active_session');
    return { data: { session: session ? JSON.parse(session) : null }, error: null };
  }

  async signUp({ email, password, options }) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const profiles = JSON.parse(localStorage.getItem('db_profiles')) || [];
    const existing = profiles.find(p => p.email === email);
    if (existing) return { data: null, error: { message: 'User already exists' } };

    const userId = crypto.randomUUID();
    const newProfile = {
      id: userId,
      email: email,
      full_name: options?.data?.full_name || 'User',
      phone: options?.data?.phone || '',
      role: email.includes('admin') ? 'admin' : 'user',
      created_at: new Date().toISOString()
    };
    
    profiles.push(newProfile);
    localStorage.setItem('db_profiles', JSON.stringify(profiles));

    // Sign up also creates dynamic simulated authentication credentials
    const credentials = JSON.parse(localStorage.getItem('db_auth_credentials')) || [];
    credentials.push({ id: userId, email, password });
    localStorage.setItem('db_auth_credentials', JSON.stringify(credentials));

    // Auto log in on sign up
    const session = {
      user: { id: userId, email, role: newProfile.role },
      access_token: 'mock-session-token-' + userId
    };
    localStorage.setItem('db_active_session', JSON.stringify(session));

    return { data: { user: session.user, session }, error: null };
  }

  async signInWithPassword({ email, password }) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const credentials = JSON.parse(localStorage.getItem('db_auth_credentials')) || [];
    const profiles = JSON.parse(localStorage.getItem('db_profiles')) || [];
    const match = credentials.find(c => c.email === email && c.password === password);
    
    if (!match) return { data: null, error: { message: 'Invalid credentials. Try: user@helpdesk.com / password123 or admin@helpdesk.com / password123' } };

    // Block login if the account has been deleted
    const deletedIds = JSON.parse(localStorage.getItem('db_deleted_ids') || '[]');
    if (deletedIds.includes(match.id)) {
      return { data: null, error: { message: 'This account no longer exists.' } };
    }

    // Block login if the profile row is missing (deleted)
    const profile = profiles.find(p => p.id === match.id);
    if (!profile) {
      return { data: null, error: { message: 'This account no longer exists.' } };
    }

    const session = {
      user: { id: match.id, email: match.email, role: profile?.role || 'user' },
      access_token: 'mock-session-token-' + match.id
    };
    localStorage.setItem('db_active_session', JSON.stringify(session));

    return { data: { user: session.user, session }, error: null };
  }

  async signOut() {
    localStorage.removeItem('db_active_session');
    return { error: null };
  }

  async updateUser(attributes) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const session = localStorage.getItem('db_active_session');
    if (!session) return { data: null, error: { message: 'Not authenticated' } };
    
    const parsedSession = JSON.parse(session);
    const userId = parsedSession.user.id;
    
    if (attributes.password) {
      const credentials = JSON.parse(localStorage.getItem('db_auth_credentials')) || [];
      const match = credentials.find(c => c.id === userId);
      if (match) {
        match.password = attributes.password;
        localStorage.setItem('db_auth_credentials', JSON.stringify(credentials));
      }
    }
    
    return { data: { user: parsedSession.user }, error: null };
  }
}

class MockSupabase {
  constructor() {
    this.auth = new MockAuth();
    this.activeChannels = [];
  }
  from(table) {
    return new MockQueryBuilder(table);
  }
  channel(name) {
    const chan = new MockChannel(name);
    this.activeChannels.push(chan);
    return chan;
  }
  removeChannel(chan) {
    if (chan) {
      chan.unsubscribe();
      this.activeChannels = this.activeChannels.filter(c => c !== chan);
    }
  }
}

// 3. Database Seeding & Mock Initialization
function seedDatabase() {
  if (localStorage.getItem('db_seeded')) return;

  const defaultProfiles = [
    { id: 'usr-alex', email: 'user@helpdesk.com', full_name: 'Alex Johnson', phone: '+1 (555) 019-2834', role: 'user', created_at: new Date(Date.now() - 36000000).toISOString() },
    { id: 'usr-sarah', email: 'sarah@example.com', full_name: 'Sarah Miller', phone: '+1 (555) 043-9871', role: 'user', created_at: new Date(Date.now() - 72000000).toISOString() },
    { id: 'usr-admin', email: 'admin@helpdesk.com', full_name: 'Admin Support', phone: '+1 (555) 100-2000', role: 'admin', created_at: new Date(Date.now() - 99000000).toISOString() }
  ];

  const defaultAuth = [
    { id: 'usr-alex', email: 'user@helpdesk.com', password: 'password123' },
    { id: 'usr-sarah', email: 'sarah@example.com', password: 'password123' },
    { id: 'usr-admin', email: 'admin@helpdesk.com', password: 'password123' }
  ];

  const defaultTickets = [
    {
      id: 'tick-1001',
      ticket_number: 1001,
      user_id: 'usr-alex',
      subject: 'WiFi Connection drops frequently in Office B',
      category: 'Technical',
      status: 'Pending',
      description: 'Since yesterday, the enterprise WiFi in meeting room B drops connection every 5-10 minutes. It makes taking Zoom meetings from there impossible. I have tried resetting my adapter but others are reporting the same.',
      created_at: new Date(Date.now() - 25000000).toISOString()
    },
    {
      id: 'tick-1002',
      ticket_number: 1002,
      user_id: 'usr-sarah',
      subject: 'Billing error on April Invoice',
      category: 'Billing',
      status: 'Resolved',
      description: 'Hi, I noticed that my credit card was charged twice on the April invoice. Can you please check and issue a refund for the duplicate transaction?',
      created_at: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 'tick-1003',
      ticket_number: 1003,
      user_id: 'usr-alex',
      subject: 'Access request for CRM production tool',
      category: 'General',
      status: 'Pending',
      description: 'I need access to the HubSpot CRM production portal as I have recently transferred to the Customer Success department. My manager has already signed off on the security training.',
      created_at: new Date(Date.now() - 5000000).toISOString()
    }
  ];

  const defaultReplies = [
    {
      id: 'rep-2001',
      ticket_id: 'tick-1002',
      author_id: 'usr-admin',
      message: 'Hello Sarah, I have investigated this transaction double-billing. It appears there was an automated clearing house error that caused a duplicate request. I have successfully initiated a void for the second charge. You should see the funds return in 2-3 business days.',
      is_admin_reply: true,
      created_at: new Date(Date.now() - 43200000).toISOString()
    },
    {
      id: 'rep-2002',
      ticket_id: 'tick-1002',
      author_id: 'usr-sarah',
      message: 'Thank you so much for the swift action! The issue is fully resolved.',
      is_admin_reply: false,
      created_at: new Date(Date.now() - 36000000).toISOString()
    }
  ];

  localStorage.setItem('db_profiles', JSON.stringify(defaultProfiles));
  localStorage.setItem('db_auth_credentials', JSON.stringify(defaultAuth));
  localStorage.setItem('db_tickets', JSON.stringify(defaultTickets));
  localStorage.setItem('db_ticket_replies', JSON.stringify(defaultReplies));
  localStorage.setItem('db_seeded', 'true');
  console.log('Mock Database successfully seeded!');
}

// 4. Client Selection logic (Real Supabase vs LocalDB)
const hasRealCredentials = () => {
  return SUPABASE_URL && 
         SUPABASE_ANON_KEY && 
         SUPABASE_URL !== 'https://YOUR_PROJECT_ID.supabase.co' && 
         SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY' &&
         !SUPABASE_URL.includes('YOUR_PROJECT_ID') &&
         !SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY');
};

if (hasRealCredentials()) {
  try {
    const { createClient } = supabase;
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Connected to live Supabase Instance');
  } catch (err) {
    console.error('Supabase initialization failed, falling back to LocalDB', err);
    seedDatabase();
    supabaseClient = new MockSupabase();
    isDemoMode = true;
  }
} else {
  seedDatabase();
  supabaseClient = new MockSupabase();
  isDemoMode = true;
  console.log('Running in Local Demo Mode (Mock Client Active)');
}

// Expose state globally for dashboards and utilities
window.isDemoMode = isDemoMode;
window.supabaseClient = supabaseClient;
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

