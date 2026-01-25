const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const config = require('../config');

const ALLOWED_CLOSE_ROLES = new Set(
  [
    ...(config.allowedCloseRoles || []),
    config.supportRoleId, // ✅ permitir rol soporte por defecto
  ].filter(Boolean).map(String)
);

class TicketHandler {
    static async handleInteraction(interaction) {
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'ticket_category') {
                await this.createTicket(interaction);
                return;
            }

            if (interaction.customId.startsWith('ticket_review:')) {
                await this.handleReviewSubmission(interaction);
                return;
            }
        }

        if (interaction.isButton()) {
            switch (interaction.customId) {
                case 'confirm_close':
                    if (!TicketHandler.hasClosePermission(interaction.member)) {
                        await interaction.reply({ content: '❌ No tienes permiso para cerrar tickets.', ephemeral: true });
                        return;
                    }
                    await this.confirmClose(interaction);
                    break;
                case 'cancel_close':
                    if (!TicketHandler.hasClosePermission(interaction.member)) {
                        await interaction.reply({ content: '❌ No tienes permiso para gestionar el cierre del ticket.', ephemeral: true });
                        return;
                    }
                    await this.cancelClose(interaction);
                    break;
                case 'delete_ticket':
                    if (!TicketHandler.hasClosePermission(interaction.member)) {
                        await interaction.reply({ content: '❌ No tienes permiso para eliminar tickets.', ephemeral: true });
                        return;
                    }
                    await this.deleteTicket(interaction);
                    break;
            }
        }
    }

    static hasClosePermission(member) {
  if (!member) return false;

  // ✅ Admin siempre puede
    if (member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  // ✅ Rol permitido (incluye soporte)
  return member.roles.cache.some(r => ALLOWED_CLOSE_ROLES.has(String(r.id)));
}

    static async createTicket(interaction) {
        const category = interaction.values[0];
        const user = interaction.user;
        const guild = interaction.guild;
        
        // Sanitize username for channel name (Discord channel names cannot contain '.')
        const slug = this.slugify(user.username);
        const channelName = `ticket-${slug || user.id.slice(-4)}`;

    // Preflight: ensure the bot has the permissions it needs
    // Compat for older Node versions: avoid nullish coalescing
    const _me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
        const missingPerms = [];
        if (!_me || !_me.permissions.has(PermissionFlagsBits.ManageChannels)) {
            missingPerms.push('Manage Channels');
        }
        if (!_me || !_me.permissions.has(PermissionFlagsBits.ViewChannel)) {
            missingPerms.push('View Channels');
        }
        if (missingPerms.length) {
            return interaction.reply({
                content: `❌ I need the following permissions to create ticket channels: ${missingPerms.join(', ')}. Please grant these to my highest role and try again.`,
                ephemeral: true
            });
        }

        // Verificar si el usuario ya tiene un ticket abierto
        const existingTicket = guild.channels.cache.find(
            channel => channel.name === channelName && channel.type === ChannelType.GuildText
        );

        if (existingTicket) {
            return interaction.reply({
                content: `❌ You already have an open ticket in ${existingTicket}. Please use it or close it before creating a new one.`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Obtener la categoría de tickets
            const ticketCategory = guild.channels.cache.get(config.ticketsCategory);
            const permsInParent = ticketCategory ? (_me ? _me.permissionsIn(ticketCategory) : null) : null;
            
            // Si no es una categoría válida, crear canal sin categoría
            const channelOptions = {
                name: channelName,
                type: ChannelType.GuildText,
                topic: `Ticket by ${user.tag} (${user.id}) - Category: ${category}`,
                permissionOverwrites: [
                    {
                        id: guild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles
                        ]
                    }
                ]
            };

            // Añadir overwrite para el rol de soporte solo si existe
            const supportRole = guild.roles.cache.get(config.supportRoleId);
            if (supportRole) {
                channelOptions.permissionOverwrites.push({
                    id: supportRole.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ManageMessages
                    ]
                });
            } else {
                console.warn('config.supportRole no encontrado en el servidor; creando ticket sin overwrite de soporte.');
            }

            // Solo añadir parent si es una categoría válida
            if (ticketCategory && ticketCategory.type === 4) { // 4 = CategoryChannel
                // Verificar permisos dentro de la categoría
                if (permsInParent && permsInParent.has(PermissionFlagsBits.ManageChannels) && permsInParent.has(PermissionFlagsBits.ViewChannel)) {
                    channelOptions.parent = ticketCategory;
                } else {
                    console.warn('El bot no tiene permisos suficientes en la categoría de tickets; se creará el canal sin categoría.');
                }
            }

            // Crear el canal del ticket
            const ticketChannel = await guild.channels.create(channelOptions);

            // Crear embed del ticket
            const ticketEmbed = await this.createTicketEmbed(category, user);
            
            // Crear botones del ticket
            const ticketButtons = this.createTicketButtons();

            // Enviar mensaje en el ticket
            // ✅ definir ANTES del send
const supportMention = config.supportRoleId ? `<@&${config.supportRoleId}>` : '';

// Enviar mensaje en el ticket
await ticketChannel.send({
  content: `${user}${supportMention ? ` | ${supportMention}` : ''}`,
  embeds: [ticketEmbed],
  components: [ticketButtons]
});

            // Confirmar creación
            await interaction.editReply({
                content: `✅ Your ticket has been successfully created in ${ticketChannel}.`
            });

            // Enviar log si está configurado
            if (config.logChannel) {
                await this.sendTicketLog(guild, user, ticketChannel, category, 'created');
            }

        } catch (error) {
            console.error('Error creando ticket:', error);
            await interaction.editReply({
                content: `❌ There was an error creating your ticket. ${(error && error.code) === 50013 ? 'Missing Permissions: make sure my role has Manage Channels and is above the category.' : ''}`
            });
        }
    }

    static async createTicketEmbed(category, user) {
        const categoryInfo = this.getCategoryInfo(category);
        
        const embed = new EmbedBuilder()
            .setTitle(`🎫 ${categoryInfo.name} Ticket`)
            .setDescription(
                `Hello ${user}! Thank you for contacting **Max Market**.\n\n` +
                `**Category:** ${categoryInfo.name}\n` +
                `**Description:** ${categoryInfo.description}\n\n` +
                `A member of the support team will assist you soon. Meanwhile, you can provide more details about your inquiry.\n\n` +
                `**What information should you include?**\n` +
                categoryInfo.requirements.map(req => `• ${req}`).join('\n') + '\n\n' +
                `*Response time may vary. Please be patient.*`
            )
                // Cambiado a color morado (primary)
                .setColor(config.colors.primary)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields([
                {
                    name: '📋 Ticket Status',
                    value: '🟢 **Open**',
                    inline: true
                },
                {
                    name: '👤 User',
                    value: user.toString(),
                    inline: true
                },
                {
                    name: '📅 Creation Date',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: true
                }
            ])
            .setFooter({
                text: 'Max Market Support System',
                iconURL: 'https://cdn.discordapp.com/attachments/1234567890123456789/1234567890123456789/Max-market-icon.png'
            })
            .setTimestamp();

        return embed;
    }

    static createTicketButtons() {
        const closeButton = new ButtonBuilder()
            .setCustomId('confirm_close')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒');

        return new ActionRowBuilder().addComponents(closeButton);
    }

    static getCategoryInfo(category) {
        const categories = {
            purchases: {
                name: 'Purchases',
                description: 'To purchase products from our store',
                requirements: [
                    'Product you want to purchase',
                    'Preferred payment method',
                    'Any specific questions about the product'
                ]
            },
            not_received: {
                name: 'Product not received',
                description: 'Support for products you have not received after purchase',
                requirements: [
                    'Transaction or purchase ID',
                    'Approximate date of purchase',
                    'Payment method used',
                    'Payment screenshots (if you have them)'
                ]
            },
            replace: {
                name: 'Replace product',
                description: 'Request replacement of a defective or incorrect product',
                requirements: [
                    'Product you need to replace',
                    'Reason for replacement',
                    'Original transaction ID',
                    'Evidence of the problem (screenshots, etc.)'
                ]
            },
            support: {
                name: 'General Support',
                description: 'Receive general help and support from the staff team',
                requirements: [
                    'Detailed description of your inquiry',
                    'Any relevant information',
                    'Screenshots if necessary'
                ]
            }
        };

        return categories[category] || categories.support;
    }

    static async confirmClose(interaction) {
        const channel = interaction.channel;
        
        await interaction.deferUpdate();

        // Close confirmation embed
        const embed = new EmbedBuilder()
            .setTitle('🔒 Ticket Closed')
            .setDescription(
                `This ticket has been closed by ${interaction.user}.\\n\\n` +
                `**Status:** Closed\\n` +
                `**Closed by:** ${interaction.user}\\n` +
                `**Date:** <t:${Math.floor(Date.now() / 1000)}:F>\\n\\n` +
                `This channel will be deleted in **10 seconds**. Please save any important information now.`
            )
            .setColor(config.colors.error)
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            components: []
        });

        // Intentar enviar solicitud de review al creador del ticket
        // Extract ticket owner id from channel topic safely (no optional chaining for older Node)
        let ticketOwner = null;
        let userId = null;
        if (channel.topic) {
            const topicMatch = channel.topic.match(/\((\d+)\)/);
            userId = topicMatch && topicMatch[1] ? topicMatch[1] : null;
            ticketOwner = userId ? await interaction.client.users.fetch(userId).catch(() => null) : null;
        }

        let categoryFromTopic = 'Unknown';
        if (channel.topic) {
            const catMatch = channel.topic.match(/Category:\s([^)]*)$/);
            if (catMatch && catMatch[1]) categoryFromTopic = catMatch[1].trim();
        }

        if (ticketOwner) {
            // First, attempt to send the transcript DM to the ticket owner
            try {
                await this.sendTranscriptToUser(ticketOwner, channel);
            } catch (e) {
                console.warn('[confirmClose] failed to send transcript DM:', e && e.message ? e.message : e);
            }

            // Then send review request
            await this.sendReviewRequest({
                user: ticketOwner,
                closer: interaction.user,
                ticketChannel: channel,
                category: categoryFromTopic
            });
        }

        // Send log if configured
        if (config.logChannel) {
            // extract userId again safely
            if (channel.topic) {
                const tmatch = channel.topic.match(/\((\d+)\)/);
                const uid = tmatch && tmatch[1] ? tmatch[1] : null;
                if (uid) {
                    const user = await interaction.client.users.fetch(uid).catch(() => null);
                    await this.sendTicketLog(interaction.guild, user, channel, 'unknown', 'closed', interaction.user);
                }
            }
        }

        // Delete the channel after 10 seconds
        setTimeout(async () => {
            try {
                await channel.delete('Ticket closed');
            } catch (error) {
                console.error('Error deleting ticket channel:', error);
            }
        }, 10000);
    }

    static async cancelClose(interaction) {
        const embed = new EmbedBuilder()
            .setDescription('✅ Ticket closing has been canceled.')
            .setColor(config.colors.success);

        await interaction.update({
            embeds: [embed],
            components: []
        });
    }

    static slugify(name) {
        if (!name) return '';
        return name
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    static async sendTicketLog(guild, user, channel, category, action, staff = null) {
        const logChannel = guild.channels.cache.get(config.logChannel);
        if (!logChannel) return;

        const embed = new EmbedBuilder()
            .setTitle(`📊 Ticket ${action === 'created' ? 'Created' : 'Closed'}`)
            .addFields([
                {
                    name: '👤 User',
                    value: user ? `${user.tag} (${user.id})` : 'Unknown user',
                    inline: true
                },
                {
                    name: '📁 Channel',
                    value: channel.toString(),
                    inline: true
                },
                {
                    name: '📂 Category',
                    value: this.getCategoryInfo(category).name,
                    inline: true
                }
            ])
            .setColor(action === 'created' ? config.colors.success : config.colors.error)
            .setTimestamp();

        if (staff) {
            embed.addFields([
                {
                    name: '👮 Staff',
                    value: `${staff.tag} (${staff.id})`,
                    inline: true
                }
            ]);
        }

        if (user) {
            embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
        }

        try {
            await logChannel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error sending log:', error);
        }
    }

    static async sendReviewRequest({ user, closer, ticketChannel, category }) {
        const selectId = `ticket_review:${ticketChannel.id}:${user.id}:${closer.id}`;
        const starOptions = [1, 2, 3, 4, 5].map(value => ({
            label: `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`,
            description: `Rating ${value} out of 5`,
            value: String(value)
        }));

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(selectId)
                .setPlaceholder('Choose a rating 1-5')
                .addOptions(starOptions)
        );

        const embed = new EmbedBuilder()
            .setTitle('🙏 Thanks for using our support')
            .setDescription(
                'Your ticket has been closed. Could you rate the support you received?\n\n' +
                'Choose a rating from 1 to 5 stars. This helps us improve.'
            )
            .addFields([
                { name: 'Ticket', value: ticketChannel.name, inline: true },
                { name: 'Category', value: category, inline: true },
                { name: 'Closed by', value: closer ? closer.tag : 'Unknown', inline: true }
            ])
            .setColor(config.colors.primary)
            .setTimestamp();

        try {
            await user.send({ embeds: [embed], components: [selectRow] });
        } catch (error) {
            console.warn('Could not send the review request DM to the user:', error.message);
        }
    }

    // Fetch channel history and create a transcript file, then DM it to the target user
    static async sendTranscriptToUser(user, channel) {
        if (!user || !channel) return;

        try {
            const lines = [];

            // Fetch messages in batches up to 1000 messages (10 * 100)
            let lastId = null;
            let fetchedAll = false;
            while (!fetchedAll && lines.length < 5000) {
                const options = { limit: 100 };
                if (lastId) options.before = lastId;
                const msgs = await channel.messages.fetch(options).catch(() => null);
                if (!msgs || msgs.size === 0) break;

                const arr = Array.from(msgs.values());
                for (const m of arr) {
                    const when = new Date(m.createdTimestamp).toISOString();
                    const author = m.author ? `${m.author.tag} (${m.author.id})` : `Unknown (${m.author ? m.author.id : '0'})`;
                    const content = m.content ? m.content.replace(/\r?\n/g, ' \n ') : '';
                    const attachments = m.attachments && m.attachments.size ? ` [Attachments: ${m.attachments.map(a => a.url).join(', ')}]` : '';
                    lines.push(`[${when}] ${author}: ${content}${attachments}`);
                }

                lastId = arr[arr.length - 1].id;
                if (msgs.size < 100) fetchedAll = true;
            }

            // We fetched messages in reverse chronological order; reverse to chronological
            lines.reverse();

            const header = `Ticket transcript: ${channel.name}\nServer: ${channel.guild ? channel.guild.name : 'Unknown'}\nChannel: ${channel.id}\nGenerated: ${new Date().toISOString()}\n\n`;
            const text = header + lines.join('\n');

            const buffer = Buffer.from(text, 'utf8');
            const filename = `transcript-${channel.name.replace(/[^a-z0-9-_\.]/gi, '-')}.txt`;
            const attachment = new AttachmentBuilder(buffer, { name: filename });

            // Build an embed similar to the screenshot
            const embed = new EmbedBuilder()
                .setTitle('Ticket transcript:')
                .setDescription(`\n\u200B`)
                .addFields([
                    { name: '\u200B', value: `\nServer: ${channel.guild ? channel.guild.name : 'Unknown'}` },
                    { name: 'Channel', value: channel.toString() }
                ])
                .setColor(config.colors.primary)
                .setTimestamp();

            // Send DM with embed + file (best effort)
            await user.send({ embeds: [embed], files: [attachment] });
        } catch (err) {
            console.warn('[sendTranscriptToUser] error creating or sending transcript:', err && err.message ? err.message : err);
            throw err;
        }
    }

    static async handleReviewSubmission(interaction) {
        const [ , ticketId, userId, closerId ] = interaction.customId.split(':');
        const rating = parseInt(interaction.values[0], 10);

        // Confirm to the user in DM
        const thanksEmbed = new EmbedBuilder()
            .setTitle('✅ Thanks for your rating!')
            .setDescription(`You rated the ticket **${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}**`)
            .setColor(config.colors.success)
            .setTimestamp();

        await interaction.update({ embeds: [thanksEmbed], components: [] });

        const reviewChannelId = config.reviewChannel;
        if (!reviewChannelId) return;

        const reviewChannel = await interaction.client.channels.fetch(reviewChannelId).catch(() => null);
        if (!reviewChannel || !reviewChannel.isTextBased()) {
            console.warn('Review channel is invalid or not text-based.');
            return;
        }

        const closerMention = closerId ? `<@${closerId}>` : 'Unknown';
        const userMention = userId ? `<@${userId}>` : interaction.user.toString();
        const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);

        const reviewEmbed = new EmbedBuilder()
            .setTitle('📝 New Ticket Review')
            .setDescription(`Rating: **${stars}**`)
            .addFields([
                { name: 'User', value: userMention, inline: true },
                { name: 'Closed by', value: closerMention, inline: true },
                { name: 'Ticket', value: ticketId ? `#${ticketId}` : 'Unknown', inline: true }
            ])
            .setColor(config.colors.primary)
            .setTimestamp();

        try {
            await reviewChannel.send({ embeds: [reviewEmbed] });
        } catch (error) {
            console.error('Error sending the review to the configured channel:', error);
        }
    }
}

module.exports = TicketHandler;