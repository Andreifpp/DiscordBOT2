const { Events, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const config = process.env.NODE_ENV === 'production' ? require('../config-production') : require('../config');

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

        // Registrar comandos slash si es necesario
        console.log('🔄 Verificando comandos slash...');
        
        // Enviar panel de tickets automáticamente (DESACTIVADO)
        // await sendTicketPanel(client);
        
        console.log('✅ Bot completamente inicializado y listo para usar!');
    },
};

async function sendTicketPanel(client) {
    try {
        // Usar el canal configurado en config
        const TICKET_PANEL_CHANNEL_ID = config.ticketPanelChannel;
        
        if (!TICKET_PANEL_CHANNEL_ID) {
            console.log('⚠️ No se ha configurado canal para panel automático');
            return;
        }
        
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) return;
        
        const channel = guild.channels.cache.get(TICKET_PANEL_CHANNEL_ID);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle('Max Market - Ticket System')
            .setDescription('**Welcome to Max Market!**\n\nHere begins the support channel.\n\nIf you need help, click on the option corresponding to the type of ticket you want to open.\n\n**Response time may vary due to many factors, so please be patient.**')
            .setColor(config.colors.primary)
            .setFooter({
                text: 'Max Market Support System',
                iconURL: client.user.displayAvatarURL()
            })
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_category')
            .setPlaceholder('Select a ticket category...')
            .addOptions([
                {
                    label: 'Purchases',
                    description: 'To purchase products',
                    value: 'purchases',
                    emoji: config.emojis.purchases
                },
                {
                    label: 'Product not received',
                    description: 'Support for products not received',
                    value: 'not_received',
                    emoji: config.emojis.notReceived
                },
                {
                    label: 'Replace',
                    description: 'Request product replacement',
                    value: 'replace',
                    emoji: config.emojis.replace
                },
                {
                    label: 'Support',
                    description: 'Receive support from the staff team',
                    value: 'support',
                    emoji: config.emojis.support
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // Borrar mensajes anteriores del bot en ese canal
        const messages = await channel.messages.fetch({ limit: 50 });
        const botMessages = messages.filter(msg => msg.author.id === client.user.id);
        if (botMessages.size > 0) {
            await channel.bulkDelete(botMessages);
        }

        await channel.send({
            embeds: [embed],
            components: [row]
        });

        console.log('✅ Panel de tickets enviado automáticamente');
        
    } catch (error) {
        console.error('❌ Error enviando panel automático:', error);
    }
}