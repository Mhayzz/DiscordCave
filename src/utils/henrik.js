const axios = require('axios');

const BASE_URL = 'https://api.henrikdev.xyz';

const MAX_CONCURRENT = Math.max(1, Number(process.env.HENRIK_MAX_CONCURRENT || 2));
const CACHE_TTL_MS = Math.max(0, Number(process.env.HENRIK_CACHE_TTL_MS || 60_000));
const MAX_RETRIES_429 = 3;

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
const inflight = new Map();
const waiters = [];
let active = 0;

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
  const cached = cache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const existing = inflight.get(url);
  if (existing) return existing;

  const promise = (async () => {
    let attempt = 0;
    while (true) {
      try {
        const data = await rawRequest(url);
        if (CACHE_TTL_MS > 0) {
          cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
        }
        return data;
      } catch (err) {
        const status = err.response?.status;
        const body = err.response?.data;

        if (status === 429 && attempt < MAX_RETRIES_429) {
          const retryAfterMs = parseRetryAfter(err.response?.headers);
          const backoff = retryAfterMs ?? Math.min(15_000, 1000 * 2 ** attempt);
          const jitter = Math.floor(Math.random() * 300);
          console.warn(`[Henrik] 429 retry ${attempt + 1}/${MAX_RETRIES_429} in ${backoff + jitter}ms ${url}`);
          await sleep(backoff + jitter);
          attempt += 1;
          continue;
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
  const data = await call(`${BASE_URL}/valorant/v1/mmr-history/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
  return data.data || [];
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

module.exports = { getAccount, getMmr, getMmrHistory, getMatches, ping, hasApiKey };
