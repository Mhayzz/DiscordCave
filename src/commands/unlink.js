const { SlashCommandBuilder } = require('discord.js');
const { unlinkUser } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Delie ton compte Valorant de ton compte Discord'),

  async execute(interaction) {
    const removed = unlinkUser(interaction.user.id);
    if (removed) {
      await interaction.reply({ content: 'Ton compte Valorant a ete delie.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Aucun compte Valorant n\'etait lie.', ephemeral: true });
    }
  },
};
