const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAccounts, MAX_ACCOUNTS } = require('../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('accounts')
    .setDescription('Liste les comptes Valorant liés')
    .addUserOption((o) =>
      o.setName('membre')
        .setDescription('Voir les comptes d\'un autre membre')
        .setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('membre') || interaction.user;
    const accounts = getAccounts(target.id);

    if (accounts.length === 0) {
      return interaction.reply({
        content: target.id === interaction.user.id
          ? 'Tu n\'as aucun compte lié. Utilise `/link riot_id tag` pour commencer.'
          : `${target.username} n'a aucun compte lié.`,
        ephemeral: true,
      });
    }

    const lines = accounts.map((a, i) =>
      `**${i + 1}.** \`${a.name}#${a.tag}\` — région **${(a.region || '?').toUpperCase()}**`
    );

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
      .setTitle('Comptes Valorant liés')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `${accounts.length} / ${MAX_ACCOUNTS}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
