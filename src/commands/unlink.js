const { SlashCommandBuilder } = require('discord.js');
const { removeAccount, getAccounts } = require('../utils/db');
const { updateLeaderboard } = require('../leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Delie un compte Valorant de ton Discord')
    .addStringOption((o) =>
      o.setName('compte')
        .setDescription('Le compte a delier (format Pseudo#Tag). Vide = tout delier')
        .setRequired(false)
        .setAutocomplete(true)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const accounts = getAccounts(interaction.user.id);
    const choices = accounts
      .map((a) => `${a.name}#${a.tag}`)
      .filter((s) => s.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((s) => ({ name: s, value: s }));
    await interaction.respond(choices).catch(() => {});
  },

  async execute(interaction) {
    const riotId = interaction.options.getString('compte');
    const accounts = getAccounts(interaction.user.id);

    if (accounts.length === 0) {
      return interaction.reply({ content: 'Aucun compte Valorant n\'est lie.', ephemeral: true });
    }

    const result = removeAccount(interaction.user.id, riotId || null);
    if (result.removed === 0) {
      return interaction.reply({ content: `Compte \`${riotId}\` non trouve dans tes liaisons.`, ephemeral: true });
    }
    const msg = result.removed > 1
      ? `${result.removed} comptes delies.`
      : `Compte delie. Il te reste ${result.remaining} compte(s) lie(s).`;
    await interaction.reply({ content: msg, ephemeral: true });

    const channelId = process.env.LEADERBOARD_CHANNEL_ID;
    if (channelId) {
      updateLeaderboard(interaction.client, channelId)
        .catch((e) => console.error('[leaderboard] refresh after unlink', e.message));
    }
  },
};
