const { EmbedBuilder } = require('discord.js');
const { getMeta, setMeta } = require('./utils/db');

const META_KEY = 'helpMessageId';

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setColor(0xff4655)
    .setTitle('📖 Comment utiliser le bot')
    .setDescription(
      '**🔗 Lier ton compte Valorant**\n' +
      '`/link riot_id:<pseudo> tag:<tag>` — ex : `/link riot_id:Killu tag:667`\n' +
      'Tu peux lier jusqu\'à **3 comptes** (main + alts).\n' +
      '\n' +
      '**📊 Voir tes stats**\n' +
      '`/stats` — rank, RR, winrate, HS %, RR du jour\n' +
      '`/stats membre:@quelqu\'un` — voir les stats d\'un autre membre\n' +
      '`/stats compte:<Pseudo#Tag>` — choisir un compte précis si tu en as plusieurs\n' +
      '\n' +
      '**📋 Gérer tes comptes**\n' +
      '`/accounts` — lister tes comptes liés\n' +
      '`/unlink compte:<Pseudo#Tag>` — délier un compte (autocomplete)\n' +
      '`/unlink` — délier tous tes comptes\n' +
      '\n' +
      '**🎯 Classement**\n' +
      'Il se met à jour automatiquement toutes les 15 minutes et à chaque `/link` ou `/unlink`. Tape `/leaderboard` pour forcer un refresh.'
    )
    .setFooter({ text: 'Les stats proviennent de l\'API HenrikDev' });
}

async function updateHelpMessage(channel) {
  if (!channel) return;
  const embed = buildHelpEmbed();
  const existingId = getMeta(META_KEY);

  if (existingId) {
    const msg = await channel.messages.fetch(existingId).catch(() => null);
    if (msg) {
      await msg.edit({ embeds: [embed] });
      return;
    }
  }

  const sent = await channel.send({ embeds: [embed] });
  setMeta(META_KEY, sent.id);
}

module.exports = { updateHelpMessage, buildHelpEmbed };
