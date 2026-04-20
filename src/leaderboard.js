const { EmbedBuilder } = require('discord.js');
const { getAllAccounts, getMeta, setMeta } = require('./utils/db');
const { getMmr, getMmrHistory } = require('./utils/henrik');
const { rrLostToday } = require('./utils/stats');

const META_KEY = 'leaderboardMessageId';

const TIER_EMOJI_FALLBACK = {
  iron: '⚫', bronze: '🟤', silver: '⚪', gold: '🟡',
  platinum: '🔵', diamond: '💠', ascendant: '🟢',
  immortal: '🔴', radiant: '🌟',
};

function rankToEmojiName(rankName) {
  if (!rankName) return null;
  const n = rankName.trim();
  if (/^radiant$/i.test(n)) return 'Radiant_Rank';
  const m = n.match(/^(Iron|Bronze|Silver|Gold|Platinum|Diamond|Ascendant|Immortal)\s*(\d)$/i);
  if (!m) return null;
  const tier = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  return `${tier}_${m[2]}_Rank`;
}

function getRankEmoji(guild, rankName) {
  const customName = rankToEmojiName(rankName);
  if (guild && customName) {
    const emoji = guild.emojis.cache.find((e) => e.name === customName);
    if (emoji) return emoji.toString();
  }
  const key = (rankName || '').toLowerCase().split(' ')[0];
  return TIER_EMOJI_FALLBACK[key] || '▫️';
}

async function fetchAccountDetails(account) {
  try {
    const [mmr, history] = await Promise.all([
      getMmr(account.region, account.name, account.tag),
      getMmrHistory(account.region, account.name, account.tag).catch(() => []),
    ]);
    const current = mmr?.current_data || mmr?.current || {};
    const peak = mmr?.highest_rank || mmr?.peak || {};
    return {
      ...account,
      ok: true,
      rankName: current.currenttierpatched || current.tier?.name || 'Unranked',
      rr: current.ranking_in_tier ?? current.rr ?? 0,
      elo: current.elo ?? 0,
      peakName: peak.patched_tier || peak.tier?.name || peak.tier || null,
      day: rrLostToday(history),
    };
  } catch {
    return {
      ...account,
      ok: false,
      rankName: 'N/A',
      rr: 0,
      elo: -1,
      peakName: null,
      day: { games: 0, net: 0, gained: 0, lost: 0 },
    };
  }
}

function formatDay(day) {
  if (!day || day.games === 0) return '';
  const sign = day.net > 0 ? '📈 +' : day.net < 0 ? '📉 ' : '➖ ';
  return ` · ${sign}${day.net} RR`;
}

function positionBadge(i) {
  if (i === 0) return '🥇';
  if (i === 1) return '🥈';
  if (i === 2) return '🥉';
  return `\`#${String(i + 1).padStart(2, '0')}\``;
}

async function buildLeaderboardEmbed(guild = null) {
  const accounts = getAllAccounts();
  if (accounts.length === 0) {
    return new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle('🎯 Classement Valorant')
      .setDescription('Aucun joueur lié pour le moment.\nUtilise `/link riot_id tag` pour participer !')
      .setTimestamp();
  }

  const enriched = await Promise.all(accounts.map(fetchAccountDetails));

  const userBest = new Map();
  for (const acc of enriched) {
    if (!acc.ok) continue;
    const prev = userBest.get(acc.discordId);
    if (!prev || acc.elo > prev.elo) userBest.set(acc.discordId, acc);
  }

  const ranked = enriched
    .filter((a) => a.ok)
    .sort((a, b) => b.elo - a.elo);
  const errored = enriched.filter((a) => !a.ok);

  const lines = [];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');

  ranked.forEach((acc, i) => {
    const badge = positionBadge(i);
    const emoji = getRankEmoji(guild, acc.rankName);
    const isAlt = userBest.get(acc.discordId) !== acc;
    const altTag = isAlt ? ' 🔄' : '';
    const peak = acc.peakName ? `_peak ${acc.peakName}_` : '';
    const dayStr = formatDay(acc.day);

    lines.push(`${badge} ${emoji} **${acc.rankName}** · \`${acc.rr} RR\`${dayStr}`);
    lines.push(`┗ <@${acc.discordId}>${altTag} · \`${acc.name}#${acc.tag}\` · ${peak}`);
    lines.push('');
  });

  if (errored.length > 0) {
    lines.push(`⚠️ *${errored.length} compte(s) introuvable(s) ou en erreur API*`);
    for (const e of errored) {
      lines.push(`• <@${e.discordId}> · \`${e.name}#${e.tag}\``);
    }
  }

  const totalUsers = userBest.size;
  const totalAccounts = ranked.length;

  const embed = new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle('🎯 CLASSEMENT VALORANT')
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: `${totalUsers} joueur(s) · ${totalAccounts} compte(s) · auto-update` })
    .setTimestamp();

  return embed;
}

async function updateLeaderboard(client, channelId) {
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    console.warn(`[leaderboard] salon ${channelId} introuvable ou non textuel`);
    return;
  }

  if (channel.guild) {
    await channel.guild.emojis.fetch().catch(() => {});
  }

  const embed = await buildLeaderboardEmbed(channel.guild || null);
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
