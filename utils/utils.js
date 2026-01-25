const config = process.env.NODE_ENV === 'production' ? require('../config-production') : require('../config');

class EmbedUtils {
    static createSuccessEmbed(title, description) {
        const { EmbedBuilder } = require('discord.js');
        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(config.colors.success)
            .setTimestamp();
    }

    static createErrorEmbed(title, description) {
        const { EmbedBuilder } = require('discord.js');
        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(config.colors.error)
            .setTimestamp();
    }

    static createWarningEmbed(title, description) {
        const { EmbedBuilder } = require('discord.js');
        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(config.colors.warning)
            .setTimestamp();
    }

    static createInfoEmbed(title, description) {
        const { EmbedBuilder } = require('discord.js');
        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(config.colors.primary)
            .setTimestamp();
    }
}

class PermissionUtils {
    static hasStaffRole(member) {
        return member.roles.cache.has(config.supportRole) || 
               member.roles.cache.has(config.adminRole) ||
               member.permissions.has('ManageChannels');
    }

    static hasAdminRole(member) {
        return member.roles.cache.has(config.adminRole) ||
               member.permissions.has('Administrator');
    }

    static isTicketOwner(channel, userId) {
        return channel.topic && channel.topic.includes(userId);
    }
}

class FormatUtils {
    static formatTime(timestamp) {
        return `<t:${Math.floor(timestamp / 1000)}:F>`;
    }

    static formatRelativeTime(timestamp) {
        return `<t:${Math.floor(timestamp / 1000)}:R>`;
    }

    static formatUser(user) {
        return `${user.tag} (${user.id})`;
    }

    static truncateText(text, maxLength = 1024) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    }
}

module.exports = {
    EmbedUtils,
    PermissionUtils,
    FormatUtils
};