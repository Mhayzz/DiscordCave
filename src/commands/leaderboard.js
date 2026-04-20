const { SlashCommandBuilder } = require('discord.js');
const { updateLeaderboard, buildLeaderboardEmbed } = require('../leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Force la mise à jour du classement Valorant'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channelId = process.env.LEADERBOARD_CHANNEL_ID;
    if (!channelId) {
      if (interaction.guild) await interaction.guild.emojis.fetch().catch(() => {});
      const embed = await buildLeaderboardEmbed(interaction.guild || null);
      return interaction.editReply({ embeds: [embed] });
    }

    try {
      await updateLeaderboard(interaction.client, channelId);
      await interaction.editReply(`Classement mis à jour dans <#${channelId}>.`);
    } catch (err) {
      console.error('[/leaderboard]', err);
      await interaction.editReply('Erreur lors de la mise à jour du classement.');
    }
  },
};
