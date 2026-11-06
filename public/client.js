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
  pid: load('pid', null), name: load('name', ''), rp: load('rp', 0),
  skin: load('skin', ['rot', 'blau', 'gruen'][Math.floor(Math.random() * 3)]),
  friends: load('friends', []), recent: load('recent', []), tut: load('tut', false), sound: load('sound', true),
};
if (!profile.pid || !/^[a-z0-9]{8,40}$/.test(profile.pid)) { profile.pid = newPid(); save('pid', profile.pid); }
save('skin', profile.skin);

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
  block: () => { tone(1500, 0.07, 'triangle', 0.09); tone(1100, 0.1, 'sine', 0.07, 0, 0.03); },
  blockOn: () => tone(400, 0.18, 'sine', 0.1, 500),
  jump: () => { noise(0.5, 0.15, 1800); tone(700, 0.4, 'sine', 0.08, -400); },
  land: () => { noise(0.25, 0.3, 300); tone(90, 0.2, 'sine', 0.25, -40); },
  heal: () => { tone(520, 0.12, 'triangle', 0.1); tone(660, 0.12, 'triangle', 0.1, 0, 0.1); tone(880, 0.2, 'triangle', 0.1, 0, 0.2); },
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
  send({ t: 'login', pid: profile.pid, name: profile.name, skin: profile.skin, level: rankInfo(profile.rp).idx, friends: profile.friends });
}
function sendProfile() { send({ t: 'profile', skin: profile.skin, level: rankInfo(profile.rp).idx }); }

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
  const ri = rankInfo(profile.rp);
  const c = $('rankIcon'), x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
  drawRankIcon(x, ri.idx, c.width / 2, c.height * 0.42, c.width * 0.72);
  $('rankName').textContent = ri.rank.name;
  $('xpBar').style.width = (ri.last ? 100 : ri.rest / ri.need * 100).toFixed(1) + '%';
  $('xpText').textContent = ri.last ? `${ri.rest} RP` : `${ri.rest} / ${ri.need} RP`;
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
  const lvl = rankInfo(profile.rp).idx;
  for (const s of SKINS) {
    const locked = lvl < s.lvl;
    const d = el('div', 'skin' + (s.id === profile.skin ? ' on' : '') + (locked ? ' locked' : ''));
    const c = document.createElement('canvas'); c.width = 300; c.height = 200;
    const cx = c.getContext('2d'); cx.scale(2, 2);
    drawTank(cx, 75, 52, -0.3, -0.75, s.id, hashStr(s.id), { scale: 2.1 });
    d.append(c, el('div', 'n', s.name), el('div', 'l', locked ? `Ab Rang ${rankName(s.lvl)}` : s.id === profile.skin ? 'Ausgerüstet' : 'Freigeschaltet'));
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
  $('modeSub').textContent = (n > 1 ? `Team mit ${n} Spielern` : 'Solo') + ' · Kampfbus · Sturm';
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
      who.appendChild(el('span', 'st', (mbr.pid === party.leader ? 'Leiter · ' : '') + rankName(mbr.level) + (mbr.inMatch ? ' · im Spiel' : '')));
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
      drawRankIcon(sctx, m.level, x - tw / 2 - 15, ny - 2, 26);
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

