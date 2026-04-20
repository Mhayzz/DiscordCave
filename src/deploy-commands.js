require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

function loadCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
    const command = require(path.join(commandsPath, file));
    if (command?.data) commands.push(command.data.toJSON());
  }
  return commands;
}

async function deployCommands() {
  const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
  if (!DISCORD_TOKEN || !CLIENT_ID) {
    throw new Error('DISCORD_TOKEN et CLIENT_ID sont requis');
  }
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);
  const data = await rest.put(route, { body: loadCommands() });
  return { count: data.length, scope: GUILD_ID ? `guilde ${GUILD_ID}` : 'global' };
}

if (require.main === module) {
  deployCommands()
    .then(({ count, scope }) => console.log(`${count} commande(s) deployee(s) (${scope}).`))
    .catch((err) => {
      console.error('Erreur deploiement:', err);
      process.exit(1);
    });
}

module.exports = { deployCommands };
