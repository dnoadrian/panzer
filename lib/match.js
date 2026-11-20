// PANZER – Spiel-Engine: Karte, Battle Royale, Fähigkeiten, Bots
'use strict';
const CAT = require('../public/catalog.js');

// ================= Spielwerte =================
const MAP = 3600;
const TR = 16;              // Panzer-Radius (Kollision)
const HIT_R = 17;           // Treffer-Radius
const BR = 4;
const MAX_HP = 150;
const SPEED = 85;
const BSPEED = 430;
const BLIFE = 1.3;          // ca. 560 Reichweite
const DMG = 25;
const FIRE_CD = 1.0;
const KILL_HEAL = 50;
const REGEN_DELAY = 5, REGEN = 6;
const BLOCK_TIME = 1.2, BLOCK_CD = 7;
const VIEW_R = 1150;
const REVEAL = 1.2;
const BUS_WAIT = 4, BUS_DUR = 16, DROP_TIME = 4, DROP_SPEED = 200;
const LAKE_SLOW = 0.55;
const FAST = process.env.PANZER_FAST === '1' ? 0.12 : 1;
// Ganze Runde ca. 4 Minuten: Bus 20 s + Sturm 220 s
const ZONE_PHASES = [
  { wait: 30, shrink: 25, r: 1050, dps: 2 },
  { wait: 25, shrink: 22, r: 650, dps: 4 },
  { wait: 22, shrink: 20, r: 380, dps: 7 },
  { wait: 18, shrink: 18, r: 170, dps: 11 },
  { wait: 15, shrink: 25, r: 0, dps: 16 },
].map(p => ({ ...p, wait: p.wait * FAST, shrink: p.shrink * FAST }));
const BOT_SKINS = ['rot', 'blau', 'gruen', 'orange', 'lila', 'tuerkis', 'grau', 'pink'];
const BOT_HATS = ['keiner', 'keiner', 'keiner', 'kappe', 'partyhut', 'blume'];
const BOT_ABILITIES = ['turbo', 'repair', 'smoke', 'mine', 'sniper', 'salvo', 'dome', 'blink', 'shotgun', 'rocket'];
const BOT_NAMES = ['Otto', 'Kalle', 'Gerd', 'Franz', 'Heinz', 'Rudi', 'Bruno', 'Lotte', 'Hilde', 'Emil', 'Fritz', 'Greta',
  'Paul', 'Ida', 'Kurt', 'Erna', 'Hugo', 'Frieda', 'Willi', 'Elli', 'Karl', 'Mia', 'Jonas', 'Lena'];
const POI_TYPES = [
  { type: 'ruine', name: 'Alte Ruine' }, { type: 'muehle', name: 'Mühlenwiese' }, { type: 'lager', name: 'Holzlager' },
  { type: 'teich', name: 'Froschteich' }, { type: 'wald', name: 'Dunkelwald' }, { type: 'dorf', name: 'Kleindorf' },
];

// ================= Helfer =================
let idc = 0;
const uid = (p) => p + (++idc).toString(36);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a, b, k) => a + (b - a) * k;
const normAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const turnTo = (cur, target, k) => cur + normAngle(target - cur) * Math.min(1, k);
const r1 = (v) => Math.round(v * 10) / 10;
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 4294967296; };
}

// ================= Karte =================
function makePlateau(rnd) {
  const N = 160, base = MAP * 0.44, waves = [];
  for (let i = 0; i < 5; i++) waves.push({ a: rnd() * 6.283, amp: (0.04 + rnd() * 0.05) / (i * 0.5 + 1), f: i + 2 });
  for (let i = 0; i < 3; i++) waves.push({ a: rnd() * 6.283, amp: 0.007 + rnd() * 0.008, f: 13 + i * 9 });
  const r = [];
  for (let i = 0; i < N; i++) {
    const th = i / N * Math.PI * 2;
    let k = 1;
    for (const w of waves) k += w.amp * Math.sin(w.f * th + w.a);
    r.push(Math.round(base * (k + (rnd() - 0.5) * 0.01)));
  }
  return { cx: MAP / 2, cy: MAP / 2, r };
}
function plateauR(map, ang) {
  const P = map.plateau, N = P.r.length;
  let u = ang / (Math.PI * 2); u -= Math.floor(u); u *= N;
  const i = Math.floor(u) % N, fr = u - Math.floor(u);
  return P.r[i] + (P.r[(i + 1) % N] - P.r[i]) * fr;
}
function onPlateau(map, x, y, margin = 0) {
  const P = map.plateau, dx = x - P.cx, dy = y - P.cy;
  return Math.hypot(dx, dy) < plateauR(map, Math.atan2(dy, dx)) - margin;
}
function circleRect(x, y, r, w) {
  const cx = clamp(x, w.x, w.x + w.w), cy = clamp(y, w.y, w.y + w.h);
  return Math.hypot(x - cx, y - cy) < r;
}
function inLake(map, x, y) {
  for (const l of map.lakes) { const dx = (x - l.x) / l.rx, dy = (y - l.y) / l.ry; if (dx * dx + dy * dy < 1) return true; }
  return false;
}
function solidAt(map, x, y, r) {
  for (const s of map.solids) if (Math.hypot(x - s.x, y - s.y) < s.r + r) return s;
  for (const w of map.walls) if (circleRect(x, y, r, w)) return w;
  return null;
}
function bushAt(map, x, y) {
  for (let i = 0; i < map.bushes.length; i++) { const b = map.bushes[i]; if (b.hp > 0 && Math.hypot(x - b.x, y - b.y) < b.r) return i; }
  return -1;
}

function makeMap(seed) {
  const rnd = rng(seed);
  const R = (a, b) => a + (b - a) * rnd();
  const map = { size: MAP, plateau: makePlateau(rnd), mountains: [], rocks: [], trees: [], bushes: [], walls: [], lakes: [], pois: [], mills: [], reeds: [], teleports: [], solids: [] };
  const free = (x, y, r, gap = 20) => onPlateau(map, x, y, r + 50) && !solidAt(map, x, y, r + gap) && !inLake(map, x, y) &&
    map.lakes.every(l => Math.hypot(x - l.x, y - l.y) > Math.max(l.rx, l.ry) + r + gap);
  const addSolid = (o, k) => { o.k = k; map.solids.push(o); };
  // benannte Orte
  const order = POI_TYPES.slice().sort(() => rnd() - 0.5);
  for (const p of order) {
    for (let i = 0; i < 600; i++) {
      const x = R(400, MAP - 400), y = R(400, MAP - 400);
      if (!onPlateau(map, x, y, 380) || map.pois.some(o => Math.hypot(o.x - x, o.y - y) < 760)) continue;
      map.pois.push({ x, y, type: p.type, name: p.name });
      break;
    }
  }
  for (const p of map.pois) {
    if (p.type === 'ruine') {
      const s = 250, t = 22, x0 = p.x - s / 2, y0 = p.y - s / 2;
      const segs = [[x0, y0, s * 0.42, t], [x0 + s * 0.6, y0, s * 0.4, t], [x0, y0 + s - t, s * 0.35, t], [x0 + s * 0.55, y0 + s - t, s * 0.45, t],
        [x0, y0, t, s * 0.4], [x0, y0 + s * 0.62, t, s * 0.38], [x0 + s - t, y0, t, s * 0.3], [x0 + s - t, y0 + s * 0.5, t, s * 0.5]];
      segs.forEach((g, i) => { if (rnd() > 0.15 || i < 2) map.walls.push({ x: g[0], y: g[1], w: g[2], h: g[3], k: 'stone' }); });
      for (let i = 0; i < 4; i++) { const a = rnd() * 6.28, d = R(170, 230), x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d; if (free(x, y, 18)) { const o = { x, y, r: R(12, 20) }; map.rocks.push(o); addSolid(o, 'rock'); } }
    } else if (p.type === 'muehle') {
      const o = { x: p.x, y: p.y, r: 62 };
      map.mills.push(o); addSolid(o, 'mill');
    } else if (p.type === 'lager') {
      for (let i = 0; i < 9; i++) {
        const x = p.x + R(-160, 160), y = p.y + R(-140, 140), sz = rnd() < 0.3 ? 60 : 44;
        const w = { x: x - sz / 2, y: y - sz / 2, w: sz, h: sz, k: 'crate' };
        if (map.walls.every(o => Math.abs(o.x + o.w / 2 - x) > (o.w + sz) / 2 + 26 || Math.abs(o.y + o.h / 2 - y) > (o.h + sz) / 2 + 26)) map.walls.push(w);
      }
    } else if (p.type === 'teich') {
      const l = { x: p.x, y: p.y, rx: R(170, 230), ry: R(120, 170) };
      map.lakes.push(l);
      for (let i = 0; i < 14; i++) { const a = rnd() * 6.28; map.reeds.push({ x: l.x + Math.cos(a) * l.rx * R(0.92, 1.08), y: l.y + Math.sin(a) * l.ry * R(0.92, 1.08) }); }
    } else if (p.type === 'wald') {
      for (let i = 0; i < 60 && map.trees.filter(t => Math.hypot(t.x - p.x, t.y - p.y) < 300).length < 13; i++) {
        const a = rnd() * 6.28, d = Math.sqrt(rnd()) * 240, x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d, r = R(22, 30);
        if (free(x, y, r, 34)) { const o = { x, y, r }; map.trees.push(o); addSolid(o, 'tree'); }
      }
    } else if (p.type === 'dorf') {
      const offs = [[-130, -60], [110, -80], [0, 110]];
      const roofs = ['#e8594f', '#4f86e8', '#f2a03f'];
      offs.forEach(([ox, oy], i) => map.walls.push({ x: p.x + ox - 50, y: p.y + oy - 38, w: 100, h: 76, k: 'house', roof: roofs[i] }));
    }
  }
  // Berge (nicht befahrbar)
  for (let i = 0; i < 2000 && map.mountains.length < 6; i++) {
    const r = R(110, 180), x = R(r, MAP - r), y = R(r, MAP - r);
    if (!onPlateau(map, x, y, r + 90) || map.pois.some(p => Math.hypot(p.x - x, p.y - y) < r + 330) || map.mountains.some(m => Math.hypot(m.x - x, m.y - y) < m.r + r + 260)) continue;
    const o = { x, y, r }; map.mountains.push(o); addSolid(o, 'mountain');
  }
  for (let i = 0; i < 6000 && map.rocks.length < 26; i++) {
    const r = R(15, 34), x = R(80, MAP - 80), y = R(80, MAP - 80);
    if (free(x, y, r, 140)) { const o = { x, y, r }; map.rocks.push(o); addSolid(o, 'rock'); }
  }
  for (let i = 0; i < 6000 && map.trees.length < 40; i++) {
    const r = R(20, 28), x = R(80, MAP - 80), y = R(80, MAP - 80);
    if (free(x, y, r, 90)) { const o = { x, y, r }; map.trees.push(o); addSolid(o, 'tree'); }
  }
  // Teleporter-Paar
  for (let i = 0; i < 20000 && map.teleports.length < 2; i++) {
    const x = R(150, MAP - 150), y = R(150, MAP - 150);
    if (!onPlateau(map, x, y, 220) || solidAt(map, x, y, 70) || inLake(map, x, y)) continue;
    if (map.teleports.length === 1 && Math.hypot(map.teleports[0].x - x, map.teleports[0].y - y) < 1400) continue;
    map.teleports.push({ x, y, r: 22, pair: map.teleports.length ? 0 : 1 });
  }
  if (map.teleports.length < 2) map.teleports = [];
  for (let i = 0; i < 12000 && map.bushes.length < 52; i++) {
    const r = R(30, 44), x = R(80, MAP - 80), y = R(80, MAP - 80);
    if (free(x, y, r, 30) && map.bushes.every(b => Math.hypot(b.x - x, b.y - y) > b.r + r + 90) && map.teleports.every(t => Math.hypot(t.x - x, t.y - y) > 90)) {
      map.bushes.push({ x, y, r, hp: 1 });
    }
  }
  return map;
}
function mapPayload(map) {
  return {
    size: map.size, plateau: map.plateau, mountains: map.mountains, rocks: map.rocks, trees: map.trees, walls: map.walls,
    lakes: map.lakes, pois: map.pois, mills: map.mills, reeds: map.reeds, teleports: map.teleports,
    bushes: map.bushes.map(b => ({ x: b.x, y: b.y, r: b.r, hp: b.hp })),
  };
}

// ================= Engine =================
module.exports = function createEngine(ctx) {
  // ctx: send(pid, obj), onResult(pid, result), onEnter(pid), onExit(pid)
  const matches = new Map();
  const matchOfPid = new Map();

  function newAI() {
    return { target: null, seenT: 0, senseT: 0, lastSeen: null, side: 1, sideT: 0, noise: 0, noiseT: 0, wx: 0, wy: 0, wT: 0, hide: -1, provoked: false, mv: 0, avoidSide: 0, avoidT: 0, moving: true, hurtAt: -9 };
  }
  function makeTank(p, team, bot) {
    return {
      id: p.id, name: p.name, team, bot, skill: p.skill || 0, equip: p.equip, ability: p.ability, cheats: p.cheats || {},
      x: 0, y: 0, a: 0, ta: 0, vx: 0, vy: 0, hp: MAX_HP, alive: true, kills: 0, dmg: 0,
      ph: 'bus', dropT0: 0, landedAt: 0, jumpAt: 0, goal: null, lastHurt: 0,
      revealUntil: 0, nextFire: 0, tpLock: -1, blockUntil: 0, blockReady: 0,
      abReady: 0, turboUntil: 0, odUntil: 0, healUntil: 0, domeUntil: 0, radarUntil: 0, invisUntil: 0, empUntil: 0, salvo: 0, salvoNext: 0,
      input: { dx: 0, dy: 0, aim: 0, fire: false, block: false, ab: false, ax: 0, ay: 0 }, ai: bot ? newAI() : null,
      place: 0, resultSent: false, killerId: null, lastPoi: null,
    };
  }
  const hasAb = (t, id) => t.ability === id || (id === 'wallhack' && t.cheats.wall);

  // teams: Array von Teams; jedes Team = Array von Spielern {id,name,equip,ability,cheats} oder null (= Bot)
  function createMatch(teams, mode, skill = 0) {
    const now = Date.now() / 1000;
    const map = makeMap(Math.floor(Math.random() * 1e9));
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    let botN = 0;
    const m = {
      id: uid('m'), map, mode, tanks: [], byId: new Map(), idx: new Map(), bullets: [], events: [],
      smokes: [], mines: [], strikes: [], humans: new Set(), humanList: [], over: false, endAt: 0, lastTick: now,
      busStart: now + BUS_WAIT, busDur: BUS_DUR * (FAST < 1 ? 0.4 : 1),
    };
    m.busEnd = m.busStart + m.busDur;
    m.bus = makeBusRoute(map);
    teams.forEach((team, ti) => {
      for (const p of team) {
        if (p) {
          const t = makeTank(p, ti, false);
          m.tanks.push(t); m.humans.add(p.id); m.humanList.push({ pid: p.id, name: p.name });
        } else {
          const id = 'bot' + uid('');
          m.tanks.push(makeTank({
            id, name: names[botN++ % names.length],
            equip: { skin: BOT_SKINS[Math.floor(Math.random() * BOT_SKINS.length)], tracer: 'standard', hat: BOT_HATS[Math.floor(Math.random() * BOT_HATS.length)], finisher: 'standard-boom' },
            ability: BOT_ABILITIES[Math.floor(Math.random() * BOT_ABILITIES.length)], skill,
          }, ti, true));
        }
      }
    });
    m.teamCount = teams.length;
    m.tanks.forEach((t, i) => { m.byId.set(t.id, t); m.idx.set(t.id, i); t.x = m.bus.x0; t.y = m.bus.y0; t.a = t.ta = m.bus.a; });
    planBotDrops(m);
    m.zone = { x: MAP / 2, y: MAP / 2, r: MAP * 0.58, tx: 0, ty: 0, tr: 0, phase: 0, stage: 'wait', until: m.busEnd + ZONE_PHASES[0].wait, fx: 0, fy: 0, fr: 0, s0: 0 };
    setZoneTarget(m.zone, 0, map);
    matches.set(m.id, m);
    const roster = m.tanks.map(t => ({ id: t.id, name: t.name, team: t.team, bot: t.bot, equip: t.equip }));
    for (const pid of m.humans) {
      matchOfPid.set(pid, m);
      const me = m.byId.get(pid);
      ctx.onEnter(pid);
      ctx.send(pid, {
        t: 'matchStart', map: mapPayload(map), roster, myTeam: me.team, teams: m.teamCount, total: m.tanks.length, mode,
        maxHp: MAX_HP, bus: m.bus, busDur: m.busDur, blockCd: BLOCK_CD + BLOCK_TIME, ability: me.ability, fireCd: fireCd(me), hitR: HIT_R,
      });
    }
    return m;
  }

  function makeBusRoute(map) {
    const a = Math.random() * Math.PI * 2, P = map.plateau;
    const off = (Math.random() - 0.5) * MAP * 0.16;
    const cx = P.cx + Math.cos(a + Math.PI / 2) * off, cy = P.cy + Math.sin(a + Math.PI / 2) * off;
    const dx = Math.cos(a), dy = Math.sin(a);
    const end = (sgn) => { let t = 0; while (t < MAP && onPlateau(map, cx + sgn * dx * (t + 10), cy + sgn * dy * (t + 10), 180)) t += 10; return t; };
    const t0 = end(-1), t1 = end(1);
    return { x0: cx - dx * t0, y0: cy - dy * t0, x1: cx + dx * t1, y1: cy + dy * t1, a };
  }
  function busPos(m, now) {
    const k = clamp((now - m.busStart) / m.busDur, 0, 1), r = m.bus;
    return { x: lerp(r.x0, r.x1, k), y: lerp(r.y0, r.y1, k), k };
  }
  // Bots landen gut verteilt: weit auseinanderliegende Ziele, Absprung dort, wo der Bus am nächsten ist
  function planBotDrops(m) {
    const map = m.map, cands = map.pois.map(p => ({ x: p.x, y: p.y }));
    for (let i = 0; i < 500 && cands.length < 80; i++) {
      const x = 200 + Math.random() * (MAP - 400), y = 200 + Math.random() * (MAP - 400);
      if (onPlateau(map, x, y, 160) && !solidAt(map, x, y, 40) && !inLake(map, x, y)) cands.push({ x, y });
    }
    const chosen = [];
    const bots = m.tanks.filter(t => t.bot);
    for (const t of bots) {
      let best = cands[0], bd = -1;
      for (const c of cands) {
        const d = chosen.length ? Math.min(...chosen.map(o => Math.hypot(o.x - c.x, o.y - c.y))) : Math.random() * 500;
        if (d > bd) { bd = d; best = c; }
      }
      chosen.push(best);
      const r = m.bus, L = Math.hypot(r.x1 - r.x0, r.y1 - r.y0) || 1;
      const k = clamp(((best.x - r.x0) * (r.x1 - r.x0) + (best.y - r.y0) * (r.y1 - r.y0)) / (L * L), 0.03, 0.97);
      t.jumpAt = m.busStart + m.busDur * k;
      t.goal = { x: best.x, y: best.y };
    }
  }

  function setZoneTarget(z, phase, map) {
    const nr = ZONE_PHASES[phase].r, P = map.plateau;
    const maxOff = Math.max(0, z.r - nr) * 0.7;
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * maxOff;
    let tx = z.x + Math.cos(a) * d, ty = z.y + Math.sin(a) * d;
    const ang = Math.atan2(ty - P.cy, tx - P.cx), lim = Math.max(0, plateauR(map, ang) * 0.85 - nr * 0.6);
    if (Math.hypot(tx - P.cx, ty - P.cy) > lim) { tx = P.cx + Math.cos(ang) * lim; ty = P.cy + Math.sin(ang) * lim; }
    z.tx = tx; z.ty = ty; z.tr = nr;
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
        if (z.phase < ZONE_PHASES.length) { z.stage = 'wait'; z.until = now + ZONE_PHASES[z.phase].wait; setZoneTarget(z, z.phase, m.map); }
        else { z.stage = 'done'; z.until = now; }
      }
    }
  }
  const zoneDps = (z) => (z.stage === 'done' ? 20 : ZONE_PHASES[Math.min(z.phase, ZONE_PHASES.length - 1)].dps);

  function collide(map, t) {
    for (const s of map.solids) {
      const dx = t.x - s.x, dy = t.y - s.y, d = Math.hypot(dx, dy), min = s.r + TR;
      if (d < min && d > 0.001) { t.x = s.x + dx / d * min; t.y = s.y + dy / d * min; }
    }
    for (const w of map.walls) {
      const cx = clamp(t.x, w.x, w.x + w.w), cy = clamp(t.y, w.y, w.y + w.h);
      const dx = t.x - cx, dy = t.y - cy, d = Math.hypot(dx, dy);
      if (d < TR) {
        if (d > 0.001) { t.x = cx + dx / d * TR; t.y = cy + dy / d * TR; }
        else { // Mittelpunkt in der Mauer: kürzester Weg hinaus
          const l = t.x - w.x, r = w.x + w.w - t.x, u = t.y - w.y, b = w.y + w.h - t.y, mn = Math.min(l, r, u, b);
          if (mn === l) t.x = w.x - TR; else if (mn === r) t.x = w.x + w.w + TR; else if (mn === u) t.y = w.y - TR; else t.y = w.y + w.h + TR;
        }
      }
    }
  }

  // ---------- Bus & Fallschirm ----------
  function jump(m, t, now) {
    const p = busPos(m, now);
    t.ph = 'drop'; t.dropT0 = now; t.x = p.x; t.y = p.y;
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
    let dx = t.input.dx, dy = t.input.dy;
    if (t.bot && t.goal) { dx = t.goal.x - t.x; dy = t.goal.y - t.y; if (Math.hypot(dx, dy) < 12) dx = dy = 0; }
    const L = Math.hypot(dx, dy);
    if (L > 0.05) { t.x += dx / L * DROP_SPEED * dt; t.y += dy / L * DROP_SPEED * dt; t.a = turnTo(t.a, Math.atan2(dy, dx), dt * 6); }
    t.x = clamp(t.x, TR, MAP - TR); t.y = clamp(t.y, TR, MAP - TR);
    t.ta = t.bot ? t.a : turnTo(t.ta, t.input.aim, dt * 40);
    if (now - t.dropT0 >= DROP_TIME) {
      t.ph = 'ground'; t.landedAt = now; t.lastHurt = now;
      if (!onPlateau(m.map, t.x, t.y)) { fall(m, t, now); return; }
      collide(m.map, t);
      m.events.push({ k: 'land', x: t.x, y: t.y, i: t.id });
    }
  }
  function fall(m, t, now) {
    m.events.push({ k: 'fall', x: t.x, y: t.y, a: t.a, i: t.id });
    eliminate(m, t, null, 'fall', now);
  }

  // ---------- Fähigkeiten ----------
  const fireCd = (t, now = 0) => (t.cheats.nocd ? 0.35 : FIRE_CD * (hasAb(t, 'sniper') ? 1.25 : 1) * (now < t.odUntil ? 0.5 : 1));
  function abilityCd(t) { const a = CAT.ABILITY_BY_ID[t.ability]; return t.cheats.nocd ? 0.5 : (a ? a.cd : 0); }
  function useAbility(m, t, now) {
    const a = CAT.ABILITY_BY_ID[t.ability];
    if (!a || a.type !== 'aktiv' || now < t.abReady || now < t.empUntil) return;
    const map = m.map, c = Math.cos(t.ta), s = Math.sin(t.ta);
    switch (a.id) {
      case 'turbo': t.turboUntil = now + 3; break;
      case 'repair': t.healUntil = now + 2; break;
      case 'smoke': m.smokes.push({ x: t.x, y: t.y, r: 135, until: now + 6 }); break;
      case 'mine': {
        const mine = { id: uid('n'), x: t.x - Math.cos(t.a) * 30, y: t.y - Math.sin(t.a) * 30, owner: t.id, team: t.team, armAt: now + 1, until: now + 60 };
        m.mines.push(mine);
        const own = m.mines.filter(x => x.owner === t.id);
        if (own.length > 3) m.mines.splice(m.mines.indexOf(own[0]), 1);
        break;
      }
      case 'salvo': t.salvo = 3; t.salvoNext = now; break;
      case 'dome': t.domeUntil = now + 3; break;
      case 'radar': t.radarUntil = now + 7; break;
      case 'overdrive': t.odUntil = now + 6; break;
      case 'blink': {
        let k = 230, x = t.x, y = t.y;
        for (; k > 0; k -= 10) {
          const nx = t.x + c * k, ny = t.y + s * k;
          if (onPlateau(map, nx, ny, 40) && !solidAt(map, nx, ny, TR + 2)) { x = nx; y = ny; break; }
        }
        m.events.push({ k: 'blink', x: t.x, y: t.y, x2: x, y2: y, i: t.id });
        t.x = x; t.y = y;
        break;
      }
      case 'shotgun':
        for (let i = 0; i < 6; i++) spawnBullet(m, t, t.ta + (i - 2.5) * 0.13, { dmg: 14, life: 0.45, kind: 2 });
        m.events.push({ k: 'shot', x: t.x + c * (TR + 12), y: t.y + s * (TR + 12), a: t.ta, i: t.id, big: 1 });
        t.revealUntil = now + REVEAL; t.invisUntil = 0;
        break;
      case 'rocket':
        spawnBullet(m, t, t.ta, { dmg: 80, life: 2, kind: 1, speed: 400 });
        m.events.push({ k: 'shot', x: t.x + c * (TR + 12), y: t.y + s * (TR + 12), a: t.ta, i: t.id, big: 1 });
        t.revealUntil = now + REVEAL; t.invisUntil = 0;
        break;
      case 'invis': t.invisUntil = now + 5; break;
      case 'artillery': {
        let ax = t.input.ax, ay = t.input.ay;
        const d = Math.hypot(ax - t.x, ay - t.y);
        if (!(d > 0) || !Number.isFinite(d)) { ax = t.x + c * 300; ay = t.y + s * 300; }
        else if (d > 650) { ax = t.x + (ax - t.x) / d * 650; ay = t.y + (ay - t.y) / d * 650; }
        m.strikes.push({ x: ax, y: ay, at: now + 1.5, owner: t.id, team: t.team });
        break;
      }
      case 'emp':
        for (const o of m.tanks) if (o.alive && o.team !== t.team && o.ph === 'ground' && dist(o, t) < 320) o.empUntil = now + 3;
        m.events.push({ k: 'emp', x: t.x, y: t.y });
        break;
    }
    t.abReady = now + abilityCd(t);
    m.events.push({ k: 'ab', id: a.id, i: t.id, x: t.x, y: t.y });
  }

  function spawnBullet(m, t, ang, o = {}) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const sn = hasAb(t, 'sniper');
    const speed = (o.speed || BSPEED) * (sn && !o.kind ? 1.3 : 1);
    m.bullets.push({
      id: uid('b'), x: t.x + c * (TR + 10), y: t.y + s * (TR + 10), vx: c * speed, vy: s * speed, speed,
      owner: t.id, team: t.team, dmg: t.cheats.oneshot ? 999 : Math.round((o.dmg || DMG) * (sn && !o.kind ? 1.2 : 1) * (t.odUntil > Date.now() / 1000 ? 1.4 : 1)), life: (o.life || BLIFE) * (sn && !o.kind ? 1.7 : 1),
      kind: o.kind || 0, bush: bushAt(m.map, t.x, t.y), bounces: 0,
      magnet: hasAb(t, 'magnet'), ric: hasAb(t, 'ricochet'), wh: hasAb(t, 'wallhack'),
    });
  }

  function moveTank(m, t, now, dt) {
    const map = m.map, inp = t.input;
    const px = t.x, py = t.y;
    if (inp.block && now >= t.blockReady) {
      t.blockUntil = now + BLOCK_TIME; t.blockReady = now + BLOCK_TIME + BLOCK_CD;
      m.events.push({ k: 'blockOn', x: t.x, y: t.y, i: t.id });
    }
    if (inp.ab) useAbility(m, t, now);
    if (!t.alive) return;
    const blocking = now < t.blockUntil;
    const L = Math.hypot(inp.dx, inp.dy);
    if (L > 0.05) {
      const dx = inp.dx / L, dy = inp.dy / L;
      let sp = SPEED * (blocking ? 0.6 : 1) * (now < t.turboUntil ? 1.6 : 1) * (now < t.odUntil ? 1.25 : 1) * (now < t.empUntil ? 0.5 : 1) * (t.cheats.speed ? 1.8 : 1);
      if (inLake(map, t.x, t.y)) sp *= LAKE_SLOW;
      t.a = turnTo(t.a, Math.atan2(dy, dx), dt * 10);
      t.x += dx * sp * dt; t.y += dy * sp * dt;
      collide(map, t);
      if (!onPlateau(map, t.x, t.y)) { fall(m, t, now); return; }
    }
    t.ta = turnTo(t.ta, inp.aim, dt * (t.bot ? 4 : 40));

    // Teleporter (nur wenn das Ziel nicht im Sturm liegt)
    const tps = map.teleports, z = m.zone;
    for (let i = 0; i < tps.length; i++) {
      const tp = tps[i], d = Math.hypot(t.x - tp.x, t.y - tp.y);
      if (t.tpLock === i && d > tp.r + TR) t.tpLock = -1;
      else if (t.tpLock !== i && d < tp.r) {
        const dst = tps[tp.pair];
        if (Math.hypot(dst.x - z.x, dst.y - z.y) > z.r - 40) continue;
        m.events.push({ k: 'tp', x: t.x, y: t.y });
        t.x = dst.x; t.y = dst.y; t.tpLock = tp.pair;
        m.events.push({ k: 'tp', x: dst.x, y: dst.y });
        break;
      }
    }
    t.vx = (t.x - px) / dt; t.vy = (t.y - py) / dt;

    // Heilen: Reparatur-Fähigkeit, Selbstreparatur
    if (now < t.healUntil) t.hp = Math.min(MAX_HP, t.hp + 27.5 * dt);
    if (t.hp < MAX_HP && now - t.lastHurt > REGEN_DELAY && Math.hypot(t.x - z.x, t.y - z.y) < z.r) t.hp = Math.min(MAX_HP, t.hp + REGEN * dt);

    // Minen
    for (const mine of m.mines) {
      if (mine.dead || mine.team === t.team || now < mine.armAt) continue;
      if (Math.hypot(mine.x - t.x, mine.y - t.y) < 26) {
        mine.dead = true;
        m.events.push({ k: 'boomR', x: mine.x, y: mine.y, r: 60 });
        applyDamage(m, t, 50, m.byId.get(mine.owner), now);
      }
    }

    // Schießen
    const fcd = fireCd(t, now) * (now < t.empUntil ? 2 : 1);
    if (t.salvo > 0 && now >= t.salvoNext) {
      t.salvo--; t.salvoNext = now + 0.13;
      spawnBullet(m, t, t.ta);
      m.events.push({ k: 'shot', x: t.x + Math.cos(t.ta) * (TR + 12), y: t.y + Math.sin(t.ta) * (TR + 12), a: t.ta, i: t.id });
      t.revealUntil = now + REVEAL; t.invisUntil = 0;
    } else if (inp.fire && now >= t.nextFire && !blocking) {
      t.nextFire = now + fcd;
      t.revealUntil = now + REVEAL; t.invisUntil = 0;
      spawnBullet(m, t, t.ta);
      m.events.push({ k: 'shot', x: t.x + Math.cos(t.ta) * (TR + 12), y: t.y + Math.sin(t.ta) * (TR + 12), a: t.ta, i: t.id });
    }
  }

  function explode(m, x, y, r, dmg, owner, now, team) {
    m.events.push({ k: 'boomR', x, y, r });
    for (let i = 0; i < m.map.bushes.length; i++) {
      const b = m.map.bushes[i];
      if (b.hp > 0 && Math.hypot(b.x - x, b.y - y) < r + b.r * 0.5) { b.hp = 0; m.events.push({ k: 'bush', g: 1, i, x: b.x, y: b.y }); }
    }
    for (const t of m.tanks) {
      if (!t.alive || t.ph !== 'ground' || t.team === team) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < r + TR) applyDamage(m, t, Math.round(dmg * (1 - Math.min(1, d / (r + TR)) * 0.6)), owner, now);
    }
  }

  function updateBullets(m, now, dt) {
    const map = m.map;
    for (const b of m.bullets) {
      // Magnetkugeln lenken zum nächsten Gegner
      if ((b.magnet || b.wh) && !b.kind) {
        let best = null, bd = b.wh ? 900 : 220;
        for (const t of m.tanks) {
          if (!t.alive || t.team === b.team || t.ph !== 'ground') continue;
          const d = Math.hypot(t.x - b.x, t.y - b.y);
          if (d < bd && (b.wh || (t.x - b.x) * b.vx + (t.y - b.y) * b.vy > 0)) { bd = d; best = t; }
        }
        if (best) {
          const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(best.y - b.y, best.x - b.x);
          const turn = b.wh ? 10 : 3, na = cur + clamp(normAngle(want - cur), -turn * dt, turn * dt);
          b.vx = Math.cos(na) * b.speed; b.vy = Math.sin(na) * b.speed;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -200 || b.y < -200 || b.x > MAP + 200 || b.y > MAP + 200) {
        if (b.kind === 1) explode(m, b.x, b.y, 110, 45, m.byId.get(b.owner), now, b.team);
        b.dead = true; continue;
      }
      let hit = false;
      const sol = solidAt(map, b.x, b.y, BR);
      if (sol) {
        if (b.ric && b.bounces < 2 && !b.kind) {
          b.bounces++;
          let nx, ny;
          if (sol.r !== undefined) { nx = b.x - sol.x; ny = b.y - sol.y; } else { const cx = clamp(b.x, sol.x, sol.x + sol.w), cy = clamp(b.y, sol.y, sol.y + sol.h); nx = b.x - cx; ny = b.y - cy; if (!nx && !ny) nx = 1; }
          const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
          const dot = b.vx * nx + b.vy * ny; b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
          b.x += nx * 6; b.y += ny * 6;
          m.events.push({ k: 'puff', x: b.x, y: b.y });
        } else {
          m.events.push({ k: sol.k === 'tree' ? 'leaf' : sol.k === 'crate' || sol.k === 'house' ? 'wood' : 'puff', x: b.x, y: b.y });
          hit = true;
        }
      }
      if (!hit) {
        for (let i = 0; i < map.bushes.length; i++) {
          const bu = map.bushes[i];
          if (i === b.bush || bu.hp <= 0) continue;
          if (Math.hypot(b.x - bu.x, b.y - bu.y) < bu.r) { bu.hp = 0; m.events.push({ k: 'bush', g: 1, i, x: bu.x, y: bu.y }); hit = true; break; }
        }
      }
      if (!hit) {
        for (const t of m.tanks) {
          if (!t.alive || t.ph !== 'ground' || t.team === b.team) continue;
          const hr = b.wh ? HIT_R * 2 : HIT_R;
          if (Math.hypot(t.x - b.x, t.y - b.y) < hr + BR) {
            hit = true;
            if (b.kind === 1) explode(m, b.x, b.y, 110, 45, m.byId.get(b.owner), now, b.team);
            if (now < t.blockUntil) { m.events.push({ k: 'block', x: b.x, y: b.y, v: t.id, by: b.owner }); break; }
            applyDamage(m, t, b.dmg, m.byId.get(b.owner), now, b.wh);
            break;
          }
        }
      } else if (b.kind === 1) explode(m, b.x, b.y, 110, 45, m.byId.get(b.owner), now, b.team);
      if (hit) b.dead = true;
    }
    m.bullets = m.bullets.filter(b => !b.dead);
  }

  function applyDamage(m, t, amount, att, now, homing) {
    if (!t.alive) return;
    if (now < t.domeUntil || t.cheats.god) { m.events.push({ k: 'block', x: t.x, y: t.y, v: t.id, by: att ? att.id : null }); return; }
    const d = Math.min(t.hp, amount);
    t.hp -= amount; t.lastHurt = now;
    if (att && att !== t) {
      att.dmg += d;
      if (hasAb(att, 'vampire') && att.alive) att.hp = Math.min(MAX_HP, att.hp + d * 0.4);
    }
    m.events.push({ k: 'hit', x: t.x, y: t.y, d: Math.round(amount), v: t.id, by: att ? att.id : null, h: homing ? 1 : 0 });
    if (t.bot && att) { t.ai.lastSeen = { x: att.x, y: att.y, t: now }; t.ai.senseT = 0; t.ai.provoked = true; t.ai.hurtAt = now; }
    if (t.hp <= 0) eliminate(m, t, att, 'kill', now);
  }

  function eliminate(m, t, killer, cause, now) {
    if (!t.alive) return;
    t.alive = false; t.hp = 0; t.killerId = killer ? killer.id : null;
    if (t.ph === 'ground' && cause !== 'fall') m.events.push({ k: 'boom', x: t.x, y: t.y, fin: killer && killer !== t ? killer.equip.finisher : 'standard-boom' });
    let text;
    if (killer && killer !== t) {
      killer.kills++;
      text = `${killer.name} hat ${t.name} eliminiert`;
      if (killer.alive) { const before = killer.hp; killer.hp = Math.min(MAX_HP, killer.hp + KILL_HEAL); m.events.push({ k: 'heal', x: killer.x, y: killer.y, i: killer.id, d: Math.round(killer.hp - before) }); }
    } else if (cause === 'zone') text = `${t.name} wurde vom Sturm erwischt`;
    else if (cause === 'fall') text = `${t.name} ist in den Abgrund gestürzt`;
    else text = `${t.name} hat das Spiel verlassen`;
    m.events.push({ k: 'feed', g: 1, text, by: killer ? killer.id : null, v: t.id });
    if (killer && killer !== t) m.events.push({ k: 'elim', g: 1, by: killer.id, v: t.id, vn: t.name });
    const teamsAliveNow = new Set(m.tanks.filter(o => o.alive).map(o => o.team)).size;
    if (!t.bot && m.humans.has(t.id)) ctx.send(t.id, { t: 'dead', by: killer && killer !== t ? killer.name : null, cause, place: teamsAliveNow + 1 });
    if (!m.tanks.some(o => o.team === t.team && o.alive)) for (const o of m.tanks) if (o.team === t.team) sendResult(m, o, teamsAliveNow + 1, false);
    checkEnd(m, now);
  }
  function sendResult(m, t, place, win) {
    if (t.resultSent) return;
    t.resultSent = true; t.place = place;
    if (t.bot) return;
    ctx.onResult(t.id, { place, teams: m.teamCount, kills: t.kills, dmg: Math.round(t.dmg), win, players: m.humanList.filter(p => p.pid !== t.id), inMatch: m.humans.has(t.id) });
  }
  function checkEnd(m, now) {
    if (m.over) return;
    const teams = new Set(m.tanks.filter(o => o.alive).map(o => o.team));
    if (teams.size > 1) return;
    m.over = true; m.endAt = now + 10;
    for (const o of m.tanks) if (teams.has(o.team)) sendResult(m, o, 1, true);
    m.events.push({ k: 'over', g: 1 });
  }

  // ---------- Sicht ----------
  function hiddenFrom(m, t, viewer, now) {
    if (t.team === viewer.team || t.ph !== 'ground') return false;
    const d = dist(t, viewer);
    if (now < t.invisUntil) return d > 60;
    if (now < t.revealUntil) return false;
    if (bushAt(m.map, t.x, t.y) >= 0 && d > 75) return true;
    for (const s of m.smokes) if (Math.hypot(t.x - s.x, t.y - s.y) < s.r && d > 60) return true;
    return false;
  }
  function shotClear(map, a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), steps = Math.ceil(d / 18);
    const own = bushAt(map, a.x, a.y), targetBush = bushAt(map, b.x, b.y);
    for (let i = 1; i < steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
      if (solidAt(map, x, y, BR)) return false;
      const bi = bushAt(map, x, y);
      if (bi >= 0 && bi !== own && bi !== targetBush) return false;
    }
    return true;
  }
  const blockedAt = (map, x, y) => !onPlateau(map, x, y, 70) || !!solidAt(map, x, y, TR + 8);

  // ---------- Bots (schwächer, ohne Zittern) ----------
  function botThink(m, t, now, dt) {
    const ai = t.ai, map = m.map, z = m.zone;
    ai.senseT -= dt; ai.sideT -= dt; ai.noiseT -= dt; ai.wT -= dt; ai.avoidT -= dt;
    if (ai.noiseT <= 0) { ai.noiseT = 0.7; ai.noise = (Math.random() - 0.5) * 0.6 * (1 - Math.min(17, t.skill) / 26); }
    if (ai.sideT <= 0) { ai.sideT = 1.6 + Math.random() * 1.8; ai.side = Math.random() < 0.5 ? -1 : 1; }
    if (ai.senseT <= 0) {
      ai.senseT = 0.3;
      let best = null, bs = Infinity;
      const calm = now < t.landedAt + 7 && !ai.provoked;
      for (const o of m.tanks) {
        if (calm || !o.alive || o.ph !== 'ground' || o.team === t.team) continue;
        const d = dist(o, t);
        if (d > 520 || hiddenFrom(m, o, t, now)) continue;
        const score = d + o.hp;
        if (score < bs) { bs = score; best = o; }
      }
      if (best !== ai.target) ai.seenT = 0;
      ai.target = best;
      if (best) ai.lastSeen = { x: best.x, y: best.y, t: now };
    }
    if (ai.target && !ai.target.alive) ai.target = null;
    const tg = ai.target;
    if (tg) ai.seenT += dt;

    const useNext = z.stage === 'shrink' || (z.stage === 'wait' && z.until - now < 18);
    const zx = useNext ? z.tx : z.x, zy = useNext ? z.ty : z.y, zr = useNext ? z.tr : z.r;
    const outside = Math.hypot(t.x - z.x, t.y - z.y) > z.r - 30;
    const zoneUrgent = outside || Math.hypot(t.x - zx, t.y - zy) > Math.max(zr - 80, zr * 0.8);

    let gx = t.x, gy = t.y;
    if (zoneUrgent) { gx = zx; gy = zy; ai.hide = -1; }
    else if (tg) {
      const d = dist(t, tg);
      if (d > 380) { gx = tg.x; gy = tg.y; }
      else if (d < 200) { gx = t.x * 2 - tg.x; gy = t.y * 2 - tg.y; }
      else { const a = Math.atan2(tg.y - t.y, tg.x - t.x) + ai.side * Math.PI / 2; gx = t.x + Math.cos(a) * 80; gy = t.y + Math.sin(a) * 80; }
      ai.hide = -1;
    } else if (ai.lastSeen && now - ai.lastSeen.t < 4) {
      if (Math.hypot(ai.lastSeen.x - t.x, ai.lastSeen.y - t.y) > 280) { gx = ai.lastSeen.x; gy = ai.lastSeen.y; }
    } else if (t.hp < MAX_HP * 0.35 && (ai.hide >= 0 || Math.random() < 0.03)) {
      if (ai.hide < 0 || map.bushes[ai.hide].hp <= 0) {
        let bd = 500; ai.hide = -1;
        map.bushes.forEach((b, i) => { const d = Math.hypot(b.x - t.x, b.y - t.y); if (b.hp > 0 && d < bd) { bd = d; ai.hide = i; } });
      }
      if (ai.hide >= 0) { const b = map.bushes[ai.hide]; gx = b.x; gy = b.y; }
    } else {
      if (ai.wT <= 0 || Math.hypot(ai.wx - t.x, ai.wy - t.y) < 40) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.min(zr * 0.6, 700);
        const near = Math.hypot(t.x - zx, t.y - zy) < zr * 0.6;
        ai.wx = (near ? t.x : zx) + Math.cos(a) * r; ai.wy = (near ? t.y : zy) + Math.sin(a) * r; ai.wT = 6 + Math.random() * 4;
        if (!onPlateau(map, ai.wx, ai.wy, 140) || solidAt(map, ai.wx, ai.wy, 30)) { ai.wx = zx; ai.wy = zy; }
      }
      gx = ai.wx; gy = ai.wy;
    }
    // Ziel erreicht? (mit Puffer, damit der Bot nicht hin und her zuckt)
    const gd = Math.hypot(gx - t.x, gy - t.y);
    if (ai.moving && gd < 14) ai.moving = false; else if (!ai.moving && gd > 45) ai.moving = true;
    let want = Math.atan2(gy - t.y, gx - t.x);
    if (ai.moving) {
      // Hindernissen ausweichen: Seite wird gemerkt, kein Hin- und Herwechseln
      const probe = (ang) => !blockedAt(map, t.x + Math.cos(ang) * 52, t.y + Math.sin(ang) * 52);
      if (!probe(want)) {
        if (ai.avoidT <= 0) {
          let sideFree = 0;
          for (let k = 1; k <= 6 && !sideFree; k++) { if (probe(want + k * 0.5)) sideFree = 1; else if (probe(want - k * 0.5)) sideFree = -1; }
          ai.avoidSide = sideFree || ai.side; ai.avoidT = 0.8;
        }
        for (let k = 1; k <= 7; k++) { const a2 = want + ai.avoidSide * k * 0.45; if (probe(a2)) { want = a2; break; } }
      }
      ai.mv = turnTo(ai.mv, want, dt * 5);
    }
    let aim = ai.moving ? ai.mv : t.ta, fire = false, ab = false;
    if (tg) {
      const d = dist(t, tg), tt = d / BSPEED;
      const px = tg.x + tg.vx * tt * 0.5, py = tg.y + tg.vy * tt * 0.5;
      const a = Math.atan2(py - t.y, px - t.x);
      aim = a + ai.noise * Math.min(1.4, d / 380);
      fire = ai.seenT > Math.max(0.45, 0.9 - t.skill * 0.03) && d < 470 && Math.abs(normAngle(aim - t.ta)) < 0.1 && shotClear(map, t, tg);
    } else if (ai.lastSeen && now - ai.lastSeen.t < 2.5 && Math.random() < 0.5) {
      const bi = bushAt(map, ai.lastSeen.x, ai.lastSeen.y);
      if (bi >= 0 && bi !== bushAt(map, t.x, t.y) && Math.hypot(ai.lastSeen.x - t.x, ai.lastSeen.y - t.y) < 450) {
        const a = Math.atan2(ai.lastSeen.y - t.y, ai.lastSeen.x - t.x);
        aim = a; fire = Math.abs(normAngle(a - t.ta)) < 0.12;
      }
    }
    // Fähigkeit benutzen (zurückhaltend)
    if (now >= t.abReady && Math.random() < dt * 1.5) {
      const d = tg ? dist(t, tg) : 9999, hurt = now - ai.hurtAt < 1.2;
      switch (t.ability) {
        case 'turbo': ab = zoneUrgent || (tg && d > 420); break;
        case 'repair': ab = t.hp < MAX_HP * 0.55 && !tg; break;
        case 'smoke': ab = t.hp < MAX_HP * 0.4 && !!tg; break;
        case 'mine': ab = !!tg && d < 260; break;
        case 'salvo': case 'rocket': case 'overdrive': ab = fire && d < 420; break;
        case 'shotgun': ab = fire && d < 170; break;
        case 'dome': ab = hurt && t.hp < MAX_HP * 0.5; break;
        case 'blink': ab = zoneUrgent && outside; if (ab) aim = Math.atan2(zy - t.y, zx - t.x); break;
      }
    }
    let block = false;
    if (now >= t.blockReady) {
      if (ai.blockAt && now >= ai.blockAt) { block = true; ai.blockAt = 0; }
      else if (!ai.blockAt) for (const b of m.bullets) {
        if (b.team === t.team || b.seenBy === t.id) continue;
        const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy);
        if (d > 260 || d < 1 || (b.vx * dx + b.vy * dy) / (b.speed * d) < 0.97) continue;
        b.seenBy = t.id;
        if (Math.random() < 0.3 + t.skill * 0.015) ai.blockAt = now + 0.15 + Math.random() * 0.25; // Reaktionszeit
        break;
      }
    }
    t.input = { dx: ai.moving ? Math.cos(ai.mv) : 0, dy: ai.moving ? Math.sin(ai.mv) : 0, aim, fire, block, ab, ax: tg ? tg.x : 0, ay: tg ? tg.y : 0 };
  }

  // ---------- Takt ----------
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
    for (const t of ground) if (t.alive && !onPlateau(m.map, t.x, t.y)) fall(m, t, now);
    updateBullets(m, now, dt);
    // Artillerie-Einschläge, abgelaufene Nebel/Minen
    for (const s of m.strikes) if (!s.done && now >= s.at) { s.done = true; explode(m, s.x, s.y, 110, 80, m.byId.get(s.owner), now, s.team); m.events.push({ k: 'arty', x: s.x, y: s.y }); }
    m.strikes = m.strikes.filter(s => !s.done);
    m.smokes = m.smokes.filter(s => now < s.until);
    m.mines = m.mines.filter(x => !x.dead && now < x.until);
    // Sturm
    const z = m.zone, dps = zoneDps(z);
    for (const t of ground) {
      if (!t.alive) continue;
      if (Math.hypot(t.x - z.x, t.y - z.y) > z.r) {
        t.hp -= dps * dt; t.lastHurt = now;
        if (t.hp <= 0) eliminate(m, t, null, 'zone', now);
      }
      // benannte Orte betreten
      if (!t.bot) {
        const p = m.map.pois.find(q => Math.hypot(q.x - t.x, q.y - t.y) < 260);
        const name = p ? p.name : null;
        if (name && name !== t.lastPoi) ctx.send(t.id, { t: 'poi', name });
        t.lastPoi = name;
      }
    }
  }

  function pickFocus(m, focusId, me) {
    if (me.alive) return me;
    let f = m.byId.get(focusId);
    if (f && f.alive) return f;
    f = m.tanks.find(t => t.alive && t.team === me.team) || (me.killerId && m.byId.get(me.killerId)) || m.tanks.find(t => t.alive) || me;
    if (!f.alive) f = m.tanks.find(t => t.alive) || me;
    me.focusId = f.id;
    return f;
  }
  function sendStates(m, now) {
    const z = m.zone, map = m.map;
    const zone = { x: r1(z.x), y: r1(z.y), r: r1(z.r), tx: r1(z.tx), ty: r1(z.ty), tr: r1(z.tr), st: z.stage, left: r1(Math.max(0, z.until - now)), ph: z.phase };
    const alive = m.tanks.filter(t => t.alive);
    const teamsN = new Set(alive.map(t => t.team)).size;
    const bp = busPos(m, now);
    const bus = now < m.busEnd ? { x: r1(bp.x), y: r1(bp.y), k: Math.round(bp.k * 1000) / 1000, wait: r1(Math.max(0, m.busStart - now)), n: alive.filter(t => t.ph === 'bus').length } : null;
    const occ = [];
    for (const t of alive) if (t.ph === 'ground') { const bi = bushAt(map, t.x, t.y); if (bi >= 0 && !occ.includes(bi)) occ.push(bi); }
    const tp = map.teleports.map(t => { const d = map.teleports[t.pair]; return Math.hypot(d.x - z.x, d.y - z.y) > z.r - 40 ? 0 : 1; });
    for (const pid of m.humans) {
      const me = m.byId.get(pid);
      const f = pickFocus(m, me.focusId, me);
      const near = (o, extra = 0) => Math.hypot(o.x - f.x, o.y - f.y) < VIEW_R + extra;
      const wh = (hasAb(me, 'wallhack') || now < me.radarUntil) && me.alive;
      const tanks = [];
      for (const t of alive) {
        if (t.ph === 'bus') continue;
        const enemy = t.team !== me.team;
        if (t !== f && enemy && (!near(t, wh ? 350 : 0) || (!wh && hiddenFrom(m, t, f, now)))) continue;
        if (!enemy && !near(t, 400)) continue;
        const o = {
          i: t.id, x: r1(t.x), y: r1(t.y), a: r1(t.a * 10) / 10, ta: r1(t.ta * 10) / 10, hp: Math.ceil(t.hp),
          ph: t.ph === 'ground' ? 0 : t.ph === 'bus' ? 1 : 2,
        };
        if (t.ph === 'drop') o.alt = Math.round(clamp(1 - (now - t.dropT0) / DROP_TIME, 0, 1) * 100) / 100;
        if (now < t.blockUntil) o.bk = 1;
        if (now < t.domeUntil) o.dome = 1;
        if (now < t.turboUntil) o.tb = 1;
        if (now < t.odUntil) o.od = 1;
        if (now < t.empUntil) o.emp = 1;
        if (now < t.invisUntil) o.inv = 1;
        if (enemy && wh) { o.wh = 1; if (hiddenFrom(m, t, f, now)) o.hid = 1; }
        tanks.push(o);
      }
      const radar = me.alive && now < me.radarUntil ? alive.filter(t => t.team !== me.team && t.ph === 'ground' && dist(t, me) < 1500).map(t => [r1(t.x), r1(t.y)]) : null;
      ctx.send(pid, {
        t: 's', ts: Math.round(now * 1000), f: f.id,
        me: {
          hp: Math.ceil(Math.max(0, me.hp)), alive: me.alive, kills: me.kills, dmg: Math.round(me.dmg), ph: me.ph === 'ground' ? 0 : me.ph === 'bus' ? 1 : 2,
          bk: now < me.blockUntil ? 1 : 0, bl: r1(Math.max(0, me.blockReady - now)), rl: r1(Math.max(0, me.nextFire - now)),
          abr: r1(Math.max(0, me.abReady - now)), abcd: abilityCd(me), fcd: fireCd(me, now), heal: now < me.healUntil ? 1 : 0,
        },
        bus, tanks,
        b: m.bullets.filter(b => near(b)).map(b => [b.id, r1(b.x), r1(b.y), m.idx.get(b.owner), r1(Math.atan2(b.vy, b.vx) * 10) / 10, b.kind]),
        occ: occ.filter(i => near(map.bushes[i])),
        smk: m.smokes.filter(s => near(s, 200)).map(s => [r1(s.x), r1(s.y), s.r, r1(s.until - now)]),
        mn: m.mines.filter(x => near(x) && (x.team === me.team || Math.hypot(x.x - f.x, x.y - f.y) < 90 || wh)).map(x => [x.id, r1(x.x), r1(x.y), now >= x.armAt ? 1 : 0, x.team === me.team ? 1 : 0]),
        st: m.strikes.filter(s => near(s, 200)).map(s => [r1(s.x), r1(s.y), r1(s.at - now)]),
        rad: radar, tp,
        ev: m.events.filter(e => e.g || (e.x !== undefined && near(e, 150))),
        z: zone, al: alive.length, tl: teamsN,
        mates: m.tanks.filter(t => t.team === me.team).map(t => [t.id, r1(t.x), r1(t.y), t.alive ? 1 : 0, Math.ceil(Math.max(0, t.hp))]),
      });
    }
    m.events = [];
  }

  function endMatch(m) {
    for (const pid of [...m.humans]) { matchOfPid.delete(pid); ctx.onExit(pid, true); }
    m.humans.clear();
    matches.delete(m.id);
  }

  function tick(now) {
    for (const m of [...matches.values()]) {
      const dt = clamp(now - m.lastTick, 0.001, 0.1);
      m.lastTick = now;
      try { stepMatch(m, now, dt); } catch (e) { console.error('Fehler im Match', e); }
      sendStates(m, now);
      if (m.over && now >= m.endAt) endMatch(m);
    }
  }

  return {
    createMatch, tick,
    inMatch: (pid) => matchOfPid.has(pid),
    count: () => matches.size,
    input(pid, msg) {
      const m = matchOfPid.get(pid); if (!m) return;
      const t = m.byId.get(pid); if (!t || !t.alive) return;
      const num = (v, d) => (Number.isFinite(+v) ? +v : d);
      t.input = {
        dx: clamp(num(msg.dx, 0), -1, 1), dy: clamp(num(msg.dy, 0), -1, 1), aim: num(msg.aim, t.ta),
        fire: !!msg.fire, block: !!msg.block, ab: !!msg.ab, ax: num(msg.ax, 0), ay: num(msg.ay, 0),
      };
    },
    spectate(pid) {
      const m = matchOfPid.get(pid); if (!m) return;
      const me = m.byId.get(pid); if (!me || me.alive) return;
      const alive = m.tanks.filter(t => t.alive);
      if (!alive.length) return;
      alive.sort((a, b) => (a.team === me.team ? 0 : 1) - (b.team === me.team ? 0 : 1));
      const i = alive.findIndex(t => t.id === me.focusId);
      me.focusId = alive[(i + 1) % alive.length].id;
    },
    leave(pid) {
      const m = matchOfPid.get(pid); if (!m) return;
      matchOfPid.delete(pid);
      m.humans.delete(pid);
      const t = m.byId.get(pid);
      if (t && t.alive && !m.over) eliminate(m, t, null, 'left', Date.now() / 1000);
      ctx.onExit(pid, false);
      if (!m.humans.size) matches.delete(m.id);
    },
    // für Tests
    _makeMap: makeMap,
  };
};
