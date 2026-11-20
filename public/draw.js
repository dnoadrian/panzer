// PANZER – Papier-Look (wie Paper Mario): Papierausschnitte mit weißem Rand und Schatten
'use strict';
const INK = '#3a3046';
const PAPER = '#f6eedb';
const SHADOW = 'rgba(40,28,60,.22)';

// ---------- Grundformen ----------
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 4294967296; };
}
function hashStr(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mixHex(a, b, k) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((A >> sh) & 255) + (((B >> sh) & 255) - ((A >> sh) & 255)) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
const lighten = (hex, f) => mixHex(hex, '#ffffff', f);
const darken = (hex, f) => mixHex(hex, '#000000', f);

const C = (x, y, r) => ({ c: [x, y, r] });
const E = (x, y, rx, ry, rot = 0) => ({ e: [x, y, rx, ry, rot] });
const P = (pts) => ({ p: pts });
const RR = (x, y, w, h, r) => ({ rr: [x, y, w, h, r] });
const B = (pts) => ({ b: pts }); // weiche Form durch Punkte
function addShape(ctx, s) {
  if (s.c) { ctx.moveTo(s.c[0] + s.c[2], s.c[1]); ctx.arc(s.c[0], s.c[1], s.c[2], 0, Math.PI * 2); }
  else if (s.e) { const [x, y, rx, ry, rot] = s.e; ctx.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
  else if (s.rr) {
    const [x, y, w, h, r0] = s.rr, r = Math.min(r0, w / 2, h / 2);
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  } else if (s.p) { const p = s.p; ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
  else if (s.b) {
    const p = s.b, n = p.length;
    const mid = (i) => [(p[i % n][0] + p[(i + 1) % n][0]) / 2, (p[i % n][1] + p[(i + 1) % n][1]) / 2];
    let m = mid(n - 1); ctx.moveTo(m[0], m[1]);
    for (let i = 0; i < n; i++) { m = mid(i); ctx.quadraticCurveTo(p[i][0], p[i][1], m[0], m[1]); }
    ctx.closePath();
  }
}
function pathOf(ctx, shapes) { ctx.beginPath(); for (const s of shapes) addShape(ctx, s); }
// Papierausschnitt: Schatten, weißer Rand, Farbe, feine Kante
function paper(ctx, shapes, fill, o = {}) {
  if (!Array.isArray(shapes)) shapes = [shapes];
  const border = o.border == null ? 3.5 : o.border;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (o.shadow !== false) {
    const sx = o.sx == null ? 3 : o.sx, sy = o.sy == null ? 4.5 : o.sy;
    ctx.save(); ctx.translate(sx, sy);
    pathOf(ctx, shapes); ctx.fillStyle = o.shadowCol || SHADOW; ctx.fill();
    if (border) { ctx.lineWidth = border * 2; ctx.strokeStyle = o.shadowCol || SHADOW; ctx.stroke(); }
    ctx.restore();
  }
  pathOf(ctx, shapes);
  if (border) { ctx.lineWidth = border * 2; ctx.strokeStyle = o.borderCol || '#ffffff'; ctx.stroke(); }
  ctx.fillStyle = fill; ctx.fill();
  if (o.edge !== false) { ctx.lineWidth = o.edgeW || 1.2; ctx.strokeStyle = o.edgeCol || 'rgba(58,48,70,.28)'; ctx.stroke(); }
}
function blobPts(x, y, r, n, seed, wob = 0.12) {
  const rr = rng(seed + 11), out = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const R = r * (1 + (rr() - 0.5) * wob * 2); out.push([x + Math.cos(a) * R, y + Math.sin(a) * R]); }
  return out;
}
// feine Papierfaser-Textur als Muster
let _fiber = null;
function fiberPattern(ctx) {
  if (_fiber) return _fiber;
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const x = c.getContext('2d'), r = rng(77);
  for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.5)' : 'rgba(60,40,30,.35)'; x.fillRect(r() * 160, r() * 160, 1 + r() * 1.5, 1); }
  x.strokeStyle = 'rgba(80,60,40,.18)'; x.lineWidth = 0.6;
  for (let i = 0; i < 60; i++) { const sx = r() * 160, sy = r() * 160, a = r() * 6.28; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * 9, sy + Math.sin(a) * 9); x.stroke(); }
  _fiber = ctx.createPattern(c, 'repeat');
  return _fiber;
}

// ---------- Katalog-Kurzzugriffe ----------
const itemOf = (id) => CAT.ITEM_BY_ID[id] || CAT.ITEM_BY_ID.rot;
const skinOf = (id) => { const it = CAT.ITEM_BY_ID[id]; return it && it.cat === 'skin' ? it : CAT.ITEM_BY_ID.rot; };

// ---------- Panzer-Muster ----------
function drawPattern(ctx, skin, t) {
  const c = skin.color, d = darken(c, 0.3), r = rng(hashStr(skin.id));
  ctx.fillStyle = d; ctx.strokeStyle = d; ctx.lineWidth = 2; ctx.lineCap = 'round';
  switch (skin.pat) {
    case 'dots': for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(-10 + (i % 3) * 10, -6 + Math.floor(i / 3) * 6, 1.8, 0, 7); ctx.fill(); } break;
    case 'stripes': ctx.lineWidth = 3; ctx.beginPath(); for (let k = -10; k <= 10; k += 7) { ctx.moveTo(k, -12); ctx.lineTo(k, 12); } ctx.stroke(); break;
    case 'camo': for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? d : darken(c, 0.15); ctx.beginPath(); ctx.ellipse(-12 + r() * 24, -8 + r() * 16, 3 + r() * 4, 2 + r() * 3, r() * 3, 0, 7); ctx.fill(); } break;
    case 'zebra': ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); for (let k = -14; k <= 14; k += 6) { ctx.moveTo(k, -12); ctx.quadraticCurveTo(k + 3, 0, k - 1, 12); } ctx.stroke(); break;
    case 'shine': ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-9, 10); ctx.lineTo(1, -10); ctx.moveTo(-2, 10); ctx.lineTo(8, -10); ctx.stroke(); break;
    case 'stars': ctx.fillStyle = '#ffe680'; for (let i = 0; i < 6; i++) { const x = -11 + r() * 22, y = -7 + r() * 14; ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr = k % 2 ? 0.8 : 2.2; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.fill(); } break;
    case 'zigzag': ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(-14, 0); for (let k = -14; k <= 14; k += 4) ctx.lineTo(k, (k / 4) % 2 ? -5 : 5); ctx.stroke(); break;
    case 'tiger': ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); for (let k = -12; k <= 12; k += 6) { ctx.moveTo(k - 2, -11); ctx.quadraticCurveTo(k + 2, -5, k - 1, -2); ctx.moveTo(k + 1, 11); ctx.quadraticCurveTo(k - 2, 5, k + 1, 2); } ctx.stroke(); break;
    case 'galaxy': {
      const g = ctx.createLinearGradient(-15, -11, 15, 11); g.addColorStop(0, '#5a3fc0'); g.addColorStop(0.5, '#2b2560'); g.addColorStop(1, '#c04fb0');
      ctx.fillStyle = g; ctx.fillRect(-16, -12, 32, 24); ctx.fillStyle = '#fff';
      for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.arc(-13 + r() * 26, -9 + r() * 18, r() * 1.2 + 0.4, 0, 7); ctx.fill(); }
      break;
    }
    case 'candy': ctx.strokeStyle = '#e8402f'; ctx.lineWidth = 3.5; ctx.beginPath(); for (let k = -26; k < 20; k += 8) { ctx.moveTo(k, 12); ctx.lineTo(k + 18, -12); } ctx.stroke(); break;
    case 'pixel': for (let i = 0; i < 12; i++) { ctx.fillStyle = ['#2f7fe8', '#7fd6ff', '#1a4fa0'][i % 3]; ctx.fillRect(-15 + (i % 6) * 5, -10 + Math.floor(i / 6) * 10 + (i % 2) * 5, 5, 5); } break;
    case 'flames': { ctx.fillStyle = '#ff8a2a'; ctx.beginPath(); ctx.moveTo(-15, 11); for (let k = -15; k <= 15; k += 6) { ctx.lineTo(k + 3, -2 - r() * 7); ctx.lineTo(k + 6, 11); } ctx.fill(); ctx.fillStyle = '#ffd25c'; ctx.beginPath(); ctx.moveTo(-15, 11); for (let k = -15; k <= 15; k += 6) { ctx.lineTo(k + 3, 3 - r() * 4); ctx.lineTo(k + 6, 11); } ctx.fill(); break; }
    case 'rainbow': ['#e8402f', '#f2a03f', '#f7d34a', '#4fb85a', '#4f86e8', '#9b6be0'].forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(-16, -12 + i * 4, 32, 4.2); }); break;
    case 'chrome': { const g = ctx.createLinearGradient(-15, -11, 15, 11); g.addColorStop(0, '#f5f8fb'); g.addColorStop(0.45, '#9aa6b4'); g.addColorStop(0.55, '#e3e9ef'); g.addColorStop(1, '#7c8896'); ctx.fillStyle = g; ctx.fillRect(-16, -12, 32, 24); break; }
    case 'snowcamo': for (let i = 0; i < 7; i++) { ctx.fillStyle = ['#b8c8d6', '#8fa3b5', '#ffffff'][i % 3]; ctx.beginPath(); ctx.ellipse(-12 + r() * 24, -8 + r() * 16, 3 + r() * 4, 2 + r() * 3, r() * 3, 0, 7); ctx.fill(); } break;
  }
}

// ---------- Hüte / Spezial-Items (auf dem Turm, von oben) ----------
function drawHat(ctx, id, t) {
  switch (id) {
    case 'krone': {
      const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r = i % 2 ? 6 : 10; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      paper(ctx, P(pts), '#f7c843', { border: 2, sx: 2, sy: 3 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.fillStyle = ['#e8402f', '#4f86e8', '#4fb85a'][i % 3]; ctx.beginPath(); ctx.arc(Math.cos(a) * 8.5, Math.sin(a) * 8.5, 1.5, 0, 7); ctx.fill(); }
      break;
    }
    case 'partyhut':
      paper(ctx, C(0, 0, 8), '#ff6fae', { border: 2, sx: 2, sy: 3 });
      ctx.strokeStyle = '#ffe680'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5); } ctx.stroke();
      paper(ctx, C(0, 0, 3), '#ffffff', { border: 1, shadow: false });
      break;
    case 'kappe':
      paper(ctx, [C(0, 0, 8), E(8, 0, 6, 6.5)], '#e8402f', { border: 2, sx: 2, sy: 3 });
      paper(ctx, C(0, 0, 2), '#ffffff', { border: 0, shadow: false, edge: false });
      break;
    case 'zylinder':
      paper(ctx, C(0, 0, 10), '#2b2833', { border: 2, sx: 2, sy: 3 });
      paper(ctx, C(0, 0, 6.5), '#3d3a48', { border: 0, shadow: false });
      ctx.strokeStyle = '#e8402f'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, 7.2, 0, 7); ctx.stroke();
      break;
    case 'blume':
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t * 0.3; paper(ctx, C(Math.cos(a) * 5.5, Math.sin(a) * 5.5, 4), i % 2 ? '#ffffff' : '#ffd1e8', { border: 1.4, sx: 1.5, sy: 2 }); }
      paper(ctx, C(0, 0, 3.6), '#ffd25c', { border: 1.4, shadow: false });
      break;
    case 'hoerner':
      for (const s of [-1, 1]) paper(ctx, B([[-3, s * 4], [4, s * 7], [10, s * 13], [2, s * 9], [-4, s * 7]]), '#d9332a', { border: 1.6, sx: 2, sy: 3 });
      break;
    case 'heiligenschein': {
      const bob = Math.sin(t * 2.5) * 1.5;
      ctx.save(); ctx.translate(-4, -4 + bob);
      ctx.strokeStyle = 'rgba(255,230,120,.45)'; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(0, 0, 10, 7, 0, 0, 7); ctx.stroke();
      ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      break;
    }
    case 'kochmuetze':
      paper(ctx, [C(-3, -3, 5.5), C(3, -3, 5.5), C(-3, 3, 5.5), C(3, 3, 5.5), C(0, 0, 6)], '#ffffff', { border: 1.8, sx: 2, sy: 3, edgeCol: 'rgba(58,48,70,.35)' });
      break;
    case 'wikinger':
      for (const s of [-1, 1]) paper(ctx, B([[0, s * 6], [4, s * 11], [-2, s * 15], [-5, s * 10]]), '#fffaf0', { border: 1.6, sx: 2, sy: 3 });
      paper(ctx, C(0, 0, 8.5), '#9aa3ad', { border: 2, sx: 2, sy: 3 });
      ctx.strokeStyle = '#6b737d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
      break;
    case 'propeller':
      paper(ctx, C(0, 0, 7.5), '#4f86e8', { border: 2, sx: 2, sy: 3 });
      ctx.save(); ctx.rotate(t * 18);
      paper(ctx, [E(7, 0, 7, 2.2), E(-7, 0, 7, 2.2)], '#f7c843', { border: 1.2, shadow: false });
      ctx.restore();
      paper(ctx, C(0, 0, 2), '#e8402f', { border: 1, shadow: false });
      break;
    case 'sombrero':
      paper(ctx, C(0, 0, 15), '#e3b45c', { border: 2, sx: 2, sy: 3 });
      ctx.strokeStyle = '#c0402a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 11.5, 0, 7); ctx.stroke();
      paper(ctx, C(0, 0, 7), '#d19a3e', { border: 1.4, shadow: false });
      break;
  }
}

// ---------- Panzer ----------
// equip: {skin, hat}; opt: scale, alpha, flash, noHat, t
function drawTank(ctx, x, y, a, ta, equip, seed, opt = {}) {
  const skin = skinOf(equip && equip.skin);
  const t = opt.t || performance.now() / 1000;
  ctx.save();
  ctx.translate(x, y);
  if (opt.scale) ctx.scale(opt.scale, opt.scale);
  if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
  ctx.save(); ctx.rotate(a);
  const treads = [RR(-19, -17, 38, 10, 4.5), RR(-19, 7, 38, 10, 4.5)];
  const hull = RR(-15, -11.5, 30, 23, 6);
  // Schatten + weißer Rand für den ganzen Panzer
  paper(ctx, [...treads, hull], 'rgba(0,0,0,0)', { border: 3.5, sx: 3, sy: 4.5, edge: false });
  paper(ctx, treads, '#4a4556', { border: 0, shadow: false });
  ctx.strokeStyle = '#6d6680'; ctx.lineWidth = 1.6; ctx.beginPath();
  const roll = opt.roll || 0;
  for (let i = -16; i < 18; i += 5) { const xx = i + (roll % 5); ctx.moveTo(xx, -15.5); ctx.lineTo(xx, -8.5); ctx.moveTo(xx, 8.5); ctx.lineTo(xx, 15.5); }
  ctx.stroke();
  paper(ctx, hull, opt.flash ? '#ffffff' : skin.color, { border: 0, shadow: false });
  if (!opt.flash) { ctx.save(); pathOf(ctx, [hull]); ctx.clip(); drawPattern(ctx, skin, t); ctx.restore(); }
  ctx.fillStyle = 'rgba(255,255,255,.28)'; pathOf(ctx, [RR(7, -9.5, 6, 19, 3)]); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.18)'; for (const [rx, ry] of [[-11, -7.5], [-11, 7.5], [3, -7.5], [3, 7.5]]) { ctx.beginPath(); ctx.arc(rx, ry, 1.3, 0, 7); ctx.fill(); }
  ctx.restore();
  // Turm
  ctx.save(); ctx.rotate(ta);
  paper(ctx, [RR(4, -3.4, 25, 6.8, 3), RR(25, -4.6, 6, 9.2, 2)], '#4a4556', { border: 2.6, sx: 3, sy: 4.5 });
  paper(ctx, C(0, 0, 10), opt.flash ? '#ffffff' : lighten(skin.color, 0.22), { border: 2.6, sx: 2.5, sy: 3.5 });
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(-2.5, -2.5, 4.5, Math.PI * 0.95, Math.PI * 1.75); ctx.lineTo(-2.5, -2.5); ctx.fill();
  if (!opt.noHat && equip && equip.hat && equip.hat !== 'keiner') drawHat(ctx, equip.hat, t);
  ctx.restore();
  ctx.restore();
}

// ---------- Rang-Abzeichen ----------
function drawRankIcon(ctx, idx, x, y, size) {
  const R = CAT.RANKS[Math.max(0, Math.min(CAT.RANKS.length - 1, idx | 0))], T = CAT.RANK_TIERS[R.tier];
  ctx.save(); ctx.translate(x, y); const k = size / 100; ctx.scale(k, k);
  const o = { border: 5, sx: 4, sy: 6 };
  const shield = [[-34, -38], [34, -38], [36, 6], [0, 42], [-36, 6]];
  const inner = [[-23, -27], [23, -27], [24, 3], [0, 29], [-24, 3]];
  const star = (cx, cy, r1, r2, n = 5) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r2 : r1; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };
  switch (T.shape) {
    case 'shield': paper(ctx, P(shield), T.col, o); paper(ctx, P(inner), lighten(T.col, 0.35), { border: 0, shadow: false, edgeCol: T.dark }); break;
    case 'star': paper(ctx, P(shield), T.col, o); paper(ctx, P(inner), lighten(T.col, 0.4), { border: 0, shadow: false, edgeCol: T.dark }); paper(ctx, P(star(0, -2, 19, 8)), '#fff6c0', { border: 2.5, shadow: false }); break;
    case 'hex': {
      const hex = [], hin = [];
      for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; hex.push([Math.cos(a) * 42, Math.sin(a) * 42]); hin.push([Math.cos(a) * 28, Math.sin(a) * 28]); }
      paper(ctx, P(hex), T.col, o); paper(ctx, P(hin), lighten(T.col, 0.45), { border: 0, shadow: false, edgeCol: T.dark });
      paper(ctx, P([[0, -16], [12, 0], [0, 16], [-12, 0]]), '#ffffff', { border: 0, shadow: false });
      break;
    }
    case 'gem': {
      paper(ctx, P([[-38, -12], [-20, -36], [20, -36], [38, -12], [0, 42]]), T.col, o);
      ctx.strokeStyle = T.dark; ctx.lineWidth = 2.2; ctx.beginPath();
      ctx.moveTo(-38, -12); ctx.lineTo(38, -12); ctx.moveTo(-20, -36); ctx.lineTo(-10, -12); ctx.lineTo(0, 42); ctx.moveTo(20, -36); ctx.lineTo(10, -12); ctx.lineTo(0, 42); ctx.moveTo(-10, -12); ctx.lineTo(0, -36); ctx.lineTo(10, -12); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.moveTo(-22, -16); ctx.lineTo(-14, -30); ctx.lineTo(-8, -16); ctx.closePath(); ctx.fill();
      break;
    }
    case 'elite':
      paper(ctx, C(0, 0, 40), T.col, o);
      ctx.fillStyle = '#f7c843';
      for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + s * (0.5 + i * 0.42); ctx.beginPath(); ctx.ellipse(Math.cos(a) * 30, 4 + Math.sin(a) * 30, 7, 3.2, a + s * 0.8, 0, 7); ctx.fill(); }
      paper(ctx, P(star(0, -2, 17, 7)), '#f7c843', { border: 2.5, shadow: false });
      break;
    case 'wings':
      for (const s of [-1, 1]) paper(ctx, B([[s * 18, -18], [s * 52, -34], [s * 46, -16], [s * 56, -8], [s * 44, 2], [s * 48, 12], [s * 20, 14]]), '#ffffff', { border: 3, sx: 3, sy: 4 });
      paper(ctx, P([[-24, -36], [24, -36], [26, 4], [0, 38], [-26, 4]]), T.col, o);
      paper(ctx, P([[0, -26], [10, -6], [6, -8], [8, 12], [0, 24], [-8, 12], [-6, -8], [-10, -6]]), '#ffd25c', { border: 2, shadow: false });
      break;
    case 'burst':
      paper(ctx, P(star(0, 0, 46, 26, 8)), T.col, o);
      paper(ctx, C(0, 0, 19), '#ffffff', { border: 0, shadow: false });
      paper(ctx, P(star(0, 0, 13, 5, 4)), T.dark, { border: 0, shadow: false });
      break;
  }
  if (R.div) for (let i = 0; i < R.div; i++) {
    const cy = 47 + i * 9;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-12, cy - 4); ctx.lineTo(0, cy + 3); ctx.lineTo(12, cy - 4); ctx.stroke();
    ctx.strokeStyle = '#f2b705'; ctx.lineWidth = 4; ctx.stroke();
  }
  ctx.restore();
}

// ---------- Zahnrad-Münze ----------
function drawCoin(ctx, x, y, size) {
  ctx.save(); ctx.translate(x, y); const k = size / 40; ctx.scale(k, k);
  const pts = [];
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, r = (i % 2) ? 15 : 19; pts.push([Math.cos(a - 0.08) * r, Math.sin(a - 0.08) * r], [Math.cos(a + 0.08) * r, Math.sin(a + 0.08) * r]); }
  paper(ctx, P(pts), '#f2b705', { border: 2.5, sx: 2, sy: 3 });
  paper(ctx, C(0, 0, 11), '#ffd84a', { border: 0, shadow: false, edgeCol: '#b07d0a' });
  const st = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.2 : 7.5; st.push([Math.cos(a) * r, Math.sin(a) * r]); }
  paper(ctx, P(st), '#fff3b0', { border: 0, shadow: false, edgeCol: '#c08a10' });
  ctx.restore();
}

// ---------- Fähigkeits-Symbole ----------
function drawAbilityIcon(ctx, id, x, y, size, locked) {
  ctx.save(); ctx.translate(x, y); const k = size / 60; ctx.scale(k, k);
  const bg = locked ? '#c9c2d4' : '#ffffff';
  paper(ctx, C(0, 0, 27), bg, { border: 3, sx: 2.5, sy: 3.5 });
  const col = locked ? '#8d85a0' : null;
  const f = (c) => col || c;
  const o = { border: 2, shadow: false };
  switch (id) {
    case 'turbo': paper(ctx, P([[-4, -16], [10, -16], [2, -2], [11, -2], [-6, 18], [-1, 3], [-10, 3]]), f('#f7c843'), o); break;
    case 'repair': paper(ctx, [RR(-4.5, -15, 9, 30, 3), RR(-15, -4.5, 30, 9, 3)], f('#4fb85a'), o); break;
    case 'smoke': paper(ctx, [C(-8, 3, 9), C(4, -3, 11), C(10, 6, 8), C(-2, 8, 8)], f('#bdb7c9'), o); break;
    case 'mine': { const p = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 11 : 16; p.push([Math.cos(a) * r, Math.sin(a) * r]); } paper(ctx, P(p), f('#4a4556'), o); paper(ctx, C(0, 0, 4), f('#e8402f'), { border: 0, shadow: false }); break; }
    case 'sniper': ctx.strokeStyle = f('#3a3046'); ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.moveTo(-19, 0); ctx.lineTo(19, 0); ctx.moveTo(0, -19); ctx.lineTo(0, 19); ctx.stroke(); paper(ctx, C(0, 0, 3), f('#e8402f'), { border: 0, shadow: false }); break;
    case 'salvo': for (let i = -1; i <= 1; i++) paper(ctx, RR(-14, i * 9 - 3, 26, 6, 3), f('#f2a03f'), o); break;
    case 'dome': paper(ctx, B([[-17, 10], [-15, -8], [0, -18], [15, -8], [17, 10], [0, 14]]), f('#8ab8ff'), o); paper(ctx, E(-5, -6, 4, 6, -0.5), '#ffffff', { border: 0, shadow: false, edge: false }); break;
    case 'radar': ctx.strokeStyle = f('#4fb85a'); ctx.lineWidth = 3; for (const r of [6, 12, 18]) { ctx.beginPath(); ctx.arc(-6, 8, r, -1.3, 0.1); ctx.stroke(); } paper(ctx, C(-6, 8, 4), f('#3a3046'), { border: 0, shadow: false }); break;
    case 'blink': ctx.setLineDash([4, 4]); ctx.strokeStyle = f('#9b6be0'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-16, 8); ctx.lineTo(6, -6); ctx.stroke(); ctx.setLineDash([]); paper(ctx, P([[2, -14], [16, -12], [10, 1]]), f('#9b6be0'), o); break;
    case 'shotgun': ctx.strokeStyle = f('#e8402f'); ctx.lineWidth = 3; ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(-14, 0); ctx.lineTo(16, i * 7); } ctx.stroke(); break;
    case 'rocket': ctx.rotate(-0.7); paper(ctx, [RR(-14, -6, 24, 12, 6), P([[10, -6], [20, 0], [10, 6]])], f('#e8594f'), o); paper(ctx, P([[-14, -6], [-20, -11], [-12, 0], [-20, 11], [-14, 6]]), f('#f7c843'), { border: 1.5, shadow: false }); break;
    case 'magnet': paper(ctx, B([[-14, -14], [-6, -14], [-6, 4], [0, 8], [6, 4], [6, -14], [14, -14], [14, 6], [0, 18], [-14, 6]]), f('#e8402f'), o); paper(ctx, [RR(-14, -16, 8, 6, 1), RR(6, -16, 8, 6, 1)], '#e9eef3', { border: 0, shadow: false }); break;
    case 'invis': paper(ctx, E(0, 0, 17, 10), f('#ffffff'), o); paper(ctx, C(0, 0, 6), f('#3a3046'), { border: 0, shadow: false }); ctx.strokeStyle = f('#e8402f'); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-16, 14); ctx.lineTo(16, -14); ctx.stroke(); break;
    case 'ricochet': ctx.strokeStyle = f('#3bb8b0'); ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(-16, -12); ctx.lineTo(-2, 12); ctx.lineTo(14, -10); ctx.stroke(); paper(ctx, P([[9, -14], [18, -16], [16, -6]]), f('#3bb8b0'), { border: 1.5, shadow: false }); break;
    case 'vampire': paper(ctx, B([[0, 16], [-15, 0], [-12, -12], [-3, -12], [0, -6], [3, -12], [12, -12], [15, 0]]), f('#d9332a'), o); break;
    case 'artillery': ctx.strokeStyle = f('#e8402f'); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 6, 12, 0, 7); ctx.arc(0, 6, 5, 0, 7); ctx.stroke(); paper(ctx, P([[-4, -20], [4, -20], [4, -8], [0, -3], [-4, -8]]), f('#4a4556'), { border: 1.5, shadow: false }); break;
    case 'emp': ctx.strokeStyle = f('#4f86e8'); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.stroke(); paper(ctx, P([[-3, -12], [6, -12], [1, -2], [7, -2], [-5, 13], [-1, 2], [-7, 2]]), f('#f7c843'), { border: 1.5, shadow: false }); break;
    case 'overdrive': {
      const p = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r = i % 2 ? 10 : 19; p.push([Math.cos(a) * r, Math.sin(a) * r]); }
      paper(ctx, P(p), f('#ff6b2a'), o); paper(ctx, C(0, 0, 8), f('#ffe066'), { border: 0, shadow: false });
      paper(ctx, P([[-2, -6], [4, -6], [0, 0], [4, 0], [-3, 8], [-1, 2], [-4, 2]]), f('#3a3046'), { border: 0, shadow: false, edge: false });
      break;
    }
    case 'wallhack': paper(ctx, E(0, 0, 18, 11), f('#ffffff'), o); paper(ctx, C(0, 0, 7), f('#e8402f'), { border: 0, shadow: false }); ctx.strokeStyle = f('#3a3046'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.moveTo(-22, 0); ctx.lineTo(-12, 0); ctx.moveTo(12, 0); ctx.lineTo(22, 0); ctx.moveTo(0, -16); ctx.lineTo(0, -9); ctx.moveTo(0, 9); ctx.lineTo(0, 16); ctx.stroke(); break;
  }
  if (locked) { paper(ctx, [RR(-7, -2, 14, 11, 2)], '#6d6680', { border: 2, shadow: false }); ctx.strokeStyle = '#6d6680'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, -3, 4.5, Math.PI, 0); ctx.stroke(); }
  ctx.restore();
}

// Krone für den Party-Leiter
function drawCrown(ctx, x, y, s = 1) {
  const pts = [[-10, 6], [-10, -4], [-5, 1], [0, -8], [5, 1], [10, -4], [10, 6]].map(([a, b]) => [x + a * s, y + b * s]);
  paper(ctx, P(pts), '#f7c843', { border: 2, sx: 2, sy: 3 });
}

// Panzer-Leuchtspur: x,y = Kugel, a = Richtung, team = Teamfarbe
// Leuchtspuren: Band + Glühen + Partikel. Rein zeitbasiert (kein Zustand), damit es überall gleich aussieht.
function tracerRibbon(ctx, at, w, col, alpha, wave, t, len = 1, off = 0) {
  const n = 10, Lp = [], Rp = [];
  for (let i = 0; i <= n; i++) {
    const q = i / n, k = q * len, hw = w / 2 * Math.pow(1 - q, 0.75) + 0.2;
    const o = off * (1 - q * 0.35) + (wave ? Math.sin(t * 16 - k * 9) * wave * q : 0);
    Lp.push(at(k, o + hw)); Rp.push(at(k, o - hw));
  }
  ctx.globalAlpha = alpha; ctx.fillStyle = col; ctx.beginPath();
  ctx.moveTo(Lp[0][0], Lp[0][1]);
  for (const p of Lp) ctx.lineTo(p[0], p[1]);
  for (let i = Rp.length - 1; i >= 0; i--) ctx.lineTo(Rp[i][0], Rp[i][1]);
  ctx.closePath(); ctx.fill();
  const h = at(0, off); ctx.beginPath(); ctx.arc(h[0], h[1], w / 2, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
}
function tracerSparks(ctx, at, t, n, rate, spread, size, cols, shape, a) {
  for (let i = 0; i < n; i++) {
    const cyc = t * rate + i / n, k = cyc % 1, seed = Math.floor(cyc) * 7.13 + i * 12.9898;
    const o = Math.sin(seed) * spread * (0.3 + k), p = at(0.15 + k * 1.05, o), sz = size * (1 - k * 0.65);
    ctx.globalAlpha = Math.max(0, 1 - k); ctx.fillStyle = cols[i % cols.length]; ctx.strokeStyle = cols[(i + 1) % cols.length];
    switch (shape) {
      case 'dia': ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(a + t * 4 + i); ctx.beginPath(); ctx.moveTo(0, -sz * 1.4); ctx.lineTo(sz * 0.7, 0); ctx.lineTo(0, sz * 1.4); ctx.lineTo(-sz * 0.7, 0); ctx.closePath(); ctx.fill(); ctx.restore(); break;
      case 'ring': ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p[0], p[1], sz, 0, 7); ctx.fill(); ctx.stroke(); break;
      case 'twinkle': { const tw = sz * (0.6 + 0.4 * Math.sin(t * 20 + i * 2)); ctx.beginPath(); ctx.moveTo(p[0] - tw, p[1]); ctx.lineTo(p[0] - tw * 0.2, p[1] - tw * 0.2); ctx.lineTo(p[0], p[1] - tw); ctx.lineTo(p[0] + tw * 0.2, p[1] - tw * 0.2); ctx.lineTo(p[0] + tw, p[1]); ctx.lineTo(p[0] + tw * 0.2, p[1] + tw * 0.2); ctx.lineTo(p[0], p[1] + tw); ctx.lineTo(p[0] - tw * 0.2, p[1] + tw * 0.2); ctx.closePath(); ctx.fill(); break; }
      default: ctx.beginPath(); ctx.arc(p[0], p[1], sz, 0, 7); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function drawTracer(ctx, id, x, y, a, teamCol, t, kind) {
  const cx = Math.cos(a), cy = Math.sin(a), px = -cy, py = cx, L = kind === 1 ? 62 : 54;
  const at = (k, o = 0) => [x - cx * k * L + px * o, y - cy * k * L + py * o];
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (id) {
    case 'feuer':
      tracerRibbon(ctx, at, 15, '#ff7a1f', 0.22, 2.5, t);
      tracerRibbon(ctx, at, 10, '#ff5a1f', 0.95, 2.6, t, 0.9);
      tracerRibbon(ctx, at, 6, '#ffb52e', 1, 1.8, t, 0.7);
      tracerRibbon(ctx, at, 2.6, '#fff4c8', 1, 0, t, 0.4);
      tracerSparks(ctx, at, t, 7, 2.4, 9, 2, ['#ffd25c', '#ff8a2a', '#ff5a1f'], 'dot', a);
      break;
    case 'eis':
      tracerRibbon(ctx, at, 13, '#bfefff', 0.4, 0, t);
      tracerRibbon(ctx, at, 7, '#5ac8fa', 0.95, 0, t, 0.9);
      tracerRibbon(ctx, at, 2.6, '#ffffff', 1, 0, t, 0.6);
      tracerSparks(ctx, at, t, 6, 1.7, 9, 3.2, ['#ffffff', '#a8e6ff', '#5ac8fa'], 'dia', a);
      tracerSparks(ctx, at, t + 0.33, 3, 1.1, 12, 3, ['#ffffff'], 'twinkle', a);
      break;
    case 'gift':
      tracerRibbon(ctx, at, 12, '#3fbf3a', 0.25, 3, t);
      tracerRibbon(ctx, at, 7, '#62d43a', 0.95, 2.8, t, 0.9);
      tracerRibbon(ctx, at, 2.5, '#e4ff8a', 1, 1.2, t, 0.5);
      tracerSparks(ctx, at, t, 6, 1.4, 11, 2.8, ['#d6ff6a', '#3fbf3a'], 'ring', a);
      break;
    case 'goldspur':
      tracerRibbon(ctx, at, 13, '#ffe27a', 0.3, 0, t);
      tracerRibbon(ctx, at, 7, '#f2b705', 1, 0, t, 0.95);
      tracerRibbon(ctx, at, 3, '#fff3b0', 1, 0, t, 0.65);
      tracerSparks(ctx, at, t, 7, 1.3, 11, 3.4, ['#ffffff', '#fff3b0', '#ffd84a'], 'twinkle', a);
      break;
    case 'regenbogen-spur': {
      const cols = ['#e8402f', '#f2a03f', '#f7d34a', '#4fb85a', '#4f86e8', '#9b6be0'];
      tracerRibbon(ctx, at, 16, '#ffffff', 0.35, 0, t);
      cols.forEach((col, i) => tracerRibbon(ctx, at, 3, col, 1, 1.6, t + i * 0.03, 1, (i - 2.5) * 2.2));
      tracerSparks(ctx, at, t, 5, 1.2, 12, 3, ['#ffffff', '#fff3b0'], 'twinkle', a);
      break;
    }
    case 'herzen': {
      tracerRibbon(ctx, at, 10, '#ff9ec0', 0.45, 1.5, t);
      tracerRibbon(ctx, at, 4, '#ff5c8a', 0.9, 1.2, t, 0.6);
      for (let i = 0; i < 4; i++) {
        const k = (t * 1.6 + i / 4) % 1, p = at(0.25 + k * 0.85, Math.sin(t * 5 + i * 2) * 5), sz = 5.2 * (1 - k * 0.55);
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(a + Math.PI / 2 + Math.sin(t * 6 + i) * 0.4); ctx.globalAlpha = 1 - k * 0.8;
        paper(ctx, B([[0, sz * 1.3], [-sz * 1.4, 0], [-sz, -sz], [0, -sz * 0.35], [sz, -sz], [sz * 1.4, 0]]), i % 2 ? '#ff5c8a' : '#ff8fb1', { border: 1.2, shadow: false });
        ctx.restore();
      }
      break;
    }
    case 'sterne': {
      tracerRibbon(ctx, at, 11, '#fff1a8', 0.45, 0, t);
      tracerRibbon(ctx, at, 4, '#ffd84a', 1, 0, t, 0.75);
      for (let i = 0; i < 4; i++) {
        const k = (t * 1.5 + i / 4) % 1, p = at(0.2 + k * 0.9, Math.sin(i * 2.4 + Math.floor(t * 1.5 + i / 4)) * 7), sz = 5.5 * (1 - k * 0.6);
        ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(t * 4 + i); ctx.globalAlpha = 1 - k * 0.8;
        const pts = []; for (let q = 0; q < 10; q++) { const aa = -Math.PI / 2 + q * Math.PI / 5, r = q % 2 ? sz * 0.45 : sz; pts.push([Math.cos(aa) * r, Math.sin(aa) * r]); }
        paper(ctx, P(pts), i % 2 ? '#ffd84a' : '#ffe98a', { border: 1.2, shadow: false });
        ctx.restore();
      }
      tracerSparks(ctx, at, t, 3, 2, 10, 2.4, ['#ffffff'], 'twinkle', a);
      break;
    }
    case 'blitz': {
      tracerRibbon(ctx, at, 14, '#7fd6ff', 0.25, 0, t);
      const r = rng(Math.floor(t * 24));
      for (const [lw, col] of [[6, 'rgba(127,214,255,.55)'], [3.4, '#ffffff'], [1.6, '#7fd6ff']]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x, y);
        const rr = rng(Math.floor(t * 24));
        for (let i = 1; i <= 6; i++) { const k = i / 6, j = (rr() - 0.5) * 12 * (0.4 + k); const p = at(k, j); ctx.lineTo(p[0], p[1]); }
        ctx.stroke();
      }
      // kleiner Seitenast
      const k0 = 0.3 + r() * 0.3, b0 = at(k0, 0), b1 = at(k0 + 0.25, (r() - 0.5) * 22);
      ctx.strokeStyle = '#bfeaff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke();
      tracerSparks(ctx, at, t, 4, 3, 10, 1.8, ['#ffffff', '#7fd6ff'], 'dot', a);
      break;
    }
    default:
      tracerRibbon(ctx, at, 10, teamCol, 0.25, 0, t);
      tracerRibbon(ctx, at, 5.5, teamCol, 0.9, 0, t, 0.95);
      tracerRibbon(ctx, at, 2.2, '#ffffff', 0.95, 0, t, 0.5);
  }
  ctx.restore();
}
