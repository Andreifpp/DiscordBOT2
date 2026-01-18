require('dotenv').config();

const { Client, GatewayIntentBits, Collection, Events, ActivityType, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Cargar configuración (producción o desarrollo)
let config;
if (process.env.NODE_ENV === 'production') {
    config = require('./config-production.js');
} else {
    config = require('./config');
}

// Crear cliente de Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

// Diagnostic event listeners to help debug Render deployment issues
client.on('error', (err) => console.error('[discord client] error:', err));
client.on('warn', (msg) => console.warn('[discord client] warn:', msg));
client.on('debug', (msg) => console.log('[discord client] debug:', msg));
client.on('shardError', (err) => console.error('[discord shard] shardError:', err));
client.on('shardDisconnect', (closeEvent, shardId) => console.warn('[discord shard] disconnect:', shardId, closeEvent));
client.on('shardReconnecting', (shardId) => console.warn('[discord shard] reconnecting:', shardId));

// Detect if Ready hasn't fired within a timeout to surface issues in Render logs
let readyTimeout = null;
function startReadyTimer() {
    if (readyTimeout) clearTimeout(readyTimeout);
    readyTimeout = setTimeout(async () => {
        console.warn('[startup] Ready event did not fire within 30s. Check network/firewall or token validity.');

        // If Ready didn't fire, try a retry/backoff login sequence (best-effort)
        try {
            if (!global.__loginAttempts) global.__loginAttempts = 0;
            const maxAttempts = 5;
            global.__loginAttempts += 1;
            if (global.__loginAttempts <= maxAttempts) {
                const backoff = 5000 * Math.pow(2, global.__loginAttempts - 1); // exponential
                console.warn(`[startup] Attempting reconnect #${global.__loginAttempts} after ${backoff}ms`);
                try {
                    await client.destroy();
                } catch (e) {
                    console.warn('[startup] client.destroy() error (ignored):', e && e.message ? e.message : e);
                }
                setTimeout(() => {
                    // re-run login if token present
                    const token = process.env.DISCORD_TOKEN || process.env.TOKEN || null;
                    if (token) {
                        console.log('[startup] retrying client.login()...');
                        client.login(token).then(() => console.log('[startup] client.login() retry promise resolved')).catch(err => console.error('[startup] retry login rejected:', err));
                        // restart the ready timer to wait again
                        startReadyTimer();
                    } else {
                        console.warn('[startup] No token available for retry');
                    }
                }, backoff);
            } else {
                console.error('[startup] Maximum login retry attempts reached. Giving up.');
            }
        } catch (e) {
            console.error('[startup] error in retry logic:', e);
        }
    }, 30000);
}
startReadyTimer();

// Colección de comandos
client.commands = new Collection();

// Cargar comandos
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] El comando en ${filePath} no tiene las propiedades "data" o "execute" requeridas.`);
        }
    }
}

// Cargar eventos
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
    }
}

// Evento ready
    client.once(Events.ClientReady, () => {
    console.log(`✅ Bot iniciado como ${client.user.tag}`);
    console.log(`🏪 Max Market Tickets - Sistema de Soporte`);
    console.log(`📊 Sirviendo en ${client.guilds.cache.size} servidor(es)`);
    
    // Establecer actividad
    client.user.setActivity('Max Market | /ticket', { type: ActivityType.Watching });

    // Clear the ready timeout and reset attempt counter
    try { if (readyTimeout) clearTimeout(readyTimeout); } catch (e) {}
    try { global.__loginAttempts = 0; } catch (e) {}
});

// Manejar mensajes (comandos de prefijo)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    
    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    if (command === 'embed') {
        try {
            const { EmbedBuilder } = require('discord.js');
            
            // Usar el contenido como JSON
            const jsonString = message.content.slice(prefix.length + 'embed'.length).trim();
            
            if (!jsonString) {
                return message.reply('❌ Uso: `!embed {json del embed}`');
            }
            
            const embedData = JSON.parse(jsonString);
            const embed = new EmbedBuilder(embedData);
            
            await message.channel.send({ embeds: [embed] });
            await message.delete().catch(() => {});
        } catch (error) {
            console.error('Error en comando embed:', error);
            message.reply(`❌ Error: ${error.message}`).then(msg => setTimeout(() => msg.delete(), 5000));
        }
    }
    
    if (command === 'help') {
        const { EmbedBuilder } = require('discord.js');
        const helpEmbed = new EmbedBuilder()
            .setColor('#9d4edd')
            .setTitle('📋 Comandos Disponibles')
            .addFields(
                { name: '!embed {json}', value: 'Envía un embed personalizado. Ej:\n```!embed {"title":"Mi Titulo","description":"Mi descripción","color":"#9d4edd"}```' }
            )
            .setTimestamp();
        
        return message.reply({ embeds: [helpEmbed] });
    }
});

// Manejar interacciones
client.on(Events.InteractionCreate, async interaction => {
    // Comandos slash
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No se encontró el comando ${interaction.commandName}.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error ejecutando ${interaction.commandName}:`, error);
            
            const reply = {
                content: '❌ Hubo un error al ejecutar este comando.',
                flags: 64 // Ephemeral
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply).catch(() => {});
            } else {
                await interaction.reply(reply).catch(() => {});
            }
        }
    }
    
    // Botones y menús desplegables
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        try {
            // Manejadores de diferentes módulos
            if (interaction.customId.startsWith('invoice_')) {
                const invoiceHandler = require('./handlers/invoiceHandler');
                await invoiceHandler.handleInteraction(interaction);
            } else {
                // Importar el manejador de tickets
                const ticketHandler = require('./handlers/ticketHandler');
                await ticketHandler.handleInteraction(interaction);
            }
        } catch (error) {
            console.error('Error manejando interacción:', error);
            
            // Solo responder si la interacción aún no ha sido manejada
            try {
                const reply = {
                    content: '❌ Hubo un error al procesar tu solicitud.',
                    flags: 64 // Ephemeral flag
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply).catch(() => {});
                } else {
                    await interaction.reply(reply).catch(() => {});
                }
            } catch (replyError) {
                // Si no podemos responder, solo logueamos
                console.error('No se pudo responder a la interacción:', replyError.message);
            }
        }
    }
});

// Manejar errores
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

// Puerto para hosting (Render, Heroku, etc.)
const PORT = process.env.PORT || 3000;

// Crear servidor HTTP simple para hosting
const http = require('http');
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Max Market Tickets Bot is running!');
});

server.listen(PORT, () => {
    console.log(`🌐 HTTP Server running on port ${PORT}`);
});

// Iniciar el bot (aceptamos TOKEN o DISCORD_TOKEN)
const discordToken = process.env.DISCORD_TOKEN || process.env.TOKEN || null;
if (!discordToken) {
    console.error("❌ TOKEN (o DISCORD_TOKEN) no definido en variables de entorno. El bot no iniciará sesión en Discord. Agrega TOKEN o DISCORD_TOKEN en .env o en la plataforma de hosting.");
} else {
    // Log which env var provided the token (do not log the token value)
    const tokenSource = process.env.DISCORD_TOKEN ? 'DISCORD_TOKEN' : (process.env.TOKEN ? 'TOKEN' : 'unknown');
    console.log(`🔑 Token environment variable detected: ${tokenSource}`);

    (async () => {
        try {
            console.log('[startup] performing REST token validity check (GET /users/@me)');
            const token = discordToken;
            const res = await fetch('https://discord.com/api/v10/users/@me', {
                headers: { Authorization: `Bot ${token}`, Accept: 'application/json' }
            });

            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                console.error(`[startup] REST token check failed: ${res.status} ${res.statusText} ${txt}`);
                console.error('[startup] Aborting gateway login due to invalid token or REST API access.');
                return;
            }

            const me = await res.json().catch(() => null);
            console.log(`[startup] REST token valid. Bot user: ${me ? `${me.username}#${me.discriminator || me.discriminator}` : 'unknown'} (id: ${me ? me.id : 'unknown'})`);

            console.log('[startup] calling client.login() — attempting to connect to Discord gateway...');
            client.login(token).then(() => {
                console.log('[startup] client.login() resolved (login promise fulfilled). Waiting for Ready event...');
            }).catch(err => {
                console.error('Error iniciando sesión en Discord (client.login rejected):', err);
            });
        } catch (e) {
            console.error('[startup] error during REST token check:', e && e.message ? e.message : e);
        }
    })();
}