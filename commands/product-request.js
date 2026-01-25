const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const config = process.env.NODE_ENV === 'production' ? require('../config-production') : require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('product-request')
        .setDescription('Create the product request panel (restock/new products)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async execute(interaction) {
        // Permission check
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({
                content: '❌ You do not have permission to create the product request panel.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('<:1457027324951138345:1465084788661551229> Restock a Product / Add a New Product')
            .setDescription('• Request a **restock** of an product\n• Suggest **new products** you would like us to add\n\nMax Market - Your trusted marketplace')
            .setColor(config.colors.primary)
            .setTimestamp();

        const button = new ButtonBuilder()
            .setCustomId('product_request_button')
            .setLabel('Restock a Product / Add a New product')
            .setEmoji('1465084788661551229')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder()
            .addComponents(button);

        await interaction.reply({
            content: 'Product request panel created successfully!',
            ephemeral: true
        });

        await interaction.channel.send({
            embeds: [embed],
            components: [row]
        });
    }
};
