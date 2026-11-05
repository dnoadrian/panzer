// Panzer-Kritzel – Browser-Teil
'use strict';
const $ = (id) => document.getElementById(id);
const INK = '#2b2620', PAPER = '#f7f1e1', GRID = '#e6dcc6';
const PU_INFO = {
  F: { color: '#ffb4a8', name: 'Feuer' },
  S: { color: '#b6d8ff', name: 'Schild' },
  T: { color: '#fff09a', name: 'Tempo' },
};

// ================= Kritzel-Zeichenhelfer =================
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 4294967296; };
}
function hashStr(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function jit(pts, seed, amp) { const r = rng(seed); return pts.map(([x, y]) => [x + (r() - .5) * amp * 2, y + (r() - .5) * amp * 2]); }
function poly(ctx, pts, closed = true) {
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); if (closed) ctx.closePath();
}
// Zweimal leicht versetzt nachziehen = "gekritzelter" Strich
function sketchStroke(ctx, pts, seed, amp = 1.4, closed = true, width = 2.2, color = INK) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = ctx.lineCap = 'round';
  poly(ctx, jit(pts, seed, amp), closed); ctx.stroke();
  ctx.lineWidth = width * .55; poly(ctx, jit(pts, seed + 99, amp * 1.3), closed); ctx.stroke();
}
function sketchFill(ctx, pts, seed, fill, amp = 1.4, width = 2.2) {
  ctx.fillStyle = fill; poly(ctx, jit(pts, seed + 7, amp * .6)); ctx.fill();
  sketchStroke(ctx, pts, seed, amp, true, width);
}
function circlePts(cx, cy, r, n, seed = 0, wobble = 0) {
  const rr = rng(seed + 1), out = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const R = r * (1 + (rr() - .5) * wobble); out.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  return out;
}
function rectPts(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function hatch(ctx, clipPts, x0, y0, x1, y1, gap, color, seed) {
  ctx.save(); poly(ctx, clipPts); ctx.clip();
  const r = rng(seed); ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.beginPath();
  for (let k = x0 - (y1 - y0); k < x1; k += gap) { ctx.moveTo(k + r() * 2, y1 + r() * 2); ctx.lineTo(k + (y1 - y0) + r() * 2, y0 + r() * 2); }
  ctx.stroke(); ctx.restore();
}

function lighten(hex, f) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.round(c + (255 - c) * f);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

// Panzer zeichnen (Mittelpunkt x,y; a = Wanne, ta = Turm)
function drawTank(ctx, x, y, a, ta, color, seed, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y);
  ctx.save(); ctx.rotate(a);
  // Ketten
  sketchFill(ctx, rectPts(-17, -14, 34, 7), seed + 1, '#5a5146', 1);
  sketchFill(ctx, rectPts(-17, 7, 34, 7), seed + 2, '#5a5146', 1);
  ctx.strokeStyle = '#d8cfbf'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = -14; i < 16; i += 5) { ctx.moveTo(i, -13); ctx.lineTo(i, -8); ctx.moveTo(i, 8); ctx.lineTo(i, 13); }
  ctx.stroke();
  // Wanne
  const body = rectPts(-14, -9, 28, 18);
  sketchFill(ctx, body, seed + 3, lighten(color, .25), 1.2);
  hatch(ctx, body, -14, -9, 14, 9, 6, color, seed + 4);
  ctx.restore();
  // Turm + Rohr
  ctx.save(); ctx.rotate(ta);
  sketchFill(ctx, rectPts(4, -2.6, 20, 5.2), seed + 5, '#5a5146', .8, 2);
  sketchFill(ctx, circlePts(0, 0, 8, 10, seed + 6, .12), seed + 6, lighten(color, .55), 1, 2);
  ctx.restore();
  ctx.restore();
}

// ================= Hintergrund (Lobby) =================
const bg = $('bg'), bgx = bg.getContext('2d');
const bgTanks = [0, 1, 2, 3].map(i => ({
  x: Math.random() * innerWidth, y: Math.random() * innerHeight, a: Math.random() * 6.28, ta: 0, turn: 0,
  color: ['#e8594f', '#4f86e8', '#4fb85a', '#e8a94f'][i], seed: i * 1000 + 17,
}));
let bgOn = true;
function drawBg(time) {
  const dpr = devicePixelRatio || 1, w = innerWidth, h = innerHeight;
  if (bg.width !== Math.round(w * dpr) || bg.height !== Math.round(h * dpr)) { bg.width = w * dpr; bg.height = h * dpr; }
  bgx.setTransform(dpr, 0, 0, dpr, 0, 0);
  bgx.fillStyle = PAPER; bgx.fillRect(0, 0, w, h);
  bgx.strokeStyle = GRID; bgx.lineWidth = 1; bgx.beginPath();
  for (let x = 0; x < w; x += 32) { bgx.moveTo(x + .5, 0); bgx.lineTo(x + .5, h); }
  for (let y = 0; y < h; y += 32) { bgx.moveTo(0, y + .5); bgx.lineTo(w, y + .5); }
  bgx.stroke();
  for (const t of bgTanks) {
    t.turn += (Math.random() - .5) * .02; t.turn *= .98; t.a += t.turn;
    t.x += Math.cos(t.a) * .6; t.y += Math.sin(t.a) * .6;
    if (t.x < -40) t.x = w + 40; if (t.x > w + 40) t.x = -40; if (t.y < -40) t.y = h + 40; if (t.y > h + 40) t.y = -40;
    t.ta = t.a + Math.sin(time / 900 + t.seed) * .8;
    drawTank(bgx, t.x, t.y, t.a, t.ta, t.color, t.seed, .35);
  }
}

// ================= Verbindung =================
let ws = null, myId = null, myName = null, group = null, online = [], pendingInvite = null;
let wantName = null;
try { wantName = localStorage.getItem('pk-name'); } catch { /* egal */ }

function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => { if (wantName) send({ t: 'login', name: wantName }); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = () => {
    myId = null; group = null; leaveGameView();
    if (wantName) { toast('Verbindung weg … verbinde neu'); show('login'); $('loginErr').textContent = 'Verbinde neu …'; }
    setTimeout(connect, 1500);
  };
}
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

function onMsg(m) {
  switch (m.t) {
    case 'welcome':
      myId = m.id; myName = m.name; $('myName').textContent = myName; $('loginErr').textContent = '';
      break;
    case 'group':
      group = m;
      if (m.state === 'lobby') { leaveGameView(); show('lobby'); }
      renderGroup(); renderOnline();
      break;
    case 'online':
      online = m.players; renderOnline();
      break;
    case 'invited':
      pendingInvite = m; $('invFrom').textContent = m.from; $('invite').classList.remove('hidden');
      break;
    case 'toast': toast(m.msg); break;
    case 'start': startGameView(m); break;
    case 'state': onState(m); break;
  }
}

// ================= UI =================
function show(name) {
  for (const s of ['login', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== name);
  bgOn = name !== 'game';
  bg.classList.toggle('hidden', !bgOn);
}
function toast(text) {
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = text;
  $('toasts').appendChild(d); setTimeout(() => d.remove(), 3200);
}

function doLogin() {
  const n = $('nameInput').value.trim();
  if (!n) { $('nameInput').focus(); $('loginErr').textContent = 'Bitte gib einen Namen ein 🙂'; return; }
  wantName = n;
  try { localStorage.setItem('pk-name', n); } catch { /* egal */ }
  send({ t: 'login', name: n });
}
$('btnLogin').onclick = doLogin;
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
if (wantName) $('nameInput').value = wantName;
$('btnRename').onclick = () => { show('login'); $('nameInput').focus(); $('nameInput').select(); };

const isLeader = () => group && group.leaderId === myId;

function renderGroup() {
  if (!group) return;
  const box = $('slots'); box.innerHTML = '';
  const leader = isLeader();
  for (let i = 0; i < group.max; i++) {
    const s = group.slots[i];
    const el = document.createElement('div');
    el.className = 'slot' + (s ? ' full' : '');
    if (s) {
      const c = document.createElement('canvas'); c.width = 192; c.height = 140; el.appendChild(c);
      const cx = c.getContext('2d'); cx.scale(2.6, 2.6);
      drawTank(cx, 37, 27, -0.3, -0.7, s.color, hashStr(s.id));
      const nm = document.createElement('div'); nm.className = 'nm'; nm.style.color = s.color;
      nm.textContent = s.name; el.appendChild(nm);
      const tag = document.createElement('div'); tag.className = 'tag';
      tag.textContent = s.bot ? '🤖 Bot' : (s.id === group.leaderId ? '👑 Chef' : '🎮 Spieler') + (s.id === myId ? ' (du)' : '');
      el.appendChild(tag);
      if (leader && s.id !== myId) {
        const k = document.createElement('button'); k.className = 'kick'; k.title = 'Entfernen'; k.textContent = '✕';
        k.onclick = () => send({ t: 'kick', id: s.id }); el.appendChild(k);
      }
    } else if (leader) {
      const b = document.createElement('button'); b.className = 'btn small'; b.textContent = '+ Bot';
      b.onclick = () => send({ t: 'addBot' }); el.appendChild(b);
      const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'oder Freund einladen →'; el.appendChild(e);
    } else {
      const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'freier Platz'; el.appendChild(e);
    }
    box.appendChild(el);
  }
  const humans = group.slots.filter(s => !s.bot).length;
  $('btnStart').classList.toggle('hidden', !leader);
  $('btnLeave').classList.toggle('hidden', humans <= 1);
  $('groupTitle').textContent = humans > 1 ? `Deine Gruppe (${group.slots.length}/${group.max})` : 'Deine Gruppe';
  $('groupHint').textContent = leader
    ? (group.slots.length < 2 ? 'Lad Freunde ein oder füg Bots hinzu – oder starte direkt gegen einen Bot.' : 'Alles bereit? Dann los!')
    : 'Warte, bis der Chef das Spiel startet …';
}

function renderOnline() {
  const ul = $('online'); ul.innerHTML = '';
  const others = online.filter(p => p.id !== myId);
  if (!others.length) {
    const li = document.createElement('li'); li.className = 'nobody';
    li.textContent = 'Noch niemand anderes online. Schick deinen Freunden den Link!'; ul.appendChild(li); return;
  }
  const inMyGroup = new Set(group ? group.slots.map(s => s.id) : []);
  const full = group && group.slots.length >= group.max && !group.slots.some(s => s.bot);
  for (const p of others) {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot';
    dot.style.background = p.status === 'im Spiel' ? '#f2994a' : p.status === 'in Gruppe' ? '#f2c94c' : '#6fcf6f';
    const who = document.createElement('span'); who.className = 'who'; who.textContent = p.name;
    const st = document.createElement('span'); st.className = 'st'; st.textContent = inMyGroup.has(p.id) ? 'bei dir' : p.status;
    li.append(dot, who, st);
    if (!inMyGroup.has(p.id)) {
      const b = document.createElement('button'); b.className = 'btn small'; b.textContent = 'Einladen';
      b.disabled = full || p.status === 'im Spiel' || (group && group.state !== 'lobby');
      b.onclick = () => { send({ t: 'invite', to: p.id }); b.disabled = true; setTimeout(() => { b.disabled = false; }, 3000); };
      li.appendChild(b);
    }
    ul.appendChild(li);
  }
}

$('btnStart').onclick = () => send({ t: 'start' });
$('btnLeave').onclick = () => send({ t: 'leaveGroup' });
$('btnAccept').onclick = () => { if (pendingInvite) send({ t: 'accept', groupId: pendingInvite.groupId }); pendingInvite = null; $('invite').classList.add('hidden'); };
$('btnDecline').onclick = () => { if (pendingInvite) send({ t: 'decline', fromId: pendingInvite.fromId }); pendingInvite = null; $('invite').classList.add('hidden'); };
$('btnCopy').onclick = async () => {
  try { await navigator.clipboard.writeText(location.origin); toast('Link kopiert – schick ihn deinen Freunden!'); }
  catch { toast(location.origin); }
};

// ================= Spiel =================
const cv = $('cv'), ctx = cv.getContext('2d');
let map = null, killsToWin = 10, prev = null, cur = null, curT = 0, inGame = false;
let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
let effects = [], feed = [];
const keys = {};
const mouse = { x: 0, y: 0, down: false };

function startGameView(m) {
  map = m.map; killsToWin = m.killsToWin; prev = cur = null; effects = []; feed = [];
  inGame = true; show('game'); $('banner').classList.add('hidden'); resize();
  $('invite').classList.add('hidden');
}
function leaveGameView() { inGame = false; map = null; cur = prev = null; }

function resize() {
  const dpr = devicePixelRatio || 1, w = innerWidth, h = innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const W = map ? map.W : 960, H = map ? map.H : 600;
  const scale = Math.min((w - 16) / W, (h - 70) / H);
  view = { dpr, scale, ox: (w - W * scale) / 2, oy: (h - H * scale) / 2 + 18 };
}
addEventListener('resize', resize);

function onState(m) {
  if (!inGame) return;
  prev = cur; cur = m; curT = performance.now();
  for (const e of m.events) {
    if (e.k === 'feed') feed.push({ text: e.text, t: performance.now() });
    else effects.push({ ...e, t: performance.now() });
  }
  if (feed.length > 5) feed = feed.slice(-5);
  renderHud();
}

function me() { return cur && cur.tanks.find(t => t.id === myId); }

function renderHud() {
  const sc = $('score'); sc.innerHTML = '';
  const sorted = [...cur.tanks].sort((a, b) => b.kills - a.kills);
  for (const t of sorted) {
    const d = document.createElement('div'); d.className = 'sc' + (t.id === myId ? ' me' : '');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = t.color;
    const nm = document.createElement('span'); nm.textContent = `${t.name}: ${t.kills}/${killsToWin}`;
    d.append(dot, nm); sc.appendChild(d);
  }
  const now = performance.now();
  feed = feed.filter(f => now - f.t < 4500);
  const fd = $('feed'); fd.innerHTML = '';
  for (const f of feed) { const d = document.createElement('div'); d.textContent = f.text; fd.appendChild(d); }

  const my = me(), pu = $('mypu'); pu.innerHTML = '';
  if (my) for (const [k, on] of [['F', my.rapid], ['S', my.shield], ['T', my.speed]]) {
    if (!on) continue; const d = document.createElement('div'); d.style.background = PU_INFO[k].color; d.textContent = PU_INFO[k].name; pu.appendChild(d);
  }

  const ban = $('banner');
  if (cur.state === 'over') {
    ban.classList.remove('hidden');
    ban.querySelector('.t').textContent = cur.winner === (my && my.name) ? '🏆 Du hast gewonnen!' : `🏆 ${cur.winner} gewinnt!`;
    ban.querySelector('.s').textContent = 'Gleich geht\'s zurück in die Lobby …';
  } else if (my && !my.alive) {
    ban.classList.remove('hidden');
    ban.querySelector('.t').textContent = '💥 Erwischt!';
    ban.querySelector('.s').textContent = `Zurück in ${Math.ceil(my.respawn)} s`;
  } else ban.classList.add('hidden');
}

// ---- Eingabe ----
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  keys[e.key.toLowerCase()] = true;
  if (inGame && [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });
cv.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener('mousedown', (e) => { if (e.button === 0) mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; });
addEventListener('mouseup', () => { mouse.down = false; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
$('quit').onclick = () => { send({ t: 'quit' }); };

setInterval(() => {
  if (!inGame || !cur) return;
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  const m = me();
  let aim = 0;
  if (m) {
    const wx = (mouse.x - view.ox) / view.scale, wy = (mouse.y - view.oy) / view.scale;
    aim = Math.atan2(wy - m.y, wx - m.x);
  }
  send({ t: 'input', dx, dy, aim, fire: mouse.down || !!keys[' '] });
}, 33);

// ---- Zeichnen ----
const lerp = (a, b, k) => a + (b - a) * k;
const lerpAng = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
const inBush = (x, y) => map.bushes.some(b => Math.hypot(b.x - x, b.y - y) < b.r);

function drawGame(time) {
  const { dpr, scale, ox, oy } = view;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, cv.width, cv.height);
  if (!map || !cur) return;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
  const W = map.W, H = map.H, t = time / 1000;

  // Karopapier
  ctx.strokeStyle = GRID; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x <= W; x += 40) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y <= H; y += 40) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  sketchStroke(ctx, rectPts(0, 0, W, H), 4242, 2, true, 3.5);

  // Teleporter
  map.teleports.forEach((tp, i) => {
    sketchFill(ctx, circlePts(tp.x, tp.y, tp.r + 4, 16, i * 13, .08), i * 13, tp.color + '55', 1.2);
    ctx.save(); ctx.strokeStyle = tp.color; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a0 = t * 3 + k * 2.09; ctx.beginPath(); ctx.arc(tp.x, tp.y, tp.r * .62, a0, a0 + 1.3); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(tp.x, tp.y, 3, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.restore();
  });

  // Berge
  map.mountains.forEach((m, i) => {
    const pts = circlePts(m.x, m.y, m.r, 15, i * 31 + 5, .22);
    sketchFill(ctx, pts, i * 31 + 5, '#ddd4bf', 1.6, 2.6);
    hatch(ctx, pts, m.x, m.y - m.r, m.x + m.r, m.y + m.r, 6, '#9c927f', i * 7);
    // kleiner Gipfel
    const pk = [[m.x - m.r * .45, m.y + m.r * .2], [m.x, m.y - m.r * .45], [m.x + m.r * .45, m.y + m.r * .2]];
    sketchStroke(ctx, pk, i * 3 + 1, 1, false, 2.2);
    sketchStroke(ctx, [[m.x - m.r * .15, m.y - m.r * .15], [m.x, m.y - m.r * .45], [m.x + m.r * .12, m.y - m.r * .2]], i * 3 + 2, .6, false, 1.6);
  });

  // Powerups
  for (const p of cur.powerups) {
    const bob = Math.sin(t * 3 + hashStr(p.id) % 7) * 2.5, info = PU_INFO[p.type];
    sketchFill(ctx, rectPts(p.x - 11, p.y - 11 + bob, 22, 22), hashStr(p.id), info.color, 1.2);
    ctx.fillStyle = INK; ctx.font = 'bold 17px "Patrick Hand", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.type, p.x, p.y + bob + 1);
  }

  // Panzer (interpoliert zwischen den letzten zwei Server-Zuständen)
  const k = Math.min(1, (performance.now() - curT) / 33);
  const my = me();
  for (const tk of cur.tanks) {
    if (!tk.alive) continue;
    const p = prev && prev.tanks.find(o => o.id === tk.id && o.alive);
    const x = p ? lerp(p.x, tk.x, k) : tk.x, y = p ? lerp(p.y, tk.y, k) : tk.y;
    const a = p ? lerpAng(p.a, tk.a, k) : tk.a, ta = p ? lerpAng(p.ta, tk.ta, k) : tk.ta;
    const hidden = inBush(x, y);
    const isMe = tk.id === myId;
    if (hidden && !isMe && !(my && my.alive && Math.hypot(my.x - x, my.y - y) < 80)) continue; // im Busch versteckt
    if (tk.speed) { // Staubwolken
      ctx.strokeStyle = '#b7ab94'; ctx.lineWidth = 1.5;
      for (let j = 1; j <= 3; j++) { ctx.beginPath(); ctx.arc(x - Math.cos(a) * (14 + j * 7), y - Math.sin(a) * (14 + j * 7), 2 + j, 0, 7); ctx.stroke(); }
    }
    drawTank(ctx, x, y, a, ta, tk.color, hashStr(tk.id), hidden ? .55 : 1);
    if (tk.shield) {
      ctx.save(); ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 30; ctx.strokeStyle = '#4a8fe0'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 24, 0, 7); ctx.stroke(); ctx.restore();
    }
    if (tk.rapid) { ctx.fillStyle = '#e8594f'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🔥', x + 18, y - 16); }
    ctx.fillStyle = INK; ctx.font = (isMe ? 'bold ' : '') + '14px "Patrick Hand", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(isMe ? '▼ ' + tk.name : tk.name, x, y - 24);
  }

  // Kugeln
  for (const b of cur.bullets) {
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(b.x, b.y, 4.2, 0, 7); ctx.fill();
    ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(b.x, b.y, 2.2, 0, 7); ctx.fill();
  }

  // Büsche (liegen über den Panzern)
  map.bushes.forEach((b, i) => {
    const pts = [];
    for (let j = 0; j < 22; j++) { const ang = j / 22 * Math.PI * 2; const R = b.r + (j % 2 ? 4 : -2); pts.push([b.x + Math.cos(ang) * R, b.y + Math.sin(ang) * R]); }
    ctx.save(); ctx.globalAlpha = .9;
    sketchFill(ctx, pts, i * 17 + 3, '#9fd68a', 1.5, 2.2);
    ctx.restore();
    const r = rng(i * 5 + 1); ctx.strokeStyle = '#4f8a3c'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const ax = b.x + (r() - .5) * b.r * 1.1, ay = b.y + (r() - .5) * b.r * 1.1;
      ctx.moveTo(ax - 4, ay + 2); ctx.quadraticCurveTo(ax, ay - 4, ax + 4, ay + 2);
    }
    ctx.stroke();
  });

  // Effekte
  const now = performance.now();
  effects = effects.filter(e => now - e.t < 700);
  for (const e of effects) {
    const p = (now - e.t) / 700;
    ctx.save(); ctx.globalAlpha = 1 - p;
    if (e.k === 'boom') {
      const r = rng(hashStr(e.x + ':' + e.y));
      ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let j = 0; j < 12; j++) {
        const ang = j / 12 * Math.PI * 2 + r(), r0 = 6 + p * 18, r1 = 14 + p * 34 * (0.6 + r() * .6);
        ctx.moveTo(e.x + Math.cos(ang) * r0, e.y + Math.sin(ang) * r0); ctx.lineTo(e.x + Math.cos(ang) * r1, e.y + Math.sin(ang) * r1);
      }
      ctx.stroke();
      sketchFill(ctx, circlePts(e.x, e.y, 10 + p * 16, 12, 9, .5), 9, '#ffcf5c', 2);
    } else if (e.k === 'tp' || e.k === 'pickup') {
      ctx.strokeStyle = e.k === 'tp' ? '#9a6cff' : '#e0a400'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, 10 + p * 30, 0, 7); ctx.stroke();
      if (e.k === 'pickup') {
        ctx.fillStyle = INK; ctx.font = 'bold 16px "Patrick Hand", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(PU_INFO[e.type].name + '!', e.x, e.y - 20 - p * 20);
      }
    } else if (e.k === 'block') {
      ctx.strokeStyle = '#4a8fe0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(e.x, e.y, 4 + p * 12, 0, 7); ctx.stroke();
    } else if (e.k === 'shot') {
      ctx.fillStyle = '#bbb'; ctx.beginPath(); ctx.arc(e.x, e.y, 3 + p * 8, 0, 7); ctx.globalAlpha = (1 - p) * .3; ctx.fill();
    }
    ctx.restore();
  }
}

function loop(time) {
  requestAnimationFrame(loop);
  if (bgOn) drawBg(time);
  else if (inGame) drawGame(time);
}
requestAnimationFrame(loop);
show('login');
connect();
