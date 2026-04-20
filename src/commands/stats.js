const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser } = require('../utils/db');
const { getMmr, getMmrHistory, getMatches } = require('../utils/henrik');
const { rrLostToday, winrateAndHs } = require('../utils/stats');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Affiche tes stats Valorant (rank, RR, winrate, HS%, RR perdus aujourd\'hui)')
    .addUserOption((o) =>
      o.setName('membre')
        .setDescription('Voir les stats d\'un autre membre du serveur')
        .setRequired(false)),

  async execute(interaction) {
    const target = interaction.options.getUser('membre') || interaction.user;
    const linked = getUser(target.id);

    if (!linked) {
      const msg = target.id === interaction.user.id
        ? 'Tu n\'as pas encore lie ton compte. Utilise `/link riot_id tag` pour commencer.'
        : `${target.username} n'a pas lie de compte Valorant.`;
      return interaction.reply({ content: msg, ephemeral: true });
    }

    await interaction.deferReply();

    try {
      const { name, tag, region, puuid } = linked;

      const [mmr, mmrHistory, matches] = await Promise.all([
        getMmr(region, name, tag).catch(() => null),
        getMmrHistory(region, name, tag).catch(() => []),
        getMatches(region, name, tag, 'competitive', 20).catch(() => []),
      ]);

      const current = mmr?.current_data || mmr?.current || {};
      const rankName = current.currenttierpatched || current.tier?.name || 'Unranked';
      const rr = current.ranking_in_tier ?? current.rr ?? 0;
      const peak = mmr?.highest_rank?.patched_tier
        || mmr?.highest_rank?.tier
        || 'N/A';

      const rrDay = rrLostToday(mmrHistory);
      const perf = winrateAndHs(matches, puuid);

      const rankIcon = current.images?.large || current.images?.small || null;

      const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setAuthor({ name: `${name}#${tag}`, iconURL: target.displayAvatarURL() })
        .setTitle('Statistiques Valorant')
        .setThumbnail(rankIcon)
        .addFields(
          { name: 'Rank', value: `**${rankName}** — ${rr} RR`, inline: false },
          { name: 'Peak', value: String(peak), inline: true },
          { name: 'Region', value: (region || 'N/A').toUpperCase(), inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
          {
            name: 'Winrate (20 derniers)',
            value: perf.games > 0
              ? `**${perf.winrate.toFixed(1)}%** (${perf.wins}V / ${perf.losses}D)`
              : 'Aucune partie recente',
            inline: true,
          },
          {
            name: 'Headshot %',
            value: perf.games > 0 ? `**${perf.hs.toFixed(1)}%**` : 'N/A',
            inline: true,
          },
          { name: '\u200B', value: '\u200B', inline: true },
          {
            name: "Aujourd'hui",
            value: rrDay.games > 0
              ? `**${rrDay.net >= 0 ? '+' : ''}${rrDay.net} RR** sur ${rrDay.games} partie(s)\n` +
                `Gagnes: +${rrDay.gained} RR • Perdus: -${rrDay.lost} RR`
              : 'Aucune partie classee aujourd\'hui',
            inline: false,
          },
        )
        .setFooter({ text: 'Donnees: HenrikDev API' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const status = err.status;
      if (status === 429) {
        return interaction.editReply('Trop de requetes vers l\'API Valorant. Reessaie dans quelques secondes.');
      }
      if (status === 401 || status === 403) {
        return interaction.editReply('L\'API HenrikDev refuse l\'acces. L\'admin doit configurer `HENRIK_API_KEY`.');
      }
      console.error('stats error', err);
      return interaction.editReply(`Erreur API: \`${err.message}\``);
    }
  },
};
