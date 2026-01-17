const config = {
    token: process.env.DISCORD_TOKEN || "",
    clientId: process.env.CLIENT_ID || "1434540590619562014",
    guildId: process.env.GUILD_ID || "1434533421266505778",
    ticketsCategory: process.env.TICKETS_CATEGORY || "1434536298143813773",
    supportRole: process.env.SUPPORT_ROLE || "1434537778674143287",
    adminRole: process.env.ADMIN_ROLE || "1434537186140754043",
    logChannel: process.env.LOG_CHANNEL || "",
    ticketPanelChannel: process.env.TICKET_PANEL_CHANNEL || "1434536298143813773",
    reviewChannel: process.env.REVIEW_CHANNEL || "1458586114989228135",
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseKey: process.env.SUPABASE_KEY || "",
    supabaseTable: process.env.SUPABASE_TABLE || "invoices",
    invoicesApiUrl: process.env.INVOICES_API_URL || "",
    colors: {
        primary: "#9d4edd",
        secondary: "#c77dff",
        success: "#06d6a0",
        error: "#ef476f",
        warning: "#ffd166"
    },
    emojis: {
        ticket: "🎫",
        purchases: "🛒",
        support: "💬",
        replace: "🔄",
        notReceived: "📦",
        close: "🔒",
        delete: "🗑️",
        add: "➕",
        remove: "➖"
    }
};

module.exports = config;