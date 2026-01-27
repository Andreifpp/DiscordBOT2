const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const config = process.env.NODE_ENV === 'production' ? require('../config-production') : require('../config');
const TicketHandler = require('../handlers/ticketHandler');
const ALLOWED_CLOSE_ROLES = new Set((config.allowedCloseRoles || []).map(String));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('🎫 Max Market ticket system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('panel')
                .setDescription('Create the main ticket panel')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('close')
                .setDescription('Close the current ticket')
                .addStringOption(option =>
                    option
                        .setName('reason')
                        .setDescription('Reason to close the ticket')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a user to this ticket')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to add')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from this ticket')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User to remove')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'panel':
                await this.createTicketPanel(interaction);
                break;
            case 'close':
                await this.closeTicket(interaction);
                break;
            case 'add':
                await this.addUser(interaction);
                break;
            case 'remove':
                await this.removeUser(interaction);
                break;
        }
    },

    async createTicketPanel(interaction) {
        // Permission check
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: '❌ You do not have permission to create the ticket panel.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('Max Market - Ticket System')
            .setDescription('**Welcome to Max Market!**\n\nHere begins the support channel.\n\nIf you need help, click on the option corresponding to the type of ticket you want to open.\n\n**Response time may vary due to many factors, so please be patient.**')
            .setColor(config.colors.primary)
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setFooter({
                text: 'Max Market Support System',
                iconURL: interaction.client.user.displayAvatarURL()
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

        const row = new ActionRowBuilder()
            .addComponents(selectMenu);

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
    },

    async closeTicket(interaction) {
        const channel = interaction.channel;
        
        // Check if this is a ticket channel or replace channel
        const channelName = channel.name ? channel.name.toLowerCase() : '';
        const isTicketChannel = channelName.includes('ticket') || channelName.includes('replace');
        
        if (!isTicketChannel) {
            return interaction.reply({
                content: '❌ This command can only be used in ticket channels.',
                ephemeral: true
            });
        }

        // Permission check (only allow specific roles)
        const member = interaction.member;
        if (!TicketHandler.hasClosePermission(member)) {
            return interaction.reply({ content: '❌ No tienes permiso para cerrar este ticket.', ephemeral: true });
        }

        const reason = interaction.options.getString('reason') || 'Sin razón especificada';

        const embed = new EmbedBuilder()
            .setTitle('🔒 Ticket Closed')
            .setDescription(`This ticket has been closed by ${interaction.user}.\\n\\n**Reason:** ${reason}`)
            .setColor(config.colors.error)
            .setTimestamp();

        const closeButton = new ButtonBuilder()
            .setCustomId('confirm_close')
            .setLabel('Confirm Close')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒');

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_close')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌');

        const row = new ActionRowBuilder()
            .addComponents(closeButton, cancelButton);

        await interaction.reply({
            embeds: [embed],
            components: [row]
        });
    },

    async addUser(interaction) {
        const channel = interaction.channel;
        const user = interaction.options.getUser('user');

        // Check if this is a ticket channel or replace channel
        const channelName = channel.name ? channel.name.toLowerCase() : '';
        const isTicketChannel = channelName.includes('ticket') || channelName.includes('replace');
        
        if (!isTicketChannel) {
            return interaction.reply({
                content: '❌ This command can only be used in ticket channels.',
                ephemeral: true
            });
        }

        // Permission check
        const member = interaction.member;
        const hasStaffRole = member.roles.cache.has(config.supportRole) || member.roles.cache.has(config.adminRole);

        if (!hasStaffRole && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: '❌ You do not have permission to add users to this ticket.',
                ephemeral: true
            });
        }

        try {
            await channel.permissionOverwrites.edit(user.id, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });

            const embed = new EmbedBuilder()
                .setDescription(`✅ ${user} has been added to this ticket by ${interaction.user}.`)
                .setColor(config.colors.success);

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error adding user:', error);
            await interaction.reply({
                content: '❌ There was an error adding the user.',
                ephemeral: true
            });
        }
    },

    async removeUser(interaction) {
        const channel = interaction.channel;
        const user = interaction.options.getUser('user');

        // Check if this is a ticket channel or replace channel
        const channelName = channel.name ? channel.name.toLowerCase() : '';
        const isTicketChannel = channelName.includes('ticket') || channelName.includes('replace');
        
        if (!isTicketChannel) {
            return interaction.reply({
                content: '❌ This command can only be used in ticket channels.',
                ephemeral: true
            });
        }

        // Permission check
        const member = interaction.member;
        const hasStaffRole = member.roles.cache.has(config.supportRole) || member.roles.cache.has(config.adminRole);

        if (!hasStaffRole && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: '❌ You do not have permission to remove users from this ticket.',
                ephemeral: true
            });
        }

        try {
            await channel.permissionOverwrites.delete(user.id);

            const embed = new EmbedBuilder()
                .setDescription(`✅ ${user} has been removed from this ticket by ${interaction.user}.`)
                .setColor(config.colors.warning);

            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Error removing user:', error);
            await interaction.reply({
                content: '❌ There was an error removing the user.',
                ephemeral: true
            });
        }
    }
};