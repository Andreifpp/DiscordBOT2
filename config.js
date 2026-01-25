// config.js
require('dotenv').config();

let fileConfig = {};
if (process.env.NODE_ENV !== 'production') {
  // En local SI usamos config.json
  try {
    fileConfig = require('./config.json');
  } catch (e) {
    fileConfig = {};
  }
}

// Helper: prefer ENV, then fileConfig (both common key variations), then fallback
const envOrFile = (envNames, fileKeys, fallback) => {
  for (const n of envNames) if (process.env[n]) return process.env[n];
  for (const k of fileKeys) if (fileConfig && typeof fileConfig[k] !== 'undefined') return fileConfig[k];
  return fallback;
};

module.exports = {
  // Token: SIEMPRE desde ENV en producción
  token: envOrFile(['TOKEN'], ['token'], null),

  // Client ID (necesario para deploy-commands.js)
  clientId: envOrFile(['CLIENT_ID'], ['clientId'], null),

  // IDs / roles / canales (mapeamos variantes usadas en el repo)
  guildId: envOrFile(['GUILD_ID'], ['guildId', 'guild'], null),
  // Support role may be named supportRole, supportRoleId or SUPPORT_ROLE_ID
  supportRoleId: envOrFile(['SUPPORT_ROLE_ID', 'SUPPORTROLEID'], ['supportRoleId', 'supportRole', 'support_role', 'supportRoleID'], null),
  // Category id may be called ticketsCategory, ticketCategoryId, TICKET_CATEGORY_ID, etc.
  ticketsCategory: envOrFile(['TICKETS_CATEGORY', 'TICKET_CATEGORY_ID', 'TICKETSCATEGORY'], ['ticketsCategory', 'ticketCategoryId', 'ticketCategory'], null),
  // Log / review channels
  logChannel: envOrFile(['LOG_CHANNEL_ID', 'LOG_CHANNEL'], ['logChannel', 'log_channel', 'logChannelId'], null),
  reviewChannel: envOrFile(['REVIEW_CHANNEL_ID', 'REVIEW_CHANNEL'], ['reviewChannel'], null),

  // Invoices / Supabase (si aplica)
  supabaseUrl: envOrFile(['SUPABASE_URL'], ['supabaseUrl'], null),
  supabaseKey: envOrFile(['SUPABASE_KEY'], ['supabaseKey'], null),
  supabaseTable: envOrFile(['SUPABASE_TABLE'], ['supabaseTable'], 'invoices'),
  invoicesApiUrl: envOrFile(['INVOICES_API_URL'], ['invoicesApiUrl', 'invoicesApi'], null),
  sellauthApiKey: process.env.SELLAUTH_API_KEY || fileConfig.sellauthApiKey,
  sellauthShopId: process.env.SELLAUTH_SHOP_ID || fileConfig.sellauthShopId,


  // Allowed roles list (accepts array in fileConfig or comma-separated env)
  allowedCloseRoles: (() => {
    const env = envOrFile(['ALLOWED_CLOSE_ROLES'], [], null);
    if (env && typeof env === 'string') return env.split(',').map(s => s.trim()).filter(Boolean);
    if (Array.isArray(fileConfig.allowedCloseRoles)) return fileConfig.allowedCloseRoles;
    return [];
  })(),

  // Colores (para que no crashee el embed). Aceptamos varias claves y garantizamos 'error' y 'danger'
  colors: (() => {
    const fc = fileConfig.colors || {};
    const primary = envOrFile(['PRIMARY_COLOR'], ['colors.primary', 'primary', 'colors_primary'], '#9d4edd');
    const success = envOrFile(['SUCCESS_COLOR'], ['colors.success', 'success'], '#2ecc71');
    const danger = envOrFile(['DANGER_COLOR'], ['colors.danger', 'danger'], null) || fc.danger || fc.error || '#e74c3c';
    const error = envOrFile(['ERROR_COLOR'], ['colors.error', 'error'], null) || fc.error || fc.danger || danger;
    const warning = envOrFile(['WARNING_COLOR'], ['colors.warning', 'warning'], fc.warning || '#ffd166');
    const secondary = envOrFile(['SECONDARY_COLOR'], ['colors.secondary', 'secondary'], fc.secondary || '#c77dff');
    // Resolver: convert hex color strings like '#rrggbb' to numeric color (discord expects number or array)
    const parseColor = (val) => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const s = val.trim();
        const hex = s.startsWith('#') ? s.slice(1) : (s.startsWith('0x') ? s.slice(2) : s);
        if (/^[0-9A-Fa-f]{6}$/.test(hex)) return parseInt(hex, 16);
      }
      return null;
    };

    const p = parseColor(primary) ?? parseColor('#9d4edd');
    const s = parseColor(success) ?? parseColor('#2ecc71');
    const d = parseColor(danger) ?? parseColor('#e74c3c');
    const e = parseColor(error) ?? d;
    const w = parseColor(warning) ?? parseColor('#ffd166');
    const sec = parseColor(secondary) ?? parseColor('#c77dff');

    return { primary: p, success: s, danger: d, error: e, warning: w, secondary: sec };
  })(),

  // Emojis
  emojis: (() => {
    // Si hay emojis en fileConfig (local), usarlos
    if (fileConfig.emojis && Object.keys(fileConfig.emojis).length > 0) {
      return fileConfig.emojis;
    }
    
    // En producción, leer desde variables de entorno o usar defaults
    return {
      ticket: process.env.EMOJI_TICKET || '🎫',
      purchases: process.env.EMOJI_PURCHASES || '🛒',
      support: process.env.EMOJI_SUPPORT || '💬',
      replace: process.env.EMOJI_REPLACE || '🔄',
      email: process.env.EMOJI_EMAIL || '📧',
      id: process.env.EMOJI_ID || '🆔',
      notReceived: process.env.EMOJI_NOT_RECEIVED || '📦',
      close: process.env.EMOJI_CLOSE || '🔒',
      delete: process.env.EMOJI_DELETE || '🗑️',
      add: process.env.EMOJI_ADD || '➕',
      remove: process.env.EMOJI_REMOVE || '➖',
      see: process.env.EMOJI_SEE || '👀',
      replaced: process.env.EMOJI_REPLACED || '🔁',
      mark: process.env.EMOJI_MARK || '🔖',
      manuelphone: process.env.EMOJI_MANUELPHONE || '📱',
      items: process.env.EMOJI_ITEMS || '📋',
      info: process.env.EMOJI_INFO || 'ℹ️',
      idemoji: process.env.EMOJI_IDEMOJI || '🆔',
      gateway: process.env.EMOJI_GATEWAY || '🌐',
      amms: process.env.EMOJI_AMMS || '⚙️',
      actions: process.env.EMOJI_ACTIONS || '⚡',
      comprar: process.env.EMOJI_COMPRAR || '🛍️',
      cale: process.env.EMOJI_CALE || '📅',
      arroww: process.env.EMOJI_ARROWW || '▶',
      all: process.env.EMOJI_ALL || '📦'
    };
  })(),
};
