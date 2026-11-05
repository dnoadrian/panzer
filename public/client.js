// PANZER – Browser-Teil: Lobby, Freunde, Spind, Spiel
'use strict';
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const lerpAng = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };

// ================= Profil (bleibt im Browser gespeichert) =================
const PROFILE = (new URLSearchParams(location.search).get('profil') || '').replace(/[^a-z0-9]/gi, '').slice(0, 10);
const KEY = (k) => 'pz' + (PROFILE ? '-' + PROFILE : '') + '-' + k;
function load(k, def) { try { const v = localStorage.getItem(KEY(k)); return v == null ? def : JSON.parse(v); } catch { return def; } }
function save(k, v) { try { localStorage.setItem(KEY(k), JSON.stringify(v)); } catch { /* egal */ } }
function newPid() { const a = new Uint8Array(14); crypto.getRandomValues(a); return Array.from(a, b => (b % 36).toString(36)).join(''); }
const profile = {
  pid: load('pid', null), name: load('name', ''), xp: load('xp', 0),
  skin: load('skin', ['rot', 'blau', 'gruen'][Math.floor(Math.random() * 3)]),
  friends: load('friends', []), recent: load('recent', []), tut: load('tut', false), sound: load('sound', true),
};
if (!profile.pid || !/^[a-z0-9]{8,40}$/.test(profile.pid)) { profile.pid = newPid(); save('pid', profile.pid); }
save('skin', profile.skin);
function levelInfo(xp) {
  let lvl = 1, need = 400, rest = xp;
  while (rest >= need) { rest -= need; lvl++; need = 400 + (lvl - 1) * 100; }
  return { lvl, rest, need };
}

// ================= Sound (selbst erzeugt, keine Dateien) =================
let actx = null;
function ac() {
  if (!profile.sound) return null;
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, dur, type = 'square', vol = 0.1, slide = 0, delay = 0) {
  const a = ac(); if (!a || vol <= 0.003) return;
  const t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
let noiseBuf = null;
function noise(dur, vol, freq = 1000, delay = 0) {
  const a = ac(); if (!a || vol <= 0.003) return;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t0 = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(a.destination); s.start(t0); s.stop(t0 + dur + 0.02);
}
const sfx = {
  shot: (v) => { noise(0.14, 0.22 * v, 900); tone(120, 0.12, 'sine', 0.25 * v, -70); },
  hit: () => { tone(1250, 0.05, 'square', 0.06); tone(1700, 0.05, 'square', 0.04, 0, 0.03); },
  hurt: () => { tone(170, 0.18, 'sawtooth', 0.12, -90); noise(0.1, 0.12, 600); },
  boom: (v) => { noise(0.7, 0.45 * v, 380); tone(70, 0.5, 'sine', 0.35 * v, -40); },
  bush: (v) => noise(0.09, 0.14 * v, 2600),
  dirt: (v) => noise(0.08, 0.12 * v, 500),
  pick: () => { tone(520, 0.08, 'triangle', 0.12); tone(780, 0.1, 'triangle', 0.12, 0, 0.07); },
  kill: () => { tone(660, 0.1, 'square', 0.08); tone(990, 0.18, 'square', 0.08, 0, 0.09); },
  zone: () => { tone(330, 0.35, 'sine', 0.1); tone(247, 0.45, 'sine', 0.1, 0, 0.3); },
  tick: () => tone(880, 0.05, 'sine', 0.06),
  go: () => { tone(523, 0.1, 'square', 0.08); tone(784, 0.25, 'square', 0.08, 0, 0.1); },
  win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, 0, i * 0.13)); },
  click: () => tone(600, 0.04, 'triangle', 0.06),
};

// ================= Verbindung =================
let ws = null, loggedIn = false, kicked = false;
const me = { pid: profile.pid, name: '' };
let party = null, friends = { list: [], req: [] };

function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { if (profile.name) login(); else showLogin(); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = () => {
    loggedIn = false;
    if (kicked) return;
    if (inGame) exitGame();
    if (profile.name) { $('loginMsg').textContent = 'Verbinde neu ...'; }
    setTimeout(connect, 1500);
  };
}
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function login() {
  send({ t: 'login', pid: profile.pid, name: profile.name, skin: profile.skin, level: levelInfo(profile.xp).lvl, friends: profile.friends });
}
function sendProfile() { send({ t: 'profile', skin: profile.skin, level: levelInfo(profile.xp).lvl }); }

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      loggedIn = true; me.name = m.name; $('btnName').textContent = m.name; $('loginMsg').textContent = '';
      if (!inGame) show('lobby');
      break;
    case 'party': party = m; renderParty(); renderFriends(); break;
    case 'friends':
      friends = m;
      for (const f of m.list) { const pf = profile.friends.find(x => x.pid === f.pid); if (pf && pf.name !== f.name) pf.name = f.name; }
      save('friends', profile.friends);
      renderFriends();
      break;
    case 'friendAdded':
      if (!profile.friends.some(f => f.pid === m.pid)) profile.friends.push({ pid: m.pid, name: m.name });
      save('friends', profile.friends); renderFriends();
      break;
    case 'friendRemoved':
      profile.friends = profile.friends.filter(f => f.pid !== m.pid); save('friends', profile.friends); renderFriends();
      break;
    case 'invite': showInvite(m); break;
    case 'toast': toast(m.msg); break;
    case 'kicked':
      kicked = true; loggedIn = false; if (inGame) exitGame();
      showLogin('PANZER ist in einem anderen Fenster geöffnet.', 'Hier spielen');
      break;
    case 'matchStart': startGame(m); break;
    case 's': onState(m); break;
    case 'dead': onDead(m); break;
    case 'result': onResult(m); break;
    case 'lobby': exitGame(); break;
  }
}

// ================= Bildschirme =================
let screen = 'login';
function show(name) {
  screen = name;
  for (const s of ['login', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== name);
  if (name !== 'lobby') $('drawer').classList.remove('open');
  if (name === 'lobby') { updateLevelUi(); renderParty(); }
}
function toast(text) {
  const d = el('div', 'toast', text);
  $('toasts').appendChild(d); setTimeout(() => d.remove(), 3500);
}

// ---------- Name ----------
let loginMode = 'login';
function showLogin(msg = '', button = 'Weiter') {
  show('login');
  $('loginMsg').textContent = msg;
  $('btnLogin').textContent = button;
  $('nameInput').value = profile.name || '';
  setTimeout(() => $('nameInput').focus(), 50);
}
function submitName() {
  if (kicked) { kicked = false; $('btnLogin').textContent = 'Weiter'; $('loginMsg').textContent = 'Verbinde ...'; connect(); return; }
  const n = $('nameInput').value.trim();
  if (!n) { $('loginMsg').textContent = 'Bitte gib einen Namen ein.'; $('nameInput').focus(); return; }
  profile.name = n; save('name', n);
  if (loginMode === 'rename' && loggedIn) { send({ t: 'rename', name: n }); show('lobby'); loginMode = 'login'; return; }
  if (ws && ws.readyState === 1) login();
  else $('loginMsg').textContent = 'Verbinde ...';
}
$('btnLogin').onclick = submitName;
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitName(); });
$('btnName').onclick = () => { loginMode = 'rename'; showLogin('', 'Speichern'); };

// ---------- Topbar ----------
function updateLevelUi() {
  const li = levelInfo(profile.xp);
  $('lvlNum').textContent = li.lvl;
  $('xpBar').style.width = (li.rest / li.need * 100).toFixed(1) + '%';
  $('xpText').textContent = `${li.rest} / ${li.need} XP`;
}
const ICON_SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="#2b2620" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5c1.3 1.8 1.3 5.2 0 7M19 6c2.6 3.3 2.6 8.7 0 12"/></svg>';
const ICON_SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="#2b2620" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
function renderSoundBtn() { $('btnSound').innerHTML = profile.sound ? ICON_SOUND_ON : ICON_SOUND_OFF; }
$('btnSound').onclick = () => { profile.sound = !profile.sound; save('sound', profile.sound); renderSoundBtn(); sfx.click(); };
renderSoundBtn();

let tab = 'stage';
for (const b of document.querySelectorAll('.tab')) {
  b.onclick = () => {
    tab = b.dataset.tab; sfx.click();
    for (const o of document.querySelectorAll('.tab')) o.classList.toggle('on', o === b);
    $('locker').classList.toggle('hidden', tab !== 'locker');
    $('playbox').classList.toggle('hidden', tab !== 'stage');
    $('partybox').classList.toggle('hidden', tab !== 'stage' || !party || party.members.length < 2);
    if (tab === 'locker') buildLocker();
  };
}

// ---------- Spind ----------
function buildLocker() {
  const box = $('skins'); box.innerHTML = '';
  const lvl = levelInfo(profile.xp).lvl;
  for (const s of SKINS) {
    const locked = lvl < s.lvl;
    const d = el('div', 'skin' + (s.id === profile.skin ? ' on' : '') + (locked ? ' locked' : ''));
    const c = document.createElement('canvas'); c.width = 300; c.height = 200;
    const cx = c.getContext('2d'); cx.scale(2, 2);
    drawTank(cx, 75, 52, -0.3, -0.75, s.id, hashStr(s.id), { scale: 2.1 });
    d.append(c, el('div', 'n', s.name), el('div', 'l', locked ? `Ab Level ${s.lvl}` : s.id === profile.skin ? 'Ausgerüstet' : 'Freigeschaltet'));
    if (!locked) d.onclick = () => { profile.skin = s.id; save('skin', s.id); sendProfile(); sfx.click(); buildLocker(); };
    box.appendChild(d);
  }
}

// ---------- Party & Spielen ----------
let queueStart = 0;
function isLeader() { return party && party.leader === me.pid; }
function renderParty() {
  if (!party) return;
  const n = party.members.length;
  $('modeSub').textContent = n > 1 ? `Team mit ${n} Spielern` : 'Solo';
  $('partybox').classList.toggle('hidden', n < 2 || tab !== 'stage');
  const btn = $('btnPlay'), info = $('queueInfo');
  btn.classList.toggle('searching', !!party.queued);
  const busy = party.members.filter(x => x.inMatch && x.pid !== me.pid);
  if (party.queued) {
    if (!queueStart) queueStart = performance.now();
    btn.textContent = 'SUCHE ...'; btn.disabled = !isLeader();
  } else {
    queueStart = 0;
    btn.textContent = 'SPIELEN';
    btn.disabled = !isLeader() || busy.length > 0;
    info.textContent = !isLeader() ? 'Der Party-Leiter startet das Spiel.'
      : busy.length ? `Warte auf ${busy.map(b => b.name).join(', ')} ...` : '';
  }
}
setInterval(() => {
  if (party && party.queued && queueStart) {
    const s = Math.floor((performance.now() - queueStart) / 1000);
    $('queueInfo').textContent = `Suche Spiel  0:${String(s).padStart(2, '0')}` + (isLeader() ? '  ·  Klicken zum Abbrechen' : '');
  }
}, 250);
$('btnPlay').onclick = () => {
  if (!isLeader()) return;
  ac(); sfx.click();
  send({ t: party.queued ? 'cancel' : 'play' });
};
$('btnLeaveParty').onclick = () => send({ t: 'partyLeave' });

// ---------- Freunde ----------
$('btnFriends').onclick = () => { $('drawer').classList.toggle('open'); sfx.click(); };
$('btnCloseDrawer').onclick = () => $('drawer').classList.remove('open');
function addFriend() {
  const n = $('addName').value.trim();
  if (!n) return;
  send({ t: 'friendAdd', name: n }); $('addName').value = '';
}
$('btnAdd').onclick = addFriend;
$('addName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addFriend(); });

function statusColor(st) {
  return st === 'Offline' ? '#c9c1b2' : st === 'Im Spiel' ? '#f2994a' : st === 'Sucht Spiel' ? '#4f86e8' : st === 'In Party' ? '#f2c94c' : '#6fcf6f';
}
function renderFriends() {
  const body = $('dbody'); body.innerHTML = '';
  const reqN = friends.req.length;
  $('friendBadge').textContent = reqN; $('friendBadge').classList.toggle('hidden', !reqN);
  const leader = isLeader();
  const inParty = new Set(party ? party.members.map(x => x.pid) : []);
  const full = party && party.members.length >= 4;

  if (party) {
    body.appendChild(el('div', 'sec', `Party (${party.members.length}/4)`));
    for (const mbr of party.members) {
      const r = el('div', 'row');
      const dot = el('span', 'dot'); dot.style.background = skinOf(mbr.skin).color;
      const who = el('span', 'who', mbr.name + (mbr.pid === me.pid ? ' (du)' : ''));
      who.appendChild(el('span', 'st', (mbr.pid === party.leader ? 'Leiter · ' : '') + `Level ${mbr.level}` + (mbr.inMatch ? ' · im Spiel' : '')));
      r.append(dot, who);
      if (leader && mbr.pid !== me.pid) {
        const x = el('button', 'x', '✕'); x.title = 'Aus Party entfernen'; x.onclick = () => send({ t: 'kick', pid: mbr.pid }); r.appendChild(x);
      }
      body.appendChild(r);
    }
  }
  if (reqN) {
    body.appendChild(el('div', 'sec', 'Anfragen'));
    for (const q of friends.req) {
      const r = el('div', 'row');
      r.append(el('span', 'who', q.name));
      const a = el('button', 'btn small green', 'Annehmen'); a.onclick = () => send({ t: 'friendAccept', pid: q.pid });
      const x = el('button', 'x', '✕'); x.title = 'Ablehnen'; x.onclick = () => send({ t: 'friendDecline', pid: q.pid });
      r.append(a, x); body.appendChild(r);
    }
  }
  const list = friends.list.length ? friends.list : profile.friends.map(f => ({ ...f, online: false, status: 'Offline' }));
  const online = list.filter(f => f.online), offline = list.filter(f => !f.online);
  body.appendChild(el('div', 'sec', `Online (${online.length})`));
  if (!online.length) body.appendChild(el('div', 'empty', list.length ? 'Gerade ist kein Freund online.' : 'Füge Freunde oben mit ihrem Namen hinzu.'));
  for (const f of online) {
    const r = el('div', 'row');
    const dot = el('span', 'dot'); dot.style.background = statusColor(f.status);
    const who = el('span', 'who', f.name); who.appendChild(el('span', 'st', f.status));
    r.append(dot, who);
    if (!inParty.has(f.pid)) {
      const b = el('button', 'btn small yellow', 'Einladen');
      b.disabled = full || f.status === 'Im Spiel';
      b.onclick = () => { send({ t: 'invite', pid: f.pid }); b.disabled = true; setTimeout(() => { b.disabled = false; }, 4000); };
      r.appendChild(b);
    }
    const x = el('button', 'x', '✕'); x.title = 'Freund entfernen';
    x.onclick = () => { if (confirm(`${f.name} als Freund entfernen?`)) send({ t: 'friendRemove', pid: f.pid }); };
    r.appendChild(x);
    body.appendChild(r);
  }
  if (offline.length) {
    body.appendChild(el('div', 'sec', `Offline (${offline.length})`));
    for (const f of offline) {
      const r = el('div', 'row');
      const dot = el('span', 'dot'); dot.style.background = statusColor('Offline');
      const who = el('span', 'who', f.name); who.appendChild(el('span', 'st', 'Offline'));
      const x = el('button', 'x', '✕'); x.title = 'Freund entfernen';
      x.onclick = () => {
        if (!confirm(`${f.name} als Freund entfernen?`)) return;
        profile.friends = profile.friends.filter(o => o.pid !== f.pid); save('friends', profile.friends);
        send({ t: 'friendRemove', pid: f.pid }); renderFriends();
      };
      r.append(dot, who, x); body.appendChild(r);
    }
  }
  const fset = new Set(list.map(f => f.pid));
  const recent = profile.recent.filter(p => !fset.has(p.pid) && p.pid !== me.pid);
  if (recent.length) {
    body.appendChild(el('div', 'sec', 'Zuletzt gespielt'));
    for (const p of recent) {
      const r = el('div', 'row');
      r.append(el('span', 'who', p.name));
      const b = el('button', 'btn small', 'Hinzufügen'); b.onclick = () => { send({ t: 'friendAdd', name: p.name }); b.disabled = true; };
      r.appendChild(b); body.appendChild(r);
    }
  }
}

// ---------- Einladungen ----------
function showInvite(m) {
  sfx.pick();
  const card = el('div', 'inv sketch');
  const t = el('div'); t.append(el('b', '', m.from), document.createTextNode(' lädt dich in die Party ein.'));
  const acts = el('div', 'acts');
  const a = el('button', 'btn small green', 'Annehmen');
  const d = el('button', 'btn small', 'Ablehnen');
  const close = () => card.remove();
  a.onclick = () => { send({ t: 'inviteAccept', partyId: m.partyId }); close(); };
  d.onclick = () => { send({ t: 'inviteDecline', fromPid: m.fromPid }); close(); };
  acts.append(a, d); card.append(t, acts);
  $('invites').appendChild(card);
  setTimeout(close, 30000);
}

// ================= Lobby-Bühne =================
const stage = $('stage'), sctx = stage.getContext('2d');
const mouse = { x: 0, y: 0, down: false };
let stageSlots = [];
function ellipsePts(cx, cy, rx, ry, n) { const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return o; }
function fitCanvas(c, ctx2) {
  const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  ctx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w: r.width, h: r.height };
}
function paperGrid(c2, w, h, step = 32) {
  c2.fillStyle = PAPER; c2.fillRect(0, 0, w, h);
  c2.strokeStyle = GRID; c2.lineWidth = 1; c2.beginPath();
  for (let x = 0; x < w; x += step) { c2.moveTo(x + 0.5, 0); c2.lineTo(x + 0.5, h); }
  for (let y = 0; y < h; y += step) { c2.moveTo(0, y + 0.5); c2.lineTo(w, y + 0.5); }
  c2.stroke();
}
function drawStage(time) {
  const { w, h } = fitCanvas(stage, sctx);
  paperGrid(sctx, w, h);
  const t = time / 1000;
  // Sonne, ferne Berge, Wolken
  sketchFill(sctx, circlePts(w * 0.84, h * 0.2, Math.min(w, h) * 0.08, 18, 5, 0.05), 5, '#ffe08a', 1.5, 2.5);
  const hz = h * 0.56;
  const hills = [[0, hz]];
  for (let i = 0; i <= 12; i++) hills.push([w * i / 12, hz - (Math.sin(i * 1.7) * 0.5 + 0.6) * h * 0.12]);
  hills.push([w, hz]);
  sketchFill(sctx, hills, 31, '#efe2c0', 2, 2.2);
  for (let i = 0; i < 3; i++) {
    const cx = ((t * 12 + i * 420) % (w + 300)) - 150, cy = h * (0.12 + i * 0.07);
    sketchFill(sctx, [...circlePts(cx, cy, 26, 10, i), ...circlePts(cx + 30, cy + 4, 20, 8, i + 3)], 50 + i, '#ffffff', 1.4, 2);
  }
  sctx.strokeStyle = INK; sctx.lineWidth = 2.5; sctx.beginPath(); sctx.moveTo(0, hz); sctx.lineTo(w, hz); sctx.stroke();

  const members = party ? [...party.members].sort((a, b) => (a.pid === me.pid ? -1 : b.pid === me.pid ? 1 : 0)) : [];
  const xs = [0.38, 0.62, 0.16, 0.84];
  const usable = w < 1200 ? w - 260 : w; // rechts Platz für den Spielen-Knopf lassen
  const sc = clamp(Math.min(usable / 260, h / 200), 1.4, 4.4);
  stageSlots = [];
  for (let i = 0; i < 4; i++) {
    const x = usable * xs[i], y = h * 0.66;
    const m = members[i];
    const plat = ellipsePts(x, y + sc * 24, sc * 36, sc * 10, 22);
    if (m) {
      sketchFill(sctx, plat, 90 + i, '#fff6d8', 1.4, 2.5);
      const aim = Math.atan2(mouse.y - y, mouse.x - x);
      drawTank(sctx, x, y + Math.sin(t * 2 + i) * 2, -0.28 + Math.sin(t * 0.7 + i) * 0.05, aim, m.skin, hashStr(m.pid), { scale: sc });
      // Namensschild
      const ny = y - sc * 30;
      sctx.font = `${Math.round(14 + sc * 4)}px "Gochi Hand", cursive`; sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
      const tw = sctx.measureText(m.name).width;
      sketchFill(sctx, [[x - tw / 2 - 30, ny - 16], [x + tw / 2 + 14, ny - 16], [x + tw / 2 + 14, ny + 16], [x - tw / 2 - 30, ny + 16]], 120 + i, '#ffffff', 1.2, 2.2);
      sctx.fillStyle = INK; sctx.fillText(m.name, x - 8, ny + 1);
      sketchFill(sctx, circlePts(x - tw / 2 - 16, ny, 11, 12, 140 + i, 0.08), 140 + i, '#f2c94c', 0.8, 1.8);
      sctx.font = 'bold 13px "Patrick Hand", sans-serif'; sctx.fillStyle = INK; sctx.fillText(m.level, x - tw / 2 - 16, ny + 1);
      if (m.pid === party.leader && members.length > 1) drawCrown(sctx, x, ny - 28, 1.3);
      if (m.inMatch) {
        sctx.font = '16px "Patrick Hand", sans-serif';
        sketchFill(sctx, [[x - 40, ny + 20], [x + 40, ny + 20], [x + 40, ny + 40], [x - 40, ny + 40]], 160 + i, '#f2994a', 1, 1.8);
        sctx.fillStyle = INK; sctx.fillText('IM SPIEL', x, ny + 31);
      }
    } else {
      sctx.save(); sctx.setLineDash([8, 7]); sctx.globalAlpha = 0.6;
      sketchStroke(sctx, plat, 90 + i, 1, true, 2.2); sctx.restore();
      const hover = Math.hypot(mouse.x - x, mouse.y - y) < sc * 26;
      sketchFill(sctx, circlePts(x, y, sc * (hover ? 14 : 12), 16, 200 + i, 0.06), 200 + i, hover ? '#f2c94c' : '#ffffff', 1.2, 2.4);
      sctx.strokeStyle = INK; sctx.lineWidth = 3.2; sctx.lineCap = 'round'; sctx.beginPath();
      sctx.moveTo(x - sc * 5, y); sctx.lineTo(x + sc * 5, y); sctx.moveTo(x, y - sc * 5); sctx.lineTo(x, y + sc * 5); sctx.stroke();
      sctx.font = '20px "Patrick Hand", sans-serif'; sctx.fillStyle = '#6b6255'; sctx.textAlign = 'center';
      sctx.fillText('Freund einladen', x, y + sc * 20);
      stageSlots.push({ x, y, r: sc * 28 });
    }
  }
  stage.style.cursor = stageSlots.some(s => Math.hypot(mouse.x - s.x, mouse.y - s.y) < s.r) ? 'pointer' : 'default';
}
stage.addEventListener('mousemove', (e) => { const r = stage.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
stage.addEventListener('click', () => {
  if (stageSlots.some(s => Math.hypot(mouse.x - s.x, mouse.y - s.y) < s.r)) { $('drawer').classList.add('open'); sfx.click(); setTimeout(() => $('addName').focus(), 200); }
});

// Hintergrund für den Namensbildschirm
const loginBg = $('loginBg'), lctx = loginBg.getContext('2d');
const bgTanks = [0, 1, 2, 3, 4].map(i => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, a: Math.random() * 6.28, turn: 0, skin: SKINS[i].id, seed: i * 1000 + 17 }));
function drawLoginBg(time) {
  const { w, h } = fitCanvas(loginBg, lctx);
  paperGrid(lctx, w, h);
  for (const t of bgTanks) {
    t.turn += (Math.random() - 0.5) * 0.02; t.turn *= 0.98; t.a += t.turn;
    t.x += Math.cos(t.a) * 0.6; t.y += Math.sin(t.a) * 0.6;
    if (t.x < -40) t.x = w + 40; if (t.x > w + 40) t.x = -40; if (t.y < -40) t.y = h + 40; if (t.y > h + 40) t.y = -40;
    drawTank(lctx, t.x, t.y, t.a, t.a + Math.sin(time / 900 + t.seed) * 0.8, t.skin, t.seed, { alpha: 0.35, scale: 1.4 });
  }
}

// ================= Spiel =================
const cv = $('cv'), ctx = cv.getContext('2d');
const mini = $('mini'), mctx = mini.getContext('2d');
let inGame = false;
const G = {};
const keys = {};
const gm = { x: innerWidth / 2, y: innerHeight / 2, down: false };

function resetG() {
  Object.assign(G, {
    map: null, roster: new Map(), myTeam: 0, teamSize: 1, prev: null, prevMap: new Map(), cur: null, curT: 0,
    cam: { x: 1200, y: 1200, z: 0.8, init: false }, bushes: [], particles: [], effects: [], floats: [], feed: [],
    flash: new Map(), shake: 0, lastZoneSt: null, warned: false, lastCd: 99, miniStatic: null, lastFrame: performance.now(),
    hitMark: 0, dead: false, result: null, aim: 0, lastHp: 100, confetti: [], tutTimers: [],
  });
}
resetG();

function startGame(m) {
  resetG();
  G.map = m.map; G.maxHp = m.maxHp; G.bushMax = m.bushHp;
  G.bushes = m.map.bushes.map(b => ({ ...b }));
  for (const r of m.roster) G.roster.set(r.id, r);
  G.myTeam = m.myTeam; G.teamSize = m.roster.filter(r => r.team === m.myTeam).length;
  inGame = true;
  for (const id of ['deathCard', 'resultCard']) $(id).classList.add('hidden');
  $('feed').innerHTML = ''; $('center').innerHTML = ''; $('tutorial').innerHTML = ''; $('mates').innerHTML = '';
  $('invites').innerHTML = '';
  show('game');
  buildMiniStatic();
  ac();
  if (!profile.tut) runTutorial();
}
function exitGame() {
  if (!inGame) return;
  inGame = false;
  for (const tm of G.tutTimers) clearTimeout(tm);
  resetG();
  show(loggedIn ? 'lobby' : 'login');
}
$('btnLobby1').onclick = () => send({ t: 'toLobby' });
$('btnLobby2').onclick = () => send({ t: 'toLobby' });
$('btnSpec').onclick = () => send({ t: 'spectate' });
$('btnWatch').onclick = () => { $('resultCard').classList.add('hidden'); $('deathCard').classList.remove('hidden'); };

function runTutorial() {
  const tips = [
    'WASD fahren · Maus zielen · Klick schießen',
    'Bleib in der Zone – draußen verlierst du Leben',
    'Im Busch bist du unsichtbar',
    'Feinde im Busch? Erst den Busch zerschießen!',
    'Oben auf dem Berg treffen dich Schüsse von unten nicht',
    'Sammle Kisten: Reparatur, Tempo, Kanone und mehr',
  ];
  const box = $('tutorial');
  tips.forEach((tip, i) => {
    G.tutTimers.push(setTimeout(() => { box.innerHTML = ''; box.appendChild(el('div', '', tip)); }, i * 2800));
  });
  G.tutTimers.push(setTimeout(() => { box.innerHTML = ''; }, tips.length * 2800));
  profile.tut = true; save('tut', true);
}

function nameOf(id) { const r = G.roster.get(id); return r ? r.name : '?'; }
function skinIdOf(id) { const r = G.roster.get(id); return r ? r.skin : 'rot'; }
function teamOf(id) { const r = G.roster.get(id); return r ? r.team : -1; }
function bushIdx(x, y) { for (let i = 0; i < G.bushes.length; i++) { const b = G.bushes[i]; if (b.hp > 0 && Math.hypot(x - b.x, y - b.y) < b.r) return i; } return -1; }
function heightAt(x, y) {
  let h = 0;
  for (const hl of G.map.hills) {
    const d = Math.hypot(x - hl.x, y - hl.y);
    if (d >= hl.r) continue; if (d <= hl.p) return 1;
    let k = (hl.r - d) / (hl.r - hl.p); k = k * k * (3 - 2 * k); if (k > h) h = k;
  }
  return h;
}
function focusPos() { return { x: G.cam.x, y: G.cam.y }; }
function volAt(x, y) { const f = focusPos(); return clamp(1 - Math.hypot(x - f.x, y - f.y) / 900, 0, 1); }

function centerMsg(big, small, ms = 1600) {
  const c = $('center'); c.innerHTML = '';
  if (big) c.appendChild(el('div', 'big', big));
  if (small) { c.appendChild(document.createElement('br')); c.appendChild(el('div', 'small', small)); }
  clearTimeout(G.centerT); G.centerT = setTimeout(() => { c.innerHTML = ''; }, ms);
}
function addFeed(text, mine) {
  const d = el('div', mine ? 'mine' : '', text);
  $('feed').prepend(d);
  while ($('feed').children.length > 5) $('feed').lastChild.remove();
  setTimeout(() => d.remove(), 6000);
}
function leafBurst(x, y, n, col = '#6fae55') {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 90;
    G.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.5, t: 0, rot: Math.random() * 6, col });
  }
}

function onState(s) {
  if (!inGame) return;
  G.prev = G.cur; G.cur = s; G.curT = performance.now();
  G.prevMap = new Map(G.prev ? G.prev.tanks.map(t => [t.i, t]) : []);
  const now = performance.now();
  for (const e of s.ev) {
    switch (e.k) {
      case 'shot': G.effects.push({ k: 'shot', x: e.x, y: e.y, a: e.a, t0: now, life: 110 }); sfx.shot(e.i === me.pid ? 1 : volAt(e.x, e.y) * 0.7); break;
      case 'hit':
        G.flash.set(e.v, now + 90);
        if (e.by === me.pid) { G.floats.push({ x: e.x, y: e.y - 20, text: String(e.d), col: '#f2c94c', t0: now }); G.hitMark = now; sfx.hit(); }
        if (e.v === s.f) {
          G.shake = Math.min(14, G.shake + 7);
          if (e.v === me.pid) { G.floats.push({ x: e.x, y: e.y - 20, text: '-' + e.d, col: '#e8594f', t0: now }); $('hurt').style.transition = 'none'; $('hurt').style.opacity = 1; requestAnimationFrame(() => { $('hurt').style.transition = 'opacity .5s'; $('hurt').style.opacity = 0; }); sfx.hurt(); }
        }
        break;
      case 'boom': G.effects.push({ k: 'boom', x: e.x, y: e.y, t0: now, life: 900 }); G.shake = Math.min(16, G.shake + 6 * volAt(e.x, e.y)); sfx.boom(volAt(e.x, e.y)); break;
      case 'puff': G.effects.push({ k: 'puff', x: e.x, y: e.y, t0: now, life: 350 }); break;
      case 'dirt': G.effects.push({ k: 'dirt', x: e.x, y: e.y, t0: now, life: 450 }); sfx.dirt(volAt(e.x, e.y)); break;
      case 'bush': {
        const b = G.bushes[e.i];
        if (b) { b.hp = e.hp; leafBurst(e.x, e.y, e.hp > 0 ? 6 : 24); if (Math.hypot(e.x - G.cam.x, e.y - G.cam.y) < 1000) sfx.bush(volAt(e.x, e.y)); }
        break;
      }
      case 'tp': G.effects.push({ k: 'tp', x: e.x, y: e.y, t0: now, life: 600 }); break;
      case 'pick':
        G.effects.push({ k: 'pick', x: e.x, y: e.y, type: e.type, t0: now, life: 900 });
        if (e.by === me.pid) sfx.pick();
        break;
      case 'feed': addFeed(e.text, e.by === me.pid || e.v === me.pid); break;
      case 'elim':
        if (e.by === me.pid) { centerMsg('ERLEDIGT', e.vn, 1500); sfx.kill(); }
        break;
      case 'zone': centerMsg('Die Zone schrumpft!', null, 1800); sfx.zone(); break;
    }
  }
  // Countdown
  if (s.cd > 0) {
    const n = Math.ceil(s.cd);
    if (n !== G.lastCd) { G.lastCd = n; centerMsg(String(n), null, 900); sfx.tick(); }
  } else if (G.lastCd !== 0) { G.lastCd = 0; centerMsg('LOS!', null, 900); sfx.go(); }
  // Zonen-Warnung
  if (s.z.st === 'wait' && s.z.left < 10.5 && !G.warned) { G.warned = true; centerMsg(null, 'Zone schrumpft in 10 Sekunden', 1800); }
  if (s.z.st !== 'wait') G.warned = false;
  updateHud(s);
}

function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function updateHud(s) {
  $('hAlive').textContent = s.al;
  $('hKills').textContent = s.me.kills;
  const z = s.z;
  const zi = $('zoneInfo');
  zi.textContent = z.st === 'wait' ? `Zone schrumpft in ${fmt(z.left)}` : z.st === 'shrink' ? 'Die Zone zieht sich zusammen!' : 'Letzte Zone';
  const myT = s.tanks.find(t => t.i === me.pid);
  const outside = myT && Math.hypot(myT.x - z.x, myT.y - z.y) > z.r;
  zi.classList.toggle('warn', !!outside || z.st === 'shrink');
  $('vignette').style.opacity = outside ? 1 : 0;
  const hp = s.me.alive ? s.me.hp : 0, pct = clamp(hp / (G.maxHp || 100) * 100, 0, 100);
  $('hpBar').style.width = pct + '%'; $('hpLag').style.width = pct + '%';
  $('hpBar').style.background = pct > 50 ? '#6fcf6f' : pct > 25 ? '#f2c94c' : '#e8594f';
  $('hpText').textContent = hp;
  const chips = $('chips'); chips.innerHTML = '';
  if (s.me.alive) {
    if (s.me.k > 0) chips.appendChild(el('span', 'chip', `Kanone Stufe ${s.me.k + 1}`)).style.background = PICKUPS.K.color;
    if (s.me.rf > 0) chips.appendChild(el('span', 'chip', `Schnellfeuer ${Math.ceil(s.me.rf)}s`)).style.background = PICKUPS.F.color;
    if (s.me.sp > 0) chips.appendChild(el('span', 'chip', `Tempo ${Math.ceil(s.me.sp)}s`)).style.background = PICKUPS.T.color;
    if (s.me.df > 0) chips.appendChild(el('span', 'chip', `Doppelschuss ${Math.ceil(s.me.df)}s`)).style.background = PICKUPS.D.color;
  }
  // Teamkameraden
  const mates = $('mates'); mates.innerHTML = '';
  if (G.teamSize > 1) {
    for (const [id, , , alive, mhp] of s.mates) {
      if (id === me.pid) continue;
      const d = el('div', 'mate' + (alive ? '' : ' dead'), nameOf(id));
      const bar = el('div', 'mb'); const i = el('i'); i.style.width = (alive ? mhp : 0) + '%'; bar.appendChild(i); d.appendChild(bar);
      mates.appendChild(d);
    }
  }
  if (!s.me.alive && !$('deathCard').classList.contains('hidden')) {
    $('deathBy').textContent = (G.deathText || '') + (s.f !== me.pid ? `  ·  Du schaust zu: ${nameOf(s.f)}` : '');
  }
}

function onDead(m) {
  G.deathText = m.by ? `Erledigt von ${m.by}` : m.cause === 'zone' ? 'Die Zone hat dich erwischt' : '';
  if (!G.result) $('deathCard').classList.remove('hidden');
  $('deathBy').textContent = G.deathText;
  $('vignette').style.opacity = 0;
  sfx.boom(1);
}

function onResult(m) {
  let xp = 50 + m.kills * 120 + Math.round(m.dmg * 0.8);
  if (m.win) xp += 500; else if (m.place <= 3) xp += 200; else if (m.place <= Math.ceil(m.teams / 2)) xp += 80;
  const before = levelInfo(profile.xp).lvl;
  profile.xp += xp; save('xp', profile.xp);
  const after = levelInfo(profile.xp).lvl;
  for (const p of m.players) { profile.recent = profile.recent.filter(r => r.pid !== p.pid); profile.recent.unshift(p); }
  profile.recent = profile.recent.slice(0, 10); save('recent', profile.recent);
  if (after > before) {
    const unlocked = SKINS.filter(s => s.lvl > before && s.lvl <= after).map(s => s.name);
    setTimeout(() => toast(`Level ${after} erreicht!` + (unlocked.length ? ` Neu im Spind: ${unlocked.join(', ')}` : '')), 900);
    sendProfile();
  }
  updateLevelUi();
  if (!inGame || !m.inMatch) { toast(m.win ? `Dein Team hat gewonnen! +${xp} XP` : `Platz ${m.place}  +${xp} XP`); return; }
  G.result = m;
  $('deathCard').classList.add('hidden');
  $('resTitle').textContent = m.win ? 'SIEG!' : `Platz ${m.place}`;
  $('resSub').textContent = m.win ? 'Dein Team ist als letztes übrig.' : `von ${m.teams} Teams`;
  $('resKills').textContent = m.kills; $('resDmg').textContent = m.dmg; $('resXp').textContent = '+' + xp;
  $('btnWatch').classList.toggle('hidden', !!m.win);
  $('resultCard').classList.remove('hidden');
  if (m.win) {
    sfx.win();
    for (let i = 0; i < 120; i++) G.confetti.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5, vy: 80 + Math.random() * 120, vx: (Math.random() - 0.5) * 60, r: Math.random() * 6, col: ['#e8594f', '#4f86e8', '#6fcf6f', '#f2c94c', '#9b6be0'][i % 5] });
  }
}

// ---------- Eingabe ----------
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (inGame && [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; gm.down = false; });
cv.addEventListener('mousemove', (e) => { gm.x = e.clientX; gm.y = e.clientY; });
cv.addEventListener('mousedown', (e) => { if (e.button === 0) gm.down = true; gm.x = e.clientX; gm.y = e.clientY; ac(); });
addEventListener('mouseup', () => { gm.down = false; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());

function screenToWorld(sx, sy) { const z = G.cam.z; return { x: G.cam.x + (sx - innerWidth / 2) / z, y: G.cam.y + (sy - innerHeight / 2) / z }; }
setInterval(() => {
  if (!inGame || !G.cur || !G.cur.me.alive || G.cur.cd > 0) return;
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  send({ t: 'input', dx, dy, aim: G.aim, fire: gm.down || !!keys[' '] });
}, 33);

// ---------- Minimap ----------
function buildMiniStatic() {
  const S = 380, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), k = S / G.map.size;
  x.fillStyle = PAPER; x.fillRect(0, 0, S, S);
  for (const hl of G.map.hills) {
    x.fillStyle = '#ecdcb2'; x.beginPath(); x.arc(hl.x * k, hl.y * k, hl.r * k, 0, 7); x.fill();
    x.fillStyle = '#dcc68e'; x.beginPath(); x.arc(hl.x * k, hl.y * k, hl.p * k, 0, 7); x.fill();
    x.strokeStyle = '#a8946a'; x.lineWidth = 1.5; x.beginPath(); x.arc(hl.x * k, hl.y * k, hl.r * k, 0, 7); x.stroke();
  }
  x.fillStyle = '#9fd68a';
  for (const b of G.map.bushes) { x.beginPath(); x.arc(b.x * k, b.y * k, b.r * k, 0, 7); x.fill(); }
  x.fillStyle = '#8f877a';
  for (const r of G.map.rocks) { x.beginPath(); x.arc(r.x * k, r.y * k, Math.max(2, r.r * k), 0, 7); x.fill(); }
  for (const tp of G.map.teleports) { x.fillStyle = tp.color; x.beginPath(); x.arc(tp.x * k, tp.y * k, 5, 0, 7); x.fill(); }
  G.miniStatic = c;
}
function drawMini() {
  const { w } = fitCanvas(mini, mctx);
  const s = G.cur; if (!s || !G.miniStatic) return;
  const k = w / G.map.size;
  mctx.drawImage(G.miniStatic, 0, 0, w, w);
  const z = s.z;
  mctx.save();
  mctx.beginPath(); mctx.rect(0, 0, w, w); mctx.arc(z.x * k, z.y * k, Math.max(0, z.r * k), 0, Math.PI * 2, true);
  mctx.fillStyle = 'rgba(80,100,230,.28)'; mctx.fill('evenodd');
  mctx.strokeStyle = '#4a5fd0'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(z.x * k, z.y * k, Math.max(0, z.r * k), 0, 7); mctx.stroke();
  if (z.st !== 'done') { mctx.setLineDash([4, 3]); mctx.strokeStyle = '#ffffff'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(z.tx * k, z.ty * k, Math.max(0, z.tr * k), 0, 7); mctx.stroke(); mctx.setLineDash([]); }
  mctx.restore();
  for (const [id, x, y, alive] of s.mates) {
    if (!alive || id === me.pid) continue;
    mctx.fillStyle = '#6fcf6f'; mctx.strokeStyle = INK; mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.arc(x * k, y * k, 4, 0, 7); mctx.fill(); mctx.stroke();
  }
  // eigene Position / Zuschau-Ziel
  const fx = G.cam.x * k, fy = G.cam.y * k;
  mctx.save(); mctx.translate(fx, fy); mctx.rotate(G.aim);
  mctx.fillStyle = '#f2c94c'; mctx.strokeStyle = INK; mctx.lineWidth = 1.8;
  mctx.beginPath(); mctx.moveTo(8, 0); mctx.lineTo(-5, -5); mctx.lineTo(-2, 0); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
  // Sichtfeld
  const vw = innerWidth / G.cam.z * k, vh = innerHeight / G.cam.z * k;
  mctx.strokeStyle = 'rgba(43,38,32,.35)'; mctx.lineWidth = 1; mctx.strokeRect(fx - vw / 2, fy - vh / 2, vw, vh);
}

// ---------- Welt zeichnen ----------
function drawHill(hl, i) {
  const n = Math.round(clamp(hl.r / 7, 24, 60));
  ctx.save();
  sketchFill(ctx, circlePts(hl.x, hl.y, hl.r, n, i * 7, 0.03), i * 7, '#f1e5c6', 2, 2.2, '#8a7a58');
  sketchFill(ctx, circlePts(hl.x, hl.y, (hl.r + hl.p) / 2, n, i * 7 + 1, 0.04), i * 7 + 1, '#ead9ae', 1.6, 1.6, '#9a8a66');
  sketchFill(ctx, circlePts(hl.x, hl.y, hl.p, n, i * 7 + 2, 0.05), i * 7 + 2, '#e1cc95', 1.4, 2.4);
  // Schraffur am Hang (zeigt bergab)
  const r = rng(i * 13 + 5);
  ctx.strokeStyle = '#8a7a58'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath();
  const cnt = Math.round(hl.r / 5);
  for (let k = 0; k < cnt; k++) {
    const a = k / cnt * Math.PI * 2 + r() * 0.04, r0 = hl.p + 6 + r() * 8, r1 = r0 + (hl.r - hl.p) * (0.35 + r() * 0.35);
    ctx.moveTo(hl.x + Math.cos(a) * r0, hl.y + Math.sin(a) * r0); ctx.lineTo(hl.x + Math.cos(a) * r1, hl.y + Math.sin(a) * r1);
  }
  ctx.stroke();
  ctx.restore();
}
function drawRock(k, i) {
  const pts = circlePts(k.x, k.y, k.r, 12, i * 31 + 5, 0.3);
  sketchFill(ctx, pts, i * 31 + 5, '#d4cdbd', 1.6, 2.6);
  hatchIn(ctx, pts, k.x, k.y - k.r, k.x + k.r, k.y + k.r, 5, '#8f877a', i * 7);
}
function bushPts(b, scale) {
  const pts = [], n = 24;
  for (let j = 0; j < n; j++) { const a = j / n * Math.PI * 2, R = b.r * scale + (j % 2 ? 4 : -2); pts.push([b.x + Math.cos(a) * R, b.y + Math.sin(a) * R]); }
  return pts;
}
function drawBush(b, i, friendlyInside, shaking) {
  const ratio = b.hp / (G.bushMax || 60);
  const sx = shaking ? Math.sin(performance.now() / 40 + i) * 1.2 : 0;
  const bb = { x: b.x + sx, y: b.y, r: b.r };
  ctx.save();
  ctx.globalAlpha = friendlyInside ? 0.62 : 0.94;
  const col = ratio > 0.66 ? '#9fd68a' : ratio > 0.33 ? '#b4d88e' : '#c9dc9a';
  sketchFill(ctx, bushPts(bb, 0.78 + 0.22 * ratio), i * 17 + 3, col, 1.5, 2.2);
  ctx.restore();
  const r = rng(i * 5 + 1); ctx.strokeStyle = '#4f8a3c'; ctx.lineWidth = 1.6; ctx.beginPath();
  for (let j = 0; j < 6; j++) {
    const ax = bb.x + (r() - 0.5) * b.r * 1.1, ay = bb.y + (r() - 0.5) * b.r * 1.1;
    ctx.moveTo(ax - 4, ay + 2); ctx.quadraticCurveTo(ax, ay - 4, ax + 4, ay + 2);
  }
  ctx.stroke();
  if (ratio < 0.99) { // Risse
    ctx.strokeStyle = '#6b8a4a'; ctx.lineWidth = 1.4; ctx.beginPath();
    const cracks = Math.ceil((1 - ratio) * 5);
    for (let j = 0; j < cracks; j++) { const a = r() * 6.28, d = r() * b.r * 0.5; const cx = bb.x + Math.cos(a) * d, cy = bb.y + Math.sin(a) * d; ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 5); ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx - 5, cy + 5); }
    ctx.stroke();
  }
}
function drawStubble(b, i) {
  const r = rng(i * 11 + 2);
  ctx.strokeStyle = '#8aa76a'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath();
  for (let j = 0; j < 14; j++) {
    const a = r() * 6.28, d = r() * b.r * 0.85, x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d;
    ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 4, y - 4 - r() * 4);
  }
  ctx.stroke();
}
function drawTeleport(tp, i, t) {
  sketchFill(ctx, circlePts(tp.x, tp.y, tp.r + 6, 16, i * 13, 0.08), i * 13, tp.color + '55', 1.2, 2.4);
  ctx.save(); ctx.strokeStyle = tp.color; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) { const a0 = t * 3 + k * 2.09; ctx.beginPath(); ctx.arc(tp.x, tp.y, tp.r * 0.62, a0, a0 + 1.3); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(tp.x, tp.y, 3.5, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.restore();
}

function drawGame(nowMs) {
  const dt = Math.min(0.05, (nowMs - G.lastFrame) / 1000); G.lastFrame = nowMs;
  const { w, h } = fitCanvas(cv, ctx);
  const s = G.cur;
  ctx.fillStyle = '#e9e0c9'; ctx.fillRect(0, 0, w, h);
  if (!s || !G.map) return;
  const MAP = G.map.size, t = nowMs / 1000;
  const k = Math.min(1, (nowMs - G.curT) / 33);

  // Panzer interpolieren
  const tanks = s.tanks.map(tk => {
    const p = G.prevMap.get(tk.i);
    if (!p || Math.hypot(p.x - tk.x, p.y - tk.y) > 80) return { ...tk };
    return { ...tk, x: lerp(p.x, tk.x, k), y: lerp(p.y, tk.y, k), a: lerpAng(p.a, tk.a, k), ta: lerpAng(p.ta, tk.ta, k), h: lerp(p.h, tk.h, k) };
  });
  const focus = tanks.find(tk => tk.i === s.f);
  const cam = G.cam;
  if (focus) {
    if (!cam.init) { cam.x = focus.x; cam.y = focus.y; cam.init = true; }
    const ff = Math.min(1, dt * 9);
    cam.x += (focus.x - cam.x) * ff; cam.y += (focus.y - cam.y) * ff;
  }
  const baseZ = Math.max(0.5, Math.min(w / 1100, h / 700));
  const zt = baseZ / (1 + 0.22 * (focus ? focus.h : 0));
  cam.z += (zt - cam.z) * Math.min(1, dt * 3);
  const z = cam.z;
  G.shake *= Math.pow(0.002, dt);
  const shx = (Math.random() - 0.5) * G.shake, shy = (Math.random() - 0.5) * G.shake;

  // eigenes Zielen sofort anzeigen
  const myT = tanks.find(tk => tk.i === me.pid);
  if (myT) { const wm = screenToWorld(gm.x, gm.y); G.aim = Math.atan2(wm.y - myT.y, wm.x - myT.x); myT.ta = G.aim; }

  const dpr = devicePixelRatio || 1;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z + shx), dpr * (h / 2 - cam.y * z + shy));
  const vx0 = cam.x - w / 2 / z - 80, vy0 = cam.y - h / 2 / z - 80, vx1 = cam.x + w / 2 / z + 80, vy1 = cam.y + h / 2 / z + 80;
  const vis = (o, r) => o.x + r > vx0 && o.x - r < vx1 && o.y + r > vy0 && o.y - r < vy1;

  // Papier + Karo
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, MAP, MAP);
  ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = Math.max(0, Math.floor(vx0 / 80) * 80); x <= Math.min(MAP, vx1); x += 80) { ctx.moveTo(x, Math.max(0, vy0)); ctx.lineTo(x, Math.min(MAP, vy1)); }
  for (let y = Math.max(0, Math.floor(vy0 / 80) * 80); y <= Math.min(MAP, vy1); y += 80) { ctx.moveTo(Math.max(0, vx0), y); ctx.lineTo(Math.min(MAP, vx1), y); }
  ctx.stroke();
  const edge = [];
  for (let i = 0; i <= 24; i++) edge.push([MAP * i / 24, 0]);
  for (let i = 1; i <= 24; i++) edge.push([MAP, MAP * i / 24]);
  for (let i = 1; i <= 24; i++) edge.push([MAP - MAP * i / 24, MAP]);
  for (let i = 1; i < 24; i++) edge.push([0, MAP - MAP * i / 24]);
  sketchStroke(ctx, edge, 4242, 2.5, true, 4);

  G.map.hills.forEach((hl, i) => { if (vis(hl, hl.r)) drawHill(hl, i); });
  G.map.teleports.forEach((tp, i) => { if (vis(tp, 40)) drawTeleport(tp, i, t); });
  G.bushes.forEach((b, i) => { if (b.hp <= 0 && vis(b, b.r)) drawStubble(b, i); });
  G.map.rocks.forEach((r, i) => { if (vis(r, r.r)) drawRock(r, i); });
  for (const [id, type, x, y] of s.p) {
    if (!vis({ x, y }, 20)) continue;
    drawPickup(ctx, type, x, y + Math.sin(t * 3 + (hashStr(id) % 7)) * 2.5, hashStr(id));
  }

  // Panzer (höhere oben drauf)
  tanks.sort((a, b) => a.h - b.h);
  const occ = new Set(s.occ);
  const friendlyBush = new Set();
  for (const tk of tanks) {
    if (!vis(tk, 40)) continue;
    const mine = teamOf(tk.i) === G.myTeam;
    const bi = bushIdx(tk.x, tk.y);
    if (bi >= 0 && mine) friendlyBush.add(bi);
    const sc = 1.12 + 0.16 * tk.h;
    ctx.fillStyle = 'rgba(43,38,32,.13)';
    ctx.beginPath(); ctx.ellipse(tk.x + 3 + 7 * tk.h, tk.y + 4 + 9 * tk.h, 21 * sc, 17 * sc, 0, 0, 7); ctx.fill();
    if (tk.sp) {
      ctx.strokeStyle = '#b7ab94'; ctx.lineWidth = 1.5;
      for (let j = 1; j <= 3; j++) { ctx.beginPath(); ctx.arc(tk.x - Math.cos(tk.a) * (16 + j * 8), tk.y - Math.sin(tk.a) * (16 + j * 8), 2 + j, 0, 7); ctx.stroke(); }
    }
    drawTank(ctx, tk.x, tk.y, tk.a, tk.ta, skinIdOf(tk.i), hashStr(tk.i), {
      scale: sc, alpha: bi >= 0 && mine ? 0.7 : 1, flash: (G.flash.get(tk.i) || 0) > nowMs, double: !!tk.df,
      cannon: tk.i === me.pid ? s.me.k : 0,
    });
  }

  // Kugeln
  for (const [x, y, friendly] of s.b) {
    if (!vis({ x, y }, 10)) continue;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, 4.6, 0, 7); ctx.fill();
    ctx.fillStyle = friendly ? '#f2c94c' : '#e8594f'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
  }

  // Büsche über den Panzern + Blätter, wenn jemand drin ist
  G.bushes.forEach((b, i) => {
    if (b.hp <= 0 || !vis(b, b.r + 10)) return;
    drawBush(b, i, friendlyBush.has(i), occ.has(i));
    if (occ.has(i) && Math.random() < dt * 9) {
      const a = Math.random() * 6.28, d = Math.random() * b.r * 0.7;
      G.particles.push({ x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 0.7 + Math.random() * 0.4, t: 0, rot: Math.random() * 6, col: Math.random() < 0.5 ? '#5f9e45' : '#8cc46e' });
    }
  });

  // Namen + Lebensbalken
  for (const tk of tanks) {
    if (!vis(tk, 40) || tk.i === me.pid) continue;
    const mine = teamOf(tk.i) === G.myTeam;
    const y = tk.y - 30 - 4 * tk.h;
    ctx.font = '15px "Patrick Hand", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mine ? '#2f8a3a' : INK;
    ctx.fillText(nameOf(tk.i), tk.x, y - 6);
    ctx.fillStyle = '#fff'; ctx.fillRect(tk.x - 20, y - 3, 40, 6);
    ctx.fillStyle = mine ? '#6fcf6f' : '#e8594f'; ctx.fillRect(tk.x - 20, y - 3, 40 * clamp(tk.hp / (G.maxHp || 100), 0, 1), 6);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(tk.x - 20, y - 3, 40, 6);
  }

  // Partikel
  G.particles = G.particles.filter(p => (p.t += dt) < p.life);
  for (const p of G.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy = p.vy * 0.94 + 25 * dt; p.rot += dt * 5;
    if (!vis(p, 5)) continue;
    ctx.save(); ctx.globalAlpha = 1 - p.t / p.life; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, 4, 2, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3f6f2e'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore();
  }

  // Effekte
  G.effects = G.effects.filter(e => nowMs - e.t0 < e.life);
  for (const e of G.effects) {
    if (!vis(e, 60)) continue;
    const p = (nowMs - e.t0) / e.life;
    ctx.save(); ctx.globalAlpha = 1 - p;
    if (e.k === 'shot') {
      ctx.translate(e.x, e.y); ctx.rotate(e.a); ctx.fillStyle = '#ffd25c';
      ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(16 * (1 - p) + 6, 0); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
    } else if (e.k === 'boom') {
      const r = rng(Math.round(e.x * 7 + e.y));
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath();
      for (let j = 0; j < 14; j++) {
        const a = j / 14 * Math.PI * 2 + r(), r0 = 8 + p * 22, r1 = 18 + p * 46 * (0.6 + r() * 0.6);
        ctx.moveTo(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0); ctx.lineTo(e.x + Math.cos(a) * r1, e.y + Math.sin(a) * r1);
      }
      ctx.stroke();
      sketchFill(ctx, circlePts(e.x, e.y, 12 + p * 24, 12, 9, 0.5), 9, '#ffcf5c', 2);
      sketchFill(ctx, circlePts(e.x, e.y, 6 + p * 12, 10, 19, 0.5), 19, '#ff8a4c', 1.5, 1.5);
    } else if (e.k === 'puff') {
      ctx.fillStyle = '#b8b0a2'; for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.arc(e.x + Math.cos(j * 1.6) * p * 10, e.y + Math.sin(j * 1.6) * p * 10, 3 + p * 4, 0, 7); ctx.fill(); }
    } else if (e.k === 'dirt') {
      ctx.fillStyle = '#a58a5a'; for (let j = 0; j < 6; j++) { ctx.beginPath(); ctx.arc(e.x + Math.cos(j * 1.1) * p * 14, e.y + Math.sin(j * 1.1) * p * 14 - p * 6, 2.5, 0, 7); ctx.fill(); }
    } else if (e.k === 'tp') {
      ctx.strokeStyle = '#9a6cff'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + p * 36, 0, 7); ctx.stroke();
    } else if (e.k === 'pick') {
      ctx.strokeStyle = '#e0a400'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + p * 28, 0, 7); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = 'bold 17px "Patrick Hand", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(PICKUPS[e.type].name + '!', e.x, e.y - 22 - p * 22);
    }
    ctx.restore();
  }
  // Schadenszahlen
  G.floats = G.floats.filter(f => nowMs - f.t0 < 900);
  for (const f of G.floats) {
    const p = (nowMs - f.t0) / 900;
    ctx.save(); ctx.globalAlpha = 1 - p * p;
    ctx.font = `bold ${Math.round(22 + (1 - p) * 6)}px "Gochi Hand", cursive`; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(f.text, f.x, f.y - p * 34);
    ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y - p * 34);
    ctx.restore();
  }

  // Zone
  const zn = s.z;
  ctx.save();
  ctx.beginPath(); ctx.rect(vx0 - 100, vy0 - 100, vx1 - vx0 + 200, vy1 - vy0 + 200);
  ctx.arc(zn.x, zn.y, Math.max(0, zn.r), 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(80,100,230,.17)'; ctx.fill('evenodd');
  ctx.clip('evenodd');
  ctx.strokeStyle = 'rgba(70,90,210,.28)'; ctx.lineWidth = 2; ctx.beginPath();
  const hs = vy1 - vy0;
  for (let x = Math.floor((vx0 - hs) / 26) * 26; x < vx1; x += 26) { ctx.moveTo(x, vy1); ctx.lineTo(x + hs, vy0); }
  ctx.stroke();
  ctx.restore();
  if (zn.r > 0) {
    const n = Math.round(clamp(zn.r / 10, 30, 220));
    sketchStroke(ctx, circlePts(zn.x, zn.y, zn.r, n, 7, 0.004), 7, 2, true, 5, '#4a5fd0');
  }
  if (zn.st !== 'done' && zn.tr > 0) {
    ctx.save(); ctx.setLineDash([18, 14]); ctx.lineDashOffset = -t * 20;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(zn.tx, zn.ty, zn.tr, 0, 7); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }

  // Bildschirm-Ebene: Fadenkreuz, Konfetti
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (s.me.alive) {
    const hit = nowMs - G.hitMark < 160;
    ctx.strokeStyle = hit ? '#e8594f' : INK; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(gm.x, gm.y, 11, 0, 7); ctx.stroke();
    ctx.beginPath();
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(gm.x + a * 6, gm.y + b * 6); ctx.lineTo(gm.x + a * 17, gm.y + b * 17); }
    if (hit) { ctx.moveTo(gm.x - 8, gm.y - 8); ctx.lineTo(gm.x - 3, gm.y - 3); ctx.moveTo(gm.x + 8, gm.y - 8); ctx.lineTo(gm.x + 3, gm.y - 3); ctx.moveTo(gm.x - 8, gm.y + 8); ctx.lineTo(gm.x - 3, gm.y + 3); ctx.moveTo(gm.x + 8, gm.y + 8); ctx.lineTo(gm.x + 3, gm.y + 3); }
    ctx.stroke();
  } else {
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(gm.x, gm.y, 4, 0, 7); ctx.fill();
  }
  if (G.confetti.length) {
    for (const c of G.confetti) {
      c.y += c.vy * dt; c.x += c.vx * dt; c.r += dt * 4;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.col; ctx.fillRect(-4, -2, 8, 4); ctx.restore();
    }
    G.confetti = G.confetti.filter(c => c.y < h + 20);
  }
  drawMini();
}

// ================= Hauptschleife =================
function loop(time) {
  requestAnimationFrame(loop);
  if (screen === 'login') drawLoginBg(time);
  else if (screen === 'lobby' && tab === 'stage') drawStage(time);
  else if (screen === 'game' && inGame) drawGame(time);
}
requestAnimationFrame(loop);
updateLevelUi();
if (!profile.name) showLogin(); else { show('login'); $('loginMsg').textContent = 'Verbinde ...'; }
connect();
