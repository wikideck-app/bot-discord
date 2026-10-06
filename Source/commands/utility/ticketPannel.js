const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { buildPanel } = require('../../Helper/ticket');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticketpannel')
        .setDescription('Envoi le panneau de tickets.')
        // Masque la commande aux non-admins dans Discord (modifiable ensuite dans Paramètres > Intégrations)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .setContexts(0), // 0 = serveur uniquement (pas en MP)
    async execute(interaction) {
        // Vérification côté code : les permissions Discord peuvent être modifiées par les admins du serveur
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            await interaction.reply({ content: 'Cette commande est réservée aux administrateurs.', flags: MessageFlags.Ephemeral });
            return;
        }
        const channelId = process.env.TICKET_CHANNEL_ID;
        const target = channelId ? await interaction.guild.channels.fetch(channelId).catch(() => null) : interaction.channel;
        if (!target?.isTextBased()) {
            await interaction.reply({ content: 'Le salon des tickets (TICKET_CHANNEL_ID) est introuvable ou n\'est pas un salon textuel.', flags: MessageFlags.Ephemeral });
            return;
        }

        await target.send(buildPanel());
        await interaction.reply({ content: `Panneau de tickets envoyé dans ${target} !`, flags: MessageFlags.Ephemeral });
    },
};