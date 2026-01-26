require('dotenv').config();
const { REST, Routes } = require('discord.js');
const config = process.env.NODE_ENV === 'production' ? require('./config-production') : require('./config');

const rest = new REST().setToken(config.token);

// IDs de los servidores donde eliminar comandos
const guildIds = ['1434533421266505778', '1457778060698063113', '1457821728788054151'];

(async () => {
    try {
        console.log('🗑️ Eliminando comandos de servidores específicos...\n');

        for (const guildId of guildIds) {
            try {
                await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: [] });
                console.log(`✅ Comandos eliminados del servidor: ${guildId}`);
            } catch (error) {
                console.log(`⚠️ No se pudo eliminar del servidor ${guildId}: ${error.message}`);
            }
        }

        console.log('\n✅ Proceso completado. Los comandos globales seguirán funcionando.');
        console.log('💡 Espera 1-2 minutos y reinicia Discord para ver los cambios.');
    } catch (error) {
        console.error('❌ Error:', error);
    }
})();
