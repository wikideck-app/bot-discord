const { Events } = require('discord.js');
const { startStaffAlerts } = require('../Api/staffalerts');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        startStaffAlerts(client);
        console.log('Staff alerts started.');
    },
};