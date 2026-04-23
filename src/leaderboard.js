const { EmbedBuilder } = require('discord.js');
const { getAllAccounts, getMeta, setMeta } = require('./utils/db');
const { getMmr, getMmrHistory } = require('./utils/henrik');
const { rrLostToday } = require('./utils/stats');
const { ensureRankRoles, syncMemberRank } = require('./roles');

const META_KEY = 'leaderboardMessageId';
const HELP_META = 'helpMessageId';

const TIER_EMOJI_FALLBACK = {
  iron: '⚫', bronze: '🟤', silver: '⚪', gold: '🟡',
  platinum: '🔵', diamond: '💠', ascendant: '🟢',
  immortal: '🔴', radiant: '🌟',
};

const HELP_BLOCK =
  '**📖 Comment utiliser le bot**\n' +
  '• `/link riot_id:<pseudo> tag:<tag>` — lier un compte (max 3)\n' +
  '• `/stats [membre] [compte]` — voir les stats détaillées\n' +
  '• `/accounts` — lister tes comptes · `/unlink` — délier\n' +
  '• `/leaderboard` — forcer un refresh du classement\n' +
  '━━━━━━━━━━━━━━━━━━━━━━━━';

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
  let mmr = null;
  let history = [];
  let mmrError = null;

  try {
    mmr = await getMmr(account.region, account.name, account.tag);
  } catch (err) {
    mmrError = err.message;
    console.warn(`[lb] mmr ${account.name}#${account.tag}: ${err.message}`);
  }

  try {
    history = await getMmrHistory(account.region, account.name, account.tag);
  } catch {}

  const current = mmr?.current_data || mmr?.current || mmr || {};
  const peak = mmr?.highest_rank || mmr?.peak || {};
  return {
    ...account,
    ok: true,
    rankName: current.currenttierpatched || current.tier?.name || 'Unranked',
    rr: current.ranking_in_tier ?? current.rr ?? 0,
    elo: current.elo ?? 0,
    peakName: peak.patched_tier || peak.tier?.name || peak.tier || null,
    day: rrLostToday(history),
    mmrError,
  };
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
      .setTitle('🎯 CLASSEMENT VALORANT')
      .setDescription(`${HELP_BLOCK}\n\n_Aucun joueur lié pour le moment. Utilise \`/link\` pour participer !_`)
      .setTimestamp();
  }

  const enriched = await Promise.all(accounts.map(fetchAccountDetails));

  const userBest = new Map();
  for (const acc of enriched) {
    const prev = userBest.get(acc.discordId);
    if (!prev || acc.elo > prev.elo) userBest.set(acc.discordId, acc);
  }

  const ranked = [...enriched].sort((a, b) => b.elo - a.elo);

  const lines = [HELP_BLOCK, ''];

  ranked.forEach((acc, i) => {
    const badge = positionBadge(i);
    const emoji = getRankEmoji(guild, acc.rankName);
    const peakEmoji = acc.peakName ? getRankEmoji(guild, acc.peakName) : '';
    const peakStr = peakEmoji ? ` · peak ${peakEmoji}` : '';
    const dayStr = formatDay(acc.day);
    const rrStr = acc.elo > 0 ? `\`${acc.rr} RR\`` : '_pas de classée récente_';

    lines.push(`${badge} ${emoji} **${acc.rankName}** · ${rrStr}${dayStr}`);
    lines.push(`┗ <@${acc.discordId}> · \`${acc.name}#${acc.tag}\`${peakStr}`);
    lines.push('');
  });

  const totalUsers = userBest.size;
  const totalAccounts = ranked.length;

  return new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle('🎯 CLASSEMENT VALORANT')
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: `${totalUsers} joueur(s) · ${totalAccounts} compte(s) · auto-update` })
    .setTimestamp();
}

async function syncAllRankRoles(guild) {
  const accounts = getAllAccounts();
  const enriched = await Promise.all(accounts.map(fetchAccountDetails));
  const userBest = new Map();
  for (const acc of enriched) {
    if (acc.elo <= 0) continue;
    const prev = userBest.get(acc.discordId);
    if (!prev || acc.elo > prev.elo) userBest.set(acc.discordId, acc);
  }
  if (userBest.size === 0) return;

  const { roles: rolesMap } = await ensureRankRoles(guild);
  for (const [discordId, acc] of userBest) {
    await syncMemberRank(guild, discordId, acc.rankName, rolesMap).catch(() => {});
  }
}

async function cleanupOldHelpMessage(channel) {
  const helpId = getMeta(HELP_META);
  if (!helpId) return;
  const msg = await channel.messages.fetch(helpId).catch(() => null);
  if (msg) await msg.delete().catch(() => {});
  setMeta(HELP_META, null);
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

  await cleanupOldHelpMessage(channel);

  if (channel.guild) {
    syncAllRankRoles(channel.guild).catch((e) => console.error('[ranks sync]', e.message));
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
