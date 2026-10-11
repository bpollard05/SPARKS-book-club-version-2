/* =====================================================================
   SPARKS Member Portal — DEMO MODE
   An in-browser stand-in for the Supabase backend so the portal can be
   explored with sample data before a real project exists. Nothing here
   runs in production: it only activates when config.js has no project
   URL AND demo mode has been switched on (?demo=1 or the "Try the demo"
   button). Data lives in this browser's localStorage only.

   Demo accounts (password / secret word for all: demo1234):
     director@demo.sparks   — Dee Director (also a parent)
     leader@demo.sparks     — Lee Leader (also a parent)
     parent@demo.sparks     — Pat Parent (students Maya + Ava)
     quinn@demo.sparks      — Quinn Parent (student Zoe)
     student: maya_reads    — secret word demo1234
   ===================================================================== */
(function () {
  'use strict';
  const CFG = window.SPARKS_CONFIG || {};
  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1') localStorage.setItem('spark_demo', '1');
  if (params.get('demo') === '0') { localStorage.removeItem('spark_demo'); localStorage.removeItem('spark_demo_db'); localStorage.removeItem('spark_demo_session'); }
  const realConfigured = CFG.SUPABASE_URL && !/YOUR-PROJECT-REF/.test(CFG.SUPABASE_URL);
  window.SPARKS_DEMO_AVAILABLE = !realConfigured;
  if (realConfigured || localStorage.getItem('spark_demo') !== '1') return;

  /* ── helpers ─────────────────────────────────────────────────── */
  const uuid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const daysFromNow = (d, h = 16) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  const etDate = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
  const todayET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const err = (message) => ({ message });
  const VISIBLE = ['approved', 'ordered', 'shipped', 'delivered'];
  const token = () => (uuid() + uuid()).replace(/-/g, '');

  /* ── seed data ───────────────────────────────────────────────── */
  function seed() {
    const ids = { D: uuid(), L: uuid(), P1: uuid(), P2: uuid(), SU: uuid(), school: uuid(), club: uuid(), club2: uuid(),
                  famD: uuid(), famL: uuid(), fam1: uuid(), fam2: uuid(), maya: uuid(), ava: uuid(), zoe: uuid(),
                  sPast: uuid(), sNext: uuid(), sDraft: uuid(), sSubmitted: uuid(), order1: uuid() };
    const t0 = daysFromNow(-30);
    const db = {
      auth_users: [
        { id: ids.D, email: 'director@demo.sparks', password: 'demo1234', kind: 'parent' },
        { id: ids.L, email: 'leader@demo.sparks', password: 'demo1234', kind: 'parent' },
        { id: ids.P1, email: 'parent@demo.sparks', password: 'demo1234', kind: 'parent' },
        { id: ids.P2, email: 'quinn@demo.sparks', password: 'demo1234', kind: 'parent' },
        { id: ids.SU, email: 'maya_reads@' + (CFG.STUDENT_EMAIL_DOMAIN || 'students.sparkslearning.org'), password: 'demo1234', kind: 'student' },
      ],
      settings: [{ id: 1, spare_count: 1, shipping_buffer_days: 10, budget_cap_cents: 30000, updated_at: t0 }],
      schools: [{ id: ids.school, name: 'Lincoln Elementary', city: 'Silver Spring', created_at: t0 }],
      clubs: [
        { id: ids.club, school_id: ids.school, name: 'Lincoln Tuesdays', grade_range: '3rd–5th', meeting_url: 'https://zoom.us/j/123456789', active: true, created_at: t0 },
        { id: ids.club2, school_id: ids.school, name: 'Lincoln Thursdays', grade_range: '3rd–5th', meeting_url: 'https://zoom.us/j/987654321', active: true, created_at: t0 },
      ],
      profiles: [
        { user_id: ids.D, full_name: 'Dee Director', email: 'director@demo.sparks', phone: '301-555-0100', created_at: t0 },
        { user_id: ids.L, full_name: 'Lee Leader', email: 'leader@demo.sparks', phone: '301-555-0101', created_at: t0 },
        { user_id: ids.P1, full_name: 'Pat Parent', email: 'parent@demo.sparks', phone: '301-555-0102', created_at: t0 },
        { user_id: ids.P2, full_name: 'Quinn Parent', email: 'quinn@demo.sparks', phone: null, created_at: t0 },
      ],
      user_roles: [
        { user_id: ids.D, role: 'parent', granted_by: null, granted_at: t0 }, { user_id: ids.D, role: 'director', granted_by: null, granted_at: t0 },
        { user_id: ids.L, role: 'parent', granted_by: null, granted_at: t0 }, { user_id: ids.L, role: 'leader', granted_by: ids.D, granted_at: t0 },
        { user_id: ids.P1, role: 'parent', granted_by: null, granted_at: t0 }, { user_id: ids.P2, role: 'parent', granted_by: null, granted_at: t0 },
      ],
      club_leaders: [{ club_id: ids.club, user_id: ids.L }],
      families: [
        { id: ids.famD, parent_user_id: ids.D, address_line1: null, address_line2: null, city: null, state: null, zip: null, address_validated: false, address_validated_at: null, address_updated_at: null, emergency_name: null, emergency_phone: null, calendar_token: token(), deletion_requested_at: null, created_at: t0 },
        { id: ids.famL, parent_user_id: ids.L, address_line1: null, address_line2: null, city: null, state: null, zip: null, address_validated: false, address_validated_at: null, address_updated_at: null, emergency_name: null, emergency_phone: null, calendar_token: token(), deletion_requested_at: null, created_at: t0 },
        { id: ids.fam1, parent_user_id: ids.P1, address_line1: '123 Maple St', address_line2: null, city: 'Silver Spring', state: 'MD', zip: '20910', address_validated: true, address_validated_at: t0, address_updated_at: t0, emergency_name: 'Grandma Jo', emergency_phone: '240-555-0199', calendar_token: token(), deletion_requested_at: null, created_at: t0 },
        { id: ids.fam2, parent_user_id: ids.P2, address_line1: '9 Oak Ave', address_line2: 'Apt 4', city: 'Takoma Park', state: 'MD', zip: '20912', address_validated: false, address_validated_at: null, address_updated_at: t0, emergency_name: null, emergency_phone: null, calendar_token: token(), deletion_requested_at: null, created_at: t0 },
      ],
      students: [
        { id: ids.maya, family_id: ids.fam1, first_name: 'Maya', grade: 4, club_id: ids.club, username: 'maya_reads', auth_user_id: ids.SU, enrolled: true, withdrawn_at: null, created_at: t0 },
        { id: ids.ava, family_id: ids.fam1, first_name: 'Ava', grade: 3, club_id: ids.club, username: null, auth_user_id: null, enrolled: true, withdrawn_at: null, created_at: t0 },
        { id: ids.zoe, family_id: ids.fam2, first_name: 'Zoe', grade: 5, club_id: ids.club, username: null, auth_user_id: null, enrolled: true, withdrawn_at: null, created_at: t0 },
      ],
      consent_docs: [
        { kind: 'terms', version: '2026-10', title: 'Terms of Service', url: 'legal/terms.html', is_current: true, published_at: t0 },
        { kind: 'privacy', version: '2026-10', title: 'Privacy Policy', url: 'legal/privacy.html', is_current: true, published_at: t0 },
        { kind: 'program', version: '2026-10', title: 'Program Participation Consent', url: 'legal/program.html', is_current: true, published_at: t0 },
      ],
      consents: [],
      sessions: [
        { id: ids.sPast, club_id: ids.club, title: 'September: Crenshaw', session_at: daysFromNow(-20), duration_min: 60, intro: 'A boy, an imaginary cat, and a family going through a hard time. Bring your favorite stuffed animal!', book_pages: 245, notes_for_director: null, status: 'delivered', created_by: ids.L, required_qty: 5, order_by_date: addDays(etDate(daysFromNow(-20)), -10), estimated_cost_cents: 9995, submitted_at: daysFromNow(-40), decided_at: daysFromNow(-39), decided_by: ids.D, decision_comment: 'Great pick!', created_at: daysFromNow(-42), updated_at: daysFromNow(-18) },
        { id: ids.sNext, club_id: ids.club, title: 'October: The Wild Robot', session_at: daysFromNow(18), duration_min: 60, intro: 'Roz the robot washes up on an island. Can a machine learn to belong? We will build our own mini robots!', book_pages: 279, notes_for_director: 'The robot kit has 12 pieces — please order the 2-pack.', status: 'approved', created_by: ids.L, required_qty: 5, order_by_date: addDays(etDate(daysFromNow(18)), -10), estimated_cost_cents: 12495, submitted_at: daysFromNow(-5), decided_at: daysFromNow(-4), decided_by: ids.D, decision_comment: null, created_at: daysFromNow(-6), updated_at: daysFromNow(-4) },
        { id: ids.sSubmitted, club_id: ids.club, title: 'November: Front Desk', session_at: daysFromNow(46), duration_min: 60, intro: 'Mia Tang runs the front desk of a motel. We will design our own motel signs!', book_pages: 286, notes_for_director: 'Could we get the paperback this time?', status: 'submitted', created_by: ids.L, required_qty: 5, order_by_date: addDays(etDate(daysFromNow(46)), -10), estimated_cost_cents: 7495, submitted_at: daysFromNow(-1), decided_at: null, decided_by: null, decision_comment: null, created_at: daysFromNow(-2), updated_at: daysFromNow(-1) },
        { id: ids.sDraft, club_id: ids.club, title: 'December: ideas', session_at: daysFromNow(75), duration_min: 60, intro: null, book_pages: null, notes_for_director: null, status: 'draft', created_by: ids.L, required_qty: null, order_by_date: null, estimated_cost_cents: null, submitted_at: null, decided_at: null, decided_by: null, decision_comment: null, created_at: daysFromNow(-1), updated_at: daysFromNow(-1) },
      ],
      session_items: [
        { id: uuid(), session_id: ids.sPast, kind: 'book', product_url: 'https://www.amazon.com/dp/1250043239', title: 'Crenshaw', author: 'Katherine Applegate', image_url: 'https://covers.openlibrary.org/b/isbn/9781250043238-L.jpg', unit_price_cents: 799, created_at: t0 },
        { id: uuid(), session_id: ids.sPast, kind: 'activity', product_url: 'https://www.amazon.com/dp/B07CRAFTKIT', title: 'Felt cat craft kit', author: null, image_url: null, unit_price_cents: 1200, created_at: t0 },
        { id: uuid(), session_id: ids.sNext, kind: 'book', product_url: 'https://www.amazon.com/dp/0316382000', title: 'The Wild Robot', author: 'Peter Brown', image_url: 'https://covers.openlibrary.org/b/isbn/9780316382007-L.jpg', unit_price_cents: 899, created_at: t0 },
        { id: uuid(), session_id: ids.sNext, kind: 'activity', product_url: 'https://www.amazon.com/dp/B0ROBOTKIT', title: 'Mini solar robot kit (2-pack)', author: null, image_url: null, unit_price_cents: 1600, created_at: t0 },
        { id: uuid(), session_id: ids.sSubmitted, kind: 'book', product_url: 'https://www.amazon.com/dp/1338157825', title: 'Front Desk', author: 'Kelly Yang', image_url: 'https://covers.openlibrary.org/b/isbn/9781338157826-L.jpg', unit_price_cents: 799, created_at: t0 },
        { id: uuid(), session_id: ids.sSubmitted, kind: 'activity', product_url: 'https://www.amazon.com/dp/B0SIGNKIT', title: 'Foam sign-making kit', author: null, image_url: null, unit_price_cents: 700, created_at: t0 },
      ],
      orders: [{ id: ids.order1, session_id: ids.sPast, vendor: 'amazon_business', order_ref: '113-4455667-8899001', placed_by: ids.D, placed_at: daysFromNow(-33), actual_cost_cents: 10240, notes: null }],
      shipments: [
        { id: uuid(), session_id: ids.sPast, student_id: ids.maya, status: 'delivered', tracking: '1Z999AA10123456784', note: null, created_at: daysFromNow(-39), updated_at: daysFromNow(-25) },
        { id: uuid(), session_id: ids.sPast, student_id: ids.ava, status: 'delivered', tracking: '1Z999AA10123456784', note: null, created_at: daysFromNow(-39), updated_at: daysFromNow(-25) },
        { id: uuid(), session_id: ids.sPast, student_id: ids.zoe, status: 'delivered', tracking: '1Z999AA10123456791', note: null, created_at: daysFromNow(-39), updated_at: daysFromNow(-24) },
        { id: uuid(), session_id: ids.sNext, student_id: ids.maya, status: 'pending', tracking: null, note: null, created_at: daysFromNow(-4), updated_at: daysFromNow(-4) },
        { id: uuid(), session_id: ids.sNext, student_id: ids.ava, status: 'pending', tracking: null, note: null, created_at: daysFromNow(-4), updated_at: daysFromNow(-4) },
        { id: uuid(), session_id: ids.sNext, student_id: ids.zoe, status: 'pending', tracking: null, note: null, created_at: daysFromNow(-4), updated_at: daysFromNow(-4) },
      ],
      feedback: [
        { id: uuid(), session_id: ids.sPast, student_id: ids.maya, rating: 5, book_thoughts: 'I loved Crenshaw!! The part where he takes a bath was so funny.', note_to_leader: 'Can we read another book with a cat?', created_at: daysFromNow(-19) },
        { id: uuid(), session_id: ids.sPast, student_id: ids.zoe, rating: 4, book_thoughts: 'It was kind of sad but good.', note_to_leader: null, created_at: daysFromNow(-18) },
      ],
      audit_log: [
        { id: 1, at: daysFromNow(-40), actor_id: ids.L, action: 'session_submitted', entity: 'session', entity_id: ids.sPast, details: { required_qty: 5 } },
        { id: 2, at: daysFromNow(-39), actor_id: ids.D, action: 'session_approved', entity: 'session', entity_id: ids.sPast, details: { comment: 'Great pick!' } },
        { id: 3, at: daysFromNow(-33), actor_id: ids.D, action: 'order_recorded', entity: 'session', entity_id: ids.sPast, details: { vendor: 'amazon_business', order_ref: '113-4455667-8899001' } },
        { id: 4, at: daysFromNow(-4), actor_id: ids.D, action: 'session_approved', entity: 'session', entity_id: ids.sNext, details: {} },
        { id: 5, at: daysFromNow(-1), actor_id: ids.L, action: 'session_submitted', entity: 'session', entity_id: ids.sSubmitted, details: { required_qty: 5 } },
      ],
      _nextAudit: 6,
    };
    for (const f of db.families) db.consents.push(...db.consent_docs.map(d => ({ id: uuid(), family_id: f.id, kind: d.kind, version: d.version, accepted_by: f.parent_user_id, accepted_at: t0 })));
    return db;
  }

  let db;
  try { db = JSON.parse(localStorage.getItem('spark_demo_db')); } catch (_) { db = null; }
  if (!db || !db.sessions) { db = seed(); }
  const save = () => { try { localStorage.setItem('spark_demo_db', JSON.stringify(db)); } catch (_) {} };
  save();

  /* ── current user + role helpers ─────────────────────────────── */
  let session = null;
  try { session = JSON.parse(localStorage.getItem('spark_demo_session')); } catch (_) { session = null; }
  if (session && !db.auth_users.find(u => u.id === session.user.id)) session = null;
  const uid = () => session?.user?.id || null;
  const hasRole = (r) => db.user_roles.some(x => x.user_id === uid() && x.role === r);
  const isDirector = () => hasRole('director');
  const myFamily = () => db.families.find(f => f.parent_user_id === uid()) || null;
  const myStudent = () => db.students.find(s => s.auth_user_id === uid()) || null;
  const leadsClub = (cid) => hasRole('leader') && db.club_leaders.some(c => c.club_id === cid && c.user_id === uid());
  const familyClubIds = () => { const f = myFamily(), st = myStudent(); return [...new Set(db.students.filter(s => s.club_id && s.enrolled && ((f && s.family_id === f.id) || (st && s.id === st.id))).map(s => s.club_id))]; };
  const audit = (action, entity, entity_id, details) => { db.audit_log.unshift({ id: db._nextAudit++, at: now(), actor_id: uid(), action, entity, entity_id, details: details || null }); };

  function visible(table, r) {
    switch (table) {
      case 'settings': case 'consent_docs': case 'schools': return true;
      case 'clubs': return isDirector() || leadsClub(r.id) || familyClubIds().includes(r.id);
      case 'profiles': return r.user_id === uid() || isDirector();
      case 'user_roles': return r.user_id === uid() || isDirector();
      case 'club_leaders': return r.user_id === uid() || isDirector() || familyClubIds().includes(r.club_id);
      case 'families': return r.parent_user_id === uid() || isDirector();
      case 'students': return (myFamily() && r.family_id === myFamily().id) || r.id === myStudent()?.id || isDirector();
      case 'consents': return (myFamily() && r.family_id === myFamily().id) || isDirector();
      case 'sessions': return isDirector() || leadsClub(r.club_id);
      case 'session_items': { const s = db.sessions.find(x => x.id === r.session_id); return !!s && (isDirector() || leadsClub(s.club_id)); }
      case 'orders': case 'audit_log': return isDirector();
      case 'shipments': { const st = db.students.find(x => x.id === r.student_id); return isDirector() || (myFamily() && st && st.family_id === myFamily().id); }
      case 'feedback': { const st = db.students.find(x => x.id === r.student_id); const s = db.sessions.find(x => x.id === r.session_id);
        return r.student_id === myStudent()?.id || isDirector() || (myFamily() && st && st.family_id === myFamily().id) || (s && leadsClub(s.club_id)); }
      case 'club_roster': return true;
      default: return false;
    }
  }
  function rows(table) {
    if (table === 'club_roster') return db.students.filter(s => s.club_id && (leadsClub(s.club_id) || isDirector())).map(s => ({ student_id: s.id, first_name: s.first_name, grade: s.grade, club_id: s.club_id, enrolled: s.enrolled }));
    return (db[table] || []).filter(r => visible(table, r));
  }

  /* ── query builder (subset of supabase-js) ───────────────────── */
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.orders = []; this.op = 'select'; this.cols = '*'; this._limit = null; this.mode = 'many'; }
    select(cols) { if (this.op === 'select') this.cols = cols || '*'; else this.returning = true; return this; }
    insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
    update(patch) { this.op = 'update'; this.payload = patch; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(c, v) { this.filters.push(r => r[c] === v); return this; }
    neq(c, v) { this.filters.push(r => r[c] !== v); return this; }
    in(c, arr) { this.filters.push(r => arr.includes(r[c])); return this; }
    gte(c, v) { this.filters.push(r => r[c] >= v); return this; }
    lte(c, v) { this.filters.push(r => r[c] <= v); return this; }
    not(c, op, v) { if (op === 'is' && v === null) this.filters.push(r => r[c] !== null && r[c] !== undefined); return this; }
    order(c, o) { this.orders.push([c, !o || o.ascending !== false]); return this; }
    limit(n) { this._limit = n; return this; }
    single() { this.mode = 'single'; return this; }
    maybeSingle() { this.mode = 'maybe'; return this; }
    then(res, rej) { let out; try { out = this.run(); } catch (e) { out = { data: null, error: err(e.message) }; } return Promise.resolve(out).then(res, rej); }
    embed(list) {
      const m = String(this.cols).match(/(\w+)\(([^)]*)\)/g) || [];
      if (!m.length) return list;
      return list.map(r => { const o = Object.assign({}, r); for (const e of m) { const [, child] = e.match(/(\w+)\(/); if (child === 'session_items') o.session_items = db.session_items.filter(i => i.session_id === r.id); } return o; });
    }
    run() {
      if (!uid() && this.table !== 'consent_docs') return { data: null, error: err('Not signed in') };
      if (this.op === 'select') {
        let list = rows(this.table).filter(r => this.filters.every(f => f(r)));
        for (const [c, asc] of [...this.orders].reverse()) list.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1));
        if (this._limit) list = list.slice(0, this._limit);
        list = this.embed(list);
        if (this.mode === 'single') return list.length === 1 ? { data: list[0], error: null } : { data: null, error: err('JSON object requested, multiple (or no) rows returned') };
        if (this.mode === 'maybe') return { data: list[0] || null, error: null };
        return { data: list, error: null };
      }
      if (this.op === 'insert') {
        const out = [];
        for (const p of this.payload) {
          const r = Object.assign({ id: uuid(), created_at: now() }, p);
          if (this.table === 'students') { Object.assign(r, { username: null, auth_user_id: null, enrolled: true, withdrawn_at: null, club_id: null }, p.club_id ? {} : {}); if (p.club_id && !isDirector()) return { data: null, error: err('permission denied for column club_id') }; }
          if (this.table === 'sessions') { Object.assign(r, { status: 'draft', updated_at: now(), required_qty: null, order_by_date: null, estimated_cost_cents: null, submitted_at: null, decided_at: null, decided_by: null, decision_comment: null, duration_min: p.duration_min || 60 }, p); if (!(leadsClub(r.club_id) || isDirector())) return { data: null, error: err('new row violates row-level security policy for table "sessions"') }; }
          if (this.table === 'session_items' && !/^https?:\/\//i.test(r.product_url || '')) return { data: null, error: err('new row violates check constraint "session_items_product_url_check"') };
          if (this.table === 'feedback') { const s = db.sessions.find(x => x.id === r.session_id); const st = myStudent(); if (!st || r.student_id !== st.id || !s || !VISIBLE.includes(s.status) || s.club_id !== st.club_id) return { data: null, error: err('new row violates row-level security policy for table "feedback"') }; }
          if (this.table === 'consents') r.accepted_at = now();
          if (this.table === 'clubs') Object.assign(r, { active: true, grade_range: '3rd–5th' }, p);
          db[this.table].push(r); out.push(r);
        }
        save();
        return { data: this.mode === 'single' ? out[0] : (this.returning ? out : null), error: null };
      }
      if (this.op === 'update') {
        const targets = rows(this.table).filter(r => this.filters.every(f => f(r)));
        const blocked = { sessions: ['status', 'required_qty', 'order_by_date', 'estimated_cost_cents'], families: ['address_validated', 'address_validated_at', 'calendar_token'], students: ['club_id', 'username', 'auth_user_id', 'enrolled'], profiles: ['email'] };
        if (!isDirector() || this.table === 'sessions') for (const k of Object.keys(this.payload)) if ((blocked[this.table] || []).includes(k)) return { data: null, error: err(`permission denied for column ${k}`) };
        for (const r of targets) {
          if (this.table === 'sessions' && !(isDirector() || (leadsClub(r.club_id) && ['draft', 'changes_requested'].includes(r.status)))) continue;
          if (this.table === 'families' && ['address_line1', 'address_line2', 'city', 'state', 'zip'].some(k => k in this.payload && this.payload[k] !== r[k])) { r.address_validated = false; r.address_updated_at = now(); audit('address_changed', 'family', r.id); }
          Object.assign(r, this.payload); if ('updated_at' in r) r.updated_at = now();
        }
        save(); return { data: this.returning ? targets : null, error: null };
      }
      if (this.op === 'delete') {
        const targets = rows(this.table).filter(r => this.filters.every(f => f(r))).filter(r => this.table !== 'sessions' || isDirector() || (leadsClub(r.club_id) && r.status === 'draft'));
        db[this.table] = db[this.table].filter(r => !targets.includes(r));
        if (this.table === 'sessions') { const ids = targets.map(t => t.id); db.session_items = db.session_items.filter(i => !ids.includes(i.session_id)); db.shipments = db.shipments.filter(i => !ids.includes(i.session_id)); }
        save(); return { data: this.returning ? targets : null, error: null };
      }
    }
  }

  /* ── RPCs (mirror of the SQL functions) ──────────────────────── */
  const must = (cond, msg) => { if (!cond) throw new Error(msg); };
  const clubName = (id) => db.clubs.find(c => c.id === id)?.name || '';
  function rollup(sid) {
    const s = db.sessions.find(x => x.id === sid); if (!s || !['ordered', 'shipped', 'delivered'].includes(s.status)) return;
    const sh = db.shipments.filter(x => x.session_id === sid); if (!sh.length) return;
    const pending = sh.filter(x => x.status === 'pending').length, delivered = sh.filter(x => x.status === 'delivered').length, failed = sh.filter(x => x.status === 'could_not_ship').length;
    s.status = pending === 0 && delivered > 0 && delivered + failed === sh.length ? 'delivered' : pending === 0 && failed < sh.length ? 'shipped' : 'ordered';
  }
  const RPC = {
    whoami() {
      const st = myStudent(); const p = db.profiles.find(x => x.user_id === uid());
      return { user_id: uid(), roles: db.user_roles.filter(r => r.user_id === uid()).map(r => r.role), family_id: myFamily()?.id || null,
        student: st ? { id: st.id, first_name: st.first_name, grade: st.grade, club_id: st.club_id } : null,
        profile: p ? { full_name: p.full_name, email: p.email, phone: p.phone } : null,
        led_clubs: hasRole('leader') ? db.club_leaders.filter(c => c.user_id === uid()).map(c => c.club_id) : [] };
    },
    club_schedule({ p_club_id }) {
      const allowed = isDirector() || leadsClub(p_club_id) || familyClubIds().includes(p_club_id);
      return db.sessions.filter(s => s.club_id === p_club_id && (isDirector() || leadsClub(p_club_id) || VISIBLE.includes(s.status)) && allowed)
        .sort((a, b) => a.session_at.localeCompare(b.session_at)).map(s => { const b = db.session_items.find(i => i.session_id === s.id && i.kind === 'book');
          return { id: s.id, title: s.title, session_at: s.session_at, duration_min: s.duration_min, intro: s.intro, book_pages: s.book_pages, status: s.status, book_title: b?.title || null, book_author: b?.author || null, book_image_url: b?.image_url || null, meeting_url: db.clubs.find(c => c.id === p_club_id)?.meeting_url || null }; });
    },
    submit_session({ p_session_id }) {
      const s = db.sessions.find(x => x.id === p_session_id); must(s, 'Session not found'); must(leadsClub(s.club_id) || isDirector(), 'Not allowed');
      if (!['draft', 'changes_requested'].includes(s.status)) return { ok: false, errors: [`This request is already ${s.status}.`] };
      const cfg = db.settings[0]; const errors = [], warnings = [];
      const enrolled = db.students.filter(x => x.club_id === s.club_id && x.enrolled).length; const qty = enrolled + 1 + cfg.spare_count;
      const order_by = addDays(etDate(s.session_at), -cfg.shipping_buffer_days);
      const items = db.session_items.filter(i => i.session_id === s.id); const books = items.filter(i => i.kind === 'book');
      const cost = items.reduce((a, i) => a + (i.unit_price_cents || 0), 0) * qty; const missing = items.filter(i => i.unit_price_cents == null).length;
      if (!books.length) errors.push('Add the book (an Amazon or bookshop link) before submitting.');
      if (!enrolled) errors.push('No students are enrolled in this club yet, so there is nothing to order.');
      if (order_by < todayET()) errors.push(`Too late to ship in time: the order would need to be placed by ${order_by} (session date minus ${cfg.shipping_buffer_days}-day shipping buffer). Pick a later session date.`);
      if (cost > cfg.budget_cap_cents) errors.push(`Estimated cost $${(cost / 100).toFixed(2)} is over the per-session budget cap of $${(cfg.budget_cap_cents / 100).toFixed(2)} (${qty} copies of each item).`);
      if (missing) warnings.push(`${missing} item(s) have no price yet, so the budget check may be incomplete.`);
      const dup = db.session_items.find(si => si.kind === 'book' && si.session_id !== s.id && (() => { const ps = db.sessions.find(x => x.id === si.session_id); return ps && ps.club_id === s.club_id && ['submitted', 'approved', 'ordered', 'shipped', 'delivered'].includes(ps.status); })()
        && books.some(b => b.product_url.toLowerCase() === si.product_url.toLowerCase() || b.title.toLowerCase() === si.title.toLowerCase()));
      if (dup) errors.push(`"${dup.title}" was already used by this club in an earlier session.`);
      if (errors.length) return { ok: false, errors, warnings, required_qty: qty, order_by_date: order_by, estimated_cost_cents: cost };
      Object.assign(s, { status: 'submitted', submitted_at: now(), required_qty: qty, order_by_date: order_by, estimated_cost_cents: cost, decision_comment: null, updated_at: now() });
      audit('session_submitted', 'session', s.id, { required_qty: qty, order_by_date: order_by, estimated_cost_cents: cost });
      return { ok: true, errors: [], warnings, required_qty: qty, order_by_date: order_by, estimated_cost_cents: cost };
    },
    decide_session({ p_session_id, p_approve, p_comment }) {
      must(isDirector(), 'Directors only'); const s = db.sessions.find(x => x.id === p_session_id); must(s, 'Session not found'); must(s.status === 'submitted', `Only submitted requests can be decided (current: ${s.status})`);
      if (p_approve) { Object.assign(s, { status: 'approved', decided_at: now(), decided_by: uid(), decision_comment: p_comment || null, updated_at: now() });
        for (const st of db.students.filter(x => x.club_id === s.club_id && x.enrolled)) if (!db.shipments.some(sh => sh.session_id === s.id && sh.student_id === st.id)) db.shipments.push({ id: uuid(), session_id: s.id, student_id: st.id, status: 'pending', tracking: null, note: null, created_at: now(), updated_at: now() });
        audit('session_approved', 'session', s.id, { comment: p_comment }); }
      else { must((p_comment || '').trim(), 'Please tell the leader what to change.'); Object.assign(s, { status: 'changes_requested', decided_at: now(), decided_by: uid(), decision_comment: p_comment, updated_at: now() }); audit('session_changes_requested', 'session', s.id, { comment: p_comment }); }
    },
    order_package({ p_session_id }) {
      must(isDirector(), 'Directors only'); const s = db.sessions.find(x => x.id === p_session_id); must(s, 'Session not found'); must(VISIBLE.includes(s.status), 'The order package is only available after approval.');
      if (['approved', 'ordered'].includes(s.status)) for (const st of db.students.filter(x => x.club_id === s.club_id && x.enrolled)) if (!db.shipments.some(sh => sh.session_id === s.id && sh.student_id === st.id)) db.shipments.push({ id: uuid(), session_id: s.id, student_id: st.id, status: 'pending', tracking: null, note: null, created_at: now(), updated_at: now() });
      const n_enrolled = db.students.filter(x => x.club_id === s.club_id && x.enrolled).length; const spare = db.settings[0].spare_count;
      const items = db.session_items.filter(i => i.session_id === s.id).map(i => ({ id: i.id, kind: i.kind, title: i.title, author: i.author, product_url: i.product_url, image_url: i.image_url, unit_price_cents: i.unit_price_cents, qty: s.required_qty, line_total_cents: (i.unit_price_cents || 0) * s.required_qty }));
      const manifest = db.shipments.filter(sh => sh.session_id === s.id).map(sh => { const st = db.students.find(x => x.id === sh.student_id); const f = db.families.find(x => x.id === st.family_id); const p = db.profiles.find(x => x.user_id === f.parent_user_id);
        return { shipment_id: sh.id, student_id: st.id, student_first_name: st.first_name, grade: st.grade, enrolled: st.enrolled && st.club_id === s.club_id, in_club: st.club_id === s.club_id,
          added_after_approval: s.decided_at ? new Date(sh.created_at) > new Date(new Date(s.decided_at).getTime() + 5000) : false,
          parent_name: p.full_name, parent_email: p.email, parent_phone: p.phone, address_line1: f.address_line1, address_line2: f.address_line2, city: f.city, state: f.state, zip: f.zip, address_validated: f.address_validated, address_updated_at: f.address_updated_at,
          address_changed_after_order: !!f.address_updated_at && db.orders.some(o => o.session_id === s.id && o.placed_at < f.address_updated_at), shipment_status: sh.status, tracking: sh.tracking, note: sh.note }; }).sort((a, b) => a.student_first_name.localeCompare(b.student_first_name));
      const leaders = db.club_leaders.filter(c => c.club_id === s.club_id && db.user_roles.some(r => r.user_id === c.user_id && r.role === 'leader')).map(c => { const p = db.profiles.find(x => x.user_id === c.user_id); return { name: p.full_name, email: p.email }; });
      audit('order_package_viewed', 'session', s.id, { manifest_rows: manifest.length }); save();
      return { session: { id: s.id, title: s.title, session_at: s.session_at, status: s.status, required_qty: s.required_qty, order_by_date: s.order_by_date, estimated_cost_cents: s.estimated_cost_cents, club_id: s.club_id, enrolled_now: n_enrolled, required_qty_now: n_enrolled + 1 + spare },
        leaders, items, manifest, orders: db.orders.filter(o => o.session_id === s.id).sort((a, b) => a.placed_at.localeCompare(b.placed_at)) };
    },
    record_order({ p_session_id, p_order_ref, p_vendor, p_notes }) {
      must(isDirector(), 'Directors only'); const s = db.sessions.find(x => x.id === p_session_id); must(s, 'Session not found'); must(['approved', 'ordered'].includes(s.status), `Orders can only be recorded for approved requests (current: ${s.status})`); must((p_order_ref || '').trim(), 'Order number is required');
      const o = { id: uuid(), session_id: s.id, vendor: p_vendor || 'amazon_business', order_ref: p_order_ref, placed_by: uid(), placed_at: now(), actual_cost_cents: null, notes: p_notes || null }; db.orders.push(o);
      s.status = 'ordered'; s.updated_at = now(); audit('order_recorded', 'session', s.id, { order_id: o.id, vendor: o.vendor, order_ref: o.order_ref }); rollup(s.id); return o.id;
    },
    set_shipment_status({ p_shipment_id, p_status, p_tracking, p_note }) {
      must(isDirector(), 'Directors only'); const sh = db.shipments.find(x => x.id === p_shipment_id); must(sh, 'Shipment not found');
      Object.assign(sh, { status: p_status, tracking: p_tracking || sh.tracking, note: p_note || sh.note, updated_at: now() }); audit('shipment_updated', 'shipment', sh.id, { session_id: sh.session_id, status: p_status }); rollup(sh.session_id);
    },
    set_session_status({ p_session_id, p_status, p_comment }) {
      must(isDirector(), 'Directors only'); const s = db.sessions.find(x => x.id === p_session_id); must(s, 'Session not found'); must(['shipped', 'delivered', 'cancelled'].includes(p_status), 'Use submit/decide/record_order for that transition');
      if (p_status !== 'cancelled') must(['ordered', 'shipped', 'delivered'].includes(s.status), `Cannot mark ${p_status} before an order is recorded`);
      audit('session_status_set', 'session', s.id, { from: s.status, to: p_status, comment: p_comment }); s.status = p_status; if (p_comment) s.decision_comment = p_comment; s.updated_at = now();
    },
    set_actual_cost({ p_order_id, p_actual_cost_cents }) { must(isDirector(), 'Directors only'); const o = db.orders.find(x => x.id === p_order_id); must(o, 'Order not found'); o.actual_cost_cents = p_actual_cost_cents; audit('actual_cost_set', 'order', o.id, { actual_cost_cents: p_actual_cost_cents }); },
    spend_report() { must(isDirector(), 'Directors only'); return db.sessions.filter(s => s.status !== 'draft').sort((a, b) => b.session_at.localeCompare(a.session_at)).map(s => { const os = db.orders.filter(o => o.session_id === s.id); return { session_id: s.id, club: clubName(s.club_id), title: s.title, session_at: s.session_at, status: s.status, required_qty: s.required_qty, estimated_cost_cents: s.estimated_cost_cents, actual_cost_cents: os.some(o => o.actual_cost_cents != null) ? os.reduce((a, o) => a + (o.actual_cost_cents || 0), 0) : null, order_refs: os.map(o => o.vendor + ':' + o.order_ref).join('; ') || null }; }); },
    grant_role({ p_email, p_role }) { must(isDirector(), 'Directors only'); const p = db.profiles.find(x => x.email.toLowerCase() === p_email.toLowerCase()); must(p, 'No account with that email yet. Ask them to create an account first.'); if (!db.user_roles.some(r => r.user_id === p.user_id && r.role === p_role)) db.user_roles.push({ user_id: p.user_id, role: p_role, granted_by: uid(), granted_at: now() }); audit('role_granted', 'profile', p.user_id, { role: p_role }); },
    revoke_role({ p_user_id, p_role }) { must(isDirector(), 'Directors only'); must(!(p_user_id === uid() && p_role === 'director'), 'You cannot remove your own director role.'); must(p_role !== 'parent', 'The parent role cannot be removed; delete the account instead.'); db.user_roles = db.user_roles.filter(r => !(r.user_id === p_user_id && r.role === p_role)); if (p_role === 'leader') db.club_leaders = db.club_leaders.filter(c => c.user_id !== p_user_id); audit('role_revoked', 'profile', p_user_id, { role: p_role }); },
    set_club_leader({ p_club_id, p_email, p_add }) { must(isDirector(), 'Directors only'); const p = db.profiles.find(x => x.email.toLowerCase() === p_email.toLowerCase()); must(p, 'No account with that email yet.');
      if (p_add) { if (!db.user_roles.some(r => r.user_id === p.user_id && r.role === 'leader')) db.user_roles.push({ user_id: p.user_id, role: 'leader', granted_by: uid(), granted_at: now() }); if (!db.club_leaders.some(c => c.club_id === p_club_id && c.user_id === p.user_id)) db.club_leaders.push({ club_id: p_club_id, user_id: p.user_id }); }
      else db.club_leaders = db.club_leaders.filter(c => !(c.club_id === p_club_id && c.user_id === p.user_id));
      audit(p_add ? 'leader_assigned' : 'leader_removed', 'club', p_club_id, { user_id: p.user_id }); },
    assign_student_club({ p_student_id, p_club_id }) { must(isDirector(), 'Directors only'); const st = db.students.find(x => x.id === p_student_id); must(st, 'Student not found'); st.club_id = p_club_id || null; audit('student_club_assigned', 'student', st.id, { club_id: p_club_id }); },
    set_enrollment({ p_student_id, p_enrolled }) { const st = db.students.find(x => x.id === p_student_id); must(st, 'Student not found'); must((myFamily() && st.family_id === myFamily().id) || isDirector(), 'Not allowed'); st.enrolled = p_enrolled; st.withdrawn_at = p_enrolled ? null : now(); audit(p_enrolled ? 'student_enrolled' : 'student_withdrawn', 'student', st.id); },
    rotate_calendar_token() { const f = myFamily(); must(f, 'No family record'); f.calendar_token = token(); audit('calendar_token_rotated', 'family', f.id); return f.calendar_token; },
    export_my_family() { const f = myFamily(); const fam = Object.assign({}, f); delete fam.calendar_token; const kids = db.students.filter(s => s.family_id === f.id).map(s => { const o = Object.assign({}, s); delete o.auth_user_id; return o; });
      return { profile: db.profiles.find(p => p.user_id === uid()), family: fam, students: kids, consents: db.consents.filter(c => c.family_id === f.id), feedback: db.feedback.filter(x => kids.some(k => k.id === x.student_id)), exported_at: now() }; },
    request_deletion() { const f = myFamily(); must(f, 'No family record for this account'); f.deletion_requested_at = now(); audit('deletion_requested', 'family', f.id); },
    feedback_digest({ p_session_id }) { const s = db.sessions.find(x => x.id === p_session_id); if (!s || !(leadsClub(s.club_id) || isDirector())) return null; const fb = db.feedback.filter(f => f.session_id === s.id);
      return { count: fb.length, avg_rating: fb.length ? +(fb.reduce((a, f) => a + f.rating, 0) / fb.length).toFixed(2) : null, rows: fb.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(f => { const st = db.students.find(x => x.id === f.student_id); return { first_name: st.first_name, grade: st.grade, rating: f.rating, book_thoughts: f.book_thoughts, note_to_leader: f.note_to_leader, created_at: f.created_at }; }) }; },
    publish_consent_doc({ p_kind, p_version, p_title, p_url }) { must(isDirector(), 'Directors only'); must((p_version || '').trim(), 'Version label is required'); must(/^(\/(?![\/\\])|https?:\/\/)/i.test(p_url), 'new row violates check constraint "consent_docs_url_check"'); must(!db.consent_docs.some(d => d.kind === p_kind && d.version === p_version), 'duplicate key value violates unique constraint "consent_docs_pkey"');
      db.consent_docs.push({ kind: p_kind, version: p_version, title: p_title, url: p_url, is_current: true, published_at: now() }); db.consent_docs.forEach(d => { if (d.kind === p_kind && d.version !== p_version) d.is_current = false; }); audit('consent_doc_published', 'consent_doc', null, { kind: p_kind, version: p_version }); },
  };

  /* ── edge functions ──────────────────────────────────────────── */
  const FN = {
    'student-login'({ action, student_id, username, secret }) {
      const st = db.students.find(x => x.id === student_id); must(st, 'Student not found'); must((myFamily() && st.family_id === myFamily().id) || isDirector(), 'Not allowed'); must((secret || '').length >= 8, 'The secret word must be at least 8 characters.');
      if (action === 'create') { must(!st.auth_user_id, 'This student already has a login. Use reset instead.'); const u = (username || '').toLowerCase(); must(/^[a-z0-9_]{3,20}$/.test(u), 'Usernames are 3–20 lowercase letters, numbers, or underscores.'); must(!db.students.some(x => x.username === u), 'That username is taken — try another.');
        const au = { id: uuid(), email: `${u}@${CFG.STUDENT_EMAIL_DOMAIN}`, password: secret, kind: 'student' }; db.auth_users.push(au); st.username = u; st.auth_user_id = au.id; audit('student_login_created', 'student', st.id, { username: u }); return { ok: true, username: u }; }
      must(st.auth_user_id, 'This student has no login yet. Create one first.'); db.auth_users.find(x => x.id === st.auth_user_id).password = secret; audit('student_secret_reset', 'student', st.id); return { ok: true, username: st.username };
    },
    'validate-address'(b) {
      const f = myFamily(); must(f, 'No family record for this account.');
      const a = { address_line1: (b.address_line1 || '').trim(), address_line2: (b.address_line2 || '').trim() || null, city: (b.city || '').trim(), state: (b.state || '').trim().toUpperCase(), zip: (b.zip || '').trim() };
      must(a.address_line1 && a.city, 'Street address and city are required.'); must(/^[A-Z]{2}$/.test(a.state), 'State should be a 2-letter code, e.g. MD.'); must(/^\d{5}(-\d{4})?$/.test(a.zip), 'ZIP should be 5 digits (or ZIP+4).');
      const validated = !/nowhere|fake|test/i.test(a.address_line1); // demo rule: anything plausible "verifies"
      const norm = Object.assign({}, a, { address_line1: a.address_line1.toUpperCase(), city: a.city.toUpperCase() });
      Object.assign(f, validated ? norm : a, { address_validated: validated, address_validated_at: validated ? now() : null, address_updated_at: now() }); audit(validated ? 'address_validated' : 'address_saved_unverified', 'family', f.id);
      return { validated, changed: validated, normalized: validated ? norm : a, message: validated ? null : 'USPS could not find that address (demo: streets containing "fake", "test" or "nowhere" fail). Saved unverified.' };
    },
    'fetch-product'({ url }) {
      let u; try { u = new URL(url); } catch (_) { throw new Error('Invalid URL'); }
      if (!/amazon\.com|a\.co|amzn|bookshop\.org/.test(u.hostname)) return { title: null, author: null, image_url: null, price_cents: null, error: 'Automatic lookup only works for Amazon, bookshop.org and a few other stores; please fill in the details by hand.' };
      const guess = (window.SPARKS && window.SPARKS.guessTitleFromUrl) ? window.SPARKS.guessTitleFromUrl(url) : '';
      return { title: guess || 'Sample Book Title (demo)', author: 'Demo Author', image_url: null, price_cents: 899 };
    },
  };

  /* ── auth ────────────────────────────────────────────────────── */
  const listeners = [];
  const setSession = (s) => { session = s; if (s) localStorage.setItem('spark_demo_session', JSON.stringify(s)); else localStorage.removeItem('spark_demo_session'); };
  const mkSession = (u) => ({ user: { id: u.id, email: u.email }, access_token: 'demo' });
  const auth = {
    async getSession() { return { data: { session }, error: null }; },
    async signInWithPassword({ email, password }) { const u = db.auth_users.find(x => x.email.toLowerCase() === String(email).toLowerCase()); if (!u || u.password !== password) return { data: { session: null }, error: err('Invalid login credentials') }; setSession(mkSession(u)); return { data: { session }, error: null }; },
    async signOut() { setSession(null); return { error: null }; },
    async signUp({ email, password, options }) {
      if (db.auth_users.some(x => x.email.toLowerCase() === email.toLowerCase())) return { data: {}, error: err('User already registered') };
      const meta = (options && options.data) || {}; const u = { id: uuid(), email, password, kind: meta.kind || 'parent' }; db.auth_users.push(u);
      if (u.kind !== 'student') { db.profiles.push({ user_id: u.id, full_name: meta.full_name || email.split('@')[0], email, phone: meta.phone || null, created_at: now() }); db.user_roles.push({ user_id: u.id, role: 'parent', granted_by: null, granted_at: now() });
        const f = { id: uuid(), parent_user_id: u.id, address_line1: null, address_line2: null, city: null, state: null, zip: null, address_validated: false, address_validated_at: null, address_updated_at: null, emergency_name: null, emergency_phone: null, calendar_token: token(), deletion_requested_at: null, created_at: now() }; db.families.push(f);
        for (const [k, v] of Object.entries(meta.consents || {})) if (db.consent_docs.some(d => d.kind === k && d.version === v)) db.consents.push({ id: uuid(), family_id: f.id, kind: k, version: v, accepted_by: u.id, accepted_at: now() });
        db.audit_log.unshift({ id: db._nextAudit++, at: now(), actor_id: u.id, action: 'parent_signup', entity: 'profile', entity_id: u.id, details: null }); }
      save(); setSession(mkSession(u)); return { data: { session, user: session.user }, error: null }; // demo: no email confirmation step
    },
    async resetPasswordForEmail() { return { data: {}, error: err('Demo mode: password reset emails are not sent. Use the demo passwords (demo1234).') }; },
    async updateUser({ password }) { const u = db.auth_users.find(x => x.id === uid()); if (!u) return { data: {}, error: err('Not signed in') }; if (password) u.password = password; save(); return { data: { user: session.user }, error: null }; },
    onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
  };

  const client = {
    auth,
    from: (table) => new Query(table),
    async rpc(name, args) { try { if (!uid()) return { data: null, error: err('permission denied') }; must(RPC[name], `function ${name} does not exist`); const data = RPC[name](args || {}); save(); return { data: data === undefined ? null : data, error: null }; } catch (e) { return { data: null, error: err(e.message) }; } },
    functions: { async invoke(name, { body } = {}) { try { if (!uid()) return { data: null, error: err('Please sign in.') }; must(FN[name], `function ${name} not found`); const data = FN[name](body || {}); save(); return { data, error: null }; } catch (e) { return { data: { error: e.message }, error: null }; } } },
  };

  window.SPARKS_CONFIG = Object.assign({}, CFG, { SUPABASE_URL: 'https://demo.invalid', SUPABASE_ANON_KEY: 'demo', DEMO: true });
  window.supabase = { createClient: () => client };

  /* ── demo banner ─────────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.id = 'demoBanner';
    b.style.cssText = 'background:#1C1040;color:#fff;font-size:.85rem;padding:.5rem 1rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap;justify-content:center;';
    b.innerHTML = '<strong>DEMO MODE</strong> — sample data stored only in this browser. Sign in as: director@demo.sparks · leader@demo.sparks · parent@demo.sparks · quinn@demo.sparks (password <code style="color:#F5A020">demo1234</code>) or student <code style="color:#F5A020">maya_reads</code> / <code style="color:#F5A020">demo1234</code>.'
      + ' <button id="demoReset" style="background:#F5A020;border:0;border-radius:50px;padding:.3rem .8rem;font-weight:700;cursor:pointer;">Reset demo data</button>'
      + ' <a href="?demo=0" style="color:#fff;text-decoration:underline;">Exit demo</a>';
    document.body.prepend(b);
    document.getElementById('demoReset').onclick = () => { localStorage.removeItem('spark_demo_db'); localStorage.removeItem('spark_demo_session'); location.href = 'index.html?demo=1'; };
  });
})();
