const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { hasApiKey } = require('../utils/henrik');

const BASE_URL = 'https://api.henrikdev.xyz';

function redact(key) {
  if (!key) return 'NON DÉFINIE';
  const len = key.length;
  if (len < 12) return `<${len} chars> ??? (trop court)`;
  return `${key.slice(0, 6)}…${key.slice(-4)} (${len} chars)`;
}

async function rawCall(url) {
  const headers = { Accept: 'application/json', 'User-Agent': 'DiscordCave-Bot/1.0' };
  if (process.env.HENRIK_API_KEY) headers.Authorization = process.env.HENRIK_API_KEY;
  try {
    const res = await axios.get(url, { headers, timeout: 15000, validateStatus: () => true });
    return { status: res.status, body: res.data };
  } catch (err) {
    return { status: 0, body: { _networkError: err.message } };
  }
}

function summarize(result) {
  const { status, body } = result;
  if (status >= 200 && status < 300) return `✅ ${status} OK`;
  const msg = body?.errors?.[0]?.details
    || body?.errors?.[0]?.message
    || body?.error
    || body?.message
    || (typeof body === 'string' ? body.slice(0, 100) : JSON.stringify(body).slice(0, 200));
  return `❌ ${status} — ${msg}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('diag')
    .setDescription('Diagnostic complet de l\'API HenrikDev')
    .addStringOption((o) =>
      o.setName('riot_id').setDescription('(optionnel) Pseudo Riot à tester').setRequired(false))
    .addStringOption((o) =>
      o.setName('tag').setDescription('(optionnel) Tag Riot à tester').setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const name = interaction.options.getString('riot_id') || 'TenZ';
    const tag = (interaction.options.getString('tag') || '0001').replace(/^#/, '');

    const apiKey = process.env.HENRIK_API_KEY;
    const lines = [];

    lines.push('**Configuration**');
    lines.push(`• HENRIK_API_KEY : ${hasApiKey() ? '✅' : '❌'} ${redact(apiKey)}`);
    lines.push(`• Préfixe HDEV- : ${apiKey?.startsWith('HDEV-') ? '✅ oui' : '⚠️ non (format peut-être invalide)'}`);
    lines.push(`• LEADERBOARD_CHANNEL_ID : ${process.env.LEADERBOARD_CHANNEL_ID ? '✅ défini' : '❌ non défini'}`);
    lines.push('');

    lines.push('**Tests API**');

    const ping = await rawCall(`${BASE_URL}/valorant/v1/status/eu`);
    lines.push(`• Status EU : ${summarize(ping)}`);

    const account = await rawCall(`${BASE_URL}/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
    lines.push(`• Account lookup \`${name}#${tag}\` : ${summarize(account)}`);

    if (account.status >= 200 && account.status < 300) {
      const region = account.body?.data?.region;
      lines.push(`  └─ région détectée : **${region || 'N/A'}**`);
      if (region) {
        const mmr = await rawCall(`${BASE_URL}/valorant/v3/mmr/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
        lines.push(`• MMR v3 (${region}/pc) : ${summarize(mmr)}`);

        const matches = await rawCall(`${BASE_URL}/valorant/v3/matches/${region}/pc/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?size=1&mode=competitive`);
        lines.push(`• Matches v3 (${region}/pc) : ${summarize(matches)}`);

        const history = await rawCall(`${BASE_URL}/valorant/v1/mmr-history/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
        lines.push(`• MMR history v1 : ${summarize(history)}`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle('🔧 Diagnostic DiscordCave')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Si tout est ❌, vérifie que HENRIK_API_KEY commence par HDEV- et est valide' });

    await interaction.editReply({ embeds: [embed] });
  },
};
