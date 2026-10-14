const {
	AttachmentBuilder, ContainerBuilder, LabelBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ModalBuilder,
	SeparatorBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { t } = require('./i18n.js');
const { generatePatchNoteBanner, formatVersion } = require('./patchNoteBanner.js');

const PATCHNOTE_MODAL_PREFIX = 'patchnote:';
const BANNER_FILE = 'patchnote.png';
const TARGETS = {
	site: { channelVariable: 'PATCHNOTE_SITE_CHANNEL_ID', color: 0xe9b442 },
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

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	const title = interaction.fields.getTextInputValue('title').trim();
	const version = interaction.fields.getTextInputValue('version').trim();
	const content = interaction.fields.getTextInputValue('content').trim();
	const header = t('patchnote.header', undefined, { target: t(`patchnote.target.${targetName}`) });
	const banner = await generatePatchNoteBanner({ target: targetName, title, version });

	const container = new ContainerBuilder()
		.setAccentColor(target.color)
		.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder()
			.setURL(`attachment://${BANNER_FILE}`)
			.setDescription(`${version ? `${header} · ${formatVersion(version)}` : header} — ${title}`)))
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
		.addSeparatorComponents(new SeparatorBuilder())
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(
			`-# ${t('patchnote.footer', undefined, { user: interaction.user.username })} · <t:${Math.floor(Date.now() / 1000)}:f>`,
		));

	const roleId = process.env.PATCHNOTE_ROLE_ID;
	const components = roleId ? [new TextDisplayBuilder().setContent(`<@&${roleId}>`), container] : [container];
	const channel = await interaction.client.channels.fetch(channelId);
	const message = await channel.send({
		flags: MessageFlags.IsComponentsV2,
		components,
		files: [new AttachmentBuilder(banner, { name: BANNER_FILE })],
		allowedMentions: { parse: [], roles: roleId ? [roleId] : [] },
	});
	await interaction.editReply(t('patchnote.published', undefined, { url: message.url }));
}

module.exports = { PATCHNOTE_MODAL_PREFIX, buildPatchNoteModal, publishPatchNote };
