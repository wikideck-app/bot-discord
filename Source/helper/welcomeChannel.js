
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
