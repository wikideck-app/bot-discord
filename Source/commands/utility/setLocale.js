const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const db = require('../../Helper/database.js');
const { t } = require('../../Helper/i18n.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setlanguage')
        .setNameLocalization('fr', 'definirlangue')
        .setDescription('Set your preferred language')
        .setDescriptionLocalization('fr', 'Définir votre langue préférée')
        .addStringOption(option =>
            option.setName('language')
                .setNameLocalization('fr', 'langue')
                .setDescription('The language to set')
                .setDescriptionLocalization('fr', 'La langue à définir')
                .setRequired(true)
                .addChoices(
                    { name: 'English', value: 'en' },
                    { name: 'French', value: 'fr' }
                )
        ),
    async execute(interaction) {
        const locale = interaction.options.getString('language');
        const userId = interaction.user.id;

        if (db.prepare('SELECT 1 FROM User WHERE user_id = ?').get(userId)) {
            db.prepare('UPDATE User SET locale = ? WHERE user_id = ?').run(locale, userId);
        } else {
            db.prepare('INSERT INTO User (user_id, locale, username) VALUES (?, ?, ?)').run(userId, locale, interaction.user.username);
        }

        await interaction.reply({ content: t('language.set', locale, { locale }), flags: MessageFlags.Ephemeral });
    },
};