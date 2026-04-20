const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
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
    return JSON.parse(raw);
  } catch {
    return { users: {} };
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

module.exports = { linkUser, getUser, unlinkUser };
