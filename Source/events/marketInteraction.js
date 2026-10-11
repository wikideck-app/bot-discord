const { Events } = require('discord.js');
const { REFRESH_WISHLIST_ID, DISABLE_ALERTS_ID, ENABLE_ALERTS_ID, handleMarketButton } = require('../api/marketAlerts');

const MARKET_BUTTON_IDS = [REFRESH_WISHLIST_ID, DISABLE_ALERTS_ID, ENABLE_ALERTS_ID];

module.exports = {
	name: Events.InteractionCreate,
	once: false,
	async execute(interaction) {
		if (!interaction.isButton() || !MARKET_BUTTON_IDS.includes(interaction.customId)) return;

		try {
			await handleMarketButton(interaction);
		} catch (error) {
			console.error('[ERROR] Bouton des alertes marché en échec :', error);
		}
	},
};
