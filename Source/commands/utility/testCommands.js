const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getWelcomeChannel } = require('../../Helper/welcomeChannel');
const { generateWelcomeImage } = require('../../Helper/welcomeImage');

// simuler un user qui join avec une commande et l'envoyer dans le salon de bienvenue avec les pararmètre d'embed actuel du guildMemberAdd event
module.exports = {
    data: new SlashCommandBuilder()
        .setName('testwelcome')
        .setDescription('simule un nouvel utilisateur rejoignant le serveur'),
    async execute(interaction) {
        const member = interaction.member;

        if (!process.env.WELCOME_CHANNEL_ID) {
            await interaction.reply({ content: 'WELCOME_CHANNEL_ID n\'est pas défini dans le fichier .env.', ephemeral: true });
            return;
        }

        // On "defer" immédiatement : la génération de l'image (téléchargement de l'avatar + rendu canvas)
        // peut prendre plus de 3 secondes, le délai max pour accuser réception d'une interaction Discord.
        // Sans ça, interaction.reply() échouerait avec "Unknown interaction" (code 10062).
        await interaction.deferReply({ ephemeral: true });

        try {
            const channel = await getWelcomeChannel(interaction.guild);
            if (!channel) {
                await interaction.editReply({ content: `Le salon de bienvenue (${process.env.WELCOME_CHANNEL_ID}) est introuvable ou n'est pas un salon textuel.` });
                return;
            }

            const imageBuffer = await generateWelcomeImage(member);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome.png' });
            await channel.send({ content: '||' + `${member}` + '||', files: [attachment] });
            await interaction.editReply({ content: 'Commande de test de bienvenue exécutée !' });
        } catch (error) {
            console.error('[ERROR] Impossible d\'envoyer le message de bienvenue :', error);
            // Si le token de l'interaction a quand même expiré, on log l'échec au lieu de laisser
            // une erreur non gérée remonter et planter tout le bot.
            try {
                await interaction.editReply({ content: 'Une erreur est survenue lors de l\'envoi du message de bienvenue.' });
            } catch (replyError) {
                console.error('[ERROR] Impossible de répondre à l\'interaction (probablement expirée) :', replyError);
            }
        }
    },
};