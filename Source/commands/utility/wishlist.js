const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { wishlistReply } = require('../../api/marketAlerts.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('wishlist')
		.setNameLocalization('fr', 'envies')
		.setDescription('Refresh and show the wishlist cards you get alerts for')
		.setDescriptionLocalization('fr', 'Mettre à jour et afficher les cartes suivies de ta liste d\'envies'),
	async execute(interaction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await interaction.editReply(await wishlistReply(interaction.user.id));
	},
};
