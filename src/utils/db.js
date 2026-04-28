const MAX_ACCOUNTS = 3;
const STORAGE_CHANNEL_ID = process.env.STORAGE_CHANNEL_ID;
const SYNC_DEBOUNCE_MS = 500;

let memDb = { users: {}, meta: {} };
let storageChannel = null;
let storageMessage = null;
let syncTimer = null;
let pendingSync = false;
let syncing = false;

function emptyDb() {
  return { users: {}, meta: {} };
}

function serialize(db) {
  return '```json\n' + JSON.stringify(db) + '\n```';
}

function deserialize(content) {
  const match = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  const raw = match ? match[1] : content;
  return JSON.parse(raw);
}

function migrateEntry(entry) {
  if (Array.isArray(entry)) return entry;
  if (entry && typeof entry === 'object' && entry.name && entry.tag) return [entry];
  return [];
}

function migrateAll(db) {
  const out = { users: {}, meta: db?.meta || {} };
  for (const [id, val] of Object.entries(db?.users || {})) {
    out.users[id] = migrateEntry(val);
  }
  return out;
}

async function init(client) {
  if (!STORAGE_CHANNEL_ID) {
    console.warn('[db] STORAGE_CHANNEL_ID non défini, données en RAM (perdues au redémarrage)');
    return;
  }
  try {
    storageChannel = await client.channels.fetch(STORAGE_CHANNEL_ID);
  } catch (err) {
    console.error('[db] salon stockage introuvable:', err.message);
    return;
  }
  if (!storageChannel?.isTextBased?.()) {
    console.error('[db] salon stockage non textuel');
    storageChannel = null;
    return;
  }

  let candidate = null;
  try {
    const pinned = await storageChannel.messages.fetchPinned();
    candidate = pinned.find((m) => m.author?.id === client.user.id) || null;
  } catch {}

  if (!candidate) {
    try {
      const recent = await storageChannel.messages.fetch({ limit: 50 });
      candidate = recent.find((m) =>
        m.author?.id === client.user.id && /"users"\s*:/.test(m.content || '')
      ) || null;
    } catch {}
  }

  if (candidate) {
    try {
      memDb = migrateAll(deserialize(candidate.content));
      storageMessage = candidate;
      console.log(`[db] chargé depuis Discord: ${Object.keys(memDb.users).length} user(s)`);
    } catch (err) {
      console.error('[db] parse échoué, mémoire vide:', err.message);
      storageMessage = candidate;
    }
  } else {
    try {
      storageMessage = await storageChannel.send({ content: serialize(memDb) });
      await storageMessage.pin().catch((e) => console.warn('[db] pin échoué:', e.message));
      console.log('[db] message de stockage créé');
    } catch (err) {
      console.error('[db] création message échouée:', err.message);
    }
  }
}

function readDb() {
  return memDb;
}

function writeDb(db) {
  memDb = db;
  scheduleSync();
}

function scheduleSync() {
  if (!storageChannel) return;
  if (syncTimer) return;
  syncTimer = setTimeout(runSync, SYNC_DEBOUNCE_MS);
}

async function runSync() {
  syncTimer = null;
  if (syncing) {
    pendingSync = true;
    return;
  }
  syncing = true;
  try {
    const content = serialize(memDb);
    if (content.length > 1900) {
      console.warn(`[db] message ${content.length}/2000 chars, proche de la limite Discord`);
    }
    if (storageMessage) {
      try {
        storageMessage = await storageMessage.edit({ content });
      } catch (err) {
        if (err.code === 10008) {
          storageMessage = await storageChannel.send({ content });
          await storageMessage.pin().catch(() => {});
        } else {
          throw err;
        }
      }
    } else {
      storageMessage = await storageChannel.send({ content });
      await storageMessage.pin().catch(() => {});
    }
  } catch (err) {
    console.error('[db] sync échoué:', err.message);
  } finally {
    syncing = false;
    if (pendingSync) {
      pendingSync = false;
      scheduleSync();
    }
  }
}

function sameAccount(a, b) {
  return a.name.toLowerCase() === b.name.toLowerCase()
    && a.tag.toLowerCase() === b.tag.toLowerCase();
}

function addAccount(discordId, { name, tag, region, puuid }) {
  if (!name || !tag) {
    console.warn(`[db] addAccount refusé: name/tag vide (puuid=${puuid})`);
    return { ok: false, reason: 'invalid', total: 0 };
  }
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

async function repairInvalid() {
  const { getAccountByPuuid } = require('./henrik');
  let repaired = 0;
  let failed = 0;
  for (const list of Object.values(memDb.users)) {
    for (const acc of list) {
      if ((acc.name && acc.tag) || !acc.puuid) continue;
      try {
        const fresh = await getAccountByPuuid(acc.puuid);
        if (fresh?.name && fresh?.tag) {
          acc.name = fresh.name;
          acc.tag = fresh.tag;
          acc.region = fresh.region || acc.region;
          repaired += 1;
          console.log(`[db] réparé: ${acc.name}#${acc.tag}`);
        } else {
          failed += 1;
        }
      } catch (e) {
        failed += 1;
        console.warn(`[db] réparation échouée puuid=${acc.puuid}: ${e.message}`);
      }
    }
  }
  if (repaired > 0) {
    console.log(`[db] ${repaired} entrée(s) réparée(s), ${failed} échec(s)`);
    scheduleSync();
  } else if (failed > 0) {
    console.log(`[db] ${failed} entrée(s) cassée(s) mais réparation impossible (réessai au prochain boot)`);
  }
}

function getAllAccounts() {
  const db = readDb();
  const out = [];
  let dropped = 0;
  for (const [discordId, list] of Object.entries(db.users)) {
    for (const account of list) {
      if (!account?.name || !account?.tag) {
        dropped += 1;
        continue;
      }
      out.push({ discordId, ...account });
    }
  }
  if (dropped > 0) console.warn(`[db] ${dropped} entrée(s) invalide(s) ignorée(s) (name/tag vide)`);
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
  init,
  repairInvalid,
  addAccount,
  getAccounts,
  getAccountByRiotId,
  removeAccount,
  getAllAccounts,
  getMeta,
  setMeta,
};
