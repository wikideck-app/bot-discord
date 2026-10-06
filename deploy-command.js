// envoi des commandes slash au serveur Discord 

const { REST, Routes } = require('discord.js');
const { CLIENT_ID: clientId, GUILD_ID: guildId, DISCORD_TOKEN: token } = require('dotenv').config().parsed;
const path = require('node:path');
const { getCommandFiles } = require('./Source/Helper/loadCommands');

const commands = [];
// Grab all the command files from the commands directory (et ses sous-dossiers)
const commandsPath = path.join(__dirname, 'Source', 'commands');
const commandFiles = getCommandFiles(commandsPath);
// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const filePath of commandFiles) {
	const command = require(filePath);
	if ('data' in command && 'execute' in command) {
		commands.push(command.data.toJSON());
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// and deploy your commands!
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();