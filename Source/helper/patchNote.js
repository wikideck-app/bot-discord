const { EmbedBuilder, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { t } = require('./i18n.js');

const PATCHNOTE_MODAL_PREFIX = 'patchnote:';
const TARGETS = {
	site: { channelVariable: 'PATCHNOTE_SITE_CHANNEL_ID', color: 0xa65cf0 },
	discord: { channelVariable: 'PATCHNOTE_DISCORD_CHANNEL_ID', color: 0x5865f2 },
};

function textField(id, label, style, maxLength, required) {
	const input = new TextInputBuilder().setCustomId(id).setStyle(style).setMaxLength(maxLength).setRequired(required);
	return new LabelBuilder().setLabel(label).setTextInputComponent(input);
}

function buildPatchNoteModal(target) {
	return new ModalBuilder()
		.setCustomId(`${PATCHNOTE_MODAL_PREFIX}${target}`)
		.setTitle(t('patchnote.header', undefined, { target: t(`patchnote.target.${target}`) }))
		.addLabelComponents(
			textField('title', t('patchnote.field.title'), TextInputStyle.Short, 100, true),
			textField('version', t('patchnote.field.version'), TextInputStyle.Short, 20, false),
			textField('content', t('patchnote.field.content'), TextInputStyle.Paragraph, 4000, true),
		);
}

const replyPrivately = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

async function publishPatchNote(interaction) {
	const targetName = interaction.customId.slice(PATCHNOTE_MODAL_PREFIX.length);
	const target = TARGETS[targetName];
	if (!target) return;

	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		await replyPrivately(interaction, t('patchnote.forbidden'));
		return;
	}
	const channelId = process.env[target.channelVariable];
	if (!channelId) {
		await replyPrivately(interaction, t('patchnote.noChannel', undefined, { variable: target.channelVariable }));
		return;
	}

	const version = interaction.fields.getTextInputValue('version').trim();
	const header = t('patchnote.header', undefined, { target: t(`patchnote.target.${targetName}`) });
	const embed = new EmbedBuilder()
		.setColor(target.color)
		.setAuthor({ name: version ? `${header} · ${version}` : header })
		.setTitle(interaction.fields.getTextInputValue('title').trim())
		.setDescription(interaction.fields.getTextInputValue('content').trim())
		.setFooter({ text: t('patchnote.footer', undefined, { user: interaction.user.username }) })
		.setTimestamp();

	const roleId = process.env.PATCHNOTE_ROLE_ID;
	const channel = await interaction.client.channels.fetch(channelId);
	const message = await channel.send({
		content: roleId ? `<@&${roleId}>` : undefined,
		embeds: [embed],
		allowedMentions: { parse: [], roles: roleId ? [roleId] : [] },
	});
	await replyPrivately(interaction, t('patchnote.published', undefined, { url: message.url }));
}

module.exports = { PATCHNOTE_MODAL_PREFIX, buildPatchNoteModal, publishPatchNote };
