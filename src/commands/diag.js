const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ping, getAccount, hasApiKey } = require('../utils/henrik');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('diag')
    .setDescription('Teste la connexion à l\'API HenrikDev et diagnostique les erreurs'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const results = [];
    results.push(`**Clé API HenrikDev** : ${hasApiKey() ? '✅ configurée' : '❌ NON configurée (HENRIK_API_KEY vide)'}`);

    try {
      await ping();
      results.push('**Ping API** : ✅ OK');
    } catch (err) {
      results.push(`**Ping API** : ❌ ${err.message}`);
    }

    try {
      const acc = await getAccount('TenZ', '0001');
      results.push(`**Lookup test (TenZ#0001)** : ✅ ${acc ? `région ${acc.region}` : 'pas de data'}`);
    } catch (err) {
      results.push(`**Lookup test (TenZ#0001)** : ❌ ${err.message}`);
    }

    const embed = new EmbedBuilder()
      .setColor(0xff4655)
      .setTitle('🔧 Diagnostic DiscordCave')
      .setDescription(results.join('\n'))
      .setFooter({ text: hasApiKey() ? '' : 'Sans clé API, la plupart des endpoints échouent' });

    await interaction.editReply({ embeds: [embed] });
  },
};
