// PANZER – Kritzel-Zeichenhelfer, Skins und Symbole (wird von Lobby und Spiel benutzt)
'use strict';
const INK = '#2b2620', PAPER = '#f7f1e1', GRID = '#e8dfca';

const SKINS = [
  { id: 'rot', name: 'Klassik', color: '#e8594f', pat: 'hatch', lvl: 1 },
  { id: 'blau', name: 'Ozean', color: '#4f86e8', pat: 'hatch', lvl: 1 },
  { id: 'gruen', name: 'Wald', color: '#4fb85a', pat: 'hatch', lvl: 1 },
  { id: 'orange', name: 'Kürbis', color: '#e8a94f', pat: 'dots', lvl: 2 },
  { id: 'lila', name: 'Flieder', color: '#9b6be0', pat: 'stripes', lvl: 3 },
  { id: 'tuerkis', name: 'Lagune', color: '#3bb8b0', pat: 'dots', lvl: 4 },
  { id: 'grau', name: 'Stahl', color: '#8a8f98', pat: 'stripes', lvl: 5 },
  { id: 'pink', name: 'Kaugummi', color: '#ec6fae', pat: 'dots', lvl: 6 },
  { id: 'tarn', name: 'Tarnfleck', color: '#6f8a4a', pat: 'camo', lvl: 8 },
  { id: 'wueste', name: 'Wüste', color: '#d6b26a', pat: 'camo', lvl: 10 },
  { id: 'zebra', name: 'Zebra', color: '#efefef', pat: 'zebra', lvl: 13 },
  { id: 'gold', name: 'Gold', color: '#e6b422', pat: 'shine', lvl: 16 },
  { id: 'nacht', name: 'Nacht', color: '#3a3f58', pat: 'stars', lvl: 20 },
  { id: 'lava', name: 'Lava', color: '#d9472b', pat: 'zigzag', lvl: 25 },
];
const SKIN_BY_ID = Object.fromEntries(SKINS.map(s => [s.id, s]));
const skinOf = (id) => SKIN_BY_ID[id] || SKINS[0];

const PICKUPS = {
  R: { name: 'Reparatur', color: '#a8e6a1' },
  F: { name: 'Schnellfeuer', color: '#ffb4a8' },
  T: { name: 'Tempo', color: '#fff09a' },
  K: { name: 'Kanone +', color: '#cdb8ff' },
  D: { name: 'Doppelschuss', color: '#a8d8ff' },
};

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 4294967296; };
}
function hashStr(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function jit(pts, seed, amp) { const r = rng(seed); return pts.map(([x, y]) => [x + (r() - 0.5) * amp * 2, y + (r() - 0.5) * amp * 2]); }
function poly(ctx, pts, closed = true) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]);
  if (closed) ctx.closePath();
}
function sketchStroke(ctx, pts, seed, amp = 1.4, closed = true, width = 2.2, color = INK) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  poly(ctx, jit(pts, seed, amp), closed); ctx.stroke();
  ctx.lineWidth = width * 0.55; poly(ctx, jit(pts, seed + 99, amp * 1.3), closed); ctx.stroke();
}
function sketchFill(ctx, pts, seed, fill, amp = 1.4, width = 2.2, color = INK) {
  ctx.fillStyle = fill; poly(ctx, jit(pts, seed + 7, amp * 0.6)); ctx.fill();
  if (width > 0) sketchStroke(ctx, pts, seed, amp, true, width, color);
}
function circlePts(cx, cy, r, n, seed = 0, wobble = 0) {
  const rr = rng(seed + 1), out = [];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, R = r * (1 + (rr() - 0.5) * wobble); out.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
  return out;
}
function rectPts(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }
function hatchIn(ctx, clip, x0, y0, x1, y1, gap, color, seed, width = 1.2) {
  ctx.save(); poly(ctx, clip); ctx.clip();
  const r = rng(seed); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  const h = y1 - y0;
  for (let k = x0 - h; k < x1; k += gap) { ctx.moveTo(k + r() * 2, y1 + r() * 2); ctx.lineTo(k + h + r() * 2, y0 + r() * 2); }
  ctx.stroke(); ctx.restore();
}
function mix(hex, f, to = 255) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.round(c + (to - c) * f);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
const lighten = (hex, f) => mix(hex, f, 255);
const darken = (hex, f) => mix(hex, f, 0);

// Muster auf der Wanne
function drawPattern(ctx, skin, clip, seed) {
  const c = skin.color, d = darken(c, 0.35), r = rng(seed);
  ctx.save(); poly(ctx, clip); ctx.clip();
  ctx.strokeStyle = d; ctx.fillStyle = d; ctx.lineWidth = 1.3;
  switch (skin.pat) {
    case 'hatch': ctx.beginPath(); for (let k = -30; k < 20; k += 5) { ctx.moveTo(k, 10); ctx.lineTo(k + 20, -10); } ctx.stroke(); break;
    case 'stripes': ctx.lineWidth = 2.5; ctx.beginPath(); for (let k = -12; k <= 12; k += 7) { ctx.moveTo(k, -10); ctx.lineTo(k, 10); } ctx.stroke(); break;
    case 'dots': for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(-11 + (i % 3) * 11 + r() * 2, -6 + Math.floor(i / 3) * 6 + r() * 2, 1.6, 0, 7); ctx.fill(); } break;
    case 'camo': for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(-12 + r() * 24, -8 + r() * 16, 3 + r() * 4, 2 + r() * 3, r() * 3, 0, 7); ctx.fillStyle = i % 2 ? d : darken(c, 0.15); ctx.fill(); } break;
    case 'zebra': ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); for (let k = -14; k <= 14; k += 6) { ctx.moveTo(k, -10); ctx.quadraticCurveTo(k + 3, 0, k - 1, 10); } ctx.stroke(); break;
    case 'shine': ctx.strokeStyle = '#fff8d0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, 9); ctx.lineTo(2, -9); ctx.moveTo(-3, 9); ctx.lineTo(9, -9); ctx.stroke(); break;
    case 'stars': ctx.strokeStyle = '#f2e6a0'; ctx.lineWidth = 1.2; for (let i = 0; i < 6; i++) { const x = -11 + r() * 22, y = -7 + r() * 14; ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 2, y); ctx.moveTo(x, y - 2); ctx.lineTo(x, y + 2); ctx.stroke(); } break;
    case 'zigzag': ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, 0); for (let k = -14; k <= 14; k += 4) ctx.lineTo(k, (k / 4) % 2 ? -5 : 5); ctx.stroke(); break;
  }
  ctx.restore();
}

// Panzer: Mittelpunkt x,y; a = Wanne, ta = Turm. opt: alpha, scale, flash
function drawTank(ctx, x, y, a, ta, skinId, seed, opt = {}) {
  const skin = skinOf(skinId);
  ctx.save();
  ctx.globalAlpha = opt.alpha == null ? 1 : opt.alpha;
  ctx.translate(x, y);
  if (opt.scale) ctx.scale(opt.scale, opt.scale);
  ctx.save(); ctx.rotate(a);
  sketchFill(ctx, rectPts(-18, -15, 36, 8), seed + 1, '#5a5146', 1, 2);
  sketchFill(ctx, rectPts(-18, 7, 36, 8), seed + 2, '#5a5146', 1, 2);
  ctx.strokeStyle = '#d8cfbf'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = -15; i < 17; i += 5) { ctx.moveTo(i, -14); ctx.lineTo(i, -8); ctx.moveTo(i, 8); ctx.lineTo(i, 14); }
  ctx.stroke();
  const body = rectPts(-15, -10, 30, 20);
  ctx.fillStyle = opt.flash ? '#ffffff' : lighten(skin.color, 0.15);
  poly(ctx, jit(body, seed + 9, 0.6)); ctx.fill();
  if (!opt.flash) drawPattern(ctx, skin, body, seed + 4);
  sketchStroke(ctx, body, seed + 3, 1.1, true, 2.2);
  ctx.restore();
  ctx.save(); ctx.rotate(ta);
  const dbl = opt.double;
  if (dbl) {
    sketchFill(ctx, rectPts(4, -6, 22, 4.4), seed + 5, '#5a5146', 0.8, 1.8);
    sketchFill(ctx, rectPts(4, 1.6, 22, 4.4), seed + 15, '#5a5146', 0.8, 1.8);
  } else {
    sketchFill(ctx, rectPts(4, -2.8, 23 + (opt.cannon || 0) * 3, 5.6), seed + 5, '#5a5146', 0.8, 2);
  }
  sketchFill(ctx, circlePts(0, 0, 8.5, 10, seed + 6, 0.12), seed + 6, opt.flash ? '#fff' : lighten(skin.color, 0.5), 1, 2);
  ctx.restore();
  ctx.restore();
}

// Kisten-Symbole
function drawPickup(ctx, type, x, y, seed, s = 1) {
  const info = PICKUPS[type];
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  sketchFill(ctx, rectPts(-12, -12, 24, 24), seed, info.color, 1.2, 2.2);
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (type) {
    case 'R': ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); break;
    case 'F': for (const o of [-5, 0, 5]) { ctx.moveTo(o - 2, -6); ctx.lineTo(o + 2, 0); ctx.lineTo(o - 2, 6); } break;
    case 'T': ctx.moveTo(2, -8); ctx.lineTo(-4, 1); ctx.lineTo(2, 1); ctx.lineTo(-2, 8); break;
    case 'K': ctx.moveTo(-6, 3); ctx.lineTo(7, -4); ctx.stroke(); ctx.beginPath(); ctx.arc(-5, 3, 3.5, 0, 7); ctx.fill(); ctx.beginPath(); break;
    case 'D': ctx.moveTo(-6, -4); ctx.lineTo(6, -4); ctx.moveTo(-6, 4); ctx.lineTo(6, 4); ctx.moveTo(3, -7); ctx.lineTo(6, -4); ctx.lineTo(3, -1); ctx.moveTo(3, 1); ctx.lineTo(6, 4); ctx.lineTo(3, 7); break;
  }
  ctx.stroke();
  ctx.restore();
}

// Kleine Krone (Party-Leiter)
function drawCrown(ctx, x, y, s = 1) {
  const pts = [[-10, 6], [-10, -4], [-5, 1], [0, -8], [5, 1], [10, -4], [10, 6]].map(([a, b]) => [x + a * s, y + b * s]);
  sketchFill(ctx, pts, 77, '#f2c94c', 0.8, 2);
}
