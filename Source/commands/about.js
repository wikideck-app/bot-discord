const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder().setName('about').setDescription('Renvoi des informations sur le bot (testcommand)'),
	async execute(interaction) {
		await interaction.reply('Je suis WikiDeck, un bot Discord conçu pour vous aider à gérer vos cartes et informations de manière efficace.');
	},
};