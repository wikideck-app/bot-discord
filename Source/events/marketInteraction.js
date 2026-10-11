const { Events } = require('discord.js');
const { DISABLE_ALERTS_ID, ENABLE_ALERTS_ID, toggleAlerts } = require('../api/marketAlerts');

module.exports = {
	name: Events.InteractionCreate,
	once: false,
	async execute(interaction) {
		if (!interaction.isButton()) return;
		if (interaction.customId !== DISABLE_ALERTS_ID && interaction.customId !== ENABLE_ALERTS_ID) return;

		try {
			await toggleAlerts(interaction);
		} catch (error) {
			console.error('[ERROR] Bouton des alertes marché en échec :', error);
		}
	},
};
