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

        // Registrar comandos globalmente (quita guildId para comandos globales)
        // Para desarrollo, usa guildId para registro instantáneo
        let data;
        
        if (config.guildId) {
            // Comandos de servidor (instantáneos)
            data = await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands },
            );
            console.log(`✅ ${data.length} comandos registrados exitosamente en el servidor.`);
        } else {
            // Comandos globales (pueden tardar hasta 1 hora)
            data = await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commands },
            );
            console.log(`✅ ${data.length} comandos registrados exitosamente globalmente.`);
        }

        console.log('\\n🎉 ¡Registro de comandos completado!');
        
    } catch (error) {
        console.error('❌ Error registrando comandos:', error);
    }
})();