const { pool } = require('./database.js');
const api = require('../Api/wikideckApi.js');

/**
 * Crée ou met à jour la fiche d'un membre dans la table `User` à partir de son compte Discord,
 * en la complétant avec les infos de son profil Wikideck si son ID Discord y est lié (via /staff/users).
 * Appelée à l'arrivée d'un membre (voir Source/events/guildMemberAdd.js) pour que chaque membre
 * ait une fiche à jour, même sans compte Wikideck lié.
 */
async function syncUserAccount(discordUser) {
	const userId = discordUser.id;

	let wikideckAccount = null;
	try {
		wikideckAccount = await api.staff.findByDiscordId(userId);
	} catch (error) {
		console.error(`[ERROR] Récupération du compte Wikideck de ${userId} impossible :`, error.message ?? error);
	}

	const values = [
		discordUser.username,
		wikideckAccount?.id ?? null,
		wikideckAccount?.username ?? null,
		wikideckAccount?.avatarUrl ?? null,
		wikideckAccount?.wikibits ?? null,
		wikideckAccount?.cards ?? null,
		wikideckAccount?.trust ?? null,
		wikideckAccount?.createdAt ? new Date(wikideckAccount.createdAt) : null,
	];

	const [rows] = await pool.query('SELECT 1 FROM `User` WHERE user_id = ?', [userId]);
	if (rows.length > 0) {
		await pool.query(
			`UPDATE \`User\`
			SET username = ?, wikideck_id = ?, wikideck_username = ?, avatar_url = ?, wikibits = ?, cards = ?, trust = ?, wikideck_created_at = ?
			WHERE user_id = ?`,
			[...values, userId],
		);
	} else {
		await pool.query(
			`INSERT INTO \`User\` (user_id, username, wikideck_id, wikideck_username, avatar_url, wikibits, cards, trust, wikideck_created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[userId, ...values],
		);
	}

	return wikideckAccount;
}

module.exports = { syncUserAccount };
