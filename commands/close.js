const { SlashCommandBuilder } = require('discord.js');
const TicketHandler = require('../handlers/ticketHandler');
const config = process.env.NODE_ENV === 'production' ? require('../config-production') : require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('close')
        .setDescription('Close utilities (ticket)')
        .addSubcommand(sub =>
            sub
                .setName('ticket')
                .setDescription('Close the current ticket channel')
                .addStringOption(opt => opt.setName('reason').setDescription('Reason for closing the ticket').setRequired(false))
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'ticket') {
            // permission check: allowed close roles or admin
            const member = interaction.member;
            const ALLOWED_CLOSE_ROLES = new Set((config.allowedCloseRoles || []).map(String).concat([String(config.supportRoleId)]));

            const hasAllowed = (member && (member.permissions && member.permissions.has && member.permissions.has(require('discord.js').PermissionFlagsBits.Administrator))) || (member && member.roles && member.roles.cache && member.roles.cache.some(r => ALLOWED_CLOSE_ROLES.has(String(r.id))));

            if (!hasAllowed) {
                return interaction.reply({ content: '❌ No tienes permiso para cerrar este ticket.', ephemeral: true });
            }

            const channel = interaction.channel;
            // Debug: ver el nombre real del canal
            console.log('[close.js] Channel name:', channel.name);
            console.log('[close.js] Channel name (raw):', JSON.stringify(channel.name));
            
            // Permitir cerrar tanto tickets normales como canales de replace
            // Normalizar el nombre del canal (minúsculas, sin emojis)
            const channelName = channel.name ? channel.name.toLowerCase() : '';
            const isTicketChannel = channelName.includes('ticket') || channelName.includes('replace');
            
            console.log('[close.js] channelName (lowercase):', channelName);
            console.log('[close.js] isTicketChannel:', isTicketChannel);
            
            if (!channel || !channelName || !isTicketChannel) {
                return interaction.reply({ content: `❌ This command can only be used in ticket channels. (Current: ${channel.name})`, ephemeral: true });
            }

            const reason = interaction.options.getString('reason') || 'Sin razón especificada';
            await TicketHandler.closeTicketFromCommand(interaction, reason);
        }
    }
};
