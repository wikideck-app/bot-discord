const { Events, AttachmentBuilder } = require('discord.js');
const { getWelcomeChannel } = require('../helper/welcomeChannel');
const { generateWelcomeImage } = require('../helper/welcomeImage');
const { syncUserAccount } = require('../helper/userAccount');

module.exports = {
	name: Events.GuildMemberAdd,
	once: false,
	async execute(member) {
		// Crée ou met à jour la fiche du membre dans la table User.
		try {
			await syncUserAccount(member.user);
		} catch (error) {
			console.error(`[ERROR] Synchronisation du compte de ${member.id} impossible :`, error);
		}

		if (!process.env.WELCOME_CHANNEL_ID) {
			console.warn('[WARNING] WELCOME_CHANNEL_ID n\'est pas défini dans le fichier .env.');
			return;
		}

		try {
			const channel = await getWelcomeChannel(member.guild);
			if (!channel) {
				console.warn(`[WARNING] Le salon de bienvenue (${process.env.WELCOME_CHANNEL_ID}) est introuvable ou n'est pas un salon textuel.`);
				return;
			}

			const imageBuffer = await generateWelcomeImage(member);
			const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome.png' });
			await channel.send({ content: '||' + `${member} ` + '||', files: [attachment] });
		} catch (error) {
			console.error('[ERROR] Impossible d\'envoyer le message de bienvenue :', error);
		}
	},
};
