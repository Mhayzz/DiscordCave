const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAccount } = require('../utils/henrik');
const { linkUser } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('link')
    .setDescription('Lie ton compte Valorant a ton compte Discord')
    .addStringOption((o) =>
      o.setName('riot_id')
        .setDescription('Ton pseudo Riot (sans le #)')
        .setRequired(true))
    .addStringOption((o) =>
      o.setName('tag')
        .setDescription('Ton tag Riot (apres le #)')
        .setRequired(true)),

  async execute(interaction) {
    const name = interaction.options.getString('riot_id');
    const tag = interaction.options.getString('tag').replace(/^#/, '');

    await interaction.deferReply({ ephemeral: true });

    try {
      const account = await getAccount(name, tag);
      if (!account) {
        return interaction.editReply('Compte Riot introuvable. Verifie ton pseudo et ton tag.');
      }

      linkUser(interaction.user.id, {
        name: account.name,
        tag: account.tag,
        region: account.region,
        puuid: account.puuid,
      });

      const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setTitle('Compte lie avec succes !')
        .setDescription(`**${account.name}#${account.tag}** est maintenant associe a <@${interaction.user.id}>`)
        .addFields(
          { name: 'Region', value: (account.region || 'N/A').toUpperCase(), inline: true },
          { name: 'Niveau', value: String(account.account_level ?? 'N/A'), inline: true },
        )
        .setThumbnail(account.card?.small || null)
        .setFooter({ text: 'Utilise /stats pour voir tes statistiques' });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        return interaction.editReply('Compte Riot introuvable. Verifie le pseudo et le tag.');
      }
      if (status === 429) {
        return interaction.editReply('Trop de requetes vers l\'API Valorant. Reessaie dans quelques secondes.');
      }
      console.error('link error', err.message);
      return interaction.editReply('Erreur lors de la liaison du compte. Reessaie plus tard.');
    }
  },
};
