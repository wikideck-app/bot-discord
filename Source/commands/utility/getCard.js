// debug helper
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, AttachmentBuilder } = require('discord.js');
const api = require('../../api/wikideckApi.js');
const { generateCardImage } = require('../../helper/cardImage.js');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('getcard')
        .setDescription('Récupère une carte du marché sur le site web avec l\'API.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('cardid')
                .setDescription('ID de la carte à récupérer')
                .setRequired(true))
        .setContexts(0), 
    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Cette commande est réservée aux administrateurs.', flags: MessageFlags.Ephemeral });
            return;
        }
        const cardId = interaction.options.getString('cardid');

        // l'appel API + la génération de l'image peuvent dépasser les 3s autorisées pour répondre
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        let auctions;
        try {
            auctions = await api.market.findByCardId(cardId);
        } catch (error) {
            console.error('[ERROR] Récupération de la carte sur le marché :', error);
            await interaction.editReply({ content: 'Une erreur est survenue lors de la récupération de la carte.' });
            return;
        }

        const card = auctions[0]?.card;
        if (!card) {
            await interaction.editReply({ content: 'Cette carte n\'est pas en vente sur le marché.' });
            return;
        }

        try {
            const image = await generateCardImage(card);
            await interaction.editReply({ files: [new AttachmentBuilder(image, { name: 'card.png' })] });
        } catch (error) {
            console.error('[ERROR] Génération de l\'image de la carte :', error);
            await interaction.editReply({ content: `Carte trouvée : **${card.title}**` });
        }
    },
};