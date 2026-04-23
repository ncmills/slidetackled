// slidetackled.com — simple AIM-era toast generator.
// Single archive (toasts.md) drives POUR. Capstone (capstone.md) feeds a rotating ticker.

const state = {
  config: null,
  archive: [],        // pool the POUR button draws from
  capstone: [],       // feeds the ticker
  votes: {},          // { idx: { up, down } } keyed by archive index
  usedIndices: new Set(),
  currentIdx: null,
  sessionPourCount: 0,
  visitorNumber: null,
  globalPourCount: null,
  muted: true,
  view: 'main',       // 'main' | 'yell' | 'cli' | 'marquee' | 'away'
};

const TICKER_INTERVAL_MS = 5500;
let tickerTimer = null;
let tickerIdx = 0;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

async function boot() {
  let config, archive, capstone;
  try {
    [config, archive, capstone] = await Promise.all([
      loadJson('/config.json'),
      loadJson('/toasts.json'),
      loadJson('/capstone.json'),
    ]);
  } catch (err) {
    console.error(err);
    $('#toast').textContent = 'the bar is closed.';
    $('#toast').classList.add('is-empty');
    return;
  }
  state.config = config;
  state.archive = archive;
  state.capstone = capstone;

  // Prefs
  state.muted = localStorage.getItem('slidetackled:muted') !== 'false';
  state.sessionPourCount = Number(localStorage.getItem('slidetackled:pours:' + localDateKey())) || 0;
  state.visitorNumber = Number(localStorage.getItem('slidetackled:visitor')) || null;

  paintMuteIcon();
  bindUI();
  startTicker();
  renderCounters();
  renderFooter();
  await fetchVotesBulk();
  registerVisit();
  routeFromHash();
}

boot();

// ============================================================
// Helpers
// ============================================================

function localDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function utcDateKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ============================================================
// Ticker (rotating capstone)
// ============================================================

function startTicker() {
  const card = $('#ticker');
  const body = $('#ticker-body');
  if (!state.capstone.length) { card.hidden = true; return; }

  // FIX 2: only the quote body fades; the buddy name/status/label stay static so the
  //        card reads like a persistent buddy-info panel, not a rotating banner.
  const show = (i) => {
    body.style.opacity = '0';
    setTimeout(() => {
      body.textContent = state.capstone[i];
      body.style.opacity = '1';
    }, 200);
  };

  tickerIdx = Math.floor(Math.random() * state.capstone.length);
  show(tickerIdx);

  clearInterval(tickerTimer);
  tickerTimer = setInterval(() => {
    tickerIdx = (tickerIdx + 1) % state.capstone.length;
    show(tickerIdx);
  }, TICKER_INTERVAL_MS);
}

// ============================================================
// Rendering
// ============================================================

function renderFooter() {
  const poured = state.globalPourCount == null ? '…' : state.globalPourCount.toLocaleString();
  const visitor = state.visitorNumber == null ? '…' : state.visitorNumber.toLocaleString();
  $('#foot-visitor').textContent = `visitor #${visitor} · ${poured} poured`;
}

function renderCounters() {
  const total = state.archive.length;
  const used = state.usedIndices.size;
  $('#counter-main').textContent = state.currentIdx == null ? ' ' : `toast ${used} of ${total}`;
  $('#counter-session').textContent = `you: ${state.sessionPourCount} poured today`;
}

function renderToast(idx) {
  const toast = state.archive[idx];
  const el = $('#toast');
  const typing = $('#typing');
  const actions = $('#toast-actions');
  const ts = $('#msg-ts');

  // FIX 3: "Buddy is typing…" state before the toast lands. Selection already happened —
  //        this is only a display delay to sell the AIM "incoming IM" feel.
  el.classList.remove('is-empty');
  el.style.opacity = '0';
  el.textContent = '';
  actions.hidden = true;
  typing.hidden = false;

  setTimeout(() => {
    typing.hidden = true;
    el.textContent = toast;
    el.style.opacity = '1';
    actions.hidden = false;
    if (ts) ts.textContent = clockTime();

    // FIX 3: window-shake on new message (AIM attention cue).
    const win = $('#main-window');
    if (win) {
      win.classList.remove('shake');
      void win.offsetWidth;   // reflow so the animation can retrigger
      win.classList.add('shake');
      setTimeout(() => win.classList.remove('shake'), 500);
    }
  }, 520);

  state.currentIdx = idx;
  updateVoteUI();
  renderCounters();
}

function clockTime() {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

function setFlash(text) {
  const el = $('#flash');
  el.textContent = text;
  el.classList.add('is-visible');
  clearTimeout(setFlash._t);
  setFlash._t = setTimeout(() => el.classList.remove('is-visible'), 1500);
}

function paintMuteIcon() {
  $('#btn-mute').textContent = state.muted ? '🔇' : '🔊';
}

// ============================================================
// Votes
// ============================================================

function voteKey(idx) { return `slidetackled:voted:${idx}`; }
function localVote(idx) { return localStorage.getItem(voteKey(idx)); }

function updateVoteUI() {
  const idx = state.currentIdx;
  if (idx == null) return;
  const v = state.votes[idx] || { up: 0, down: 0 };
  $('#vote-up-count').textContent = v.up;
  $('#vote-down-count').textContent = v.down;
  const cast = localVote(idx);
  $('#btn-up').classList.toggle('is-cast', cast === 'up');
  $('#btn-down').classList.toggle('is-cast', cast === 'down');
}

async function fetchVotesBulk() {
  try {
    const res = await fetch('/api/votes', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    // Server returns { archive: {...}, ...} — we only use archive now.
    if (data && typeof data.archive === 'object') state.votes = data.archive;
  } catch {}
}

async function sendVote(idx, dir) {
  try {
    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'archive', idx, dir }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function onVote(dir) {
  const idx = state.currentIdx;
  if (idx == null) return;
  const existing = localVote(idx);
  if (existing === dir) return;

  const cur = state.votes[idx] || { up: 0, down: 0 };
  if (existing) cur[existing] = Math.max(0, (cur[existing] || 0) - 1);
  cur[dir] = (cur[dir] || 0) + 1;
  state.votes[idx] = cur;
  localStorage.setItem(voteKey(idx), dir);
  updateVoteUI();

  const result = await sendVote(idx, dir);
  if (result && typeof result.up === 'number') {
    state.votes[idx] = { up: result.up, down: result.down };
    updateVoteUI();
  }
}

// ============================================================
// Weighted random selection
// ============================================================

function weight(idx) {
  const v = state.votes[idx] || { up: 0, down: 0 };
  const net = (v.up || 0) - (v.down || 0);
  return Math.max(0.2, 1 + net * 0.3);
}

function pickIndex() {
  const n = state.archive.length;
  if (!n) return null;
  if (state.usedIndices.size >= n) state.usedIndices.clear();

  const candidates = [];
  const weights = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (state.usedIndices.has(i)) continue;
    const w = weight(i);
    candidates.push(i);
    weights.push(w);
    total += w;
  }
  if (!candidates.length) return null;

  let r = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// ============================================================
// POUR
// ============================================================

async function pour() {
  const idx = pickIndex();
  if (idx == null) {
    $('#toast').textContent = 'the bar is closed.';
    $('#toast').classList.add('is-empty');
    return;
  }
  state.usedIndices.add(idx);
  renderToast(idx);

  state.sessionPourCount += 1;
  localStorage.setItem('slidetackled:pours:' + localDateKey(), String(state.sessionPourCount));
  renderCounters();

  if (state.globalPourCount != null) state.globalPourCount += 1;
  renderFooter();
  try {
    const res = await fetch('/api/increment', { method: 'POST' });
    if (res.ok) {
      const { count } = await res.json();
      if (typeof count === 'number') { state.globalPourCount = count; renderFooter(); }
    }
  } catch {}
  playClink();
}

function playClink() {
  if (state.muted) return;
  const a = new Audio('/audio/clink.mp3');
  a.volume = 0.5;
  a.play().catch(() => {
    const b = new Audio('/audio/clink.wav');
    b.volume = 0.5;
    b.play().catch(() => {});
  });
}

// ============================================================
// Visit registration + global count
// ============================================================

async function registerVisit() {
  const todayKey = `slidetackled:visited:${utcDateKey()}`;
  const already = localStorage.getItem(todayKey) === '1';
  try {
    const res = await fetch('/api/visit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstToday: !already }),
    });
    if (res.ok) {
      const { visitor, pours } = await res.json();
      if (typeof visitor === 'number') {
        state.visitorNumber = visitor;
        localStorage.setItem('slidetackled:visitor', String(visitor));
      }
      if (typeof pours === 'number') state.globalPourCount = pours;
      if (!already) localStorage.setItem(todayKey, '1');
      renderFooter();
    }
  } catch {}
}

// ============================================================
// PIN (copy toast / copy link)
// ============================================================

function copy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-10000px';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
  return Promise.resolve();
}

function setupPin() {
  const btn = $('#btn-pin');
  let holdTimer = null;
  let didHold = false;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    didHold = false;
    holdTimer = setTimeout(() => {
      didHold = true;
      const url = `${location.origin}/#toast=${state.currentIdx}`;
      copy(url).then(() => setFlash('link copied'));
    }, 500);
  });
  const clear = () => clearTimeout(holdTimer);
  btn.addEventListener('pointerup', (e) => {
    e.preventDefault();
    clear();
    if (didHold) return;
    if (state.currentIdx == null) return;
    copy(state.archive[state.currentIdx]).then(() => setFlash('copied'));
  });
  btn.addEventListener('pointercancel', clear);
  btn.addEventListener('pointerleave', clear);
}

// ============================================================
// Yell mode
// ============================================================

function enterYell() {
  if (!state.config?.EASTER_EGGS?.yellMode) return;
  if (state.currentIdx == null) {
    const idx = pickIndex();
    if (idx == null) return;
    state.usedIndices.add(idx);
    state.currentIdx = idx;
  }
  $('#yell-text').textContent = state.archive[state.currentIdx];
  $('#yell').hidden = false;
  state.view = 'yell';
  const hint = $('#yell-hint');
  hint.classList.remove('is-faded');
  setTimeout(() => hint.classList.add('is-faded'), 2000);
}

function exitOverlay() {
  $('#yell').hidden = true;
  $('#cli').hidden = true;
  $('#marquee').hidden = true;
  $('#away').hidden = true;
  state.view = 'main';
  const h = location.hash;
  if (h === '#yell' || h === '#cli' || h === '#marquee' || h === '#away') {
    history.replaceState(null, '', location.pathname);
  }
}

function setupPourHold() {
  const btn = $('#pour');
  let holdTimer = null;
  btn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    holdTimer = setTimeout(() => { holdTimer = null; enterYell(); }, 2000);
  });
  const clear = () => { if (holdTimer) clearTimeout(holdTimer); };
  btn.addEventListener('pointerup', clear);
  btn.addEventListener('pointerleave', clear);
  btn.addEventListener('pointercancel', clear);
}

// ============================================================
// CLI
// ============================================================

function enterCLI() {
  if (!state.config?.EASTER_EGGS?.cli) return;
  $('#cli').hidden = false;
  state.view = 'cli';
  const buf = $('#cli-buffer');
  if (!buf.dataset.inited) {
    printLine('slidetackled v1.0 — type \'help\' for commands');
    buf.dataset.inited = '1';
  }
  setTimeout(() => $('#cli-input').focus(), 10);
}
function printLine(text, cls = '') {
  const line = document.createElement('div');
  line.className = 'line' + (cls ? ' ' + cls : '');
  line.textContent = text;
  const buf = $('#cli-buffer');
  buf.appendChild(line);
  buf.scrollTop = buf.scrollHeight;
}

const cliHistory = [];
let cliHistIdx = -1;

function cliExec(raw) {
  printLine('> ' + raw, 'cmd');
  cliHistory.push(raw);
  cliHistIdx = cliHistory.length;
  const parts = raw.trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const args = parts.slice(1);
  if (cmd === '') return;
  if (cmd === 'help') {
    printLine('commands:');
    printLine('  pour [N]      random toast(s)');
    printLine('  show INDEX    show toast by index');
    printLine('  search Q      list matches');
    printLine('  count         total');
    printLine('  exit          back (or press Esc)');
    return;
  }
  if (cmd === 'pour') {
    const n = Math.max(1, Math.min(50, parseInt(args[0] || '1', 10) || 1));
    if (!state.archive.length) { printLine('  (empty)', 'err'); return; }
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * state.archive.length);
      printLine('  ' + state.archive[idx].replace(/\n/g, '\n  '));
    }
    return;
  }
  if (cmd === 'show') {
    const idx = parseInt(args[0], 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= state.archive.length) { printLine('  out of range', 'err'); return; }
    printLine('  ' + state.archive[idx].replace(/\n/g, '\n  '));
    return;
  }
  if (cmd === 'search') {
    const q = args.join(' ').toLowerCase();
    if (!q) { printLine('  usage: search QUERY', 'err'); return; }
    const hits = [];
    for (let i = 0; i < state.archive.length; i++) if (state.archive[i].toLowerCase().includes(q)) hits.push(i);
    if (!hits.length) { printLine('  no matches'); return; }
    printLine(`  ${hits.length} match${hits.length === 1 ? '' : 'es'}:`);
    hits.slice(0, 20).forEach(i => printLine(`  [${i}] ` + state.archive[i].replace(/\n/g, ' / ').slice(0, 80)));
    if (hits.length > 20) printLine(`  …and ${hits.length - 20} more`);
    return;
  }
  if (cmd === 'count') { printLine(`  ${state.archive.length} toasts`); return; }
  if (cmd === 'exit' || cmd === 'quit') { exitOverlay(); return; }
  printLine(`  unknown command: ${cmd}. try 'help'.`, 'err');
}

function setupCLI() {
  const input = $('#cli-input');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const v = input.value; input.value = ''; cliExec(v); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cliHistory.length && cliHistIdx > 0) { cliHistIdx--; input.value = cliHistory[cliHistIdx]; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cliHistIdx < cliHistory.length - 1) { cliHistIdx++; input.value = cliHistory[cliHistIdx]; }
      else { cliHistIdx = cliHistory.length; input.value = ''; }
    }
  });
}

// ============================================================
// Marquee
// ============================================================

let marqueeDuration = 180;
function enterMarquee() {
  if (!state.config?.EASTER_EGGS?.marquee) return;
  const text = state.archive.map(t => t.replace(/\n/g, ' ')).join('   ·   ');
  $('#marquee-track').textContent = text + '   ·   ';
  $('#marquee').style.setProperty('--marquee-duration', marqueeDuration + 's');
  $('#marquee').hidden = false;
  state.view = 'marquee';
}

// ============================================================
// Away
// ============================================================

function enterAway() {
  if (!state.config?.EASTER_EGGS?.awayMessage) return;
  if (state.archive.length) {
    const idx = Math.floor(Math.random() * state.archive.length);
    $('#aim-msg').textContent = state.archive[idx];
  } else {
    $('#aim-msg').textContent = 'brb';
  }
  $('#away').hidden = false;
  state.view = 'away';
}

// ============================================================
// Hash routing (Easter egg modes + deep-link)
// ============================================================

function routeFromHash() {
  const h = location.hash.slice(1);
  const mDeep = h.match(/^toast=(\d+)$/);
  if (mDeep) {
    const idx = parseInt(mDeep[1], 10);
    if (idx >= 0 && idx < state.archive.length) {
      state.usedIndices.add(idx);
      renderToast(idx);
      return;
    }
  }
  if (h === 'yell' || location.pathname === '/yell') { enterYell(); return; }
  if (h === 'cli' || location.pathname === '/cli') { enterCLI(); return; }
  if (h === 'marquee' || location.pathname === '/marquee') { enterMarquee(); return; }
  if (h === 'away' || location.pathname === '/away') { enterAway(); return; }
}

// ============================================================
// UI binding
// ============================================================

function bindUI() {
  $('#pour').addEventListener('click', pour);
  setupPourHold();
  setupPin();
  setupCLI();

  $('#btn-up').addEventListener('click', () => onVote('up'));
  $('#btn-down').addEventListener('click', () => onVote('down'));

  $('#btn-mute').addEventListener('click', () => {
    state.muted = !state.muted;
    localStorage.setItem('slidetackled:muted', String(state.muted));
    paintMuteIcon();
  });

  document.addEventListener('keydown', (e) => {
    if (state.view === 'main') {
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pour(); }
      else if (e.key === 'y' || e.key === 'Y') { enterYell(); }
      else if (e.key === '~' || e.key === '`') { enterCLI(); }
    } else if (state.view === 'marquee') {
      if (e.key === '+' || e.key === '=') { marqueeDuration = Math.max(30, marqueeDuration - 20); $('#marquee').style.setProperty('--marquee-duration', marqueeDuration + 's'); }
      else if (e.key === '-' || e.key === '_') { marqueeDuration += 20; $('#marquee').style.setProperty('--marquee-duration', marqueeDuration + 's'); }
      else if (e.key === 'Escape') exitOverlay();
    } else if (state.view === 'yell' || state.view === 'away' || state.view === 'cli') {
      if (e.key === 'Escape') exitOverlay();
    }
  });

  $('#yell').addEventListener('click', exitOverlay);
  $('#away').addEventListener('click', (e) => {
    if (e.target === $('#away') || e.target.classList.contains('aim-x')) exitOverlay();
  });
  $('#marquee').addEventListener('click', exitOverlay);

  window.addEventListener('hashchange', routeFromHash);
}
