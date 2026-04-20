const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAccount } = require('../utils/henrik');
const { addAccount, MAX_ACCOUNTS } = require('../utils/db');
const { updateLeaderboard } = require('../leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription(`Lie un compte Valorant a ton Discord (max ${MAX_ACCOUNTS})`)
    .addStringOption((o) =>
      o.setName('riot_id')
        .setDescription('Ton pseudo Riot (sans le #)')
        .setRequired(true))
    .addStringOption((o) =>
      o.setName('tag')
        .setDescription('Ton tag Riot (apres le #)')
        .setRequired(true)),

  async execute(interaction) {
    const name = interaction.options.getString('riot_id').replace(/^#/, '').trim();
    const tag = interaction.options.getString('tag').replace(/^#/, '').trim();

    await interaction.deferReply({ ephemeral: true });

    try {
      const account = await getAccount(name, tag);
      if (!account) {
        return interaction.editReply('Compte Riot introuvable. Verifie ton pseudo et ton tag.');
      }

      const result = addAccount(interaction.user.id, {
        name: account.name,
        tag: account.tag,
        region: account.region,
        puuid: account.puuid,
      });

      if (!result.ok && result.reason === 'duplicate') {
        return interaction.editReply(`\`${account.name}#${account.tag}\` est deja lie a ton compte Discord.`);
      }
      if (!result.ok && result.reason === 'max') {
        return interaction.editReply(`Tu as deja atteint le maximum de ${MAX_ACCOUNTS} comptes lies. Utilise \`/unlink\` pour en retirer un.`);
      }

      const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle('Compte lie avec succes !')
        .setDescription(`**${account.name}#${account.tag}** est maintenant associe a <@${interaction.user.id}>`)
        .addFields(
          { name: 'Region', value: (account.region || 'N/A').toUpperCase(), inline: true },
          { name: 'Niveau', value: String(account.account_level ?? 'N/A'), inline: true },
          { name: 'Comptes lies', value: `${result.total} / ${MAX_ACCOUNTS}`, inline: true },
        )
        .setThumbnail(account.card?.small || null)
        .setFooter({ text: 'Utilise /stats pour voir tes statistiques' });

      await interaction.editReply({ embeds: [embed] });

      const channelId = process.env.LEADERBOARD_CHANNEL_ID;
      if (channelId) {
        updateLeaderboard(interaction.client, channelId)
          .catch((e) => console.error('[leaderboard] refresh after link', e.message));
      }
    } catch (err) {
      const status = err.status;
      if (status === 404) {
        return interaction.editReply(`Compte Riot \`${name}#${tag}\` introuvable. Verifie le pseudo et le tag (sans le #).`);
      }
      if (status === 429) {
        return interaction.editReply('Trop de requetes vers l\'API Valorant. Reessaie dans quelques secondes.');
      }
      if (status === 401 || status === 403) {
        return interaction.editReply('L\'API HenrikDev refuse l\'acces. L\'admin doit configurer `HENRIK_API_KEY` (https://docs.henrikdev.xyz/).');
      }
      console.error('link error', err);
      return interaction.editReply(`Erreur API: \`${err.message}\``);
    }
  },
};
