// PANZER – Server: Webseite, Konten, Freunde, Party, Matchmaking, Shop, Admin
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const DB = require('./lib/db');
const CAT = require('./public/catalog.js');
const createEngine = require('./lib/match');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_USER = (process.env.ADMIN_USER || 'adrian').toLowerCase();
const ADMIN_PASS = process.env.ADMIN_PASS || '1234';
const MM_WAIT = +(process.env.MM_WAIT || 12);      // so lange wird auf weitere echte Spieler gewartet
const PARTY_MAX = 4;
const MODES = { solo: { size: 1, total: 10, name: 'Solo' }, duo: { size: 2, total: 10, name: 'Duo' }, squad: { size: 4, total: 12, name: 'Squad' } };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
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
const nowS = () => Date.now() / 1000;
const validPid = (p) => /^[a-z0-9]{8,40}$/.test(String(p));
function cleanName(n) {
  return String(n || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

const conns = new Set();
const online = new Map();   // pid -> conn
const parties = new Map();
let queue = [];             // { party, mode, fill, since }
let socialDirty = true;

function send(c, o) { if (c && c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); }
const sendPid = (pid, o) => send(online.get(pid), o);
function toast(c, msg) { send(c, { t: 'toast', msg }); }
const rankIdx = (u) => CAT.rankInfo(u.rp).idx;
// die drei besten Unreal-Spieler (für Wallhack)
let top3Cache = { at: 0, list: [] };
function top3() {
  if (Date.now() - top3Cache.at < 5000) return top3Cache.list;
  const list = DB.all().filter(u => rankIdx(u) >= CAT.RANKS.length - 1).sort((a, b) => b.rp - a.rp).slice(0, 3).map(u => u.pid);
  top3Cache = { at: Date.now(), list };
  return list;
}

// ================= Spiel-Engine =================
const engine = createEngine({
  send: sendPid,
  onEnter() { socialDirty = true; },
  onExit(pid) { sendPid(pid, { t: 'lobby' }); socialDirty = true; },
  onResult(pid, r) {
    const u = DB.get(pid);
    if (!u) return;
    const old = u.rp;
    const rw = CAT.matchRewards({ place: r.place, teams: r.teams, kills: r.kills, rp: u.rp });
    u.rp = rw.newRp; u.coins += rw.coins;
    u.stats.games++; u.stats.kills += r.kills; if (r.win) u.stats.wins++;
    DB.save(u);
    const c = online.get(pid);
    send(c, { t: 'result', ...r, oldRp: old, newRp: u.rp, drp: rw.drp, coins: rw.coins });
    if (c) sendProfile(c);
    socialDirty = true;
  },
});

// ================= Konten =================
function newUser(pid, name, legacy) {
  const u = {
    pid, name, created: Date.now(), last: Date.now(), rp: 0, coins: 150, owned: [],
    equip: { ...CAT.DEFAULT_EQUIP }, ability: 'turbo', friends: [], requests: [], stats: { games: 0, wins: 0, kills: 0 }, cheats: {},
  };
  if (legacy && Number.isFinite(+legacy.rp)) u.rp = clamp(Math.round(+legacy.rp), 0, 1500);
  if (legacy && CAT.canUse(u, legacy.skin)) u.equip.skin = legacy.skin;
  return u;
}
function profilePayload(u) {
  const t3 = top3();
  return { t: 'profile', top3: t3.map(pid => (DB.get(pid) || {}).name).filter(Boolean), isTop3: t3.includes(u.pid), pid: u.pid, name: u.name, rp: u.rp, coins: u.coins, owned: u.owned, equip: u.equip, ability: u.ability, stats: u.stats, cheats: u.cheats };
}
// Sicherungskopie im Browser: vom Server unterschrieben, damit niemand sie verändern kann
const BACKUP_SECRET = process.env.BACKUP_SECRET || 'panzer-papier-kampfbus-7f3a91c2e8d4b6';
const sign = (data) => crypto.createHmac('sha256', BACKUP_SECRET).update(data).digest('hex');
function sendProfile(c) {
  if (!c || !c.user) return;
  const u = c.user;
  send(c, profilePayload(u));
  const data = JSON.stringify({ pid: u.pid, name: u.name, created: u.created, rp: u.rp, coins: u.coins, owned: u.owned, equip: u.equip, ability: u.ability, friends: u.friends, stats: u.stats });
  send(c, { t: 'backup', data, sig: sign(data) });
}
function restoreBackup(pid, b) {
  try {
    if (!b || typeof b.data !== 'string' || typeof b.sig !== 'string' || b.data.length > 20000) return null;
    const a = Buffer.from(sign(b.data)), g = Buffer.from(b.sig);
    if (a.length !== g.length || !crypto.timingSafeEqual(a, g)) return null;
    const d = JSON.parse(b.data);
    if (d.pid !== pid) return null;
    const u = newUser(pid, cleanName(d.name));
    Object.assign(u, { created: d.created || Date.now(), rp: d.rp | 0, coins: d.coins | 0, owned: Array.isArray(d.owned) ? d.owned : [], equip: { ...u.equip, ...d.equip }, ability: d.ability || 'turbo', friends: Array.isArray(d.friends) ? d.friends : [], stats: { ...u.stats, ...d.stats } });
    return u;
  } catch { return null; }
}
function activeMessages() {
  const meta = DB.meta(), now = Date.now();
  meta.messages = (meta.messages || []).filter(m => m.until > now);
  return meta.messages;
}
function sendShop(c) {
  const day = CAT.dayIndex();
  send(c, { t: 'shop', day, items: CAT.shopForDay(day), nextIn: (day + 1) * 86400000 - Date.now() });
}

// ================= Party =================
function newParty(c) {
  const p = { id: uid('party'), leader: c.pid, members: [c.pid], mode: 'solo', fill: true };
  parties.set(p.id, p);
  c.party = p; socialDirty = true;
  return p;
}
function fitMode(p) { // Modus an Partygröße anpassen
  const n = p.members.length;
  if (MODES[p.mode].size < n) p.mode = n <= 2 ? 'duo' : 'squad';
}
function unqueue(p) { const before = queue.length; queue = queue.filter(q => q.party !== p); if (queue.length !== before) socialDirty = true; }
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
  if (engine.inMatch(o.pid)) return 'Im Spiel';
  if (queue.some(q => q.party === o.party)) return 'Sucht Spiel';
  if (o.party && o.party.members.length > 1) return 'In Party';
  return 'Online';
}
function partyPayload(p) {
  const q = queue.find(x => x.party === p);
  return {
    t: 'party', id: p.id, leader: p.leader, mode: p.mode, fill: p.fill, queued: !!q,
    members: p.members.map(pid => {
      const u = DB.get(pid);
      return { pid, name: u ? u.name : '?', equip: u ? u.equip : CAT.DEFAULT_EQUIP, level: u ? rankIdx(u) : 0, inMatch: engine.inMatch(pid) };
    }),
  };
}
function friendsPayload(c) {
  const u = c.user;
  return {
    t: 'friends',
    list: u.friends.map(pid => DB.get(pid)).filter(Boolean).map(f => {
      const o = online.get(f.pid);
      return { pid: f.pid, name: f.name, online: !!o, status: o ? statusText(o) : 'Offline', level: rankIdx(f), inMyParty: !!(o && o.party === c.party) };
    }),
    req: u.requests.map(pid => DB.get(pid)).filter(Boolean).map(r => ({ pid: r.pid, name: r.name, level: rankIdx(r) })),
  };
}
function flushSocial() {
  socialDirty = false;
  for (const c of online.values()) {
    if (!c.party) continue;
    const pj = JSON.stringify(partyPayload(c.party));
    if (pj !== c.lastParty) { c.lastParty = pj; if (c.ws.readyState === 1) c.ws.send(pj); }
    const fj = JSON.stringify(friendsPayload(c));
    if (fj !== c.lastFriends) { c.lastFriends = fj; if (c.ws.readyState === 1) c.ws.send(fj); }
  }
}
function makeFriends(a, b) {
  if (!a.friends.includes(b.pid)) a.friends.push(b.pid);
  if (!b.friends.includes(a.pid)) b.friends.push(a.pid);
  a.requests = a.requests.filter(x => x !== b.pid); b.requests = b.requests.filter(x => x !== a.pid);
  DB.save(a); DB.save(b);
  toast(online.get(a.pid), `Du bist jetzt mit ${b.name} befreundet.`);
  toast(online.get(b.pid), `Du bist jetzt mit ${a.name} befreundet.`);
  socialDirty = true;
}

// ================= Anmelden / Verbindung =================
function login(c, msg) {
  if (c.pid || !validPid(msg.pid)) return;
  let u = DB.get(msg.pid);
  if (!u) {
    const r = restoreBackup(msg.pid, msg.backup); // Konto nach Server-Neustart wiederherstellen
    if (r && r.name.length >= 2 && !DB.nameTaken(r.name)) u = DB.create(r);
  }
  if (!u) {
    const name = cleanName(msg.name);
    if (name.length < 2) return send(c, { t: 'nameTaken', name, rename: false, reason: 'Der Name ist zu kurz.' });
    if (DB.nameTaken(name)) return send(c, { t: 'nameTaken', name, rename: false });
    u = DB.create(newUser(msg.pid, name, msg.legacy));
  }
  const old = online.get(u.pid);
  if (old) { send(old, { t: 'kicked' }); dropConn(old); try { old.ws.close(); } catch { /* egal */ } }
  c.pid = u.pid; c.user = u;
  u.last = Date.now(); DB.save(u);
  online.set(u.pid, c);
  newParty(c);
  send(c, { t: 'welcome', pid: u.pid, name: u.name });
  sendProfile(c); sendShop(c);
  send(c, { t: 'messages', list: activeMessages() });
}
function dropConn(c) {
  if (!c.pid || c.dropped) return;
  c.dropped = true;
  engine.leave(c.pid);
  removeFromParty(c);
  if (online.get(c.pid) === c) online.delete(c.pid);
  if (c.user) { c.user.last = Date.now(); DB.save(c.user); }
  socialDirty = true;
}
function deleteAccount(pid) {
  const c = online.get(pid);
  if (c) { send(c, { t: 'accountDeleted' }); dropConn(c); try { c.ws.close(); } catch { /* egal */ } }
  DB.remove(pid);
  socialDirty = true;
}

// ================= Nachrichten vom Browser =================
function handle(c, msg) {
  if (msg.t === 'login') return login(c, msg);
  if (msg.t === 'adminLogin') return adminLogin(c, msg);
  if (msg.t.startsWith('admin')) return c.admin ? admin(c, msg) : undefined;
  if (!c.pid || c.dropped) return;
  const u = c.user, p = c.party;
  switch (msg.t) {
    case 'rename': {
      const name = cleanName(msg.name);
      if (name.length < 2) return send(c, { t: 'nameTaken', name, rename: true, reason: 'Der Name ist zu kurz.' });
      if (DB.nameTaken(name, u.pid)) return send(c, { t: 'nameTaken', name, rename: true });
      DB.rename(u, name);
      send(c, { t: 'welcome', pid: u.pid, name: u.name }); sendProfile(c); socialDirty = true;
      break;
    }
    case 'equip': {
      const it = CAT.ITEM_BY_ID[msg.id];
      if (!it || !CAT.canUse(u, msg.id, u.cheats.allab)) return toast(c, 'Das hast du noch nicht freigeschaltet.');
      u.equip[it.cat] = it.id; DB.save(u); sendProfile(c); socialDirty = true;
      break;
    }
    case 'setAbility':
      if (!CAT.canUseAbility(u, msg.id, u.cheats.allab, top3())) return toast(c, msg.id === 'wallhack' ? 'Wallhack gibt es nur für die Top 3 Unreal-Spieler.' : 'Diese Fähigkeit ist noch gesperrt.');
      u.ability = msg.id; DB.save(u); sendProfile(c);
      break;
    case 'buy': {
      const it = CAT.ITEM_BY_ID[msg.id];
      if (!it || !it.price || !CAT.shopForDay(CAT.dayIndex()).includes(it.id)) return toast(c, 'Dieses Angebot gibt es heute nicht.');
      if (u.owned.includes(it.id)) return toast(c, 'Das gehört dir schon.');
      if (u.coins < it.price) return toast(c, 'Dafür hast du nicht genug Zahnräder.');
      u.coins -= it.price; u.owned.push(it.id); u.equip[it.cat] = it.id;
      DB.save(u); sendProfile(c);
      send(c, { t: 'bought', id: it.id });
      break;
    }
    case 'friendAdd': {
      const o = DB.byName(cleanName(msg.name));
      if (!o) return toast(c, 'Einen Spieler mit diesem Namen gibt es nicht.');
      if (o.pid === u.pid) return toast(c, 'Das bist du selbst.');
      if (u.friends.includes(o.pid)) return toast(c, `${o.name} ist schon dein Freund.`);
      if (u.requests.includes(o.pid)) return makeFriends(u, o);
      if (o.requests.includes(u.pid)) return toast(c, `Du hast ${o.name} schon eine Anfrage geschickt.`);
      o.requests.push(u.pid); DB.save(o);
      toast(c, online.has(o.pid) ? `Freundschaftsanfrage an ${o.name} gesendet.` : `${o.name} ist offline – die Anfrage wartet auf ${o.name}.`);
      toast(online.get(o.pid), `${u.name} möchte dein Freund sein.`);
      socialDirty = true;
      break;
    }
    case 'friendAccept': {
      const o = DB.get(msg.pid);
      if (!o || !u.requests.includes(o.pid)) return;
      makeFriends(u, o);
      break;
    }
    case 'friendDecline':
      u.requests = u.requests.filter(x => x !== msg.pid); DB.save(u); socialDirty = true;
      break;
    case 'friendRemove': {
      u.friends = u.friends.filter(x => x !== msg.pid); DB.save(u);
      const o = DB.get(msg.pid);
      if (o) { o.friends = o.friends.filter(x => x !== u.pid); DB.save(o); }
      socialDirty = true;
      break;
    }
    case 'invite': {
      const o = online.get(msg.pid);
      if (!o || !u.friends.includes(msg.pid) || p.members.includes(msg.pid)) return;
      if (p.members.length >= PARTY_MAX) return toast(c, 'Deine Party ist voll.');
      if (engine.inMatch(o.pid)) return toast(c, `${o.user.name} ist gerade im Spiel.`);
      send(o, { t: 'invite', partyId: p.id, from: u.name, fromPid: u.pid });
      toast(c, `Einladung an ${o.user.name} gesendet.`);
      break;
    }
    case 'inviteAccept': {
      const np = parties.get(msg.partyId);
      if (!np) return toast(c, 'Diese Party gibt es nicht mehr.');
      if (np === p || engine.inMatch(c.pid)) return;
      if (np.members.length >= PARTY_MAX) return toast(c, 'Die Party ist schon voll.');
      removeFromParty(c);
      np.members.push(c.pid); c.party = np; unqueue(np); fitMode(np);
      for (const pid of np.members) if (pid !== c.pid) toast(online.get(pid), `${u.name} ist der Party beigetreten.`);
      socialDirty = true;
      break;
    }
    case 'inviteDecline': toast(online.get(msg.fromPid), `${u.name} hat die Einladung abgelehnt.`); break;
    case 'partyLeave':
      if (p.members.length <= 1) return;
      removeFromParty(c); newParty(c);
      break;
    case 'kick': {
      if (p.leader !== c.pid || msg.pid === c.pid || !p.members.includes(msg.pid)) return;
      const o = online.get(msg.pid);
      if (o) { removeFromParty(o); newParty(o); toast(o, 'Du wurdest aus der Party entfernt.'); }
      break;
    }
    case 'setMode':
      if (p.leader !== c.pid || queue.some(q => q.party === p)) return;
      if (MODES[msg.mode]) {
        if (MODES[msg.mode].size < p.members.length) return toast(c, `Für ${MODES[msg.mode].name} ist deine Party zu groß.`);
        p.mode = msg.mode;
      }
      if (typeof msg.fill === 'boolean') p.fill = msg.fill;
      socialDirty = true;
      break;
    case 'play': {
      if (p.leader !== c.pid || queue.some(q => q.party === p) || engine.inMatch(c.pid)) return;
      const busy = p.members.filter(pid => engine.inMatch(pid)).map(pid => DB.get(pid).name);
      if (busy.length) return toast(c, `Warte, bis ${busy.join(', ')} zurück ist.`);
      if (MODES[p.mode].size < p.members.length) return toast(c, 'Deine Party ist zu groß für diesen Modus.');
      queue.push({ party: p, mode: p.mode, fill: p.fill, since: nowS() });
      socialDirty = true;
      break;
    }
    case 'cancel': if (p.leader === c.pid) unqueue(p); break;
    case 'input': engine.input(c.pid, msg); break;
    case 'spectate': engine.spectate(c.pid); break;
    case 'toLobby': engine.leave(c.pid); break;
    case 'deleteAccount': deleteAccount(c.pid); break;
  }
}

// ================= Matchmaking (echte Spieler zuerst, dann Bots) =================
const player = (pid) => {
  const u = DB.get(pid);
  // Wer nicht (mehr) Top 3 ist, bekommt statt Wallhack die Unreal-Fähigkeit "Übermacht"
  let ability = u.ability;
  if (!CAT.canUseAbility(u, ability, u.cheats && u.cheats.allab, top3())) { ability = CAT.canUseAbility(u, 'overdrive') ? 'overdrive' : 'turbo'; u.ability = ability; DB.save(u); }
  return { id: pid, name: u.name, equip: u.equip, ability, cheats: u.cheats || {} };
};
function matchmake(now) {
  queue = queue.filter(q => parties.has(q.party.id) && q.party.members.every(pid => online.has(pid)));
  for (const mode of Object.keys(MODES)) {
    const M = MODES[mode];
    // Skill-Matchmaking: nur Partys mit ähnlichem Rang, Spielraum wächst mit der Wartezeit
    const rankOf = (q) => q.party.members.reduce((s, pid) => s + rankIdx(DB.get(pid)), 0) / q.party.members.length;
    const all = queue.filter(q => q.mode === mode);
    if (!all.length) continue;
    const anchor = all[0], tol = 2 + Math.floor((now - anchor.since) / 4);
    const entries = all.filter(q => Math.abs(rankOf(q) - rankOf(anchor)) <= tol);
    const humans = entries.reduce((s, q) => s + q.party.members.length, 0);
    if (humans < M.total && now - entries[0].since < MM_WAIT) continue;
    const chosen = [];
    let n = 0;
    for (const q of entries) { if (n + q.party.members.length > M.total) break; chosen.push(q); n += q.party.members.length; }
    queue = queue.filter(q => !chosen.includes(q));
    // Teams bilden: "Auffüllen" bringt einzelne Spieler mit anderen zusammen
    const teams = [], pool = [];
    for (const q of chosen) {
      if (q.fill && q.party.members.length < M.size) pool.push(...q.party.members);
      else teams.push({ list: q.party.members.map(player), fill: q.fill });
    }
    for (let i = 0; i < pool.length; i += M.size) teams.push({ list: pool.slice(i, i + M.size).map(player), fill: true });
    for (const t of teams) while (t.fill && t.list.length < M.size) t.list.push(null); // Lücken mit Bots
    let count = teams.reduce((s, t) => s + t.list.length, 0);
    while (count < M.total) {
      const team = [];
      for (let k = 0; k < M.size && count < M.total; k++) { team.push(null); count++; }
      teams.push({ list: team });
    }
    const skill = Math.round(chosen.reduce((s, q) => s + rankOf(q), 0) / chosen.length);
    engine.createMatch(teams.map(t => t.list), mode, skill);
    socialDirty = true;
  }
  // Suchstatus an alle Wartenden
  for (const q of queue) {
    const M = MODES[q.mode];
    const found = queue.filter(x => x.mode === q.mode).reduce((s, x) => s + x.party.members.length, 0);
    for (const pid of q.party.members) sendPid(pid, { t: 'queue', found, total: M.total, wait: Math.floor(now - q.since), max: MM_WAIT });
  }
}

// ================= Admin =================
const adminTries = new Map(); // ip -> {n, until}
function adminLogin(c, msg) {
  const t = adminTries.get(c.ip) || { n: 0, until: 0 };
  if (Date.now() < t.until) return send(c, { t: 'adminFail', msg: 'Zu viele Versuche. Bitte kurz warten.' });
  if (String(msg.user || '').trim().toLowerCase() === ADMIN_USER && String(msg.pass || '') === ADMIN_PASS) {
    c.admin = true; adminTries.delete(c.ip);
    send(c, { t: 'adminOk' }); admin(c, { t: 'adminList' });
  } else {
    t.n++; if (t.n >= 5) { t.until = Date.now() + 60000; t.n = 0; }
    adminTries.set(c.ip, t);
    send(c, { t: 'adminFail', msg: 'Benutzer oder Passwort falsch.' });
  }
}
function admin(c, msg) {
  const target = msg.pid ? DB.get(msg.pid) : null;
  const touched = (u) => { DB.save(u); sendProfile(online.get(u.pid)); socialDirty = true; };
  switch (msg.t) {
    case 'adminList': break;
    case 'adminDelete': if (target) deleteAccount(target.pid); break;
    case 'adminDeleteAll': for (const u of DB.all()) if (u.pid !== c.pid) deleteAccount(u.pid); break;
    case 'adminCoins': {
      const amt = clamp(Math.round(+msg.amount || 0), -1e6, 1e6);
      const list = msg.pid === '*' ? DB.all() : target ? [target] : [];
      for (const u of list) { u.coins = Math.max(0, u.coins + amt); touched(u); if (amt > 0) toast(online.get(u.pid), `Du hast ${amt} Zahnräder geschenkt bekommen!`); }
      break;
    }
    case 'adminRp': if (target) { target.rp = clamp(Math.round(+msg.rp || 0), 0, 99999); touched(target); } break;
    case 'adminCheats': if (target) {
      const ch = {};
      for (const k of ['god', 'nocd', 'speed', 'oneshot', 'wall', 'allab']) if (msg.cheats && msg.cheats[k]) ch[k] = true;
      target.cheats = ch; touched(target);
    } break;
    case 'adminMsg': {
      const text = String(msg.text || '').replace(/[<>]/g, '').trim().slice(0, 200);
      const minutes = clamp(+msg.minutes || 10, 1, 60 * 24 * 30);
      if (text) { DB.meta().messages.push({ id: uid('msg'), text, until: Date.now() + minutes * 60000 }); DB.saveMeta(); broadcastMessages(); }
      break;
    }
    case 'adminMsgDel': DB.meta().messages = activeMessages().filter(m => m.id !== msg.id); DB.saveMeta(); broadcastMessages(); break;
    default: return;
  }
  const users = DB.all().sort((a, b) => (online.has(b.pid) - online.has(a.pid)) || b.last - a.last).map(u => ({
    pid: u.pid, name: u.name, rp: u.rp, rank: rankIdx(u), coins: u.coins, online: online.has(u.pid), inMatch: engine.inMatch(u.pid),
    last: u.last, stats: u.stats, cheats: u.cheats || {},
  }));
  send(c, { t: 'adminData', users, messages: activeMessages(), stats: { online: online.size, matches: engine.count(), queue: queue.length, db: DB.mode, accounts: users.length } });
}
function broadcastMessages() {
  const list = activeMessages();
  for (const c of online.values()) send(c, { t: 'messages', list });
}

// ================= Haupt-Takt =================
const TICK = 1 / 40;
let lastMM = 0, lastShopDay = CAT.dayIndex();
setInterval(() => {
  const now = nowS();
  engine.tick(now);
  if (now - lastMM > 0.5) {
    lastMM = now;
    matchmake(now);
    const day = CAT.dayIndex();
    if (day !== lastShopDay) { lastShopDay = day; for (const c of online.values()) sendShop(c); }
  }
  if (socialDirty) flushSocial();
}, TICK * 1000);
setInterval(() => { socialDirty = true; }, 2000);
setInterval(() => { const before = (DB.meta().messages || []).length; if (activeMessages().length !== before) { DB.saveMeta(); broadcastMessages(); } }, 30000);

// ================= WebSocket =================
const wss = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 });
wss.on('connection', (ws, req) => {
  const c = { ws, pid: null, user: null, party: null, alive: true, admin: false, ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim() };
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

DB.init().then(() => {
  httpServer.listen(PORT, () => console.log(`PANZER läuft auf http://localhost:${PORT}`));
}).catch((e) => { console.error('Datenbank-Start fehlgeschlagen:', e); process.exit(1); });
process.on('SIGTERM', () => { DB.flush().finally(() => process.exit(0)); });
