const { SlashCommandBuilder } = require('discord.js');
const { removeAccount, getAccounts } = require('../utils/db');
const { refreshLeaderboardSoon } = require('../leaderboard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Délie un compte Valorant de ton Discord')
    .addStringOption((o) =>
      o.setName('compte')
        .setDescription('Le compte à délier (Pseudo#Tag). Vide = tout délier')
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
      return interaction.reply({ content: 'Tu n\'as aucun compte Valorant lié.', ephemeral: true });
    }

    const result = removeAccount(interaction.user.id, riotId || null);
    if (result.removed === 0) {
      return interaction.reply({ content: `Compte \`${riotId}\` introuvable dans tes liaisons.`, ephemeral: true });
    }

    const msg = result.removed > 1
      ? `${result.removed} comptes déliés.`
      : `Compte délié. Il te reste ${result.remaining} compte(s) lié(s).`;
    await interaction.reply({ content: msg, ephemeral: true });
    refreshLeaderboardSoon(interaction.client);
  },
};
