// PANZER – Einstellungen (Steuerung, Tasten, Ton, Grafik, Fadenkreuz, Konto)
'use strict';

const DEFAULT_SETTINGS = {
  sens: 1, lock: true, vol: 80, quality: 'hoch', zoom: 1, shake: true, fps: true, fpsLimit: 0,
  cross: '#3a3046', crossSize: 1,
  keys: { up: 'w', down: 's', left: 'a', right: 'd', fire: ' ', ability: 'f', block: 'shift', jump: ' ', spec: 'q', map: 'm' },
};
const KEY_LABELS = { up: 'Vorwärts / hoch', down: 'Rückwärts / runter', left: 'Links', right: 'Rechts', fire: 'Schießen', ability: 'Fähigkeit', block: 'Blocken', jump: 'Aus dem Bus springen', spec: 'Nächsten Spieler zuschauen', map: 'Große Karte' };
const CROSS_COLORS = ['#3a3046', '#ffffff', '#e8402f', '#2fbf4a', '#2f7fe8', '#f2b705', '#d040d0'];

function loadSettings() {
  const s = Object.assign({}, DEFAULT_SETTINGS, load('settings', {}));
  s.keys = Object.assign({}, DEFAULT_SETTINGS.keys, (load('settings', {}) || {}).keys || {});
  return s;
}
const settings = loadSettings();
function saveSettings() { save('settings', settings); applySettings(); }
function applySettings() {
  const f = document.getElementById('fps');
  if (f) f.style.display = settings.fps ? '' : 'none';
}
// Pixeldichte je nach Qualität
function effDpr() {
  const d = devicePixelRatio || 1;
  return settings.quality === 'hoch' ? d : settings.quality === 'mittel' ? Math.min(d, 1.25) : 1;
}
function keyName(k) {
  const map = { ' ': 'Leertaste', shift: 'Shift', control: 'Strg', alt: 'Alt', tab: 'Tab', enter: 'Enter', capslock: 'Feststell', arrowup: 'Pfeil hoch', arrowdown: 'Pfeil runter', arrowleft: 'Pfeil links', arrowright: 'Pfeil rechts', backspace: 'Rücktaste' };
  return map[k] || (k.length === 1 ? k.toUpperCase() : k);
}

// ---------- Panel ----------
let waitingKey = null;
function openSettings() {
  renderSettings();
  $('settings').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  for (const k in keys) keys[k] = false;
}
function closeSettings() {
  waitingKey = null;
  $('settings').classList.add('hidden');
  if (typeof updateCursor === 'function' && screen === 'game') updateCursor();
}
const settingsOpen = () => !$('settings').classList.contains('hidden');

function renderSettings() {
  $('sSens').value = settings.sens; $('sSensV').textContent = settings.sens.toFixed(2);
  $('sLock').checked = settings.lock;
  $('sSound').checked = local.sound;
  $('sVol').value = settings.vol; $('sVolV').textContent = settings.vol + '%';
  $('sQual').value = settings.quality;
  $('sZoom').value = settings.zoom; $('sZoomV').textContent = Math.round(settings.zoom * 100) + '%';
  $('sShake').checked = settings.shake;
  $('sFps').checked = settings.fps;
  $('sFpsLimit').value = String(settings.fpsLimit);
  $('sCrossSize').value = settings.crossSize;
  const sw = $('sCross'); sw.innerHTML = '';
  for (const c of CROSS_COLORS) {
    const b = document.createElement('button'); b.style.background = c; b.title = c;
    if (c === settings.cross) b.className = 'on';
    b.onclick = () => { settings.cross = c; saveSettings(); renderSettings(); sfx.click(); };
    sw.appendChild(b);
  }
  drawCrossPreview();
  const box = $('sKeys'); box.innerHTML = '';
  for (const id of Object.keys(KEY_LABELS)) {
    const row = el('div', 'srow');
    row.appendChild(el('span', '', KEY_LABELS[id]));
    const b = el('button', 'keybtn' + (waitingKey === id ? ' wait' : ''), waitingKey === id ? 'Taste drücken ...' : keyName(settings.keys[id]));
    b.onclick = () => { waitingKey = id; renderSettings(); };
    row.appendChild(b);
    box.appendChild(row);
  }
}
function drawCrossPreview() {
  const c = $('sCrossPrev'), x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = '#9fdc7a'; x.fillRect(0, 0, c.width, c.height);
  x.scale(2, 2);
  drawCrosshair(x, 24, 24, 0, false);
}
// Fadenkreuz (auch im Spiel benutzt)
function drawCrosshair(c2, x, y, reload, hitFlash) {
  const s = settings.crossSize, col = settings.cross;
  const outline = col === '#ffffff' ? '#2b2620' : '#ffffff';
  c2.lineCap = 'round';
  for (const [w, cc] of [[5, outline], [2.5, col]]) {
    c2.strokeStyle = cc; c2.lineWidth = w;
    c2.beginPath(); c2.arc(x, y, 11 * s, 0, 7); c2.stroke();
    c2.beginPath();
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { c2.moveTo(x + a * 6 * s, y + b * 6 * s); c2.lineTo(x + a * 17 * s, y + b * 17 * s); }
    c2.stroke();
  }
}

// Eingaben im Panel
$('sSens').oninput = (e) => { settings.sens = +e.target.value; $('sSensV').textContent = settings.sens.toFixed(2); saveSettings(); };
$('sLock').onchange = (e) => { settings.lock = e.target.checked; saveSettings(); };
$('sSound').onchange = (e) => { local.sound = e.target.checked; save('sound', local.sound); renderSoundBtn(); };
$('sVol').oninput = (e) => { settings.vol = +e.target.value; $('sVolV').textContent = settings.vol + '%'; saveSettings(); };
$('sVol').onchange = () => sfx.hit();
$('sQual').onchange = (e) => { settings.quality = e.target.value; saveSettings(); };
$('sZoom').oninput = (e) => { settings.zoom = +e.target.value; $('sZoomV').textContent = Math.round(settings.zoom * 100) + '%'; saveSettings(); };
$('sShake').onchange = (e) => { settings.shake = e.target.checked; saveSettings(); };
$('sFps').onchange = (e) => { settings.fps = e.target.checked; saveSettings(); };
$('sFpsLimit').onchange = (e) => { settings.fpsLimit = +e.target.value; saveSettings(); };
$('sCrossSize').oninput = (e) => { settings.crossSize = +e.target.value; saveSettings(); drawCrossPreview(); };
$('btnSetClose').onclick = closeSettings;
$('btnSetDone').onclick = () => { closeSettings(); sfx.click(); };
$('btnSetReset').onclick = () => {
  Object.assign(settings, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
  saveSettings(); renderSettings(); toast('Einstellungen zurückgesetzt');
};
$('btnDelete').onclick = () => {
  if (!confirm('Konto wirklich löschen? Name, Rang, Zahnräder, Freunde und Items sind danach weg.')) return;
  send({ t: 'deleteAccount' });
  for (const k of ['pid', 'name', 'rp', 'skin', 'friends', 'recent', 'tut', 'settings', 'xp', 'backup']) { try { localStorage.removeItem(KEY(k)); } catch { /* egal */ } }
  setTimeout(() => location.reload(), 300);
};
$('settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });

// Tasten neu belegen (fängt die Taste ab, bevor das Spiel sie sieht)
addEventListener('keydown', (e) => {
  if (!waitingKey) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const k = e.key.toLowerCase();
  if (k !== 'escape') {
    // gleiche Taste woanders? -> tauschen (Schießen und Abspringen dürfen sich eine Taste teilen)
    const shareOk = (a, b) => (a === 'fire' && b === 'jump') || (a === 'jump' && b === 'fire');
    for (const [id, v] of Object.entries(settings.keys)) {
      if (id !== waitingKey && v === k && !shareOk(id, waitingKey)) settings.keys[id] = settings.keys[waitingKey];
    }
    settings.keys[waitingKey] = k;
    saveSettings();
    if (typeof renderAbilities === 'function') renderAbilities();
  }
  waitingKey = null;
  renderSettings();
}, true);

// ---------- Spielmenü wie in Fortnite (Esc oder Knopf oben links) ----------
let leaveArmed = false;
const menuOpen = () => !$('gameMenu').classList.contains('hidden');
function openMenu() {
  if (document.pointerLockElement) document.exitPointerLock();
  for (const k in keys) keys[k] = false;
  gm.down = gm.rdown = false;
  leaveArmed = false;
  $('mLeave').textContent = 'SPIEL VERLASSEN';
  const alive = G.cur && G.cur.me.alive;
  $('mHint').textContent = alive ? 'Das Spiel läuft weiter, während das Menü offen ist.' : 'Esc schließt das Menü';
  $('gameMenu').classList.remove('hidden');
  $('game').classList.add('free');
}
function closeMenu() { $('gameMenu').classList.add('hidden'); updateCursor(); }
function updateCursor() { const dead = !G.cur || !G.cur.me.alive; $('game').classList.toggle('free', dead || menuOpen() || settingsOpen()); }
function leaveGame() {
  closeMenu();
  if (document.pointerLockElement) document.exitPointerLock();
  send({ t: 'toLobby' });
}
$('btnMenu').onclick = (e) => { e.stopPropagation(); sfx.click(); menuOpen() ? closeMenu() : openMenu(); };
$('mResume').onclick = () => { sfx.click(); closeMenu(); };
$('mSettings').onclick = () => { sfx.click(); closeMenu(); openSettings(); };
$('mFull').onclick = () => { sfx.click(); toggleFullscreen(); };
$('mLeave').onclick = () => {
  sfx.click();
  const alive = G.cur && G.cur.me.alive;
  if (alive && !leaveArmed) { leaveArmed = true; $('mLeave').textContent = 'WIRKLICH? (du scheidest aus)'; return; }
  leaveGame();
};
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || waitingKey) return;
  if (settingsOpen()) { closeSettings(); if (screen === 'game') openMenu(); }
  else if (screen === 'game') { menuOpen() ? closeMenu() : openMenu(); }
});

// Einstellungen-Tab in der Lobby
document.querySelector('.tab[data-tab="settings"]').onclick = () => { sfx.click(); openSettings(); };
applySettings();
