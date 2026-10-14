const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { postPanel } = require('../../api/rankingPanel.js');
const { t } = require('../../helper/i18n.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('top10panel')
		.setDescription('Post the top 10 rankings in this channel, refreshed automatically')
		.setDescriptionLocalization('fr', 'Publie dans ce salon le top 10 des classements, mis à jour automatiquement')
		.setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
	async execute(interaction) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		await postPanel(interaction.client, interaction.channel);
		await interaction.editReply(t('ranking.posted'));
	},
};
