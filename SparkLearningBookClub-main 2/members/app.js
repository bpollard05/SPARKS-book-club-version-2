/* =====================================================================
   SPARKS Member Portal — shared client code
   Loaded by every page under /members. Depends on:
     - config.js  (window.SPARKS_CONFIG)
     - @supabase/supabase-js v2 UMD build (window.supabase)
   ===================================================================== */
(function () {
  'use strict';

  const CFG = window.SPARKS_CONFIG || {};
  const configured = CFG.SUPABASE_URL && !/YOUR-PROJECT-REF/.test(CFG.SUPABASE_URL)
                  && CFG.SUPABASE_ANON_KEY && !/YOUR-ANON/.test(CFG.SUPABASE_ANON_KEY);

  const sb = configured && window.supabase
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    : null;

  /* ── tiny DOM helpers ─────────────────────────────────────────── */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function toast(message, type = 'info', ms = 4500) {
    let wrap = $('#toasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = `toast toast--${type}`;
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    t.textContent = message;
    wrap.appendChild(t);
    setTimeout(() => { t.classList.add('toast--out'); setTimeout(() => t.remove(), 400); }, ms);
  }

  /* ── formatting ───────────────────────────────────────────────── */
  const TZ = 'America/New_York';
  const fmtDate = (d, opts) => d ? new Date(d).toLocaleDateString('en-US', Object.assign({ timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, opts || {})) : '';
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const fmtTime = (d) => d ? new Date(d).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : '';
  const fmtMoney = (cents) => (cents == null ? '—' : '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const daysUntil = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);
  // ISO date (YYYY-MM-DD) + time (HH:MM) in local browser time -> ISO string
  const localToIso = (date, time) => new Date(`${date}T${time || '16:00'}:00`).toISOString();

  const STATUS = {
    draft:             { label: 'Draft',             cls: 'gray'   },
    submitted:         { label: 'Submitted',         cls: 'gold'   },
    changes_requested: { label: 'Changes requested', cls: 'coral'  },
    approved:          { label: 'Approved',          cls: 'teal'   },
    ordered:           { label: 'Ordered',           cls: 'purple' },
    shipped:           { label: 'Shipped',           cls: 'purple' },
    delivered:         { label: 'Delivered',         cls: 'green'  },
    cancelled:         { label: 'Cancelled',         cls: 'gray'   },
    pending:           { label: 'Pending',           cls: 'gray'   },
    could_not_ship:    { label: 'Could not ship',    cls: 'coral'  },
  };
  const badge = (status) => { const s = STATUS[status] || { label: status, cls: 'gray' }; return `<span class="pill pill--${s.cls}">${esc(s.label)}</span>`; };

  /* ── auth / session ───────────────────────────────────────────── */
  function requireConfig() {
    if (!sb) {
      const main = $('main') || document.body;
      main.innerHTML = `<div class="container" style="padding:4rem 1.5rem;"><div class="notice notice--warn">
        <strong>The member portal isn't connected yet.</strong><br>
        Add the Supabase project URL and anon key to <code>members/config.js</code>. See <code>members/README.md</code>.
        ${window.SPARKS_DEMO_AVAILABLE ? '<p style="margin-top:1rem;"><a class="btn btn--primary" href="index.html?demo=1">Try the demo with sample data</a></p>' : ''}
      </div></div>`;
      throw new Error('SPARKS portal not configured');
    }
  }

  async function whoami() {
    const { data, error } = await sb.rpc('whoami');
    if (error) throw error;
    return data;
  }

  function homeFor(me) {
    const roles = me.roles || [];
    if (roles.includes('director')) return 'director.html';
    if (roles.includes('leader'))   return 'leader.html';
    if (roles.includes('parent'))   return 'parent.html';
    if (me.student)                 return 'student.html';
    return 'index.html';
  }

  // Every page except login/signup calls this. Redirects if not allowed.
  async function requireAuth(allowed) {
    requireConfig();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.replace('index.html?next=' + encodeURIComponent(location.pathname.split('/').pop())); return new Promise(() => {}); }
    const me = await whoami();
    me.email = session.user.email;
    const ok = allowed.some(r => r === 'student' ? !!me.student : (me.roles || []).includes(r));
    if (!ok) {
      const home = homeFor(me);
      if (home === 'index.html') { await sb.auth.signOut(); location.replace('index.html?msg=unset'); return new Promise(() => {}); }
      toast("You don't have access to that page.", 'error'); location.replace(home); return new Promise(() => {});
    }
    renderPortalNav(me);
    return me;
  }

  async function signOut() { await sb.auth.signOut(); location.href = 'index.html'; }

  const studentEmail = (username) => `${String(username).trim().toLowerCase()}@${CFG.STUDENT_EMAIL_DOMAIN}`;

  /* ── RPC + edge-function wrappers that throw readable errors ──── */
  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args || {});
    if (error) throw new Error(cleanErr(error));
    return data;
  }
  async function fn(name, body, method = 'POST') {
    const { data, error } = await sb.functions.invoke(name, { body, method });
    if (error) {
      let msg = error.message;
      try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch (_) {}
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  function cleanErr(e) {
    const m = (e && e.message) || String(e);
    return m.replace(/^.*?(?=[A-Z])/, '').replace(/\s*\(SQLSTATE.*$/, '');
  }

  /* ── portal nav bar ───────────────────────────────────────────── */
  function renderPortalNav(me) {
    const nav = $('#portalNav');
    if (!nav) return;
    const roles = me.roles || [];
    const links = [];
    if (roles.includes('director')) links.push(['director.html', 'Director']);
    if (roles.includes('leader'))   links.push(['leader.html', 'Leader']);
    if (roles.includes('parent'))   links.push(['parent.html', 'Family']);
    if (me.student)                 links.push(['student.html', 'My Book Club']);
    const here = location.pathname.split('/').pop();
    const name = me.student ? me.student.first_name : (me.profile?.full_name || me.email);
    nav.innerHTML = `
      <div class="pnav__inner">
        <a href="../index.html" class="pnav__brand"><img src="../images/logo/logo.png" alt="SPARKS Book Club"></a>
        <div class="pnav__links">
          ${links.map(([href, label]) => `<a href="${href}" class="${href === here ? 'active' : ''}">${esc(label)}</a>`).join('')}
        </div>
        <div class="pnav__user">
          <span class="pnav__name">${esc(name)}</span>
          <button class="btn btn--outline-purple btn--sm" id="signOutBtn" type="button">Sign out</button>
        </div>
      </div>`;
    $('#signOutBtn').addEventListener('click', signOut);
  }

  /* ── calendar helpers (Section 5.2.3) ─────────────────────────── */
  const icsStamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  function googleCalendarUrl(s) {
    const start = new Date(s.session_at);
    const end = new Date(start.getTime() + (s.duration_min || 60) * 60000);
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${CFG.ORG_NAME}: ${s.title}`,
      dates: `${icsStamp(start)}/${icsStamp(end)}`,
      details: [s.book_title ? `Book: ${s.book_title}${s.book_author ? ' by ' + s.book_author : ''}` : '', s.intro || '', s.meeting_url ? `Join: ${s.meeting_url}` : ''].filter(Boolean).join('\n'),
      location: s.meeting_url || 'Online (Zoom)',
    });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }
  function icalFeedUrl(token) {
    return `${CFG.SUPABASE_URL}/functions/v1/ical?token=${encodeURIComponent(token)}`;
  }

  /* ── form helpers ─────────────────────────────────────────────── */
  function formData(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
    return o;
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.disabled = true; btn.textContent = label || 'Working…'; }
    else { btn.disabled = false; btn.textContent = btn.dataset.label || btn.textContent; }
  }
  // Pull a readable title out of an Amazon / bookshop URL as a fallback when the user hasn't typed one
  function guessTitleFromUrl(url) {
    try {
      const u = new URL(url);
      const seg = u.pathname.split('/').filter(Boolean);
      const i = seg.findIndex(x => /^(dp|gp|product|books|book)$/i.test(x));
      const slug = i > 0 ? seg[i - 1] : seg[seg.length - 1] || '';
      return decodeURIComponent(slug).replace(/[-_+]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 80);
    } catch (_) { return ''; }
  }
  function csvDownload(filename, rows) {
    const q = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; }; // quote + defuse spreadsheet formulas
    const csv = rows.map(r => r.map(q).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  window.SPARKS = {
    sb, configured, $, $$, esc, toast, fmtDate, fmtDateTime, fmtTime, fmtMoney, daysUntil, localToIso,
    STATUS, badge, requireConfig, requireAuth, whoami, homeFor, signOut, studentEmail, rpc, fn, cleanErr,
    googleCalendarUrl, icalFeedUrl, formData, busy, guessTitleFromUrl, csvDownload, CFG,
  };
})();
