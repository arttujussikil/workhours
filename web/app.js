'use strict';

/* ================= storage ================= */

// NOTE: keep this key and the data shape backwards compatible, it holds the user's hours.
const STORE_KEY = 'workhours.v1';
const TAB_KEY = 'workhours.tab';
const PALETTE = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA', '#FF2D55', '#A2845E'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'CAD', 'AUD'];
const MULTIPLIERS = [1.5, 2, 2.5, 3];
const HOUR = 3600000;

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const sheet = $('#sheet');
const titleEl = $('#title');
const topActions = $('#topActions');

let state = loadState();
let tab = readPref(TAB_KEY, 'timer');
const summary = { period: 'week', anchor: Date.now() };

function readPref(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode etc. */ }
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (isValidData(s)) return normalize(s);
  } catch { /* fall through */ }
  return normalize({ jobs: [], entries: [] });
}
/** Fills in settings added in later versions, so older saved data keeps working. */
function normalize(s) {
  const set = s.settings || {};
  const premium = { multiplier: 2, sundays: true, holidays: true, custom: [], ...(set.premium || {}) };
  if (!Array.isArray(premium.custom)) premium.custom = [];
  return { jobs: s.jobs, entries: s.entries, settings: { currency: set.currency || 'EUR', premium } };
}
function isValidData(s) {
  return s && Array.isArray(s.jobs) && Array.isArray(s.entries) &&
    s.entries.every(e => typeof e.start === 'number');
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (err) { alert('Could not save your data: ' + err.message); }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : Date.now().toString(36) + Math.random().toString(36).slice(2));

/* ================= dates & holidays ================= */

const pad = n => String(n).padStart(2, '0');
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }
const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const keyToTs = key => new Date(key + 'T00:00').getTime();

function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

const holidayCache = new Map();
/** Finnish public holidays (incl. Christmas Eve and Midsummer Eve) as Map<'YYYY-MM-DD', name>. */
function finnishHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const map = new Map();
  const add = (date, name) => map.set(dayKey(date.getTime()), name);
  const easter = easterSunday(year);
  const fromEaster = n => new Date(year, easter.getMonth(), easter.getDate() + n);
  const weekdayFrom = (month, firstDay, weekday) => {
    for (let d = firstDay; d < firstDay + 7; d++) {
      const date = new Date(year, month, d);
      if (date.getDay() === weekday) return date;
    }
  };
  add(new Date(year, 0, 1), "New Year's Day");
  add(new Date(year, 0, 6), 'Epiphany');
  add(fromEaster(-2), 'Good Friday');
  add(easter, 'Easter Sunday');
  add(fromEaster(1), 'Easter Monday');
  add(new Date(year, 4, 1), 'May Day');
  add(fromEaster(39), 'Ascension Day');
  add(fromEaster(49), 'Pentecost');
  add(weekdayFrom(5, 19, 5), 'Midsummer Eve');
  add(weekdayFrom(5, 20, 6), 'Midsummer Day');
  add(weekdayFrom(9, 31, 6), "All Saints' Day");
  add(new Date(year, 11, 6), 'Independence Day');
  add(new Date(year, 11, 24), 'Christmas Eve');
  add(new Date(year, 11, 25), 'Christmas Day');
  add(new Date(year, 11, 26), "St Stephen's Day");
  holidayCache.set(year, map);
  return map;
}

/** Why hours on this day pay extra (holiday name, "Sunday", "Holiday"), or null. */
function premiumReason(ts) {
  const p = state.settings.premium;
  const key = dayKey(ts);
  if (p.custom.includes(key)) return 'Holiday';
  if (p.holidays) {
    const name = finnishHolidays(new Date(ts).getFullYear()).get(key);
    if (name) return name;
  }
  if (p.sundays && new Date(ts).getDay() === 0) return 'Sunday';
  return null;
}

function nextPremiumHoliday() {
  const p = state.settings.premium;
  const today = dayKey(Date.now());
  const y = new Date().getFullYear();
  const candidates = [];
  if (p.holidays) {
    for (const year of [y, y + 1]) for (const [k, name] of finnishHolidays(year)) candidates.push([k, name]);
  }
  for (const k of p.custom) candidates.push([k, 'Your holiday']);
  return candidates.filter(([k]) => k >= today).sort((a, b) => a[0].localeCompare(b[0]))[0];
}

/* ================= model helpers ================= */

const jobById = id => state.jobs.find(j => j.id === id);
const jobName = job => (job ? job.name : 'No job');
const jobColor = job => (job ? job.color : '#8E8E93');
const runningEntry = () => state.entries.find(e => e.end == null);
const premiumX = () => state.settings.premium.multiplier;

/** Worked time in ms, breaks subtracted. */
function duration(e, now = Date.now()) {
  return Math.max(0, (e.end ?? now) - e.start - (e.breakMin || 0) * 60000);
}

/**
 * Pay multiplier for an entry. payMode: 'auto' (default) pays extra for the part
 * of the shift that falls on a Sunday/holiday; 'normal' = 1×; 'premium' = always extra.
 */
function payFactor(e, now = Date.now()) {
  const mode = e.payMode || 'auto';
  if (mode === 'normal') return 1;
  if (mode === 'premium') return premiumX();
  const end = e.end ?? now;
  if (end <= e.start) return premiumReason(e.start) ? premiumX() : 1;
  let weighted = 0;
  for (let t = e.start; t < end;) {
    const next = Math.min(end, addDays(startOfDay(t), 1));
    weighted += (next - t) * (premiumReason(t) ? premiumX() : 1);
    t = next;
  }
  return weighted / (end - e.start);
}
const paidMs = (e, now) => duration(e, now) * payFactor(e, now);

function earnings(e, now = Date.now()) {
  const job = jobById(e.jobId);
  return job && job.rate ? (paidMs(e, now) / HOUR) * job.rate : 0;
}
const sum = (list, now) => list.reduce((acc, e) => acc + duration(e, now), 0);
const sumPaid = (list, now) => list.reduce((acc, e) => acc + paidMs(e, now), 0);
const sumEarnings = (list, now) => list.reduce((acc, e) => acc + earnings(e, now), 0);

function entriesBetween(start, end) {
  return state.entries.filter(e => e.start >= start && e.start < end);
}

function lastUsedJobId() {
  const latest = [...state.entries].sort((a, b) => b.start - a.start)[0];
  return latest && jobById(latest.jobId) ? latest.jobId : state.jobs[0]?.id;
}

/* ================= formatting ================= */

function fmtHours(ms) {
  const total = Math.floor(ms / 60000);
  const h = Math.floor(total / 60), m = total % 60;
  if (!h) return `${m}m`;
  if (!m) return `${h}h`;
  return `${h}h ${m}m`;
}
function fmtClock(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
let moneyFormatter = null, moneyCurrency = null;
function fmtMoney(v) {
  if (moneyCurrency !== state.settings.currency) {
    moneyCurrency = state.settings.currency;
    moneyFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: moneyCurrency });
  }
  return moneyFormatter.format(v);
}
const fmtFactor = f => `${Number(f.toFixed(2))}×`;
const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDate = ts => new Date(ts).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

function dayLabel(dayStart) {
  const today = startOfDay(Date.now());
  if (dayStart === today) return 'Today';
  if (dayStart === addDays(today, -1)) return 'Yesterday';
  const sameYear = new Date(dayStart).getFullYear() === new Date().getFullYear();
  return new Date(dayStart).toLocaleDateString([], {
    weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function toLocalInput(ts) {
  const d = new Date(ts);
  return `${dayKey(ts)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = v => (v ? new Date(v).getTime() : NaN);

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const initial = name => ([...String(name).trim()][0] || '?').toUpperCase();

/** Lighten (amt > 0) or darken (amt < 0) a #RRGGBB colour. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.round(Math.min(255, Math.max(0, c + 255 * amt)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/* ================= small UI pieces ================= */

const icons = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  chev: '<svg class="chev" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h13l-3.5-3.5M19 15H6l3.5 3.5"/></svg>',
  stop: '<svg width="14" height="14" viewBox="0 0 14 14"><rect width="14" height="14" rx="3" fill="currentColor"/></svg>',
};

const sectionTitle = (text, right = '') => `<div class="section-title"><span>${text}</span><span>${right}</span></div>`;
const actionBtn = (action, icon, label, extra = '') =>
  `<button class="icon-btn" data-action="${action}" aria-label="${label}" ${extra}>${icon}</button>`;
const factorPill = f => (f > 1.001 ? `<span class="pill">${fmtFactor(f)}</span>` : '');

function entryRow(e) {
  const job = jobById(e.jobId);
  const running = e.end == null;
  const range = `${fmtTime(e.start)} – ${running ? 'now' : fmtTime(e.end)}` +
    (e.breakMin ? ` · ${e.breakMin} min break` : '');
  return `<button class="row" data-action="edit-entry" data-id="${e.id}">
    <span class="bar" style="background:${jobColor(job)}"></span>
    <span class="grow">
      <span class="block">${esc(jobName(job))} ${factorPill(payFactor(e))}</span>
      <span class="sub block">${range}</span>
      ${e.note ? `<span class="sub block clamp">${esc(e.note)}</span>` : ''}
    </span>
    <span class="right">
      <span class="block" ${running ? `data-live="entry" data-id="${e.id}"` : ''}>${fmtHours(duration(e))}</span>
      ${job && job.rate ? `<span class="sub block">${fmtMoney(earnings(e))}</span>` : ''}
    </span>
  </button>`;
}

function weekBars(range, list) {
  const today = startOfDay(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => addDays(range.start, i));
  const totals = days.map(d => sum(list.filter(e => e.start >= d && e.start < addDays(d, 1))));
  const max = Math.max(...totals, 8 * HOUR);
  return `<div class="mini-bars">${days.map((d, i) => `
    <div class="mb ${d === today ? 'today' : ''} ${premiumReason(d) ? 'premium' : ''}">
      <div class="mb-track"><div class="mb-fill" style="height:${(totals[i] / max) * 100}%"></div></div>
      <span>${new Date(d).toLocaleDateString([], { weekday: 'narrow' })}</span>
    </div>`).join('')}</div>`;
}

/* ================= views ================= */

function renderTimer() {
  if (!state.jobs.length) {
    return {
      title: 'Work Hours',
      html: `<div class="empty"><div class="empty-icon">⏱</div><b>Welcome!</b>Add the jobs you work on, then tap one here to start the clock.
        <br><button class="btn" data-action="add-job">Add your first job</button></div>`,
    };
  }

  const now = Date.now();
  const run = runningEntry();
  const week = periodRange('week', now);
  const weekList = entriesBetween(week.start, week.end);
  let html = '';

  if (run) {
    const job = jobById(run.jobId);
    const c = jobColor(job);
    const mode = run.payMode || 'auto';
    const reason = mode === 'premium' ? 'Double pay' : mode === 'auto' ? premiumReason(now) : null;
    html += `<section class="hero running" style="--c:${c};--c2:${shade(c, -0.22)}">
      <div class="hero-top"><span class="live-dot"></span>Working on
        ${reason ? `<span class="pill light">${fmtFactor(premiumX())} · ${esc(reason)}</span>` : ''}</div>
      <div class="hero-job">${esc(jobName(job))}</div>
      <div class="clock" data-live="clock">${fmtClock(duration(run))}</div>
      <div class="hero-sub">Started ${fmtTime(run.start)}${job && job.rate ? ` · <span data-live="earn">${fmtMoney(earnings(run))}</span>` : ''}</div>
      <button class="btn stop" data-action="stop">${icons.stop} Stop</button>
    </section>`;
  } else {
    const reason = premiumReason(now);
    const earned = sumEarnings(weekList);
    html += `<section class="hero idle">
      <div class="hero-top">This week
        ${reason ? `<span class="pill">Today ${fmtFactor(premiumX())} · ${esc(reason)}</span>` : ''}</div>
      <div class="hero-stats">
        <div><b>${fmtHours(sum(weekList))}</b><span>worked</span></div>
        ${earned > 0 ? `<div><b>${fmtMoney(earned)}</b><span>earned</span></div>` : ''}
      </div>
      ${weekBars(week, weekList)}
    </section>`;
  }

  html += sectionTitle(run ? 'Switch job' : 'Tap a job to start') + '<div class="tiles">' +
    state.jobs.map(j => {
      const current = run && run.jobId === j.id;
      const wk = sum(weekList.filter(e => e.jobId === j.id));
      return `<button class="tile ${current ? 'current' : ''}" data-action="start" data-id="${j.id}" ${current ? 'disabled' : ''} style="--c:${j.color}">
        <span class="tile-icon">${esc(initial(j.name))}</span>
        ${current ? '' : `<span class="tile-go">${run ? icons.swap : icons.play}</span>`}
        <span class="tile-name">${esc(j.name)}</span>
        <span class="tile-sub">${current ? '● Running now' : `${fmtHours(wk)} this week`}</span>
      </button>`;
    }).join('') + '</div>';

  const today = startOfDay(now);
  const todays = entriesBetween(today, addDays(today, 1)).sort((a, b) => b.start - a.start);
  if (todays.length) {
    html += sectionTitle('Today', `<span data-live="today">${fmtHours(sum(todays))}</span>`) +
      `<div class="group">${todays.map(entryRow).join('')}</div>`;
  }

  html += `<div class="group mt"><button class="row accent" data-action="add-entry">${icons.plus.replace('<svg', '<svg class="row-icon"')} Add hours manually</button></div>`;
  return { title: 'Work Hours', html };
}

function renderEntries() {
  const actions = actionBtn('add-entry', icons.plus, 'Add hours');
  if (!state.entries.length) {
    return {
      title: 'Entries', actions,
      html: `<div class="empty"><div class="empty-icon">🗒</div><b>No entries yet</b>Start a timer, or tap + to add hours manually.</div>`,
    };
  }
  const groups = new Map();
  for (const e of [...state.entries].sort((a, b) => b.start - a.start)) {
    const day = startOfDay(e.start);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(e);
  }
  let html = '';
  for (const [day, list] of groups) {
    const reason = premiumReason(day);
    const label = dayLabel(day);
    const tag = reason && !(reason === 'Sunday' && label.startsWith('Sunday'))
      ? ` <span class="pill">${esc(reason)}</span>` : '';
    html += sectionTitle(esc(label) + tag, fmtHours(sum(list))) +
      `<div class="group">${list.map(entryRow).join('')}</div>`;
  }
  return { title: 'Entries', actions, html };
}

function periodRange(period, anchor) {
  const d = new Date(startOfDay(anchor));
  if (period === 'week') {
    const mondayOffset = (d.getDay() + 6) % 7;
    const start = addDays(d.getTime(), -mondayOffset);
    return { start, end: addDays(start, 7) };
  }
  if (period === 'month') {
    return {
      start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
    };
  }
  return {
    start: new Date(d.getFullYear(), 0, 1).getTime(),
    end: new Date(d.getFullYear() + 1, 0, 1).getTime(),
  };
}

function shiftAnchor(period, anchor, n) {
  const d = new Date(anchor);
  if (period === 'week') return addDays(anchor, 7 * n);
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime();
  return new Date(d.getFullYear() + n, 0, 1).getTime();
}

function periodTitle(period, { start, end }) {
  const s = new Date(start);
  if (period === 'week') {
    const last = new Date(addDays(end, -1));
    const opts = { day: 'numeric', month: 'short' };
    return `${s.toLocaleDateString([], opts)} – ${last.toLocaleDateString([], { ...opts, year: 'numeric' })}`;
  }
  if (period === 'month') return s.toLocaleDateString([], { month: 'long', year: 'numeric' });
  return String(s.getFullYear());
}

function chartHTML(period, range, list) {
  const buckets = [];
  if (period === 'year') {
    const y = new Date(range.start).getFullYear();
    for (let m = 0; m < 12; m++) {
      const start = new Date(y, m, 1);
      buckets.push({
        start: start.getTime(), end: new Date(y, m + 1, 1).getTime(),
        label: start.toLocaleDateString([], { month: 'narrow' }), premium: false,
      });
    }
  } else {
    for (let t = range.start; t < range.end; t = addDays(t, 1)) {
      const d = new Date(t);
      const label = period === 'week'
        ? d.toLocaleDateString([], { weekday: 'short' })
        : (d.getDate() === 1 || d.getDate() % 5 === 0 ? String(d.getDate()) : '');
      buckets.push({ start: t, end: addDays(t, 1), label, premium: !!premiumReason(t) });
    }
  }

  const jobOrder = [...state.jobs.map(j => j.id), undefined];
  const data = buckets.map(b => {
    const per = new Map();
    for (const e of list) {
      if (e.start >= b.start && e.start < b.end) {
        const key = jobById(e.jobId) ? e.jobId : undefined;
        per.set(key, (per.get(key) || 0) + duration(e));
      }
    }
    return { per, total: [...per.values()].reduce((a, v) => a + v, 0) };
  });
  const max = Math.max(...data.map(d => d.total), 1);

  const cols = data.map(d => {
    if (!d.total) return '<div class="col empty-col"></div>';
    const segs = jobOrder
      .filter(id => d.per.has(id))
      .map(id => `<div class="seg" style="height:${(d.per.get(id) / max) * 100}%;background:${jobColor(jobById(id))}"></div>`)
      .join('');
    return `<div class="col">${segs}</div>`;
  }).join('');
  const labels = buckets.map(b => `<span class="${b.premium && period === 'week' ? 'premium' : ''}">${b.label}</span>`).join('');
  return `<div class="chart">${cols}</div><div class="chart-labels">${labels}</div>`;
}

function renderSummary() {
  const { period } = summary;
  const range = periodRange(period, summary.anchor);
  const list = entriesBetween(range.start, range.end);
  const worked = sum(list);
  const paid = sumPaid(list);
  const totalEarnings = sumEarnings(list);
  const hasExtra = paid - worked >= 60000;

  const perJob = new Map();
  for (const e of list) {
    const key = jobById(e.jobId) ? e.jobId : undefined;
    const cur = perJob.get(key) || { ms: 0, paid: 0, earn: 0 };
    cur.ms += duration(e);
    cur.paid += paidMs(e);
    cur.earn += earnings(e);
    perJob.set(key, cur);
  }
  const jobRows = [...perJob.entries()].sort((a, b) => b[1].ms - a[1].ms);

  const seg = p => `<button class="${period === p ? 'active' : ''}" data-action="period" data-arg="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`;
  let html = `
    <div class="segmented">${seg('week')}${seg('month')}${seg('year')}</div>
    <div class="period-nav">
      ${actionBtn('shift', icons.left, 'Previous', 'data-arg="-1"')}
      <b data-action="this-period">${periodTitle(period, range)}</b>
      ${actionBtn('shift', icons.right, 'Next', `data-arg="1" ${range.end > Date.now() ? 'disabled' : ''}`)}
    </div>
    <div class="group">
      <div class="stats">
        <div class="stat"><b>${fmtHours(worked)}</b><span class="sub">Worked</span></div>
        ${hasExtra ? `<div class="stat"><b>${fmtHours(paid)}</b><span class="sub">Paid hours</span></div>` : ''}
        ${totalEarnings > 0 ? `<div class="stat"><b>${fmtMoney(totalEarnings)}</b><span class="sub">Earnings</span></div>` : ''}
      </div>
      ${worked > 0 ? chartHTML(period, range, list) : ''}
    </div>
    ${hasExtra ? `<p class="hint">Includes ${fmtHours(paid - worked)} extra from Sunday and holiday pay.</p>` : ''}`;

  html += sectionTitle('By job');
  if (!jobRows.length) {
    html += '<div class="group"><div class="row sub">No hours in this period.</div></div>';
  } else {
    html += '<div class="group">' + jobRows.map(([id, v]) => {
      const job = jobById(id);
      const subParts = [];
      if (v.earn > 0) subParts.push(fmtMoney(v.earn));
      if (v.paid - v.ms >= 60000) subParts.push(`+${fmtHours(v.paid - v.ms)} extra`);
      return `<div class="row">
        <span class="avatar" style="--c:${jobColor(job)}">${esc(initial(jobName(job)))}</span>
        <span class="grow">${esc(jobName(job))}
          <span class="progress block"><i style="width:${(v.ms / worked) * 100}%;background:${jobColor(job)}"></i></span>
        </span>
        <span class="right">
          <span class="block">${fmtHours(v.ms)}</span>
          ${subParts.length ? `<span class="sub block">${subParts.join(' · ')}</span>` : ''}
        </span>
      </div>`;
    }).join('') + '</div>';
  }

  const actions = actionBtn('export-period', icons.share, 'Export CSV', list.length ? '' : 'disabled');
  return { title: 'Summary', actions, html };
}

function renderJobs() {
  const actions = actionBtn('add-job', icons.plus, 'Add job');
  const p = state.settings.premium;
  let html = '';

  if (!state.jobs.length) {
    html += `<div class="empty"><div class="empty-icon">💼</div><b>No jobs yet</b>Add the jobs you want to track hours for.
      <br><button class="btn" data-action="add-job">Add Job</button></div>`;
  } else {
    html += sectionTitle('Your jobs') + '<div class="group">' + state.jobs.map(j => {
      const total = sum(state.entries.filter(e => e.jobId === j.id));
      return `<button class="row" data-action="edit-job" data-id="${j.id}">
        <span class="avatar" style="--c:${j.color}">${esc(initial(j.name))}</span>
        <span class="grow">${esc(j.name)}
          ${j.rate ? `<span class="sub block">${fmtMoney(j.rate)} / h</span>` : ''}
        </span>
        <span class="sub right">${fmtHours(total)}</span>
        ${icons.chev}
      </button>`;
    }).join('') + '</div>';
  }

  const next = nextPremiumHoliday();
  html += sectionTitle('Sunday &amp; holiday pay') + `<div class="group">
    <label class="row field"><span class="grow">Sundays</span>
      <input type="checkbox" class="switch" data-change="p-sundays" ${p.sundays ? 'checked' : ''}></label>
    <label class="row field"><span class="grow">Finnish public holidays
        ${p.holidays && next ? `<span class="sub block">Next: ${esc(next[1])}, ${fmtDate(keyToTs(next[0]))}</span>` : ''}</span>
      <input type="checkbox" class="switch" data-change="p-holidays" ${p.holidays ? 'checked' : ''}></label>
    <label class="row field"><span>Pay on these days</span>
      <select data-change="p-mult">${MULTIPLIERS.map(m =>
        `<option value="${m}" ${m === p.multiplier ? 'selected' : ''}>${fmtFactor(m)}</option>`).join('')}</select></label>
  </div>`;

  html += sectionTitle('Your own holiday days') + '<div class="group">' +
    [...p.custom].sort().map(k => `<div class="row"><span class="grow">${fmtDate(keyToTs(k))}</span>
      <button class="link danger" data-action="p-remove" data-arg="${k}">Remove</button></div>`).join('') +
    `<label class="row field"><span class="grow accent">Add a day</span><input type="date" data-change="p-add"></label>
  </div>
  <p class="hint">Hours on Sundays and holidays count ${fmtFactor(p.multiplier)} in paid hours and earnings.
    You can change this for a single entry when you edit it.</p>`;

  html += sectionTitle('Settings') + `<div class="group">
    <label class="row field"><span>Currency</span>
      <select data-change="currency">${CURRENCIES.map(c =>
        `<option ${c === state.settings.currency ? 'selected' : ''}>${c}</option>`).join('')}</select>
    </label>
  </div>`;

  html += sectionTitle('Backup') + `<div class="group">
    <button class="row accent" data-action="export-all">Export all hours (CSV)</button>
    <button class="row accent" data-action="export-backup">Save backup file</button>
    <label class="row accent">Restore from backup…
      <input type="file" accept=".json,application/json" data-change="import" hidden>
    </label>
  </div>
  <p class="hint">Your data is stored only on this phone. Save a backup file to iCloud Drive now and then,
    so you can restore it if you switch phones.</p>`;

  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone) {
    html += sectionTitle('Install') + `<p class="hint" style="margin-top:0">To use this like a normal app on iPhone:
      open this page in <b>Safari</b>, tap the <b>Share</b> button, then <b>Add to Home Screen</b>.</p>`;
  }
  return { title: 'Jobs', actions, html };
}

const renderers = { timer: renderTimer, entries: renderEntries, summary: renderSummary, jobs: renderJobs };

function render() {
  if (!renderers[tab]) tab = 'timer';
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  const r = renderers[tab]();
  titleEl.textContent = r.title;
  topActions.innerHTML = r.actions || '';
  view.innerHTML = r.html;
}

/* Refresh the ticking numbers without re-rendering the page. */
function updateLive() {
  const run = runningEntry();
  if (!run) return;
  const now = Date.now();
  view.querySelectorAll('[data-live]').forEach(el => {
    switch (el.dataset.live) {
      case 'clock': el.textContent = fmtClock(duration(run, now)); break;
      case 'earn': el.textContent = fmtMoney(earnings(run, now)); break;
      case 'entry': if (el.dataset.id === run.id) el.textContent = fmtHours(duration(run, now)); break;
      case 'today': {
        const t = startOfDay(now);
        el.textContent = fmtHours(sum(entriesBetween(t, addDays(t, 1)), now));
        break;
      }
    }
  });
}

/* ================= sheets ================= */

function openSheet(title, body, onSave) {
  sheet.innerHTML = `<form class="sheet-form" novalidate>
    <div class="sheet-head">
      <button type="button" class="icon-btn" data-close>Cancel</button>
      <h2>${esc(title)}</h2>
      <button type="submit" class="icon-btn bold">Save</button>
    </div>
    <div class="sheet-body">${body}</div>
  </form>`;
  const form = $('form', sheet);
  form.addEventListener('submit', ev => {
    ev.preventDefault();
    if (onSave(form) !== false) closeSheet();
  });
  $('[data-close]', sheet).addEventListener('click', closeSheet);
  sheet.showModal();
  return form;
}
function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('click', ev => { if (ev.target === sheet) closeSheet(); });

function showError(form, msg) {
  const el = $('[data-error]', form);
  el.textContent = msg;
  el.hidden = false;
}

function entrySheet(id) {
  const entry = id ? state.entries.find(e => e.id === id) : null;
  if (!entry && !state.jobs.length) { jobSheet(null); return; }

  const now = Date.now();
  const isRunning = entry && entry.end == null;
  const start = entry ? entry.start : now - 8 * HOUR;
  const end = entry && entry.end != null ? entry.end : now;
  const selectedJob = entry ? entry.jobId : lastUsedJobId();
  const mode = (entry && entry.payMode) || 'auto';
  const payOpt = (value, label) => `<label><input type="radio" name="payMode" value="${value}" ${mode === value ? 'checked' : ''}><span>${label}</span></label>`;

  const body = `
    <div class="group">
      <label class="row field"><span>Job</span>
        <select name="job">${state.jobs.map(j =>
          `<option value="${j.id}" ${j.id === selectedJob ? 'selected' : ''}>${esc(j.name)}</option>`).join('')}
        </select>
      </label>
    </div>
    <div class="group mt">
      <label class="row field"><span>Start</span><input type="datetime-local" name="start" value="${toLocalInput(start)}"></label>
      ${isRunning ? '<label class="row field"><span class="grow">Still running</span><input type="checkbox" class="switch" name="running" checked></label>' : ''}
      <label class="row field" data-end-row ${isRunning ? 'hidden' : ''}><span>End</span><input type="datetime-local" name="end" value="${toLocalInput(end)}"></label>
      <label class="row field"><span>Break (minutes)</span><input type="number" name="breakMin" min="0" max="600" step="5" inputmode="numeric" value="${entry ? entry.breakMin || 0 : 0}"></label>
    </div>
    <div class="section-title"><span>Pay</span></div>
    <div class="group">
      <div class="seg-radio">
        ${payOpt('auto', 'Auto')}${payOpt('normal', 'Normal 1×')}${payOpt('premium', `Double ${fmtFactor(premiumX())}`)}
      </div>
      <p class="hint pad" data-pay-hint></p>
    </div>
    <div class="group mt">
      <label class="row field"><textarea name="note" rows="2" placeholder="Note (optional)">${esc(entry ? entry.note || '' : '')}</textarea></label>
    </div>
    <div class="group mt"><div class="row"><span class="grow">Total</span><span class="right" data-total></span></div></div>
    <p class="error" data-error hidden></p>
    ${entry ? '<button type="button" class="btn plain danger-text mt" data-delete>Delete Entry</button>' : ''}`;

  const readForm = f => {
    const el = f.elements;
    const running = el.running ? el.running.checked : false;
    return {
      running,
      jobId: el.job.value,
      start: fromLocalInput(el.start.value),
      end: running ? null : fromLocalInput(el.end.value),
      breakMin: Math.max(0, parseInt(el.breakMin.value, 10) || 0),
      payMode: el.payMode.value || 'auto',
      note: el.note.value.trim(),
    };
  };

  const form = openSheet(entry ? 'Edit Entry' : 'Add Hours', body, f => {
    const { running, ...data } = readForm(f);
    if (Number.isNaN(data.start)) return showError(f, 'Please choose a start time.'), false;
    if (!running && (Number.isNaN(data.end) || data.end <= data.start)) return showError(f, 'End must be after start.'), false;
    if (entry) Object.assign(entry, data);
    else state.entries.push({ id: uid(), ...data });
    save();
    render();
  });

  const update = () => {
    const d = readForm(form);
    $('[data-end-row]', form).hidden = d.running;
    const job = jobById(d.jobId);
    const valid = !Number.isNaN(d.start) && (d.running || (!Number.isNaN(d.end) && d.end > d.start));
    let autoHint = 'Normal day. Sundays and holidays pay extra automatically.';
    if (valid) {
      const f = payFactor({ ...d, payMode: 'auto' });
      const reason = premiumReason(d.start) || premiumReason((d.end ?? Date.now()) - 1);
      if (f >= premiumX() - 0.001) autoHint = `${reason}, so this entry pays ${fmtFactor(premiumX())}.`;
      else if (f > 1.001) autoHint = `Part of this shift is on a ${reason === 'Sunday' ? 'Sunday' : 'holiday'}, so it pays ${fmtFactor(f)} overall.`;
    }
    $('[data-pay-hint]', form).textContent = d.payMode === 'auto' ? autoHint
      : d.payMode === 'premium' ? `This entry always pays ${fmtFactor(premiumX())}.` : 'This entry always pays 1×, even on a holiday.';
    if (!valid) { $('[data-total]', form).textContent = '–'; return; }
    const worked = duration(d);
    const paid = paidMs(d);
    $('[data-total]', form).textContent = fmtHours(worked) +
      (paid - worked >= 60000 ? ` → ${fmtHours(paid)} paid` : '') +
      (job && job.rate ? ` · ${fmtMoney((paid / HOUR) * job.rate)}` : '');
  };
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  update();

  const del = $('[data-delete]', form);
  if (del) del.addEventListener('click', () => {
    if (!confirm('Delete this entry?')) return;
    state.entries = state.entries.filter(e => e.id !== entry.id);
    save();
    closeSheet();
    render();
  });
}

function jobSheet(id) {
  const job = id ? jobById(id) : null;
  const color = job ? job.color : PALETTE[state.jobs.length % PALETTE.length];
  const body = `
    <div class="group">
      <label class="row field left"><input name="name" placeholder="Job name" value="${esc(job ? job.name : '')}" autocomplete="off"></label>
    </div>
    <div class="group mt">
      <label class="row field"><span>Hourly rate</span>
        <input name="rate" inputmode="decimal" placeholder="optional" value="${job && job.rate ? job.rate : ''}"></label>
    </div>
    <div class="section-title"><span>Color</span></div>
    <div class="group swatches">${PALETTE.map(c => `<label>
      <input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}
    </div>
    <p class="error" data-error hidden></p>
    ${job ? '<button type="button" class="btn plain danger-text mt" data-delete>Delete Job</button>' : ''}`;

  const form = openSheet(job ? 'Edit Job' : 'New Job', body, f => {
    const el = f.elements;
    const name = el.name.value.trim();
    if (!name) return showError(f, 'Give the job a name.'), false;
    const rate = Math.max(0, parseFloat(el.rate.value.replace(',', '.')) || 0);
    const data = { name, rate, color: el.color.value };
    if (job) Object.assign(job, data);
    else state.jobs.push({ id: uid(), createdAt: Date.now(), ...data });
    save();
    render();
  });
  if (!job) setTimeout(() => form.elements.name.focus(), 50);

  const del = $('[data-delete]', form);
  if (del) del.addEventListener('click', () => {
    const count = state.entries.filter(e => e.jobId === job.id).length;
    const msg = count
      ? `Delete "${job.name}" and its ${count} ${count === 1 ? 'entry' : 'entries'}? This can't be undone.`
      : `Delete "${job.name}"?`;
    if (!confirm(msg)) return;
    state.jobs = state.jobs.filter(j => j.id !== job.id);
    state.entries = state.entries.filter(e => e.jobId !== job.id);
    save();
    closeSheet();
    render();
  });
}

/* ================= export / import ================= */

function csvFor(list) {
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  const time = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const rows = [['Date', 'Job', 'Start', 'End', 'Break (min)', 'Hours', 'Pay factor', 'Paid hours', 'Earnings', 'Note'].join(',')];
  for (const e of [...list].sort((a, b) => a.start - b.start)) {
    rows.push([
      dayKey(e.start), q(jobName(jobById(e.jobId))), time(e.start), e.end == null ? '' : time(e.end),
      e.breakMin || 0, (duration(e) / HOUR).toFixed(2), payFactor(e).toFixed(2), (paidMs(e) / HOUR).toFixed(2),
      earnings(e).toFixed(2), q(e.note || ''),
    ].join(','));
  }
  return rows.join('\n');
}

async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => dayKey(Date.now());

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch { data = null; }
    if (!isValidData(data)) { alert("That file isn't a Work Hours backup."); return; }
    const msg = `Replace everything on this phone with the backup (${data.jobs.length} jobs, ${data.entries.length} entries)?`;
    if (!confirm(msg)) return;
    state = normalize(data);
    save();
    render();
  };
  reader.readAsText(file);
}

/* ================= events ================= */

const actions = {
  start(id) {
    const now = Date.now();
    const run = runningEntry();
    if (run) run.end = now;
    state.entries.push({ id: uid(), jobId: id, start: now, end: null, breakMin: 0, note: '' });
    save();
    render();
  },
  stop() {
    const run = runningEntry();
    if (run) { run.end = Date.now(); save(); render(); }
  },
  'add-entry': () => entrySheet(null),
  'edit-entry': id => entrySheet(id),
  'add-job': () => jobSheet(null),
  'edit-job': id => jobSheet(id),
  period(_, arg) { summary.period = arg; summary.anchor = Date.now(); render(); },
  shift(_, arg) { summary.anchor = shiftAnchor(summary.period, summary.anchor, Number(arg)); render(); },
  'this-period'() { summary.anchor = Date.now(); render(); },
  'p-remove'(_, key) {
    state.settings.premium.custom = state.settings.premium.custom.filter(k => k !== key);
    save();
    render();
  },
  'export-period'() {
    const range = periodRange(summary.period, summary.anchor);
    shareFile(`work-hours-${summary.period}-${stamp()}.csv`, csvFor(entriesBetween(range.start, range.end)), 'text/csv');
  },
  'export-all': () => shareFile(`work-hours-all-${stamp()}.csv`, csvFor(state.entries), 'text/csv'),
  'export-backup': () => shareFile(`work-hours-backup-${stamp()}.json`, JSON.stringify(state, null, 1), 'application/json'),
};

function onAction(ev) {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el.dataset.id, el.dataset.arg);
}
view.addEventListener('click', onAction);
topActions.addEventListener('click', onAction);

view.addEventListener('change', ev => {
  const t = ev.target;
  const p = state.settings.premium;
  switch (t.dataset.change) {
    case 'currency': state.settings.currency = t.value; break;
    case 'p-sundays': p.sundays = t.checked; break;
    case 'p-holidays': p.holidays = t.checked; break;
    case 'p-mult': p.multiplier = Number(t.value); break;
    case 'p-add':
      if (!t.value || p.custom.includes(t.value)) return;
      p.custom.push(t.value);
      break;
    case 'import':
      if (t.files[0]) importBackup(t.files[0]);
      t.value = '';
      return;
    default: return;
  }
  save();
  render();
});

document.querySelector('.tabbar').addEventListener('click', ev => {
  const btn = ev.target.closest('[data-tab]');
  if (!btn) return;
  tab = btn.dataset.tab;
  writePref(TAB_KEY, tab);
  render();
  window.scrollTo(0, 0);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !sheet.open) render();
});

setInterval(updateLive, 1000);
render();

/* Ask the browser not to evict our data, and cache the app for offline use. */
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // When a new version is deployed, the new service worker takes over and we reload once to show it.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading || sheet.open) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
}
