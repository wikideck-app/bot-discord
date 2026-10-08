const { Events, MessageFlags } = require('discord.js');
const { TICKET_OPEN_ID, TICKET_CLOSE_ID, TICKET_REPORT_ID, openTicket, reportTicket, closeTicket } = require('../Helper/ticket');

module.exports = {
	name: Events.InteractionCreate,
	once: false,
	async execute(interaction) {
		if (!interaction.isButton()) return;

		try {
			if (interaction.customId === TICKET_OPEN_ID) {
				await openTicket(interaction);
			} else if (interaction.customId === TICKET_REPORT_ID) {
				await reportTicket(interaction);
			} else if (interaction.customId === TICKET_CLOSE_ID) {
				await closeTicket(interaction);
			}
		} catch (error) {
			console.error('[ERROR] Interaction de ticket en échec :', error);
			try {
				const message = { content: 'Une erreur est survenue avec le ticket.', flags: MessageFlags.Ephemeral };
				if (interaction.deferred || interaction.replied) {
					await interaction.followUp(message);
				} else {
					await interaction.reply(message);
				}
			} catch (replyError) {
				console.error('[ERROR] Impossible de répondre à l\'interaction :', replyError);
			}
		}
	},
};
