// PANZER – Server (Battle Royale)
// Liefert die Webseite aus, verwaltet Freunde/Partys/Matchmaking und berechnet die Spiele.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ================= Spielwerte =================
const MAP = 3400;            // Kartengröße (Quadrat)
const TR = 16;               // Panzer-Radius (Kollision)
const HIT_R = 21;            // Treffer-Radius (etwas großzügiger als der Panzer)
const BLOCK_TIME = 1.2, BLOCK_CD = 7; // Blocken: Dauer und Abklingzeit
const BR = 4;                // Kugel-Radius
const MAX_HP = 150;
const SPEED = 80;            // Grundtempo (langsam & taktisch)
const SLOPE_W = 110;         // für Steigungsberechnung
const BSPEED = 400;
const BLIFE = 1.5;           // Reichweite ~600
const DMG = 25;              // Schaden pro Treffer (6 Treffer = eliminiert)
const KILL_HEAL = 50;        // Heilung für eine Eliminierung
const FIRE_CD = 1.1;         // Sekunden zwischen zwei Schüssen
const REGEN_DELAY = 5, REGEN = 6; // nach 5 s ohne Schaden repariert sich der Panzer
const PARTY_MAX = 4;
const VIEW_R = 1150;         // was ein Spieler vom Server gezeigt bekommt
const BUS_WAIT = 4;          // Sekunden bis der Kampfbus losfliegt
const BUS_DUR = 24;          // Flugdauer über die Karte
const DROP_TIME = 4;         // Fallschirm-Dauer
const DROP_SPEED = 190;      // Steuern am Fallschirm
const BUSH_HP = 1;           // ein Schuss und der Busch ist weg
const HILL_BLOCK = 0.45;     // so viel höher darf der Hang sein, bevor er eine Kugel schluckt
const REVEAL = 1.2;          // nach dem Schießen kurz sichtbar (auch im Busch)
const FAST = process.env.PANZER_FAST === "1" ? 0.12 : 1; // nur zum Testen: Sturm/Bus viel schneller
const ZONE_PHASES = [
  { wait: 40, shrink: 35, r: 1600, dps: 2 },
  { wait: 35, shrink: 28, r: 950, dps: 4 },
  { wait: 30, shrink: 22, r: 520, dps: 7 },
  { wait: 25, shrink: 18, r: 230, dps: 11 },
  { wait: 20, shrink: 18, r: 0, dps: 16 },
].map(p => ({ ...p, wait: p.wait * FAST, shrink: p.shrink * FAST }));
const BOT_SKINS = ['rot', 'blau', 'gruen', 'orange', 'lila', 'tuerkis', 'grau', 'pink'];
const BOT_NAMES = ['Otto', 'Kalle', 'Gerd', 'Franz', 'Heinz', 'Rudi', 'Bruno', 'Lotte', 'Hilde', 'Emil', 'Fritz', 'Greta',
  'Paul', 'Ida', 'Kurt', 'Erna', 'Hugo', 'Frieda', 'Willi', 'Elli', 'Karl', 'Mia', 'Jonas', 'Lena'];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

// ================= Webseite =================
const httpServer = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch { p = '/'; }
  if (p === '/') p = '/index.html';
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ================= Helfer =================
let idc = 0;
const uid = (p) => p + (++idc).toString(36) + Math.random().toString(36).slice(2, 6);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, k) => a + (b - a) * k;
const normAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const turnTo = (cur, target, k) => cur + normAngle(target - cur) * Math.min(1, k);
const nowS = () => Date.now() / 1000;
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 4294967296; };
}
function cleanName(n) {
  const s = String(n || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return s || 'Panzerfahrer';
}
const cleanSkin = (s) => (/^[a-z0-9-]{1,20}$/.test(String(s)) ? String(s) : 'rot');
const validPid = (p) => /^[a-z0-9]{8,40}$/.test(String(p));

// ================= Karte =================
// Höhe 0 (flach) bis 1 (Bergplateau). Hänge dazwischen sind befahrbar.
function heightAt(map, x, y) {
  let h = 0;
  for (const hl of map.hills) {
    const d = Math.hypot(x - hl.x, y - hl.y);
    if (d >= hl.r) continue;
    if (d <= hl.p) return 1;
    let k = (hl.r - d) / (hl.r - hl.p);
    k = k * k * (3 - 2 * k);
    if (k > h) h = k;
  }
  return h;
}
function bushAt(map, x, y) {
  for (let i = 0; i < map.bushes.length; i++) {
    const b = map.bushes[i];
    if (b.hp > 0 && Math.hypot(x - b.x, y - b.y) < b.r) return i;
  }
  return -1;
}
function rockAt(map, x, y, r) {
  for (const k of map.rocks) if (Math.hypot(x - k.x, y - k.y) < k.r + r) return true;
  return false;
}

function makeMap(seed) {
  const rnd = rng(seed);
  const R = (a, b) => a + (b - a) * rnd();
  const map = { size: MAP, hills: [], rocks: [], bushes: [], teleports: [] };
  const far = (list, x, y, r, gap) => list.every(o => Math.hypot(o.x - x, o.y - y) > o.r + r + gap);
  for (let i = 0; i < 800 && map.hills.length < 8; i++) {
    const r = R(180, 280), x = R(r + 120, MAP - r - 120), y = R(r + 120, MAP - r - 120);
    if (far(map.hills, x, y, r, 300)) map.hills.push({ x, y, r, p: r * 0.42 });
  }
  for (let i = 0; i < 4000 && map.rocks.length < 34; i++) {
    const r = R(18, 42), x = R(60, MAP - 60), y = R(60, MAP - 60);
    if (far(map.hills, x, y, r, 30) && far(map.rocks, x, y, r, 220)) map.rocks.push({ x, y, r });
  }
  const tpColor = '#9a6cff';
  for (let i = 0; i < 3000 && map.teleports.length < 2; i++) {
    const x = R(150, MAP - 150), y = R(150, MAP - 150);
    if (!far(map.hills, x, y, 20, 40) || !far(map.rocks, x, y, 20, 50)) continue;
    if (map.teleports.length === 1 && Math.hypot(map.teleports[0].x - x, map.teleports[0].y - y) < 1900) continue;
    map.teleports.push({ x, y, r: 20, color: tpColor, pair: map.teleports.length ? 0 : 1 });
  }
  if (map.teleports.length < 2) map.teleports = [];
  for (let i = 0; i < 9000 && map.bushes.length < 55; i++) {
    const r = R(32, 48), x = R(80, MAP - 80), y = R(80, MAP - 80);
    if (far(map.hills, x, y, r, 10) && far(map.rocks, x, y, r, 25) && far(map.bushes, x, y, r, 110) && far(map.teleports, x, y, r, 40)) {
      map.bushes.push({ x, y, r, hp: BUSH_HP });
    }
  }
  return map;
}

function freeSpot(map, r, flat, tries = 400, rnd = Math.random) {
  for (let i = 0; i < tries; i++) {
    const x = 80 + rnd() * (MAP - 160), y = 80 + rnd() * (MAP - 160);
    if (rockAt(map, x, y, r + 6)) continue;
    if (bushAt(map, x, y) >= 0) continue;
    if (flat && heightAt(map, x, y) > 0) continue;
    return { x, y };
  }
  return null;
}

// ================= Verbindungen, Freunde, Partys =================
const conns = new Set();
const byPid = new Map();     // pid -> conn
const parties = new Map();
const matches = new Map();
let queue = [];               // Party-IDs in der Warteschlange
let socialDirty = true;

function send(c, o) { if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); }
function toast(c, msg) { send(c, { t: 'toast', msg }); }

function uniqueName(name, self) {
  const taken = new Set([...byPid.values()].filter(c => c !== self).map(c => c.name.toLowerCase()));
  let n = name, i = 2;
  while (taken.has(n.toLowerCase())) n = name.slice(0, 13) + i++;
  return n;
}

function newParty(c) {
  const p = { id: uid('party'), leader: c.pid, members: [c.pid], queued: false, queueSince: 0 };
  parties.set(p.id, p);
  c.party = p;
  socialDirty = true;
  return p;
}
function unqueue(p) {
  if (p.queued) { p.queued = false; queue = queue.filter(id => id !== p.id); socialDirty = true; }
}
function removeFromParty(c) {
  const p = c.party;
  if (!p) return;
  c.party = null;
  p.members = p.members.filter(x => x !== c.pid);
  unqueue(p);
  if (!p.members.length) parties.delete(p.id);
  else if (p.leader === c.pid) p.leader = p.members[0];
  socialDirty = true;
}
function statusText(o) {
  if (o.match) return 'Im Spiel';
  if (o.party && o.party.queued) return 'Sucht Spiel';
  if (o.party && o.party.members.length > 1) return 'In Party';
  return 'Online';
}
function partyPayload(p) {
  return {
    t: 'party', id: p.id, leader: p.leader, queued: p.queued,
    members: p.members.map(pid => {
      const o = byPid.get(pid);
      return { pid, name: o ? o.name : '?', skin: o ? o.skin : 'rot', level: o ? o.level : 1, inMatch: !!(o && o.match) };
    }),
  };
}
function friendsPayload(c) {
  return {
    t: 'friends',
    list: [...c.friends].map(([pid, name]) => {
      const o = byPid.get(pid);
      return { pid, name: o ? o.name : name, online: !!o, status: o ? statusText(o) : 'Offline', inMyParty: !!(o && o.party === c.party) };
    }),
    req: [...c.requests].map(([pid, name]) => ({ pid, name })),
  };
}
function flushSocial() {
  socialDirty = false;
  for (const c of byPid.values()) {
    const pj = JSON.stringify(partyPayload(c.party));
    if (pj !== c.lastParty) { c.lastParty = pj; if (c.ws.readyState === 1) c.ws.send(pj); }
    const fj = JSON.stringify(friendsPayload(c));
    if (fj !== c.lastFriends) { c.lastFriends = fj; if (c.ws.readyState === 1) c.ws.send(fj); }
  }
}
function makeFriends(a, b) {
  a.friends.set(b.pid, b.name); b.friends.set(a.pid, a.name);
  a.requests.delete(b.pid); b.requests.delete(a.pid);
  send(a, { t: 'friendAdded', pid: b.pid, name: b.name });
  send(b, { t: 'friendAdded', pid: a.pid, name: a.name });
  toast(a, `Du bist jetzt mit ${b.name} befreundet.`);
  toast(b, `Du bist jetzt mit ${a.name} befreundet.`);
  socialDirty = true;
}

function login(c, msg) {
  if (c.pid || !validPid(msg.pid)) return;
  const old = byPid.get(msg.pid);
  if (old) { send(old, { t: 'kicked' }); dropConn(old); try { old.ws.close(); } catch { /* egal */ } }
  c.pid = msg.pid;
  c.name = uniqueName(cleanName(msg.name), c);
  c.skin = cleanSkin(msg.skin);
  c.level = clamp(msg.level | 0, 0, 99);
  c.friends = new Map();
  c.requests = new Map();
  if (Array.isArray(msg.friends)) {
    for (const f of msg.friends.slice(0, 200)) if (f && validPid(f.pid) && f.pid !== c.pid) c.friends.set(f.pid, cleanName(f.name));
  }
  byPid.set(c.pid, c);
  newParty(c);
  send(c, { t: 'welcome', pid: c.pid, name: c.name });
}

function dropConn(c) {
  if (!c.pid || c.dropped) return;
  c.dropped = true;
  leaveMatch(c, true);
  removeFromParty(c);
  if (byPid.get(c.pid) === c) byPid.delete(c.pid);
  socialDirty = true;
}

function handle(c, msg) {
  if (msg.t === 'login') return login(c, msg);
  if (!c.pid || c.dropped) return;
  const p = c.party;
  switch (msg.t) {
    case 'profile':
      c.skin = cleanSkin(msg.skin); c.level = clamp(msg.level | 0, 0, 99); socialDirty = true;
      break;
    case 'rename':
      c.name = uniqueName(cleanName(msg.name), c);
      send(c, { t: 'welcome', pid: c.pid, name: c.name }); socialDirty = true;
      break;
    case 'friendAdd': {
      const name = cleanName(msg.name).toLowerCase();
      const o = [...byPid.values()].find(x => x.name.toLowerCase() === name);
      if (!o) return toast(c, 'Niemand mit diesem Namen ist gerade online.');
      if (o === c) return toast(c, 'Das bist du selbst.');
      if (c.friends.has(o.pid)) return toast(c, `${o.name} ist schon dein Freund.`);
      if (c.requests.has(o.pid)) return makeFriends(c, o);
      o.requests.set(c.pid, c.name);
      toast(c, `Freundschaftsanfrage an ${o.name} gesendet.`);
      toast(o, `${c.name} möchte dein Freund sein.`);
      socialDirty = true;
      break;
    }
    case 'friendAccept': {
      if (!c.requests.has(msg.pid)) return;
      const o = byPid.get(msg.pid);
      c.requests.delete(msg.pid); socialDirty = true;
      if (!o) return toast(c, 'Der Spieler ist nicht mehr online.');
      makeFriends(c, o);
      break;
    }
    case 'friendDecline':
      c.requests.delete(msg.pid); socialDirty = true;
      break;
    case 'friendRemove': {
      c.friends.delete(msg.pid);
      send(c, { t: 'friendRemoved', pid: msg.pid });
      const o = byPid.get(msg.pid);
      if (o) { o.friends.delete(c.pid); send(o, { t: 'friendRemoved', pid: c.pid }); }
      socialDirty = true;
      break;
    }
    case 'invite': {
      const o = byPid.get(msg.pid);
      if (!o || !c.friends.has(o.pid) || p.members.includes(o.pid)) return;
      if (p.members.length >= PARTY_MAX) return toast(c, 'Deine Party ist voll.');
      if (o.match) return toast(c, `${o.name} ist gerade im Spiel.`);
      send(o, { t: 'invite', partyId: p.id, from: c.name, fromPid: c.pid });
      toast(c, `Einladung an ${o.name} gesendet.`);
      break;
    }
    case 'inviteAccept': {
      const np = parties.get(msg.partyId);
      if (!np) return toast(c, 'Diese Party gibt es nicht mehr.');
      if (np === p || c.match) return;
      if (np.members.length >= PARTY_MAX) return toast(c, 'Die Party ist schon voll.');
      removeFromParty(c);
      np.members.push(c.pid); c.party = np; unqueue(np);
      for (const pid of np.members) { const o = byPid.get(pid); if (o && o !== c) toast(o, `${c.name} ist der Party beigetreten.`); }
      socialDirty = true;
      break;
    }
    case 'inviteDecline': {
      const o = byPid.get(msg.fromPid);
      if (o) toast(o, `${c.name} hat die Einladung abgelehnt.`);
      break;
    }
    case 'partyLeave':
      if (p.members.length <= 1) return;
      removeFromParty(c); newParty(c);
      break;
    case 'kick': {
      if (p.leader !== c.pid || msg.pid === c.pid || !p.members.includes(msg.pid)) return;
      const o = byPid.get(msg.pid);
      if (o) { removeFromParty(o); newParty(o); toast(o, 'Du wurdest aus der Party entfernt.'); }
      break;
    }
    case 'play': {
      if (p.leader !== c.pid || p.queued || c.match) return;
      const busy = p.members.map(pid => byPid.get(pid)).filter(o => o && o.match);
      if (busy.length) return toast(c, `Warte, bis ${busy.map(o => o.name).join(', ')} zurück ist.`);
      p.queued = true; p.queueSince = nowS(); queue.push(p.id); socialDirty = true;
      break;
    }
    case 'cancel':
      if (p.leader === c.pid) unqueue(p);
      break;
    case 'input': {
      const m = c.match; if (!m) return;
      const t = m.byId.get(c.pid); if (!t || !t.alive) return;
      t.input = {
        dx: clamp(+msg.dx || 0, -1, 1), dy: clamp(+msg.dy || 0, -1, 1),
        aim: Number.isFinite(+msg.aim) ? +msg.aim : t.ta, fire: !!msg.fire, block: !!msg.block,
      };
      break;
    }
    case 'spectate': {
      const m = c.match; if (!m) return;
      const me = m.byId.get(c.pid); if (!me || me.alive) return;
      const alive = m.tanks.filter(t => t.alive);
      if (!alive.length) return;
      alive.sort((a, b) => (a.team === me.team ? 0 : 1) - (b.team === me.team ? 0 : 1));
      const i = alive.findIndex(t => t.id === c.focusId);
      c.focusId = alive[(i + 1) % alive.length].id;
      break;
    }
    case 'toLobby':
      leaveMatch(c, false);
      break;
  }
}

// ================= Matchmaking =================
function matchmake(now) {
  queue = queue.filter(id => { const p = parties.get(id); return p && p.queued; });
  if (!queue.length) return;
  const first = parties.get(queue[0]);
  const humans = queue.reduce((s, id) => s + parties.get(id).members.length, 0);
  if (now - first.queueSince < 5 && humans < 8) return; // kurz auf weitere Partys warten
  const chosen = [];
  let n = 0;
  for (const id of queue) {
    const p = parties.get(id);
    if (n + p.members.length > 12) break;
    chosen.push(p); n += p.members.length;
  }
  for (const p of chosen) unqueue(p);
  createMatch(chosen, now);
}

// ================= Match =================
function newAI() {
  return { target: null, seenT: 0, senseT: 0, lastSeen: null, side: 1, sideT: 0, noise: 0, noiseT: 0, wx: 0, wy: 0, wT: 0, hide: -1, provoked: false };
}
function makeTank(id, name, team, skin, bot) {
  return {
    id, name, team, skin, bot, x: 0, y: 0, a: 0, ta: 0, h: 0, vx: 0, vy: 0,
    hp: MAX_HP, alive: true, kills: 0, dmg: 0,
    ph: 'bus', dropT0: 0, landedAt: 0, jumpAt: 0, goal: null, lastHurt: 0,
    revealUntil: 0, nextFire: 0, tpLock: -1, blockUntil: 0, blockReady: 0,
    input: { dx: 0, dy: 0, aim: 0, fire: false, block: false }, ai: bot ? newAI() : null,
    place: 0, resultSent: false, killerId: null,
  };
}

// Flugroute des Kampfbusses: quer über die Karte, nicht genau durch die Mitte
function makeBusRoute() {
  const a = Math.random() * Math.PI * 2;
  const off = (Math.random() - 0.5) * MAP * 0.4;
  const cx = MAP / 2 + Math.cos(a + Math.PI / 2) * off, cy = MAP / 2 + Math.sin(a + Math.PI / 2) * off;
  // Gerade durch (cx,cy) auf das Innere der Karte zuschneiden, damit niemand am Rand landen muss
  const dx = Math.cos(a), dy = Math.sin(a), lo = 260, hi = MAP - 260;
  let t0 = -1e9, t1 = 1e9;
  for (const [p, d] of [[cx, dx], [cy, dy]]) {
    if (Math.abs(d) < 1e-6) continue;
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
  }
  return { x0: cx + dx * t0, y0: cy + dy * t0, x1: cx + dx * t1, y1: cy + dy * t1, a };
}
function busPos(m, now) {
  const k = clamp((now - m.busStart) / m.busDur, 0, 1), r = m.bus;
  return { x: lerp(r.x0, r.x1, k), y: lerp(r.y0, r.y1, k), k };
}

function createMatch(chosen, now) {
  const seed = Math.floor(Math.random() * 1e9);
  const map = makeMap(seed);
  const teamSize = Math.max(...chosen.map(p => p.members.length));
  const total = teamSize >= 4 ? 20 : 16;
  const busDur = BUS_DUR * (FAST < 1 ? 0.4 : 1);
  const m = {
    id: uid('m'), map, tanks: [], byId: new Map(), bullets: [], events: [],
    humans: new Set(), humanList: [], over: false, endAt: 0, teamCount: 0, lastTick: now,
    bus: makeBusRoute(), busStart: now + BUS_WAIT, busDur,
  };
  m.busEnd = m.busStart + busDur;
  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  let botN = 0;
  const addBot = (team) => {
    m.tanks.push(makeTank('bot' + uid(''), names[botN++ % names.length], team, BOT_SKINS[Math.floor(Math.random() * BOT_SKINS.length)], true));
  };
  let team = 0;
  for (const p of chosen) {
    let size = 0;
    for (const pid of p.members) {
      const c = byPid.get(pid);
      if (!c || c.match) continue;
      m.tanks.push(makeTank(c.pid, c.name, team, c.skin, false));
      m.humans.add(c.pid); m.humanList.push({ pid: c.pid, name: c.name });
      c.match = m; c.focusId = c.pid;
      size++;
    }
    while (size < teamSize) { addBot(team); size++; }
    team++;
  }
  while (m.tanks.length < total) {
    for (let k = 0; k < teamSize && m.tanks.length < total; k++) addBot(team);
    team++;
  }
  m.teamCount = team;
  for (const t of m.tanks) {
    m.byId.set(t.id, t);
    t.x = m.bus.x0; t.y = m.bus.y0; t.a = t.ta = m.bus.a;
    if (t.bot) t.jumpAt = m.busStart + busDur * (0.08 + Math.random() * 0.84);
  }
  // Sturm: bedeckt am Anfang die ganze Karte, startet nach dem Bus
  m.zone = { x: MAP / 2, y: MAP / 2, r: MAP * 0.72, tx: 0, ty: 0, tr: 0, phase: 0, stage: 'wait', until: m.busEnd + ZONE_PHASES[0].wait, fx: 0, fy: 0, fr: 0, s0: 0 };
  setZoneTarget(m.zone, 0);
  matches.set(m.id, m);
  const mapPayload = { size: MAP, hills: map.hills, rocks: map.rocks, bushes: map.bushes.map(b => ({ x: b.x, y: b.y, r: b.r, hp: b.hp })), teleports: map.teleports };
  const roster = m.tanks.map(t => ({ id: t.id, name: t.name, team: t.team, skin: t.skin, bot: t.bot }));
  for (const pid of m.humans) {
    const c = byPid.get(pid), me = m.byId.get(pid);
    send(c, { t: 'matchStart', map: mapPayload, roster, myTeam: me.team, teams: m.teamCount, total: m.tanks.length, maxHp: MAX_HP, bus: m.bus, busDur, blockCd: BLOCK_CD + BLOCK_TIME });
  }
  socialDirty = true;
}

function setZoneTarget(z, phase) {
  const nr = ZONE_PHASES[phase].r;
  const maxOff = Math.max(0, z.r - nr) * 0.7;
  const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * maxOff;
  const margin = Math.min(MAP / 2, nr + 200);
  z.tx = clamp(z.x + Math.cos(a) * d, margin, MAP - margin);
  z.ty = clamp(z.y + Math.sin(a) * d, margin, MAP - margin);
  z.tr = nr;
}
function updateZone(m, now) {
  const z = m.zone;
  if (z.stage === 'done') return;
  const ph = ZONE_PHASES[z.phase];
  if (z.stage === 'wait' && now >= z.until) {
    z.stage = 'shrink'; z.fx = z.x; z.fy = z.y; z.fr = z.r; z.s0 = now; z.until = now + ph.shrink;
    m.events.push({ k: 'zone', g: 1 });
  }
  if (z.stage === 'shrink') {
    const k = clamp((now - z.s0) / ph.shrink, 0, 1);
    z.x = lerp(z.fx, z.tx, k); z.y = lerp(z.fy, z.ty, k); z.r = lerp(z.fr, z.tr, k);
    if (k >= 1) {
      z.phase++;
      if (z.phase < ZONE_PHASES.length) { z.stage = 'wait'; z.until = now + ZONE_PHASES[z.phase].wait; setZoneTarget(z, z.phase); }
      else { z.stage = 'done'; z.until = now; }
    }
  }
}
const zoneDps = (z) => (z.stage === 'done' ? 20 : ZONE_PHASES[Math.min(z.phase, ZONE_PHASES.length - 1)].dps);

function collide(map, t) {
  t.x = clamp(t.x, TR, MAP - TR); t.y = clamp(t.y, TR, MAP - TR);
  for (const k of map.rocks) {
    const dx = t.x - k.x, dy = t.y - k.y, d = Math.hypot(dx, dy), min = k.r + TR;
    if (d < min && d > 0.001) { t.x = k.x + dx / d * min; t.y = k.y + dy / d * min; }
  }
}

// ---------- Bus & Fallschirm ----------
function jump(m, t, now) {
  const p = busPos(m, now);
  t.ph = 'drop'; t.dropT0 = now; t.x = clamp(p.x, 40, MAP - 40); t.y = clamp(p.y, 40, MAP - 40);
  if (t.bot) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * 520;
    t.goal = { x: clamp(t.x + Math.cos(a) * d, 120, MAP - 120), y: clamp(t.y + Math.sin(a) * d, 120, MAP - 120) };
  }
  m.events.push({ k: 'jump', x: t.x, y: t.y, i: t.id });
}
function updateAir(m, t, now, dt) {
  if (t.ph === 'bus') {
    if (now < m.busStart) return;
    const p = busPos(m, now);
    t.x = p.x; t.y = p.y; t.a = t.ta = m.bus.a;
    const wants = t.bot ? now >= t.jumpAt : t.input.fire;
    if (wants || now >= m.busEnd) jump(m, t, now);
    return;
  }
  // Fallschirm: frei steuern, dann landen
  let dx = t.input.dx, dy = t.input.dy;
  if (t.bot && t.goal) { dx = t.goal.x - t.x; dy = t.goal.y - t.y; if (Math.hypot(dx, dy) < 12) dx = dy = 0; }
  const L = Math.hypot(dx, dy);
  if (L > 0.05) { t.x += dx / L * DROP_SPEED * dt; t.y += dy / L * DROP_SPEED * dt; t.a = turnTo(t.a, Math.atan2(dy, dx), dt * 6); }
  t.x = clamp(t.x, TR, MAP - TR); t.y = clamp(t.y, TR, MAP - TR);
  t.ta = t.bot ? t.a : turnTo(t.ta, t.input.aim, dt * 40);
  if (now - t.dropT0 >= DROP_TIME) {
    t.ph = 'ground'; t.landedAt = now; t.lastHurt = now;
    collide(m.map, t);
    t.h = heightAt(m.map, t.x, t.y);
    m.events.push({ k: 'land', x: t.x, y: t.y, i: t.id });
  }
}

function moveTank(m, t, now, dt) {
  const map = m.map, inp = t.input;
  const px = t.x, py = t.y;
  if (inp.block && now >= t.blockReady) {
    t.blockUntil = now + BLOCK_TIME; t.blockReady = now + BLOCK_TIME + BLOCK_CD;
    m.events.push({ k: 'blockOn', x: t.x, y: t.y, i: t.id });
  }
  const blocking = now < t.blockUntil;
  const L = Math.hypot(inp.dx, inp.dy);
  if (L > 0.05) {
    const dx = inp.dx / L, dy = inp.dy / L;
    const h0 = heightAt(map, t.x, t.y), h1 = heightAt(map, t.x + dx * 6, t.y + dy * 6);
    const s = clamp((h1 - h0) / 6 * SLOPE_W, -1, 1);
    const f = s > 0 ? 1 - 0.55 * s : 1 - 0.3 * s; // bergauf langsamer, bergab schneller
    const sp = SPEED * (blocking ? 0.6 : 1) * f;
    t.a = turnTo(t.a, Math.atan2(dy, dx), dt * 10);
    t.x += dx * sp * dt; t.y += dy * sp * dt;
    collide(map, t);
  }
  t.ta = turnTo(t.ta, inp.aim, dt * (t.bot ? 6 : 40));

  const tps = map.teleports;
  for (let i = 0; i < tps.length; i++) {
    const tp = tps[i], d = Math.hypot(t.x - tp.x, t.y - tp.y);
    if (t.tpLock === i && d > tp.r + TR) t.tpLock = -1;
    else if (t.tpLock !== i && d < tp.r) {
      const dst = tps[tp.pair];
      m.events.push({ k: 'tp', x: t.x, y: t.y });
      t.x = dst.x; t.y = dst.y; t.tpLock = tp.pair;
      m.events.push({ k: 'tp', x: dst.x, y: dst.y });
      break;
    }
  }
  t.vx = (t.x - px) / dt; t.vy = (t.y - py) / dt;
  t.h = heightAt(map, t.x, t.y);

  // langsame Selbstreparatur, wenn länger kein Schaden (nicht im Sturm)
  const z = m.zone;
  if (t.hp < MAX_HP && now - t.lastHurt > REGEN_DELAY && Math.hypot(t.x - z.x, t.y - z.y) < z.r) t.hp = Math.min(MAX_HP, t.hp + REGEN * dt);

  if (inp.fire && now >= t.nextFire && !blocking) {
    t.nextFire = now + FIRE_CD;
    t.revealUntil = now + REVEAL;
    const c = Math.cos(t.ta), s = Math.sin(t.ta), ob = bushAt(map, t.x, t.y);
    m.bullets.push({ id: (bulletId = (bulletId + 1) % 1e6), x: t.x + c * (TR + 10), y: t.y + s * (TR + 10), vx: c * BSPEED, vy: s * BSPEED, a: t.ta, owner: t.id, team: t.team, h: t.h, dmg: DMG, life: BLIFE, bush: ob });
    m.events.push({ k: 'shot', x: t.x + c * (TR + 12), y: t.y + s * (TR + 12), a: t.ta, i: t.id });
  }
}

let bulletId = 0;
function updateBullets(m, now, dt) {
  const map = m.map;
  for (const b of m.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > MAP || b.y > MAP) { b.dead = true; continue; }
    let hit = false;
    for (const k of map.rocks) {
      if (Math.hypot(b.x - k.x, b.y - k.y) < k.r + BR) { m.events.push({ k: 'puff', x: b.x, y: b.y }); hit = true; break; }
    }
    if (!hit && heightAt(map, b.x, b.y) > b.h + HILL_BLOCK) { m.events.push({ k: 'dirt', x: b.x, y: b.y }); hit = true; }
    if (!hit) {
      for (let i = 0; i < map.bushes.length; i++) {
        const bu = map.bushes[i];
        if (i === b.bush || bu.hp <= 0) continue;
        if (Math.hypot(b.x - bu.x, b.y - bu.y) < bu.r) {
          bu.hp = 0;
          m.events.push({ k: 'bush', g: 1, i, hp: 0, x: bu.x, y: bu.y });
          hit = true; break;
        }
      }
    }
    if (!hit) {
      for (const t of m.tanks) {
        if (!t.alive || t.ph !== 'ground' || t.team === b.team) continue;
        if (Math.hypot(t.x - b.x, t.y - b.y) < HIT_R + BR) {
          if (now < t.blockUntil) m.events.push({ k: 'block', x: b.x, y: b.y, v: t.id, by: b.owner });
          else damage(m, t, b, now);
          hit = true; break;
        }
      }
    }
    if (hit) b.dead = true;
  }
  m.bullets = m.bullets.filter(b => !b.dead);
}

function damage(m, t, b, now) {
  const att = m.byId.get(b.owner);
  const d = Math.min(t.hp, b.dmg);
  t.hp -= b.dmg; t.lastHurt = now;
  if (att) att.dmg += d;
  m.events.push({ k: 'hit', x: t.x, y: t.y, d: b.dmg, v: t.id, by: b.owner });
  if (t.bot && att) { t.ai.lastSeen = { x: att.x, y: att.y, t: now }; t.ai.senseT = 0; t.ai.provoked = true; }
  if (t.hp <= 0) eliminate(m, t, att, 'kill', now);
}

function eliminate(m, t, killer, cause, now) {
  if (!t.alive) return;
  t.alive = false; t.hp = 0; t.killerId = killer ? killer.id : null;
  if (t.ph === 'ground') m.events.push({ k: 'boom', x: t.x, y: t.y });
  let text;
  if (killer && killer !== t) {
    killer.kills++; text = `${killer.name} hat ${t.name} eliminiert`;
    if (killer.alive) { const before = killer.hp; killer.hp = Math.min(MAX_HP, killer.hp + KILL_HEAL); m.events.push({ k: 'heal', x: killer.x, y: killer.y, i: killer.id, d: Math.round(killer.hp - before) }); }
  }
  else if (cause === 'zone') text = `${t.name} wurde vom Sturm erwischt`;
  else text = `${t.name} hat das Spiel verlassen`;
  m.events.push({ k: 'feed', g: 1, text, by: killer ? killer.id : null, v: t.id });
  if (killer) m.events.push({ k: 'elim', g: 1, by: killer.id, v: t.id, vn: t.name });
  const teamsAliveNow = new Set(m.tanks.filter(o => o.alive).map(o => o.team)).size;
  if (!t.bot) {
    const c = byPid.get(t.id);
    if (c && c.match === m) send(c, { t: 'dead', by: killer ? killer.name : null, cause, place: teamsAliveNow + 1 });
  }
  if (!m.tanks.some(o => o.team === t.team && o.alive)) {
    for (const o of m.tanks) if (o.team === t.team) sendResult(m, o, teamsAliveNow + 1, false);
  }
  checkEnd(m, now);
}

function sendResult(m, t, place, win) {
  if (t.resultSent) return;
  t.resultSent = true; t.place = place;
  if (t.bot) return;
  const c = byPid.get(t.id);
  if (!c) return;
  send(c, {
    t: 'result', place, teams: m.teamCount, kills: t.kills, dmg: Math.round(t.dmg), win,
    players: m.humanList.filter(p => p.pid !== t.id), inMatch: c.match === m,
  });
}

function checkEnd(m, now) {
  if (m.over) return;
  const teams = new Set(m.tanks.filter(o => o.alive).map(o => o.team));
  if (teams.size > 1) return;
  m.over = true; m.endAt = now + 10;
  for (const o of m.tanks) if (teams.has(o.team)) sendResult(m, o, 1, true);
  const winner = m.tanks.find(o => teams.has(o.team));
  m.events.push({ k: 'over', g: 1, team: winner ? winner.team : -1 });
}

function leaveMatch(c, disconnect) {
  const m = c.match;
  if (!m) return;
  c.match = null;
  m.humans.delete(c.pid);
  const t = m.byId.get(c.pid);
  if (t && t.alive && !m.over) eliminate(m, t, null, 'left', nowS());
  if (!m.humans.size) matches.delete(m.id);
  if (!disconnect) send(c, { t: 'lobby' });
  socialDirty = true;
}

// ---------- Bots ----------
function hiddenFrom(map, t, viewer, now) {
  if (t.team === viewer.team || now < t.revealUntil || t.ph !== 'ground') return false;
  if (bushAt(map, t.x, t.y) < 0) return false;
  return dist(t, viewer) > 75;
}
function shotClear(map, a, b, h) {
  const d = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.ceil(d / 18);
  const own = bushAt(map, a.x, a.y), targetBush = bushAt(map, b.x, b.y);
  for (let i = 1; i < steps; i++) {
    const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
    if (rockAt(map, x, y, BR)) return false;
    if (heightAt(map, x, y) > h + HILL_BLOCK) return false;
    const bi = bushAt(map, x, y);
    if (bi >= 0 && bi !== own && bi !== targetBush) return false;
  }
  return true;
}
function blockedAt(map, x, y) {
  return x < TR + 10 || y < TR + 10 || x > MAP - TR - 10 || y > MAP - TR - 10 || rockAt(map, x, y, TR + 6);
}

function botThink(m, t, now, dt) {
  const ai = t.ai, map = m.map, z = m.zone;
  ai.senseT -= dt; ai.sideT -= dt; ai.noiseT -= dt; ai.wT -= dt;
  if (ai.noiseT <= 0) { ai.noiseT = 0.6; ai.noise = (Math.random() - 0.5) * 0.24; }
  if (ai.sideT <= 0) { ai.sideT = 1 + Math.random() * 1.6; ai.side = Math.random() < 0.5 ? -1 : 1; }
  if (ai.senseT <= 0) {
    ai.senseT = 0.25;
    let best = null, bs = Infinity;
    const calm = now < t.landedAt + 8 && !ai.provoked; // kurz nach der Landung erst umschauen
    for (const o of m.tanks) {
      if (calm || !o.alive || o.ph !== 'ground' || o.team === t.team) continue;
      const d = dist(o, t);
      if (d > 560 || hiddenFrom(map, o, t, now)) continue;
      const score = d + o.hp * 1.5;
      if (score < bs) { bs = score; best = o; }
    }
    if (best !== ai.target) ai.seenT = 0;
    ai.target = best;
    if (best) ai.lastSeen = { x: best.x, y: best.y, t: now };
  }
  if (ai.target && !ai.target.alive) ai.target = null;
  const tg = ai.target;
  if (tg) ai.seenT += dt;

  const useNext = z.stage === 'shrink' || (z.stage === 'wait' && z.until - now < 20);
  const zx = useNext ? z.tx : z.x, zy = useNext ? z.ty : z.y, zr = useNext ? z.tr : z.r;
  const outside = Math.hypot(t.x - z.x, t.y - z.y) > z.r - 25;
  const zoneUrgent = outside || Math.hypot(t.x - zx, t.y - zy) > Math.max(zr - 70, zr * 0.8);

  let gx = t.x, gy = t.y, move = true;
  if (zoneUrgent) { gx = zx; gy = zy; ai.hide = -1; }
  else if (tg) {
    const d = dist(t, tg);
    if (d > 360) { gx = tg.x; gy = tg.y; }
    else if (d < 200) { gx = t.x * 2 - tg.x; gy = t.y * 2 - tg.y; }
    else { const a = Math.atan2(tg.y - t.y, tg.x - t.x) + ai.side * Math.PI / 2; gx = t.x + Math.cos(a) * 60; gy = t.y + Math.sin(a) * 60; }
    ai.hide = -1;
  } else if (ai.lastSeen && now - ai.lastSeen.t < 4) {
    const d = Math.hypot(ai.lastSeen.x - t.x, ai.lastSeen.y - t.y);
    if (d > 260) { gx = ai.lastSeen.x; gy = ai.lastSeen.y; } else move = false;
  } else if (t.hp < 50 && (ai.hide >= 0 || Math.random() < 0.03)) {
    if (ai.hide < 0 || map.bushes[ai.hide].hp <= 0) {
      let bd = 500; ai.hide = -1;
      map.bushes.forEach((b, i) => { const d = Math.hypot(b.x - t.x, b.y - t.y); if (b.hp > 0 && d < bd) { bd = d; ai.hide = i; } });
    }
    if (ai.hide >= 0) { const b = map.bushes[ai.hide]; gx = b.x; gy = b.y; if (Math.hypot(b.x - t.x, b.y - t.y) < 8) move = false; }
  } else {
    if (ai.wT <= 0 || Math.hypot(ai.wx - t.x, ai.wy - t.y) < 30) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.min(zr * 0.6, 700);
      const cx = Math.hypot(t.x - zx, t.y - zy) < zr * 0.6 ? t.x : zx, cy = Math.hypot(t.x - zx, t.y - zy) < zr * 0.6 ? t.y : zy;
      ai.wx = clamp(cx + Math.cos(a) * r, 80, MAP - 80); ai.wy = clamp(cy + Math.sin(a) * r, 80, MAP - 80); ai.wT = 5 + Math.random() * 4;
    }
    gx = ai.wx; gy = ai.wy;
  }
  let ang = Math.atan2(gy - t.y, gx - t.x);
  if (Math.hypot(gx - t.x, gy - t.y) < 10) move = false;
  if (move) {
    for (let k = 0; k < 6; k++) {
      if (!blockedAt(map, t.x + Math.cos(ang) * 46, t.y + Math.sin(ang) * 46)) break;
      ang += ai.side * 0.7;
    }
  }

  let aim = move ? ang : t.ta, fire = false;
  if (tg) {
    const d = dist(t, tg), tt = d / BSPEED;
    const px = tg.x + tg.vx * tt * 0.8, py = tg.y + tg.vy * tt * 0.8;
    const a = Math.atan2(py - t.y, px - t.x);
    aim = a + ai.noise * Math.min(1.5, d / 400);
    fire = ai.seenT > 0.55 && d < 560 && Math.abs(normAngle(a - t.ta)) < 0.14 && shotClear(map, t, tg, t.h);
  } else if (ai.lastSeen && now - ai.lastSeen.t < 3) {
    const bi = bushAt(map, ai.lastSeen.x, ai.lastSeen.y);
    if (bi >= 0 && bi !== bushAt(map, t.x, t.y) && Math.hypot(ai.lastSeen.x - t.x, ai.lastSeen.y - t.y) < 480) {
      const a = Math.atan2(ai.lastSeen.y - t.y, ai.lastSeen.x - t.x);
      aim = a; fire = Math.abs(normAngle(a - t.ta)) < 0.15;
    }
  }
  let block = false;
  if (now >= t.blockReady && Math.random() < 0.5) {
    for (const b of m.bullets) {
      if (b.team === t.team) continue;
      const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy);
      if (d > 110 || d < 1) continue;
      if ((b.vx * dx + b.vy * dy) / (BSPEED * d) > 0.96) { block = true; break; }
    }
  }
  t.input = { dx: move ? Math.cos(ang) : 0, dy: move ? Math.sin(ang) : 0, aim, fire, block };
}

function stepMatch(m, now, dt) {
  updateZone(m, now);
  if (m.over) { updateBullets(m, now, dt); return; }
  for (const t of m.tanks) if (t.alive && t.ph !== 'ground') updateAir(m, t, now, dt);
  for (const t of m.tanks) if (t.alive && t.ph === 'ground' && t.bot) botThink(m, t, now, dt);
  for (const t of m.tanks) if (t.alive && t.ph === 'ground') moveTank(m, t, now, dt);
  const ground = m.tanks.filter(t => t.alive && t.ph === 'ground');
  for (let i = 0; i < ground.length; i++) for (let j = i + 1; j < ground.length; j++) {
    const a = ground[i], b = ground[j];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = TR * 2;
    if (d < min) {
      const nx = d > 0.001 ? dx / d : 1, ny = d > 0.001 ? dy / d : 0, p = (min - d) / 2;
      a.x -= nx * p; a.y -= ny * p; b.x += nx * p; b.y += ny * p;
      collide(m.map, a); collide(m.map, b);
    }
  }
  updateBullets(m, now, dt);
  const z = m.zone, dps = zoneDps(z);
  for (const t of ground) {
    if (!t.alive) continue;
    if (Math.hypot(t.x - z.x, t.y - z.y) > z.r) {
      t.hp -= dps * dt;
      if (t.hp <= 0) eliminate(m, t, null, 'zone', now);
    }
  }
}

const r1 = (v) => Math.round(v * 10) / 10;
function pickFocus(m, c, me) {
  if (me.alive) return me;
  let f = m.byId.get(c.focusId);
  if (f && f.alive) return f;
  f = m.tanks.find(t => t.alive && t.team === me.team) || (me.killerId && m.byId.get(me.killerId)) || m.tanks.find(t => t.alive) || me;
  if (!f.alive) f = m.tanks.find(t => t.alive) || me;
  c.focusId = f.id;
  return f;
}
const PH = { ground: 0, bus: 1, drop: 2 };
function sendStates(m, now) {
  const z = m.zone, map = m.map;
  const zone = { x: r1(z.x), y: r1(z.y), r: r1(z.r), tx: r1(z.tx), ty: r1(z.ty), tr: r1(z.tr), st: z.stage, left: r1(Math.max(0, z.until - now)), ph: z.phase };
  const alive = m.tanks.filter(t => t.alive);
  const teamsN = new Set(alive.map(t => t.team)).size;
  const bp = busPos(m, now);
  const bus = now < m.busEnd ? { x: r1(bp.x), y: r1(bp.y), k: Math.round(bp.k * 1000) / 1000, wait: r1(Math.max(0, m.busStart - now)), n: alive.filter(t => t.ph === 'bus').length } : null;
  const occ = [];
  for (const t of alive) if (t.ph === 'ground') { const bi = bushAt(map, t.x, t.y); if (bi >= 0 && !occ.includes(bi)) occ.push(bi); }
  for (const pid of m.humans) {
    const c = byPid.get(pid);
    if (!c || c.match !== m) continue;
    const me = m.byId.get(pid);
    const f = pickFocus(m, c, me);
    const near = (o, extra = 0) => Math.hypot(o.x - f.x, o.y - f.y) < VIEW_R + extra;
    const tanks = [];
    for (const t of alive) {
      if (t.ph === 'bus') continue;
      if (t !== f && t.team !== me.team && (!near(t) || hiddenFrom(map, t, f, now))) continue;
      if (t.team === me.team && !near(t, 400)) continue;
      tanks.push({
        i: t.id, x: r1(t.x), y: r1(t.y), a: r1(t.a * 10) / 10, ta: r1(t.ta * 10) / 10, h: Math.round(t.h * 100) / 100, hp: Math.ceil(t.hp),
        bk: now < t.blockUntil ? 1 : 0, ph: PH[t.ph], alt: t.ph === 'drop' ? Math.round(clamp(1 - (now - t.dropT0) / DROP_TIME, 0, 1) * 100) / 100 : 0,
      });
    }
    send(c, {
      t: 's', ts: Math.round(now * 1000), f: f.id,
      me: {
        hp: Math.ceil(Math.max(0, me.hp)), alive: me.alive, kills: me.kills, dmg: Math.round(me.dmg), ph: PH[me.ph],
        bk: now < me.blockUntil ? 1 : 0, bl: r1(Math.max(0, me.blockReady - now)), rl: r1(Math.max(0, me.nextFire - now)),
      },
      bus, tanks,
      b: m.bullets.filter(b => near(b)).map(b => [b.id, r1(b.x), r1(b.y), b.team === me.team ? 1 : 0, r1(b.a * 10) / 10]),
      occ: occ.filter(i => near(map.bushes[i])),
      ev: m.events.filter(e => e.g || (e.x !== undefined && near(e, 150))),
      z: zone, al: alive.length, tl: teamsN,
      mates: m.tanks.filter(t => t.team === me.team).map(t => [t.id, r1(t.x), r1(t.y), t.alive ? 1 : 0, Math.ceil(Math.max(0, t.hp))]),
    });
  }
  m.events = [];
}

// ================= Haupt-Takt =================
const TICK = 1 / 30;
setInterval(() => {
  const now = nowS();
  for (const m of [...matches.values()]) {
    const dt = clamp(now - m.lastTick, 0.001, 0.1);
    m.lastTick = now;
    try { stepMatch(m, now, dt); } catch (e) { console.error('Fehler im Match', e); }
    if (!matches.has(m.id)) continue;
    sendStates(m, now);
    if (m.over && now >= m.endAt) {
      for (const pid of [...m.humans]) {
        const c = byPid.get(pid);
        if (c && c.match === m) { c.match = null; send(c, { t: 'lobby' }); }
      }
      matches.delete(m.id);
      socialDirty = true;
    }
  }
  matchmake(now);
  if (socialDirty) flushSocial();
}, TICK * 1000);
setInterval(() => { socialDirty = true; }, 2000);

// ================= WebSocket =================
const wss = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 });
wss.on('connection', (ws) => {
  const c = { ws, pid: null, name: '', skin: 'rot', level: 1, party: null, match: null, friends: new Map(), requests: new Map(), alive: true, focusId: null };
  conns.add(c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    try { handle(c, msg); } catch (e) { console.error('Fehler bei', msg.t, e); }
  });
  ws.on('close', () => { dropConn(c); conns.delete(c); });
});
setInterval(() => {
  for (const c of conns) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    try { c.ws.ping(); } catch { /* egal */ }
  }
}, 25000);

httpServer.listen(PORT, () => console.log(`PANZER läuft auf http://localhost:${PORT}`));
