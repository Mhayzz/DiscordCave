const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { ensureRankRoles, deleteSimpleTierRoles, syncMemberRank } = require('../roles');
const { getAllAccounts } = require('../utils/db');
const { getMmr } = require('../utils/henrik');

async function fetchUserBestRank(accounts) {
  const byUser = new Map();
  for (const acc of accounts) {
    try {
      const mmr = await getMmr(acc.region, acc.name, acc.tag);
      const current = mmr?.current_data || mmr?.current || {};
      const elo = current.elo ?? 0;
      const rankName = current.currenttierpatched || current.tier?.name || null;
      if (!rankName) continue;
      const prev = byUser.get(acc.discordId);
      if (!prev || elo > prev.elo) byUser.set(acc.discordId, { elo, rankName });
    } catch (err) {
      console.warn(`[ranks sync] ${acc.name}#${acc.tag}: ${err.message}`);
    }
  }
  return byUser;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ranks')
    .setDescription('Gestion des rôles de rang Valorant')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s.setName('setup')
        .setDescription('Crée les 25 rôles de rang (Iron 1 → Radiant) et supprime les anciens rôles de tier simple'))
    .addSubcommand((s) =>
      s.setName('sync')
        .setDescription('Synchronise les rôles de rang de tous les membres liés')),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'Commande utilisable uniquement en serveur.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    await interaction.deferReply({ ephemeral: true });

    if (sub === 'setup') {
      try {
        const deleted = await deleteSimpleTierRoles(interaction.guild);
        const { created } = await ensureRankRoles(interaction.guild);
        await interaction.editReply(
          `✅ Setup terminé\n` +
          `• **${deleted}** ancien(s) rôle(s) de tier simple supprimé(s)\n` +
          `• **${created}** rôle(s) granulaire(s) créé(s)\n` +
          `\nUtilise \`/ranks sync\` pour attribuer les rôles aux membres.`,
        );
      } catch (err) {
        console.error('[ranks setup]', err);
        await interaction.editReply(`❌ Erreur : ${err.message}\n\nVérifie que le bot a la permission **Gérer les rôles** et que son rôle est au-dessus des rôles de rang.`);
      }
      return;
    }

    if (sub === 'sync') {
      try {
        const { roles: rolesMap } = await ensureRankRoles(interaction.guild);
        const accounts = getAllAccounts();
        const bestByUser = await fetchUserBestRank(accounts);

        let synced = 0;
        let failed = 0;
        for (const [discordId, info] of bestByUser) {
          const res = await syncMemberRank(interaction.guild, discordId, info.rankName, rolesMap);
          if (res.ok) synced += 1;
          else failed += 1;
        }

        await interaction.editReply(
          `✅ Sync terminé\n` +
          `• **${synced}** membre(s) synchronisé(s)\n` +
          (failed ? `• ${failed} échec(s)\n` : '') +
          `• ${bestByUser.size} membre(s) avec rank détecté`,
        );
      } catch (err) {
        console.error('[ranks sync]', err);
        await interaction.editReply(`❌ Erreur : ${err.message}`);
      }
      return;
    }
  },
};
