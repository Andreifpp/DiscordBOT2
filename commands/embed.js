const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('📝 Enviar un mensaje embed personalizado')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option
                .setName('json')
                .setDescription('JSON del embed (ejemplo: {"title":"Título","description":"Descripción","color":"#9d4edd"})')
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Canal donde enviar el embed (opcional, por defecto el canal actual)')
                .setRequired(false)
        ),

    async execute(interaction) {
        // Verificar permisos
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return interaction.reply({
                content: '❌ No tienes permisos para usar este comando.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const jsonString = interaction.options.getString('json');
            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

            // Validar que es un canal de texto
            if (!targetChannel.isTextBased()) {
                return interaction.editReply({
                    content: '❌ El canal especificado debe ser un canal de texto.'
                });
            }

            // Parsear JSON
            let embedData;
            try {
                embedData = JSON.parse(jsonString);
            } catch (parseError) {
                return interaction.editReply({
                    content: `❌ JSON inválido. Error: ${parseError.message}\n\n**Ejemplo de uso:**\n\`\`\`json\n{"title":"Mi Título","description":"Mi descripción","color":"#9d4edd"}\n\`\`\``
                });
            }

            // Crear el embed
            const embed = new EmbedBuilder(embedData);

            // Enviar el embed
            await targetChannel.send({ embeds: [embed] });

            // Confirmar al usuario
            await interaction.editReply({
                content: `✅ Embed enviado exitosamente en ${targetChannel}`
            });

        } catch (error) {
            console.error('Error en comando embed:', error);
            
            const errorMessage = `❌ Error al crear el embed: ${error.message}`;
            
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
};
