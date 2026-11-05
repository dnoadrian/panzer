// Panzer-Kritzel – Server
// Liefert die Webseite aus und berechnet das Spiel (Server ist "Schiedsrichter").
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- Spielkonstanten ----------
const W = 960, H = 600;          // Kartengröße (passt komplett auf den Bildschirm)
const TR = 14;                   // Panzer-Radius
const BR = 4;                    // Kugel-Radius
const BSPEED = 430;              // Kugel-Geschwindigkeit
const TANK_SPEED = 115;
const TICK = 1 / 30;
const MAX_PLAYERS = 4;
const KILLS_TO_WIN = 10;
const RESPAWN = 2.5;
const COLORS = ['#e8594f', '#4f86e8', '#4fb85a', '#e8a94f'];
const BOT_NAMES = ['Otto', 'Kalle', 'Gerd', 'Franz', 'Heinz', 'Rudi', 'Bruno', 'Lotte'];
const POWERUPS = ['F', 'S', 'T']; // Feuer (schnell schießen), Schild, Tempo

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ---------- HTTP (Webseite) ----------
const httpServer = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- Hilfsfunktionen ----------
let idCounter = 0;
const newId = (p) => p + (++idCounter).toString(36) + Math.random().toString(36).slice(2, 5);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const turnTo = (cur, target, k) => cur + normAngle(target - cur) * Math.min(1, k);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0;
    return s / 4294967296;
  };
}

function cleanName(n) {
  const s = String(n || '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return s || 'Panzerfahrer';
}

// ---------- Karte ----------
function overlapsMap(map, x, y, r) {
  if (x < r || x > W - r || y < r || y > H - r) return true;
  for (const m of map.mountains) if (Math.hypot(m.x - x, m.y - y) < m.r + r) return true;
  for (const tp of map.teleports) if (Math.hypot(tp.x - x, tp.y - y) < tp.r + r) return true;
  return false;
}

function makeMap(seed) {
  const rnd = rng(seed);
  const R = (a, b) => a + (b - a) * rnd();
  const map = { mountains: [], bushes: [], teleports: [], W, H };
  const spot = (r, ok = () => true) => {
    for (let i = 0; i < 1500; i++) {
      const x = R(0, W), y = R(0, H);
      if (!overlapsMap(map, x, y, r) && ok(x, y)) return { x, y };
    }
    return null;
  };
  // Berge (blockieren Panzer, Kugeln prallen ab)
  for (let i = 0; i < 1500 && map.mountains.length < 11; i++) {
    const r = R(24, 48);
    const p = spot(r + 34); // Abstand lassen, damit Wege frei bleiben
    if (p) map.mountains.push({ x: p.x, y: p.y, r });
  }
  // Teleporter-Paare
  const tpColors = ['#b98cff', '#5fd0dc'];
  for (let k = 0; k < 2; k++) {
    const a = spot(16 + 40);
    if (!a) continue;
    const ia = map.teleports.length;
    map.teleports.push({ x: a.x, y: a.y, r: 16, color: tpColors[k], pair: ia + 1 });
    const b = spot(16 + 40, (x, y) => Math.hypot(x - a.x, y - a.y) > 420);
    if (!b) { map.teleports.pop(); continue; }
    map.teleports.push({ x: b.x, y: b.y, r: 16, color: tpColors[k], pair: ia });
  }
  // Büsche (man kann reinfahren und ist dort versteckt)
  for (let i = 0; i < 400 && map.bushes.length < 9; i++) {
    const r = R(28, 42);
    const p = spot(r + 6, (x, y) => map.bushes.every(b => Math.hypot(b.x - x, b.y - y) > b.r + r + 10));
    if (p) map.bushes.push({ x: p.x, y: p.y, r });
  }
  return map;
}

function freeSpot(map, r) {
  for (let i = 0; i < 400; i++) {
    const x = 30 + Math.random() * (W - 60), y = 30 + Math.random() * (H - 60);
    if (!overlapsMap(map, x, y, r)) return { x, y };
  }
  return null;
}

// ---------- Verbindungen & Gruppen ----------
const conns = new Map();  // id -> conn
const groups = new Map(); // id -> group

function send(conn, obj) {
  if (conn && conn.ws.readyState === 1) conn.ws.send(JSON.stringify(obj));
}
function humans(group) {
  return group.slots.filter(s => !s.bot).map(s => conns.get(s.id)).filter(Boolean);
}
function broadcast(group, obj) {
  const msg = JSON.stringify(obj);
  for (const c of humans(group)) if (c.ws.readyState === 1) c.ws.send(msg);
}

function newGroup(conn) {
  const g = {
    id: newId('g'), leaderId: conn.id, slots: [], state: 'lobby',
    tanks: [], bullets: [], powerups: [], events: [], map: null,
    winner: null, overAt: 0, nextPowerup: 0, lastTick: 0,
  };
  groups.set(g.id, g);
  g.slots.push({ id: conn.id, name: conn.name, bot: false });
  conn.group = g;
  return g;
}

function groupPayload(g) {
  return {
    t: 'group', id: g.id, leaderId: g.leaderId, state: g.state, max: MAX_PLAYERS,
    slots: g.slots.map((s, i) => ({ id: s.id, name: s.name, bot: s.bot, color: COLORS[i] })),
  };
}
function sendGroup(g) { broadcast(g, groupPayload(g)); }

function statusOf(conn) {
  if (!conn.group) return 'frei';
  if (conn.group.state !== 'lobby') return 'im Spiel';
  return humans(conn.group).length > 1 ? 'in Gruppe' : 'frei';
}
let onlineDirty = true;
function sendOnline() {
  const list = [...conns.values()].filter(c => c.name).map(c => ({ id: c.id, name: c.name, status: statusOf(c) }));
  const msg = JSON.stringify({ t: 'online', players: list });
  for (const c of conns.values()) if (c.name && c.ws.readyState === 1) c.ws.send(msg);
  onlineDirty = false;
}

// Spieler verlässt seine Gruppe (bei Spielende-Abbruch wird sein Panzer zum Bot)
function leaveGroup(conn) {
  const g = conn.group;
  if (!g) return;
  conn.group = null;
  g.slots = g.slots.filter(s => s.id !== conn.id);
  const tank = g.tanks.find(t => t.id === conn.id);
  if (tank) { tank.bot = true; tank.name += ' 🤖'; tank.ai = newAI(); tank.input = { dx: 0, dy: 0, aim: tank.ta, fire: false }; }
  if (!g.slots.some(s => !s.bot)) { groups.delete(g.id); }
  else {
    if (g.leaderId === conn.id) g.leaderId = g.slots.find(s => !s.bot).id;
    sendGroup(g);
  }
  onlineDirty = true;
}

function uniqueName(name, selfId) {
  const taken = new Set([...conns.values()].filter(c => c.id !== selfId && c.name).map(c => c.name.toLowerCase()));
  let n = name, i = 2;
  while (taken.has(n.toLowerCase())) n = name.slice(0, 12) + i++;
  return n;
}

function addBot(g) {
  if (g.slots.length >= MAX_PLAYERS) return;
  const used = new Set(g.slots.map(s => s.name));
  const name = BOT_NAMES.find(n => !used.has('Bot ' + n)) || 'Robo';
  g.slots.push({ id: newId('b'), name: 'Bot ' + name, bot: true });
}

// ---------- Nachrichten ----------
function handle(conn, msg) {
  if (msg.t !== 'login' && !conn.name) return;
  const g = conn.group;
  const isLeader = g && g.leaderId === conn.id;
  switch (msg.t) {
    case 'login': {
      conn.name = uniqueName(cleanName(msg.name), conn.id);
      if (!conn.group) newGroup(conn);
      else { const s = conn.group.slots.find(s => s.id === conn.id); if (s) s.name = conn.name; }
      send(conn, { t: 'welcome', id: conn.id, name: conn.name });
      sendGroup(conn.group);
      onlineDirty = true;
      break;
    }
    case 'invite': {
      const target = conns.get(msg.to);
      if (!target || !target.name || target === conn) return;
      if (g.state !== 'lobby') return send(conn, { t: 'toast', msg: 'Erst nach dem Spiel einladen.' });
      if (g.slots.length >= MAX_PLAYERS) return send(conn, { t: 'toast', msg: 'Deine Gruppe ist voll (max. 4).' });
      if (target.group === g) return;
      send(target, { t: 'invited', groupId: g.id, from: conn.name, fromId: conn.id });
      send(conn, { t: 'toast', msg: `Einladung an ${target.name} geschickt ✉️` });
      break;
    }
    case 'accept': {
      const ng = groups.get(msg.groupId);
      if (!ng) return send(conn, { t: 'toast', msg: 'Die Gruppe gibt es nicht mehr.' });
      if (ng === g) return;
      if (ng.state !== 'lobby') return send(conn, { t: 'toast', msg: 'Die Gruppe spielt gerade.' });
      if (ng.slots.length >= MAX_PLAYERS) {
        // Platz schaffen, wenn ein Bot drin ist
        const bi = ng.slots.map(s => s.bot).lastIndexOf(true);
        if (bi < 0) return send(conn, { t: 'toast', msg: 'Die Gruppe ist schon voll.' });
        ng.slots.splice(bi, 1);
      }
      leaveGroup(conn);
      ng.slots.push({ id: conn.id, name: conn.name, bot: false });
      conn.group = ng;
      sendGroup(ng);
      broadcast(ng, { t: 'toast', msg: `${conn.name} ist der Gruppe beigetreten 🎉` });
      onlineDirty = true;
      break;
    }
    case 'decline': {
      const from = conns.get(msg.fromId);
      if (from) send(from, { t: 'toast', msg: `${conn.name} hat abgelehnt.` });
      break;
    }
    case 'leaveGroup': {
      if (humans(g).length <= 1 && g.state === 'lobby') return;
      leaveGroup(conn);
      newGroup(conn);
      sendGroup(conn.group);
      break;
    }
    case 'kick': {
      if (!isLeader || g.state !== 'lobby' || msg.id === conn.id) return;
      const s = g.slots.find(s => s.id === msg.id);
      if (!s) return;
      if (s.bot) { g.slots = g.slots.filter(x => x !== s); sendGroup(g); return; }
      const other = conns.get(s.id);
      if (other) {
        leaveGroup(other); newGroup(other); sendGroup(other.group);
        send(other, { t: 'toast', msg: 'Du wurdest aus der Gruppe entfernt.' });
      }
      break;
    }
    case 'addBot': {
      if (!isLeader || g.state !== 'lobby') return;
      addBot(g); sendGroup(g);
      break;
    }
    case 'start': {
      if (!isLeader || g.state !== 'lobby') return;
      if (g.slots.length < 2) addBot(g); // alleine? dann mindestens einen Bot dazu
      startGame(g);
      break;
    }
    case 'input': {
      if (!g || g.state !== 'playing') return;
      const t = g.tanks.find(t => t.id === conn.id);
      if (!t || t.bot) return;
      t.input = {
        dx: clamp(+msg.dx || 0, -1, 1), dy: clamp(+msg.dy || 0, -1, 1),
        aim: Number.isFinite(+msg.aim) ? +msg.aim : 0, fire: !!msg.fire,
      };
      break;
    }
    case 'quit': { // Spiel verlassen -> zurück in eigene Lobby
      if (!g || g.state === 'lobby') return;
      leaveGroup(conn);
      newGroup(conn);
      sendGroup(conn.group);
      break;
    }
  }
}

// ---------- Spiel ----------
function newAI() {
  return { target: null, retarget: 0, noise: 0, noiseT: 0, side: 1, sideT: 0, wx: W / 2, wy: H / 2, wT: 0, stuckT: 0 };
}

function startGame(g) {
  const now = Date.now() / 1000;
  g.map = makeMap(Math.floor(Math.random() * 1e9));
  g.tanks = g.slots.map((s, i) => ({
    id: s.id, name: s.name, bot: s.bot, color: COLORS[i],
    x: 0, y: 0, a: 0, ta: 0, alive: false, respawnAt: 0,
    shieldUntil: 0, speedUntil: 0, rapidUntil: 0, nextFire: 0,
    kills: 0, deaths: 0, tpLock: -1,
    input: { dx: 0, dy: 0, aim: 0, fire: false }, ai: newAI(),
  }));
  g.bullets = []; g.powerups = []; g.events = [];
  g.state = 'playing'; g.winner = null; g.nextPowerup = now + 3; g.lastTick = now;
  for (const t of g.tanks) spawn(g, t, now);
  broadcast(g, { t: 'start', map: g.map, killsToWin: KILLS_TO_WIN });
  onlineDirty = true;
}

function spawn(g, t, now) {
  let best = null, bestScore = -1;
  for (let i = 0; i < 80; i++) {
    const x = 40 + Math.random() * (W - 80), y = 40 + Math.random() * (H - 80);
    if (overlapsMap(g.map, x, y, TR + 6)) continue;
    let minD = 600;
    for (const o of g.tanks) if (o.alive && o !== t) minD = Math.min(minD, Math.hypot(o.x - x, o.y - y));
    const score = minD + Math.random() * 60;
    if (score > bestScore) { bestScore = score; best = { x, y }; }
  }
  best = best || { x: W / 2, y: H / 2 };
  t.x = best.x; t.y = best.y;
  t.a = Math.atan2(H / 2 - t.y, W / 2 - t.x); t.ta = t.a;
  t.alive = true; t.shieldUntil = now + 2; t.tpLock = -1;
}

function collideMap(map, t) {
  t.x = clamp(t.x, TR, W - TR); t.y = clamp(t.y, TR, H - TR);
  for (const m of map.mountains) {
    const dx = t.x - m.x, dy = t.y - m.y, d = Math.hypot(dx, dy), min = m.r + TR;
    if (d < min && d > 0.001) { t.x = m.x + dx / d * min; t.y = m.y + dy / d * min; }
  }
}

function moveTank(g, t, now, dt) {
  const inp = t.input;
  const L = Math.hypot(inp.dx, inp.dy);
  if (L > 0.05) {
    const nx = inp.dx / L, ny = inp.dy / L;
    const sp = TANK_SPEED * (now < t.speedUntil ? 1.6 : 1);
    t.a = turnTo(t.a, Math.atan2(ny, nx), dt * 12);
    t.x += nx * sp * dt; t.y += ny * sp * dt;
    collideMap(g.map, t);
  }
  t.ta = turnTo(t.ta, inp.aim, dt * (t.bot ? 5 : 40));

  // Teleporter
  const tps = g.map.teleports;
  for (let i = 0; i < tps.length; i++) {
    const tp = tps[i], d = Math.hypot(t.x - tp.x, t.y - tp.y);
    if (t.tpLock === i && d > tp.r + TR) t.tpLock = -1;
    else if (t.tpLock !== i && d < tp.r) {
      const dst = tps[tp.pair];
      t.x = dst.x; t.y = dst.y; t.tpLock = tp.pair;
      g.events.push({ k: 'tp', x: dst.x, y: dst.y });
      break;
    }
  }

  // Schießen
  if (inp.fire && now >= t.nextFire) {
    t.nextFire = now + (now < t.rapidUntil ? 0.22 : 0.65);
    const c = Math.cos(t.ta), s = Math.sin(t.ta);
    g.bullets.push({ x: t.x + c * (TR + 8), y: t.y + s * (TR + 8), vx: c * BSPEED, vy: s * BSPEED, owner: t.id, bounces: 0, life: 2.6, color: t.color });
    g.events.push({ k: 'shot', x: t.x, y: t.y });
  }
}

function reflect(b, nx, ny) {
  const dot = b.vx * nx + b.vy * ny;
  if (dot < 0) { b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; b.bounces++; }
}

function updateBullets(g, now, dt) {
  for (const b of g.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.x < BR) { b.x = BR; reflect(b, 1, 0); } else if (b.x > W - BR) { b.x = W - BR; reflect(b, -1, 0); }
    if (b.y < BR) { b.y = BR; reflect(b, 0, 1); } else if (b.y > H - BR) { b.y = H - BR; reflect(b, 0, -1); }
    for (const m of g.map.mountains) {
      const dx = b.x - m.x, dy = b.y - m.y, d = Math.hypot(dx, dy) || 1, min = m.r + BR;
      if (d < min) { const nx = dx / d, ny = dy / d; reflect(b, nx, ny); b.x = m.x + nx * min; b.y = m.y + ny * min; }
    }
    if (b.bounces > 2 || b.life <= 0) { b.dead = true; continue; }
    for (const t of g.tanks) {
      if (!t.alive) continue;
      if (t.id === b.owner && b.bounces === 0) continue;
      if (Math.hypot(t.x - b.x, t.y - b.y) < TR + BR) {
        b.dead = true;
        if (now < t.shieldUntil) { g.events.push({ k: 'block', x: b.x, y: b.y }); break; }
        kill(g, t, b.owner, now);
        break;
      }
    }
  }
  g.bullets = g.bullets.filter(b => !b.dead);
}

function kill(g, t, killerId, now) {
  t.alive = false; t.respawnAt = now + RESPAWN; t.deaths++;
  t.shieldUntil = t.speedUntil = t.rapidUntil = 0;
  g.events.push({ k: 'boom', x: t.x, y: t.y, color: t.color });
  const killer = g.tanks.find(k => k.id === killerId);
  if (killer && killer !== t) {
    killer.kills++;
    g.events.push({ k: 'feed', text: `${killer.name} 💥 ${t.name}` });
    if (killer.kills >= KILLS_TO_WIN) endGame(g, killer, now);
  } else {
    g.events.push({ k: 'feed', text: `${t.name} hat sich selbst erwischt 🙃` });
  }
}

function endGame(g, winner, now) {
  g.state = 'over'; g.winner = winner.name; g.overAt = now + 7; g.bullets = [];
}

function backToLobby(g) {
  g.state = 'lobby'; g.tanks = []; g.bullets = []; g.powerups = []; g.map = null;
  sendGroup(g);
  onlineDirty = true;
}

function updatePowerups(g, now) {
  if (now >= g.nextPowerup) {
    g.nextPowerup = now + 4.5;
    if (g.powerups.length < 4) {
      const p = freeSpot(g.map, 24);
      if (p) g.powerups.push({ id: newId('u'), type: POWERUPS[Math.floor(Math.random() * POWERUPS.length)], x: p.x, y: p.y });
    }
  }
  for (const pu of g.powerups) {
    for (const t of g.tanks) {
      if (!t.alive || Math.hypot(t.x - pu.x, t.y - pu.y) > TR + 12) continue;
      if (pu.type === 'F') t.rapidUntil = now + 7;
      if (pu.type === 'S') t.shieldUntil = now + 6;
      if (pu.type === 'T') t.speedUntil = now + 6;
      pu.taken = true;
      g.events.push({ k: 'pickup', x: pu.x, y: pu.y, type: pu.type, who: t.id });
      break;
    }
  }
  g.powerups = g.powerups.filter(p => !p.taken);
}

function clearLine(map, a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 14);
  for (let i = 1; i < steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
    for (const m of map.mountains) if (Math.hypot(m.x - x, m.y - y) < m.r + 2) return false;
  }
  return true;
}

function botThink(g, t, now, dt) {
  const ai = t.ai;
  ai.retarget -= dt; ai.noiseT -= dt; ai.sideT -= dt; ai.wT -= dt;
  if (ai.retarget <= 0) {
    ai.retarget = 0.6;
    let best = null, bd = Infinity;
    for (const o of g.tanks) {
      if (o === t || !o.alive) continue;
      // versteckte Panzer im Busch sieht der Bot nur aus der Nähe
      const hidden = g.map.bushes.some(b => Math.hypot(b.x - o.x, b.y - o.y) < b.r) && dist(o, t) > 90;
      if (hidden) continue;
      const d = dist(o, t);
      if (d < bd) { bd = d; best = o; }
    }
    ai.target = best;
  }
  if (ai.noiseT <= 0) { ai.noiseT = 0.7; ai.noise = (Math.random() - 0.5) * 0.18; }
  if (ai.sideT <= 0) { ai.sideT = 1.2 + Math.random() * 1.5; ai.side = Math.random() < 0.5 ? -1 : 1; }

  const tg = ai.target && ai.target.alive ? ai.target : null;
  const dd = tg ? dist(t, tg) : Infinity;
  let pu = null, pd = 170;
  for (const p of g.powerups) { const d = dist(p, t); if (d < pd) { pd = d; pu = p; } }

  let gx, gy;
  if (pu && (!tg || dd > 160)) { gx = pu.x; gy = pu.y; }
  else if (tg && dd > 230) { gx = tg.x; gy = tg.y; }
  else if (tg && dd < 110) { gx = t.x * 2 - tg.x; gy = t.y * 2 - tg.y; }
  else if (tg) {
    const ang = Math.atan2(tg.y - t.y, tg.x - t.x) + ai.side * Math.PI / 2;
    gx = t.x + Math.cos(ang) * 60; gy = t.y + Math.sin(ang) * 60;
  } else {
    if (ai.wT <= 0 || Math.hypot(ai.wx - t.x, ai.wy - t.y) < 30) {
      ai.wT = 3 + Math.random() * 2; ai.wx = 50 + Math.random() * (W - 100); ai.wy = 50 + Math.random() * (H - 100);
    }
    gx = ai.wx; gy = ai.wy;
  }
  let ang = Math.atan2(gy - t.y, gx - t.x);
  // Hindernissen ausweichen
  for (let k = 0; k < 4; k++) {
    const px = t.x + Math.cos(ang) * 42, py = t.y + Math.sin(ang) * 42;
    let blocked = px < TR || px > W - TR || py < TR || py > H - TR;
    for (const m of g.map.mountains) if (Math.hypot(m.x - px, m.y - py) < m.r + TR) blocked = true;
    if (!blocked) break;
    ang += ai.side * 0.8;
  }
  let aim = ang, fire = false;
  if (tg) {
    const toT = Math.atan2(tg.y - t.y, tg.x - t.x);
    aim = toT + ai.noise;
    fire = dd < 480 && Math.abs(normAngle(toT - t.ta)) < 0.16 && clearLine(g.map, t, tg);
  }
  t.input = { dx: Math.cos(ang), dy: Math.sin(ang), aim, fire };
}

function step(g, now, dt) {
  for (const t of g.tanks) if (!t.alive && now >= t.respawnAt) spawn(g, t, now);
  for (const t of g.tanks) if (t.alive && t.bot) botThink(g, t, now, dt);
  for (const t of g.tanks) if (t.alive) moveTank(g, t, now, dt);
  const alive = g.tanks.filter(t => t.alive);
  for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
    const a = alive[i], b = alive[j];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = TR * 2;
    if (d < min) {
      const nx = d > 0.001 ? dx / d : 1, ny = d > 0.001 ? dy / d : 0, p = (min - d) / 2;
      a.x -= nx * p; a.y -= ny * p; b.x += nx * p; b.y += ny * p;
      collideMap(g.map, a); collideMap(g.map, b);
    }
  }
  updatePowerups(g, now);
  updateBullets(g, now, dt);
}

const r1 = (v) => Math.round(v * 10) / 10;
function sendState(g, now) {
  broadcast(g, {
    t: 'state', state: g.state, winner: g.winner,
    tanks: g.tanks.map(t => ({
      id: t.id, name: t.name, color: t.color, bot: t.bot,
      x: r1(t.x), y: r1(t.y), a: r1(t.a * 10) / 10, ta: r1(t.ta * 10) / 10,
      alive: t.alive, kills: t.kills, deaths: t.deaths,
      respawn: t.alive ? 0 : r1(Math.max(0, t.respawnAt - now)),
      shield: now < t.shieldUntil, rapid: now < t.rapidUntil, speed: now < t.speedUntil,
    })),
    bullets: g.bullets.map(b => ({ x: r1(b.x), y: r1(b.y), c: b.color })),
    powerups: g.powerups.map(p => ({ id: p.id, type: p.type, x: r1(p.x), y: r1(p.y) })),
    events: g.events,
  });
  g.events = [];
}

setInterval(() => {
  const now = Date.now() / 1000;
  for (const g of groups.values()) {
    if (g.state === 'playing') {
      const dt = Math.min(0.1, now - (g.lastTick || now)) || TICK;
      g.lastTick = now;
      step(g, now, dt);
      sendState(g, now);
    } else if (g.state === 'over') {
      if (now >= g.overAt) backToLobby(g);
      else sendState(g, now);
    }
  }
  if (onlineDirty) sendOnline();
}, TICK * 1000);

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', (ws) => {
  const conn = { id: newId('p'), ws, name: null, group: null, alive: true };
  conns.set(conn.id, conn);
  ws.on('pong', () => { conn.alive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg && typeof msg.t === 'string') {
      try { handle(conn, msg); } catch (e) { console.error('Fehler bei Nachricht', msg.t, e); }
    }
  });
  ws.on('close', () => {
    leaveGroup(conn);
    conns.delete(conn.id);
    onlineDirty = true;
  });
});

// Tote Verbindungen aufräumen (und Render.com-Proxy wach halten)
setInterval(() => {
  for (const c of conns.values()) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    try { c.ws.ping(); } catch { /* egal */ }
  }
}, 25000);

httpServer.listen(PORT, () => console.log(`Panzer-Kritzel läuft auf http://localhost:${PORT}`));
