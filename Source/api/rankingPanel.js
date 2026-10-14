const { EmbedBuilder, escapeMarkdown } = require('discord.js');
const { pool } = require('../helper/database.js');
const { t } = require('../helper/i18n.js');
const api = require('./wikideckApi.js');

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TOP_SIZE = 10;
const MEDALS = ['🥇', '🥈', '🥉'];
// salon ou message supprimé, ou accès retiré au bot
const GONE_CODES = new Set([10003, 10008, 50001]);
const BOARDS = [
	{ key: 'collection', color: 0x3b7be0, unit: 'ranking.unit.cards' },
	{ key: 'points', color: 0xa65cf0, unit: 'ranking.unit.points' },
	{ key: 'battle', color: 0xff4d7d, unit: 'ranking.unit.wins' },
];
const GUILDS_COLOR = 0xffd35c;

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

function rankingLines(entries, formatEntry) {
	if (entries.length === 0) return t('ranking.empty');
	return entries
		.slice(0, TOP_SIZE)
		.map((entry, index) => `${MEDALS[index] ?? `**${index + 1}.**`} ${formatEntry(entry)}`)
		.join('\n');
}

function buildRankingEmbeds(rankings) {
	const embeds = BOARDS.map(({ key, color, unit }) => new EmbedBuilder()
		.setColor(color)
		.setTitle(t(`ranking.${key}.title`))
		.setDescription(rankingLines(rankings[key], (entry) => `${escapeMarkdown(entry.username)} — ${countLabel(unit, entry.score)}`)));

	const { entries = [], weekEndsAt } = rankings.guilds;
	let guildsDescription = rankingLines(entries, (entry) => `${escapeMarkdown(entry.name)} — ${t('ranking.guilds.entry', undefined, {
		points: formatNumber(entry.points),
		members: countLabel('ranking.unit.members', entry.members),
	})}`);
	if (weekEndsAt) {
		const date = `<t:${Math.floor(new Date(weekEndsAt).getTime() / 1000)}:R>`;
		guildsDescription += `\n\n${t('ranking.guilds.weekEnds', undefined, { date })}`;
	}
	embeds.push(new EmbedBuilder()
		.setColor(GUILDS_COLOR)
		.setTitle(t('ranking.guilds.title'))
		.setDescription(guildsDescription)
		.setFooter({ text: t('ranking.footer') })
		.setTimestamp());
	return embeds;
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

async function postPanel(client, channel) {
	const [[previous]] = await pool.query('SELECT channel_id, message_id FROM ranking_panel WHERE guild_id = ?', [channel.guildId]);
	const message = await channel.send({ embeds: buildRankingEmbeds(await fetchRankings()) });
	await pool.query(
		'INSERT INTO ranking_panel (guild_id, channel_id, message_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE channel_id = ?, message_id = ?',
		[channel.guildId, channel.id, message.id, channel.id, message.id],
	);
	if (previous) await deletePanelMessage(client, previous);
	return message;
}

async function refreshPanels(client) {
	const [panels] = await pool.query('SELECT guild_id, channel_id, message_id FROM ranking_panel');
	if (panels.length === 0) return;

	const embeds = buildRankingEmbeds(await fetchRankings());
	for (const panel of panels) {
		try {
			const channel = await client.channels.fetch(panel.channel_id);
			const message = await channel.messages.fetch(panel.message_id);
			await message.edit({ embeds });
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

module.exports = { fetchRankings, buildRankingEmbeds, postPanel, refreshPanels, startRankingPanels };
