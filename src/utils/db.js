const fs = require('fs');
const path = require('path');

const MAX_ACCOUNTS = 3;

const DATA_DIR = process.env.DATA_DIR
  || process.env.RAILWAY_VOLUME_MOUNT_PATH
  || path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, meta: {} }, null, 2));
  }
}

function migrateEntry(entry) {
  if (Array.isArray(entry)) return entry;
  if (entry && typeof entry === 'object' && entry.name && entry.tag) {
    return [entry];
  }
  return [];
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { users: {}, meta: {} };
  }
  if (!parsed.users) parsed.users = {};
  if (!parsed.meta) parsed.meta = {};
  for (const id of Object.keys(parsed.users)) {
    parsed.users[id] = migrateEntry(parsed.users[id]);
  }
  return parsed;
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function sameAccount(a, b) {
  return a.name.toLowerCase() === b.name.toLowerCase()
    && a.tag.toLowerCase() === b.tag.toLowerCase();
}

function addAccount(discordId, { name, tag, region, puuid }) {
  const db = readDb();
  const list = db.users[discordId] || [];
  if (list.some((a) => sameAccount(a, { name, tag }))) {
    return { ok: false, reason: 'duplicate', total: list.length };
  }
  if (list.length >= MAX_ACCOUNTS) {
    return { ok: false, reason: 'max', total: list.length };
  }
  list.push({ name, tag, region, puuid, linkedAt: new Date().toISOString() });
  db.users[discordId] = list;
  writeDb(db);
  return { ok: true, total: list.length };
}

function getAccounts(discordId) {
  const db = readDb();
  return db.users[discordId] || [];
}

function getAccountByRiotId(discordId, riotId) {
  const accounts = getAccounts(discordId);
  if (!riotId) return accounts[0] || null;
  const [name, tag] = riotId.split('#');
  if (!name || !tag) return null;
  return accounts.find((a) => sameAccount(a, { name, tag })) || null;
}

function removeAccount(discordId, riotId) {
  const db = readDb();
  const list = db.users[discordId] || [];
  if (list.length === 0) return { removed: 0, remaining: 0 };

  if (!riotId) {
    delete db.users[discordId];
    writeDb(db);
    return { removed: list.length, remaining: 0 };
  }

  const [name, tag] = riotId.split('#');
  if (!name || !tag) return { removed: 0, remaining: list.length };

  const next = list.filter((a) => !sameAccount(a, { name, tag }));
  const removed = list.length - next.length;
  if (removed === 0) return { removed: 0, remaining: list.length };

  if (next.length === 0) delete db.users[discordId];
  else db.users[discordId] = next;
  writeDb(db);
  return { removed, remaining: next.length };
}

function getAllAccounts() {
  const db = readDb();
  const out = [];
  for (const [discordId, list] of Object.entries(db.users)) {
    for (const account of list) {
      out.push({ discordId, ...account });
    }
  }
  return out;
}

function getMeta(key) {
  const db = readDb();
  return db.meta?.[key];
}

function setMeta(key, value) {
  const db = readDb();
  if (!db.meta) db.meta = {};
  db.meta[key] = value;
  writeDb(db);
}

module.exports = {
  MAX_ACCOUNTS,
  addAccount,
  getAccounts,
  getAccountByRiotId,
  removeAccount,
  getAllAccounts,
  getMeta,
  setMeta,
};
