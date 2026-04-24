const axios = require('axios');

const BASE_URL = 'https://api.henrikdev.xyz';

const MAX_CONCURRENT = Math.max(1, Number(process.env.HENRIK_MAX_CONCURRENT || 2));
const CACHE_TTL_MS = Math.max(0, Number(process.env.HENRIK_CACHE_TTL_MS || 60_000));
// How long a cached entry can still be served when the API fails (stale-while-error).
const STALE_TTL_MS = Math.max(CACHE_TTL_MS, Number(process.env.HENRIK_STALE_TTL_MS || 60 * 60 * 1000));
const MAX_RETRIES_429 = Math.max(0, Number(process.env.HENRIK_MAX_RETRIES_429 ?? 2));
// Base backoff for 429 with no Retry-After header (doubled each attempt).
const BACKOFF_BASE_429_MS = Math.max(500, Number(process.env.HENRIK_BACKOFF_BASE_MS || 5000));
// After we give up on 429, fail fast (or serve stale cache) on the same URL for this long.
const COOLDOWN_429_MS = Math.max(0, Number(process.env.HENRIK_COOLDOWN_429_MS || 5 * 60 * 1000));

function hasApiKey() {
  return Boolean(process.env.HENRIK_API_KEY);
}

function buildHeaders() {
  const h = { Accept: 'application/json', 'User-Agent': 'DiscordCave-Bot/1.0' };
  if (hasApiKey()) h.Authorization = process.env.HENRIK_API_KEY;
  return h;
}

function extractErrorMessage(body) {
  if (!body) return null;
  const err = Array.isArray(body.errors) ? body.errors[0] : null;
  if (err) {
    if (err.details) return err.details;
    if (err.message && err.message !== 'Received one or more errors') return err.message;
    if (err.code) return `code ${err.code}`;
  }
  if (body.error) return body.error;
  if (typeof body.message === 'string') return body.message;
  if (typeof body.status === 'string') return body.status;
  return null;
}

const cache = new Map();
const cooldown = new Map();
const inflight = new Map();
const waiters = [];
let active = 0;
let lastDegradedAt = 0;

function markDegraded() {
  lastDegradedAt = Date.now();
}

function isDegraded(windowMs = 10 * 60 * 1000) {
  return lastDegradedAt > 0 && Date.now() - lastDegradedAt < windowMs;
}

function readCache(url, { allowStale = false } = {}) {
  const entry = cache.get(url);
  if (!entry) return null;
  const now = Date.now();
  if (entry.expiresAt > now) return { data: entry.data, fresh: true };
  if (allowStale && entry.staleUntil > now) return { data: entry.data, fresh: false };
  if (entry.staleUntil <= now) cache.delete(url);
  return null;
}

function writeCache(url, data) {
  if (CACHE_TTL_MS <= 0 && STALE_TTL_MS <= 0) return;
  const now = Date.now();
  cache.set(url, {
    data,
    expiresAt: now + CACHE_TTL_MS,
    staleUntil: now + STALE_TTL_MS,
  });
}

function acquireSlot() {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function releaseSlot() {
  const next = waiters.shift();
  if (next) next();
  else active -= 1;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfter(headers) {
  const raw = headers?.['retry-after'];
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return Math.max(0, n * 1000);
  const when = Date.parse(raw);
  if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  return null;
}

async function rawRequest(url) {
  await acquireSlot();
  try {
    const { data } = await axios.get(url, { headers: buildHeaders(), timeout: 15000 });
    return data;
  } finally {
    releaseSlot();
  }
}

async function call(url) {
  const cached = readCache(url);
  if (cached) return cached.data;

  const cooldownUntil = cooldown.get(url);
  if (cooldownUntil && cooldownUntil > Date.now()) {
    markDegraded();
    const stale = readCache(url, { allowStale: true });
    if (stale) return stale.data;
    const err = new Error('rate limit dépassé, réessaie plus tard');
    err.status = 429;
    err.url = url;
    throw err;
  }
  if (cooldownUntil) cooldown.delete(url);

  const existing = inflight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    let attempt = 0;
    while (true) {
      try {
        const data = await rawRequest(url);
        writeCache(url, data);
        return data;
      } catch (err) {
        const status = err.response?.status;
        const body = err.response?.data;

        if (status === 429 && attempt < MAX_RETRIES_429) {
          const retryAfterMs = parseRetryAfter(err.response?.headers);
          const backoff = retryAfterMs ?? Math.min(60_000, BACKOFF_BASE_429_MS * 2 ** attempt);
          const jitter = Math.floor(Math.random() * 500);
          console.warn(`[Henrik] 429 retry ${attempt + 1}/${MAX_RETRIES_429} in ${backoff + jitter}ms ${url}`);
          await sleep(backoff + jitter);
          attempt += 1;
          continue;
        }

        if (status === 429) {
          cooldown.set(url, Date.now() + COOLDOWN_429_MS);
          markDegraded();
          const stale = readCache(url, { allowStale: true });
          if (stale) {
            console.warn(`[Henrik] 429 persistant, cache obsolète servi pour ${url}`);
            return stale.data;
          }
        }

        console.error('[Henrik] FAILED', {
          url,
          status,
          hasApiKey: hasApiKey(),
          body: typeof body === 'object' ? JSON.stringify(body).slice(0, 400) : String(body).slice(0, 400),
        });

        const apiMsg = extractErrorMessage(body);
        let friendly;
        if (status === 401 || status === 403) {
          friendly = hasApiKey()
            ? `clé API HenrikDev invalide ou manquant les permissions (${status})`
            : `clé API HenrikDev requise — demande-la sur https://docs.henrikdev.xyz/ et configure HENRIK_API_KEY (${status})`;
        } else if (status === 404) {
          friendly = apiMsg || 'compte Riot introuvable';
        } else if (status === 429) {
          friendly = 'rate limit dépassé, réessaie dans quelques secondes';
        } else if (status >= 500) {
          friendly = apiMsg || `l'API HenrikDev est indisponible (${status})`;
        } else if (apiMsg === 'Received one or more errors' || !apiMsg) {
          friendly = hasApiKey()
            ? `erreur API générique (${status || '?'}), voir logs Railway`
            : 'clé API HenrikDev requise (HENRIK_API_KEY non configurée)';
        } else {
          friendly = apiMsg;
        }

        const wrapped = new Error(friendly);
        wrapped.status = status;
        wrapped.body = body;
        wrapped.url = url;
        wrapped.apiMsg = apiMsg;
        throw wrapped;
      }
    }
  })();

  inflight.set(url, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(url);
  }
}

async function getAccount(name, tag) {
  const data = await call(`${BASE_URL}/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
  return data.data;
}

async function getMmr(region, name, tag) {
  try {
    const data = await call(`${BASE_URL}/valorant/v3/mmr/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
    return data.data;
  } catch (err) {
    if (err.status === 404) {
      try {
        const data = await call(`${BASE_URL}/valorant/v1/mmr/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
        return data.data;
      } catch {
        throw err;
      }
    }
    throw err;
  }
}

async function getMmrHistory(region, name, tag) {
  const storedUrl = `${BASE_URL}/valorant/v1/stored-mmr-history/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
  const legacyUrl = `${BASE_URL}/valorant/v1/mmr-history/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
  try {
    const payload = await call(storedUrl);
    const list = payload.data ?? payload.history;
    if (Array.isArray(list)) return list;
    if (list && Array.isArray(list.history)) return list.history;
    return [];
  } catch (err) {
    if (err.status !== 404 && err.status !== 403) throw err;
    const payload = await call(legacyUrl);
    return payload.data || [];
  }
}

async function getMatches(region, name, tag, mode = 'competitive', size = 20) {
  const url = `${BASE_URL}/valorant/v4/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?mode=${mode}&size=${size}`;
  const data = await call(url);
  return data.data || [];
}

async function ping() {
  const data = await call(`${BASE_URL}/valorant/v1/status/eu`);
  return data;
}

module.exports = { getAccount, getMmr, getMmrHistory, getMatches, ping, hasApiKey, isDegraded };
