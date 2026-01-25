const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = process.env.NODE_ENV === 'production' ? require('../config-production') : require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('replace')
        .setDescription('🔄 Enviar replacement de una orden al cliente')
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
                .setFooter({ text: 'Max Market • Replacement System • hoy a las 13:57', iconURL: interaction.client.user.displayAvatarURL() })
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
        }
    }
};
