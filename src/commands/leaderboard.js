const { SlashCommandBuilder } = require('discord.js');
const { updateLeaderboard, buildLeaderboardEmbed } = require('../leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Force la mise a jour du classement Valorant'),

  async execute(interaction) {
    const channelId = process.env.LEADERBOARD_CHANNEL_ID;

    if (!channelId) {
      await interaction.deferReply({ ephemeral: true });
      const embed = await buildLeaderboardEmbed();
      return interaction.editReply({ embeds: [embed] });
    }

    await interaction.deferReply({ ephemeral: true });
    try {
      await updateLeaderboard(interaction.client, channelId);
      await interaction.editReply(`Classement mis a jour dans <#${channelId}>.`);
    } catch (err) {
      console.error('leaderboard cmd', err);
      await interaction.editReply('Erreur lors de la mise a jour du classement.');
    }
  },
};
