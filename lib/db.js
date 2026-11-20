// PANZER – dauerhafte Speicherung der Konten
// Mit DATABASE_URL (z. B. Render/Neon Postgres) in der Datenbank, sonst in data/db.json.
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'db.json');
const users = new Map();     // pid -> user
const byName = new Map();    // name (klein) -> pid
let meta = { messages: [] };
const dirty = new Set(), deleted = new Set();
let metaDirty = false, pool = null, mode = 'file';

function normName(n) { return String(n || '').toLowerCase(); }

async function init() {
  if (process.env.DATABASE_URL) {
    const { Pool } = require('pg');
    const url = process.env.DATABASE_URL;
    const tryConnect = async (ssl) => {
      const p = new Pool({ connectionString: url, ssl, max: 3 });
      await p.query('select 1');
      return p;
    };
    try { pool = await tryConnect({ rejectUnauthorized: false }); } catch { pool = await tryConnect(false); }
    await pool.query('create table if not exists panzer_users (pid text primary key, data jsonb not null)');
    await pool.query('create table if not exists panzer_meta (k text primary key, data jsonb not null)');
    const r = await pool.query('select data from panzer_users');
    for (const row of r.rows) addLoaded(row.data);
    const m = await pool.query(`select data from panzer_meta where k = 'meta'`);
    if (m.rows[0]) meta = Object.assign({ messages: [] }, m.rows[0].data);
    mode = 'postgres';
  } else {
    try {
      const j = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      for (const u of j.users || []) addLoaded(u);
      meta = Object.assign({ messages: [] }, j.meta || {});
    } catch { /* noch keine Datei */ }
  }
  setInterval(() => flush().catch(e => console.error('Speichern fehlgeschlagen:', e.message)), 2000);
  console.log(`Konten-Speicher: ${mode} (${users.size} Konten)`);
}
function addLoaded(u) {
  if (!u || !u.pid || !u.name) return;
  users.set(u.pid, u);
  byName.set(normName(u.name), u.pid);
}

let flushing = false;
async function flush() {
  if (flushing || (!dirty.size && !deleted.size && !metaDirty)) return;
  flushing = true;
  try {
    if (mode === 'postgres') {
      for (const pid of [...deleted]) { await pool.query('delete from panzer_users where pid = $1', [pid]); deleted.delete(pid); }
      for (const pid of [...dirty]) {
        const u = users.get(pid);
        dirty.delete(pid);
        if (u) await pool.query('insert into panzer_users (pid, data) values ($1, $2) on conflict (pid) do update set data = excluded.data', [pid, u]);
      }
      if (metaDirty) { metaDirty = false; await pool.query(`insert into panzer_meta (k, data) values ('meta', $1) on conflict (k) do update set data = excluded.data`, [meta]); }
    } else {
      dirty.clear(); deleted.clear(); metaDirty = false;
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ users: [...users.values()], meta }));
      fs.renameSync(tmp, FILE);
    }
  } finally { flushing = false; }
}

module.exports = {
  init, flush,
  get mode() { return mode; },
  get(pid) { return users.get(pid); },
  byName(name) { const pid = byName.get(normName(name)); return pid ? users.get(pid) : null; },
  nameTaken(name, exceptPid) { const pid = byName.get(normName(name)); return !!pid && pid !== exceptPid; },
  all() { return [...users.values()]; },
  create(u) { users.set(u.pid, u); byName.set(normName(u.name), u.pid); dirty.add(u.pid); return u; },
  save(u) { if (users.has(u.pid)) dirty.add(u.pid); },
  rename(u, newName) { byName.delete(normName(u.name)); u.name = newName; byName.set(normName(newName), u.pid); dirty.add(u.pid); },
  remove(pid) {
    const u = users.get(pid);
    if (!u) return;
    users.delete(pid); byName.delete(normName(u.name)); dirty.delete(pid); deleted.add(pid);
    // aus Freundeslisten und Anfragen der anderen entfernen
    for (const o of users.values()) {
      const f = (o.friends || []).length, r = (o.requests || []).length;
      o.friends = (o.friends || []).filter(x => x !== pid);
      o.requests = (o.requests || []).filter(x => x !== pid);
      if (o.friends.length !== f || o.requests.length !== r) dirty.add(o.pid);
    }
  },
  meta() { return meta; },
  saveMeta() { metaDirty = true; },
};
