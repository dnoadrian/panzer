// PANZER – Spiel: Papier-Welt, flüssiges Zeichnen, Fähigkeiten, Effekte, HUD
'use strict';

const cv = $('cv'), ctx = cv.getContext('2d', { alpha: false });
const mini = $('mini'), mctx = mini.getContext('2d');
let inGame = false;
const G = {};
const keys = {};
const gm = { x: innerWidth / 2, y: innerHeight / 2, down: false, rdown: false };

// Puffer für flüssige Bewegung anderer Panzer: passt sich den Netzwerk-Schwankungen an
const DELAY_MIN = 50, DELAY_MAX = 180;
const TILE = 256;   // Kachelgröße der vorgezeichneten Welt
const TR = 16, SPEED = 85, LAKE_SLOW = 0.55;
const SKY = '#9fd6f2';
const TEAM_ME = '#f2b705', TEAM_ENEMY = '#ff4a3a';

function resetG() {
  Object.assign(G, {
    map: null, roster: [], byId: new Map(), myTeam: 0, teamSize: 1, maxHp: 150, fireCd: 1, ability: 'turbo',
    snaps: [], offset: null, lastProcTs: -1, cur: null, newMe: null, oldMe: null, pred: null,
    cam: { x: 1800, y: 1800, z: 0.8, init: false }, bushes: [], bushHit: new Map(),
    particles: [], effects: [], floats: [], flash: new Map(), shake: 0, warned: false, lastCd: 99,
    miniStatic: null, lastFrame: performance.now(), hitMark: 0, killMark: 0, result: null, aim: 0, confetti: [], tutTimers: [],
    tiles: new Map(), tileScale: 0, sprites: new Map(), frame: 0, fps: { n: 0, t: performance.now() }, hud: {}, bigMap: false,
    plat: null, deco: null, lowHp: false, lastBeat: 0, delay: 80, jit: 10, lastArr: 0, prevCur: null, buckets: null,
  });
}
resetG();

function startGame(m) {
  resetG();
  closeMenu(); closeSettings();
  $('bigmap').classList.add('hidden');
  G.map = m.map; G.maxHp = m.maxHp; G.bus = m.bus; G.blockCd = m.blockCd; G.fireCd = m.fireCd; G.ability = m.ability;
  G.roster = m.roster; m.roster.forEach((r, i) => { G.byId.set(r.id, r); r.idx = i; });
  G.bushes = m.map.bushes.map(b => ({ ...b }));
  G.myTeam = m.myTeam; G.teamSize = m.roster.filter(r => r.team === m.myTeam).length;
  const P = m.map.plateau, N = P.r.length;
  G.plat = P.r.map((R, i) => [P.cx + Math.cos(i / N * Math.PI * 2) * R, P.cy + Math.sin(i / N * Math.PI * 2) * R]);
  buildDeco();
  inGame = true;
  for (const id of ['deathCard', 'resultCard']) $(id).classList.add('hidden');
  for (const id of ['feed', 'center', 'tutorial', 'mates', 'invites', 'chips']) $(id).innerHTML = '';
  show('game');
  updateCursor();
  buildMiniStatic();
  const ab = CAT.ABILITY_BY_ID[G.ability];
  const ic = $('abIcon'), ix = ic.getContext('2d'); ix.clearRect(0, 0, 120, 120); drawAbilityIcon(ix, G.ability, 60, 60, 104, false);
  $('abKey').textContent = ab && ab.type === 'aktiv' ? keyName(settings.keys.ability) : 'Passiv';
  ac();
  if (!local.tut) runTutorial();
}
function exitGame() {
  if (!inGame) return;
  inGame = false;
  closeMenu(); closeSettings();
  if (document.pointerLockElement) document.exitPointerLock();
  for (const tm of G.tutTimers) clearTimeout(tm);
  $('lowhp').classList.remove('on');
  resetG();
  show(loggedIn ? 'lobby' : 'login');
}
$('btnLobby1').onclick = () => send({ t: 'toLobby' });
$('btnLobby2').onclick = () => send({ t: 'toLobby' });
$('btnSpec').onclick = () => send({ t: 'spectate' });
$('btnWatch').onclick = () => { $('resultCard').classList.add('hidden'); $('deathCard').classList.remove('hidden'); };

function runTutorial() {
  const K = settings.keys;
  const tips = [
    `${keyName(K.jump)} oder Klick: aus dem Kampfbus springen`,
    'Am Fallschirm mit WASD zum Landeplatz steuern',
    'WASD fahren · Maus zielen · Klick schießen',
    `${keyName(K.ability)}: Fähigkeit · ${keyName(K.block)}: Blocken`,
    'Bleib im Kreis – im Sturm verlierst du Leben',
    'Büsche verstecken dich – ein Schuss und sie sind weg',
    `Pass auf die Klippen auf! · ${keyName(K.map)}: große Karte`,
  ];
  const box = $('tutorial');
  tips.forEach((tip, i) => G.tutTimers.push(setTimeout(() => { box.innerHTML = ''; box.appendChild(el('div', '', tip)); }, i * 2800)));
  G.tutTimers.push(setTimeout(() => { box.innerHTML = ''; }, tips.length * 2800));
  local.tut = true; save('tut', true);
}

// ---------- Helfer ----------
const nameOf = (id) => { const r = G.byId.get(id); return r ? r.name : '?'; };
const equipOf = (id) => { const r = G.byId.get(id); return r ? r.equip : CAT.DEFAULT_EQUIP; };
const teamOf = (id) => { const r = G.byId.get(id); return r ? r.team : -1; };
function bushIdx(x, y) { for (let i = 0; i < G.bushes.length; i++) { const b = G.bushes[i]; if (b.hp > 0 && Math.hypot(x - b.x, y - b.y) < b.r) return i; } return -1; }
function inLake(x, y) { for (const l of G.map.lakes) { const dx = (x - l.x) / l.rx, dy = (y - l.y) / l.ry; if (dx * dx + dy * dy < 1) return true; } return false; }
function volAt(x, y) { return clamp(1 - Math.hypot(x - G.cam.x, y - G.cam.y) / 950, 0, 1); }
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
let poiT = null;
function showPoi(name) {
  const e = $('poiName'); e.textContent = name; e.classList.add('show');
  clearTimeout(poiT); poiT = setTimeout(() => e.classList.remove('show'), 2600);
}
const LEAF = ['#5fae47', '#8fd36f', '#4f9a3a'];
function burst(x, y, n, cols, opt = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = (opt.sp || 90) * (0.4 + Math.random());
    G.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (opt.up || 0), life: (opt.life || 0.8) * (0.6 + Math.random() * 0.6), t: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, col: cols[i % cols.length], shape: opt.shape || 'leaf', g: opt.g == null ? 30 : opt.g, s: opt.s || 1 });
  }
}

// ---------- Netzwerk-Zustände ----------
function onState(s) {
  if (!inGame) return;
  const now = performance.now(), off = now - s.ts;
  G.offset = G.offset == null ? off : Math.min(G.offset + 0.5, off);
  if (G.lastArr) { const gap = now - G.lastArr; G.jit = G.jit * 0.92 + Math.abs(gap - 25) * 0.08; }
  G.lastArr = now;
  G.snaps.push(s);
  if (G.snaps.length > 60) G.snaps.shift();
  const mt = s.tanks.find(t => t.i === me.pid);
  if (mt && s.me.alive && s.me.ph === 0) { G.oldMe = G.newMe; G.newMe = { x: mt.x, y: mt.y, ts: s.ts }; } else { G.newMe = G.oldMe = null; }
}
function processSnap(s, late) {
  const now = performance.now();
  for (const e of s.ev) {
    if (e.k === 'bush') { const b = G.bushes[e.i]; if (b) b.hp = 0; }
    if (e.k === 'feed') { addFeed(e.text, e.by === me.pid || e.v === me.pid); continue; }
    if (late) continue;
    const v = e.x !== undefined ? volAt(e.x, e.y) : 1;
    switch (e.k) {
      case 'shot':
        G.effects.push({ k: 'shot', x: e.x, y: e.y, a: e.a, t0: now, life: 120, big: e.big });
        (e.big ? sfx.bigshot : sfx.shot)(e.i === me.pid ? 1 : v * 0.7);
        break;
      case 'hit':
        G.flash.set(e.v, now + 90);
        if (e.by === me.pid) { G.floats.push({ x: e.x, y: e.y - 22, text: String(e.d), col: '#ffcf3f', t0: now }); G.hitMark = now; sfx.hit(); }
        if (e.v === s.f) {
          G.shake = Math.min(14, G.shake + 7);
          if (e.v === me.pid) {
            G.floats.push({ x: e.x, y: e.y - 22, text: '-' + e.d, col: '#ff6b5a', t0: now });
            const hu = $('hurt'); hu.style.transition = 'none'; hu.style.opacity = 1;
            requestAnimationFrame(() => { hu.style.transition = 'opacity .5s'; hu.style.opacity = 0; });
            sfx.hurt();
          }
        }
        break;
      case 'boom': spawnFinisher(e.fin || 'standard-boom', e.x, e.y, now); G.shake = Math.min(16, G.shake + 6 * v); sfx.boom(v); break;
      case 'boomR': G.effects.push({ k: 'boom', x: e.x, y: e.y, t0: now, life: 800, r: e.r }); burst(e.x, e.y, 10, ['#b9b3c4', '#d8d2e0'], { shape: 'puff', sp: 80, life: 0.9, g: -10, s: 1.4 }); G.shake = Math.min(16, G.shake + 6 * v); sfx.boom(v * 0.8); break;
      case 'puff': burst(e.x, e.y, 5, ['#c9c2d4', '#e9e4ef'], { shape: 'puff', sp: 50, life: 0.45, g: -20 }); sfx.dirt(v); break;
      case 'leaf': burst(e.x, e.y, 6, LEAF, { sp: 70, life: 0.7 }); sfx.bush(v * 0.6); break;
      case 'wood': burst(e.x, e.y, 6, ['#c98f4f', '#a8703a', '#e2b27a'], { shape: 'chip', sp: 90, life: 0.6 }); sfx.wood(v); break;
      case 'bush': G.bushHit.set(e.i, now); burst(e.x, e.y, 34, LEAF, { sp: 140, life: 1.1 }); sfx.bush(v); break;
      case 'tp': G.effects.push({ k: 'ring', x: e.x, y: e.y, t0: now, life: 600, col: '#9a6cff', r: 40 }); break;
      case 'jump': if (e.i === me.pid) { sfx.jump(); centerMsg(null, 'Mit WASD zum Landeplatz steuern', 2600); } break;
      case 'land': G.effects.push({ k: 'dust', x: e.x, y: e.y, t0: now, life: 650 }); if (e.i === me.pid) { sfx.land(); G.shake = 8; } break;
      case 'fall': G.effects.push({ k: 'fall', x: e.x, y: e.y, a: e.a, equip: equipOf(e.i), seed: hashStr(e.i), t0: now, life: 1500 }); burst(e.x, e.y, 10, ['#c9a46f', '#a8845a'], { shape: 'chip', sp: 60, life: 0.9, g: 120 }); sfx.fall(v); break;
      case 'block': G.effects.push({ k: 'spark', x: e.x, y: e.y, t0: now, life: 350, col: '#4f8ff0' }); if (e.by === me.pid || e.v === me.pid || v > 0.3) sfx.block(); break;
      case 'blockOn': if (e.i === me.pid) sfx.blockOn(); break;
      case 'heal': G.floats.push({ x: e.x, y: e.y - 36, text: '+' + e.d, col: '#63d07a', t0: now }); if (e.i === me.pid) sfx.heal(); break;
      case 'elim': if (e.by === me.pid) { centerMsg('ELIMINIERT', e.vn, 1500); G.killMark = now; sfx.kill(); } break;
      case 'zone': centerMsg(null, 'Der Sturm zieht sich zusammen!', 2200); sfx.zone(); break;
      case 'ab':
        if (e.i === me.pid) sfx.ability();
        if (e.id === 'turbo') burst(e.x, e.y, 8, ['#ffffff', '#ffe680'], { shape: 'puff', sp: 60, life: 0.5, g: 0 });
        if (e.id === 'repair') burst(e.x, e.y, 8, ['#63d07a', '#ffffff'], { shape: 'plus', sp: 50, life: 0.9, g: -40 });
        if (e.id === 'dome') G.effects.push({ k: 'ring', x: e.x, y: e.y, t0: now, life: 400, col: '#8ab8ff', r: 50 });
        if (e.id === 'radar' && e.i === me.pid) G.effects.push({ k: 'radar', x: e.x, y: e.y, t0: now, life: 1200 });
        if (e.id === 'smoke') burst(e.x, e.y, 16, ['#e9e4ef', '#c9c2d4'], { shape: 'puff', sp: 70, life: 1.2, g: -5, s: 2 });
        break;
      case 'blink': G.effects.push({ k: 'blink', x: e.x, y: e.y, x2: e.x2, y2: e.y2, t0: now, life: 450 }); burst(e.x2, e.y2, 10, ['#b98cff', '#ffffff'], { shape: 'star', sp: 70, life: 0.6, g: 0 }); break;
      case 'arty': G.shake = Math.min(18, G.shake + 10 * v); break;
      case 'emp': G.effects.push({ k: 'emp', x: e.x, y: e.y, t0: now, life: 700 }); sfx.emp(); break;
    }
  }
  if (s.bus && s.bus.wait > 0) {
    const n = Math.ceil(s.bus.wait);
    if (n !== G.lastCd) { G.lastCd = n; centerMsg(String(n), 'Der Kampfbus startet', 900); sfx.tick(); }
  } else if (s.bus && G.lastCd !== 0) { G.lastCd = 0; centerMsg('ABSPRINGEN!', `${keyName(settings.keys.jump)} oder Klick`, 1400); sfx.go(); }
  if (s.z.st === 'wait' && s.z.left < 10.5 && !G.warned && !s.bus) { G.warned = true; centerMsg(null, 'Der Sturm zieht in 10 Sekunden zu', 1800); }
  if (s.z.st !== 'wait') G.warned = false;
  updateHud(s);
}

function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function updateHud(s) {
  setText('hAlive', String(s.al));
  setText('hKills', String(s.me.kills));
  const z = s.z;
  setText('zoneInfo', s.bus ? `Kampfbus: ${s.bus.n} noch an Bord` : z.st === 'wait' ? `Sturm zieht zu in ${fmt(z.left)}` : z.st === 'shrink' ? 'Der Sturm zieht sich zusammen!' : 'Letzter Kreis');
  const myT = s.tanks.find(t => t.i === me.pid);
  const outside = !!myT && s.me.ph === 0 && Math.hypot(myT.x - z.x, myT.y - z.y) > z.r;
  $('zoneInfo').classList.toggle('warn', outside || z.st === 'shrink');
  $('vignette').style.opacity = outside ? 1 : 0;
  const hp = s.me.alive ? s.me.hp : 0, pct = clamp(hp / G.maxHp * 100, 0, 100);
  if (G.hud.hp !== hp) {
    G.hud.hp = hp;
    $('hpBar').style.width = pct + '%'; $('hpLag').style.width = pct + '%';
    $('hpBar').style.background = pct > 50 ? '#63d07a' : pct > 25 ? '#ffcf3f' : '#ff6b5a';
    $('hpText').textContent = hp;
  }
  const low = s.me.alive && s.me.ph === 0 && pct < 33;
  if (low !== G.lowHp) { G.lowHp = low; $('lowhp').classList.toggle('on', low); document.querySelector('.hp').classList.toggle('low', low); }
  const ab = CAT.ABILITY_BY_ID[G.ability];
  if (ab && ab.type === 'aktiv' && s.me.alive) {
    const left = s.me.abr, frac = s.me.abcd ? clamp(left / s.me.abcd, 0, 1) : 0;
    const key = left > 0 ? Math.ceil(left) + '|' + Math.round(frac * 40) : 'r';
    if (G.hud.ab !== key) {
      G.hud.ab = key;
      $('abCd').style.background = left > 0 ? `conic-gradient(rgba(40,28,60,.6) ${frac * 360}deg, transparent 0)` : 'none';
      $('abCd').textContent = left > 0 ? Math.ceil(left) : '';
    }
  } else if (G.hud.ab !== 'p') { G.hud.ab = 'p'; $('abCd').style.background = 'none'; $('abCd').textContent = ''; }
  const chips = [];
  if (s.me.alive && s.me.ph === 0) {
    chips.push(s.me.bk ? 'BLOCKT!' : s.me.bl > 0 ? `Blocken in ${Math.ceil(s.me.bl)}s` : `Blocken bereit (${keyName(settings.keys.block)})`);
    if (s.me.heal) chips.push('Repariert ...');
  }
  const ck = chips.join('|');
  if (G.hud.chips !== ck) {
    G.hud.chips = ck;
    const box = $('chips'); box.innerHTML = '';
    for (const txt of chips) { const c = el('span', 'chip', txt); c.style.background = txt.startsWith('Blocken in') ? '#efe5d0' : '#d6e6ff'; box.appendChild(c); }
  }
  if (G.teamSize > 1) {
    const mk = s.mates.filter(m => m[0] !== me.pid).map(m => m[0] + m[3] + ':' + m[4]).join('|');
    if (G.hud.mates !== mk) {
      G.hud.mates = mk;
      const box = $('mates'); box.innerHTML = '';
      for (const [id, , , alive, mhp] of s.mates) {
        if (id === me.pid) continue;
        const d = el('div', 'mate' + (alive ? '' : ' dead'), nameOf(id));
        const bar = el('div', 'mb'); const i = el('i'); i.style.width = (alive ? mhp / G.maxHp * 100 : 0) + '%'; bar.appendChild(i); d.appendChild(bar);
        box.appendChild(d);
      }
    }
  }
  if (!s.me.alive && !$('deathCard').classList.contains('hidden')) setText('deathBy', (G.deathText || '') + (s.f !== me.pid ? `  ·  Du schaust zu: ${nameOf(s.f)}` : ''));
}

function onDead(m) {
  G.deathText = m.by ? `Eliminiert von ${m.by}` : m.cause === 'zone' ? 'Der Sturm hat dich erwischt' : m.cause === 'fall' ? 'Du bist in den Abgrund gestürzt' : '';
  if (document.pointerLockElement) document.exitPointerLock();
  gm.down = gm.rdown = false;
  if (!G.result) $('deathCard').classList.remove('hidden');
  $('deathCard').querySelector('.t').textContent = m.place ? `#${m.place}  Eliminiert` : 'Eliminiert';
  setText('deathBy', G.deathText);
  $('vignette').style.opacity = 0; $('lowhp').classList.remove('on');
  G.pred = null;
  setTimeout(updateCursor, 0);
  sfx.boom(1);
}

function onResult(m) {
  for (const p of m.players) { local.recent = local.recent.filter(r => r.pid !== p.pid); local.recent.unshift(p); }
  local.recent = local.recent.slice(0, 10); save('recent', local.recent);
  const before = CAT.rankInfo(m.oldRp), after = CAT.rankInfo(m.newRp);
  const sign = (n) => (n >= 0 ? '+' : '') + n;
  if (after.idx > before.idx) setTimeout(() => { toast(`Aufgestiegen: ${after.rank.name}!`); sfx.win(); }, 1200);
  if (!inGame || !m.inMatch) { toast(`${m.win ? 'Sieg Royale für dein Team!' : '#' + m.place}  ${sign(m.drp)} RP · +${m.coins} Zahnräder`); return; }
  G.result = m;
  $('deathCard').classList.add('hidden');
  { const c = $('resRank'), x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height); drawRankIcon(x, after.idx, 110, 92, 150); }
  $('resTitle').textContent = m.win ? 'SIEG ROYALE!' : `#${m.place}`;
  $('resSub').textContent = (m.win ? 'Dein Team ist als letztes übrig.' : `von ${m.teams} Teams`) + `  ·  ${after.rank.name}` + (after.idx > before.idx ? '  ·  AUFGESTIEGEN!' : '');
  $('resKills').textContent = m.kills; $('resDmg').textContent = m.dmg; $('resRp').textContent = sign(m.drp); $('resCoins').textContent = '+' + m.coins;
  const oldPct = after.idx === before.idx ? before.pct : 0, newPct = after.pct;
  const gainPct = Math.round(m.drp / (after.need || before.need || 100) * 100);
  $('resBarOld').style.width = (Math.min(oldPct, newPct) * 100) + '%';
  $('resBarNew').style.transition = 'none'; $('resBarNew').style.width = (oldPct * 100) + '%';
  requestAnimationFrame(() => requestAnimationFrame(() => { $('resBarNew').style.transition = ''; $('resBarNew').style.width = (newPct * 100) + '%'; }));
  const next = CAT.RANKS[after.idx + 1];
  $('resRpText').textContent = `${sign(m.drp)} RP  (${sign(gainPct)} %)` + (next ? `  ·  ${Math.round(newPct * 100)} % bis ${next.name}` : '  ·  Höchster Rang!');
  $('btnWatch').classList.toggle('hidden', !!m.win);
  $('resultCard').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  updateCursor();
  if (m.win) {
    sfx.win();
    for (let i = 0; i < 140; i++) G.confetti.push({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.5, vy: 80 + Math.random() * 120, vx: (Math.random() - 0.5) * 60, r: Math.random() * 6, col: ['#ff6b5a', '#4f8ff0', '#63d07a', '#ffcf3f', '#9b6be0'][i % 5] });
  }
}

// ---------- Eingabe ----------
addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || settingsOpen() || menuOpen()) return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (inGame) {
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k) || Object.values(settings.keys).includes(k)) e.preventDefault();
    if (k === settings.keys.spec && G.cur && !G.cur.me.alive && !e.repeat) send({ t: 'spectate' });
    if (k === settings.keys.map && !e.repeat) { G.bigMap = !G.bigMap; $('bigmap').classList.toggle('hidden', !G.bigMap); }
  }
});
addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; gm.down = gm.rdown = false; });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === cv) {
    gm.x = clamp(gm.x + e.movementX * settings.sens, 0, innerWidth);
    gm.y = clamp(gm.y + e.movementY * settings.sens, 0, innerHeight);
  } else if (e.target === cv) { gm.x = e.clientX; gm.y = e.clientY; }
});
cv.addEventListener('pointerdown', (e) => {
  const alive = G.cur && G.cur.me.alive;
  if (alive && settings.lock && document.pointerLockElement !== cv && inGame) {
    try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* egal */ }
  }
  if (e.button === 0) gm.down = true; if (e.button === 2) gm.rdown = true;
  if (document.pointerLockElement !== cv) { gm.x = e.clientX; gm.y = e.clientY; }
  ac();
});
addEventListener('pointerup', (e) => { if (e.button === 0) gm.down = false; if (e.button === 2) gm.rdown = false; });
cv.addEventListener('contextmenu', (e) => e.preventDefault());

function readMove() {
  const K = settings.keys;
  let dx = 0, dy = 0;
  if (keys[K.up] || keys.arrowup) dy -= 1;
  if (keys[K.down] || keys.arrowdown) dy += 1;
  if (keys[K.left] || keys.arrowleft) dx -= 1;
  if (keys[K.right] || keys.arrowright) dx += 1;
  return { dx, dy };
}
function screenToWorld(sx, sy) { const z = G.cam.z; return { x: G.cam.x + (sx - innerWidth / 2) / z, y: G.cam.y + (sy - innerHeight / 2) / z }; }
setInterval(() => {
  const s = G.snaps[G.snaps.length - 1];
  if (!inGame || !s || !s.me.alive) return;
  if (settingsOpen() || menuOpen()) { send({ t: 'input', dx: 0, dy: 0, aim: G.aim, fire: false, block: false, ab: false }); return; }
  const { dx, dy } = readMove(), K = settings.keys;
  const w = screenToWorld(gm.x, gm.y);
  send({
    t: 'input', dx, dy, aim: G.aim, ax: Math.round(w.x), ay: Math.round(w.y),
    fire: gm.down || !!keys[K.fire] || (s.me.ph === 1 && !!keys[K.jump]),
    block: !!(gm.rdown || keys[K.block]), ab: !!keys[K.ability],
  });
}, 33);

// ================= Vorgezeichnete Papier-Welt (Kacheln) =================
function buildDeco() {
  const r = rng(G.map.plateau.r[3] * 13 + 7), S = G.map.size, Pl = G.map.plateau;
  const onP = (x, y, m) => {
    const dx = x - Pl.cx, dy = y - Pl.cy; let u = Math.atan2(dy, dx) / (Math.PI * 2); u -= Math.floor(u); u *= Pl.r.length;
    const i = Math.floor(u) % Pl.r.length, fr = u - Math.floor(u);
    return Math.hypot(dx, dy) < Pl.r[i] + (Pl.r[(i + 1) % Pl.r.length] - Pl.r[i]) * fr - m;
  };
  const d = { patches: [], flowers: [], tufts: [], clouds: [], pebbles: [] };
  for (let i = 0; i < 220; i++) { const x = r() * S, y = r() * S; if (onP(x, y, 60)) d.patches.push({ x, y, r: 60 + r() * 140, light: r() < 0.5, seed: i }); }
  for (let i = 0; i < 2400; i++) { const x = r() * S, y = r() * S; if (onP(x, y, 20)) d.tufts.push({ x, y }); }
  for (let i = 0; i < 1100; i++) { const x = r() * S, y = r() * S; if (onP(x, y, 20)) d.flowers.push({ x, y, c: ['#ffffff', '#ffd25c', '#ff9ab0', '#b9a6ff', '#ff7a6a'][i % 5] }); }
  for (let i = 0; i < 300; i++) { const x = r() * S, y = r() * S; if (onP(x, y, 20)) d.pebbles.push({ x, y, r: 2 + r() * 3 }); }
  for (let i = 0; i < 70; i++) {
    const cx = -500 + r() * (S + 1000), cy = -500 + r() * (S + 1000), w = 60 + r() * 110, n = 3 + Math.floor(r() * 3), puffs = [];
    for (let k = 0; k < n; k++) puffs.push(C(cx + (k - n / 2) * w * 0.45 + r() * 10, cy + (r() - 0.5) * w * 0.25, w * (0.32 + r() * 0.2)));
    d.clouds.push({ x: cx, y: cy, r: w * 1.4, puffs });
  }
  G.deco = d;
  // pro Kachel vorsortieren
  const B = new Map(), add = (kind, o, r) => {
    for (let ty = Math.floor((o.y - r) / TILE); ty <= Math.floor((o.y + r) / TILE); ty++)
      for (let tx = Math.floor((o.x - r) / TILE); tx <= Math.floor((o.x + r) / TILE); tx++) {
        const k = tx + ',' + ty; let b = B.get(k); if (!b) { b = { patches: [], flowers: [], tufts: [], clouds: [], pebbles: [] }; B.set(k, b); } b[kind].push(o);
      }
  };
  for (const o of d.patches) add('patches', o, o.r * 1.4);
  for (const o of d.flowers) add('flowers', o, 8);
  for (const o of d.tufts) add('tufts', o, 10);
  for (const o of d.pebbles) add('pebbles', o, 6);
  for (const o of d.clouds) add('clouds', o, o.r);
  G.buckets = B;
}
// Lage einer Kachel: ganz innen, ganz außen oder am Rand der Kuppe
function plateauDist(x, y) {
  const Pl = G.map.plateau, dx = x - Pl.cx, dy = y - Pl.cy; let u = Math.atan2(dy, dx) / (Math.PI * 2); u -= Math.floor(u); u *= Pl.r.length;
  const i = Math.floor(u) % Pl.r.length, fr = u - Math.floor(u);
  return Pl.r[i] + (Pl.r[(i + 1) % Pl.r.length] - Pl.r[i]) * fr - Math.hypot(dx, dy); // >0 = innen
}
function drawMountain(x2, m, i) {
  const cols = ['#8f7d6c', '#a8957f', '#c4b39c', '#ddd0bc'];
  for (let k = 0; k < 4; k++) paper(x2, B(blobPts(m.x + k * 2, m.y - k * 9, m.r * 0.93 * (1 - k * 0.2), 11, i * 17 + k, 0.07)), cols[k], { border: 3, sx: 4, sy: 6, shadowCol: k ? 'rgba(40,28,60,.18)' : 'rgba(40,28,60,.28)' });
  const sx = m.x + 6, sy = m.y - 34, sr = m.r * 0.28, pts = [];
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2, rr = k % 2 ? sr * 0.7 : sr; pts.push([sx + Math.cos(a) * rr, sy + Math.sin(a) * rr]); }
  paper(x2, P(pts), '#ffffff', { border: 2, sx: 2, sy: 3, edgeCol: 'rgba(80,90,120,.3)' });
  x2.strokeStyle = 'rgba(90,70,60,.35)'; x2.lineWidth = 2; x2.beginPath();
  const r = rng(i * 3 + 9);
  for (let k = 0; k < 6; k++) { const a = r() * 6.28, d0 = m.r * 0.35, d1 = m.r * (0.6 + r() * 0.25); x2.moveTo(m.x + Math.cos(a) * d0, m.y - 10 + Math.sin(a) * d0); x2.lineTo(m.x + Math.cos(a) * d1, m.y + Math.sin(a) * d1); }
  x2.stroke();
}
function drawTree(x2, t) {
  x2.fillStyle = 'rgba(40,60,30,.22)'; x2.beginPath(); x2.ellipse(t.x + 8, t.y + 10, t.r * 1.05, t.r * 0.9, 0, 0, 7); x2.fill();
  paper(x2, [C(t.x - t.r * 0.35, t.y + t.r * 0.1, t.r * 0.72), C(t.x + t.r * 0.35, t.y + t.r * 0.15, t.r * 0.7), C(t.x, t.y - t.r * 0.3, t.r * 0.78)], '#3f8f3a', { border: 3.5, shadow: false });
  paper(x2, [C(t.x - t.r * 0.15, t.y - t.r * 0.25, t.r * 0.55), C(t.x + t.r * 0.2, t.y - t.r * 0.1, t.r * 0.45)], '#4fa847', { border: 0, shadow: false, edge: false });
  paper(x2, C(t.x - t.r * 0.25, t.y - t.r * 0.4, t.r * 0.25), '#62bd56', { border: 0, shadow: false, edge: false });
}
function drawWall(x2, w) {
  if (w.k === 'crate') {
    paper(x2, RR(w.x, w.y, w.w, w.h, 4), '#c98f4f', { border: 3, sx: 3, sy: 5 });
    x2.strokeStyle = '#8a5a2b'; x2.lineWidth = 2.2; x2.beginPath();
    x2.moveTo(w.x + 4, w.y + 4); x2.lineTo(w.x + w.w - 4, w.y + w.h - 4); x2.moveTo(w.x + w.w - 4, w.y + 4); x2.lineTo(w.x + 4, w.y + w.h - 4);
    x2.rect(w.x + 4, w.y + 4, w.w - 8, w.h - 8); x2.stroke();
  } else if (w.k === 'house') {
    const roof = w.roof || '#e8594f';
    paper(x2, RR(w.x, w.y, w.w, w.h, 6), roof, { border: 3.5, sx: 5, sy: 7 });
    x2.fillStyle = 'rgba(0,0,0,.14)'; x2.fillRect(w.x + 3, w.y + w.h / 2, w.w - 6, w.h / 2 - 3);
    x2.strokeStyle = darken(roof, 0.3); x2.lineWidth = 3; x2.beginPath(); x2.moveTo(w.x + 4, w.y + w.h / 2); x2.lineTo(w.x + w.w - 4, w.y + w.h / 2); x2.stroke();
    x2.strokeStyle = 'rgba(0,0,0,.18)'; x2.lineWidth = 1.2; x2.beginPath();
    for (let k = 10; k < w.w - 4; k += 10) { x2.moveTo(w.x + k, w.y + 4); x2.lineTo(w.x + k, w.y + w.h - 4); }
    x2.stroke();
    paper(x2, RR(w.x + w.w * 0.7, w.y + 8, 12, 14, 2), '#9a8f86', { border: 2, sx: 2, sy: 3 });
  } else {
    paper(x2, RR(w.x, w.y, w.w, w.h, 4), '#b9b3c4', { border: 3, sx: 3, sy: 5 });
    x2.strokeStyle = 'rgba(80,70,90,.35)'; x2.lineWidth = 1.4; x2.beginPath();
    const horiz = w.w > w.h, L = horiz ? w.w : w.h;
    for (let k = 14; k < L; k += 14) { if (horiz) { x2.moveTo(w.x + k, w.y + 3); x2.lineTo(w.x + k, w.y + w.h - 3); } else { x2.moveTo(w.x + 3, w.y + k); x2.lineTo(w.x + w.w - 3, w.y + k); } }
    x2.stroke();
  }
}
function buildTile(tx, ty) {
  const s = G.tileScale, size = Math.ceil((TILE + 2) * s);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.scale(s, s); x.translate(-tx * TILE + 1, -ty * TILE + 1);
  const x0 = tx * TILE - 1, y0 = ty * TILE - 1, x1 = x0 + TILE + 2, y1 = y0 + TILE + 2;
  const hit = (o, r) => o.x + r > x0 && o.x - r < x1 && o.y + r > y0 && o.y - r < y1;
  const bk = G.buckets.get(tx + ',' + ty) || { patches: [], flowers: [], tufts: [], clouds: [], pebbles: [] };
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2]].map(([cx, cy]) => plateauDist(cx, cy));
  const inside = corners.every(d => d > 30), outside = corners.every(d => d < -400);
  if (!inside) {
    x.fillStyle = SKY; x.fillRect(x0, y0, TILE + 2, TILE + 2);
    for (const cl of bk.clouds) paper(x, cl.puffs, '#ffffff', { border: 3, sx: 6, sy: 10, shadowCol: 'rgba(60,110,170,.18)', edge: false });
    if (outside) return c;
    // Klippe: Papier-Gesteinsschichten (nur am Rand der Kuppe)
    for (const [dy, col] of [[150, '#7d644b'], [105, '#987a57'], [62, '#b49466'], [26, '#ccae7c']]) paper(x, P(G.plat.map(([px, py]) => [px, py + dy])), col, { border: 3, sx: 0, sy: 6, shadowCol: 'rgba(40,28,60,.2)' });
  }
  // Wiese
  x.save(); if (!inside) { pathOf(x, [P(G.plat)]); x.clip(); }
  x.fillStyle = '#8fd36f'; x.fillRect(x0, y0, TILE + 2, TILE + 2);
  for (const p of bk.patches) if (hit(p, p.r)) { x.fillStyle = p.light ? 'rgba(190,240,150,.35)' : 'rgba(70,150,60,.18)'; pathOf(x, [B(blobPts(p.x, p.y, p.r, 9, p.seed, 0.3))]); x.fill(); }
  x.fillStyle = fiberPattern(x); x.globalAlpha = 0.18; x.fillRect(x0, y0, TILE + 2, TILE + 2); x.globalAlpha = 1;
  x.strokeStyle = '#64b04a'; x.lineWidth = 2; x.lineCap = 'round'; x.beginPath();
  for (const t of bk.tufts) { x.moveTo(t.x - 4, t.y); x.lineTo(t.x - 2, t.y - 7); x.moveTo(t.x, t.y); x.lineTo(t.x + 1, t.y - 9); x.moveTo(t.x + 4, t.y); x.lineTo(t.x + 3, t.y - 6); }
  x.stroke();
  for (const p of bk.pebbles) paper(x, C(p.x, p.y, p.r), '#d8d2c8', { border: 1.2, sx: 1, sy: 1.5, edge: false });
  for (const f of bk.flowers) {
    const sh = []; for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; sh.push(C(f.x + Math.cos(a) * 3.4, f.y + Math.sin(a) * 3.4, 2.6)); }
    paper(x, sh, f.c, { border: 1.2, sx: 1, sy: 1.5, edge: false });
    paper(x, C(f.x, f.y, 1.7), '#f2a03f', { border: 0, shadow: false, edge: false });
  }
  x.restore();
  if (!inside) {
    x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.lineJoin = 'round'; pathOf(x, [P(G.plat)]); x.stroke();
    x.strokeStyle = 'rgba(58,48,70,.3)'; x.lineWidth = 1.5; x.stroke();
  }
  for (const l of G.map.lakes) if (hit(l, Math.max(l.rx, l.ry) + 20)) {
    paper(x, E(l.x, l.y, l.rx, l.ry), '#5fb5ea', { border: 4, sx: 0, sy: 4, shadowCol: 'rgba(40,80,40,.25)' });
    paper(x, E(l.x - l.rx * 0.08, l.y - l.ry * 0.1, l.rx * 0.72, l.ry * 0.66), '#8fd0f5', { border: 0, shadow: false, edge: false });
    x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 2.4; x.lineCap = 'round';
    const r = rng(Math.round(l.x));
    for (let k = 0; k < 7; k++) { const px = l.x + (r() - 0.5) * l.rx * 1.2, py = l.y + (r() - 0.5) * l.ry * 1.1; x.beginPath(); x.arc(px, py, 10 + r() * 10, Math.PI * 1.1, Math.PI * 1.9); x.stroke(); }
    paper(x, E(l.x + l.rx * 0.3, l.y + l.ry * 0.2, 14, 10, 0.3), '#63b84d', { border: 1.5, sx: 1, sy: 2 });
  }
  for (const rd of G.map.reeds) if (hit(rd, 16)) {
    x.strokeStyle = '#4f8a3c'; x.lineWidth = 2; x.beginPath();
    for (let k = -1; k <= 1; k++) { x.moveTo(rd.x + k * 4, rd.y + 6); x.lineTo(rd.x + k * 5, rd.y - 10); }
    x.stroke();
    x.fillStyle = '#8a5a2b'; for (let k = -1; k <= 1; k += 2) { x.beginPath(); x.ellipse(rd.x + k * 5, rd.y - 11, 1.8, 4, 0, 0, 7); x.fill(); }
  }
  G.map.teleports.forEach((tp) => { if (hit(tp, 40)) { paper(x, C(tp.x, tp.y, tp.r + 8), '#c9a6ff', { border: 3.5, sx: 2, sy: 4 }); paper(x, C(tp.x, tp.y, tp.r - 2), '#7b4fd0', { border: 0, shadow: false }); } });
  for (const w of G.map.walls) if (hit({ x: w.x + w.w / 2, y: w.y + w.h / 2 }, Math.max(w.w, w.h))) drawWall(x, w);
  G.map.rocks.forEach((k, i) => { if (hit(k, k.r + 12)) { paper(x, P(blobPts(k.x, k.y, k.r * 0.95, 9, i * 31 + 5, 0.1)), '#bdb6c6', { border: 3, sx: 3, sy: 5 }); paper(x, P([[k.x - k.r * 0.5, k.y - k.r * 0.2], [k.x, k.y - k.r * 0.7], [k.x + k.r * 0.3, k.y - k.r * 0.1]]), '#d8d2e0', { border: 0, shadow: false, edge: false }); } });
  for (const ml of G.map.mills) if (hit(ml, ml.r + 20)) {
    paper(x, C(ml.x, ml.y, ml.r), '#c9c2b3', { border: 3.5, sx: 4, sy: 6 });
    const r = rng(Math.round(ml.x));
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, d = ml.r * (0.72 + r() * 0.12); paper(x, RR(ml.x + Math.cos(a) * d - 7, ml.y + Math.sin(a) * d - 5, 14, 10, 3), '#ddd6c8', { border: 1.2, shadow: false }); }
    paper(x, C(ml.x, ml.y, ml.r * 0.52), '#efe2c6', { border: 3, sx: 3, sy: 5 });
    paper(x, C(ml.x, ml.y, ml.r * 0.3), '#c9744a', { border: 2, shadow: false });
  }
  G.map.mountains.forEach((m, i) => { if (hit(m, m.r + 30)) drawMountain(x, m, i); });
  G.map.trees.forEach((t) => { if (hit(t, t.r + 20)) drawTree(x, t); });
  return c;
}
function ensureScale() {
  const base = Math.max(0.5, Math.min(innerWidth / 1100, innerHeight / 700)) * settings.zoom;
  const s = Math.min(2.5, Math.max(0.6, base * effDpr() * (settings.quality === 'niedrig' ? 0.8 : 1)));
  if (Math.abs(s - G.tileScale) > 0.01) { G.tileScale = s; G.tiles.clear(); G.sprites.clear(); }
}
function drawTiles(vx0, vy0, vx1, vy1) {
  const now = performance.now();
  let budget = G.tiles.size < 4 ? 40 : 5; // beim Start alles Sichtbare, danach höchstens 5 pro Bild
  const tx0 = Math.floor(vx0 / TILE), tx1 = Math.floor(vx1 / TILE), ty0 = Math.floor(vy0 / TILE), ty1 = Math.floor(vy1 / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const key = tx + ',' + ty;
    let t = G.tiles.get(key);
    if (!t && budget > 0) { t = { c: buildTile(tx, ty) }; G.tiles.set(key, t); budget--; }
    if (!t) continue;
    t.used = now;
    ctx.drawImage(t.c, tx * TILE - 1, ty * TILE - 1, TILE + 2, TILE + 2);
  }
  // vorausschauend: einen Ring um den Bildschirm vorzeichnen (höchstens 1 pro Bild)
  if (budget > 3) {
    outer: for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
      const key = tx + ',' + ty;
      if (!G.tiles.has(key)) { G.tiles.set(key, { c: buildTile(tx, ty), used: now }); break outer; }
    }
  }
  if (G.tiles.size > 220) for (const [k, t] of G.tiles) if (now - t.used > 15000) G.tiles.delete(k);
}

// ---------- Büsche (Papier, gecacht) ----------
function bushSprite(b, i) {
  const key = 'b' + i;
  let sp = G.sprites.get(key);
  if (sp) return sp;
  const s = G.tileScale, R = b.r + 22, c = document.createElement('canvas');
  c.width = c.height = Math.ceil(R * 2 * s);
  const x = c.getContext('2d'); x.scale(s, s); x.translate(R, R);
  const r = rng(i * 97 + 13), n = 5 + (i % 2), sh = [], inner = [];
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + r() * 0.5, d = b.r * (0.38 + r() * 0.12), rr = b.r * (0.42 + r() * 0.1); sh.push(C(Math.cos(a) * d, Math.sin(a) * d, rr)); inner.push([Math.cos(a) * d * 0.9 - rr * 0.2, Math.sin(a) * d * 0.9 - rr * 0.25, rr * 0.55]); }
  sh.push(C(0, 0, b.r * 0.55));
  paper(x, sh, '#4fa847', { border: 4, sx: 3, sy: 5, shadowCol: 'rgba(30,60,20,.3)' });
  paper(x, inner.map(([px, py, pr]) => C(px, py, pr)), '#66c058', { border: 0, shadow: false, edge: false });
  x.fillStyle = 'rgba(255,255,255,.35)';
  for (const [px, py, pr] of inner) { x.beginPath(); x.ellipse(px - pr * 0.3, py - pr * 0.35, pr * 0.35, pr * 0.2, -0.6, 0, 7); x.fill(); }
  x.strokeStyle = '#3a7f33'; x.lineWidth = 1.6; x.lineCap = 'round'; x.beginPath();
  for (let k = 0; k < 7; k++) { const ax = (r() - 0.5) * b.r * 1.1, ay = (r() - 0.5) * b.r * 1.1; x.moveTo(ax - 4, ay + 2); x.quadraticCurveTo(ax, ay - 4, ax + 4, ay + 2); }
  x.stroke();
  sp = { c, R }; G.sprites.set(key, sp);
  return sp;
}
function drawBush(b, i, nowMs, friendly, occupied) {
  const sp = bushSprite(b, i), t = nowMs / 1000;
  const sway = occupied ? Math.sin(t * 9 + i) * 0.04 : Math.sin(t * 1.3 + i) * 0.01;
  const pulse = 1 + (occupied ? Math.sin(t * 7 + i) * 0.015 : 0);
  ctx.save();
  ctx.translate(b.x, b.y); ctx.rotate(sway); ctx.scale(pulse, pulse);
  if (friendly) ctx.globalAlpha = 0.5;
  ctx.drawImage(sp.c, -sp.R, -sp.R, sp.R * 2, sp.R * 2);
  ctx.restore();
}

// ---------- Karte (klein & groß, gleich gezeichnet) ----------
function buildMiniStatic() {
  const S = 900, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), k = S / G.map.size;
  x.fillStyle = SKY; x.fillRect(0, 0, S, S);
  x.save(); x.scale(k, k);
  paper(x, P(G.plat.map(([a, b]) => [a, b + 60])), '#a8845a', { border: 10, shadow: false });
  paper(x, P(G.plat), '#8fd36f', { border: 12, shadow: false });
  for (const l of G.map.lakes) paper(x, E(l.x, l.y, l.rx, l.ry), '#5fb5ea', { border: 8, shadow: false, edge: false });
  for (const b of G.map.bushes) { x.fillStyle = '#4fa847'; x.beginPath(); x.arc(b.x, b.y, b.r, 0, 7); x.fill(); }
  for (const t of G.map.trees) { x.fillStyle = '#3f8f3a'; x.beginPath(); x.arc(t.x, t.y, t.r, 0, 7); x.fill(); }
  for (const w of G.map.walls) { x.fillStyle = w.k === 'house' ? (w.roof || '#e8594f') : w.k === 'crate' ? '#c98f4f' : '#9a93a8'; x.fillRect(w.x, w.y, w.w, w.h); }
  for (const r of G.map.rocks) { x.fillStyle = '#9a93a8'; x.beginPath(); x.arc(r.x, r.y, r.r, 0, 7); x.fill(); }
  for (const m of G.map.mountains) { paper(x, C(m.x, m.y, m.r), '#a8957f', { border: 8, shadow: false, edge: false }); paper(x, C(m.x, m.y - 10, m.r * 0.35), '#ffffff', { border: 0, shadow: false, edge: false }); }
  for (const tp of G.map.teleports) paper(x, C(tp.x, tp.y, 40), '#9a6cff', { border: 8, shadow: false, edge: false });
  x.restore();
  G.miniStatic = c;
}
function drawMapView(x, W, s, bus, big) {
  const k = W / G.map.size;
  x.drawImage(G.miniStatic, 0, 0, W, W);
  if (big) {
    x.font = `700 ${Math.round(W / 46)}px Fredoka, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    for (const p of G.map.pois) { x.lineWidth = 5; x.strokeStyle = '#fff'; x.strokeText(p.name, p.x * k, p.y * k); x.fillStyle = INK; x.fillText(p.name, p.x * k, p.y * k); }
  }
  const z = s.z;
  x.save();
  x.beginPath(); x.rect(0, 0, W, W); x.arc(z.x * k, z.y * k, Math.max(0, z.r * k), 0, Math.PI * 2, true);
  x.fillStyle = 'rgba(138,63,208,.32)'; x.fill('evenodd');
  x.strokeStyle = '#ffffff'; x.lineWidth = big ? 5 : 3.5; x.beginPath(); x.arc(z.x * k, z.y * k, Math.max(0, z.r * k), 0, 7); x.stroke();
  x.strokeStyle = '#8a3fd0'; x.lineWidth = big ? 2.5 : 1.8; x.stroke();
  if (z.st !== 'done' && z.tr > 0) { x.setLineDash(big ? [10, 7] : [5, 4]); x.strokeStyle = '#ffffff'; x.lineWidth = big ? 3 : 2; x.beginPath(); x.arc(z.tx * k, z.ty * k, z.tr * k, 0, 7); x.stroke(); x.setLineDash([]); }
  x.restore();
  if (bus && G.bus) {
    x.save(); x.setLineDash(big ? [10, 7] : [5, 4]); x.strokeStyle = INK; x.lineWidth = big ? 2.5 : 1.5;
    x.beginPath(); x.moveTo(G.bus.x0 * k, G.bus.y0 * k); x.lineTo(G.bus.x1 * k, G.bus.y1 * k); x.stroke(); x.restore();
    paper(x, C(bus.x * k, bus.y * k, big ? 9 : 6), '#4f8ff0', { border: 2, shadow: false });
  }
  if (s.rad) for (const [rx, ry] of s.rad) paper(x, C(rx * k, ry * k, big ? 7 : 4.5), '#ff4a3a', { border: 2, shadow: false });
  if (big) x.font = '600 16px Fredoka, sans-serif';
  for (const [id, mx, my, alive] of s.mates) {
    if (!alive || id === me.pid) continue;
    paper(x, C(mx * k, my * k, big ? 7 : 4.5), '#63d07a', { border: 2, shadow: false });
    if (big) { x.fillStyle = INK; x.textAlign = 'center'; x.fillText(nameOf(id), mx * k, my * k - 14); }
  }
  const fx = G.cam.x * k, fy = G.cam.y * k, sc = big ? 1.6 : 1;
  x.save(); x.translate(fx, fy); x.rotate(G.aim); x.scale(sc, sc);
  paper(x, P([[9, 0], [-6, -6], [-3, 0], [-6, 6]]), '#ffcf3f', { border: 2, shadow: false });
  x.restore();
  if (big) { x.fillStyle = INK; x.font = '700 22px Fredoka, sans-serif'; x.textAlign = 'left'; x.fillText(`Karte  ·  ${keyName(settings.keys.map)} zum Schließen`, 16, 30); }
}
function drawMini(s, bus) { const { w } = fitCanvas(mini, mctx); if (G.miniStatic) drawMapView(mctx, w, s, bus, false); }
function drawBigMap(s, bus) { const c = $('bigmap'), x = c.getContext('2d'); const { w } = fitCanvas(c, x); if (G.miniStatic) drawMapView(x, w, s, bus, true); }

// ---------- Eigener Panzer: sofort reagieren ----------
function predictMe(dt, s) {
  const L = G.newMe;
  if (!L || !s.me.alive || s.me.ph !== 0) { G.pred = null; return null; }
  if (!G.pred) G.pred = { x: L.x, y: L.y };
  const Pp = G.pred;
  const { dx, dy } = readMove(), len = Math.hypot(dx, dy);
  const mt = s.tanks.find(t => t.i === me.pid) || {};
  if (len > 0) {
    let sp = SPEED * (s.me.bk ? 0.6 : 1) * (mt.tb ? 1.6 : 1) * (mt.emp ? 0.5 : 1) * (prof.cheats && prof.cheats.speed ? 1.8 : 1);
    if (inLake(Pp.x, Pp.y)) sp *= LAKE_SLOW;
    Pp.x += dx / len * sp * dt; Pp.y += dy / len * sp * dt;
    for (const list of [G.map.mountains, G.map.rocks, G.map.trees, G.map.mills]) for (const o of list) {
      const ex = Pp.x - o.x, ey = Pp.y - o.y, d = Math.hypot(ex, ey), min = o.r + TR;
      if (d < min && d > 0.001) { Pp.x = o.x + ex / d * min; Pp.y = o.y + ey / d * min; }
    }
    for (const w of G.map.walls) {
      const cx = clamp(Pp.x, w.x, w.x + w.w), cy = clamp(Pp.y, w.y, w.y + w.h), ex = Pp.x - cx, ey = Pp.y - cy, d = Math.hypot(ex, ey);
      if (d < TR && d > 0.001) { Pp.x = cx + ex / d * TR; Pp.y = cy + ey / d * TR; }
    }
  }
  let tx = L.x, ty = L.y;
  if (G.oldMe && L.ts > G.oldMe.ts) { const vdt = (L.ts - G.oldMe.ts) / 1000; tx += (L.x - G.oldMe.x) / vdt * 0.09; ty += (L.y - G.oldMe.y) / vdt * 0.09; }
  const ex = tx - Pp.x, ey = ty - Pp.y;
  if (Math.hypot(ex, ey) > 70) { Pp.x = L.x; Pp.y = L.y; } else { const c = Math.min(1, dt * 6); Pp.x += ex * c; Pp.y += ey * c; }
  return Pp;
}

// ---------- Kill-Finisher ----------
function spawnFinisher(fin, x, y, now) {
  G.effects.push({ k: 'boom', x, y, t0: now, life: 800, r: 46 });
  switch (fin) {
    case 'feuerwerk': for (let i = 0; i < 4; i++) G.effects.push({ k: 'firework', x: x + (Math.random() - 0.5) * 80, y, ty: y - 90 - Math.random() * 60, t0: now + i * 140, life: 1300, col: ['#ff6b5a', '#ffcf3f', '#4f8ff0', '#63d07a'][i] }); break;
    case 'geist': G.effects.push({ k: 'ghost', x, y, t0: now, life: 1800 }); break;
    case 'konfetti': burst(x, y, 50, ['#ff6b5a', '#ffcf3f', '#4f8ff0', '#9b6be0', '#63d07a'], { shape: 'chip', sp: 220, life: 1.6, up: -120, g: 160 }); break;
    case 'gewitter': G.effects.push({ k: 'storm', x, y, t0: now, life: 1300 }); break;
    case 'papierball': G.effects.push({ k: 'crumple', x, y, t0: now, life: 1500 }); break;
    case 'herzregen': burst(x, y, 18, ['#ff5c8a', '#ff9ab0'], { shape: 'heart', sp: 80, life: 1.8, up: -60, g: -20, s: 1.4 }); break;
    case 'sternschnuppe': G.effects.push({ k: 'star', x, y, t0: now, life: 1200 }); break;
    default: burst(x, y, 14, ['#ffcf3f', '#ff8a4c', '#ffffff'], { shape: 'star', sp: 160, life: 0.8, g: 60 });
  }
}

// ---------- Kampfbus & Fallschirm ----------
function drawChute(x, y, sc, color, seed, t) {
  const cy = y - 46 * sc, R = 36 * sc, sway = Math.sin(t * 2 + seed) * 0.08;
  ctx.save(); ctx.translate(x, y); ctx.rotate(sway); ctx.translate(-x, -y);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.beginPath();
  for (const ox of [-0.9, -0.35, 0.35, 0.9]) { ctx.moveTo(x + ox * R, cy + 2); ctx.lineTo(x + ox * 10 * sc, y - 8 * sc); }
  ctx.stroke();
  const pts = [];
  for (let i = 0; i <= 16; i++) { const a = Math.PI + i / 16 * Math.PI; pts.push([x + Math.cos(a) * R, cy + Math.sin(a) * R * 0.75]); }
  for (let i = 1; i < 6; i++) pts.push([x + R - i * (2 * R / 6), cy + (i % 2 ? 5 : 0)]);
  paper(ctx, P(pts), '#ffffff', { border: 3, sx: 3, sy: 5 });
  ctx.save(); pathOf(ctx, [P(pts)]); ctx.clip();
  ctx.fillStyle = color; for (let i = 0; i < 6; i += 2) ctx.fillRect(x - R + i * (2 * R / 6), cy - R, 2 * R / 6, R + 6);
  ctx.restore();
  ctx.restore();
}
function drawBus(bus, t, inBus) {
  const r = G.bus, a = Math.atan2(r.y1 - r.y0, r.x1 - r.x0);
  ctx.save(); ctx.setLineDash([26, 18]); ctx.lineDashOffset = -t * 40;
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(bus.x, bus.y); ctx.lineTo(r.x1, r.y1); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(bus.x, bus.y);
  const bz = 0.55 / G.cam.z; ctx.scale(bz, bz);
  ctx.fillStyle = 'rgba(40,28,60,.14)'; ctx.beginPath(); ctx.ellipse(120, 140, 90, 50, a, 0, 7); ctx.fill();
  ctx.rotate(a); ctx.scale(1.6, 1.6);
  paper(ctx, RR(-62, -26, 124, 52, 12), '#4f8ff0', { border: 4 });
  for (let i = 0; i < 5; i++) { paper(ctx, RR(-50 + i * 22, -20, 14, 10, 3), '#e6f3ff', { border: 1.5, shadow: false }); paper(ctx, RR(-50 + i * 22, 10, 14, 10, 3), '#e6f3ff', { border: 1.5, shadow: false }); }
  paper(ctx, RR(46, -22, 14, 44, 5), '#cfe3ff', { border: 2, shadow: false });
  const balloon = C(-4, 0, 44);
  paper(ctx, balloon, '#ffcf3f', { border: 4.5, sx: 5, sy: 8 });
  ctx.save(); pathOf(ctx, [balloon]); ctx.clip();
  ctx.fillStyle = '#ff6b5a'; for (let i = -3; i <= 3; i += 2) ctx.fillRect(-4 + i * 12 - 6, -50, 12, 100);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(-18, -16, 12, 7, -0.6, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(-66, 0); ctx.rotate(t * 25);
  paper(ctx, [E(0, 9, 3, 9), E(0, -9, 3, 9)], '#3a3046', { border: 1.5, shadow: false });
  ctx.restore();
  ctx.restore();
  const fs = Math.round(30 / G.cam.z);
  ctx.font = `700 ${fs}px Fredoka, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 7 / G.cam.z; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round';
  const label = inBus ? 'DU BIST IM KAMPFBUS' : 'KAMPFBUS';
  ctx.strokeText(label, bus.x, bus.y - 120 / G.cam.z); ctx.fillStyle = INK; ctx.fillText(label, bus.x, bus.y - 120 / G.cam.z);
}

// ---------- Hitmarker ----------
function drawHitmarker(nowMs) {
  const kt = nowMs - (G.killMark || 0), ht = nowMs - (G.hitMark || 0);
  const kill = kt < 380, hit = ht < 200;
  if (!kill && !hit) return;
  const p = kill ? kt / 380 : ht / 200, pop = kill ? 1.5 - 0.3 * p : 1.25 - 0.25 * p;
  const r0 = 7 * pop, r1 = (kill ? 20 : 15) * pop;
  ctx.save(); ctx.globalAlpha = 1 - p * p; ctx.lineCap = 'round';
  for (const [w, col] of [[6.5, 'rgba(58,48,70,.85)'], [3.2, kill ? '#ff3b2f' : '#ffffff']]) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
    for (const [a, b] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { ctx.moveTo(gm.x + a * r0 * 0.707, gm.y + b * r0 * 0.707); ctx.lineTo(gm.x + a * r1 * 0.707, gm.y + b * r1 * 0.707); }
    ctx.stroke();
  }
  ctx.restore();
}

// ================= Hauptzeichnung =================
function drawGame(nowMs) {
  const dt = Math.min(0.05, (nowMs - G.lastFrame) / 1000); G.lastFrame = nowMs;
  G.frame++; G.fps.n++;
  if (nowMs - G.fps.t > 500) { setText('fps', `${Math.round(G.fps.n * 1000 / (nowMs - G.fps.t))} FPS`); G.fps.n = 0; G.fps.t = nowMs; }
  const { w, h } = fitCanvas(cv, ctx, effDpr());
  ctx.fillStyle = SKY; ctx.fillRect(0, 0, w, h);
  if (!G.map || !G.snaps.length || G.offset == null) return;
  ensureScale();

  const want = clamp(40 + G.jit * 3, DELAY_MIN, DELAY_MAX);
  G.delay += (want - G.delay) * Math.min(1, dt * 0.8);
  const rt = nowMs - G.offset - G.delay;
  for (const s of G.snaps) if (s.ts > G.lastProcTs && s.ts <= rt) { processSnap(s, rt - s.ts > 500); G.lastProcTs = s.ts; if (G.cur !== s) G.prevCur = G.cur; G.cur = s; }
  if (!G.cur) { G.cur = G.snaps[0]; processSnap(G.cur, false); G.lastProcTs = G.cur.ts; }
  while (G.snaps.length > 2 && G.snaps[1].ts <= rt) G.snaps.shift();
  const s = G.cur;
  const nxt = G.snaps.find(o => o.ts > s.ts);
  const k = nxt ? clamp((rt - s.ts) / (nxt.ts - s.ts), 0, 1) : 0;
  const nT = nxt ? new Map(nxt.tanks.map(t => [t.i, t])) : null;
  const pv = !nxt && G.prevCur ? new Map(G.prevCur.tanks.map(t => [t.i, t])) : null;
  const ek = pv ? clamp((rt - s.ts) / Math.max(10, s.ts - G.prevCur.ts), 0, 1) : 0;
  const tanks = s.tanks.map(tk => {
    const n = nT && nT.get(tk.i);
    if (!n && pv) { const p = pv.get(tk.i); if (p && Math.hypot(p.x - tk.x, p.y - tk.y) < 40) return { ...tk, x: tk.x + (tk.x - p.x) * ek, y: tk.y + (tk.y - p.y) * ek }; }
    if (!n || Math.hypot(n.x - tk.x, n.y - tk.y) > 80) return { ...tk };
    return { ...tk, x: lerp(tk.x, n.x, k), y: lerp(tk.y, n.y, k), a: lerpAng(tk.a, n.a, k), ta: lerpAng(tk.ta, n.ta, k), hp: n.hp, alt: n.alt != null && tk.alt != null ? lerp(tk.alt, n.alt, k) : tk.alt };
  });
  const nB = nxt ? new Map(nxt.b.map(b => [b[0], b])) : null;
  const bullets = s.b.map(b => { const n = nB && nB.get(b[0]); return n ? [lerp(b[1], n[1], k), lerp(b[2], n[2], k), b[3], b[4], b[5]] : [b[1], b[2], b[3], b[4], b[5]]; });

  const latest = G.snaps[G.snaps.length - 1];
  const Pp = predictMe(dt, latest);
  const myT = tanks.find(t => t.i === me.pid);
  if (Pp && myT) { myT.x = Pp.x; myT.y = Pp.y; }

  let bus = null;
  if (s.bus) { bus = { ...s.bus }; if (nxt && nxt.bus) { bus.x = lerp(s.bus.x, nxt.bus.x, k); bus.y = lerp(s.bus.y, nxt.bus.y, k); } }
  const inBus = s.me.alive && s.me.ph === 1 && bus;
  const focus = tanks.find(t => t.i === s.f);
  const cam = G.cam, fp = inBus ? bus : focus;
  if (fp) {
    if (!cam.init) { cam.x = fp.x; cam.y = fp.y; cam.init = true; }
    const ff = (focus && focus === myT) || inBus ? 1 : Math.min(1, dt * 10);
    cam.x += (fp.x - cam.x) * ff; cam.y += (fp.y - cam.y) * ff;
  }
  const baseZ = Math.max(0.5, Math.min(w / 1100, h / 700)) * settings.zoom;
  const zt = inBus ? baseZ * 0.72 : baseZ / (1 + 0.35 * (focus ? focus.alt || 0 : 0));
  cam.z += (zt - cam.z) * Math.min(1, dt * 3);
  const z = cam.z;
  G.shake *= Math.pow(0.002, dt);
  const shk = settings.shake ? G.shake : 0, shx = (Math.random() - 0.5) * shk, shy = (Math.random() - 0.5) * shk;
  if (myT) { const wm = screenToWorld(gm.x, gm.y); G.aim = Math.atan2(wm.y - myT.y, wm.x - myT.x); myT.ta = G.aim; }

  const dpr = effDpr();
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z + shx), dpr * (h / 2 - cam.y * z + shy));
  const vx0 = cam.x - w / 2 / z - 60, vy0 = cam.y - h / 2 / z - 60, vx1 = cam.x + w / 2 / z + 60, vy1 = cam.y + h / 2 / z + 60;
  const vis = (o, r) => o.x + r > vx0 && o.x - r < vx1 && o.y + r > vy0 && o.y - r < vy1;
  const t = nowMs / 1000;

  drawTiles(vx0, vy0, vx1, vy1);
  G.map.teleports.forEach((tp, i) => {
    if (!vis(tp, 50)) return;
    const on = !s.tp || s.tp[i];
    ctx.save(); ctx.strokeStyle = on ? '#ffffff' : '#9a93a8'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let j = 0; j < 3; j++) { const a0 = t * (on ? 3 : 0.6) + j * 2.09; ctx.beginPath(); ctx.arc(tp.x, tp.y, tp.r * 0.55, a0, a0 + 1.3); ctx.stroke(); }
    if (!on) { ctx.strokeStyle = '#ff6b5a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(tp.x - 10, tp.y - 10); ctx.lineTo(tp.x + 10, tp.y + 10); ctx.moveTo(tp.x + 10, tp.y - 10); ctx.lineTo(tp.x - 10, tp.y + 10); ctx.stroke(); }
    ctx.restore();
  });
  for (const ml of G.map.mills) {
    if (!vis(ml, 120)) continue;
    ctx.save(); ctx.translate(ml.x, ml.y); ctx.rotate(t * 0.8);
    for (let j = 0; j < 4; j++) { ctx.rotate(Math.PI / 2); paper(ctx, RR(6, -8, ml.r * 0.92, 16, 5), j % 2 ? '#fff6e0' : '#ffe1b0', { border: 3, sx: 5, sy: 8 }); }
    paper(ctx, C(0, 0, 10), '#8a5a2b', { border: 2.5, shadow: false });
    ctx.restore();
  }
  if (s.mn) for (const [, mx, my, armed, own] of s.mn) {
    if (!vis({ x: mx, y: my }, 20)) continue;
    const pts = []; for (let j = 0; j < 12; j++) { const a = j / 12 * Math.PI * 2, r = j % 2 ? 8 : 12; pts.push([mx + Math.cos(a) * r, my + Math.sin(a) * r]); }
    paper(ctx, P(pts), own ? '#6d6680' : '#4a4556', { border: 2, sx: 1.5, sy: 2.5 });
    paper(ctx, C(mx, my, 3.5), armed && Math.sin(t * 8) > 0 ? '#ff3b2f' : '#ffcf3f', { border: 0, shadow: false });
  }
  const occ = new Set(s.occ), friendlyBush = new Set();
  for (const tk of tanks) {
    if (!vis(tk, 50) || tk.ph === 2) continue;
    const mine = teamOf(tk.i) === G.myTeam;
    const bi = bushIdx(tk.x, tk.y);
    if (bi >= 0 && mine) friendlyBush.add(bi);
    const alpha = tk.inv ? (mine ? 0.35 : 0.2) : 1;
    if (tk.tb) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); for (let j = -1; j <= 1; j++) { const bx = tk.x - Math.cos(tk.a) * 26 - Math.sin(tk.a) * j * 10, by = tk.y - Math.sin(tk.a) * 26 + Math.cos(tk.a) * j * 10; ctx.moveTo(bx, by); ctx.lineTo(bx - Math.cos(tk.a) * 22, by - Math.sin(tk.a) * 22); } ctx.stroke(); }
    const wet = inLake(tk.x, tk.y);
    drawTank(ctx, tk.x, tk.y + (wet ? Math.sin(t * 3 + tk.x) * 1.2 : 0), tk.a, tk.ta, equipOf(tk.i), hashStr(tk.i), { scale: wet ? 1.04 : 1.12, alpha, flash: (G.flash.get(tk.i) || 0) > nowMs, t, roll: (tk.x + tk.y) * 0.4 });
    if (wet) {
      ctx.save(); ctx.translate(tk.x, tk.y); ctx.rotate(tk.a);
      ctx.fillStyle = 'rgba(95,181,234,.62)'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 21, 0, 0, 7); ctx.fill(); // Wasser über den Ketten
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.4;
      for (let j = 0; j < 2; j++) { const p = (t * 0.8 + j * 0.5) % 1; ctx.globalAlpha = 1 - p; ctx.beginPath(); ctx.ellipse(tk.x, tk.y, 22 + p * 22, 18 + p * 18, 0, 0, 7); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    if (tk.bk || tk.dome) {
      const R = tk.dome ? 34 : 30;
      ctx.save();
      ctx.fillStyle = tk.dome ? 'rgba(138,184,255,.3)' : 'rgba(120,170,255,.18)'; ctx.beginPath(); ctx.arc(tk.x, tk.y, R, 0, 7); ctx.fill();
      ctx.lineCap = 'round';
      for (const [lw, col] of [[5, '#ffffff'], [2.5, '#4f8ff0']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; for (let j = 0; j < 6; j++) { const a0 = t * 4 + j * Math.PI / 3; ctx.beginPath(); ctx.arc(tk.x, tk.y, R, a0, a0 + 0.7); ctx.stroke(); } }
      ctx.restore();
    }
    if (tk.od) { ctx.save(); ctx.globalAlpha = 0.5 + Math.sin(t * 12) * 0.2; ctx.strokeStyle = '#ff6b2a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(tk.x, tk.y, 28 + Math.sin(t * 8) * 2, 0, 7); ctx.stroke(); ctx.restore(); if (Math.random() < dt * 20) burst(tk.x, tk.y, 1, ['#ff6b2a', '#ffe066'], { shape: 'star', sp: 40, life: 0.5, g: -30 }); }
    if (tk.emp && Math.random() < 0.5) { ctx.strokeStyle = '#7fd6ff'; ctx.lineWidth = 2; ctx.beginPath(); const a = Math.random() * 6.28; ctx.moveTo(tk.x + Math.cos(a) * 14, tk.y + Math.sin(a) * 14); ctx.lineTo(tk.x + Math.cos(a + 0.3) * 26, tk.y + Math.sin(a + 0.3) * 26); ctx.stroke(); }
    if (tk.hp < G.maxHp * 0.4 && Math.random() < dt * 8) burst(tk.x, tk.y, 1, ['#8d8798', '#b4aec0'], { shape: 'puff', sp: 15, life: 1.2, g: -25, s: 1.3 });
  }
  for (const [x, y, oi, a, kind] of bullets) {
    if (!vis({ x, y }, 50)) continue;
    const owner = G.roster[oi], mine = owner && owner.team === G.myTeam;
    drawTracer(ctx, owner ? owner.equip.tracer : 'standard', x, y, a || 0, mine ? TEAM_ME : TEAM_ENEMY, t, kind);
    if (kind === 1) { ctx.save(); ctx.translate(x, y); ctx.rotate(a); paper(ctx, [RR(-12, -5, 20, 10, 5), P([[8, -5], [16, 0], [8, 5]])], '#e8594f', { border: 2, sx: 2, sy: 3 }); ctx.restore(); }
    else {
      const sz = kind === 2 ? 0.6 : 1;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(x, y, 9 * sz, 6.5 * sz, a || 0, 0, 7); ctx.fill();
      ctx.fillStyle = mine ? TEAM_ME : TEAM_ENEMY; ctx.beginPath(); ctx.ellipse(x, y, 6.5 * sz, 4.2 * sz, a || 0, 0, 7); ctx.fill();
    }
  }
  G.bushes.forEach((b, i) => {
    if (b.hp <= 0 || !vis(b, b.r + 25)) return;
    const o = occ.has(i);
    drawBush(b, i, nowMs, friendlyBush.has(i), o);
    if (o && Math.random() < dt * 10) {
      const a = Math.random() * 6.28, d = Math.random() * b.r * 0.7;
      G.particles.push({ x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 0.8 + Math.random() * 0.4, t: 0, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 6, col: LEAF[Math.floor(Math.random() * 3)], shape: 'leaf', g: 25, s: 1 });
    }
  });
  if (s.smk) for (const [sx, sy, sr, left] of s.smk) {
    if (!vis({ x: sx, y: sy }, sr + 30)) continue;
    ctx.save(); ctx.globalAlpha = Math.min(1, left / 1.2) * 0.92;
    const sh = []; for (let j = 0; j < 7; j++) { const a = j / 7 * 6.28 + t * 0.2, d = sr * 0.45; sh.push(C(sx + Math.cos(a) * d, sy + Math.sin(a) * d, sr * 0.55)); }
    sh.push(C(sx, sy, sr * 0.6));
    paper(ctx, sh, '#e9e4ef', { border: 4, sx: 4, sy: 6, edge: false });
    ctx.restore();
  }
  // Wallhack: Eckenbox um jeden Gegner (auch durch Büsche/Nebel)
  for (const tk of tanks) if (tk.wh && vis(tk, 60)) {
    ctx.save();
    if (tk.hid) { ctx.globalAlpha = 0.5; drawTank(ctx, tk.x, tk.y, tk.a, tk.ta, equipOf(tk.i), hashStr(tk.i), { scale: 1.12, t, noHat: true }); ctx.globalAlpha = 1; }
    const R = 30 + Math.sin(t * 6) * 2, L = 11; ctx.lineCap = 'round';
    for (const [lw, col] of [[6, '#ffffff'], [3, '#ff3b2f']]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(tk.x + sx * R, tk.y + sy * (R - L)); ctx.lineTo(tk.x + sx * R, tk.y + sy * R); ctx.lineTo(tk.x + sx * (R - L), tk.y + sy * R); }
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const tk of tanks) {
    if (!vis(tk, 50) || tk.i === me.pid || tk.ph === 2 || (tk.inv && teamOf(tk.i) !== G.myTeam)) continue;
    const mine = teamOf(tk.i) === G.myTeam, y = tk.y - 34;
    ctx.font = '600 14px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.lineJoin = 'round'; ctx.strokeText(nameOf(tk.i), tk.x, y - 7);
    ctx.fillStyle = mine ? '#2f8a3a' : INK; ctx.fillText(nameOf(tk.i), tk.x, y - 7);
    paper(ctx, RR(tk.x - 22, y - 3, 44, 8, 4), '#ffffff', { border: 1.5, sx: 1, sy: 2, edge: false });
    ctx.fillStyle = mine ? '#63d07a' : '#ff6b5a'; pathOf(ctx, [RR(tk.x - 21, y - 2, Math.max(1, 42 * clamp(tk.hp / G.maxHp, 0, 1)), 6, 3)]); ctx.fill();
  }
  for (const tk of tanks) {
    if (tk.ph !== 2 || !vis(tk, 140)) continue;
    const alt = tk.alt || 0, sc = 1.12 * (1 + 0.7 * alt);
    ctx.fillStyle = 'rgba(40,28,60,.14)'; ctx.beginPath(); ctx.ellipse(tk.x + 60 * alt, tk.y + 70 * alt, 23, 19, 0, 0, 7); ctx.fill();
    drawTank(ctx, tk.x, tk.y, tk.a, tk.ta, equipOf(tk.i), hashStr(tk.i), { scale: sc, t });
    drawChute(tk.x, tk.y, sc, skinOf(equipOf(tk.i).skin).color, hashStr(tk.i), t);
    if (tk.i !== me.pid) { ctx.font = '600 15px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(nameOf(tk.i), tk.x, tk.y - 74 * sc); ctx.fillStyle = INK; ctx.fillText(nameOf(tk.i), tk.x, tk.y - 74 * sc); }
  }
  if (s.st) for (const [ax, ay, left] of s.st) {
    if (!vis({ x: ax, y: ay }, 130)) continue;
    const p = clamp(1 - left / 1.5, 0, 1);
    ctx.save(); ctx.strokeStyle = '#ff3b2f'; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t * 40;
    ctx.beginPath(); ctx.arc(ax, ay, 110, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,59,47,${0.12 + p * 0.2})`; ctx.beginPath(); ctx.arc(ax, ay, 110 * p, 0, 7); ctx.fill();
    ctx.restore();
  }
  G.particles = G.particles.filter(p => (p.t += dt) < p.life);
  if (G.particles.length > 600) G.particles.splice(0, G.particles.length - 600);
  for (const p of G.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy = p.vy * 0.94 + p.g * dt; p.rot += (p.vr || 5) * dt;
    if (!vis(p, 10)) continue;
    ctx.save(); ctx.globalAlpha = 1 - p.t / p.life; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(p.s, p.s);
    switch (p.shape) {
      case 'puff': ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(0, 0, 5 + p.t * 8, 0, 7); ctx.fill(); break;
      case 'chip': ctx.fillStyle = p.col; ctx.fillRect(-4, -2, 8, 4); break;
      case 'plus': ctx.fillStyle = p.col; ctx.fillRect(-4, -1.5, 8, 3); ctx.fillRect(-1.5, -4, 3, 8); break;
      case 'heart': paper(ctx, B([[0, 5], [-5, 0], [-3.5, -3.5], [0, -1.2], [3.5, -3.5], [5, 0]]), p.col, { border: 1, shadow: false, edge: false }); break;
      case 'star': { ctx.fillStyle = p.col; ctx.beginPath(); for (let j = 0; j < 10; j++) { const aa = j * Math.PI / 5, rr = j % 2 ? 1.6 : 4.5; ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); } ctx.fill(); break; }
      default: ctx.fillStyle = p.col; ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.4, 0, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(40,80,30,.5)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.restore();
  }
  G.effects = G.effects.filter(e => nowMs - e.t0 < e.life);
  for (const e of G.effects) {
    if (nowMs < e.t0 || !vis(e, 200)) continue;
    const p = (nowMs - e.t0) / e.life;
    ctx.save(); ctx.globalAlpha = Math.max(0, 1 - p);
    switch (e.k) {
      case 'shot': {
        ctx.translate(e.x, e.y); ctx.rotate(e.a); const sc = e.big ? 1.6 : 1;
        const pts = []; for (let j = 0; j < 10; j++) { const aa = j * Math.PI / 5, rr = (j % 2 ? 4 : 11) * sc * (1 - p * 0.5); pts.push([Math.cos(aa) * rr + 6, Math.sin(aa) * rr]); }
        paper(ctx, P(pts), '#ffe066', { border: 2, shadow: false, edge: false });
        break;
      }
      case 'boom': {
        const R = (e.r || 46) * (0.5 + p * 0.9);
        const pts = []; for (let j = 0; j < 16; j++) { const aa = j * Math.PI / 8 + e.x, rr = j % 2 ? R * 0.55 : R; pts.push([e.x + Math.cos(aa) * rr, e.y + Math.sin(aa) * rr]); }
        paper(ctx, P(pts), '#ffcf3f', { border: 4, sx: 4, sy: 6 });
        paper(ctx, P(pts.map(([px, py]) => [e.x + (px - e.x) * 0.55, e.y + (py - e.y) * 0.55])), '#ff8a4c', { border: 0, shadow: false, edge: false });
        break;
      }
      case 'ring': ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.3 + p * e.r, 0, 7); ctx.stroke(); ctx.strokeStyle = e.col; ctx.lineWidth = 3.5; ctx.stroke(); break;
      case 'spark': ctx.strokeStyle = e.col; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); for (let j = 0; j < 6; j++) { const a = j * 1.05; ctx.moveTo(e.x + Math.cos(a) * 4, e.y + Math.sin(a) * 4); ctx.lineTo(e.x + Math.cos(a) * (8 + p * 14), e.y + Math.sin(a) * (8 + p * 14)); } ctx.stroke(); break;
      case 'dust': for (let j = 0; j < 12; j++) { const a = j / 12 * 6.28; paper(ctx, C(e.x + Math.cos(a) * (16 + p * 36), e.y + Math.sin(a) * (16 + p * 30), 6 * (1 - p) + 2), '#efe6d6', { border: 1.5, shadow: false, edge: false }); } break;
      case 'fall': ctx.globalAlpha = 1 - p * p; drawTank(ctx, e.x + Math.sin(p * 8) * 6, e.y + p * p * 260, e.a + p * 6, e.a + p * 7, e.equip, e.seed, { scale: 1.12 * (1 - p * 0.8), t }); break;
      case 'blink': ctx.setLineDash([8, 8]); ctx.strokeStyle = '#b98cff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x2, e.y2); ctx.stroke(); break;
      case 'emp': ctx.strokeStyle = '#7fd6ff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(e.x, e.y, 30 + p * 290, 0, 7); ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke(); break;
      case 'radar': ctx.strokeStyle = '#63d07a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(e.x, e.y, 40 + p * 600, 0, 7); ctx.stroke(); break;
      case 'firework': {
        const up = Math.min(1, p * 2.4), fy = lerp(e.y, e.ty, up);
        if (up < 1) paper(ctx, C(e.x, fy, 4), e.col, { border: 1.5, shadow: false });
        else { const q = (p - 0.42) / 0.58; for (let j = 0; j < 12; j++) { const a = j / 12 * 6.28; const pts = []; for (let m = 0; m < 10; m++) { const aa = m * Math.PI / 5, rr = m % 2 ? 2 : 5; pts.push([e.x + Math.cos(a) * q * 60 + Math.cos(aa) * rr, fy + Math.sin(a) * q * 60 + q * q * 30 + Math.sin(aa) * rr]); } paper(ctx, P(pts), e.col, { border: 1.2, shadow: false, edge: false }); } }
        break;
      }
      case 'ghost': {
        const gy = e.y - p * 120, gx = e.x + Math.sin(p * 10) * 10;
        paper(ctx, B([[gx - 16, gy + 18], [gx - 18, gy - 6], [gx, gy - 22], [gx + 18, gy - 6], [gx + 16, gy + 18], [gx + 8, gy + 12], [gx, gy + 18], [gx - 8, gy + 12]]), '#ffffff', { border: 2 });
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(gx - 6, gy - 4, 2.6, 0, 7); ctx.arc(gx + 6, gy - 4, 2.6, 0, 7); ctx.fill();
        break;
      }
      case 'storm':
        paper(ctx, [C(e.x - 22, e.y - 140, 22), C(e.x + 6, e.y - 150, 28), C(e.x + 30, e.y - 136, 20)], '#8a8fa8', { border: 3 });
        if (p < 0.6 && Math.floor(p * 20) % 2 === 0) paper(ctx, P([[e.x - 4, e.y - 120], [e.x + 10, e.y - 120], [e.x + 2, e.y - 60], [e.x + 14, e.y - 60], [e.x - 6, e.y], [e.x - 2, e.y - 50], [e.x - 14, e.y - 50]]), '#ffe066', { border: 3, shadow: false });
        break;
      case 'crumple': {
        const sc = 1 - p * 0.7;
        paper(ctx, B(blobPts(e.x + p * 40, e.y, 22 * sc, 9, Math.floor(p * 6), 0.4)), '#f6eedb', { border: 2.5 });
        ctx.strokeStyle = 'rgba(58,48,70,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); for (let j = 0; j < 4; j++) { ctx.moveTo(e.x + p * 40 - 8 + j * 4, e.y - 8); ctx.lineTo(e.x + p * 40 - 4 + j * 3, e.y + 8); } ctx.stroke();
        break;
      }
      case 'star': {
        const q = Math.min(1, p * 2.5), sx = lerp(e.x - 220, e.x, q), sy = lerp(e.y - 260, e.y, q);
        ctx.strokeStyle = 'rgba(255,224,102,.7)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx - 60, sy - 70); ctx.lineTo(sx, sy); ctx.stroke();
        const pts = []; for (let j = 0; j < 10; j++) { const aa = -Math.PI / 2 + j * Math.PI / 5, rr = j % 2 ? 8 : 20; pts.push([sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr]); }
        paper(ctx, P(pts), '#ffd84a', { border: 3 });
        if (q >= 1 && !e.burst) { e.burst = true; burst(e.x, e.y, 20, ['#ffd84a', '#ffffff'], { shape: 'star', sp: 160, life: 0.9, g: 40 }); }
        break;
      }
    }
    ctx.restore();
  }
  G.floats = G.floats.filter(f => nowMs - f.t0 < 900);
  for (const f of G.floats) {
    const p = (nowMs - f.t0) / 900;
    ctx.save(); ctx.globalAlpha = 1 - p * p;
    ctx.font = `700 ${Math.round(22 + (1 - p) * 8)}px Fredoka, sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = '#ffffff'; ctx.lineJoin = 'round'; ctx.strokeText(f.text, f.x, f.y - p * 36);
    ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y - p * 36);
    ctx.restore();
  }
  const zn = s.z;
  ctx.save();
  ctx.beginPath(); ctx.rect(vx0 - 100, vy0 - 100, vx1 - vx0 + 200, vy1 - vy0 + 200);
  ctx.arc(zn.x, zn.y, Math.max(0, zn.r), 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(138,63,208,.22)'; ctx.fill('evenodd');
  ctx.clip('evenodd');
  ctx.strokeStyle = 'rgba(120,50,190,.25)'; ctx.lineWidth = 3; ctx.beginPath();
  const hs = vy1 - vy0, off = (t * 20) % 30;
  for (let x = Math.floor((vx0 - hs) / 30) * 30 + off; x < vx1; x += 30) { ctx.moveTo(x, vy1); ctx.lineTo(x + hs, vy0); }
  ctx.stroke();
  ctx.restore();
  if (zn.r > 0) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(zn.x, zn.y, zn.r, 0, 7); ctx.stroke(); ctx.strokeStyle = '#8a3fd0'; ctx.lineWidth = 4.5; ctx.stroke(); }
  if (zn.st !== 'done' && zn.tr > 0) {
    ctx.save(); ctx.setLineDash([18, 14]); ctx.lineDashOffset = -t * 20;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(zn.tx, zn.ty, zn.tr, 0, 7); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  if (bus) drawBus(bus, t, inBus);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lm = latest.me, free = $('game').classList.contains('free');
  if (s.me.alive && lm.ph === 0 && !free) {
    if (lm.rl > 0) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(gm.x, gm.y, 21 * settings.crossSize, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - lm.rl / (lm.fcd || G.fireCd))); ctx.stroke(); }
    drawCrosshair(ctx, gm.x, gm.y);
  } else if (!free && s.me.alive) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(gm.x, gm.y, 4, 0, 7); ctx.fill(); }
  drawHitmarker(nowMs);
  if (G.lowHp && nowMs - G.lastBeat > 900) { G.lastBeat = nowMs; sfx.heart(); }
  if (G.confetti.length) {
    for (const c of G.confetti) { c.y += c.vy * dt; c.x += c.vx * dt; c.r += dt * 4; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.r); ctx.fillStyle = c.col; ctx.fillRect(-5, -2.5, 10, 5); ctx.restore(); }
    G.confetti = G.confetti.filter(c => c.y < h + 20);
  }
  if (G.frame % 3 === 0) drawMini(s, bus);
  if (G.bigMap) drawBigMap(s, bus);
}

// ================= Hauptschleife =================
const frameChan = new MessageChannel();
let nextFrameAt = 0, loopPending = false;
function render(time) {
  if (screen === 'login') drawLoginBg(time);
  else if (screen === 'lobby' && tab === 'stage') drawStage(time);
  else if (screen === 'game' && inGame) drawGame(time);
}
function scheduleFrame() {
  if (loopPending) return;
  loopPending = true;
  const lim = settings.fpsLimit;
  const fast = screen === 'game' && inGame && !document.hidden && lim >= 0;
  if (!fast) { requestAnimationFrame(tick); return; }
  if (lim === 0) { frameChan.port2.postMessage(0); return; }
  const wait = nextFrameAt - performance.now();
  if (wait > 2) setTimeout(tick, wait - 1.5); else frameChan.port2.postMessage(0);
}
function tick() {
  loopPending = false;
  const now = performance.now(), lim = settings.fpsLimit;
  if (screen === 'game' && inGame && lim > 0 && now < nextFrameAt - 0.3) { scheduleFrame(); return; }
  if (lim > 0) nextFrameAt = Math.max(nextFrameAt + 1000 / lim, now);
  try { render(now); } catch (e) { console.error(e); }
  scheduleFrame();
}
frameChan.port1.onmessage = tick;
document.addEventListener('visibilitychange', () => { loopPending = false; scheduleFrame(); });
scheduleFrame();
renderTop();
if (!local.name) showLogin(); else { show('login'); $('loginMsg').textContent = 'Verbinde ...'; }
connect();
