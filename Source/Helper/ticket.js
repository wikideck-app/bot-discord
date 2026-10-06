const path = require('node:path');
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

// Les customId sont préfixés par "ticket:" pour que l'event sache quelles interactions le concernent
const TICKET_OPEN_ID = 'ticket:open';
const TICKET_CLOSE_ID = 'ticket:close';
const TICKET_REPORT_ID = 'ticket:report';
const CLOSE_DELAY_MS = 5000;
const MAX_TRANSCRIPT_MESSAGES = 1000;
const TICKET_BANNER_PATH = path.join(__dirname, '..', 'Assets', 'ticket-banner.png');

function buildPanel() {
	// Discord ne peut pas lire un chemin local : on joint le fichier et on le référence via attachment://
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

// Le topic du salon stocke le type et l'ID du créateur : il sert à retrouver le propriétaire sans base de données
function ticketTopic(kind, userId) {
	return `ticket:${kind}:${userId}`;
}

// Extrait { kind, userId } d'un topic de salon, ou null si ce n'est pas un salon de ticket
function parseTicketTopic(topic) {
	const match = /^ticket:(open|report):(\d+)$/.exec(topic ?? '');
	if (!match) return null;
	return { kind: match[1], userId: match[2] };
}

// Config commune à "Ouvrir un ticket" et "Rapporter un Bug" : seuls la catégorie, le préfixe et le message changent
const TICKET_KINDS = {
	open: {
		envVar: 'TICKET_CATEGORY_ID',
		namePrefix: 'ticket',
		description: 'Décris ton problème, l\'équipe te répondra bientôt.',
	},
	report: {
		envVar: 'TICKET_REPORT_CATEGORY_ID',
		namePrefix: 'report',
		description: 'Décris le bug rencontré (étapes, capture d\'écran...), l\'équipe y jettera un oeil bientôt.',
	},
};

async function createTicket(interaction, kind) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const { envVar, namePrefix, description } = TICKET_KINDS[kind];
	const { guild, user } = interaction;
	const categoryId = process.env[envVar];
	if (!categoryId) {
		await interaction.editReply(`${envVar} n'est pas défini dans le fichier .env.`);
		return;
	}

	const existing = guild.channels.cache.find((c) => c.parentId === categoryId && c.topic === ticketTopic(kind, user.id));
	if (existing) {
		await interaction.editReply(`Tu as déjà un ticket ouvert : ${existing}`);
		return;
	}

	const channel = await guild.channels.create({
		name: `${namePrefix}-${user.username}`,
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
		new ButtonBuilder().setCustomId(TICKET_CLOSE_ID).setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
	);
	await channel.send({
		content: `${user}`,
		embeds: [new EmbedBuilder().setColor(0x5865F2).setDescription(description)],
		components: [row],
	});

	await interaction.editReply(`Ton ticket a été créé : ${channel}`);
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
		await interaction.reply({ content: 'Tu ne peux pas fermer ce ticket.', flags: MessageFlags.Ephemeral });
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
}

module.exports = { TICKET_OPEN_ID, TICKET_CLOSE_ID, TICKET_REPORT_ID, buildPanel, openTicket, reportTicket, closeTicket };
