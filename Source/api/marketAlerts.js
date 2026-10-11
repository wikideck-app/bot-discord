const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { pool } = require('../helper/database.js');
const { t } = require('../helper/i18n.js');
const { generateCardImage } = require('../helper/cardImage.js');
const api = require('./wikideckApi.js');

const CHECK_INTERVAL_MS = 60 * 1000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const CANNOT_DM_CODE = 50007;
const EMBED_COLOR = 0xFF3D7F;
const DISABLE_ALERTS_ID = 'market:disable';
const ENABLE_ALERTS_ID = 'market:enable';

function alertsButtonRow(enabled, locale) {
	const button = enabled
		? new ButtonBuilder().setCustomId(DISABLE_ALERTS_ID).setLabel(t('market.button.disable', locale)).setStyle(ButtonStyle.Secondary)
		: new ButtonBuilder().setCustomId(ENABLE_ALERTS_ID).setLabel(t('market.button.enable', locale)).setStyle(ButtonStyle.Success);
	return new ActionRowBuilder().addComponents(button);
}

async function getLinkedAccounts(client) {
	const guild = await client.guilds.fetch(process.env.GUILD_ID);
	const members = await guild.members.fetch();
	const accounts = await api.staff.allUsers();
	return accounts.filter((account) => {
		const member = account.discordId && members.get(account.discordId);
		return member && !member.user.bot && !account.banned;
	});
}

async function getBotUsers() {
	const [rows] = await pool.query('SELECT user_id, locale, isBanned FROM `User`');
	return new Map(rows.map((row) => [row.user_id, row]));
}

async function getSubscriptions() {
	const [rows] = await pool.query('SELECT user_id, enabled FROM market_subscription');
	return new Map(rows.map((row) => [row.user_id, Boolean(row.enabled)]));
}

async function getLocale(userId) {
	const [rows] = await pool.query('SELECT locale FROM `User` WHERE user_id = ?', [userId]);
	return rows[0]?.locale;
}

async function introduceAlerts(client, userId, locale) {
	try {
		const user = await client.users.fetch(userId);
		const embed = new EmbedBuilder()
			.setColor(EMBED_COLOR)
			.setTitle(t('market.intro.title', locale))
			.setDescription(t('market.intro.description', locale));
		await user.send({ embeds: [embed], components: [alertsButtonRow(true, locale)] });
	} catch (error) {
		if (error?.code !== CANNOT_DM_CODE) {
			console.error(`[ERROR] Présentation des alertes marché impossible pour ${userId} :`, error.message ?? error);
			return false;
		}
	}
	await pool.query('INSERT IGNORE INTO market_subscription (user_id) VALUES (?)', [userId]);
	return true;
}

async function saveWishlist(userId, cardIds) {
	if (cardIds.length === 0) {
		await pool.query('DELETE FROM market_watch WHERE user_id = ?', [userId]);
		return;
	}
	await pool.query('DELETE FROM market_watch WHERE user_id = ? AND card_id NOT IN (?)', [userId, cardIds]);
	const now = new Date();
	await pool.query('INSERT IGNORE INTO market_watch (user_id, card_id, created_at) VALUES ?', [cardIds.map((cardId) => [userId, cardId, now])]);
}

async function syncWishlists(client) {
	const [accounts, botUsers, subscriptions] = await Promise.all([getLinkedAccounts(client), getBotUsers(), getSubscriptions()]);

	const watchedUserIds = [];
	for (const account of accounts) {
		const userId = account.discordId;
		const botUser = botUsers.get(userId);
		if (botUser?.isBanned) continue;

		if (!subscriptions.has(userId)) {
			if (!(await introduceAlerts(client, userId, botUser?.locale))) continue;
			subscriptions.set(userId, true);
		}
		if (!subscriptions.get(userId)) continue;

		watchedUserIds.push(userId);
		try {
			const profile = await api.players.profile(account.id);
			await saveWishlist(userId, profile.visible ? profile.wishlist.map((card) => card.id) : []);
		} catch (error) {
			console.error(`[ERROR] Synchro de la liste d'envies de ${userId} :`, error.message ?? error);
		}
	}

	if (watchedUserIds.length === 0) {
		await pool.query('DELETE FROM market_watch');
	} else {
		await pool.query('DELETE FROM market_watch WHERE user_id NOT IN (?)', [watchedUserIds]);
	}
}

async function getWatchers() {
	const [rows] = await pool.query(
		'SELECT w.user_id, w.card_id, w.created_at, u.locale FROM market_watch w LEFT JOIN `User` u ON u.user_id = w.user_id',
	);
	const byCard = new Map();
	for (const row of rows) {
		if (!byCard.has(row.card_id)) byCard.set(row.card_id, []);
		byCard.get(row.card_id).push({ userId: row.user_id, locale: row.locale, since: row.created_at });
	}
	return byCard;
}

async function claimNotification(userId, auctionId) {
	const [result] = await pool.query('INSERT IGNORE INTO market_notified (user_id, auction_id) VALUES (?, ?)', [userId, auctionId]);
	return result.affectedRows > 0;
}

async function releaseNotification(userId, auctionId) {
	await pool.query('DELETE FROM market_notified WHERE user_id = ? AND auction_id = ?', [userId, auctionId]);
}

function auctionEmbed(auction, locale, hasImage) {
	const { card } = auction;
	const price = (amount) => t('market.alert.price', locale, { amount: String(amount) });
	const embed = new EmbedBuilder()
		.setColor(EMBED_COLOR)
		.setTitle(t('market.alert.title', locale, { title: card.title }))
		.setDescription(t('market.alert.description', locale))
		.addFields(
			{ name: t('market.alert.currentBid', locale), value: price(auction.currentBid ?? auction.startPrice), inline: true },
			{ name: t('market.alert.minBid', locale), value: price(auction.minBid ?? auction.startPrice), inline: true },
			{ name: t('market.alert.seller', locale), value: auction.seller?.username ?? 'n/a', inline: true },
			{ name: t('market.alert.endsAt', locale), value: `<t:${Math.floor(new Date(auction.endsAt).getTime() / 1000)}:R>`, inline: true },
		);
	if (hasImage) embed.setImage('attachment://card.png');
	return embed;
}

async function sendAlert(client, watcher, auction, image) {
	const user = await client.users.fetch(watcher.userId);
	const payload = {
		embeds: [auctionEmbed(auction, watcher.locale, Boolean(image))],
		components: [alertsButtonRow(true, watcher.locale)],
	};
	if (image) payload.files = [new AttachmentBuilder(image, { name: 'card.png' })];
	await user.send(payload);
}

async function checkMarket(client) {
	const watchers = await getWatchers();
	if (watchers.size === 0) return;

	const auctions = await api.market.listAll({ sort: 'new' });
	for (const auction of auctions) {
		if (auction.status !== 'ACTIVE') continue;
		const createdAt = new Date(auction.createdAt);
		const cardWatchers = (watchers.get(auction.card?.id) ?? []).filter((watcher) => createdAt >= watcher.since);

		let image;
		for (const watcher of cardWatchers) {
			if (!(await claimNotification(watcher.userId, auction.id))) continue;
			try {
				if (image === undefined) image = await generateCardImage(auction.card).catch(() => null);
				await sendAlert(client, watcher, auction, image);
			} catch (error) {
				if (error?.code === CANNOT_DM_CODE) continue;
				await releaseNotification(watcher.userId, auction.id);
				console.error(`[ERROR] Alerte marché impossible pour ${watcher.userId} :`, error.message ?? error);
			}
		}
	}
}

async function toggleAlerts(interaction) {
	const enabled = interaction.customId === ENABLE_ALERTS_ID;
	const userId = interaction.user.id;
	await pool.query(
		'INSERT INTO market_subscription (user_id, enabled) VALUES (?, ?) ON DUPLICATE KEY UPDATE enabled = ?',
		[userId, enabled, enabled],
	);
	if (!enabled) await pool.query('DELETE FROM market_watch WHERE user_id = ?', [userId]);

	const locale = await getLocale(userId);
	await interaction.reply({
		content: t(enabled ? 'market.enabled' : 'market.disabled', locale),
		components: [alertsButtonRow(enabled, locale)],
	});
}

function schedule(task, label, intervalMs) {
	let running = false;
	const run = async () => {
		if (running) return;
		running = true;
		try {
			await task();
		} catch (error) {
			console.error(`[ERROR] ${label} :`, error);
		} finally {
			running = false;
		}
	};
	return { run, start: () => setInterval(run, intervalMs) };
}

function startMarketAlerts(client) {
	if (!process.env.GUILD_ID) {
		console.warn('[WARNING] GUILD_ID n\'est pas défini dans le fichier .env, alertes marché désactivées.');
		return;
	}
	const sync = schedule(() => syncWishlists(client), 'Synchro des listes d\'envies', SYNC_INTERVAL_MS);
	const check = schedule(() => checkMarket(client), 'Alertes marché', CHECK_INTERVAL_MS);
	sync.run().finally(() => check.run());
	sync.start();
	check.start();
}

module.exports = { DISABLE_ALERTS_ID, ENABLE_ALERTS_ID, startMarketAlerts, syncWishlists, checkMarket, toggleAlerts };
