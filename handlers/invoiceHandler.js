const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');

// small fetch helper with timeout
function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(t));
}

async function fetchSellAuthInvoice(invoiceId) {
    // prefer config keys
    const apiKey = config.sellauthApiKey || process.env.SELLAUTH_API_KEY;
    const shopId = config.sellauthShopId || process.env.SELLAUTH_SHOP_ID;

    if (!apiKey || !shopId) {
        console.warn('[fetchSellAuthInvoice] SellAuth not configured.');
        return null;
    }

    const url = `https://api.sellauth.com/v1/shops/${shopId}/invoices/${encodeURIComponent(invoiceId)}`;
    const res = await fetchWithTimeout(url, {
        headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json'
        }
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(`[fetchSellAuthInvoice] SellAuth API responded ${res.status} ${res.statusText} for invoice ${invoiceId}`);
        if (res.status === 404) return null;
        throw new Error(`SellAuth API error ${res.status}: ${text || res.statusText}`);
    }

    const data = await res.json().catch(() => null);
    const inv = data?.data ?? data;

    // Try to normalize deliverables/items from different backends (SellAuth, Stripe, custom)
    const items = inv?.items ?? inv?.invoice_items ?? inv?.products ?? inv?.deliverables ?? inv?.delivered ?? inv?.delivered_items ?? inv?.deliverable_items ?? inv?.lines ?? [];

    return {
        id: inv?.id ?? inv?.invoice_id ?? invoiceId,
        status: inv?.status ?? inv?.state ?? 'Unknown',
        email: inv?.email ?? inv?.buyer_email ?? inv?.customer_email ?? inv?.customer?.email ?? '—',
        created_at: inv?.created_at ?? inv?.createdAt ?? inv?.created ?? null,
        completed_at: inv?.completed_at ?? inv?.completedAt ?? inv?.completed ?? null,
        total_price: inv?.total_price ?? inv?.total ?? inv?.amount ?? inv?.price ?? null,
        total_paid: inv?.total_paid ?? inv?.paid ?? null,
        items: items,
        replace: inv?.replace ?? inv?.is_replacement ?? 'No',
        raw: inv
    };
}

async function fetchInvoiceByOrderId(orderId) {
    const supabaseUrl = config.supabaseUrl || process.env.SUPABASE_URL;
    const supabaseKey = config.supabaseKey || process.env.SUPABASE_KEY;
    const supabaseTable = config.supabaseTable || process.env.SUPABASE_TABLE || 'orders';
    const invoicesApiUrl = config.invoicesApiUrl || process.env.INVOICES_API_URL;

    // 1) Supabase
    if (supabaseUrl && supabaseKey) {
        const headers = {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            Accept: 'application/json'
        };

        let url = `${supabaseUrl}/rest/v1/${supabaseTable}?short_id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`;
        let res = await fetchWithTimeout(url, { headers });
        if (res.ok) {
            const rows = await res.json();
            if (Array.isArray(rows) && rows[0]) return rows[0];
        }

        if (orderId.includes('-')) {
            url = `${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`;
            res = await fetchWithTimeout(url, { headers });
            if (res.ok) {
                const rows = await res.json();
                if (Array.isArray(rows) && rows[0]) return rows[0];
            }
        }
        return null;
    }

    // 2) API propia
    if (invoicesApiUrl) {
        const url = `${invoicesApiUrl}?order_id=${encodeURIComponent(orderId)}`;
        const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`API error (${res.status})`);
        const data = await res.json();
        return data?.invoice ?? data;
    }

    // 3) SellAuth
    const sellAuthInvoice = await fetchSellAuthInvoice(orderId);
    if (sellAuthInvoice) return sellAuthInvoice;

    // Nothing configured
    throw new Error('No billing backend configured. Set SUPABASE_URL/SUPABASE_KEY, INVOICES_API_URL, or SELLAUTH_API_KEY + SELLAUTH_SHOP_ID.');
}

class InvoiceHandler {
    static async handleInteraction(interaction) {
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('invoice_items:')) {
                await this.showItems(interaction);
            } else if (interaction.customId.startsWith('invoice_replace:')) {
                await this.showReplaceModal(interaction);
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('replace_account_modal:')) {
                await this.handleReplaceSubmit(interaction);
            }
        }
    }

    static async showItems(interaction) {
        const parts = interaction.customId.split(':');
        const orderId = parts[1];
        const invokerId = parts[2] || null;

        // Safely defer reply — sometimes interactions expire and deferReply throws Unknown interaction
        try {
            await interaction.deferReply({ ephemeral: true });
        } catch (deferErr) {
            console.warn('[invoice_items] deferReply failed:', deferErr && deferErr.code ? deferErr.code : deferErr);
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: 'Procesando... (fallback)', ephemeral: true });
                }
            } catch (replyErr) {
                console.warn('[invoice_items] fallback reply failed:', replyErr && replyErr.code ? replyErr.code : replyErr);
            }
        }

        try {
            const invoice = await fetchInvoiceByOrderId(orderId);
            
            if (!invoice) {
                return interaction.editReply({ content: `❌ No se encontró la orden.` });
            }

            let items = (invoice && invoice.items) ? invoice.items : ((invoice && invoice.products) ? invoice.products : []);
            if (typeof items === 'string') {
                try { items = JSON.parse(items); } catch (_) { items = []; }
            }

            // Log para depurar
            console.log('[invoice_items] Raw items:', JSON.stringify(items, null, 2));

            if (!Array.isArray(items) || items.length === 0) {
                return interaction.editReply({ content: `❌ No hay items en esta orden.` });
            }

            // Determine if the user is staff (allowed to view sensitive credentials)
            const member = interaction.member;
            const allowedRoles = config.allowedCloseRoles || [];
            let isStaff = Boolean(
                member &&
                    member.permissions &&
                    member.permissions.has &&
                    member.permissions.has(PermissionFlagsBits.Administrator) ||
                    (member && member.roles && member.roles.cache && (member.roles.cache.has(config.supportRoleId) || member.roles.cache.some(r => allowedRoles.includes(String(r.id)))))
            );
            // Consider guild owner as staff as well
            try {
                if (!isStaff && interaction.guild && String(interaction.guild.ownerId) === String(interaction.user.id)) isStaff = true;
            } catch (e) {
                // ignore
            }

            // Determine if the interaction user is the buyer (so they can see their credentials)
            let isBuyer = false;
            try {
                const possibleBuyerIds = [
                    invoice && invoice.discord_id,
                    invoice && invoice.discordId,
                    invoice && invoice.buyer_discord,
                    invoice && invoice.buyer_discord_id,
                    invoice && invoice.user_id,
                    invoice && invoice.userId,
                    invoice && invoice.owner_discord_id,
                    invoice && invoice.ownerId,
                ].filter(Boolean).map(String);

                if (possibleBuyerIds.includes(String(interaction.user.id))) {
                    isBuyer = true;
                }

                if (!isBuyer && invoice && invoice.raw) {
                    const raw = invoice.raw;
                    const cand = raw && (raw.discord_id || (raw.metadata && (raw.metadata.discordId || raw.metadata.discord_id)) || (raw.buyer && (raw.buyer.discord_id || raw.buyer.id)));
                    if (cand && String(cand) === String(interaction.user.id)) isBuyer = true;
                }

                if (!isBuyer && interaction.message && interaction.message.interaction && interaction.message.interaction.user && interaction.message.interaction.user.id) {
                    const originalInvokerId = interaction.message.interaction.user.id;
                    if (String(originalInvokerId) === String(interaction.user.id)) isBuyer = true;
                }

                // If the button included the invokerId, allow that user as buyer (works even if backend lacks discord id)
                if (!isBuyer && invokerId && String(invokerId) === String(interaction.user.id)) {
                    isBuyer = true;
                }
            } catch (e) {
                console.warn('[invoice_items] buyer detection error:', e && e.message ? e.message : e);
            }

            const embed = new EmbedBuilder()
                .setTitle(`📦 Order Items • ${orderId}`)
                .setColor(config.colors.primary)
                .setFooter({ text: 'Max Market', iconURL: interaction.client.user.displayAvatarURL() })
                .setTimestamp();

            items.forEach((it, idx) => {
                console.log(`[invoice_items] Item ${idx}:`, typeof it, JSON.stringify(it));
                
                let name, email, password;
                
                // Si es un string, parsearlo primero
                let itemObj = it;
                if (typeof it === 'string') {
                    // Try JSON parse first (some backends serialize items as JSON strings)
                    try {
                        itemObj = JSON.parse(it);
                        console.log(`[invoice_items] Parsed item ${idx}:`, JSON.stringify(itemObj));
                    } catch (e) {
                        // Not JSON — keep original string in a known property
                        console.log(`[invoice_items] Item ${idx} is a raw string, attempting pattern parse`);
                        itemObj = { _raw: it };
                    }
                }
                
                // Construir nombre del producto
                if (itemObj && itemObj.pid && itemObj.plan) {
                    name = `${itemObj.pid.charAt(0).toUpperCase() + itemObj.pid.slice(1)} ${itemObj.plan}`;
                } else {
                    name = (itemObj && itemObj.name) ? itemObj.name : ((itemObj && itemObj.title) ? itemObj.title : ((itemObj && itemObj.plan) ? itemObj.plan : `Item ${idx + 1}`));
                }
                
                // Buscar credenciales en itemObj.credentials primero
                if (itemObj && itemObj.credentials && typeof itemObj.credentials === 'object') {
                    email = (itemObj.credentials && itemObj.credentials.email) ? itemObj.credentials.email : '—';
                    password = (itemObj.credentials && itemObj.credentials.password) ? itemObj.credentials.password : '—';
                    console.log(`[invoice_items] Found credentials in object:`, email ? '***' : '-', password ? '***' : '-');
                } else if (itemObj && typeof itemObj.credentials === 'string') {
                    // Si credentials es un string JSON, parsearlo
                    try {
                        const creds = JSON.parse(itemObj.credentials);
                            email = (creds && creds.email) ? creds.email : '—';
                            password = (creds && creds.password) ? creds.password : '—';
                            console.log(`[invoice_items] Parsed credentials from string:`, email ? '***' : '-', password ? '***' : '-');
                    } catch {
                        email = '—';
                        password = '—';
                    }
                } else if (itemObj && itemObj._raw && typeof itemObj._raw === 'string') {
                    // Some systems (like SellAuth deliverables) return lines like:
                    // "email@example.com:password|Country = AR" or "email:pass"
                    const s = itemObj._raw.trim();
                    // Try to extract email:password patterns
                    const credMatch = s.match(/([^\s|:]+@[^\s|:]+):([^|\s]+)/);
                    if (credMatch) {
                        email = credMatch[1];
                        password = credMatch[2];
                        console.log(`[invoice_items] Extracted credentials from raw string ${idx}:`, email ? '***' : '-', password ? '***' : '-');
                    } else {
                        // Maybe simple user:pass without email
                        const simpleMatch = s.match(/([^\s|:]+):([^|\s]+)/);
                        if (simpleMatch) {
                            email = simpleMatch[1];
                            password = simpleMatch[2];
                            console.log(`[invoice_items] Extracted simple credentials from raw string ${idx}:`, email ? '***' : '-', password ? '***' : '-');
                        }
                    }
                } else {
                        email = (itemObj && itemObj.email) ? itemObj.email : ((itemObj && itemObj.account_email) ? itemObj.account_email : '—');
                        password = (itemObj && itemObj.password) ? itemObj.password : ((itemObj && itemObj.account_password) ? itemObj.account_password : '—');
                        console.log(`[invoice_items] Using fallback credentials:`, email ? '***' : '-', password ? '***' : '-');
                }

                // If this item includes a "delivered" array (SellAuth style), render each delivered line separately
                if (itemObj && Array.isArray(itemObj.delivered) && itemObj.delivered.length) {
                    itemObj.delivered.forEach((dline, j) => {
                        const ds = (typeof dline === 'string') ? dline.trim() : String(dline);
                        let e = '—', p = '—';
                        const cm = ds.match(/([^\s|:]+@[^\s|:]+):([^|\s]+)/) || ds.match(/([^\s|:]+):([^|\s]+)/);
                        if (cm) {
                            e = cm[1];
                            p = cm[2];
                        }
                        const showCredentialsDelivered = Boolean(isStaff || isBuyer);
                        const emailDisplayDelivered = showCredentialsDelivered ? (e || '—') : (e ? '🔒 Hidden (staff only)' : '—');
                        const passDisplayDelivered = showCredentialsDelivered ? (p || '—') : (p ? '🔒 Hidden (staff only)' : '—');
                        embed.addFields({
                            name: `${idx + 1}.${j + 1} ${name}`,
                            value: `📧 Email: \`${emailDisplayDelivered}\`\n🔑 Password: \`${passDisplayDelivered}\``,
                            inline: false
                        });
                    });
                    return; // continue to next item in forEach
                }

                // Decide what to display depending on role (staff) or buyer status
                const showCredentials = Boolean(isStaff || isBuyer);
                const emailDisplay = showCredentials ? (email || '—') : (email ? '🔒 Hidden (staff only)' : '—');
                const passDisplay = showCredentials ? (password || '—') : (password ? '🔒 Hidden (staff only)' : '—');

                embed.addFields({
                    name: `${idx + 1}. ${name}`,
                    value: `📧 Email: \`${emailDisplay}\`\n🔑 Password: \`${passDisplay}\``,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('Error fetching items:', err);
            await interaction.editReply({ content: `❌ Error obteniendo los items: ${err.message}` });
        }
    }

    static async showReplaceModal(interaction) {
        const invoiceId = interaction.customId.split(':')[1];

        const modal = new ModalBuilder()
            .setCustomId(`replace_account_modal:${invoiceId}`)
            .setTitle('Mark as Replacement');

        const dataInput = new TextInputBuilder()
            .setCustomId('replacement_data')
            .setLabel('Línea 1: User ID | Línea 2+: Credenciales')
            .setPlaceholder('442385253525618699\nemail@gmail.com:password123')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(20)
            .setMaxLength(1000);

        const row = new ActionRowBuilder().addComponents(dataInput);
        modal.addComponents(row);

        return interaction.showModal(modal);
    }

    static async handleReplaceSubmit(interaction) {
        const [, invoiceId] = interaction.customId.split(':');
        const rawData = interaction.fields.getTextInputValue('replacement_data');
        
        // Separar primera línea (User ID) del resto (credenciales)
        const lines = rawData.trim().split('\n');
        const userId = lines[0].trim();
        const account = lines.slice(1).join('\n').trim() || 'No credentials provided';

        // Validar que el User ID tenga formato correcto
        if (!/^\d{17,20}$/.test(userId)) {
            return interaction.reply({
                content: '❌ El User ID debe estar en la primera línea y tener 17-20 dígitos.',
                ephemeral: true
            });
        }

        // Obtener usuario por ID
        const targetUser = await interaction.client.users.fetch(userId).catch(() => null);

        if (!targetUser) {
            return interaction.reply({
                content: '❌ No se pudo encontrar al usuario. Verifica que el ID sea correcto.',
                ephemeral: true
            });
        }

        // Enviar en el canal público (visible para todos)
        const replacementEmbed = new EmbedBuilder()
            .setTitle('🔄 Replacement Ready')
            .setDescription(`${targetUser.toString()}, your replacement is ready. Use the account below to access your product.`)
            .setColor(config.colors.success)
            .addFields(
                { name: '🆔 Order ID', value: invoiceId, inline: true },
                { name: '👤 Staff', value: interaction.user.toString(), inline: true },
                { name: '📝 Account / Credentials', value: `\`\`\`\n${account}\n\`\`\``, inline: false }
            )
            .setFooter({ text: 'Max Market • Replacement System', iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [replacementEmbed] });
    }
}

module.exports = InvoiceHandler;
