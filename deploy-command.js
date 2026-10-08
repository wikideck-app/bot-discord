// envoi des commandes slash au serveur Discord pour éviter de relancer le bot

const { REST, Routes } = require('discord.js');
const { CLIENT_ID: clientId, GUILD_ID: guildId, DISCORD_TOKEN: token } = require('dotenv').config().parsed;
const path = require('node:path');
const { getCommandFiles } = require('./Source/Helper/loadCommands');

const commands = [];
const commandsPath = path.join(__dirname, 'Source', 'commands');
const commandFiles = getCommandFiles(commandsPath);
for (const filePath of commandFiles) {
	const command = require(filePath);
	if ('data' in command && 'execute' in command) {
		commands.push(command.data.toJSON());
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

const rest = new REST().setToken(token);

(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		console.error(error);
	}
})();