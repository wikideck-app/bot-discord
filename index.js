
const fs = require('node:fs');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
const { DISCORD_TOKEN: token } = require('dotenv').config().parsed;
const { getCommandFiles } = require('./Source/Helper/loadCommands');
const { initDatabase } = require('./Source/Helper/database');


const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });


client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    client.commands = new Collection(); 
    const commandsPath = path.join(__dirname, 'Source', 'commands');
    const commandFiles = getCommandFiles(commandsPath);
    for (const filePath of commandFiles) {
        const command = require(filePath);
        // ajout commande dans la collection
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
});

// Chargement dynamique des évènements du bot (ex: message de bienvenue) depuis Source/events
const eventsPath = path.join(__dirname, 'Source', 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));
for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return; 
	const command = interaction.client.commands.get(interaction.commandName);
	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}
	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);

		try {
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: 'There was an error while executing this command!',
					flags: MessageFlags.Ephemeral,
				});
			} else {
				await interaction.reply({
					content: 'There was an error while executing this command!',
					flags: MessageFlags.Ephemeral,
				});
			}
		} catch (replyError) {
			console.error('[ERROR] Impossible de répondre à l\'interaction après une erreur :', replyError);
		}
	}
});

// sécurité globale
client.on(Events.Error, (error) => {
	console.error('[ERROR] Erreur du client Discord :', error);
});
process.on('unhandledRejection', (reason) => {
	console.error('[ERROR] Promesse rejetée non gérée :', reason);
});

// On crée les tables MySQL avant de connecter le bot, pour que toute requête lancée après le login trouve un schéma prêt.
initDatabase()
	.then(() => client.login(token))
	.catch((error) => {
		console.error('[ERROR] Impossible de se connecter à la base de données MySQL :', error);
		process.exit(1);
	});