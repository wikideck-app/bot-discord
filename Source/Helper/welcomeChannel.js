/**
 * Récupère le salon de bienvenue (WELCOME_CHANNEL_ID) pour une guilde donnée.
 * Retourne null si l'ID n'est pas défini ou si le salon est introuvable/non textuel.
 */
async function getWelcomeChannel(guild) {
	const channelId = process.env.WELCOME_CHANNEL_ID;
	if (!channelId) {
		return null;
	}

	const channel = await guild.channels.fetch(channelId);
	if (!channel || !channel.isTextBased()) {
		return null;
	}

	return channel;
}

module.exports = { getWelcomeChannel };
