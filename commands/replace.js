const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = process.env.NODE_ENV === 'production' ? require('../config-production') : require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('replace')
        .setDescription('🔄 Gestión de replacements')
        .addSubcommand(subcommand =>
            subcommand
                .setName('send')
                .setDescription('Enviar replacement de una orden al cliente')
                .addStringOption(opt =>
                    opt
                        .setName('order_id')
                        .setDescription('ID de la orden')
                        .setRequired(true)
                )
                .addUserOption(opt =>
                    opt
                        .setName('user')
                        .setDescription('Usuario que recibirá el replacement')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt
                        .setName('credentials')
                        .setDescription('Cuenta / Credenciales (ej: email@gmail.com:password123)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('message')
                .setDescription('Mostrar requisitos para solicitar un replacement')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('pending')
                .setDescription('Marcar este ticket como Replace Pending')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('done')
                .setDescription('Marcar este ticket como Replace Done')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'message') {
            // Crear embed con los requisitos de replacement
            const arrowEmoji = config.emojis.arroww || '▶';
            const replaceEmoji = config.emojis.replace || '🔄';
            const emailEmoji = config.emojis.email || '📧';
            
            const requirementsEmbed = new EmbedBuilder()
                .setTitle('Replacement Requirements')
                .setDescription(`To process your replacement, please provide the following information:\n\n${arrowEmoji} **Video** of you attempting to access the account.\n${arrowEmoji} **Product Invoice ID** and **Order ID**.\n${arrowEmoji} **Full proof** of payment (screenshot).\n${arrowEmoji} **Email** used for the purchase.`)
                .setColor(config.colors.primary || '#0099ff')
                .setFooter({ text: 'Max Market • Replacement System', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            await interaction.reply({ embeds: [requirementsEmbed] });
            return;
        }

        if (subcommand === 'send') {
            const orderId = interaction.options.getString('order_id');
            const targetUser = interaction.options.getUser('user');
            const credentials = interaction.options.getString('credentials');

            // Crear embed de replacement
            const replaceEmoji = config.emojis.replace || '🔄';
            const idEmoji = config.emojis.idemoji || '🆔';
            const emailEmoji = config.emojis.email || '📧';
            
            const replacementEmbed = new EmbedBuilder()
                .setTitle(`${replaceEmoji} Replacement Ready`)
                .setDescription(`${targetUser.toString()}, your replacement is ready. Use the account below to access your product.`)
                .setColor(config.colors.success || '#00ff00')
                .addFields(
                    { name: `${idEmoji} Order ID`, value: orderId, inline: true },
                    { name: '👤 Staff', value: interaction.user.toString(), inline: true },
                    { name: `${emailEmoji} Account / Credentials`, value: `\`\`\`\n${credentials}\n\`\`\``, inline: false }
                )
                .setFooter({ text: 'Max Market • Replacement System', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            // Enviar en el canal público (visible para todos)
            await interaction.reply({ embeds: [replacementEmbed] });
            return;
        }

        if (subcommand === 'pending') {
            // Verificar permisos (solo staff)
            const member = interaction.member;
            const allowedRoles = config.allowedCloseRoles || [];
            const isStaff = Boolean(
                (member && member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) ||
                (member && member.roles && member.roles.cache && (
                    member.roles.cache.has(config.supportRoleId) || 
                    member.roles.cache.some(r => allowedRoles.includes(String(r.id)))
                ))
            );

            if (!isStaff) {
                return interaction.reply({
                    content: '❌ No tienes permisos para usar este comando.',
                    ephemeral: true
                });
            }

            const channel = interaction.channel;

            // Verificar que sea un canal de ticket (incluyendo ya renombrados)
            if (!channel || !channel.name || (!channel.name.startsWith('ticket-') && !channel.name.includes('replace'))) {
                return interaction.reply({
                    content: '❌ Este comando solo puede usarse en canales de tickets.',
                    ephemeral: true
                });
            }

            try {
                // Cambiar nombre del canal a Replace Pending
                const noteppEmoji = '<:notepp:1465413371573829724>';
                await channel.setName('⭕・replace-pending');

                // Crear embed de confirmación
                const arrowEmoji = config.emojis.arroww || '▶';
                
                const embed = new EmbedBuilder()
                    .setTitle(`${noteppEmoji} Ticket Renamed`)
                    .setDescription(`This ticket channel has been renamed.\n\n${arrowEmoji} **Name:** ⭕ • Replace Pending`)
                    .setColor(config.colors.primary)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Error renaming channel:', error);
                await interaction.reply({
                    content: '❌ Error al renombrar el canal. Verifica que el bot tenga permisos para gestionar canales.',
                    ephemeral: true
                });
            }
            return;
        }

        if (subcommand === 'done') {
            // Verificar permisos (solo staff)
            const member = interaction.member;
            const allowedRoles = config.allowedCloseRoles || [];
            const isStaff = Boolean(
                (member && member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) ||
                (member && member.roles && member.roles.cache && (
                    member.roles.cache.has(config.supportRoleId) || 
                    member.roles.cache.some(r => allowedRoles.includes(String(r.id)))
                ))
            );

            if (!isStaff) {
                return interaction.reply({
                    content: '❌ No tienes permisos para usar este comando.',
                    ephemeral: true
                });
            }

            const channel = interaction.channel;

            // Verificar que sea un canal de ticket o replace-pending
            if (!channel || !channel.name || (!channel.name.startsWith('ticket-') && !channel.name.includes('replace'))) {
                return interaction.reply({
                    content: '❌ Este comando solo puede usarse en canales de tickets o replace-pending.',
                    ephemeral: true
                });
            }

            try {
                // Cambiar nombre del canal a replace-done
                await channel.setName('✅・replace-done');

                // Crear embed de confirmación
                const arrowEmoji = config.emojis.arroww || '▶';
                
                const embed = new EmbedBuilder()
                    .setTitle('✅ Replacement Complete')
                    .setDescription(`This ticket channel has been renamed to **Replace Done**.\n\n${arrowEmoji} **Name:** ✅ • replace-done`)
                    .setColor(config.colors.primary)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Error renaming channel:', error);
                await interaction.reply({
                    content: '❌ Error al renombrar el canal. Verifica que el bot tenga permisos para gestionar canales.',
                    ephemeral: true
                });
            }
            return;
        }
    }
};
