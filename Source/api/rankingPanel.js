const {
	ContainerBuilder, SectionBuilder, SeparatorBuilder, TextDisplayBuilder, ThumbnailBuilder, MessageFlags, escapeMarkdown,
} = require('discord.js');
const { pool } = require('../helper/database.js');
const { t } = require('../helper/i18n.js');
const api = require('./wikideckApi.js');

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TOP_SIZE = 10;
const MEDALS = ['🥇', '🥈', '🥉'];
// salon ou message supprimé, ou accès retiré au bot
const GONE_CODES = new Set([10003, 10008, 50001]);
const BOARDS = [
	{ key: 'collection', unit: 'ranking.unit.cards' },
	{ key: 'points', unit: 'ranking.unit.points' },
	{ key: 'battle', unit: 'ranking.unit.wins' },
];
const ACCENT_COLOR = 0xe9b442;

const formatNumber = (value) => Number(value ?? 0).toLocaleString('fr-FR');
const countLabel = (unit, count) => t(count === 1 ? `${unit}.one` : unit, undefined, { count: formatNumber(count) });

async function fetchRankings() {
	const [collection, points, battle, guilds] = await Promise.all([
		api.ranking.players('collection'),
		api.ranking.players('points'),
		api.ranking.players('battle'),
		api.ranking.guilds(),
	]);
	return { collection: collection?.entries ?? [], points: points?.entries ?? [], battle: battle?.entries ?? [], guilds: guilds ?? {} };
}

const timestamp = (date) => `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>`;

// podium en gras, rangs suivants en petit texte
function rankingLines(entries, name, detail) {
	if (entries.length === 0) return t('ranking.empty');
	return entries.slice(0, TOP_SIZE).map((entry, index) => (index < MEDALS.length
		? `${MEDALS[index]} **${name(entry)}** · ${detail(entry)}`
		: `-# **${index + 1}.** ${name(entry)} · ${detail(entry)}`)).join('\n');
}

function boardBlock(title, lines, imageUrl) {
	const text = new TextDisplayBuilder().setContent(`### ${title}\n${lines}`);
	if (!imageUrl) return text;
	return new SectionBuilder().addTextDisplayComponents(text).setThumbnailAccessory(new ThumbnailBuilder().setURL(imageUrl));
}

function buildRankingMessage(rankings) {
	const container = new ContainerBuilder()
		.setAccentColor(ACCENT_COLOR)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent([
			`## ${t('ranking.header.title')}`,
			`-# ${t('ranking.header.updated', undefined, { date: timestamp(Date.now()) })} · ${t('ranking.header.publicOnly')}`,
		].join('\n')));

	const blocks = BOARDS.map(({ key, unit }) => {
		const entries = rankings[key];
		const lines = rankingLines(entries, (entry) => escapeMarkdown(entry.username), (entry) => countLabel(unit, entry.score));
		return boardBlock(t(`ranking.${key}.title`), lines, entries[0]?.avatarUrl);
	});

	const { entries = [], weekEndsAt } = rankings.guilds;
	let guildLines = rankingLines(entries, (entry) => escapeMarkdown(entry.name), (entry) => t('ranking.guilds.entry', undefined, {
		points: formatNumber(entry.points),
		members: countLabel('ranking.unit.members', entry.members),
	}));
	if (weekEndsAt) guildLines += `\n-# ${t('ranking.guilds.weekEnds', undefined, { date: timestamp(weekEndsAt) })}`;
	blocks.push(boardBlock(t('ranking.guilds.title'), guildLines));

	for (const block of blocks) {
		container.addSeparatorComponents(new SeparatorBuilder());
		if (block instanceof SectionBuilder) container.addSectionComponents(block);
		else container.addTextDisplayComponents(block);
	}
	return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}

async function deletePanelMessage(client, panel) {
	try {
		const channel = await client.channels.fetch(panel.channel_id);
		const message = await channel.messages.fetch(panel.message_id);
		await message.delete();
	} catch (error) {
		if (!GONE_CODES.has(error?.code)) console.error('[ERROR] Suppression de l\'ancien panneau des classements :', error.message ?? error);
	}
}

async function savePanel(guildId, channelId, messageId) {
	await pool.query(
		'INSERT INTO ranking_panel (guild_id, channel_id, message_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE channel_id = ?, message_id = ?',
		[guildId, channelId, messageId, channelId, messageId],
	);
}

async function postPanel(client, channel) {
	const [[previous]] = await pool.query('SELECT channel_id, message_id FROM ranking_panel WHERE guild_id = ?', [channel.guildId]);
	const message = await channel.send(buildRankingMessage(await fetchRankings()));
	await savePanel(channel.guildId, channel.id, message.id);
	if (previous) await deletePanelMessage(client, previous);
	return message;
}

async function refreshPanels(client) {
	const [panels] = await pool.query('SELECT guild_id, channel_id, message_id FROM ranking_panel');
	if (panels.length === 0) return;

	const payload = buildRankingMessage(await fetchRankings());
	for (const panel of panels) {
		try {
			const channel = await client.channels.fetch(panel.channel_id);
			const message = await channel.messages.fetch(panel.message_id);
			if (message.flags.has(MessageFlags.IsComponentsV2)) {
				await message.edit(payload);
			} else {
				// Discord refuse de convertir un ancien panneau à embeds : on le remplace
				const replacement = await channel.send(payload);
				await savePanel(panel.guild_id, channel.id, replacement.id);
				await message.delete();
			}
		} catch (error) {
			if (GONE_CODES.has(error?.code)) {
				await pool.query('DELETE FROM ranking_panel WHERE guild_id = ?', [panel.guild_id]);
			} else {
				console.error(`[ERROR] Rafraîchissement des classements du serveur ${panel.guild_id} :`, error.message ?? error);
			}
		}
	}
}

function startRankingPanels(client) {
	const run = () => refreshPanels(client).catch((error) => console.error('[ERROR] Classements :', error));
	run();
	setInterval(run, REFRESH_INTERVAL_MS);
}

module.exports = { fetchRankings, buildRankingMessage, postPanel, refreshPanels, startRankingPanels };
