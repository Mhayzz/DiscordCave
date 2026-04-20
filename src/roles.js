const RANK_NAMES = [
  'Iron 1', 'Iron 2', 'Iron 3',
  'Bronze 1', 'Bronze 2', 'Bronze 3',
  'Silver 1', 'Silver 2', 'Silver 3',
  'Gold 1', 'Gold 2', 'Gold 3',
  'Platinum 1', 'Platinum 2', 'Platinum 3',
  'Diamond 1', 'Diamond 2', 'Diamond 3',
  'Ascendant 1', 'Ascendant 2', 'Ascendant 3',
  'Immortal 1', 'Immortal 2', 'Immortal 3',
  'Radiant',
];

const RANK_SET = new Set(RANK_NAMES.map((n) => n.toLowerCase()));

const SIMPLE_TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'];
const SIMPLE_SET = new Set(SIMPLE_TIERS.map((t) => t.toLowerCase()));

const TIER_COLOR = {
  iron: 0x4A4A4A,
  bronze: 0x945621,
  silver: 0xB7B7B7,
  gold: 0xECC440,
  platinum: 0x4FA9B1,
  diamond: 0xC988E8,
  ascendant: 0x31E37D,
  immortal: 0xB31942,
  radiant: 0xFFF68F,
};

function rankColor(rankName) {
  const tier = rankName.toLowerCase().split(' ')[0];
  return TIER_COLOR[tier] || 0x808080;
}

function normalizeRank(rankName) {
  if (!rankName) return null;
  const n = rankName.trim();
  if (/^radiant$/i.test(n)) return 'Radiant';
  const m = n.match(/^(Iron|Bronze|Silver|Gold|Platinum|Diamond|Ascendant|Immortal)\s*(\d)$/i);
  if (!m) return null;
  const tier = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
  return `${tier} ${m[2]}`;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function ensureRankRoles(guild) {
  await guild.roles.fetch();
  const existing = new Map();
  for (const role of guild.roles.cache.values()) {
    if (RANK_SET.has(role.name.toLowerCase())) existing.set(role.name, role);
  }

  let created = 0;
  for (const rankName of RANK_NAMES) {
    if (existing.has(rankName)) continue;
    try {
      const role = await guild.roles.create({
        name: rankName,
        color: rankColor(rankName),
        mentionable: false,
        reason: 'DiscordCave: rank role',
      });
      existing.set(rankName, role);
      created += 1;
      await sleep(250);
    } catch (err) {
      console.error(`[roles] échec création ${rankName}:`, err.message);
    }
  }
  return { roles: existing, created };
}

async function deleteSimpleTierRoles(guild) {
  await guild.roles.fetch();
  let deleted = 0;
  for (const role of guild.roles.cache.values()) {
    if (SIMPLE_SET.has(role.name.toLowerCase())) {
      try {
        await role.delete('DiscordCave: remplacement par rangs granulaires');
        deleted += 1;
        await sleep(250);
      } catch (err) {
        console.warn(`[roles] impossible de supprimer ${role.name}:`, err.message);
      }
    }
  }
  return deleted;
}

async function syncMemberRank(guild, discordId, rankName, rolesMap) {
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return { ok: false, reason: 'member_not_found' };

  const normalized = normalizeRank(rankName);
  const target = normalized ? rolesMap.get(normalized) : null;

  const toRemove = [];
  for (const role of member.roles.cache.values()) {
    if (RANK_SET.has(role.name.toLowerCase()) && role.id !== target?.id) {
      toRemove.push(role);
    }
  }
  if (toRemove.length > 0) {
    await member.roles.remove(toRemove, 'DiscordCave: sync rank').catch(() => {});
  }

  if (target && !member.roles.cache.has(target.id)) {
    await member.roles.add(target, 'DiscordCave: sync rank').catch(() => {});
  }

  return { ok: true, assigned: target?.name || null };
}

module.exports = {
  RANK_NAMES,
  ensureRankRoles,
  deleteSimpleTierRoles,
  syncMemberRank,
  normalizeRank,
};
