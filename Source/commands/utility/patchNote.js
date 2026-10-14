const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildPatchNoteModal } = require('../../helper/patchNote.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('patchnote')
		.setDescription('Publish a patch note for the website or the Discord')
		.setDescriptionLocalization('fr', 'Publier une patch note du site ou du Discord')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
		.addStringOption((option) => option
			.setName('target')
			.setNameLocalization('fr', 'cible')
			.setDescription('What the patch note is about')
			.setDescriptionLocalization('fr', 'Ce que concerne la patch note')
			.setRequired(true)
			.addChoices(
				{ name: 'Website', name_localizations: { fr: 'Site' }, value: 'site' },
				{ name: 'Discord', value: 'discord' },
			)),
	async execute(interaction) {
		await interaction.showModal(buildPatchNoteModal(interaction.options.getString('target')));
	},
};
