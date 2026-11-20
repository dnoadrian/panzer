// PANZER – Lobby: Konto, Party, Freunde, Spind, Fähigkeiten, Shop, Admin
'use strict';
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const lerpAng = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
const coinSvg = () => '<svg><use href="#i-coin"/></svg>';

// ================= Lokale Daten =================
const PROFILE = (new URLSearchParams(location.search).get('profil') || '').replace(/[^a-z0-9]/gi, '').slice(0, 10);
const KEY = (k) => 'pz' + (PROFILE ? '-' + PROFILE : '') + '-' + k;
function load(k, def) { try { const v = localStorage.getItem(KEY(k)); return v == null ? def : JSON.parse(v); } catch { return def; } }
function save(k, v) { try { localStorage.setItem(KEY(k), JSON.stringify(v)); } catch { /* egal */ } }
function newPid() { const a = new Uint8Array(14); crypto.getRandomValues(a); return Array.from(a, b => (b % 36).toString(36)).join(''); }
const local = { pid: load('pid', null), name: load('name', ''), tut: load('tut', false), sound: load('sound', true), recent: load('recent', []) };
if (!local.pid || !/^[a-z0-9]{8,40}$/.test(local.pid)) { local.pid = newPid(); save('pid', local.pid); }
// Daten vom Server
let prof = { rp: 0, coins: 0, owned: [], equip: { ...CAT.DEFAULT_EQUIP }, ability: 'turbo', stats: {}, cheats: {} };
let shop = { items: [], nextIn: 0, at: 0 };

// ================= Sound (selbst erzeugt) =================
// Kette: Stimmen -> Bus -> Kompressor -> Lautsprecher, dazu ein leiser Hall-Weg
let actx = null, master = null, verbIn = null, voices = 0;
function ac() {
  if (!local.sound) return null;
  if (!actx) {
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.18;
    master = actx.createGain(); master.gain.value = 0.9;
    master.connect(comp).connect(actx.destination);
    // kurzer Raumhall aus gefiltertem Rauschen
    const len = Math.floor(actx.sampleRate * 1.3), ir = actx.createBuffer(2, len, actx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const conv = actx.createConvolver(); conv.buffer = ir;
    const wet = actx.createGain(); wet.gain.value = 0.22;
    const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
    verbIn = actx.createGain(); verbIn.connect(hp).connect(conv).connect(wet).connect(master);
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
const volMul = () => (typeof settings !== 'undefined' ? settings.vol / 100 : 0.8);
const vary = (f, amt = 0.06) => f * (1 + (Math.random() * 2 - 1) * amt);
// Hülle mit kurzem Einschwingen (kein Knacksen)
function env(g, t0, vol, dur, attack) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(attack + 0.01, dur));
}
function out(a, node, o) {
  node.connect(master);
  if (o.verb && verbIn) { const s = a.createGain(); s.gain.value = o.verb; node.connect(s).connect(verbIn); }
}
function tone(freq, dur, type = 'square', vol = 0.1, slide = 0, delay = 0, o = {}) {
  vol *= volMul();
  const a = ac(); if (!a || vol <= 0.003 || voices > 48) return;
  const t0 = a.currentTime + delay, osc = a.createOscillator(), g = a.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t0);
  if (o.detune) osc.detune.value = o.detune;
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(25, freq + slide), t0 + dur * (o.slideAt || 1));
  env(g, t0, vol, dur, o.attack || 0.004);
  let node = osc;
  if (o.lp) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.7; node = node.connect(f); }
  node.connect(g); out(a, g, o);
  voices++; osc.onended = () => { voices--; };
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}
let noiseBuf = null;
function noise(dur, vol, freq = 1000, delay = 0, o = {}) {
  vol *= volMul();
  const a = ac(); if (!a || vol <= 0.003 || voices > 48) return;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t0 = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(freq, t0); f.Q.value = o.q || (o.type === 'bandpass' ? 1.4 : 0.7);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  env(g, t0, vol, dur, o.attack || 0.003);
  s.connect(f).connect(g); out(a, g, o);
  voices++; s.onended = () => { voices--; };
  s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.03);
}
const sfx = {
  // Papier-Kanone: tiefer Stoß, Knall, kurzes Klicken
  shot: (v = 1) => { const p = vary(1); tone(150 * p, 0.16, 'sine', 0.32 * v, -105); noise(0.1, 0.24 * v, 2200 * p, 0, { to: 500 }); tone(330 * p, 0.05, 'triangle', 0.08 * v, -150); noise(0.025, 0.08 * v, 5000, 0, { type: 'highpass' }); },
  bigshot: (v = 1) => { tone(110, 0.3, 'sine', 0.35 * v, -60); noise(0.45, 0.28 * v, 500, 0, { type: 'bandpass', to: 2600, q: 0.9, verb: 0.3 }); noise(0.12, 0.2 * v, 1500); },
  hit: () => { tone(vary(1900, 0.03), 0.05, 'triangle', 0.15); tone(2850, 0.07, 'sine', 0.08, 0, 0.025); noise(0.03, 0.06, 7000, 0, { type: 'highpass' }); },
  kill: () => { tone(120, 0.22, 'sine', 0.35, -70); noise(0.1, 0.16, 3000); [1319, 1661, 1976].forEach((f, i) => tone(f, 0.28, 'triangle', 0.1, 0, 0.05 + i * 0.07, { verb: 0.5 })); },
  hurt: () => { tone(190, 0.2, 'sawtooth', 0.1, -110, 0, { lp: 900 }); noise(0.14, 0.18, 700, 0, { to: 200 }); },
  boom: (v = 1) => { tone(62, 0.65, 'sine', 0.42 * v, -32); noise(0.9, 0.42 * v, 1200, 0, { to: 160, verb: 0.35 }); for (let i = 0; i < 3; i++) noise(0.04, 0.12 * v, 4500, 0.05 + i * 0.07 + Math.random() * 0.04, { type: 'highpass' }); },
  bush: (v = 1) => { for (let i = 0; i < 3; i++) noise(0.07, 0.11 * v, vary(3200, 0.2), i * 0.045, { type: 'bandpass', q: 0.8 }); },
  dirt: (v = 1) => { noise(0.1, 0.15 * v, 600, 0, { to: 180 }); },
  wood: (v = 1) => { tone(vary(240, 0.08), 0.07, 'triangle', 0.13 * v, -60); noise(0.05, 0.12 * v, 1300, 0, { type: 'bandpass', q: 2 }); },
  pick: () => { tone(660, 0.08, 'triangle', 0.1); tone(990, 0.12, 'triangle', 0.1, 0, 0.06, { verb: 0.4 }); },
  zone: () => { [110, 110 * 1.007, 164.8].forEach((f) => tone(f, 1.3, 'sawtooth', 0.06, -20, 0, { lp: 420, attack: 0.25, verb: 0.5 })); tone(880, 0.25, 'sine', 0.05, -200, 0.1); },
  tick: () => tone(1250, 0.05, 'sine', 0.07),
  go: () => { [392, 494, 587].forEach((f) => tone(f, 0.14, 'sawtooth', 0.05, 0, 0, { lp: 1800 })); [523, 659, 784].forEach((f) => tone(f, 0.4, 'sawtooth', 0.05, 0, 0.14, { lp: 2200, verb: 0.4 })); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, 0, i * 0.12, { verb: 0.5 })); [523, 659, 784, 1047].forEach((f) => tone(f, 1.2, 'sawtooth', 0.035, 0, 0.5, { lp: 1600, attack: 0.05, verb: 0.6 })); },
  click: () => { tone(vary(880, 0.04), 0.05, 'sine', 0.09, -280); noise(0.015, 0.04, 6000, 0, { type: 'highpass' }); },
  deny: () => { tone(180, 0.16, 'square', 0.06, -30, 0, { lp: 700 }); tone(140, 0.2, 'square', 0.06, -20, 0.12, { lp: 700 }); },
  block: () => { [1230, 1790, 2470].forEach((f, i) => tone(vary(f, 0.02), 0.28 - i * 0.06, 'sine', 0.08, 0, 0, { verb: 0.3 })); noise(0.03, 0.1, 5000, 0, { type: 'highpass' }); },
  blockOn: () => { tone(300, 0.22, 'sine', 0.1, 600); tone(600, 0.25, 'triangle', 0.04, 900, 0.03, { verb: 0.3 }); },
  jump: () => { noise(0.6, 0.16, 600, 0, { type: 'bandpass', to: 2400, q: 0.7 }); tone(700, 0.4, 'sine', 0.06, -400); },
  land: () => { noise(0.3, 0.32, 900, 0, { to: 150 }); tone(95, 0.22, 'sine', 0.3, -50); },
  fall: (v = 1) => { tone(1300, 1.1, 'sine', 0.11 * v, -1050, 0, { verb: 0.4 }); },
  heal: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, 0, i * 0.07, { verb: 0.5 })); noise(0.3, 0.04, 8000, 0.1, { type: 'highpass' }); },
  ability: () => { tone(380, 0.22, 'sine', 0.1, 900); tone(1200, 0.18, 'triangle', 0.06, 400, 0.08, { verb: 0.5 }); noise(0.2, 0.05, 6000, 0.05, { type: 'highpass' }); },
  heart: () => { tone(62, 0.12, 'sine', 0.38); tone(55, 0.14, 'sine', 0.3, 0, 0.18); },
  buy: () => { [1568, 2093, 2637].forEach((f, i) => tone(f, 0.16, 'triangle', 0.09, 0, i * 0.06)); tone(784, 0.5, 'sine', 0.08, 0, 0.18, { verb: 0.6 }); noise(0.2, 0.06, 7000, 0.2, { type: 'highpass' }); },
  emp: () => { tone(220, 0.5, 'sawtooth', 0.09, 1200, 0, { lp: 3000 }); noise(0.35, 0.12, 2500, 0, { type: 'bandpass', to: 6000, verb: 0.3 }); },
};

// ================= Verbindung =================
let ws = null, loggedIn = false, kicked = false;
const me = { pid: local.pid, name: '' };
let party = null, friends = { list: [], req: [] }, messages = [], queueInfo = null;

function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { if (local.name) login(); else showLogin(); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = () => {
    loggedIn = false;
    if (kicked) return;
    if (inGame) exitGame();
    if (local.name) { show('login'); $('loginMsg').textContent = 'Verbinde neu ...'; }
    setTimeout(connect, 1500);
  };
}
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function login() {
  const legacyRp = load('rp', null);
  send({ t: 'login', pid: local.pid, name: local.name, backup: load('backup', null), legacy: legacyRp != null ? { rp: legacyRp, skin: load('skin', null) } : null });
}

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      loggedIn = true; me.name = m.name; $('btnName').textContent = m.name; $('loginMsg').textContent = '';
      local.name = m.name; save('name', m.name); loginMode = 'login';
      if (load('rp', null) != null) { try { localStorage.removeItem(KEY('rp')); } catch { /* egal */ } }
      if (!inGame) show('lobby');
      break;
    case 'nameTaken':
      if (!m.rename) { local.name = ''; save('name', ''); }
      loginMode = m.rename ? 'rename' : 'login';
      showLogin(m.reason || `Der Name „${m.name}“ ist schon vergeben. Bitte wähle einen anderen.`, m.rename ? 'Speichern' : 'Weiter', true);
      $('nameInput').value = m.name; $('nameInput').select();
      break;
    case 'profile': prof = m; renderTop(); renderLocker(); renderAbilities(); renderShop(); break;
    case 'backup': save('backup', { data: m.data, sig: m.sig }); break;
    case 'shop': shop = { items: m.items, nextIn: m.nextIn, at: performance.now() }; renderShop(); break;
    case 'bought': sfx.buy(); toast(`${CAT.ITEM_BY_ID[m.id].name} gehört jetzt dir und ist ausgerüstet!`); break;
    case 'party': party = m; renderParty(); renderFriends(); break;
    case 'friends': friends = m; renderFriends(); break;
    case 'invite': showInvite(m); break;
    case 'toast': toast(m.msg); break;
    case 'messages': messages = m.list; renderMessages(); break;
    case 'queue': queueInfo = m; renderQueue(); break;
    case 'kicked':
      kicked = true; loggedIn = false; if (inGame) exitGame();
      showLogin('PANZER ist in einem anderen Fenster geöffnet.', 'Hier spielen');
      break;
    case 'accountDeleted':
      for (const k of ['pid', 'name', 'rp', 'skin', 'friends', 'recent', 'tut', 'settings', 'xp', 'backup']) { try { localStorage.removeItem(KEY(k)); } catch { /* egal */ } }
      kicked = true;
      showLogin('Dein Konto wurde gelöscht.', 'Neu anfangen');
      setTimeout(() => location.reload(), 1800);
      break;
    case 'matchStart': startGame(m); break;
    case 's': onState(m); break;
    case 'dead': onDead(m); break;
    case 'result': onResult(m); break;
    case 'lobby': exitGame(); break;
    case 'poi': showPoi(m.name); break;
    case 'adminOk': $('adminLogin').classList.add('hidden'); $('adminPanel').classList.remove('hidden'); break;
    case 'adminFail': $('adMsg').textContent = m.msg; break;
    case 'adminData': adminData = m; renderAdmin(); break;
  }
}

// ================= Bildschirme =================
let screen = 'login';
function show(name) {
  screen = name;
  for (const s of ['login', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== name);
  if (name !== 'lobby') $('drawer').classList.remove('open');
  if (name === 'lobby') { renderTop(); renderParty(); }
}
function toast(text) {
  if (!text) return;
  const d = el('div', 'toast', text);
  $('toasts').appendChild(d); setTimeout(() => d.remove(), 3800);
}

// ---------- Name ----------
let loginMode = 'login';
function showLogin(msg = '', button = 'Weiter', isError = false) {
  show('login');
  $('loginMsg').textContent = msg; $('loginMsg').style.color = isError ? '#d9332a' : '';
  $('btnLogin').textContent = button;
  $('nameInput').value = local.name || '';
  setTimeout(() => $('nameInput').focus(), 50);
}
function submitName() {
  if (kicked) { kicked = false; $('btnLogin').textContent = 'Weiter'; $('loginMsg').textContent = 'Verbinde ...'; connect(); return; }
  const n = $('nameInput').value.trim();
  if (n.length < 2) { $('loginMsg').textContent = 'Bitte gib einen Namen mit mindestens 2 Zeichen ein.'; $('loginMsg').style.color = '#d9332a'; return; }
  $('loginMsg').style.color = '';
  if (loginMode === 'rename' && loggedIn) {
    if (n === me.name) { show('lobby'); loginMode = 'login'; return; }
    send({ t: 'rename', name: n }); $('loginMsg').textContent = 'Prüfe Namen ...'; return;
  }
  local.name = n;
  if (ws && ws.readyState === 1) { login(); $('loginMsg').textContent = 'Prüfe Namen ...'; }
  else $('loginMsg').textContent = 'Verbinde ...';
}
$('btnLogin').onclick = submitName;
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitName(); });
$('btnName').onclick = () => { loginMode = 'rename'; showLogin('', 'Speichern'); };

// ---------- Leiste oben ----------
function renderTop() {
  $('coinCount').textContent = prof.coins;
  const ri = CAT.rankInfo(prof.rp);
  const c = $('rankIcon'), x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
  drawRankIcon(x, ri.idx, c.width / 2, c.height * 0.42, c.width * 0.66);
  $('rankName').textContent = ri.rank.name;
  $('rankBar').style.width = (ri.pct * 100).toFixed(1) + '%';
  $('rankText').textContent = ri.last ? `${ri.rest} RP` : `${ri.rest} / ${ri.need} RP`;
}
const ICON_SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5c1.3 1.8 1.3 5.2 0 7M19 6c2.6 3.3 2.6 8.7 0 12"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
function renderSoundBtn() { $('btnSound').innerHTML = local.sound ? ICON_SOUND_ON : ICON_SOUND_OFF; }
$('btnSound').onclick = () => { local.sound = !local.sound; save('sound', local.sound); renderSoundBtn(); sfx.click(); };
renderSoundBtn();

// Vollbild – im Vollbild werden auch Strg+W & Co. abgefangen (Chrome/Edge)
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => {
      if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock().catch(() => {});
    }).catch(() => toast('Vollbild ist hier nicht erlaubt.'));
  } else document.exitFullscreen().catch(() => {});
}
$('btnFull').onclick = () => { sfx.click(); toggleFullscreen(); };
// Schließen der Seite während einer Runde verhindern
addEventListener('beforeunload', (e) => { if (inGame && G.cur && G.cur.me.alive) { e.preventDefault(); e.returnValue = ''; } });

// ---------- Tabs ----------
let tab = 'stage';
const TAB_PAGES = { locker: 'tabLocker', abilities: 'tabAbilities', shop: 'tabShop' };
function setTab(t) {
  if (t === 'settings') { openSettings(); return; }
  tab = t;
  for (const o of document.querySelectorAll('.tab')) o.classList.toggle('on', o.dataset.tab === t);
  for (const [k, id] of Object.entries(TAB_PAGES)) $(id).classList.toggle('hidden', k !== t);
  $('playbox').classList.toggle('hidden', t !== 'stage');
  renderParty();
  if (t === 'locker') renderLocker(); if (t === 'abilities') renderAbilities(); if (t === 'shop') renderShop();
}
for (const b of document.querySelectorAll('.tab')) b.onclick = () => { sfx.click(); setTab(b.dataset.tab); };

// ---------- Vorschau-Bilder (animiert) ----------
const PREV_BG = { skin: ['#e6efff', '#c9d9f7'], hat: ['#fff0d8', '#f6d9a8'], tracer: ['#e2f4d4', '#bfe3a6'], finisher: ['#f1e4ff', '#d7c0f2'] };
// t = Zeit in Sekunden (animiert) oder null (Standbild)
function previewItem(cv, it, w, h, t = null) {
  const x = cv.getContext('2d'), s = 2;
  if (cv.width !== w * s || cv.height !== h * s) { cv.width = w * s; cv.height = h * s; }
  x.setTransform(s, 0, 0, s, 0, 0); x.clearRect(0, 0, w, h);
  const still = t == null; if (still) t = 1.15;
  const m = Math.min(w, h), eq = { ...prof.equip };
  // kleine Papier-Bühne
  const [c0, c1] = PREV_BG[it.cat] || PREV_BG.skin;
  x.save(); x.beginPath(); x.roundRect(3, 3, w - 6, h - 6, Math.min(16, m * 0.14)); x.clip();
  const g = x.createRadialGradient(w / 2, h * 0.42, m * 0.08, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, c0); g.addColorStop(1, c1); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalAlpha = 0.22; x.fillStyle = '#ffffff';
  const rr = rng(hashStr(it.id));
  for (let i = 0; i < 7; i++) { const px = rr() * w, py = rr() * h; x.beginPath(); x.arc(px, py, 2 + rr() * m * 0.05, 0, 7); x.fill(); }
  x.globalAlpha = 1; x.restore();
  if (it.cat === 'skin' || it.cat === 'hat') {
    const hat = it.cat === 'hat', k = m / (hat ? 58 : 62), cx = w / 2, cy = h * (hat ? 0.6 : 0.54) + Math.sin(t * 2.2) * m * 0.012;
    x.fillStyle = 'rgba(58,48,70,.13)'; x.beginPath(); x.ellipse(cx + 3 * k, cy + 21 * k, 30 * k, 7 * k, 0, 0, 7); x.fill();
    drawTank(x, cx, cy, -0.3 + Math.sin(t * 0.6) * 0.12, -0.9 + Math.sin(t * 1.3) * 0.55, hat ? { skin: eq.skin, hat: it.id } : { skin: it.id, hat: 'keiner' }, hashStr(it.id), { scale: k, t, roll: t * 9 });
  } else if (it.cat === 'tracer') {
    // Kugel fliegt quer über die Bühne in eine Zielscheibe
    const sc = Math.min(w / 92, h / 52), a = -0.32, P = 1.6, ph = still ? 0.55 : (t % P) / P, fly = 0.78;
    const tx = w - Math.max(18, m * 0.15), ty = h / 2 + Math.tan(a) * (tx - w / 2) * 0.8;
    const yAt = (px) => ty + Math.tan(a) * (px - tx), x0 = -20 * sc;
    const tr = Math.max(10, m * 0.09), hit = ph > fly ? (ph - fly) / (1 - fly) : 0;
    x.save(); x.translate(tx, ty); x.scale(1 + (hit ? Math.sin(hit * Math.PI) * 0.15 : 0), 1 + (hit ? Math.sin(hit * Math.PI) * 0.15 : 0));
    paper(x, C(0, 0, tr), '#ffffff', { border: 2 }); paper(x, C(0, 0, tr * 0.66), '#ff6b5a', { border: 0, shadow: false }); paper(x, C(0, 0, tr * 0.3), '#ffffff', { border: 0, shadow: false });
    x.restore();
    x.save(); x.beginPath(); x.roundRect(3, 3, w - 6, h - 6, Math.min(16, m * 0.14)); x.clip();
    if (ph <= fly) {
      const hx = x0 + (tx - x0) * (ph / fly), hy = yAt(hx);
      x.translate(hx, hy); x.scale(sc, sc);
      drawTracer(x, it.id, 0, 0, a, '#f2b705', t, 0);
      x.fillStyle = INK; x.beginPath(); x.ellipse(0, 0, 7.5, 5, a, 0, 7); x.fill(); x.fillStyle = '#f2b705'; x.beginPath(); x.ellipse(0, 0, 5, 3, a, 0, 7); x.fill();
    } else { // Treffer-Puff
      x.globalAlpha = 1 - hit; x.strokeStyle = '#ffffff'; x.lineWidth = 3;
      x.beginPath(); x.arc(tx, ty, tr + hit * tr * 1.6, 0, 7); x.stroke();
      x.fillStyle = '#ffd84a'; for (let i = 0; i < 6; i++) { const aa = i / 6 * 6.28, d = tr + hit * tr * 1.4; x.beginPath(); x.arc(tx + Math.cos(aa) * d, ty + Math.sin(aa) * d, 2.5 * (1 - hit) + 0.5, 0, 7); x.fill(); }
    }
    x.restore();
  } else if (it.cat === 'finisher') drawFinisherPreview(x, it.id, w / 2, h * 0.54, m, still ? 0.5 : (t % 2.2) / 2.2, t);
}
const easeOut = (p) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
function heartPath(px, py, s) { return B([[px, py + s * 1.2], [px - s * 1.3, py], [px - s, py - s], [px, py - s * 0.35], [px + s, py - s], [px + s * 1.3, py]]); }
function starPath(px, py, s, rot = 0) { const p = []; for (let k = 0; k < 10; k++) { const aa = rot - Math.PI / 2 + k * Math.PI / 5, r2 = k % 2 ? s * 0.45 : s; p.push([px + Math.cos(aa) * r2, py + Math.sin(aa) * r2]); } return P(p); }
// Finisher-Vorschau: kleiner Papp-Panzer wird getroffen, dann spielt der Effekt
function drawFinisherPreview(x, id, cx, cy, m, p, t) {
  const r = rng(hashStr(id)), hit = 0.22, e = easeOut((p - hit) / (1 - hit)), fade = 1 - Math.max(0, (p - 0.75) / 0.25);
  const k = m / 80;
  if (p < hit) { // Ziel wackelt
    const sh = Math.sin(p * 120) * 1.5 * (p / hit);
    drawTank(x, cx + sh, cy + 4 * k, -0.3, -1, { skin: 'blau', hat: 'keiner' }, 3, { scale: k, t, alpha: 0.9 });
    return;
  }
  if (p < hit + 0.06) { x.fillStyle = 'rgba(255,255,255,.9)'; x.beginPath(); x.arc(cx, cy, m * 0.36 * ((p - hit) / 0.06), 0, 7); x.fill(); }
  x.save(); x.globalAlpha = fade;
  const cols = { feuerwerk: ['#ff6b5a', '#ffcf3f', '#4f8ff0', '#63d07a', '#c86bff'], konfetti: ['#ff6b5a', '#ffcf3f', '#4f8ff0', '#9b6be0', '#63d07a'], herzregen: ['#ff5c8a', '#ff8fb1'], sternschnuppe: ['#ffd84a', '#fff1a8'], 'standard-boom': ['#ffcf3f', '#ff8a4c', '#ff5a3c'] }[id] || ['#ffcf3f'];
  const R = m * 0.42;
  switch (id) {
    case 'geist': {
      const gy = cy - e * m * 0.3, wob = Math.sin(t * 6) * 4;
      x.globalAlpha = fade * 0.95;
      paper(x, B([[cx - 16 * k + wob, gy + 18 * k], [cx - 18 * k, gy - 6 * k], [cx, gy - 24 * k], [cx + 18 * k, gy - 6 * k], [cx + 16 * k + wob, gy + 18 * k], [cx + 8 * k, gy + 12 * k + wob * 0.5], [cx, gy + 18 * k], [cx - 8 * k, gy + 12 * k - wob * 0.5]]), '#ffffff', { border: 2.5 });
      x.fillStyle = INK; x.beginPath(); x.arc(cx - 6 * k, gy - 5 * k, 2.6 * k, 0, 7); x.arc(cx + 6 * k, gy - 5 * k, 2.6 * k, 0, 7); x.fill();
      x.beginPath(); x.ellipse(cx, gy + 4 * k, 3 * k, 4 * k * (0.6 + Math.sin(t * 9) * 0.3), 0, 0, 7); x.fill();
      break;
    }
    case 'papierball': {
      const bounce = Math.abs(Math.sin(e * Math.PI * 2.5)) * (1 - e) * m * 0.28, rad = m * 0.17 * (1 - e * 0.35);
      x.fillStyle = 'rgba(58,48,70,.15)'; x.beginPath(); x.ellipse(cx, cy + rad, rad * 1.1, rad * 0.3, 0, 0, 7); x.fill();
      x.save(); x.translate(cx, cy - bounce); x.rotate(e * 6);
      paper(x, B(blobPts(0, 0, rad, 9, 3, 0.35)), '#f6eedb', { border: 2.5 });
      x.strokeStyle = 'rgba(58,48,70,.35)'; x.lineWidth = 1.3; x.beginPath();
      for (let i = 0; i < 6; i++) { x.moveTo((r() - 0.5) * rad * 1.4, (r() - 0.5) * rad * 1.4); x.lineTo((r() - 0.5) * rad * 1.6, (r() - 0.5) * rad * 1.6); } x.stroke();
      x.restore();
      break;
    }
    case 'gewitter': {
      const cyc = cy - m * 0.24;
      paper(x, [C(cx - 15 * k, cyc, 13 * k), C(cx + 3 * k, cyc - 7 * k, 16 * k), C(cx + 19 * k, cyc + 1 * k, 11 * k), RR(cx - 26 * k, cyc, 54 * k, 13 * k, 6 * k)], '#7d8299', { border: 2.5 });
      if ((Math.floor(t * 14) % 3) !== 0 && p < 0.7) {
        const rb = rng(Math.floor(t * 14)); x.strokeStyle = '#ffe066'; x.lineWidth = 4 * k; x.lineJoin = 'round'; x.beginPath(); x.moveTo(cx, cyc + 10 * k);
        for (let i = 1; i <= 4; i++) x.lineTo(cx + (rb() - 0.5) * 18 * k, cyc + 10 * k + i * 11 * k); x.stroke();
        x.strokeStyle = '#ffffff'; x.lineWidth = 1.6 * k; x.stroke();
        x.fillStyle = 'rgba(255,240,150,.22)'; x.fillRect(0, 0, cx * 2, cy * 2);
      }
      for (let i = 0; i < 10; i++) { const a = r() * 6.28, d = e * R * (0.5 + r() * 0.5); x.fillStyle = i % 2 ? '#ffe066' : '#9aa0ba'; x.beginPath(); x.arc(cx + Math.cos(a) * d, cy + 8 * k + Math.sin(a) * d * 0.5, 2.5 * k, 0, 7); x.fill(); }
      break;
    }
    case 'sternschnuppe': {
      const sp = Math.min(1, (p - hit) / 0.25), sx = cx - m * 0.5 + sp * m * 0.5, sy = cy - m * 0.42 + sp * m * 0.42;
      if (sp < 1) { x.strokeStyle = 'rgba(255,230,120,.7)'; x.lineWidth = 5 * k; x.lineCap = 'round'; x.beginPath(); x.moveTo(sx - m * 0.22, sy - m * 0.22); x.lineTo(sx, sy); x.stroke(); paper(x, starPath(sx, sy, 9 * k, t * 4), '#ffd84a', { border: 2 }); }
      else { const e2 = easeOut((p - hit - 0.25) / 0.5); for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28 + r() * 0.3, d = e2 * R; paper(x, starPath(cx + Math.cos(a) * d, cy + Math.sin(a) * d, (5 + r() * 3) * k * (1 - e2 * 0.4), t * 3 + i), cols[i % 2], { border: 1.4, shadow: false }); } }
      break;
    }
    default: {
      const n = id === 'konfetti' ? 26 : id === 'feuerwerk' ? 22 : 16;
      if (id === 'standard-boom') for (let i = 0; i < 6; i++) { const a = r() * 6.28, d = e * R * 0.45; x.globalAlpha = fade * (1 - e) * 0.9; paper(x, C(cx + Math.cos(a) * d, cy + Math.sin(a) * d, (10 + r() * 8) * k * (0.6 + e)), i % 2 ? '#ffcf3f' : '#ff8a4c', { border: 0, shadow: false }); }
      x.globalAlpha = fade;
      for (let i = 0; i < n; i++) {
        const a = r() * 6.28, sp = 0.55 + r() * 0.45, d = e * R * sp, grav = id === 'konfetti' ? e * e * m * 0.25 : id === 'herzregen' ? -e * m * 0.15 : 0;
        const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.85 + grav, col = cols[i % cols.length], sz = (id === 'konfetti' ? 5 : 6) * k;
        if (id === 'feuerwerk') { x.strokeStyle = col; x.lineWidth = 2 * k; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx + Math.cos(a) * d * 0.6, cy + Math.sin(a) * d * 0.6 * 0.85); x.lineTo(px, py); x.stroke(); x.fillStyle = col; x.beginPath(); x.arc(px, py, 2.6 * k, 0, 7); x.fill(); }
        else if (id === 'herzregen') paper(x, heartPath(px, py, sz * 0.9), col, { border: 1.3, shadow: false });
        else if (id === 'konfetti') { x.save(); x.translate(px, py); x.rotate(a + t * 8 * (i % 2 ? 1 : -1)); x.scale(1, Math.max(0.15, Math.abs(Math.sin(t * 7 + i)))); x.fillStyle = col; x.fillRect(-sz, -sz / 2, sz * 2, sz); x.restore(); }
        else paper(x, starPath(px, py, sz, a), col, { border: 1.3, shadow: false });
      }
    }
  }
  x.restore();
}
// Vorschauen, die gerade animiert werden (Shop: alle, Spind: die unter der Maus)
const livePrev = new Set();
function addLive(cv, it, w, h, always) {
  const o = { cv, it, w, h, always, hover: false };
  if (!always) {
    queueMicrotask(() => {
      const c = cv.parentElement; if (!c) return;
      c.addEventListener('pointerenter', () => { o.hover = true; });
      c.addEventListener('pointerleave', () => { o.hover = false; previewItem(cv, it, o.w, o.h); });
    });
  }
  livePrev.add(o); return o;
}
let livePrevLast = 0;
(function livePrevLoop(now) {
  requestAnimationFrame(livePrevLoop);
  if (screen !== 'lobby' || (tab !== 'shop' && tab !== 'locker') || now - livePrevLast < 30) return;
  livePrevLast = now;
  for (const o of livePrev) {
    if (!o.cv.isConnected) { livePrev.delete(o); continue; }
    if (o.always || o.hover) previewItem(o.cv, o.it, o.w, o.h, now / 1000);
  }
})(0);

// ---------- Spind ----------
let lockerCat = 'skin';
function renderLocker() {
  if (tab !== 'locker') return;
  const cats = $('lockerCats'); cats.innerHTML = '';
  for (const [k, n] of Object.entries(CAT.CATS)) {
    const b = el('button', k === lockerCat ? 'on' : '', n);
    b.onclick = () => { lockerCat = k; sfx.click(); renderLocker(); };
    cats.appendChild(b);
  }
  const grid = $('lockerGrid'); grid.innerHTML = '';
  const cheat = prof.cheats && prof.cheats.allab;
  for (const it of CAT.ITEMS.filter(i => i.cat === lockerCat)) {
    const usable = CAT.canUse(prof, it.id, cheat);
    if (!usable && it.price) continue; // Shop-Items erst nach dem Kauf zeigen
    const d = el('div', 'item' + (prof.equip[it.cat] === it.id ? ' on' : '') + (usable ? '' : ' locked'));
    const c = document.createElement('canvas'); previewItem(c, it, 156, 104); addLive(c, it, 156, 104, false);
    d.append(c, el('div', 'n', it.name), el('div', 'l', !usable ? `Ab Rang ${CAT.RANKS[it.rank].name}` : prof.equip[it.cat] === it.id ? 'Ausgerüstet' : it.price ? 'Aus dem Shop' : 'Freigeschaltet'));
    if (usable) d.onclick = () => {
      prof.equip = { ...prof.equip, [it.cat]: it.id }; // sofort anzeigen
      send({ t: 'equip', id: it.id }); sfx.click(); renderLocker();
    };
    grid.appendChild(d);
  }
  const more = el('div', 'item'); more.append(el('div', 'n', 'Mehr im Shop'), el('div', 'l', 'Jeden Tag neue Lackierungen, Spuren, Hüte und Finisher.'));
  more.onclick = () => setTab('shop');
  grid.appendChild(more);
}

// ---------- Fähigkeiten ----------
function renderAbilities() {
  if (typeof settings !== 'undefined') $('abKeyHint').textContent = keyName(settings.keys.ability);
  if (tab !== 'abilities') return;
  const grid = $('abilityGrid'); grid.innerHTML = '';
  const cheat = prof.cheats && prof.cheats.allab;
  for (const a of CAT.ABILITIES) {
    const ok = CAT.canUseAbility(prof, a.id, cheat, prof.isTop3 ? [prof.pid] : []);
    const d = el('div', 'item' + (prof.ability === a.id ? ' on' : '') + (ok ? '' : ' locked'));
    const c = document.createElement('canvas'); c.width = 168; c.height = 168;
    drawAbilityIcon(c.getContext('2d'), a.id, 84, 84, 140, !ok);
    d.append(el('div', 'cat', a.type === 'passiv' ? 'Passiv' : `Aktiv · ${a.cd} s`), c, el('div', 'n', a.name), el('div', 'l', a.desc));
    const req = el('div', 'l req');
    req.textContent = ok ? (prof.ability === a.id ? 'Ausgewählt' : 'Freigeschaltet') : a.top3 ? `Top 3 Unreal: ${(prof.top3 || []).join(', ') || 'noch frei'}` : `Ab ${CAT.RANKS[a.rank].name}`;
    d.appendChild(req);
    if (ok) d.onclick = () => { prof.ability = a.id; send({ t: 'setAbility', id: a.id }); sfx.ability(); renderAbilities(); };
    grid.appendChild(d);
  }
}

// ---------- Shop ----------
const CAT_DESC = { skin: 'Lackierung für deinen Panzer', tracer: 'Leuchtende Spur hinter jeder Kugel', hat: 'Sitzt oben auf deinem Turm', finisher: 'Spielt bei jeder Eliminierung' };
const rarity = (p) => p >= 1000 ? ['Legendär', 'leg'] : p >= 700 ? ['Episch', 'epic'] : ['Selten', 'rare'];
let shopRO = null;
function renderShop() {
  if (tab !== 'shop') return;
  const grid = $('shopGrid'); grid.innerHTML = '';
  if (shopRO) shopRO.disconnect();
  // Vorschau passt sich der Kartengröße an
  shopRO = new ResizeObserver((ents) => {
    for (const en of ents) {
      const o = en.target._live; if (!o) continue;
      const w = Math.round(en.contentRect.width), h = Math.round(en.contentRect.height);
      if (w > 10 && h > 10 && (w !== o.w || h !== o.h)) { o.w = w; o.h = h; previewItem(o.cv, o.it, w, h, performance.now() / 1000); }
    }
  });
  for (const id of shop.items) {
    const it = CAT.ITEM_BY_ID[id]; if (!it) continue;
    const owned = prof.owned.includes(id), [rn, rc] = rarity(it.price);
    const d = el('div', 'item shopcard ' + rc + (owned ? ' on' : ''));
    const top = el('div', 'top'); top.append(el('span', 'cat2', CAT.CATS[it.cat]), el('span', 'rar', rn));
    const c = document.createElement('canvas'); c.className = 'stagecv';
    c._live = addLive(c, it, 200, 150, true);
    d.append(top, c, el('div', 'n', it.name), el('div', 'l', CAT_DESC[it.cat] || ''));
    // Preis und Kaufen in einem zentrierten Knopf
    const b = el('button', 'btn buy ' + (owned ? '' : 'yellow'));
    if (owned) b.textContent = 'Gekauft';
    else { b.innerHTML = coinSvg(); b.append(el('b', '', String(it.price)), el('span', '', 'Kaufen')); }
    b.disabled = owned;
    b.onclick = (e) => { e.stopPropagation(); if (prof.coins < it.price) { toast('Dafür hast du nicht genug Zahnräder.'); sfx.deny(); return; } send({ t: 'buy', id }); };
    d.appendChild(b);
    grid.appendChild(d);
    shopRO.observe(c);
  }
}
setInterval(() => {
  if (tab !== 'shop' || !shop.nextIn) return;
  const left = Math.max(0, shop.nextIn - (performance.now() - shop.at)) / 1000;
  const h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60), s = Math.floor(left % 60);
  $('shopTimer').textContent = `Neue Angebote in ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}, 500);

// ---------- Party, Modus & Spielen ----------
function isLeader() { return party && party.leader === me.pid; }
function renderParty() {
  if (!party) return;
  const n = party.members.length, leader = isLeader();
  $('partybox').classList.toggle('hidden', n < 2 || tab !== 'stage');
  for (const b of $('modeSeg').children) {
    const size = { solo: 1, duo: 2, squad: 4 }[b.dataset.mode];
    b.classList.toggle('on', party.mode === b.dataset.mode);
    b.disabled = !leader || party.queued || size < n;
  }
  $('fillBox').checked = party.fill; $('fillBox').disabled = !leader || party.queued || party.mode === 'solo';
  $('fillBox').parentElement.style.opacity = party.mode === 'solo' ? 0.45 : 1;
  const btn = $('btnPlay'), busy = party.members.filter(x => x.inMatch && x.pid !== me.pid);
  if (party.queued) { btn.textContent = 'ABBRECHEN'; btn.classList.remove('yellow'); btn.disabled = !leader; }
  else {
    queueInfo = null; btn.classList.add('yellow'); btn.textContent = 'SPIELEN';
    btn.disabled = !leader || busy.length > 0;
    $('queueInfo').textContent = !leader ? 'Der Party-Leiter startet das Spiel.' : busy.length ? `Warte auf ${busy.map(b => b.name).join(', ')} ...` : '';
  }
}
function renderQueue() {
  if (!party || !party.queued || !queueInfo) return;
  const q = queueInfo;
  $('queueInfo').textContent = `Spieler gefunden: ${q.found}/${q.total}  ·  0:${String(q.wait).padStart(2, '0')}` + (q.wait >= q.max ? '  ·  Bots füllen auf ...' : '');
}
for (const b of $('modeSeg').children) b.onclick = () => { sfx.click(); send({ t: 'setMode', mode: b.dataset.mode }); };
$('fillBox').onchange = (e) => send({ t: 'setMode', fill: e.target.checked });
$('btnPlay').onclick = () => { if (!isLeader()) return; ac(); sfx.click(); send({ t: party.queued ? 'cancel' : 'play' }); };
$('btnLeaveParty').onclick = () => send({ t: 'partyLeave' });

// ---------- Freunde ----------
$('btnFriends').onclick = () => { $('drawer').classList.toggle('open'); sfx.click(); };
$('btnCloseDrawer').onclick = () => $('drawer').classList.remove('open');
function addFriend() { const n = $('addName').value.trim(); if (!n) return; send({ t: 'friendAdd', name: n }); $('addName').value = ''; }
$('btnAdd').onclick = addFriend;
$('addName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addFriend(); });
function statusColor(st) { return st === 'Offline' ? '#c9c1b2' : st === 'Im Spiel' ? '#f2994a' : st === 'Sucht Spiel' ? '#4f8ff0' : st === 'In Party' ? '#ffcf3f' : '#63d07a'; }
function rankCanvas(idx) { const c = document.createElement('canvas'); c.width = c.height = 60; drawRankIcon(c.getContext('2d'), idx, 30, 26, 40); return c; }
function renderFriends() {
  const body = $('dbody'); body.innerHTML = '';
  const reqN = friends.req.length;
  $('friendBadge').textContent = reqN; $('friendBadge').classList.toggle('hidden', !reqN);
  const leader = isLeader(), inParty = new Set(party ? party.members.map(x => x.pid) : []), full = party && party.members.length >= 4;
  if (party) {
    body.appendChild(el('div', 'sec', `Party (${party.members.length}/4)`));
    for (const mbr of party.members) {
      const r = el('div', 'row');
      const who = el('span', 'who', mbr.name + (mbr.pid === me.pid ? ' (du)' : ''));
      who.appendChild(el('span', 'st', (mbr.pid === party.leader ? 'Leiter · ' : '') + CAT.RANKS[mbr.level].name + (mbr.inMatch ? ' · im Spiel' : '')));
      r.append(rankCanvas(mbr.level), who);
      if (leader && mbr.pid !== me.pid) { const x = el('button', 'x', '✕'); x.title = 'Aus Party entfernen'; x.onclick = () => send({ t: 'kick', pid: mbr.pid }); r.appendChild(x); }
      body.appendChild(r);
    }
  }
  if (reqN) {
    body.appendChild(el('div', 'sec', 'Anfragen'));
    for (const q of friends.req) {
      const r = el('div', 'row');
      r.append(rankCanvas(q.level), el('span', 'who', q.name));
      const a = el('button', 'btn small green', 'Annehmen'); a.onclick = () => send({ t: 'friendAccept', pid: q.pid });
      const x = el('button', 'x', '✕'); x.title = 'Ablehnen'; x.onclick = () => send({ t: 'friendDecline', pid: q.pid });
      r.append(a, x); body.appendChild(r);
    }
  }
  const on = friends.list.filter(f => f.online), off = friends.list.filter(f => !f.online);
  body.appendChild(el('div', 'sec', `Online (${on.length})`));
  if (!on.length) body.appendChild(el('div', 'empty', friends.list.length ? 'Gerade ist kein Freund online.' : 'Füge Freunde oben mit ihrem Namen hinzu – auch wenn sie offline sind.'));
  const row = (f) => {
    const r = el('div', 'row');
    const dot = el('span', 'dot'); dot.style.background = statusColor(f.status);
    const who = el('span', 'who', f.name); who.appendChild(el('span', 'st', `${f.status} · ${CAT.RANKS[f.level].name}`));
    r.append(dot, rankCanvas(f.level), who);
    if (f.online && !inParty.has(f.pid)) {
      const b = el('button', 'btn small yellow', 'Einladen'); b.disabled = full || f.status === 'Im Spiel';
      b.onclick = () => { send({ t: 'invite', pid: f.pid }); b.disabled = true; setTimeout(() => { b.disabled = false; }, 4000); };
      r.appendChild(b);
    }
    const x = el('button', 'x', '✕'); x.title = 'Freund entfernen';
    x.onclick = () => { if (confirm(`${f.name} als Freund entfernen?`)) send({ t: 'friendRemove', pid: f.pid }); };
    r.appendChild(x);
    return r;
  };
  for (const f of on) body.appendChild(row(f));
  if (off.length) { body.appendChild(el('div', 'sec', `Offline (${off.length})`)); for (const f of off) body.appendChild(row(f)); }
  const fset = new Set(friends.list.map(f => f.pid));
  const recent = local.recent.filter(p => !fset.has(p.pid) && p.pid !== me.pid);
  if (recent.length) {
    body.appendChild(el('div', 'sec', 'Zuletzt gespielt'));
    for (const p of recent) {
      const r = el('div', 'row'); r.append(el('span', 'who', p.name));
      const b = el('button', 'btn small', 'Hinzufügen'); b.onclick = () => { send({ t: 'friendAdd', name: p.name }); b.disabled = true; };
      r.appendChild(b); body.appendChild(r);
    }
  }
}
function showInvite(m) {
  sfx.pick();
  const card = el('div', 'inv panel');
  const t = el('div'); t.append(el('b', '', m.from), document.createTextNode(' lädt dich in die Party ein.'));
  const acts = el('div', 'acts'), a = el('button', 'btn small green', 'Annehmen'), d = el('button', 'btn small', 'Ablehnen');
  const close = () => card.remove();
  a.onclick = () => { send({ t: 'inviteAccept', partyId: m.partyId }); close(); };
  d.onclick = () => { send({ t: 'inviteDecline', fromPid: m.fromPid }); close(); };
  acts.append(a, d); card.append(t, acts);
  $('invites').appendChild(card);
  setTimeout(close, 30000);
}

// ---------- Lobby-Nachrichten ----------
let msgIdx = 0;
function renderMessages() {
  const now = Date.now(), list = messages.filter(m => m.until > now);
  const b = $('msgBanner');
  if (!list.length) { b.classList.add('hidden'); return; }
  msgIdx %= list.length;
  b.textContent = list[msgIdx].text; b.classList.remove('hidden');
}
setInterval(() => { msgIdx++; renderMessages(); }, 7000);

// ================= Admin (Taste 0) =================
let adminData = null;
addEventListener('keydown', (e) => {
  if (e.key !== '0' || screen === 'game' || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (!$('adminPanel').classList.contains('hidden') || !$('adminLogin').classList.contains('hidden')) return;
  if (adminData) { $('adminPanel').classList.remove('hidden'); send({ t: 'adminList' }); return; }
  $('adminLogin').classList.remove('hidden'); $('adMsg').textContent = ''; $('adUser').value = ''; $('adPass').value = '';
  setTimeout(() => $('adUser').focus(), 50);
});
$('adGo').onclick = () => send({ t: 'adminLogin', user: $('adUser').value, pass: $('adPass').value });
$('adPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('adGo').click(); });
$('adCancel').onclick = () => $('adminLogin').classList.add('hidden');
$('adClose').onclick = () => $('adminPanel').classList.add('hidden');
$('adSearch').oninput = () => renderAdmin();
$('adGiveAll').onclick = () => { const v = +$('adAllCoins').value; if (v) send({ t: 'adminCoins', pid: '*', amount: v }); };
$('adDelAll').onclick = () => { if (confirm('Wirklich ALLE Konten löschen (außer deinem)?') && confirm('Ganz sicher? Das kann man nicht rückgängig machen.')) send({ t: 'adminDeleteAll' }); };
$('adMsgSend').onclick = () => { const t = $('adMsgText').value.trim(); if (!t) return; send({ t: 'adminMsg', text: t, minutes: +$('adMsgMin').value || 30 }); $('adMsgText').value = ''; };
const CHEATS = [['god', 'Unverwundbar'], ['nocd', 'Keine Abklingzeit'], ['speed', 'Tempo'], ['oneshot', 'Ein-Schuss'], ['wall', 'Wallhack'], ['allab', 'Alles freigeschaltet']];
function renderAdmin() {
  if (!adminData) return;
  const s = adminData.stats;
  $('adStats').textContent = `${s.online} online · ${s.accounts} Konten · ${s.matches} Spiele · ${s.queue} suchen · Speicher: ${s.db}`;
  const q = $('adSearch').value.trim().toLowerCase();
  const list = $('adList'); list.innerHTML = '';
  for (const u of adminData.users.filter(u => !q || u.name.toLowerCase().includes(q))) {
    const d = el('div', 'aduser' + (u.online ? ' online' : ''));
    const head = el('div', 'head');
    const nm = el('div', 'nm', u.name); if (u.online) nm.appendChild(el('i', '', u.inMatch ? 'im Spiel' : 'online'));
    const info = el('div', 'info'); info.append(nm, el('div', 'meta', `${CAT.RANKS[u.rank].name} · ${u.rp} RP · ${u.coins} Zahnräder · ${u.stats.games} Spiele · ${u.stats.wins} Siege · ${u.stats.kills} Kills`), el('div', 'meta', 'zuletzt ' + new Date(u.last).toLocaleString('de-DE')));
    const del = el('button', 'btn small red', 'Löschen'); del.onclick = () => { if (confirm(`Konto ${u.name} löschen?`)) send({ t: 'adminDelete', pid: u.pid }); };
    head.append(rankCanvas(u.rank), info, del);
    const ops = el('div', 'ops');
    const g1 = el('div', 'grp'); g1.appendChild(el('span', 'gl', 'Zahnräder'));
    const coins = el('input'); coins.type = 'number'; coins.placeholder = '+100';
    const give = el('button', 'btn small yellow', 'Geben'); give.onclick = () => { if (+coins.value) send({ t: 'adminCoins', pid: u.pid, amount: +coins.value }); };
    g1.append(coins, give);
    const g2 = el('div', 'grp'); g2.appendChild(el('span', 'gl', 'Rang-Punkte'));
    const rp = el('input'); rp.type = 'number'; rp.value = u.rp;
    const setRp = el('button', 'btn small', 'Setzen'); setRp.onclick = () => send({ t: 'adminRp', pid: u.pid, rp: +rp.value });
    g2.append(rp, setRp);
    const g3 = el('div', 'grp cheats'); g3.appendChild(el('span', 'gl', 'Cheats'));
    for (const [k, n] of CHEATS) {
      const chip = el('button', 'chip' + (u.cheats[k] ? ' on' : ''), n);
      chip.onclick = () => { u.cheats = { ...u.cheats, [k]: !u.cheats[k] }; chip.classList.toggle('on', !!u.cheats[k]); send({ t: 'adminCheats', pid: u.pid, cheats: u.cheats }); sfx.click(); };
      g3.appendChild(chip);
    }
    ops.append(g1, g2, g3);
    d.append(head, ops);
    list.appendChild(d);
  }
  const ml = $('adMsgs'); ml.innerHTML = '';
  for (const m of adminData.messages) {
    const r = el('div', 'admsg'); const sp = el('span', '', m.text);
    sp.appendChild(el('small', '', `  bis ${new Date(m.until).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`));
    const x = el('button', 'btn small red', '✕'); x.onclick = () => send({ t: 'adminMsgDel', id: m.id });
    r.append(sp, x); ml.appendChild(r);
  }
}

// ================= Lobby-Bühne (Papier) =================
const stage = $('stage'), sctx = stage.getContext('2d');
const mouse = { x: 0, y: 0 };
const slotHover = [];
let stageSlots = [];
function fitCanvas(c, ctx2, dprOverride) {
  const r = c.getBoundingClientRect(), dpr = dprOverride || devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height };
}
const cloudSprites = [];
function makeCloudSprite(seed, W) {
  const r = rng(seed), H = W * 0.6, pad = 14;
  const c = document.createElement('canvas'); c.width = Math.ceil((W + pad * 2) * 2); c.height = Math.ceil((H + pad * 2) * 2);
  const x = c.getContext('2d'); x.scale(2, 2); x.translate(pad, pad);
  const base = H * 0.72, shapes = [];
  const n = 4 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, rad = W * (0.13 + r() * 0.06) * (1 - Math.abs(t - 0.5) * 0.6); shapes.push(C(W * (0.1 + 0.8 * t), base - rad * (0.6 + r() * 0.5), rad)); }
  shapes.push(C(W * (0.35 + r() * 0.3), base - W * 0.24, W * (0.19 + r() * 0.04)), RR(W * 0.06, base - H * 0.18, W * 0.88, H * 0.26, H * 0.13));
  paper(x, shapes, '#ffffff', { border: 4, sx: 4, sy: 6, shadowCol: 'rgba(60,110,170,.22)', edge: false });
  return { c, w: W + pad * 2, h: H + pad * 2 };
}
for (let i = 0; i < 7; i++) cloudSprites.push(makeCloudSprite(300 + i * 17, i < 3 ? 110 + i * 15 : 170 + (i % 3) * 30));
let stageBg = null, stageBgKey = '';
function buildStageBg(w, h, dpr) {
  const c = document.createElement('canvas'); c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
  const x = c.getContext('2d'); x.scale(dpr, dpr);
  const hz = h * 0.58;
  const g = x.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#7cc4f0'); g.addColorStop(1, '#d4eefb');
  x.fillStyle = g; x.fillRect(0, 0, w, hz + 2);
  const layer = (yb, hgt, col, seed, snow) => {
    const pts = [[-20, h]], n = 9, rr = rng(seed);
    for (let i = 0; i <= n; i++) { pts.push([w * i / n + (rr() - 0.5) * 50, yb - hgt * (0.55 + rr() * 0.45)]); pts.push([w * (i + 0.5) / n, yb - hgt * (0.12 + rr() * 0.2)]); }
    pts.push([w + 20, h]);
    paper(x, P(pts), col, { border: 4, sx: 0, sy: -5, shadowCol: 'rgba(40,60,110,.12)' });
    if (snow) for (let i = 1; i < pts.length - 1; i += 2) { const [px, py] = pts[i]; paper(x, P([[px, py], [px - 20, py + 22], [px - 8, py + 16], [px + 2, py + 24], [px + 18, py + 18]]), '#ffffff', { border: 0, shadow: false }); }
  };
  layer(hz, h * 0.3, '#b9c8ea', 41, true);
  layer(hz + 10, h * 0.16, '#d6c49c', 31, false);
  const gg = x.createLinearGradient(0, hz, 0, h);
  gg.addColorStop(0, '#9fdc7a'); gg.addColorStop(1, '#7cc95e');
  paper(x, RR(-20, hz, w + 40, h - hz + 40, 0), gg, { border: 4, sx: 0, sy: -5, shadowCol: 'rgba(40,80,30,.18)' });
  x.fillStyle = fiberPattern(x); x.globalAlpha = 0.25; x.fillRect(0, 0, w, h); x.globalAlpha = 1;
  const rr = rng(9);
  x.strokeStyle = '#5fae47'; x.lineWidth = 2; x.lineCap = 'round'; x.beginPath();
  for (let i = 0; i < w * h / 3200; i++) { const gx = rr() * w, gy = hz + 14 + rr() * (h - hz - 14); x.moveTo(gx - 4, gy); x.lineTo(gx - 2, gy - 7); x.moveTo(gx, gy); x.lineTo(gx + 1, gy - 9); x.moveTo(gx + 4, gy); x.lineTo(gx + 3, gy - 6); }
  x.stroke();
  for (let i = 0; i < w * h / 24000; i++) {
    const gx = rr() * w, gy = hz + 22 + rr() * (h - hz - 22), col = ['#ffffff', '#ffd25c', '#ff9ab0', '#b9a6ff'][i % 4];
    const sh = []; for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; sh.push(C(gx + Math.cos(a) * 3.4, gy + Math.sin(a) * 3.4, 2.6)); }
    paper(x, sh, col, { border: 1.2, sx: 1, sy: 1.5, edge: false });
    paper(x, C(gx, gy, 1.8), '#f2a03f', { border: 0, shadow: false, edge: false });
  }
  return c;
}
// ---------- Lobby: mehrere Papier-Ebenen mit Parallaxe ----------
const PAR = 30; // so weit (px) dürfen sich die Ebenen höchstens verschieben
let stageLayers = null, stageLayersKey = '', stagePar = 0, stageMouseIn = false;
function layerCanvas(w, h, dpr) { const c = document.createElement('canvas'); c.width = Math.ceil((w + PAR * 2) * dpr); c.height = Math.ceil(h * dpr); const x = c.getContext('2d'); x.scale(dpr, dpr); x.translate(PAR, 0); return [c, x]; }
function ridge(x, w, h, yb, hgt, col, seed, n, snow, shadowCol) {
  const pts = [[-PAR - 20, h]], rr = rng(seed);
  for (let i = 0; i <= n; i++) { pts.push([(w + PAR * 2) * i / n - PAR + (rr() - 0.5) * 40, yb - hgt * (0.55 + rr() * 0.45)]); pts.push([(w + PAR * 2) * (i + 0.5) / n - PAR, yb - hgt * (0.12 + rr() * 0.25)]); }
  pts.push([w + PAR + 20, h]);
  paper(x, P(pts), col, { border: 4, sx: 0, sy: -5, shadowCol: shadowCol || 'rgba(40,60,110,.12)' });
  if (snow) for (let i = 1; i < pts.length - 1; i += 2) { const [px, py] = pts[i], s = Math.min(1.4, hgt / 160); paper(x, P([[px, py], [px - 20 * s, py + 22 * s], [px - 8 * s, py + 16 * s], [px + 2 * s, py + 25 * s], [px + 18 * s, py + 18 * s]]), '#ffffff', { border: 0, shadow: false }); }
  return pts;
}
function buildStageLayers(w, h, dpr) {
  const hz = h * 0.58, L = { hz };
  // 0: Himmel
  { const c = document.createElement('canvas'); c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr); const x = c.getContext('2d'); x.scale(dpr, dpr);
    const g = x.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, '#6fbcef'); g.addColorStop(0.7, '#bfe5fa'); g.addColorStop(1, '#e4f5fc'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    L.sky = c; }
  // 1: ferne blaue Gipfel
  { const [c, x] = layerCanvas(w, h, dpr); ridge(x, w, h, hz - h * 0.04, h * 0.36, '#c6d3ef', 77, 7, true, 'rgba(40,60,110,.08)'); L.far = c; }
  // 2: Berge mit Schnee
  { const [c, x] = layerCanvas(w, h, dpr); ridge(x, w, h, hz, h * 0.28, '#a9badf', 41, 9, true); L.mid = c; }
  // 3: sandige Hügel
  { const [c, x] = layerCanvas(w, h, dpr); ridge(x, w, h, hz + 8, h * 0.14, '#d9c69b', 31, 11, false);
    // kleine Felsen auf den Hügeln
    const rr = rng(5); for (let i = 0; i < 6; i++) { const px = rr() * w, py = hz + 2 + rr() * 6; paper(x, B(blobPts(px, py, 6 + rr() * 6, 7, i, 0.15)), '#c2b49a', { border: 2, sx: 1, sy: 2 }); }
    L.hills = c; }
  // 4: grüne Hügelwelle mit kleinen Büschen
  { const [c, x] = layerCanvas(w, h, dpr); const yb = hz + 26, pts = [[-PAR - 20, h]];
    for (let i = 0; i <= 60; i++) { const px = -PAR + (w + PAR * 2) * i / 60; pts.push([px, yb - 10 - Math.sin(i * 0.45) * 9 - Math.sin(i * 0.17 + 1) * 12]); }
    pts.push([w + PAR + 20, h]);
    paper(x, P(pts), '#a6dd84', { border: 4, sx: 0, sy: -4, shadowCol: 'rgba(40,80,30,.12)' });
    const rr = rng(12);
    for (let i = 0; i < 14; i++) { const px = rr() * w, k = Math.round((px + PAR) / (w + PAR * 2) * 60), py = (pts[k + 1] || pts[1])[1] + 6; paper(x, [C(px - 7, py, 8), C(px + 5, py - 3, 9), C(px + 13, py + 1, 6)], i % 3 ? '#5fae47' : '#4f9a3c', { border: 2.5, sx: 1.5, sy: 2.5 }); }
    L.green = c; }
  // 5: Wiese vorne (bleibt stehen, darauf stehen die Plattformen)
  { const c = document.createElement('canvas'); c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr); const x = c.getContext('2d'); x.scale(dpr, dpr);
    const top = hz + 34, gg = x.createLinearGradient(0, top, 0, h); gg.addColorStop(0, '#9fdc7a'); gg.addColorStop(1, '#77c55a');
    const pts = [[-20, h]]; for (let i = 0; i <= 40; i++) pts.push([w * i / 40, top + Math.sin(i * 0.6) * 4]); pts.push([w + 20, h]);
    paper(x, P(pts), gg, { border: 4, sx: 0, sy: -5, shadowCol: 'rgba(40,80,30,.18)' });
    x.save(); pathOf(x, [P(pts)]); x.clip();
    x.fillStyle = fiberPattern(x); x.globalAlpha = 0.25; x.fillRect(0, 0, w, h); x.globalAlpha = 1;
    const rr = rng(9);
    // helle Flecken
    for (let i = 0; i < 9; i++) { x.fillStyle = 'rgba(200,245,160,.35)'; pathOf(x, [B(blobPts(rr() * w, top + 30 + rr() * (h - top), 40 + rr() * 90, 9, i, 0.3))]); x.fill(); }
    x.strokeStyle = '#5fae47'; x.lineWidth = 2; x.lineCap = 'round'; x.beginPath();
    for (let i = 0; i < w * h / 3200; i++) { const gx = rr() * w, gy = top + 14 + rr() * (h - top - 14); x.moveTo(gx - 4, gy); x.lineTo(gx - 2, gy - 7); x.moveTo(gx, gy); x.lineTo(gx + 1, gy - 9); x.moveTo(gx + 4, gy); x.lineTo(gx + 3, gy - 6); }
    x.stroke();
    for (let i = 0; i < w * h / 22000; i++) {
      const gx = rr() * w, gy = top + 22 + rr() * (h - top - 22), col = ['#ffffff', '#ffd25c', '#ff9ab0', '#b9a6ff'][i % 4];
      const sh = []; for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; sh.push(C(gx + Math.cos(a) * 3.4, gy + Math.sin(a) * 3.4, 2.6)); }
      paper(x, sh, col, { border: 1.2, sx: 1, sy: 1.5, edge: false });
      paper(x, C(gx, gy, 1.8), '#f2a03f', { border: 0, shadow: false, edge: false });
    }
    x.restore();
    L.ground = c; }
  // fliegende Blütenblätter vorne
  const rr = rng(3); L.petals = Array.from({ length: Math.round(w / 70) }, () => ({ x: rr() * w, y: rr() * h, s: 0.6 + rr() * 0.8, ph: rr() * 6.28, col: ['#ffffff', '#ffb3cc', '#ffe28a'][Math.floor(rr() * 3)] }));
  return L;
}
function drawLayer(c, par, f, w, h) { sctx.drawImage(c, -PAR - par * PAR * f, 0, w + PAR * 2, h); }
// Heißluftballon aus Papier
function drawBalloon(c2, x, y, s, t) {
  c2.save(); c2.translate(x, y); c2.rotate(Math.sin(t * 0.7) * 0.05); c2.scale(s, s);
  c2.strokeStyle = INK; c2.lineWidth = 1.5; c2.beginPath(); c2.moveTo(-10, 20); c2.lineTo(-6, 34); c2.moveTo(10, 20); c2.lineTo(6, 34); c2.stroke();
  paper(c2, B([[0, -30], [24, -12], [16, 14], [8, 22], [-8, 22], [-16, 14], [-24, -12]]), '#ff6b5a', { border: 3, sx: 3, sy: 5, shadowCol: 'rgba(60,110,170,.2)' });
  paper(c2, B([[0, -29], [9, -12], [6, 14], [3, 21], [-3, 21], [-6, 14], [-9, -12]]), '#ffd84a', { border: 0, shadow: false, edge: false });
  paper(c2, RR(-7, 33, 14, 10, 2), '#c98f4f', { border: 2.5, shadow: false });
  c2.restore();
}
function drawBirds(c2, w, h, t) {
  c2.strokeStyle = 'rgba(58,48,70,.55)'; c2.lineWidth = 2; c2.lineCap = 'round'; c2.beginPath();
  for (let g = 0; g < 2; g++) {
    const span = w + 300, bx = ((t * (22 + g * 9) + g * 600) % span) - 150, by = h * (0.2 + g * 0.1) + Math.sin(t * 0.5 + g) * 10;
    for (let i = 0; i < 4; i++) { const px = bx - i * 18 - (i % 2) * 6, py = by + i * 7 * (i % 2 ? 1 : -0.4), f = Math.sin(t * 9 + i + g) * 3; c2.moveTo(px - 7, py - 2 - f); c2.quadraticCurveTo(px - 3, py - 4, px, py); c2.quadraticCurveTo(px + 3, py - 4, px + 7, py - 2 - f); }
  }
  c2.stroke();
}
function drawSun(c2, sx, sy, sr, t) {
  c2.save(); c2.translate(sx, sy); c2.rotate(t * 0.15);
  const rays = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, rr = i % 2 ? sr * 1.15 : sr * 1.6; rays.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  paper(c2, P(rays), '#ffc93a', { border: 4, sx: 3, sy: 5, shadowCol: 'rgba(60,110,170,.2)' });
  c2.restore();
  paper(c2, C(sx, sy, sr), '#ffe066', { border: 0, shadow: false });
  c2.fillStyle = INK; c2.beginPath(); c2.arc(sx - sr * 0.3, sy - sr * 0.1, sr * 0.08, 0, 7); c2.arc(sx + sr * 0.3, sy - sr * 0.1, sr * 0.08, 0, 7); c2.fill();
  c2.strokeStyle = INK; c2.lineWidth = 2.5; c2.beginPath(); c2.arc(sx, sy + sr * 0.1, sr * 0.3, 0.3, Math.PI - 0.3); c2.stroke();
}
function drawStage(time) {
  const { w, h } = fitCanvas(stage, sctx);
  const dpr = devicePixelRatio || 1, key = `${w}x${h}x${dpr}`;
  if (stageLayersKey !== key) { stageLayers = buildStageLayers(w, h, dpr); stageLayersKey = key; }
  const Ly = stageLayers, t = time / 1000, hz = h * 0.58;
  stagePar += ((stageMouseIn ? clamp(mouse.x / w * 2 - 1, -1, 1) : 0) - stagePar) * 0.06;
  const par = stagePar;
  sctx.drawImage(Ly.sky, 0, 0, w, h);
  drawSun(sctx, w * 0.86 - par * 4, h * 0.16, Math.min(w, h) * 0.06, t);
  const cloud = (i) => { const cs = cloudSprites[i], farL = i < 3, speed = farL ? 6 : 13, span = w + cs.w * 2;
    const cx = ((t * speed + i * 397) % span) - cs.w - par * (farL ? 6 : 14), cy = h * (farL ? 0.06 + i * 0.07 : 0.04 + (i - 3) * 0.08) + Math.sin(t * 0.4 + i) * 3;
    sctx.drawImage(cs.c, cx, cy, cs.w * (farL ? 0.8 : 1), cs.h * (farL ? 0.8 : 1)); };
  for (let i = 0; i < 3; i++) cloud(i);
  drawLayer(Ly.far, par, 0.15, w, h);
  drawBirds(sctx, w, h, t);
  drawBalloon(sctx, ((t * 9 + w * 0.3) % (w + 200)) - 100 - par * 8, h * 0.22 + Math.sin(t * 0.6) * 8, Math.min(1.3, h / 600), t);
  drawLayer(Ly.mid, par, 0.3, w, h);
  for (let i = 3; i < cloudSprites.length; i++) cloud(i);
  drawLayer(Ly.hills, par, 0.5, w, h);
  drawLayer(Ly.green, par, 0.7, w, h);
  sctx.drawImage(Ly.ground, 0, 0, w, h);
  // Party auf Papier-Plattformen (Rohre folgen NICHT der Maus)
  const members = party ? [...party.members].sort((a, b) => (a.pid === me.pid ? -1 : b.pid === me.pid ? 1 : 0)) : [];
  const xs = [0.38, 0.62, 0.16, 0.84];
  const usable = w - Math.min(380, w * 0.3); // rechts Platz für den Spielen-Kasten
  const gap = usable * 0.22;                                  // Abstand zwischen zwei Plätzen
  const sc = clamp(Math.min(gap / 92, h / 210), 1.0, 4.2);      // so groß, dass sich nichts überlappt
  stageSlots = [];
  for (let i = 0; i < 4; i++) {
    const x = usable * xs[i], y = Math.max(hz + sc * 22, h * 0.7);
    const m = members[i];
    const py = y + sc * 24, prx = Math.min(sc * 38, gap * 0.44), pry = prx * 0.28;
    if (m) {
      const glow = sctx.createRadialGradient(x, py - sc * 10, sc * 4, x, py - sc * 10, sc * 62);
      glow.addColorStop(0, 'rgba(255,246,200,.9)'); glow.addColorStop(1, 'rgba(255,246,200,0)');
      sctx.fillStyle = glow; sctx.beginPath(); sctx.ellipse(x, py - sc * 10, sc * 62, sc * 48, 0, 0, 7); sctx.fill();
      paper(sctx, E(x, py + sc * 5, prx, pry), '#c99a5c', { border: 3.5 });
      paper(sctx, E(x, py, prx, pry), i === 0 ? '#ffe28a' : '#fff3cf', { border: 3.5, shadow: false });
      const eq = m.pid === me.pid ? prof.equip : m.equip; // eigener Skin sofort
      drawTank(sctx, x, y + Math.sin(t * 2 + i) * 2, -0.28 + Math.sin(t * 0.6 + i) * 0.04, -0.62 + Math.sin(t * 0.8 + i * 1.7) * 0.12, eq, hashStr(m.pid), { scale: sc, t });
      const ny = y - sc * 31;
      sctx.font = `700 ${Math.round(13 + sc * 4)}px Fredoka, sans-serif`; sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
      let fsz = Math.round(13 + sc * 4); sctx.font = `700 ${fsz}px Fredoka, sans-serif`;
      while (sctx.measureText(m.name).width + 58 > gap * 0.95 && fsz > 11) { fsz--; sctx.font = `700 ${fsz}px Fredoka, sans-serif`; }
      const tw = sctx.measureText(m.name).width, bw = tw + 58;
      paper(sctx, RR(x - bw / 2, ny - 18, bw, 36, 12), '#ffffff', { border: 3 });
      sctx.fillStyle = INK; sctx.fillText(m.name, x + 14, ny + 1);
      drawRankIcon(sctx, m.pid === me.pid ? CAT.rankInfo(prof.rp).idx : m.level, x - bw / 2 + 22, ny - 1, 30);
      if (m.pid === party.leader && members.length > 1) drawCrown(sctx, x, ny - 32, 1.3);
      if (m.inMatch) { paper(sctx, RR(x - 44, ny + 22, 88, 24, 8), '#ffb066', { border: 2.5 }); sctx.fillStyle = INK; sctx.font = '600 15px Fredoka, sans-serif'; sctx.fillText('IM SPIEL', x, ny + 34); }
    } else {
      // leerer Platz: weiße Papier-Silhouette, schwebendes Plus und Schild
      const hover = Math.hypot(mouse.x - x, mouse.y - (y - sc * 8)) < sc * 34, bob = Math.sin(t * 2.2 + i) * 3;
      const hv = slotHover[i] = (slotHover[i] || 0) + ((hover ? 1 : 0) - (slotHover[i] || 0)) * 0.18;
      sctx.save(); sctx.globalAlpha = 0.55 + hv * 0.35;
      paper(sctx, E(x, py + sc * 5, prx, pry), '#d9c39c', { border: 3, shadow: false });
      paper(sctx, E(x, py, prx, pry), '#fff7e2', { border: 3, shadow: false });
      sctx.restore();
      sctx.save(); sctx.setLineDash([7, 7]); sctx.lineDashOffset = -t * 14; sctx.strokeStyle = `rgba(58,48,70,${0.25 + hv * 0.25})`; sctx.lineWidth = 2.5;
      sctx.beginPath(); sctx.ellipse(x, py, prx * 0.74, pry * 0.74, 0, 0, 7); sctx.stroke(); sctx.restore();
      drawTank(sctx, x, y + bob * 0.3, -0.28, -0.62, { skin: prof.equip.skin, hat: 'keiner' }, 11 + i, { scale: sc * (0.96 + hv * 0.04), t, flash: true, alpha: 0.72 + hv * 0.28 });
      const by = y - sc * 30 + bob, br = sc * (10.5 + hv * 2.5);
      paper(sctx, C(x, by, br), hv > 0.5 ? '#ffcf3f' : '#ffffff', { border: 3.5 });
      sctx.strokeStyle = INK; sctx.lineWidth = Math.max(3, sc * 1.5); sctx.lineCap = 'round'; sctx.beginPath();
      sctx.moveTo(x - br * 0.45, by); sctx.lineTo(x + br * 0.45, by); sctx.moveTo(x, by - br * 0.45); sctx.lineTo(x, by + br * 0.45); sctx.stroke();
      const label = gap > 150 ? 'Freund einladen' : 'Einladen';
      let fs = Math.round(13 + sc * 1.6); sctx.font = `600 ${fs}px Fredoka, sans-serif`;
      while (sctx.measureText(label).width + 26 > gap * 0.95 && fs > 11) { fs--; sctx.font = `600 ${fs}px Fredoka, sans-serif`; }
      const lw = sctx.measureText(label).width + 26, ly = py + pry + 22;
      sctx.save(); sctx.globalAlpha = 0.8 + hv * 0.2; paper(sctx, RR(x - lw / 2, ly - 14, lw, 28, 10), hv > 0.5 ? '#fff3cf' : '#ffffff', { border: 2.5 }); sctx.restore();
      sctx.fillStyle = INK; sctx.textAlign = 'center'; sctx.textBaseline = 'middle'; sctx.fillText(label, x, ly + 1);
      stageSlots.push({ x, y: y - sc * 8, r: sc * 34 });
    }
  }
  for (const p of Ly.petals) {
    const px = ((p.x + t * 18 * p.s) % (w + 40)) - 20 - par * 20 * p.s, py = ((p.y + t * 12 * p.s) % (h + 40)) - 20 + Math.sin(t * 1.3 + p.ph) * 10;
    sctx.save(); sctx.translate(px, py); sctx.rotate(t * 1.5 * p.s + p.ph); sctx.scale(1, Math.abs(Math.sin(t * 2 + p.ph)) * 0.7 + 0.3);
    sctx.fillStyle = p.col; sctx.globalAlpha = 0.85; sctx.beginPath(); sctx.ellipse(0, 0, 4 * p.s + 1, 2.4 * p.s + 0.6, 0, 0, 7); sctx.fill(); sctx.restore();
  }
  stage.style.cursor = stageSlots.some(s => Math.hypot(mouse.x - s.x, mouse.y - s.y) < s.r) ? 'pointer' : 'default';
}
stage.addEventListener('mouseleave', () => { stageMouseIn = false; });
stage.addEventListener('mousemove', (e) => { stageMouseIn = true; const r = stage.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
stage.addEventListener('click', () => {
  if (stageSlots.some(s => Math.hypot(mouse.x - s.x, mouse.y - s.y) < s.r)) { $('drawer').classList.add('open'); sfx.click(); setTimeout(() => $('addName').focus(), 200); }
});

// Hintergrund der Anmeldung
const loginBg = $('loginBg'), lctx = loginBg.getContext('2d');
function drawLoginBg(time) {
  const { w, h } = fitCanvas(loginBg, lctx);
  const dpr = devicePixelRatio || 1, key = `${w}x${h}x${dpr}`;
  if (stageBgKey !== key) { stageBg = buildStageBg(w, h, dpr); stageBgKey = key; }
  lctx.drawImage(stageBg, 0, 0, w, h);
  const t = time / 1000;
  drawSun(lctx, w * 0.86, h * 0.16, Math.min(w, h) * 0.06, t);
  cloudSprites.forEach((cs, i) => { const span = w + cs.w * 2; lctx.drawImage(cs.c, ((t * (8 + i * 2) + i * 397) % span) - cs.w, h * (0.05 + i * 0.06), cs.w, cs.h); });
  for (let i = 0; i < 4; i++) {
    const x = ((t * 40 + i * 330) % (w + 200)) - 100, y = h * 0.8 + (i % 2) * 40;
    drawTank(lctx, x, y, 0, Math.sin(t + i) * 0.3, { skin: CAT.ITEMS[i].id, hat: ['keiner', 'kappe', 'partyhut', 'blume'][i] }, i * 99, { scale: 1.6, t, roll: t * 40 });
  }
}
