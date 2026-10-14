const { Events } = require('discord.js');
const { startStaffAlerts } = require('../api/staffalerts');
const { startMarketAlerts } = require('../api/marketAlerts');
const { startRankingPanels } = require('../api/rankingPanel');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        startStaffAlerts(client);
        console.log('Staff alerts started.');
        startMarketAlerts(client);
        console.log('Market alerts started.');
        startRankingPanels(client);
        console.log('Ranking panels started.');
    },
};