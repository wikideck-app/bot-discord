const { Events } = require('discord.js');
const { PATCHNOTE_MODAL_PREFIX, publishPatchNote } = require('../helper/patchNote');

module.exports = {
	name: Events.InteractionCreate,
	once: false,
	async execute(interaction) {
		if (!interaction.isModalSubmit() || !interaction.customId.startsWith(PATCHNOTE_MODAL_PREFIX)) return;

		try {
			await publishPatchNote(interaction);
		} catch (error) {
			console.error('[ERROR] Publication de la patch note impossible :', error);
		}
	},
};
