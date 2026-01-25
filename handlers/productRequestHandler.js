const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const config = process.env.NODE_ENV === 'production' ? require('../config-production') : require('../config');

module.exports = {
    async handleInteraction(interaction) {
        // Handle button click - show modal
        if (interaction.customId === 'product_request_button') {
            const modal = new ModalBuilder()
                .setCustomId('product_request_modal')
                .setTitle('Please fill this out');

            const productInput = new TextInputBuilder()
                .setCustomId('product_request_input')
                .setLabel('Which Product Should be Restock or Add *')
                .setPlaceholder('Add (product name) / restock (which product)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMinLength(5)
                .setMaxLength(500);

            const firstActionRow = new ActionRowBuilder().addComponents(productInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
        }

        // Handle modal submission
        if (interaction.customId === 'product_request_modal') {
            await interaction.deferReply({ ephemeral: true });

            const productRequest = interaction.fields.getTextInputValue('product_request_input');
            const user = interaction.user;

            // Create embed for the request
            const requestEmbed = new EmbedBuilder()
                .setTitle('📦 New Product Request')
                .setColor(config.colors.primary)
                .addFields(
                    { name: 'Requested by', value: `${user.tag} (${user.id})`, inline: true },
                    { name: 'User', value: `<@${user.id}>`, inline: true },
                    { name: 'Request', value: productRequest }
                )
                .setThumbnail(user.displayAvatarURL())
                .setTimestamp()
                .setFooter({ 
                    text: 'Plug Market - Product Request System',
                    iconURL: interaction.client.user.displayAvatarURL()
                });

            // Send to product requests channel
            const productRequestsChannelId = config.productRequestsChannel;
            
            if (!productRequestsChannelId) {
                return interaction.editReply({
                    content: '⚠️ Product requests channel is not configured. Please contact an administrator.',
                    ephemeral: true
                });
            }

            try {
                const channel = await interaction.client.channels.fetch(productRequestsChannelId);
                
                if (!channel) {
                    return interaction.editReply({
                        content: '❌ Could not find the product requests channel.',
                        ephemeral: true
                    });
                }

                await channel.send({ embeds: [requestEmbed] });

                // Confirm to user
                const confirmEmbed = new EmbedBuilder()
                    .setTitle('✅ Request Sent')
                    .setDescription('Your product request has been sent to the Plug System team. Thank you for your suggestion!')
                    .setColor(config.colors.success)
                    .addFields(
                        { name: 'Your Request', value: productRequest }
                    )
                    .setFooter({ 
                        text: 'Este formulario se enviará a Plug System. No compartas contraseñas ni ningún tipo de información confidencial.'
                    });

                await interaction.editReply({
                    embeds: [confirmEmbed],
                    ephemeral: true
                });

            } catch (error) {
                console.error('Error sending product request:', error);
                await interaction.editReply({
                    content: '❌ There was an error sending your request. Please try again later.',
                    ephemeral: true
                });
            }
        }
    }
};
