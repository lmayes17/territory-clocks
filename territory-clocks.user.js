// ==UserScript==
// @name         Territory Clocks (Enabled+)
// @namespace    rba-isc
// @version      2.1.0
// @description  Shows the homeowner's local time on the lead, plus a territory clock bar
// @match        https://www.enabledplus.com/*
// @match        https://enabledplus.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/lmayes17/territory-clocks/main/territory-clocks.user.js
// @downloadURL  https://raw.githubusercontent.com/lmayes17/territory-clocks/main/territory-clocks.user.js
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return;

  // ---------- CONFIG ----------
  // Territory bar. Label = what reps see. tz = IANA zone (DST handled automatically).
  const TERRITORIES = [
    { label: 'Eastern',  tz: 'America/New_York' },
    { label: 'Central',  tz: 'America/Chicago' },
    { label: 'Pacific',  tz: 'America/Los_Angeles' },
  ];
  // OK-to-call hours in the HOMEOWNER's local time. end = first hour that's NOT ok (20 = 8pm).
  const CALL_WINDOWS = { weekday: { start: 8, end: 20 }, weekend: { start: 9, end: 20 } };
  // ----------------------------

  // State -> default zone
  const STATE_TZ = {
    CT:'America/New_York', DE:'America/New_York', DC:'America/New_York', FL:'America/New_York',
    GA:'America/New_York', IN:'America/Indiana/Indianapolis', KY:'America/New_York', ME:'America/New_York',
    MD:'America/New_York', MA:'America/New_York', MI:'America/Detroit', NH:'America/New_York',
    NJ:'America/New_York', NY:'America/New_York', NC:'America/New_York', OH:'America/New_York',
    PA:'America/New_York', RI:'America/New_York', SC:'America/New_York', TN:'America/Chicago',
    VT:'America/New_York', VA:'America/New_York', WV:'America/New_York',
    AL:'America/Chicago', AR:'America/Chicago', IL:'America/Chicago', IA:'America/Chicago',
    KS:'America/Chicago', LA:'America/Chicago', MN:'America/Chicago', MS:'America/Chicago',
    MO:'America/Chicago', NE:'America/Chicago', ND:'America/Chicago', OK:'America/Chicago',
    SD:'America/Chicago', TX:'America/Chicago', WI:'America/Chicago',
    CO:'America/Denver', ID:'America/Boise', MT:'America/Denver', NM:'America/Denver',
    UT:'America/Denver', WY:'America/Denver', AZ:'America/Phoenix',
    CA:'America/Los_Angeles', NV:'America/Los_Angeles', OR:'America/Los_Angeles', WA:'America/Los_Angeles',
    AK:'America/Anchorage', HI:'Pacific/Honolulu', PR:'America/Puerto_Rico',
  };

  // Split states: first 3 digits of zip -> zone. Overrides the state default.
  const ZIP3_TZ = {
    // Indiana: NW corner (Gary) and SW corner (Evansville) are Central
    '463':'America/Chicago', '464':'America/Chicago', '476':'America/Chicago', '477':'America/Chicago',
    // Tennessee: East TN is Eastern
    '373':'America/New_York', '374':'America/New_York', '376':'America/New_York',
    '377':'America/New_York', '378':'America/New_York', '379':'America/New_York',
    // Kentucky: western KY is Central
    '420':'America/Chicago', '421':'America/Chicago', '422':'America/Chicago',
    '423':'America/Chicago', '424':'America/Chicago',
    // Florida panhandle west of Apalachicola is Central
    '324':'America/Chicago', '325':'America/Chicago',
    // Texas: El Paso is Mountain
    '798':'America/Denver', '799':'America/Denver', '885':'America/Denver',
    // Idaho panhandle is Pacific
    '835':'America/Los_Angeles', '838':'America/Los_Angeles',
    // Western NE / SD / ND are Mountain
    '693':'America/Denver', '577':'America/Denver', '586':'America/Denver',
  };
  // zip3s where a county line splits the zone. Badge shows "verify".
  const ZIP3_MIXED = new Set(['465', '475', '373', '425', '427', '691', '575', '587', '588', '678', '979', '498', '499']);

  const TZ_SHORT = {
    'America/New_York':'ET', 'America/Detroit':'ET', 'America/Indiana/Indianapolis':'ET',
    'America/Chicago':'CT', 'America/Denver':'MT', 'America/Boise':'MT', 'America/Phoenix':'AZ',
    'America/Los_Angeles':'PT', 'America/Anchorage':'AKT', 'Pacific/Honolulu':'HT', 'America/Puerto_Rico':'AST',
  };

  const fmtCache = {};
  function fmt(tz, opts) {
    const k = tz + JSON.stringify(opts);
    return fmtCache[k] || (fmtCache[k] = new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: tz }, opts)));
  }
  function timeIn(tz, d) { return fmt(tz, { hour: 'numeric', minute: '2-digit' }).format(d); }
  function hourIn(tz, d) { return parseInt(fmt(tz, { hour: 'numeric', hour12: false }).format(d), 10) % 24; }
  function offsetMin(tz, d) {
    const p = fmt(tz, { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false })
      .formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
    return (Date.UTC(+p.year, p.month - 1, +p.day, p.hour % 24, +p.minute) - d.getTime()) / 60000;
  }
  const MY_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  function okToCall(tz, d) {
    const day = fmt(tz, { weekday: 'short' }).format(d);
    const w = (day === 'Sat' || day === 'Sun') ? CALL_WINDOWS.weekend : CALL_WINDOWS.weekday;
    const h = hourIn(tz, d);
    return h >= w.start && h < w.end;
  }

  function zoneFor(text) {
    const m = /,\s*([A-Z]{2})\s+(\d{5})/.exec(text || '') || /\b([A-Z]{2})\s+(\d{5})\b/.exec(text || '');
    if (!m) return null;
    const [, st, zip] = m;
    const z3 = zip.slice(0, 3);
    const tz = ZIP3_TZ[z3] || STATE_TZ[st];
    return tz ? { tz, st, zip, mixed: ZIP3_MIXED.has(z3) } : null;
  }

  // ---------- styles ----------
  const style = document.createElement('style');
  style.textContent = `
    #tzc-badge{display:inline-block;margin-left:6px;padding:0 5px;border-radius:4px;white-space:nowrap;vertical-align:baseline;
      font:600 11px/16px Segoe UI,Arial,sans-serif;background:#e6f4ea;color:#14532d;border:1px solid #86efac;
      user-select:none;-webkit-user-select:none}
    #tzc-badge.late{background:#fee2e2;color:#7f1d1d;border-color:#fca5a5}
    #tzc-badge .tzc-verify{margin-left:4px;background:#fef3c7;color:#78350f;padding:0 3px;border-radius:3px}
    #tzc-bar{position:fixed;z-index:2147483646;display:flex;align-items:center;gap:6px;background:#1f2937;color:#fff;
      font:12px/1.2 Segoe UI,Arial,sans-serif;padding:4px 8px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3);
      user-select:none;opacity:.95}
    #tzc-bar .tzc-handle{cursor:move;padding:0 4px}
    #tzc-bar .tzc-list{display:flex;gap:10px}
    #tzc-bar .tzc-item{display:flex;flex-direction:column;align-items:center;min-width:58px}
    #tzc-bar .tzc-label{font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:.03em}
    #tzc-bar .tzc-time{font-weight:600;font-size:13px}
    #tzc-bar .tzc-late{color:#fca5a5}
    #tzc-bar .tzc-hit .tzc-label{color:#86efac}
    #tzc-bar.collapsed .tzc-list{display:none}`;
  document.head.appendChild(style);

  // ---------- lead badge ----------
  let current = null; // zone info for the lead on screen

  function renderBadge() {
    const addr = document.querySelector('#leadinformation .city-state-zip');
    let badge = document.getElementById('tzc-badge');
    if (!addr) { if (badge) badge.remove(); current = null; return; }
    // Read the address without our own badge text
    const text = [...addr.childNodes].filter(n => n !== badge).map(n => n.textContent).join('');
    const z = zoneFor(text);
    current = z;
    if (!badge || badge.parentElement !== addr) {
      if (badge) badge.remove();
      badge = document.createElement('span');
      badge.id = 'tzc-badge';
      addr.appendChild(badge); // same line as city/state/zip, nothing pushed down
    }
    let cls = '', html;
    if (!z) {
      html = '🕒 no zip';
    } else {
      const now = new Date();
      const diffH = Math.round((offsetMin(z.tz, now) - offsetMin(MY_TZ, now)) / 30) / 2; // nearest half hour
      const rel = diffH === 0 ? '' : ` · ${diffH > 0 ? '+' : '−'}${Math.abs(diffH)}h`;
      cls = okToCall(z.tz, now) ? '' : 'late';
      html = `🕒 ${timeIn(z.tz, now)} ${TZ_SHORT[z.tz] || ''}${rel}` +
        (z.mixed ? '<span class="tzc-verify" title="This zip area crosses a time zone line. Confirm with the homeowner.">verify</span>' : '');
      badge.title = okToCall(z.tz, now) ? "Homeowner's local time. OK to call." : "Homeowner's local time. Outside calling hours.";
    }
    // Only touch the DOM when something changed, so it never disturbs a rep selecting the phone number
    if (badge.className !== cls) badge.className = cls;
    if (badge._tzcHtml !== html) { badge.innerHTML = html; badge._tzcHtml = html; }
  }

  // ---------- territory bar ----------
  const bar = document.createElement('div');
  bar.id = 'tzc-bar';
  bar.innerHTML = '<div class="tzc-handle" title="Drag to move. Double-click to collapse.">🕒</div><div class="tzc-list"></div>';
  document.body.appendChild(bar);
  const list = bar.querySelector('.tzc-list');
  const items = TERRITORIES.map(t => {
    const el = document.createElement('div');
    el.className = 'tzc-item';
    el.innerHTML = `<span class="tzc-label">${t.label}</span><span class="tzc-time"></span>`;
    list.appendChild(el);
    return { t, el, timeEl: el.querySelector('.tzc-time') };
  });

  function renderBar() {
    const now = new Date();
    const curOff = current ? offsetMin(current.tz, now) : null;
    items.forEach(i => {
      const t = timeIn(i.t.tz, now);
      if (i.timeEl.textContent !== t) i.timeEl.textContent = t;
      i.timeEl.classList.toggle('tzc-late', !okToCall(i.t.tz, now));
      i.el.classList.toggle('tzc-hit', curOff !== null && offsetMin(i.t.tz, now) === curOff);
    });
  }

  const pos = GM_getValue('pos', null);
  if (pos && pos.left != null) Object.assign(bar.style, { left: pos.left + 'px', top: pos.top + 'px' });
  else Object.assign(bar.style, { left: '8px', top: '8px' });
  if (GM_getValue('collapsed', false)) bar.classList.add('collapsed');

  const handle = bar.querySelector('.tzc-handle');
  handle.addEventListener('dblclick', () => {
    bar.classList.toggle('collapsed');
    GM_setValue('collapsed', bar.classList.contains('collapsed'));
  });
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const r = bar.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = ev => {
      bar.style.right = bar.style.bottom = 'auto';
      bar.style.left = Math.max(0, Math.min(window.innerWidth - 40, ev.clientX - dx)) + 'px';
      bar.style.top = Math.max(0, Math.min(window.innerHeight - 20, ev.clientY - dy)) + 'px';
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      GM_setValue('pos', { left: parseInt(bar.style.left, 10), top: parseInt(bar.style.top, 10) });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  // ---------- run ----------
  function tick() { renderBadge(); renderBar(); }
  tick();
  setInterval(tick, 15000);
  // Lead panel loads after the page (spinner). Re-render when it changes.
  let pending = false;
  const ours = n => n && n.nodeType === 1 ? n.closest('#tzc-bar,#tzc-badge') : n && n.parentElement && n.parentElement.closest('#tzc-bar,#tzc-badge');
  new MutationObserver(muts => {
    if (muts.every(m => ours(m.target) || [...m.addedNodes, ...m.removedNodes].every(ours))) return;
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; tick(); }, 300);
  }).observe(document.body, { childList: true, subtree: true });
})();
