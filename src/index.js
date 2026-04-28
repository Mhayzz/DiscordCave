require('dotenv').config();
const { Client, Collection, GatewayIntentBits, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { deployCommands } = require('./deploy-commands');
const { startLeaderboardLoop } = require('./leaderboard');
const { hasApiKey } = require('./utils/henrik');
const { init: initDb, repairInvalid } = require('./utils/db');
const { runSeed } = require('./seed');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command?.data && command?.execute) {
    client.commands.set(command.data.name, command);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ DiscordCave en ligne : ${c.user.tag}`);
  console.log(`   HENRIK_API_KEY : ${hasApiKey() ? '✅ configurée' : '❌ MANQUANTE (demande une clé sur https://docs.henrikdev.xyz/)'}`);
  console.log(`   LEADERBOARD_CHANNEL_ID : ${process.env.LEADERBOARD_CHANNEL_ID || '❌ non défini'}`);
  console.log(`   Commandes chargées : ${client.commands.size} (${[...client.commands.keys()].join(', ')})`);
  c.user.setActivity('Valorant | /stats', { type: 0 });

  if (process.env.DEPLOY_COMMANDS_ON_START === 'true') {
    try {
      const { count, scope } = await deployCommands();
      console.log(`${count} commande(s) deployee(s) au demarrage (${scope}).`);
    } catch (err) {
      console.error('Echec du deploiement des commandes au demarrage:', err.message);
    }
  }

  try {
    await initDb(c);
  } catch (err) {
    console.error('[db] init échoué:', err.message);
  }

  try {
    await repairInvalid();
  } catch (err) {
    console.error('[db] repair échoué:', err.message);
  }

  try {
    await runSeed();
  } catch (err) {
    console.error('[seed] erreur globale:', err.message);
  }

  startLeaderboardLoop(c);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author?.bot) return;
  if (!process.env.LEADERBOARD_CHANNEL_ID) return;
  if (message.channelId !== process.env.LEADERBOARD_CHANNEL_ID) return;
  setTimeout(() => {
    message.delete().catch(() => {});
  }, 10000);
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (member.user.bot) return;
  const roleName = (process.env.DEFAULT_ROLE_NAME || 'caillou').toLowerCase();
  const role = member.guild.roles.cache.find((r) => r.name.toLowerCase() === roleName);
  if (!role) {
    console.warn(`[welcome] rôle "${roleName}" introuvable dans ${member.guild.name}`);
    return;
  }
  try {
    await member.roles.add(role, 'DiscordCave: rôle par défaut');
    console.log(`[welcome] ${role.name} attribué à ${member.user.tag}`);
  } catch (err) {
    console.error(`[welcome] échec attribution ${role.name} à ${member.user.tag}:`, err.message);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  if (interaction.isAutocomplete()) {
    if (typeof command.autocomplete === 'function') {
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`Erreur autocomplete /${interaction.commandName}:`, err);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Erreur dans /${interaction.commandName}:`, err);
    const payload = { content: 'Une erreur est survenue lors de l\'execution de la commande.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }

  if (interaction.replied || interaction.deferred) {
    setTimeout(() => {
      interaction.deleteReply().catch(() => {});
    }, 30000);
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN manquant dans .env');
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
