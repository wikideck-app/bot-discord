const path = require('node:path');
const { pool } = require('./database.js');
const { t } = require('./i18n.js');
const {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
} = require('discord.js');


const TICKET_OPEN_ID = 'ticket:open';
const TICKET_CLOSE_ID = 'ticket:close';
const TICKET_REPORT_ID = 'ticket:report';
// MySQL étant asynchrone, le compteur ne peut plus être initialisé de façon synchrone au chargement du module :
// il est chargé une seule fois, de façon paresseuse, via ensureTicketNumberLoaded().
let TICKET_NUMBER_ID = null;
const CLOSE_DELAY_MS = 5000;
const MAX_TRANSCRIPT_MESSAGES = 1000;
const TICKET_BANNER_PATH = path.join(__dirname, '..', 'Assets', 'ticket-banner.png');

function buildPanel() {

	const banner = new AttachmentBuilder(TICKET_BANNER_PATH, { name: 'ticket-banner.png' });
	const embed = new EmbedBuilder()
		.setColor(0x5865F2)
		.setImage('attachment://ticket-banner.png');
	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId(TICKET_OPEN_ID).setLabel('Ouvrir un ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary),
		new ButtonBuilder().setCustomId(TICKET_REPORT_ID).setLabel('Rapporter un Bug').setEmoji('🐛').setStyle(ButtonStyle.Primary),
	);
	return { embeds: [embed], components: [row], files: [banner] };
}


async function ensureTicketNumberLoaded() {
	if (TICKET_NUMBER_ID === null) {
		const [rows] = await pool.query('SELECT id FROM ticket ORDER BY id DESC LIMIT 1');
		TICKET_NUMBER_ID = rows[0]?.id ?? 0;
	}
}

function ticketTopic(kind, userId) {
	return `ticket:${kind}:${userId}`;
}

async function getLocale(userId) {
	const [rows] = await pool.query('SELECT * FROM `User` WHERE user_id = ?', [userId]);
	return rows[0]?.locale ?? 'fr';
}


function parseTicketTopic(topic) {
	const match = /^ticket:(open|report):(\d+)$/.exec(topic ?? '');
	if (!match) return null;
	return { kind: match[1], userId: match[2] };
}


const TICKET_KINDS = {
	open: {
		envVar: 'TICKET_CATEGORY_ID',
		namePrefix: 'ticket',
		descriptionKey: 'ticket.openedDescription',
	},
	report: {
		envVar: 'TICKET_REPORT_CATEGORY_ID',
		namePrefix: 'report',
		descriptionKey: 'ticket.reportedDescription',
	},
};

async function createTicket(interaction, kind) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	await ensureTicketNumberLoaded();

	const { envVar, namePrefix, descriptionKey } = TICKET_KINDS[kind];
	const { guild, user } = interaction;
	const locale = await getLocale(user.id);
	const categoryId = process.env[envVar];
	if (!categoryId) {
		await interaction.editReply(`${envVar} n'est pas défini dans le fichier .env.`);
		return;
	}

	const existing = guild.channels.cache.find((c) => c.parentId === categoryId && c.topic === ticketTopic(kind, user.id));
	if (existing) {
		await interaction.editReply(t('ticket.alreadyOpen', locale, { channel: existing }));
		return;
	}

	const channel = await guild.channels.create({
		name: `${namePrefix}-${user.username}-${TICKET_NUMBER_ID++}`,
		type: ChannelType.GuildText,
		parent: categoryId,
		topic: ticketTopic(kind, user.id),
		permissionOverwrites: [
			{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
			{
				id: user.id,
				allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
			},
			{
				id: interaction.client.user.id,
				allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageChannels],
			},
		],
	});

	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId(TICKET_CLOSE_ID).setLabel(t('ticket.close', locale)).setEmoji('🔒').setStyle(ButtonStyle.Danger),
	);
	await channel.send({
		content: `${user}`,
		embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(t(descriptionKey, locale))],
		components: [row],
	});

	await interaction.editReply(t('ticket.created', locale, { channel }));
	await pool.query('INSERT INTO ticket (name, kind, user_id) VALUES (?, ?, ?)', [channel.name, kind, user.id]);
}

async function openTicket(interaction) {
	await createTicket(interaction, 'open');
}

async function reportTicket(interaction) {
	await createTicket(interaction, 'report');
}

async function buildTranscript(channel) {
	const messages = [];
	let before;
	while (messages.length < MAX_TRANSCRIPT_MESSAGES) {
		const batch = await channel.messages.fetch({ limit: 100, before });
		if (batch.size === 0) break;
		messages.push(...batch.values());
		before = batch.last().id;
	}

	return messages
		.reverse()
		.map((m) => {
			const attachments = m.attachments.map((a) => a.url).join(' ');
			return `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}${attachments ? ` ${attachments}` : ''}`;
		})
		.join('\n');
}

async function closeTicket(interaction) {
	const { channel, user, memberPermissions } = interaction;
	const isOwner = parseTicketTopic(channel.topic)?.userId === user.id;
	const isStaff = memberPermissions.has(PermissionFlagsBits.ManageChannels);
	if (!isOwner && !isStaff) {
		await interaction.reply({ content: t('ticket.cannotClose', await getLocale(user.id)), flags: MessageFlags.Ephemeral });
		return;
	}

	await interaction.deferReply();

	const transcriptChannelId = process.env.TICKET_TRANSCRIPT_CHANNEL_ID;
	if (transcriptChannelId) {
		const transcriptChannel = await interaction.guild.channels.fetch(transcriptChannelId).catch(() => null);
		if (transcriptChannel?.isTextBased()) {
			const text = await buildTranscript(channel);
			const file = new AttachmentBuilder(Buffer.from(text || '(aucun message)', 'utf-8'), { name: `${channel.name}.txt` });
			await transcriptChannel.send({ content: `Transcript de **${channel.name}** (fermé par ${user.tag})`, files: [file] });
		}
	}
	
	await interaction.editReply(`Ticket fermé, ce salon sera supprimé dans ${CLOSE_DELAY_MS / 1000} secondes.`);
	setTimeout(() => {
		channel.delete('Ticket fermé').catch((error) => console.error('[ERROR] Suppression du ticket impossible :', error));
	}, CLOSE_DELAY_MS);
	await pool.query('UPDATE ticket SET isClosed = TRUE WHERE name = ?', [channel.name]);
}

module.exports = { TICKET_OPEN_ID, TICKET_CLOSE_ID, TICKET_REPORT_ID, buildPanel, openTicket, reportTicket, closeTicket };
