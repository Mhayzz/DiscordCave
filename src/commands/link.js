const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAccount } = require('../utils/henrik');
const { addAccount, MAX_ACCOUNTS } = require('../utils/db');
const { refreshLeaderboardSoon } = require('../leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription(`Lie un compte Valorant à ton Discord (max ${MAX_ACCOUNTS})`)
    .addStringOption((o) =>
      o.setName('riot_id')
        .setDescription('Ton pseudo Riot (avant le #)')
        .setRequired(true))
    .addStringOption((o) =>
      o.setName('tag')
        .setDescription('Ton tag Riot (après le #)')
        .setRequired(true)),

  async execute(interaction) {
    const name = interaction.options.getString('riot_id').replace(/[#\s]/g, '');
    const tag = interaction.options.getString('tag').replace(/[#\s]/g, '');

    if (!name || !tag) {
      return interaction.reply({
        content: 'Pseudo ou tag invalide. Exemple : `/link riot_id:Killu tag:667`',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const account = await getAccount(name, tag);
      if (!account) {
        return interaction.editReply(`Compte Riot \`${name}#${tag}\` introuvable.`);
      }

      const result = addAccount(interaction.user.id, {
        name: account.name,
        tag: account.tag,
        region: account.region,
        puuid: account.puuid,
      });

      if (result.reason === 'duplicate') {
        return interaction.editReply(`\`${account.name}#${account.tag}\` est déjà lié à ton compte.`);
      }
      if (result.reason === 'max') {
        return interaction.editReply(`Tu as atteint le maximum de ${MAX_ACCOUNTS} comptes liés. Utilise \`/unlink\` pour en retirer un.`);
      }

      const embed = new EmbedBuilder()
        .setColor(0x00ff88)
        .setTitle('✅ Compte lié')
        .setDescription(`**${account.name}#${account.tag}** est maintenant associé à <@${interaction.user.id}>`)
        .addFields(
          { name: 'Région', value: (account.region || 'N/A').toUpperCase(), inline: true },
          { name: 'Niveau', value: String(account.account_level ?? 'N/A'), inline: true },
          { name: 'Comptes liés', value: `${result.total} / ${MAX_ACCOUNTS}`, inline: true },
        )
        .setThumbnail(account.card?.small || null);

      await interaction.editReply({ embeds: [embed] });
      refreshLeaderboardSoon(interaction.client);
    } catch (err) {
      const status = err.status;
      if (status === 404) {
        return interaction.editReply(`Compte Riot \`${name}#${tag}\` introuvable. Vérifie le pseudo et le tag exacts (sans le #).`);
      }
      if (status === 429) {
        return interaction.editReply('Trop de requêtes vers l\'API Valorant. Réessaie dans quelques secondes.');
      }
      if (status === 401 || status === 403) {
        return interaction.editReply('L\'API HenrikDev refuse l\'accès. L\'admin doit configurer `HENRIK_API_KEY` (https://docs.henrikdev.xyz/).');
      }
      console.error('[link]', err);
      return interaction.editReply(`Erreur API : \`${err.message}\``);
    }
  },
};
