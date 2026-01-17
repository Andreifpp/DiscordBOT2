const { Events } = require('discord.js');

// Este manejador se deja vacío porque la lógica de interacciones se gestiona en index.js
module.exports = {
    name: Events.InteractionCreate,
    async execute() {
        return; // Evitar manejos duplicados
    },
};