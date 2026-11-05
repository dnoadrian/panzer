// PANZER – Spiel: flüssiges Zeichnen, Vorhersage, Büsche, HUD
'use strict';

const cv = $('cv'), ctx = cv.getContext('2d', { alpha: false, desynchronized: true });
const mini = $('mini'), mctx = mini.getContext('2d');
let inGame = false;
const G = {};
const keys = {};
const gm = { x: innerWidth / 2, y: innerHeight / 2, down: false };

const DELAY = 75;     // ms Puffer: andere Panzer werden minimal verzögert, dafür absolut flüssig gezeichnet
const TILE = 256;     // Kachelgröße für die vorgezeichnete Karte
const TR = 16, SPEED = 80, SLOPE_W = 110;
const BUSH_LUSH = '#8fd17a', BUSH_DRY = '#c3d28c';

function resetG() {
  Object.assign(G, {
    map: null, roster: new Map(), myTeam: 0, teamSize: 1, maxHp: 100, bushMax: 60,
    snaps: [], offset: null, lastProcTs: -1, cur: null, newMe: null, oldMe: null, pred: null,
    cam: { x: 1200, y: 1200, z: 0.8, init: false }, bushes: [], bushHit: new Map(),
    particles: [], effects: [], floats: [], flash: new Map(), shake: 0, warned: false, lastCd: 99,
    miniStatic: null, miniN: 0, lastFrame: performance.now(), hitMark: 0, result: null, aim: 0, confetti: [], tutTimers: [],
    tiles: new Map(), tileScale: 0, sprites: new Map(), frame: 0, fps: { n: 0, t: performance.now() }, hud: {},
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
  for (const id of ['feed', 'center', 'tutorial', 'mates', 'invites', 'chips']) $(id).innerHTML = '';
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
    'Shift oder Rechtsklick: kurz alle Treffer blocken',
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

// ---------- Helfer ----------
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
function volAt(x, y) { return clamp(1 - Math.hypot(x - G.cam.x, y - G.cam.y) / 900, 0, 1); }
function setText(id, v) { const e = $(id); if (e._v !== v) { e._v = v; e.textContent = v; } }
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
function leafBurst(x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 90;
    G.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.5, t: 0, rot: Math.random() * 6, col: Math.random() < 0.5 ? '#5f9e45' : '#8cc46e' });
  }
}

// ---------- Netzwerk-Zustände: puffern statt sofort zeichnen ----------
function onState(s) {
  if (!inGame) return;
  const now = performance.now();
  const off = now - s.ts;
  G.offset = G.offset == null ? off : Math.min(G.offset + 0.5, off); // Uhrabgleich Server <-> Browser
  G.snaps.push(s);
  if (G.snaps.length > 60) G.snaps.shift();
  const mt = s.tanks.find(t => t.i === me.pid);
  if (mt && s.me.alive) { G.oldMe = G.newMe; G.newMe = { x: mt.x, y: mt.y, ts: s.ts }; } else { G.newMe = G.oldMe = null; }
}

// Ein Zustand ist "dran" (zeitlich erreicht): Ereignisse auslösen, HUD aktualisieren
function processSnap(s, late) {
  const now = performance.now();
  for (const e of s.ev) {
    if (e.k === 'bush') { const b = G.bushes[e.i]; if (b) b.hp = e.hp; }
    if (e.k === 'feed') { addFeed(e.text, e.by === me.pid || e.v === me.pid); continue; }
    if (late) continue; // nach Tab-Wechsel keine Effekt-Lawine
    switch (e.k) {
      case 'shot': G.effects.push({ k: 'shot', x: e.x, y: e.y, a: e.a, t0: now, life: 110 }); sfx.shot(e.i === me.pid ? 1 : volAt(e.x, e.y) * 0.7); break;
      case 'hit':
        G.flash.set(e.v, now + 90);
        if (e.by === me.pid) { G.floats.push({ x: e.x, y: e.y - 20, text: String(e.d), col: '#f2c94c', t0: now }); G.hitMark = now; sfx.hit(); }
        if (e.v === s.f) {
          G.shake = Math.min(14, G.shake + 7);
          if (e.v === me.pid) {
            G.floats.push({ x: e.x, y: e.y - 20, text: '-' + e.d, col: '#e8594f', t0: now });
            const hu = $('hurt'); hu.style.transition = 'none'; hu.style.opacity = 1;
            requestAnimationFrame(() => { hu.style.transition = 'opacity .5s'; hu.style.opacity = 0; });
            sfx.hurt();
          }
        }
        break;
      case 'boom': G.effects.push({ k: 'boom', x: e.x, y: e.y, t0: now, life: 900 }); G.shake = Math.min(16, G.shake + 6 * volAt(e.x, e.y)); sfx.boom(volAt(e.x, e.y)); break;
      case 'puff': G.effects.push({ k: 'puff', x: e.x, y: e.y, t0: now, life: 350 }); break;
      case 'dirt': G.effects.push({ k: 'dirt', x: e.x, y: e.y, t0: now, life: 450 }); sfx.dirt(volAt(e.x, e.y)); break;
      case 'bush':
        G.bushHit.set(e.i, now);
        leafBurst(e.x, e.y, e.hp > 0 ? 8 : 30);
        if (volAt(e.x, e.y) > 0) sfx.bush(volAt(e.x, e.y));
        break;
      case 'tp': G.effects.push({ k: 'tp', x: e.x, y: e.y, t0: now, life: 600 }); break;
      case 'block':
        G.effects.push({ k: 'block', x: e.x, y: e.y, t0: now, life: 350 });
        if (e.by === me.pid || e.v === me.pid || volAt(e.x, e.y) > 0.3) sfx.block();
        break;
      case 'blockOn': if (e.i === me.pid) sfx.blockOn(); break;
      case 'pick': G.effects.push({ k: 'pick', x: e.x, y: e.y, type: e.type, t0: now, life: 900 }); if (e.by === me.pid) sfx.pick(); break;
      case 'elim': if (e.by === me.pid) { centerMsg('ERLEDIGT', e.vn, 1500); sfx.kill(); } break;
      case 'zone': centerMsg('Die Zone schrumpft!', null, 1800); sfx.zone(); break;
    }
  }
  if (s.cd > 0) {
    const n = Math.ceil(s.cd);
    if (n !== G.lastCd) { G.lastCd = n; centerMsg(String(n), null, 900); sfx.tick(); }
  } else if (G.lastCd !== 0) { G.lastCd = 0; centerMsg('LOS!', null, 900); sfx.go(); }
  if (s.z.st === 'wait' && s.z.left < 10.5 && !G.warned) { G.warned = true; centerMsg(null, 'Zone schrumpft in 10 Sekunden', 1800); }
  if (s.z.st !== 'wait') G.warned = false;
  updateHud(s);
}

function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function updateHud(s) {
  setText('hAlive', String(s.al));
  setText('hKills', String(s.me.kills));
  const z = s.z;
  setText('zoneInfo', z.st === 'wait' ? `Zone schrumpft in ${fmt(z.left)}` : z.st === 'shrink' ? 'Die Zone zieht sich zusammen!' : 'Letzte Zone');
  const myT = s.tanks.find(t => t.i === me.pid);
  const outside = !!myT && Math.hypot(myT.x - z.x, myT.y - z.y) > z.r;
  $('zoneInfo').classList.toggle('warn', outside || z.st === 'shrink');
  $('vignette').style.opacity = outside ? 1 : 0;
  const hp = s.me.alive ? s.me.hp : 0, pct = clamp(hp / G.maxHp * 100, 0, 100);
  if (G.hud.hp !== hp) {
    G.hud.hp = hp;
    $('hpBar').style.width = pct + '%'; $('hpLag').style.width = pct + '%';
    $('hpBar').style.background = pct > 50 ? '#6fcf6f' : pct > 25 ? '#f2c94c' : '#e8594f';
    $('hpText').textContent = hp;
  }
  const chips = [];
  if (s.me.alive) {
    if (s.me.bk) chips.push(['B', 'BLOCKT!']);
    else if (s.me.bl > 0) chips.push(['B', `Blocken in ${Math.ceil(s.me.bl)}s`]);
    else chips.push(['B', 'Blocken bereit (Shift)']);
    if (s.me.k > 0) chips.push(['K', `Kanone Stufe ${s.me.k + 1}`]);
    if (s.me.rf > 0) chips.push(['F', `Schnellfeuer ${Math.ceil(s.me.rf)}s`]);
    if (s.me.sp > 0) chips.push(['T', `Tempo ${Math.ceil(s.me.sp)}s`]);
    if (s.me.df > 0) chips.push(['D', `Doppelschuss ${Math.ceil(s.me.df)}s`]);
  }
  const ck = chips.map(c => c[1]).join('|');
  if (G.hud.chips !== ck) {
    G.hud.chips = ck;
    const box = $('chips'); box.innerHTML = '';
    for (const [t, txt] of chips) {
      const c = el('span', 'chip', txt);
      c.style.background = t === 'B' ? (txt.startsWith('Blocken in') ? '#e6e0d2' : '#cfe0ff') : PICKUPS[t].color;
      box.appendChild(c);
    }
  }
  if (G.teamSize > 1) {
    const mk = s.mates.filter(m => m[0] !== me.pid).map(m => m[0] + m[3] + ':' + m[4]).join('|');
    if (G.hud.mates !== mk) {
      G.hud.mates = mk;
      const box = $('mates'); box.innerHTML = '';
      for (const [id, , , alive, mhp] of s.mates) {
        if (id === me.pid) continue;
        const d = el('div', 'mate' + (alive ? '' : ' dead'), nameOf(id));
        const bar = el('div', 'mb'); const i = el('i'); i.style.width = (alive ? mhp : 0) + '%'; bar.appendChild(i); d.appendChild(bar);
        box.appendChild(d);
      }
    }
  }
  if (!s.me.alive && !$('deathCard').classList.contains('hidden')) {
    setText('deathBy', (G.deathText || '') + (s.f !== me.pid ? `  ·  Du schaust zu: ${nameOf(s.f)}` : ''));
  }
}

function onDead(m) {
  G.deathText = m.by ? `Erledigt von ${m.by}` : m.cause === 'zone' ? 'Die Zone hat dich erwischt' : '';
  if (!G.result) $('deathCard').classList.remove('hidden');
  setText('deathBy', G.deathText);
  $('vignette').style.opacity = 0;
  G.pred = null;
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
cv.addEventListener('pointermove', (e) => { gm.x = e.clientX; gm.y = e.clientY; });
cv.addEventListener('pointerdown', (e) => { if (e.button === 0) gm.down = true; if (e.button === 2) gm.rdown = true; gm.x = e.clientX; gm.y = e.clientY; ac(); });
addEventListener('pointerup', (e) => { if (e.button === 0) gm.down = false; if (e.button === 2) gm.rdown = false; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());

function readMove() {
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;
  return { dx, dy };
}
function screenToWorld(sx, sy) { const z = G.cam.z; return { x: G.cam.x + (sx - innerWidth / 2) / z, y: G.cam.y + (sy - innerHeight / 2) / z }; }
setInterval(() => {
  const s = G.snaps[G.snaps.length - 1];
  if (!inGame || !s || !s.me.alive || s.cd > 0) return;
  const { dx, dy } = readMove();
  send({ t: 'input', dx, dy, aim: G.aim, fire: gm.down || !!keys[' '], block: !!(gm.rdown || keys['shift'] || keys['e']) });
}, 33);

// ---------- Vorgezeichnete Karte (Kacheln) ----------
function drawHill(c2, hl, i) {
  const n = Math.round(clamp(hl.r / 7, 24, 60));
  sketchFill(c2, circlePts(hl.x, hl.y, hl.r, n, i * 7, 0.03), i * 7, '#f1e5c6', 2, 2.2, '#8a7a58');
  sketchFill(c2, circlePts(hl.x, hl.y, (hl.r + hl.p) / 2, n, i * 7 + 1, 0.04), i * 7 + 1, '#ead9ae', 1.6, 1.6, '#9a8a66');
  sketchFill(c2, circlePts(hl.x, hl.y, hl.p, n, i * 7 + 2, 0.05), i * 7 + 2, '#e1cc95', 1.4, 2.4);
  const r = rng(i * 13 + 5);
  c2.strokeStyle = '#8a7a58'; c2.lineWidth = 1.4; c2.lineCap = 'round'; c2.beginPath();
  const cnt = Math.round(hl.r / 5);
  for (let k = 0; k < cnt; k++) {
    const a = k / cnt * Math.PI * 2 + r() * 0.04, r0 = hl.p + 6 + r() * 8, r1 = r0 + (hl.r - hl.p) * (0.35 + r() * 0.35);
    c2.moveTo(hl.x + Math.cos(a) * r0, hl.y + Math.sin(a) * r0); c2.lineTo(hl.x + Math.cos(a) * r1, hl.y + Math.sin(a) * r1);
  }
  c2.stroke();
}
function drawRock(c2, k, i) {
  const pts = circlePts(k.x, k.y, k.r, 12, i * 31 + 5, 0.3);
  c2.fillStyle = 'rgba(43,38,32,.13)'; poly(c2, pts.map(([x, y]) => [x + 4, y + 5])); c2.fill();
  sketchFill(c2, pts, i * 31 + 5, '#d4cdbd', 1.6, 2.6);
  hatchIn(c2, pts, k.x, k.y - k.r, k.x + k.r, k.y + k.r, 5, '#8f877a', i * 7);
}
function mapEdgePts(MAP) {
  const e = [];
  for (let i = 0; i <= 24; i++) e.push([MAP * i / 24, 0]);
  for (let i = 1; i <= 24; i++) e.push([MAP, MAP * i / 24]);
  for (let i = 1; i <= 24; i++) e.push([MAP - MAP * i / 24, MAP]);
  for (let i = 1; i < 24; i++) e.push([0, MAP - MAP * i / 24]);
  return e;
}
function buildTile(tx, ty) {
  const s = G.tileScale, size = Math.ceil((TILE + 2) * s);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.scale(s, s); x.translate(-tx * TILE + 1, -ty * TILE + 1);
  const x0 = tx * TILE - 1, y0 = ty * TILE - 1, x1 = x0 + TILE + 2, y1 = y0 + TILE + 2, MAP = G.map.size;
  x.fillStyle = '#e9e0c9'; x.fillRect(x0, y0, TILE + 2, TILE + 2);
  const ix0 = Math.max(0, x0), iy0 = Math.max(0, y0), ix1 = Math.min(MAP, x1), iy1 = Math.min(MAP, y1);
  if (ix1 > ix0 && iy1 > iy0) {
    x.fillStyle = PAPER; x.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0);
    x.strokeStyle = GRID; x.lineWidth = 1; x.beginPath();
    for (let gx = Math.ceil(ix0 / 80) * 80; gx <= ix1; gx += 80) { x.moveTo(gx, iy0); x.lineTo(gx, iy1); }
    for (let gy = Math.ceil(iy0 / 80) * 80; gy <= iy1; gy += 80) { x.moveTo(ix0, gy); x.lineTo(ix1, gy); }
    x.stroke();
  }
  const hit = (o, r) => o.x + r > x0 && o.x - r < x1 && o.y + r > y0 && o.y - r < y1;
  G.map.hills.forEach((hl, i) => { if (hit(hl, hl.r + 8)) drawHill(x, hl, i); });
  G.map.teleports.forEach((tp, i) => { if (hit(tp, 40)) sketchFill(x, circlePts(tp.x, tp.y, tp.r + 6, 16, i * 13, 0.08), i * 13, tp.color + '55', 1.2, 2.4); });
  G.map.rocks.forEach((k, i) => { if (hit(k, k.r + 10)) drawRock(x, k, i); });
  if (x0 < 4 || y0 < 4 || x1 > MAP - 4 || y1 > MAP - 4) sketchStroke(x, mapEdgePts(MAP), 4242, 2.5, true, 4);
  return c;
}
function ensureScale() {
  const dpr = devicePixelRatio || 1;
  const base = Math.max(0.5, Math.min(innerWidth / 1100, innerHeight / 700));
  const s = Math.min(2.5, Math.max(0.6, base * dpr));
  if (Math.abs(s - G.tileScale) > 0.01) { G.tileScale = s; G.tiles.clear(); G.sprites.clear(); }
}
function drawTiles(vx0, vy0, vx1, vy1) {
  const n = Math.ceil(G.map.size / TILE);
  let built = 0;
  for (let ty = Math.max(-1, Math.floor(vy0 / TILE)); ty <= Math.min(n, Math.floor(vy1 / TILE)); ty++) {
    for (let tx = Math.max(-1, Math.floor(vx0 / TILE)); tx <= Math.min(n, Math.floor(vx1 / TILE)); tx++) {
      const key = tx + ',' + ty;
      let t = G.tiles.get(key);
      if (!t && built < 10) { t = { c: buildTile(tx, ty) }; G.tiles.set(key, t); built++; }
      if (!t) { ctx.fillStyle = PAPER; ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE); continue; }
      t.used = G.frame;
      ctx.drawImage(t.c, tx * TILE - 1, ty * TILE - 1, TILE + 2, TILE + 2);
    }
  }
  if (G.tiles.size > 70) for (const [k, t] of G.tiles) if (G.frame - t.used > 120) G.tiles.delete(k);
}

// ---------- Büsche: Blätterhaufen, jeder Schadenszustand eigenes Bild ----------
function bushModel(b, i) {
  if (b._m) return b._m;
  const r = rng(i * 97 + 13), N = 6 + (i % 3);
  const puffs = [];
  for (let k = 0; k < N; k++) {
    const a = k / N * Math.PI * 2 + (r() - 0.5) * 0.5, d = b.r * (0.4 + r() * 0.13);
    puffs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: b.r * (0.42 + r() * 0.12), seed: i * 50 + k });
  }
  puffs.push({ x: (r() - 0.5) * 4, y: (r() - 0.5) * 4, r: b.r * 0.55, seed: i * 50 + 49 });
  const order = puffs.slice(0, N).map((p, k) => ({ k, s: r() })).sort((a, c) => a.s - c.s).map(o => o.k);
  order.push(N); // Kern verschwindet zuletzt
  const leaves = [];
  for (let k = 0; k < 18; k++) { const a = r() * 6.28, d = b.r * (0.35 + r() * 0.8); leaves.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, rot: r() * 6.28, c: r() < 0.5 ? '#7fbf63' : '#a9cf7a' }); }
  const twigs = [];
  for (let k = 0; k < 5; k++) twigs.push({ a: k / 5 * 6.28 + r() * 0.7, l: b.r * (0.5 + r() * 0.35), f: 0.45 + r() * 0.3, fa: (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.4) });
  const berries = [];
  for (let k = 0; k < 4; k++) { const p = puffs[Math.floor(r() * N)]; berries.push({ x: p.x + (r() - 0.5) * p.r * 0.8, y: p.y + (r() - 0.5) * p.r * 0.8 }); }
  b._m = { puffs, order, leaves, twigs, berries };
  return b._m;
}
function bushKeep(b) {
  const total = bushModel(b, b._i).puffs.length;
  const ratio = b.hp / G.bushMax;
  return ratio <= 0 ? 0 : Math.max(2, Math.ceil(total * ratio));
}
function drawLeaf(x2, l, s = 1) {
  x2.save(); x2.translate(l.x, l.y); x2.rotate(l.rot); x2.scale(s, s);
  x2.fillStyle = l.c; x2.beginPath(); x2.ellipse(0, 0, 5, 2.4, 0, 0, 7); x2.fill();
  x2.strokeStyle = '#3f6f2e'; x2.lineWidth = 0.9; x2.stroke();
  x2.beginPath(); x2.moveTo(-4, 0); x2.lineTo(4, 0); x2.stroke();
  x2.restore();
}
function mixHex(a, b, k) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((A >> sh) & 255) + (((B >> sh) & 255) - ((A >> sh) & 255)) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function bushSprite(b, i, keep) {
  const key = 'b' + i + '|' + keep;
  let sp = G.sprites.get(key);
  if (sp) return sp;
  const s = G.tileScale, R = b.r + 30, size = Math.ceil(R * 2 * s);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.scale(s, s); x.translate(R, R);
  x.lineCap = 'round'; x.lineJoin = 'round';
  const M = bushModel(b, i), total = M.puffs.length, ratio = keep / total, dmg = 1 - ratio;

  // heruntergefallene Blätter (mehr bei mehr Schaden)
  const nLeaves = keep === 0 ? M.leaves.length : Math.round(dmg * 12);
  for (let k = 0; k < nLeaves; k++) drawLeaf(x, M.leaves[k]);

  if (keep === 0) {
    // Zerstört: Stumpf, abgebrochene Äste, plattgedrücktes Gras
    const rr = rng(i * 7 + 3);
    x.strokeStyle = '#8aa76a'; x.lineWidth = 1.6; x.beginPath();
    for (let k = 0; k < 16; k++) { const a = rr() * 6.28, d = rr() * b.r * 0.9, gx = Math.cos(a) * d, gy = Math.sin(a) * d; x.moveTo(gx, gy); x.lineTo(gx + (rr() - 0.5) * 6, gy - 3 - rr() * 3); }
    x.stroke();
    x.strokeStyle = '#7a5a3a'; x.lineWidth = 2.6;
    for (const t of M.twigs) {
      const a = t.a + 0.3, l = t.l * 0.55, sx = Math.cos(a) * b.r * 0.25, sy = Math.sin(a) * b.r * 0.25;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a + 0.2) * l, sy + Math.sin(a + 0.2) * l); x.stroke();
    }
    sketchFill(x, circlePts(0, 0, b.r * 0.2, 10, i + 5, 0.15), i + 5, '#b08a5e', 0.8, 2.2);
    x.strokeStyle = '#7a5a3a'; x.lineWidth = 1.1; x.beginPath(); x.arc(0, 0, b.r * 0.11, 0, 7); x.stroke();
    x.beginPath(); x.arc(0, 0, b.r * 0.04, 0, 7); x.stroke();
  } else {
    const kept = M.order.slice(total - keep).map(k => M.puffs[k]);
    const sc = 0.88 + 0.12 * ratio;
    const P = kept.map(p => ({ pts: jit(circlePts(p.x, p.y, p.r * sc, 14, p.seed, 0.12), p.seed, 0.9), x: p.x, y: p.y, r: p.r * sc, seed: p.seed }));
    // Schatten
    x.fillStyle = 'rgba(43,38,32,.13)';
    for (const p of P) { x.beginPath(); x.arc(p.x + 4, p.y + 5, p.r, 0, 7); x.fill(); }
    // Äste sieht man, wenn Lücken entstehen
    if (dmg > 0) {
      x.strokeStyle = '#7a5a3a'; x.lineWidth = 2.8;
      for (const t of M.twigs) {
        const ex = Math.cos(t.a) * t.l, ey = Math.sin(t.a) * t.l, fx = Math.cos(t.a) * t.l * t.f, fy = Math.sin(t.a) * t.l * t.f;
        x.beginPath(); x.moveTo(0, 0); x.lineTo(ex, ey);
        x.moveTo(fx, fy); x.lineTo(fx + Math.cos(t.a + t.fa) * t.l * 0.35, fy + Math.sin(t.a + t.fa) * t.l * 0.35); x.stroke();
      }
    }
    // Umriss: dicker Strich unter allen Blätterbällen = nur die Außenkante bleibt sichtbar
    x.strokeStyle = INK; x.lineWidth = 5;
    for (const p of P) { poly(x, p.pts); x.stroke(); }
    const base = mixHex(BUSH_LUSH, BUSH_DRY, dmg), dark = mixHex('#5fa64c', '#9aae6a', dmg), light = mixHex('#c4ecae', '#e2e8b8', dmg);
    x.fillStyle = base;
    for (const p of P) { poly(x, p.pts); x.fill(); }
    // Schattierung innerhalb der Silhouette
    x.save();
    x.beginPath(); for (const p of P) { x.moveTo(p.pts[0][0], p.pts[0][1]); for (const [px, py] of p.pts) x.lineTo(px, py); x.closePath(); }
    x.clip();
    for (const p of P) {
      x.fillStyle = dark; x.beginPath(); x.arc(p.x + p.r * 0.28, p.y + p.r * 0.32, p.r * 0.82, 0, 7); x.fill();
    }
    for (const p of P) {
      x.fillStyle = base; x.beginPath(); x.arc(p.x - p.r * 0.08, p.y - p.r * 0.1, p.r * 0.74, 0, 7); x.fill();
    }
    for (const p of P) {
      x.fillStyle = light; x.globalAlpha = 0.85; x.beginPath(); x.ellipse(p.x - p.r * 0.32, p.y - p.r * 0.36, p.r * 0.3, p.r * 0.2, -0.6, 0, 7); x.fill(); x.globalAlpha = 1;
    }
    // Blatt-Striche
    const rr = rng(i * 3 + 1);
    x.strokeStyle = mixHex('#3f7a2e', '#6f7d44', dmg); x.lineWidth = 1.5; x.beginPath();
    for (const p of P) {
      for (let k = 0; k < 3; k++) {
        const ax = p.x + (rr() - 0.5) * p.r * 1.1, ay = p.y + (rr() - 0.5) * p.r * 1.1;
        x.moveTo(ax - 4, ay + 2); x.quadraticCurveTo(ax, ay - 4, ax + 4, ay + 2);
      }
    }
    x.stroke();
    // Löcher bei starkem Schaden
    if (dmg > 0.45) {
      x.fillStyle = 'rgba(70,90,40,.45)';
      for (let k = 0; k < 3; k++) { const p = P[k % P.length]; x.beginPath(); x.ellipse(p.x + (rr() - 0.5) * p.r, p.y + (rr() - 0.5) * p.r, 3 + rr() * 3, 2 + rr() * 2, rr() * 3, 0, 7); x.fill(); }
    }
    x.restore();
    // Beeren nur am unbeschädigten Busch
    if (keep === total) {
      for (const be of M.berries) {
        x.fillStyle = '#e8594f'; x.strokeStyle = INK; x.lineWidth = 1.2;
        x.beginPath(); x.arc(be.x, be.y, 2.6, 0, 7); x.fill(); x.stroke();
        x.fillStyle = '#ffd0c8'; x.beginPath(); x.arc(be.x - 0.8, be.y - 0.9, 0.8, 0, 7); x.fill();
      }
    }
  }
  sp = { c, R };
  G.sprites.set(key, sp);
  return sp;
}
function drawBush(b, i, nowMs, friendly, occupied) {
  const keep = bushKeep(b);
  const sp = bushSprite(b, i, keep);
  const hitT = G.bushHit.get(i) || 0, hp = clamp(1 - (nowMs - hitT) / 260, 0, 1);
  const t = nowMs / 1000;
  const sway = occupied ? Math.sin(t * 9 + i) * 0.035 : Math.sin(t * 1.3 + i) * 0.008;
  const pulse = 1 + 0.08 * hp + (occupied ? Math.sin(t * 7 + i) * 0.012 : 0);
  const sx = hp > 0 ? Math.sin(nowMs / 18) * 2.5 * hp : 0;
  ctx.save();
  ctx.translate(b.x + sx, b.y); ctx.rotate(sway); ctx.scale(pulse, pulse);
  if (friendly) ctx.globalAlpha = 0.55;
  ctx.drawImage(sp.c, -sp.R, -sp.R, sp.R * 2, sp.R * 2);
  ctx.restore();
}
function pickupSprite(type) {
  const key = 'p' + type;
  let sp = G.sprites.get(key);
  if (sp) return sp;
  const s = G.tileScale, R = 18, c = document.createElement('canvas');
  c.width = c.height = Math.ceil(R * 2 * s);
  const x = c.getContext('2d'); x.scale(s, s);
  x.fillStyle = 'rgba(43,38,32,.15)'; x.fillRect(R - 10, R - 8, 24, 24);
  drawPickup(x, type, R - 1, R - 1, hashStr(type));
  sp = { c, R }; G.sprites.set(key, sp);
  return sp;
}

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
function drawMini(s) {
  const { w } = fitCanvas(mini, mctx);
  if (!G.miniStatic) return;
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
  const fx = G.cam.x * k, fy = G.cam.y * k;
  mctx.save(); mctx.translate(fx, fy); mctx.rotate(G.aim);
  mctx.fillStyle = '#f2c94c'; mctx.strokeStyle = INK; mctx.lineWidth = 1.8;
  mctx.beginPath(); mctx.moveTo(8, 0); mctx.lineTo(-5, -5); mctx.lineTo(-2, 0); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
  const vw = innerWidth / G.cam.z * k, vh = innerHeight / G.cam.z * k;
  mctx.strokeStyle = 'rgba(43,38,32,.35)'; mctx.lineWidth = 1; mctx.strokeRect(fx - vw / 2, fy - vh / 2, vw, vh);
}

// ---------- Eigener Panzer: sofort reagieren (Vorhersage) ----------
function predictMe(dt, s) {
  const L = G.newMe;
  if (!L || !s.me.alive) { G.pred = null; return null; }
  if (!G.pred) G.pred = { x: L.x, y: L.y };
  const P = G.pred;
  if (s.cd <= 0) {
    const { dx, dy } = readMove();
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      const nx = dx / len, ny = dy / len;
      const h0 = heightAt(P.x, P.y), h1 = heightAt(P.x + nx * 6, P.y + ny * 6);
      const sl = clamp((h1 - h0) / 6 * SLOPE_W, -1, 1);
      const f = sl > 0 ? 1 - 0.55 * sl : 1 - 0.3 * sl;
      const sp = SPEED * (s.me.sp > 0 ? 1.45 : 1) * (s.me.bk ? 0.6 : 1) * f;
      P.x += nx * sp * dt; P.y += ny * sp * dt;
      const MAP = G.map.size;
      P.x = clamp(P.x, TR, MAP - TR); P.y = clamp(P.y, TR, MAP - TR);
      for (const k of G.map.rocks) {
        const ex = P.x - k.x, ey = P.y - k.y, d = Math.hypot(ex, ey), min = k.r + TR;
        if (d < min && d > 0.001) { P.x = k.x + ex / d * min; P.y = k.y + ey / d * min; }
      }
    }
  }
  // sanft zur Server-Position korrigieren (mit kleinem Vorlauf, weil der Server etwas hinterher ist)
  let tx = L.x, ty = L.y;
  if (G.oldMe && L.ts > G.oldMe.ts) {
    const vdt = (L.ts - G.oldMe.ts) / 1000;
    tx += (L.x - G.oldMe.x) / vdt * 0.09; ty += (L.y - G.oldMe.y) / vdt * 0.09;
  }
  const ex = tx - P.x, ey = ty - P.y, err = Math.hypot(ex, ey);
  if (err > 70) { P.x = L.x; P.y = L.y; } // z. B. Teleporter
  else { const c = Math.min(1, dt * 6); P.x += ex * c; P.y += ey * c; }
  return P;
}

// ---------- Hauptzeichnung ----------
function drawGame(nowMs) {
  const dt = Math.min(0.05, (nowMs - G.lastFrame) / 1000); G.lastFrame = nowMs;
  G.frame++;
  G.fps.n++;
  if (nowMs - G.fps.t > 500) { setText('fps', `${Math.round(G.fps.n * 1000 / (nowMs - G.fps.t))} FPS`); G.fps.n = 0; G.fps.t = nowMs; }
  const { w, h } = fitCanvas(cv, ctx);
  ctx.fillStyle = '#e9e0c9'; ctx.fillRect(0, 0, w, h);
  if (!G.map || !G.snaps.length || G.offset == null) return;
  ensureScale();

  // Zeitleiste: was soll gerade gezeigt werden?
  const rt = nowMs - G.offset - DELAY;
  for (const s of G.snaps) {
    if (s.ts > G.lastProcTs && s.ts <= rt) { processSnap(s, rt - s.ts > 500); G.lastProcTs = s.ts; G.cur = s; }
  }
  if (!G.cur) { G.cur = G.snaps[0]; processSnap(G.cur, false); G.lastProcTs = G.cur.ts; }
  while (G.snaps.length > 2 && G.snaps[1].ts <= rt) G.snaps.shift();
  const s = G.cur;
  const nxt = G.snaps.find(o => o.ts > s.ts);
  const k = nxt ? clamp((rt - s.ts) / (nxt.ts - s.ts), 0, 1) : 0;
  const nTanks = nxt ? new Map(nxt.tanks.map(t => [t.i, t])) : null;
  const tanks = s.tanks.map(tk => {
    const n = nTanks && nTanks.get(tk.i);
    if (!n || Math.hypot(n.x - tk.x, n.y - tk.y) > 80) return { ...tk };
    return { ...tk, x: lerp(tk.x, n.x, k), y: lerp(tk.y, n.y, k), a: lerpAng(tk.a, n.a, k), ta: lerpAng(tk.ta, n.ta, k), h: lerp(tk.h, n.h, k), hp: n.hp };
  });
  const nB = nxt ? new Map(nxt.b.map(b => [b[0], b])) : null;
  const bullets = s.b.map(b => { const n = nB && nB.get(b[0]); return n ? [lerp(b[1], n[1], k), lerp(b[2], n[2], k), b[3]] : [b[1], b[2], b[3]]; });

  // eigener Panzer: vorhergesagt + Zielen sofort
  const latest = G.snaps[G.snaps.length - 1];
  const P = predictMe(dt, latest);
  let myT = tanks.find(t => t.i === me.pid);
  if (P && myT) { myT.x = P.x; myT.y = P.y; myT.h = heightAt(P.x, P.y); }

  const focus = tanks.find(t => t.i === s.f);
  const cam = G.cam;
  if (focus) {
    if (!cam.init) { cam.x = focus.x; cam.y = focus.y; cam.init = true; }
    const ff = focus === myT ? 1 : Math.min(1, dt * 10);
    cam.x += (focus.x - cam.x) * ff; cam.y += (focus.y - cam.y) * ff;
  }
  const baseZ = Math.max(0.5, Math.min(w / 1100, h / 700));
  const zt = baseZ / (1 + 0.22 * (focus ? focus.h : 0));
  cam.z += (zt - cam.z) * Math.min(1, dt * 3);
  const z = cam.z;
  G.shake *= Math.pow(0.002, dt);
  const shx = (Math.random() - 0.5) * G.shake, shy = (Math.random() - 0.5) * G.shake;
  if (myT) { const wm = screenToWorld(gm.x, gm.y); G.aim = Math.atan2(wm.y - myT.y, wm.x - myT.x); myT.ta = G.aim; }

  const dpr = devicePixelRatio || 1;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z + shx), dpr * (h / 2 - cam.y * z + shy));
  const vx0 = cam.x - w / 2 / z - 60, vy0 = cam.y - h / 2 / z - 60, vx1 = cam.x + w / 2 / z + 60, vy1 = cam.y + h / 2 / z + 60;
  const vis = (o, r) => o.x + r > vx0 && o.x - r < vx1 && o.y + r > vy0 && o.y - r < vy1;
  const t = nowMs / 1000;

  // 1) Boden (vorgezeichnet)
  drawTiles(vx0, vy0, vx1, vy1);
  // 2) Teleporter-Wirbel
  G.map.teleports.forEach((tp) => {
    if (!vis(tp, 40)) return;
    ctx.save(); ctx.strokeStyle = tp.color; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    for (let j = 0; j < 3; j++) { const a0 = t * 3 + j * 2.09; ctx.beginPath(); ctx.arc(tp.x, tp.y, tp.r * 0.62, a0, a0 + 1.3); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(tp.x, tp.y, 3.5, 0, 7); ctx.fillStyle = INK; ctx.fill(); ctx.restore();
  });
  // 3) zerstörte Büsche (am Boden)
  G.bushes.forEach((b, i) => { b._i = i; if (b.hp <= 0 && vis(b, b.r + 30)) drawBush(b, i, nowMs, false, false); });
  // 4) Kisten
  for (const [id, type, x, y] of s.p) {
    if (!vis({ x, y }, 20)) continue;
    const sp = pickupSprite(type), bob = Math.sin(t * 3 + (hashStr(id) % 7)) * 2.5;
    ctx.drawImage(sp.c, x - sp.R + 1, y - sp.R + 1 + bob, sp.R * 2, sp.R * 2);
  }
  // 5) Panzer (höhere oben)
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
      scale: sc, flash: (G.flash.get(tk.i) || 0) > nowMs, double: !!tk.df, cannon: tk.i === me.pid ? s.me.k : 0,
    });
    if (tk.bk) { // Block-Schild
      const R = 27 * sc;
      ctx.save();
      ctx.fillStyle = 'rgba(120,170,255,.18)'; ctx.beginPath(); ctx.arc(tk.x, tk.y, R, 0, 7); ctx.fill();
      ctx.strokeStyle = '#4a7fe0'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
      for (let j = 0; j < 6; j++) { const a0 = t * 4 + j * Math.PI / 3; ctx.beginPath(); ctx.arc(tk.x, tk.y, R, a0, a0 + 0.75); ctx.stroke(); }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(tk.x, tk.y, R - 4, -2.4 + t, -1.6 + t); ctx.stroke();
      ctx.restore();
    }
  }
  // 6) Kugeln
  for (const [x, y, friendly] of bullets) {
    if (!vis({ x, y }, 10)) continue;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(x, y, 4.6, 0, 7); ctx.fill();
    ctx.fillStyle = friendly ? '#f2c94c' : '#e8594f'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
  }
  // 7) intakte Büsche über den Panzern, mit Blättern wenn jemand drin ist
  G.bushes.forEach((b, i) => {
    if (b.hp <= 0 || !vis(b, b.r + 30)) return;
    const o = occ.has(i);
    drawBush(b, i, nowMs, friendlyBush.has(i), o);
    if (o && Math.random() < dt * 9) {
      const a = Math.random() * 6.28, d = Math.random() * b.r * 0.7;
      G.particles.push({ x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 0.7 + Math.random() * 0.4, t: 0, rot: Math.random() * 6, col: Math.random() < 0.5 ? '#5f9e45' : '#8cc46e' });
    }
  });
  // 8) Namen + Lebensbalken
  for (const tk of tanks) {
    if (!vis(tk, 40) || tk.i === me.pid) continue;
    const mine = teamOf(tk.i) === G.myTeam;
    const y = tk.y - 30 - 4 * tk.h;
    ctx.font = '15px "Patrick Hand", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mine ? '#2f8a3a' : INK;
    ctx.fillText(nameOf(tk.i), tk.x, y - 6);
    ctx.fillStyle = '#fff'; ctx.fillRect(tk.x - 20, y - 3, 40, 6);
    ctx.fillStyle = mine ? '#6fcf6f' : '#e8594f'; ctx.fillRect(tk.x - 20, y - 3, 40 * clamp(tk.hp / G.maxHp, 0, 1), 6);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.strokeRect(tk.x - 20, y - 3, 40, 6);
  }
  // 9) Partikel, Effekte, Zahlen
  G.particles = G.particles.filter(p => (p.t += dt) < p.life);
  for (const p of G.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy = p.vy * 0.94 + 25 * dt; p.rot += dt * 5;
    if (!vis(p, 5)) continue;
    ctx.save(); ctx.globalAlpha = 1 - p.t / p.life; ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, 4, 2, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3f6f2e'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.restore();
  }
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
    } else if (e.k === 'block') {
      ctx.strokeStyle = '#4a7fe0'; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let j = 0; j < 6; j++) { const a = j * 1.05; ctx.moveTo(e.x + Math.cos(a) * 4, e.y + Math.sin(a) * 4); ctx.lineTo(e.x + Math.cos(a) * (8 + p * 14), e.y + Math.sin(a) * (8 + p * 14)); }
      ctx.stroke();
    } else if (e.k === 'tp') {
      ctx.strokeStyle = '#9a6cff'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + p * 36, 0, 7); ctx.stroke();
    } else if (e.k === 'pick') {
      ctx.strokeStyle = '#e0a400'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(e.x, e.y, 10 + p * 28, 0, 7); ctx.stroke();
      ctx.fillStyle = INK; ctx.font = 'bold 17px "Patrick Hand", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(PICKUPS[e.type].name + '!', e.x, e.y - 22 - p * 22);
    }
    ctx.restore();
  }
  G.floats = G.floats.filter(f => nowMs - f.t0 < 900);
  for (const f of G.floats) {
    const p = (nowMs - f.t0) / 900;
    ctx.save(); ctx.globalAlpha = 1 - p * p;
    ctx.font = `bold ${Math.round(22 + (1 - p) * 6)}px "Gochi Hand", cursive`; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(f.text, f.x, f.y - p * 34);
    ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y - p * 34);
    ctx.restore();
  }
  // 10) Zone
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
  if (zn.r > 0 && Math.hypot(clamp(cam.x, zn.x - zn.r, zn.x + zn.r) - cam.x, 0) < 1e9) {
    const n = Math.round(clamp(zn.r / 10, 30, 220));
    sketchStroke(ctx, circlePts(zn.x, zn.y, zn.r, n, 7, 0.004), 7, 2, true, 5, '#4a5fd0');
  }
  if (zn.st !== 'done' && zn.tr > 0) {
    ctx.save(); ctx.setLineDash([18, 14]); ctx.lineDashOffset = -t * 20;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(zn.tx, zn.ty, zn.tr, 0, 7); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }

  // 11) Bildschirm: Fadenkreuz, Konfetti
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
  if (G.frame % 3 === 0) drawMini(s);
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
