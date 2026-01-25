const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = process.env.NODE_ENV === 'production' ? require('./config-production') : require('./config');

const commands = [];

// Leer todos los archivos de comandos
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ Comando cargado: ${command.data.name}`);
    } else {
        console.log(`⚠️ [WARNING] El comando en ${filePath} no tiene las propiedades "data" o "execute" requeridas.`);
    }
}

// Construir e implementar comandos slash
const rest = new REST().setToken(config.token);

(async () => {
    try {
        console.log(`\\n🔄 Iniciando registro de ${commands.length} comandos slash...`);

        // Obtener lista de servidores (puede ser uno, múltiples o ninguno para global)
        const guildIds = process.env.GUILD_IDS 
            ? process.env.GUILD_IDS.split(',').map(id => id.trim()).filter(Boolean)
            : (config.guildId ? [config.guildId] : []);

        if (guildIds.length > 0) {
            // Comandos de servidor (instantáneos) - registrar en cada servidor
            console.log(`📋 Registrando comandos en ${guildIds.length} servidor(es)...`);
            
            for (const guildId of guildIds) {
                try {
                    const data = await rest.put(
                        Routes.applicationGuildCommands(config.clientId, guildId),
                        { body: commands },
                    );
                    console.log(`✅ ${data.length} comandos registrados en servidor: ${guildId}`);
                } catch (error) {
                    console.error(`❌ Error en servidor ${guildId}:`, error.message);
                }
            }
        } else {
            // Comandos globales (pueden tardar hasta 1 hora)
            const data = await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commands },
            );
            console.log(`✅ ${data.length} comandos registrados exitosamente globalmente.`);
            console.log('⏳ Los comandos globales pueden tardar hasta 1 hora en aparecer.');
        }

        console.log('\\n🎉 ¡Registro de comandos completado!');
        
    } catch (error) {
        console.error('❌ Error registrando comandos:', error);
    }
})();