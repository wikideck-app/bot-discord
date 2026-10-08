const { EmbedBuilder } = require('discord.js');
const { pool } = require('../Helper/database.js');
const api = require('../Helper/wikideckApi.js');

const CHECK_INTERVAL_MS = 60000;

// La table staff_alert est créée au démarrage par initDatabase() (voir Source/Helper/database.js).

async function isSeen(kind, id) {
    const [rows] = await pool.query('SELECT 1 FROM staff_alert WHERE kind = ? AND external_id = ?', [kind, id]);
    return rows.length > 0;
}

async function markSeen(kind, id) {
    await pool.query('INSERT IGNORE INTO staff_alert (kind, external_id) VALUES (?, ?)', [kind, id]);
}

function bugEmbed(report) {
    return new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Nouveau rapport de bug ' + report.id)
        .setDescription(report.message.slice(0, 4000))
        .addFields(
            { name: 'Joueur', value: report.reporter.username, inline: true },
            { name: 'username du joueur', value: report.reporter.name, inline: true },
            { name: 'Page', value: report.page ? "https://wikideck.app" + report.page : 'n/a', inline: true },
        )
        .setTimestamp(new Date(report.createdAt));
}

function reportEmbed(report) {
    return new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('Nouveau message signalé ' + report.id)
        .setDescription(report.body.slice(0, 4000))
        .addFields(
            { name: 'Signalé par', value: report.reporter.username, inline: true },
            { name: 'Auteur du message', value: report.sender.username, inline: true },
            { name: 'Lien', value: "https://wikideck.app/staff", inline: true },
            { name: 'Profil de l\'auteur', value: report.sender.profile ? "https://wikideck.app" + report.sender.profile : 'n/a', inline: true }
        )
        .setTimestamp(new Date(report.createdAt));
}

async function checkBugReports(channel) {
    const { reports } = await api.staff.bugReports();
    for (const report of reports) {
        if (report.status !== 'OPEN' || await isSeen('bug', report.id)) continue;
        await channel.send({ embeds: [bugEmbed(report)] });
        await markSeen('bug', report.id);
    }
}

async function checkReports(channel) {
    const { reports } = await api.staff.reports();
    for (const report of reports) {
        if (report.status !== 'OPEN' || await isSeen('report', report.id)) continue;
        await channel.send({ embeds: [reportEmbed(report)] });
        await markSeen('report', report.id);
    }
}

function startStaffAlerts(client) {
    const run = async () => {
        const bugChannel = await client.channels.fetch(process.env.STAFF_BUG_ALERT_CHANNEL_ID).catch(() => null);
        const reportChannel = await client.channels.fetch(process.env.STAFF_REPORT_ALERT_CHANNEL_ID).catch(() => null);
        if (!bugChannel?.isTextBased()) return;
        await checkBugReports(bugChannel).catch((error) => console.error('[ERROR] Alertes staff (bugs) :', error));
        if (!reportChannel?.isTextBased()) return;
        await checkReports(reportChannel).catch((error) => console.error('[ERROR] Alertes staff (rapports) :', error));
    };
    run();
    setInterval(run, CHECK_INTERVAL_MS);
}

module.exports = { startStaffAlerts };