const axios = require('axios');

const BASE_URL = 'https://api.henrikdev.xyz';

function headers() {
  const h = { 'Accept': 'application/json' };
  if (process.env.HENRIK_API_KEY) {
    h['Authorization'] = process.env.HENRIK_API_KEY;
  }
  return h;
}

async function call(url) {
  try {
    const { data } = await axios.get(url, { headers: headers(), timeout: 15000 });
    return data;
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const apiMsg = body?.errors?.[0]?.message || body?.message || body?.status || err.message;
    const detail = `[Henrik ${status || 'NO_STATUS'}] ${apiMsg}`;
    console.error(`API call failed: ${url} -> ${detail}`, body || '');
    const wrapped = new Error(detail);
    wrapped.status = status;
    wrapped.body = body;
    throw wrapped;
  }
}

async function getAccount(name, tag) {
  const data = await call(`${BASE_URL}/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
  return data.data;
}

async function getMmr(region, name, tag) {
  const data = await call(`${BASE_URL}/valorant/v3/mmr/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
  return data.data;
}

async function getMmrHistory(region, name, tag) {
  const data = await call(`${BASE_URL}/valorant/v2/mmr-history/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
  return data.data || [];
}

async function getMatches(region, name, tag, mode = 'competitive', size = 20) {
  const data = await call(`${BASE_URL}/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?filter=${mode}&size=${size}`);
  return data.data || [];
}

module.exports = { getAccount, getMmr, getMmrHistory, getMatches };
