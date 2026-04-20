const { EmbedBuilder } = require('discord.js');
const { getAllAccounts, getMeta, setMeta } = require('./utils/db');
const { getMmr } = require('./utils/henrik');

const META_KEY = 'leaderboardMessageId';

const TIER_EMOJI = {
  iron: '⚫', bronze: '🟤', silver: '⚪', gold: '🟡',
  platinum: '🔵', diamond: '💠', ascendant: '🟢',
  immortal: '🔴', radiant: '🌟',
};

function tierEmoji(rankName = '') {
  const key = rankName.toLowerCase().split(' ')[0];
  return TIER_EMOJI[key] || '▫️';
}

async function fetchAccountMmr(account) {
  try {
    const mmr = await getMmr(account.region, account.name, account.tag);
    const current = mmr?.current_data || mmr?.current || {};
    const peak = mmr?.highest_rank || mmr?.peak || {};
    return {
      ...account,
      ok: true,
      rankName: current.currenttierpatched || current.tier?.name || 'Unranked',
      rr: current.ranking_in_tier ?? current.rr ?? 0,
      elo: current.elo ?? 0,
      peakName: peak.patched_tier || peak.tier?.name || peak.tier || null,
    };
  } catch {
    return { ...account, ok: false, rankName: 'N/A', rr: 0, elo: -1, peakName: null };
  }
}

function groupByUser(enriched) {
  const byUser = new Map();
  for (const a of enriched) {
    if (!byUser.has(a.discordId)) byUser.set(a.discordId, []);
    byUser.get(a.discordId).push(a);
  }
  const groups = [];
  for (const [discordId, accounts] of byUser) {
    const valid = accounts.filter((a) => a.ok);
    if (valid.length === 0) {
      groups.push({ discordId, best: null, others: accounts });
      continue;
    }
    valid.sort((a, b) => b.elo - a.elo);
    groups.push({ discordId, best: valid[0], others: valid.slice(1) });
  }
  return groups;
}

async function buildLeaderboardEmbed() {
  const accounts = getAllAccounts();
  if (accounts.length === 0) {
    return new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle('🎯 Classement Valorant')
      .setDescription('Aucun joueur lié pour le moment.\nUtilisez `/link` pour participer !')
      .setTimestamp();
  }

  const enriched = await Promise.all(accounts.map(fetchAccountMmr));
  const groups = groupByUser(enriched);

  const ranked = groups.filter((g) => g.best).sort((a, b) => b.best.elo - a.best.elo);
  const errored = groups.filter((g) => !g.best);

  const medals = ['🥇', '🥈', '🥉'];
  const lines = ranked.map((g, i) => {
    const prefix = medals[i] || `\`#${String(i + 1).padStart(2, '0')}\``;
    const emoji = tierEmoji(g.best.rankName);
    const altsNote = g.others.length > 0
      ? ` *+${g.others.length} alt*`
      : '';
    return `${prefix} ${emoji} <@${g.discordId}> — **${g.best.rankName}** \`${g.best.rr} RR\` · \`${g.best.name}#${g.best.tag}\`${altsNote}`;
  });

  if (errored.length > 0) {
    lines.push('');
    lines.push(`*${errored.length} joueur(s) avec compte introuvable ou erreur API*`);
  }

  return new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle('🎯 Classement Valorant')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `${ranked.length} joueur(s) classé(s) · auto-update` })
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

function refreshLeaderboardSoon(client) {
  const channelId = process.env.LEADERBOARD_CHANNEL_ID;
  if (!channelId) return;
  updateLeaderboard(client, channelId)
    .catch((e) => console.error('[leaderboard] refresh', e.message));
}

function startLeaderboardLoop(client) {
  const channelId = process.env.LEADERBOARD_CHANNEL_ID;
  if (!channelId) {
    console.log('[leaderboard] LEADERBOARD_CHANNEL_ID non défini, leaderboard auto désactivé');
    return;
  }

  const minutes = Math.max(1, Number(process.env.LEADERBOARD_UPDATE_MINUTES || 15));
  const intervalMs = minutes * 60 * 1000;

  console.log(`[leaderboard] auto-update toutes les ${minutes} min dans le salon ${channelId}`);
  refreshLeaderboardSoon(client);
  setInterval(() => refreshLeaderboardSoon(client), intervalMs);
}

module.exports = {
  buildLeaderboardEmbed,
  updateLeaderboard,
  refreshLeaderboardSoon,
  startLeaderboardLoop,
};
