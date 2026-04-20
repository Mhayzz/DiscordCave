const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAccounts, getAccountByRiotId } = require('../utils/db');
const { getMmr, getMmrHistory, getMatches } = require('../utils/henrik');
const { rrLostToday, winrateAndHs } = require('../utils/stats');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Affiche les stats Valorant (rank, RR, winrate, HS%, RR du jour)')
    .addUserOption((o) =>
      o.setName('membre')
        .setDescription('Voir les stats d\'un autre membre')
        .setRequired(false))
    .addStringOption((o) =>
      o.setName('compte')
        .setDescription('Compte spécifique si plusieurs liés (Pseudo#Tag)')
        .setRequired(false)
        .setAutocomplete(true)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const target = interaction.options.getUser('membre') || interaction.user;
    const accounts = getAccounts(target.id);
    const choices = accounts
      .map((a) => `${a.name}#${a.tag}`)
      .filter((s) => s.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((s) => ({ name: s, value: s }));
    await interaction.respond(choices).catch(() => {});
  },

  async execute(interaction) {
    const target = interaction.options.getUser('membre') || interaction.user;
    const wanted = interaction.options.getString('compte');
    const accounts = getAccounts(target.id);

    if (accounts.length === 0) {
      const msg = target.id === interaction.user.id
        ? 'Tu n\'as pas encore lié de compte. Utilise `/link riot_id tag` pour commencer.'
        : `${target.username} n'a lié aucun compte Valorant.`;
      return interaction.reply({ content: msg, ephemeral: true });
    }

    const linked = wanted ? getAccountByRiotId(target.id, wanted) : accounts[0];
    if (!linked) {
      return interaction.reply({
        content: `Compte \`${wanted}\` introuvable pour ${target.username}.`,
        ephemeral: true,
      });
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
      const peakObj = mmr?.highest_rank || mmr?.peak || {};
      const rankName = current.currenttierpatched || current.tier?.name || 'Unranked';
      const rr = current.ranking_in_tier ?? current.rr ?? 0;
      const peak = peakObj.patched_tier || peakObj.tier?.name || peakObj.tier || 'N/A';
      const rankIcon = current.images?.large || current.images?.small || null;

      const day = rrLostToday(mmrHistory);
      const perf = winrateAndHs(matches, puuid);

      const switcher = accounts.length > 1
        ? `\n\n*${accounts.length} comptes liés. Utilise l'option \`compte\` de \`/stats\` pour switcher.*`
        : '';

      const embed = new EmbedBuilder()
        .setColor(0xff4655)
        .setAuthor({ name: `${name}#${tag}`, iconURL: target.displayAvatarURL() })
        .setTitle('📊 Statistiques Valorant')
        .setThumbnail(rankIcon)
        .addFields(
          { name: '🎯 Rank actuel', value: `**${rankName}** — ${rr} RR`, inline: false },
          { name: '🏔️ Peak', value: String(peak), inline: true },
          { name: '🌍 Région', value: (region || 'N/A').toUpperCase(), inline: true },
          { name: '\u200B', value: '\u200B', inline: true },
          {
            name: '🏆 Winrate (20 derniers)',
            value: perf.games > 0
              ? `**${perf.winrate.toFixed(1)}%** (${perf.wins}V / ${perf.losses}D)`
              : '_Aucune partie récente_',
            inline: true,
          },
          {
            name: '🎯 Headshot %',
            value: perf.games > 0 ? `**${perf.hs.toFixed(1)}%**` : '_N/A_',
            inline: true,
          },
          { name: '\u200B', value: '\u200B', inline: true },
          {
            name: "📅 Aujourd'hui",
            value: day.games > 0
              ? `**${day.net >= 0 ? '+' : ''}${day.net} RR** sur ${day.games} partie(s)\nGagnés : +${day.gained} RR · Perdus : -${day.lost} RR${switcher}`
              : `_Aucune partie classée aujourd'hui_${switcher}`,
            inline: false,
          },
        )
        .setFooter({ text: 'Données : HenrikDev API' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      const status = err.status;
      if (status === 429) {
        return interaction.editReply('Trop de requêtes vers l\'API Valorant. Réessaie dans quelques secondes.');
      }
      if (status === 401 || status === 403) {
        return interaction.editReply('L\'API HenrikDev refuse l\'accès. L\'admin doit configurer `HENRIK_API_KEY`.');
      }
      console.error('[stats]', err);
      return interaction.editReply(`Erreur API : \`${err.message}\``);
    }
  },
};
