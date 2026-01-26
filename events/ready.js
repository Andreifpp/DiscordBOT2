const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`\n🤖 ===============================`);
        console.log(`   Max MARKET TICKETS BOT`);
        console.log(`===============================`);
        console.log(`✅ Bot iniciado: ${client.user.tag}`);
        console.log(`🏪 Tienda: Max Market`);
        console.log(`📊 Servidores: ${client.guilds.cache.size}`);
        console.log(`👥 Usuarios: ${client.users.cache.size}`);
        console.log(`📅 Fecha: ${new Date().toLocaleString('es-ES')}`);
        console.log(`===============================\n`);
        console.log('✅ Bot completamente inicializado y listo para usar!');
    },
};