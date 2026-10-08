const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { pool } = require('../../Helper/database.js');
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

        const [rows] = await pool.query('SELECT 1 FROM `User` WHERE user_id = ?', [userId]);
        if (rows.length > 0) {
            await pool.query('UPDATE `User` SET locale = ? WHERE user_id = ?', [locale, userId]);
        } else {
            await pool.query('INSERT INTO `User` (user_id, locale, username) VALUES (?, ?, ?)', [userId, locale, interaction.user.username]);
        }

        await interaction.reply({ content: t('language.set', locale, { locale }), flags: MessageFlags.Ephemeral });
    },
};