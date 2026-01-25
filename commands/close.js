const { SlashCommandBuilder } = require('discord.js');
const TicketHandler = require('../handlers/ticketHandler');
const config = require('../config');

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
            if (!channel || !channel.name || !channel.name.startsWith('ticket-')) {
                return interaction.reply({ content: '❌ This command can only be used in ticket channels.', ephemeral: true });
            }

            const reason = interaction.options.getString('reason') || 'Sin razón especificada';
            await TicketHandler.closeTicketFromCommand(interaction, reason);
        }
    }
};
