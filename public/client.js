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
let actx = null;
function ac() {
  if (!local.sound) return null;
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
const volMul = () => (typeof settings !== 'undefined' ? settings.vol / 100 : 0.8);
function tone(freq, dur, type = 'square', vol = 0.1, slide = 0, delay = 0) {
  vol *= volMul();
  const a = ac(); if (!a || vol <= 0.003) return;
  const t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
let noiseBuf = null;
function noise(dur, vol, freq = 1000, delay = 0) {
  vol *= volMul();
  const a = ac(); if (!a || vol <= 0.003) return;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t0 = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t0); s.stop(t0 + dur + 0.02);
}
const sfx = {
  shot: (v) => { noise(0.12, 0.2 * v, 1100); tone(140, 0.1, 'sine', 0.22 * v, -80); },
  bigshot: (v) => { noise(0.25, 0.3 * v, 700); tone(90, 0.25, 'sine', 0.3 * v, -40); },
  hit: () => { tone(2200, 0.045, 'triangle', 0.16, -300); tone(3300, 0.03, 'sine', 0.08); noise(0.03, 0.08, 6000); },
  kill: () => { tone(160, 0.18, 'sine', 0.3, -60); noise(0.08, 0.15, 3000); tone(1320, 0.09, 'triangle', 0.14, 0, 0.06); tone(1760, 0.22, 'triangle', 0.14, 0, 0.13); },
  hurt: () => { tone(170, 0.18, 'sawtooth', 0.12, -90); noise(0.1, 0.12, 600); },
  boom: (v) => { noise(0.7, 0.45 * v, 380); tone(70, 0.5, 'sine', 0.35 * v, -40); },
  bush: (v) => noise(0.12, 0.16 * v, 2600),
  dirt: (v) => noise(0.08, 0.12 * v, 500),
  wood: (v) => { noise(0.06, 0.14 * v, 1400); tone(320, 0.05, 'triangle', 0.08 * v); },
  pick: () => { tone(520, 0.08, 'triangle', 0.12); tone(780, 0.1, 'triangle', 0.12, 0, 0.07); },
  zone: () => { tone(330, 0.35, 'sine', 0.1); tone(247, 0.45, 'sine', 0.1, 0, 0.3); },
  tick: () => tone(880, 0.05, 'sine', 0.06),
  go: () => { tone(523, 0.1, 'square', 0.08); tone(784, 0.25, 'square', 0.08, 0, 0.1); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, 0, i * 0.13)); },
  click: () => tone(620, 0.04, 'triangle', 0.07),
  block: () => { tone(1500, 0.07, 'triangle', 0.09); tone(1100, 0.1, 'sine', 0.07, 0, 0.03); },
  blockOn: () => tone(400, 0.18, 'sine', 0.1, 500),
  jump: () => { noise(0.5, 0.15, 1800); tone(700, 0.4, 'sine', 0.08, -400); },
  land: () => { noise(0.25, 0.3, 300); tone(90, 0.2, 'sine', 0.25, -40); },
  fall: (v) => { tone(1100, 1.0, 'sine', 0.12 * v, -900); },
  heal: () => { tone(520, 0.12, 'triangle', 0.1); tone(660, 0.12, 'triangle', 0.1, 0, 0.1); tone(880, 0.2, 'triangle', 0.1, 0, 0.2); },
  ability: () => { tone(440, 0.08, 'triangle', 0.1, 400); tone(880, 0.12, 'sine', 0.08, 0, 0.06); },
  heart: () => { tone(60, 0.12, 'sine', 0.35); tone(55, 0.14, 'sine', 0.28, 0, 0.18); },
  buy: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, 'triangle', 0.1, 0, i * 0.07)); noise(0.2, 0.08, 5000, 0.25); },
  emp: () => { tone(200, 0.5, 'sawtooth', 0.1, 900); noise(0.3, 0.12, 4000); },
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
  send({ t: 'login', pid: local.pid, name: local.name, legacy: legacyRp != null ? { rp: legacyRp, skin: load('skin', null) } : null });
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
      for (const k of ['pid', 'name', 'rp', 'skin', 'friends', 'recent', 'tut', 'settings', 'xp']) { try { localStorage.removeItem(KEY(k)); } catch { /* egal */ } }
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

// ---------- Vorschau-Bilder ----------
function previewItem(cv, it, w, h) {
  const x = cv.getContext('2d'), s = 2;
  cv.width = w * s; cv.height = h * s;
  x.setTransform(s, 0, 0, s, 0, 0); x.clearRect(0, 0, w, h);
  const eq = { ...prof.equip };
  if (it.cat === 'skin') { drawTank(x, w / 2 + Math.min(w, h) * 0.07, h / 2 + Math.min(w, h) * 0.05, -0.35, -0.8, { skin: it.id, hat: 'keiner' }, hashStr(it.id), { scale: Math.min(w, h) / 50 }); }
  else if (it.cat === 'hat') { drawTank(x, w / 2, h / 2 + 6, -0.35, -1.2, { skin: eq.skin, hat: it.id }, 7, { scale: Math.min(w, h) / 40 }); }
  else if (it.cat === 'tracer') {
    paper(x, RR(8, 8, w - 16, h - 16, 12), '#e9f3d8', { border: 3, sx: 2, sy: 3 });
    const sc = Math.min(w, h) / 34;
    x.save(); x.translate(w / 2 + 20 * sc, h / 2); x.scale(sc, sc); // Spur + Kugel zusammen mittig
    drawTracer(x, it.id, 0, 0, 0.1, '#f2b705', 1.3, 0);
    x.fillStyle = INK; x.beginPath(); x.ellipse(0, 0, 7.5, 5, 0.1, 0, 7); x.fill(); x.fillStyle = '#f2b705'; x.beginPath(); x.ellipse(0, 0, 5, 3, 0.1, 0, 7); x.fill();
    x.restore();
  } else if (it.cat === 'finisher') drawFinisherPreview(x, it.id, w / 2, h / 2, Math.min(w, h));
}
function drawFinisherPreview(x, id, cx, cy, s) {
  const r = rng(hashStr(id));
  const cols = { feuerwerk: ['#ff6b5a', '#ffcf3f', '#4f8ff0', '#63d07a'], konfetti: ['#ff6b5a', '#ffcf3f', '#4f8ff0', '#9b6be0', '#63d07a'], herzregen: ['#ff5c8a'], sternschnuppe: ['#ffd84a'], 'standard-boom': ['#ffcf3f', '#ff8a4c'] }[id] || ['#ffcf3f'];
  if (id === 'geist') { paper(x, B([[cx - 16, cy + 18], [cx - 18, cy - 6], [cx, cy - 22], [cx + 18, cy - 6], [cx + 16, cy + 18], [cx + 8, cy + 12], [cx, cy + 18], [cx - 8, cy + 12]]), '#ffffff'); x.fillStyle = INK; x.beginPath(); x.arc(cx - 6, cy - 4, 2.6, 0, 7); x.arc(cx + 6, cy - 4, 2.6, 0, 7); x.fill(); return; }
  if (id === 'papierball') { paper(x, B(blobPts(cx, cy, s * 0.22, 9, 3, 0.35)), '#f6eedb'); x.strokeStyle = 'rgba(58,48,70,.35)'; x.lineWidth = 1.2; x.beginPath(); for (let i = 0; i < 5; i++) { x.moveTo(cx + (r() - 0.5) * 20, cy + (r() - 0.5) * 20); x.lineTo(cx + (r() - 0.5) * 24, cy + (r() - 0.5) * 24); } x.stroke(); return; }
  if (id === 'gewitter') { paper(x, [C(cx - 10, cy - 14, 11), C(cx + 4, cy - 18, 13), C(cx + 15, cy - 11, 9)], '#8a8fa8'); paper(x, P([[cx - 2, cy - 6], [cx + 8, cy - 6], [cx + 2, cy + 6], [cx + 9, cy + 6], [cx - 6, cy + 26], [cx - 2, cy + 10], [cx - 9, cy + 10]]), '#ffe066', { border: 2 }); return; }
  for (let i = 0; i < 14; i++) {
    const a = r() * 6.28, d = 8 + r() * s * 0.32, px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
    x.fillStyle = cols[i % cols.length];
    if (id === 'herzregen') paper(x, B([[px, py + 6], [px - 6, py], [px - 4, py - 4], [px, py - 1.5], [px + 4, py - 4], [px + 6, py]]), cols[0], { border: 1.2, shadow: false });
    else if (id === 'konfetti') { x.save(); x.translate(px, py); x.rotate(a); x.fillRect(-4, -2, 8, 4); x.restore(); }
    else { const p = []; for (let k = 0; k < 10; k++) { const aa = k * Math.PI / 5, rr = k % 2 ? 2 : 5; p.push([px + Math.cos(aa) * rr, py + Math.sin(aa) * rr]); } paper(x, P(p), cols[i % cols.length], { border: 1.2, shadow: false }); }
  }
}

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
    const c = document.createElement('canvas'); previewItem(c, it, 156, 104);
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
    const ok = CAT.canUseAbility(prof, a.id, cheat);
    const d = el('div', 'item' + (prof.ability === a.id ? ' on' : '') + (ok ? '' : ' locked'));
    const c = document.createElement('canvas'); c.width = 168; c.height = 168;
    drawAbilityIcon(c.getContext('2d'), a.id, 84, 84, 140, !ok);
    d.append(el('div', 'cat', a.type === 'passiv' ? 'Passiv' : `Aktiv · ${a.cd} s`), c, el('div', 'n', a.name), el('div', 'l', a.desc));
    const req = el('div', 'l'); req.style.fontWeight = '600';
    req.textContent = ok ? (prof.ability === a.id ? 'Ausgewählt' : 'Freigeschaltet') : `Ab ${CAT.RANKS[a.rank].name}`;
    d.appendChild(req);
    if (ok) d.onclick = () => { prof.ability = a.id; send({ t: 'setAbility', id: a.id }); sfx.ability(); renderAbilities(); };
    grid.appendChild(d);
  }
}

// ---------- Shop ----------
function renderShop() {
  if (tab !== 'shop') return;
  const grid = $('shopGrid'); grid.innerHTML = '';
  for (const id of shop.items) {
    const it = CAT.ITEM_BY_ID[id]; if (!it) continue;
    const owned = prof.owned.includes(id);
    const d = el('div', 'item' + (owned ? ' on' : ''));
    const c = document.createElement('canvas'); previewItem(c, it, 200, 130);
    d.append(el('div', 'cat', CAT.CATS[it.cat]), c, el('div', 'n', it.name));
    // Preis und Kaufen in einem zentrierten Knopf
    const b = el('button', 'btn buy ' + (owned ? '' : 'yellow'));
    if (owned) b.textContent = 'Gekauft';
    else { b.innerHTML = coinSvg(); b.append(el('b', '', String(it.price)), el('span', '', 'Kaufen')); }
    b.disabled = owned;
    b.onclick = (e) => { e.stopPropagation(); if (prof.coins < it.price) { toast('Dafür hast du nicht genug Zahnräder.'); return; } send({ t: 'buy', id }); };
    d.appendChild(b);
    grid.appendChild(d);
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
    const d = el('div', 'aduser');
    const nm = el('div', 'nm', u.name); if (u.online) nm.appendChild(el('i', '', u.inMatch ? 'im Spiel' : 'online'));
    const meta = el('div', 'meta', `${CAT.RANKS[u.rank].name} · ${u.rp} RP · ${u.coins} Zahnräder · ${u.stats.games} Spiele, ${u.stats.wins} Siege, ${u.stats.kills} Kills · zuletzt ${new Date(u.last).toLocaleString('de-DE')}`);
    const ops = el('div', 'ops');
    const coins = el('input'); coins.type = 'number'; coins.placeholder = 'Zahnräder';
    const give = el('button', 'btn small yellow', 'Geben'); give.onclick = () => { if (+coins.value) send({ t: 'adminCoins', pid: u.pid, amount: +coins.value }); };
    const rp = el('input'); rp.type = 'number'; rp.placeholder = 'RP'; rp.value = u.rp;
    const setRp = el('button', 'btn small', 'Rang setzen'); setRp.onclick = () => send({ t: 'adminRp', pid: u.pid, rp: +rp.value });
    ops.append(coins, give, rp, setRp);
    for (const [k, n] of CHEATS) {
      const lab = el('label'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!u.cheats[k];
      cb.onchange = () => send({ t: 'adminCheats', pid: u.pid, cheats: { ...u.cheats, [k]: cb.checked } });
      lab.append(cb, document.createTextNode(n)); ops.appendChild(lab);
    }
    const del = el('button', 'btn small red', 'Löschen'); del.onclick = () => { if (confirm(`Konto ${u.name} löschen?`)) send({ t: 'adminDelete', pid: u.pid }); };
    ops.appendChild(del);
    const ic = rankCanvas(u.rank);
    d.append(ic, nm, el('span'), meta, el('span'), ops);
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
  if (stageBgKey !== key) { stageBg = buildStageBg(w, h, dpr); stageBgKey = key; }
  sctx.drawImage(stageBg, 0, 0, w, h);
  const t = time / 1000, hz = h * 0.58;
  drawSun(sctx, w * 0.86, h * 0.16, Math.min(w, h) * 0.06, t);
  cloudSprites.forEach((cs, i) => {
    const farL = i < 3, speed = farL ? 6 : 13, span = w + cs.w * 2;
    const cx = ((t * speed + i * 397) % span) - cs.w, cy = h * (farL ? 0.06 + i * 0.07 : 0.04 + (i - 3) * 0.08) + Math.sin(t * 0.4 + i) * 3;
    sctx.drawImage(cs.c, cx, cy, cs.w * (farL ? 0.8 : 1), cs.h * (farL ? 0.8 : 1));
  });
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
      sctx.save(); sctx.globalAlpha = 0.55; paper(sctx, E(x, py, prx, pry), 'rgba(255,255,255,.6)', { border: 3, shadow: false }); sctx.restore();
      const hover = Math.hypot(mouse.x - x, mouse.y - y) < sc * 26, bob = Math.sin(t * 2.2 + i) * 3;
      paper(sctx, C(x, y + bob, sc * (hover ? 15 : 13)), hover ? '#ffcf3f' : '#ffffff', { border: 3.5 });
      sctx.strokeStyle = INK; sctx.lineWidth = 3.6; sctx.lineCap = 'round'; sctx.beginPath();
      sctx.moveTo(x - sc * 5.5, y + bob); sctx.lineTo(x + sc * 5.5, y + bob); sctx.moveTo(x, y + bob - sc * 5.5); sctx.lineTo(x, y + bob + sc * 5.5); sctx.stroke();
      sctx.font = '600 18px Fredoka, sans-serif'; sctx.fillStyle = '#2f5a22'; sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
      sctx.fillText(gap > 150 ? 'Freund einladen' : 'Einladen', x, py + pry + 16);
      stageSlots.push({ x, y, r: sc * 28 });
    }
  }
  stage.style.cursor = stageSlots.some(s => Math.hypot(mouse.x - s.x, mouse.y - s.y) < s.r) ? 'pointer' : 'default';
}
stage.addEventListener('mousemove', (e) => { const r = stage.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
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
