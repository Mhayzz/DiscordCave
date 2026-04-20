const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR
  || process.env.RAILWAY_VOLUME_MOUNT_PATH
  || path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.users) parsed.users = {};
    if (!parsed.meta) parsed.meta = {};
    return parsed;
  } catch {
    return { users: {}, meta: {} };
  }
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function linkUser(discordId, { name, tag, region, puuid }) {
  const db = readDb();
  db.users[discordId] = {
    name,
    tag,
    region,
    puuid,
    linkedAt: new Date().toISOString(),
  };
  writeDb(db);
}

function getUser(discordId) {
  const db = readDb();
  return db.users[discordId] || null;
}

function unlinkUser(discordId) {
  const db = readDb();
  if (!db.users[discordId]) return false;
  delete db.users[discordId];
  writeDb(db);
  return true;
}

function getAllUsers() {
  const db = readDb();
  return Object.entries(db.users).map(([discordId, u]) => ({ discordId, ...u }));
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

module.exports = { linkUser, getUser, unlinkUser, getAllUsers, getMeta, setMeta };
