const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const config = process.env.NODE_ENV === 'production' ? require('../config-production') : require('../config');

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
            // Attempt to send the transcript DM to the ticket owner.
            // Do NOT send the review DM here — the user specifically wants the transcript only.
            try {
                console.log(`[confirmClose] attempting to send transcript to user ${ticketOwner.id}`);
                await this.sendTranscriptToUser(ticketOwner, channel);
                console.log(`[confirmClose] transcript DM sent to ${ticketOwner.id}`);
            } catch (e) {
                console.warn('[confirmClose] failed to send transcript DM:', e && e.message ? e.message : e);
            }
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

    // Close a ticket via a slash command (e.g. /close ticket)
    // This method mirrors the behavior of confirmClose but is safe to call from
    // a command interaction (uses reply/deferReply instead of update/deferUpdate).
    static async closeTicketFromCommand(interaction, reason = 'Sin razón especificada') {
        const channel = interaction.channel;

        // ensure we respond quickly to the command
        try {
            await interaction.deferReply({ ephemeral: true });
        } catch (e) {
            // ignore - proceed without defer
        }

        const embed = new EmbedBuilder()
            .setTitle('🔒 Ticket Closed')
            .setDescription(
                `This ticket has been closed by ${interaction.user}.\n\n` +
                `**Reason:** ${reason}\n\n` +
                `This channel will be deleted in **10 seconds**. Please save any important information now.`
            )
            .setColor(config.colors.error)
            .setTimestamp();

        try {
            // post the closing message in the ticket channel
            await channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('[closeTicketFromCommand] failed to send close embed to channel:', err);
        }

        // extract ticket owner id from channel topic safely
        let ticketOwner = null;
        let userId = null;
        if (channel.topic) {
            const topicMatch = channel.topic.match(/\((\d+)\)/);
            userId = topicMatch && topicMatch[1] ? topicMatch[1] : null;
            ticketOwner = userId ? await interaction.client.users.fetch(userId).catch(() => null) : null;
        }

        if (ticketOwner) {
            try {
                console.log(`[closeTicketFromCommand] attempting to send transcript to user ${ticketOwner.id}`);
                await this.sendTranscriptToUser(ticketOwner, channel);
                console.log(`[closeTicketFromCommand] transcript DM sent to ${ticketOwner.id}`);
            } catch (e) {
                console.warn('[closeTicketFromCommand] failed to send transcript DM:', e && e.message ? e.message : e);
            }
        }

        // Send log if configured
        if (config.logChannel) {
            if (channel.topic) {
                const tmatch = channel.topic.match(/\((\d+)\)/);
                const uid = tmatch && tmatch[1] ? tmatch[1] : null;
                if (uid) {
                    const user = await interaction.client.users.fetch(uid).catch(() => null);
                    await this.sendTicketLog(interaction.guild, user, channel, 'unknown', 'closed', interaction.user);
                }
            }
        }

        // delete the channel after 10s
        setTimeout(async () => {
            try {
                await channel.delete('Ticket closed via command');
            } catch (error) {
                console.error('Error deleting ticket channel after close command:', error);
            }
        }, 10000);

        // final reply to the command issuer
        try {
            await interaction.editReply({ content: '✅ Ticket will be closed shortly.' });
        } catch (e) {
            try { await interaction.followUp({ content: '✅ Ticket will be closed shortly.', ephemeral: true }); } catch (_) {}
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

                    // message content
                    let content = m.content ? m.content.replace(/\r?\n/g, ' \n ') : '';

                    // if no plain content, serialize embeds (so bot embeds are included)
                    if ((!content || content.trim() === '') && m.embeds && m.embeds.length) {
                        const parts = [];
                        for (const e of m.embeds) {
                            if (e.title) parts.push(`**${e.title}**`);
                            if (e.description) parts.push(e.description.replace(/\r?\n/g, ' \n '));
                            if (e.fields && e.fields.length) {
                                for (const f of e.fields) {
                                    parts.push(`${f.name}: ${f.value}`);
                                }
                            }
                        }
                        content = parts.join(' \n ');
                    }

                    // include attachments urls
                    const attachments = m.attachments && m.attachments.size ? ` [Attachments: ${m.attachments.map(a => a.url).join(', ')}]` : '';

                    lines.push(`[${when}] ${author}: ${content}${attachments}`);
                }

                lastId = arr[arr.length - 1].id;
                if (msgs.size < 100) fetchedAll = true;
            }

            // We fetched messages in reverse chronological order; reverse to chronological
            lines.reverse();

                const header = {
                    title: `Ticket transcript: ${channel.name}`,
                    server: channel.guild ? channel.guild.name : 'Unknown',
                    serverId: channel.guild ? channel.guild.id : 'unknown',
                    channelId: channel.id,
                    generated: new Date().toISOString()
                };

                // escape HTML
                const escapeHtml = (str) => String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/\"/g, '&quot;')
                    .replace(/'/g, '&#039;');

                // Build HTML document
                const htmlLines = lines.map(l => {
                    // The lines already include ISO timestamp at start in [..] form; keep as-is but escape rest
                    // Try to split off the timestamp
                    const tsMatch = l.match(/^\[(.*?)\]\s*(.*)$/);
                    let ts = '';
                    let rest = l;
                    if (tsMatch) {
                        ts = tsMatch[1];
                        rest = tsMatch[2];
                    }
                    return `<div class="message"><span class="time">${escapeHtml(ts)}</span> <span class="body">${escapeHtml(rest)}</span></div>`;
                }).join('\n');

                const creatorLine = (() => {
                    if (channel.topic) {
                        const creatorMatch = channel.topic.match(/\((\d+)\)/);
                        if (creatorMatch && creatorMatch[1]) {
                            return `Creator: &lt;@${creatorMatch[1]}&gt; (${creatorMatch[1]})`;
                        }
                    }
                    return '';
                })();

                const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8"/>\n<meta name="viewport" content="width=device-width,initial-scale=1"/>\n<title>Ticket transcript - ${escapeHtml(channel.name)}</title>\n<style>body{font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;background:#0f0f10;color:#e6e6e6;padding:20px} .container{max-width:900px;margin:0 auto;background:#111214;border-radius:8px;padding:18px;border-left:6px solid #8b5cf6} h1{font-size:18px;margin:0 0 8px} .meta{font-size:13px;color:#b9b9bf;margin-bottom:12px} .messages{background:#0b0b0c;padding:12px;border-radius:6px;overflow:auto} .message{padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03)} .time{color:#8b8b94;font-size:12px;margin-right:8px} .body{white-space:pre-wrap} a{color:#8b5cf6}</style>\n</head>\n<body>\n<div class="container">\n<h1>📄 Ticket Transcript</h1>\n<div class="meta">Server: ${escapeHtml(header.server)} (${escapeHtml(header.serverId)})<br/>Channel: ${escapeHtml(header.channelId)}${creatorLine ? '<br/>' + creatorLine : ''}<br/>Generated: ${escapeHtml(header.generated)}</div>\n<div class="messages">\n${htmlLines}\n</div>\n</div>\n</body>\n</html>`;

                const buffer = Buffer.from(html, 'utf8');
                const filename = `transcript-${channel.name.replace(/[^a-z0-9-_\\.]/gi, '-')}.html`;
            const attachment = new AttachmentBuilder(buffer, { name: filename });

            // Build an embed matching the requested style: title + short description + header block
            const headerLines = [];
            headerLines.push(`Ticket transcript ${channel.name}`);
            headerLines.push(`Server: ${channel.guild ? channel.guild.name : 'Unknown'} (${channel.guild ? channel.guild.id : 'unknown'})`);
            headerLines.push(`Channel: ${channel.id}`);
            // attempt to include creator line if present
            if (channel.topic) {
                const creatorMatch = channel.topic.match(/\((\d+)\)/);
                if (creatorMatch && creatorMatch[1]) {
                    headerLines.push(`Creator: <@${creatorMatch[1]}> (${creatorMatch[1]})`);
                }
            }
            headerLines.push(`Closed: ${new Date().toLocaleString()}`);

            const headerBlock = '```\n' + headerLines.join('\n') + '\n```';

            // Send a plain message with the requested two-line header and attach only the .txt file
            const messageContent = `📄 Ticket Transcript\nHere is the complete conversation from your ticket:`;

            const dm = await user.send({ content: messageContent, files: [attachment] });
            if (dm) console.log(`[sendTranscriptToUser] transcript DM sent to ${user.id}`);
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