const { EmbedBuilder } = require('discord.js');
const { getAllUsers, getMeta, setMeta } = require('./utils/db');
const { getMmr } = require('./utils/henrik');

const META_KEY = 'leaderboardMessageId';

async function fetchUserMmr(user) {
  try {
    const mmr = await getMmr(user.region, user.name, user.tag);
    const current = mmr?.current_data || mmr?.current || {};
    return {
      ...user,
      rankName: current.currenttierpatched || current.tier?.name || 'Unranked',
      rr: current.ranking_in_tier ?? current.rr ?? 0,
      elo: current.elo ?? 0,
    };
  } catch {
    return { ...user, rankName: 'N/A', rr: 0, elo: -1 };
  }
}

async function buildLeaderboardEmbed() {
  const users = getAllUsers();
  if (users.length === 0) {
    return new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle('Classement Valorant')
      .setDescription('Aucun joueur lie pour le moment. Utilisez `/link riot_id tag` pour participer !')
      .setTimestamp();
  }

  const enriched = await Promise.all(users.map(fetchUserMmr));
  const ranked = enriched
    .filter((u) => u.elo >= 0)
    .sort((a, b) => b.elo - a.elo);

  const medals = ['🥇', '🥈', '🥉'];
  const lines = ranked.map((u, i) => {
    const prefix = medals[i] || `\`#${String(i + 1).padStart(2, '0')}\``;
    return `${prefix} <@${u.discordId}> — **${u.rankName}** (${u.rr} RR) · \`${u.name}#${u.tag}\``;
  });

  const errored = enriched.filter((u) => u.elo < 0);
  if (errored.length > 0) {
    lines.push('');
    lines.push(`*${errored.length} compte(s) introuvable(s) ou en erreur API*`);
  }

  return new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle('Classement Valorant')
    .setDescription(lines.join('\n') || 'Aucun joueur classe')
    .setFooter({ text: `${ranked.length} joueur(s) · auto-update` })
    .setTimestamp();
}

async function updateLeaderboard(client, channelId) {
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.warn(`[leaderboard] salon ${channelId} introuvable ou non textuel`);
    return;
  }

  const embed = await buildLeaderboardEmbed();
  const existingId = getMeta(META_KEY);

  if (existingId) {
    const msg = await channel.messages.fetch(existingId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] });
      return;
    }
  }

  const sent = await channel.send({ embeds: [embed] });
  setMeta(META_KEY, sent.id);
}

function startLeaderboardLoop(client) {
  const channelId = process.env.LEADERBOARD_CHANNEL_ID;
  if (!channelId) {
    console.log('[leaderboard] LEADERBOARD_CHANNEL_ID non defini, leaderboard auto desactive');
    return;
  }

  const minutes = Number(process.env.LEADERBOARD_UPDATE_MINUTES || 15);
  const intervalMs = Math.max(1, minutes) * 60 * 1000;

  console.log(`[leaderboard] auto-update toutes les ${minutes} minute(s) dans le salon ${channelId}`);
  updateLeaderboard(client, channelId).catch((e) => console.error('[leaderboard] init', e.message));
  setInterval(() => {
    updateLeaderboard(client, channelId).catch((e) => console.error('[leaderboard] tick', e.message));
  }, intervalMs);
}

module.exports = { buildLeaderboardEmbed, updateLeaderboard, startLeaderboardLoop };
