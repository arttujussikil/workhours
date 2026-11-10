'use strict';

/* ================= storage ================= */

const STORE_KEY = 'workhours.v1';
const TAB_KEY = 'workhours.tab';
const PALETTE = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA', '#FF2D55', '#A2845E'];
const CURRENCIES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'CAD', 'AUD'];
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
function normalize(s) {
  return { jobs: s.jobs, entries: s.entries, settings: { currency: 'EUR', ...(s.settings || {}) } };
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

/* ================= model helpers ================= */

const jobById = id => state.jobs.find(j => j.id === id);
const jobName = job => (job ? job.name : 'No job');
const jobColor = job => (job ? job.color : '#8E8E93');
const runningEntry = () => state.entries.find(e => e.end == null);

function duration(e, now = Date.now()) {
  return Math.max(0, (e.end ?? now) - e.start - (e.breakMin || 0) * 60000);
}
function earnings(e, now = Date.now()) {
  const job = jobById(e.jobId);
  return job && job.rate ? (duration(e, now) / HOUR) * job.rate : 0;
}
const sum = (list, now) => list.reduce((acc, e) => acc + duration(e, now), 0);
const sumEarnings = list => list.reduce((acc, e) => acc + earnings(e), 0);

function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }

function entriesBetween(start, end) {
  return state.entries.filter(e => e.start >= start && e.start < end);
}

function lastUsedJobId() {
  const latest = [...state.entries].sort((a, b) => b.start - a.start)[0];
  return latest && jobById(latest.jobId) ? latest.jobId : state.jobs[0]?.id;
}

/* ================= formatting ================= */

const pad = n => String(n).padStart(2, '0');

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
const fmtTime = ts => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = v => (v ? new Date(v).getTime() : NaN);

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ================= small UI pieces ================= */

const icons = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  chev: '<svg class="chev" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l6 6-6 6"/></svg>',
  play: color => `<svg class="play" viewBox="0 0 28 28"><circle cx="14" cy="14" r="14" fill="${color}"/><path d="M11 8.5v11l9-5.5z" fill="#fff"/></svg>`,
  swap: color => `<svg class="play" viewBox="0 0 28 28" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10h12l-3-3M20 18H8l3 3"/></svg>`,
};

const sectionTitle = (text, right = '') => `<div class="section-title"><span>${text}</span><span>${right}</span></div>`;
const actionBtn = (action, icon, label, extra = '') =>
  `<button class="icon-btn" data-action="${action}" aria-label="${label}" ${extra}>${icon}</button>`;

function entryRow(e) {
  const job = jobById(e.jobId);
  const running = e.end == null;
  const range = `${fmtTime(e.start)} – ${running ? 'now' : fmtTime(e.end)}` +
    (e.breakMin ? ` · ${e.breakMin} min break` : '');
  return `<button class="row" data-action="edit-entry" data-id="${e.id}">
    <span class="bar" style="background:${jobColor(job)}"></span>
    <span class="grow">
      <span class="block">${esc(jobName(job))}</span>
      <span class="sub block">${range}</span>
      ${e.note ? `<span class="sub block clamp">${esc(e.note)}</span>` : ''}
    </span>
    <span class="right">
      <span class="block" ${running ? `data-live="entry" data-id="${e.id}"` : ''}>${fmtHours(duration(e))}</span>
      ${job && job.rate ? `<span class="sub block">${fmtMoney(earnings(e))}</span>` : ''}
    </span>
  </button>`;
}

/* ================= views ================= */

function renderTimer() {
  const run = runningEntry();
  let html = '';

  if (run) {
    const job = jobById(run.jobId);
    html += sectionTitle('Working now') + `
      <div class="group card">
        <div class="card-head">
          <span class="dot" style="background:${jobColor(job)}"></span>
          <b class="grow">${esc(jobName(job))}</b>
          <span class="sub">since ${fmtTime(run.start)}</span>
        </div>
        <div class="clock" data-live="clock">${fmtClock(duration(run))}</div>
        ${job && job.rate ? `<div class="sub center" data-live="earn">${fmtMoney(earnings(run))}</div>` : ''}
        <button class="btn danger" data-action="stop" style="margin-top:18px">
          <svg width="14" height="14" viewBox="0 0 14 14"><rect width="14" height="14" rx="2.5" fill="#fff"/></svg> Stop
        </button>
      </div>`;
  }

  if (!state.jobs.length) {
    html += `<div class="empty"><b>Welcome!</b>Add the jobs you work on, then tap one here to start the clock.
      <br><button class="btn" data-action="add-job">Add your first job</button></div>`;
    return { title: 'Work Hours', html };
  }

  html += sectionTitle(run ? 'Switch to' : 'Start working on') + '<div class="group">' +
    state.jobs.map(j => {
      const current = run && run.jobId === j.id;
      return `<button class="row" data-action="start" data-id="${j.id}" ${current ? 'disabled' : ''}>
        <span class="dot" style="background:${j.color}"></span>
        <span class="grow">${esc(j.name)}</span>
        ${current ? '<span class="sub">Running</span>' : (run ? icons.swap(j.color) : icons.play(j.color))}
      </button>`;
    }).join('') + '</div>';

  const today = startOfDay(Date.now());
  const todays = entriesBetween(today, addDays(today, 1)).sort((a, b) => b.start - a.start);
  if (todays.length) {
    html += sectionTitle('Today', `<span data-live="today">${fmtHours(sum(todays))}</span>`) +
      `<div class="group">${todays.map(entryRow).join('')}</div>`;
  }

  html += `<div class="group mt"><button class="row accent" data-action="add-entry">Add hours manually…</button></div>`;
  return { title: 'Work Hours', html };
}

function renderEntries() {
  const actions = actionBtn('add-entry', icons.plus, 'Add hours');
  if (!state.entries.length) {
    return {
      title: 'Entries', actions,
      html: `<div class="empty"><b>No entries yet</b>Start a timer, or tap + to add hours manually.</div>`,
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
    html += sectionTitle(dayLabel(day), fmtHours(sum(list))) +
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
        label: start.toLocaleDateString([], { month: 'narrow' }),
      });
    }
  } else {
    for (let t = range.start; t < range.end; t = addDays(t, 1)) {
      const d = new Date(t);
      const label = period === 'week'
        ? d.toLocaleDateString([], { weekday: 'short' })
        : (d.getDate() === 1 || d.getDate() % 5 === 0 ? String(d.getDate()) : '');
      buckets.push({ start: t, end: addDays(t, 1), label });
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
  const labels = buckets.map(b => `<span>${b.label}</span>`).join('');
  return `<div class="chart">${cols}</div><div class="chart-labels">${labels}</div>`;
}

function renderSummary() {
  const { period } = summary;
  const range = periodRange(period, summary.anchor);
  const list = entriesBetween(range.start, range.end);
  const total = sum(list);
  const totalEarnings = sumEarnings(list);

  const perJob = new Map();
  for (const e of list) {
    const key = jobById(e.jobId) ? e.jobId : undefined;
    const cur = perJob.get(key) || { ms: 0, earn: 0 };
    cur.ms += duration(e);
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
    <div class="group mt">
      <div class="stats">
        <div class="stat"><b>${fmtHours(total)}</b><span class="sub">Hours</span></div>
        ${totalEarnings > 0 ? `<div class="stat"><b>${fmtMoney(totalEarnings)}</b><span class="sub">Earnings</span></div>` : ''}
      </div>
      ${total > 0 ? chartHTML(period, range, list) : ''}
    </div>`;

  html += sectionTitle('By job');
  if (!jobRows.length) {
    html += '<div class="group"><div class="row sub">No hours in this period.</div></div>';
  } else {
    html += '<div class="group">' + jobRows.map(([id, v]) => {
      const job = jobById(id);
      return `<div class="row">
        <span class="dot" style="background:${jobColor(job)}"></span>
        <span class="grow">${esc(jobName(job))}
          <span class="progress block"><i style="width:${(v.ms / total) * 100}%;background:${jobColor(job)}"></i></span>
        </span>
        <span class="right">
          <span class="block">${fmtHours(v.ms)}</span>
          ${v.earn > 0 ? `<span class="sub block">${fmtMoney(v.earn)}</span>` : ''}
        </span>
      </div>`;
    }).join('') + '</div>';
  }

  const actions = actionBtn('export-period', icons.share, 'Export CSV', list.length ? '' : 'disabled');
  return { title: 'Summary', actions, html };
}

function renderJobs() {
  const actions = actionBtn('add-job', icons.plus, 'Add job');
  let html = '';

  if (!state.jobs.length) {
    html += `<div class="empty"><b>No jobs yet</b>Add the jobs you want to track hours for.
      <br><button class="btn" data-action="add-job">Add Job</button></div>`;
  } else {
    html += sectionTitle('Your jobs') + '<div class="group">' + state.jobs.map(j => {
      const total = sum(state.entries.filter(e => e.jobId === j.id));
      return `<button class="row" data-action="edit-job" data-id="${j.id}">
        <span class="dot" style="background:${j.color}"></span>
        <span class="grow">${esc(j.name)}
          ${j.rate ? `<span class="sub block">${fmtMoney(j.rate)} / h</span>` : ''}
        </span>
        <span class="sub right">${fmtHours(total)}</span>
        ${icons.chev}
      </button>`;
    }).join('') + '</div>';
  }

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
    so you can restore it if you switch phones or clear Safari's data.</p>`;

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
      ${isRunning ? '<label class="row field"><span class="grow">Still running</span><input type="checkbox" name="running" checked></label>' : ''}
      <label class="row field" data-end-row ${isRunning ? 'hidden' : ''}><span>End</span><input type="datetime-local" name="end" value="${toLocalInput(end)}"></label>
      <label class="row field"><span>Break (minutes)</span><input type="number" name="breakMin" min="0" max="600" step="5" inputmode="numeric" value="${entry ? entry.breakMin || 0 : 0}"></label>
    </div>
    <div class="group mt">
      <label class="row field"><textarea name="note" rows="2" placeholder="Note (optional)">${esc(entry ? entry.note || '' : '')}</textarea></label>
    </div>
    <div class="group mt"><div class="row"><span class="grow">Total</span><span class="right" data-total></span></div></div>
    <p class="error" data-error hidden></p>
    ${entry ? '<button type="button" class="btn plain danger-text mt" data-delete>Delete Entry</button>' : ''}`;

  const form = openSheet(entry ? 'Edit Entry' : 'Add Hours', body, f => {
    const el = f.elements;
    const running = el.running ? el.running.checked : false;
    const s = fromLocalInput(el.start.value);
    const e = running ? null : fromLocalInput(el.end.value);
    if (Number.isNaN(s)) return showError(f, 'Please choose a start time.'), false;
    if (!running && (Number.isNaN(e) || e <= s)) return showError(f, 'End must be after start.'), false;
    const data = {
      jobId: el.job.value,
      start: s,
      end: e,
      breakMin: Math.max(0, parseInt(el.breakMin.value, 10) || 0),
      note: el.note.value.trim(),
    };
    if (entry) Object.assign(entry, data);
    else state.entries.push({ id: uid(), ...data });
    save();
    render();
  });

  const el = form.elements;
  const updateTotal = () => {
    const running = el.running ? el.running.checked : false;
    const s = fromLocalInput(el.start.value);
    const e = running ? Date.now() : fromLocalInput(el.end.value);
    const ms = Math.max(0, e - s - (parseInt(el.breakMin.value, 10) || 0) * 60000);
    const job = jobById(el.job.value);
    $('[data-total]', form).textContent = Number.isNaN(ms) ? '–'
      : fmtHours(ms) + (job && job.rate ? ` · ${fmtMoney((ms / HOUR) * job.rate)}` : '');
    $('[data-end-row]', form).hidden = running;
  };
  form.addEventListener('input', updateTotal);
  form.addEventListener('change', updateTotal);
  updateTotal();

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
  const date = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const time = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const rows = [['Date', 'Job', 'Start', 'End', 'Break (min)', 'Hours', 'Earnings', 'Note'].join(',')];
  for (const e of [...list].sort((a, b) => a.start - b.start)) {
    rows.push([
      date(e.start), q(jobName(jobById(e.jobId))), time(e.start), e.end == null ? '' : time(e.end),
      e.breakMin || 0, (duration(e) / HOUR).toFixed(2), earnings(e).toFixed(2), q(e.note || ''),
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

const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

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
  const kind = ev.target.dataset.change;
  if (kind === 'currency') {
    state.settings.currency = ev.target.value;
    save();
    render();
  } else if (kind === 'import' && ev.target.files[0]) {
    importBackup(ev.target.files[0]);
    ev.target.value = '';
  }
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
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
