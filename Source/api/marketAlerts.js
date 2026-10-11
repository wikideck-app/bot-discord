const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { pool } = require('../helper/database.js');
const { t } = require('../helper/i18n.js');
const { generateCardImage, rarityStyle } = require('../helper/cardImage.js');
const api = require('./wikideckApi.js');

const CHECK_INTERVAL_MS = 60 * 1000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const CANNOT_DM_CODE = 50007;
const EMBED_COLOR = 0xFF3D7F;
const SITE_URL = 'https://wikideck.app';
const REFRESH_WISHLIST_ID = 'market:refresh';
const DISABLE_ALERTS_ID = 'market:disable';
const ENABLE_ALERTS_ID = 'market:enable';

function alertsButtonRow(enabled, locale) {
	if (!enabled) {
		return new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId(ENABLE_ALERTS_ID).setLabel(t('market.button.enable', locale)).setStyle(ButtonStyle.Success),
		);
	}
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId(REFRESH_WISHLIST_ID).setLabel(t('market.button.refresh', locale)).setStyle(ButtonStyle.Primary),
		new ButtonBuilder().setCustomId(DISABLE_ALERTS_ID).setLabel(t('market.button.disable', locale)).setStyle(ButtonStyle.Secondary),
	);
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

function auctionEmbed(auction, kind, locale) {
	const { card } = auction;
	const price = (amount) => t('market.alert.price', locale, { amount: String(amount) });
	return new EmbedBuilder()
		.setColor(rarityStyle(card.rarity).color)
		.setTitle(t(`market.${kind}.title`, locale, { title: card.title }))
		.setDescription(t(`market.${kind}.description`, locale))
		.addFields(
			{ name: t('market.alert.currentBid', locale), value: price(auction.currentBid ?? auction.startPrice), inline: true },
			{ name: t('market.alert.minBid', locale), value: price(auction.minBid ?? auction.startPrice), inline: true },
			{ name: t('market.alert.seller', locale), value: auction.seller?.username ?? 'n/a', inline: true },
			{ name: t('market.alert.endsAt', locale), value: `<t:${Math.floor(new Date(auction.endsAt).getTime() / 1000)}:R>`, inline: true },
		);
}

function auctionMessage(auction, kind, locale, image) {
	const auctionButton = new ButtonBuilder()
		.setStyle(ButtonStyle.Link)
		.setURL(`${SITE_URL}/market/${auction.id}`)
		.setLabel(t('market.button.auction', locale));
	const buttons = new ActionRowBuilder().addComponents(auctionButton, ...alertsButtonRow(true, locale).components);

	const payload = { embeds: [auctionEmbed(auction, kind, locale)], components: [buttons] };
	if (image) payload.files = [new AttachmentBuilder(image, { name: 'card.png' })];
	return payload;
}

async function sendAuctionMessage(client, userId, locale, auction, kind, image) {
	const user = await client.users.fetch(userId);
	await user.send(auctionMessage(auction, kind, locale, image));
}

async function getDiscordIdsByWikideckId() {
	const accounts = await api.staff.allUsers();
	return new Map(accounts.filter((account) => account.discordId).map((account) => [account.id, account.discordId]));
}

async function alertWishlists(client, auctions, discordIds) {
	const watchers = await getWatchers();
	for (const auction of auctions) {
		const createdAt = new Date(auction.createdAt);
		const sellerId = discordIds.get(auction.seller?.id);
		const cardWatchers = (watchers.get(auction.card?.id) ?? [])
			.filter((watcher) => createdAt >= watcher.since && watcher.userId !== sellerId);

		let image;
		for (const watcher of cardWatchers) {
			if (!(await claimNotification(watcher.userId, auction.id))) continue;
			try {
				if (image === undefined) image = await generateCardImage(auction.card).catch(() => null);
				await sendAuctionMessage(client, watcher.userId, watcher.locale, auction, 'alert', image);
			} catch (error) {
				if (error?.code === CANNOT_DM_CODE) continue;
				await releaseNotification(watcher.userId, auction.id);
				console.error(`[ERROR] Alerte marché impossible pour ${watcher.userId} :`, error.message ?? error);
			}
		}
	}
}

function outbidBidderIds(bids, newBidCount) {
	const ranked = [...bids].sort((a, b) => b.amount - a.amount);
	const outbid = new Set(ranked.slice(1, newBidCount + 1).map((bid) => bid.bidder.id));
	outbid.delete(ranked[0]?.bidder.id);
	return outbid;
}

let knownBidCounts = null;

async function alertOutbids(client, auctions, discordIds) {
	if (!knownBidCounts) {
		knownBidCounts = new Map(auctions.map((auction) => [auction.id, auction.bidCount]));
		return;
	}

	const [botUsers, subscriptions] = await Promise.all([getBotUsers(), getSubscriptions()]);
	for (const auction of auctions) {
		const newBidCount = auction.bidCount - (knownBidCounts.get(auction.id) ?? 0);
		if (newBidCount > 0) {
			const { bids = [] } = await api.market.get(auction.id);
			let image;
			for (const bidderId of outbidBidderIds(bids, newBidCount)) {
				const userId = discordIds.get(bidderId);
				const botUser = botUsers.get(userId);
				if (!subscriptions.get(userId) || botUser?.isBanned) continue;
				try {
					if (image === undefined) image = await generateCardImage(auction.card).catch(() => null);
					await sendAuctionMessage(client, userId, botUser?.locale, auction, 'outbid', image);
				} catch (error) {
					if (error?.code !== CANNOT_DM_CODE) console.error(`[ERROR] Alerte de surenchère impossible pour ${userId} :`, error.message ?? error);
				}
			}
		}
		knownBidCounts.set(auction.id, auction.bidCount);
	}
}

async function checkMarket(client) {
	const auctions = (await api.market.listAll({ sort: 'new' })).filter((auction) => auction.status === 'ACTIVE');
	const discordIds = await getDiscordIdsByWikideckId();
	await alertWishlists(client, auctions, discordIds);
	await alertOutbids(client, auctions, discordIds);
}

function wishlistEmbed(visible, cards, locale) {
	let description;
	if (!visible) {
		description = t('market.wishlist.private', locale);
	} else if (cards.length === 0) {
		description = t('market.wishlist.empty', locale);
	} else {
		const lines = cards.map((card) => `• ${card.title}`);
		description = [t('market.wishlist.cards', locale, { count: String(cards.length) }), ...lines].join('\n');
	}
	return new EmbedBuilder().setColor(EMBED_COLOR).setTitle(t('market.wishlist.title', locale)).setDescription(description);
}

async function wishlistReply(userId) {
	const locale = await getLocale(userId);
	const account = await api.staff.findByDiscordId(userId);
	if (!account || account.banned) return { content: t('market.wishlist.notLinked', locale) };

	await pool.query('INSERT IGNORE INTO market_subscription (user_id) VALUES (?)', [userId]);
	const [[subscription]] = await pool.query('SELECT enabled FROM market_subscription WHERE user_id = ?', [userId]);
	if (!subscription.enabled) {
		return { content: t('market.wishlist.disabled', locale), components: [alertsButtonRow(false, locale)] };
	}

	const profile = await api.players.profile(account.id);
	const cards = profile.visible ? profile.wishlist : [];
	await saveWishlist(userId, cards.map((card) => card.id));
	return { embeds: [wishlistEmbed(profile.visible, cards, locale)], components: [alertsButtonRow(true, locale)] };
}

async function setAlertsEnabled(userId, enabled) {
	await pool.query(
		'INSERT INTO market_subscription (user_id, enabled) VALUES (?, ?) ON DUPLICATE KEY UPDATE enabled = ?',
		[userId, enabled, enabled],
	);
	if (!enabled) await pool.query('DELETE FROM market_watch WHERE user_id = ?', [userId]);
}

async function handleMarketButton(interaction) {
	const userId = interaction.user.id;
	await interaction.deferReply();

	if (interaction.customId === DISABLE_ALERTS_ID) {
		await setAlertsEnabled(userId, false);
		const locale = await getLocale(userId);
		await interaction.editReply({ content: t('market.disabled', locale), components: [alertsButtonRow(false, locale)] });
		return;
	}

	if (interaction.customId === ENABLE_ALERTS_ID) {
		await setAlertsEnabled(userId, true);
		const locale = await getLocale(userId);
		await interaction.editReply({ content: t('market.enabled', locale), ...(await wishlistReply(userId)) });
		return;
	}

	await interaction.editReply(await wishlistReply(userId));
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

module.exports = {
	REFRESH_WISHLIST_ID,
	DISABLE_ALERTS_ID,
	ENABLE_ALERTS_ID,
	startMarketAlerts,
	syncWishlists,
	checkMarket,
	auctionMessage,
	wishlistReply,
	handleMarketButton,
};
