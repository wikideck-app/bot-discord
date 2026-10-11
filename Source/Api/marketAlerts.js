const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { pool } = require('../Helper/database.js');
const { t } = require('../Helper/i18n.js');
const { generateCardImage } = require('../Helper/cardImage.js');
const api = require('./wikideckApi.js');

const CHECK_INTERVAL_MS = 60 * 1000;
const SYNC_INTERVAL_MS = 5 * 60 * 1000;
// Code Discord : l'utilisateur a fermé ses MP, inutile de réessayer
const CANNOT_DM_CODE = 50007;

async function replaceWishlist(userId, cardIds) {
	const connection = await pool.getConnection();
	try {
		await connection.beginTransaction();
		await connection.query('DELETE FROM market_watch WHERE user_id = ?', [userId]);
		for (const cardId of cardIds) {
			await connection.query('INSERT IGNORE INTO market_watch (user_id, card_id) VALUES (?, ?)', [userId, cardId]);
		}
		await connection.commit();
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		connection.release();
	}
}

/**
 * Copie en base les wishlists des joueurs Wikideck qui ont un profil avec le bot (table `User`).
 * Le lien se fait via l'ID Discord ; seules les wishlists des profils publics sont lisibles par l'API.
 */
async function syncWishlists() {
	const [botUsers] = await pool.query('SELECT user_id FROM `User` WHERE isBanned = FALSE');
	if (botUsers.length === 0) {
		await pool.query('DELETE FROM market_watch');
		return;
	}

	const wikideckByDiscordId = new Map();
	for (const user of await api.staff.allUsers()) {
		if (user.discordId && !user.banned) wikideckByDiscordId.set(user.discordId, user.id);
	}

	const synced = [];
	for (const { user_id: rawId } of botUsers) {
		const userId = String(rawId);
		const wikideckId = wikideckByDiscordId.get(userId);
		if (!wikideckId) continue;
		synced.push(userId);
		try {
			const profile = await api.players.profile(wikideckId);
			const cardIds = profile.visible ? profile.wishlist.map((card) => card.id) : [];
			await replaceWishlist(userId, cardIds);
		} catch (error) {
			// on garde l'ancienne wishlist en cas d'erreur temporaire de l'API
			console.error(`[ERROR] Synchro de la wishlist de ${userId} :`, error.message ?? error);
		}
	}

	// retire les joueurs qui n'ont plus de profil bot, plus de compte lié ou qui sont bannis
	if (synced.length === 0) {
		await pool.query('DELETE FROM market_watch');
	} else {
		await pool.query('DELETE FROM market_watch WHERE user_id NOT IN (?)', [synced]);
	}
}

async function getWatchers() {
	const [rows] = await pool.query(
		'SELECT w.user_id, w.card_id, u.locale FROM market_watch w JOIN `User` u ON u.user_id = w.user_id WHERE u.isBanned = FALSE',
	);
	const byCard = new Map();
	for (const row of rows) {
		if (!byCard.has(row.card_id)) byCard.set(row.card_id, []);
		byCard.get(row.card_id).push({ userId: String(row.user_id), locale: row.locale });
	}
	return byCard;
}

// Réserve la notification : évite les doublons même si deux cycles se chevauchent.
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
		.setColor(0xFF3D7F)
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
	const payload = { embeds: [auctionEmbed(auction, watcher.locale, Boolean(image))] };
	if (image) payload.files = [new AttachmentBuilder(image, { name: 'card.png' })];
	await user.send(payload);
}

async function checkMarket(client) {
	const watchers = await getWatchers();
	if (watchers.size === 0) return;

	const auctions = await api.market.listAll({ sort: 'new' });
	for (const auction of auctions) {
		const cardWatchers = watchers.get(auction.card?.id);
		if (auction.status !== 'ACTIVE' || !cardWatchers) continue;

		// l'image n'est générée qu'une fois par enchère, et seulement si quelqu'un doit être prévenu
		let image;
		let imageReady = false;

		for (const watcher of cardWatchers) {
			if (!(await claimNotification(watcher.userId, auction.id))) continue;
			try {
				if (!imageReady) {
					image = await generateCardImage(auction.card).catch(() => null);
					imageReady = true;
				}
				await sendAlert(client, watcher, auction, image);
			} catch (error) {
				if (error?.code !== CANNOT_DM_CODE) await releaseNotification(watcher.userId, auction.id);
				console.error(`[ERROR] Alerte marché impossible pour ${watcher.userId} :`, error.message ?? error);
			}
		}
	}
}

// Exécute `task` à intervalle régulier sans jamais en lancer deux en parallèle.
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
	const sync = schedule(syncWishlists, 'Synchro des wishlists', SYNC_INTERVAL_MS);
	const check = schedule(() => checkMarket(client), 'Alertes marché', CHECK_INTERVAL_MS);
	// première synchro avant la première vérification pour ne pas partir d'une table vide
	sync.run().finally(() => check.run());
	sync.start();
	check.start();
}

module.exports = { startMarketAlerts, syncWishlists, checkMarket };
