const axios = require('axios');

const BASE_URL = 'https://api.henrikdev.xyz';

function headers() {
  const h = { 'Accept': 'application/json' };
  if (process.env.HENRIK_API_KEY) {
    h['Authorization'] = process.env.HENRIK_API_KEY;
  }
  return h;
}

async function getAccount(name, tag) {
  const url = `${BASE_URL}/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
  const { data } = await axios.get(url, { headers: headers() });
  return data.data;
}

async function getMmr(region, name, tag) {
  const url = `${BASE_URL}/valorant/v3/mmr/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
  const { data } = await axios.get(url, { headers: headers() });
  return data.data;
}

async function getMmrHistory(region, name, tag) {
  const url = `${BASE_URL}/valorant/v2/mmr-history/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
  const { data } = await axios.get(url, { headers: headers() });
  return data.data || [];
}

async function getMatches(region, name, tag, mode = 'competitive', size = 20) {
  const url = `${BASE_URL}/valorant/v3/matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?filter=${mode}&size=${size}`;
  const { data } = await axios.get(url, { headers: headers() });
  return data.data || [];
}

module.exports = { getAccount, getMmr, getMmrHistory, getMatches };
