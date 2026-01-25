

// commands/invoice.js
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const config = require('../config');

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(t));
}

/**
 * SellAuth: Get Invoice
 * Needs:
 *  - SELLAUTH_API_KEY
 *  - SELLAUTH_SHOP_ID
 */
async function fetchSellAuthInvoice(invoiceId) {
  console.log('[fetchSellAuthInvoice] invoiceId=', invoiceId);
  const apiKey = config.sellauthApiKey || process.env.SELLAUTH_API_KEY;
  const shopId = config.sellauthShopId || process.env.SELLAUTH_SHOP_ID;

  if (!apiKey || !shopId) {
    console.warn('[fetchSellAuthInvoice] SellAuth not configured. Missing API key or Shop ID.');
    return null;
  }

  const url = `https://api.sellauth.com/v1/shops/${shopId}/invoices/${encodeURIComponent(invoiceId)}`;
  const res = await fetchWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Log para depuración (no imprimir API key)
    console.warn(`[fetchSellAuthInvoice] SellAuth API responded ${res.status} ${res.statusText} for invoice ${invoiceId}`);
    // 404 -> no existe
    if (res.status === 404) return null;
    throw new Error(`SellAuth API error ${res.status}: ${text || res.statusText}`);
  }

  const data = await res.json();
  const inv = data?.data ?? data;

  // Normalizamos campos para que tu embed sea consistente
  return {
    id: inv?.id ?? inv?.invoice_id ?? invoiceId,
    status: inv?.status ?? inv?.state ?? 'Unknown',
    email: inv?.email ?? inv?.buyer_email ?? inv?.customer_email ?? inv?.customer?.email ?? '—',
    created_at: inv?.created_at ?? inv?.createdAt ?? inv?.created ?? null,
    completed_at: inv?.completed_at ?? inv?.completedAt ?? inv?.completed ?? null,
    total_price: inv?.total_price ?? inv?.total ?? inv?.amount ?? inv?.price ?? inv?.price_usd ?? null,
    total_paid: inv?.total_paid ?? inv?.paid ?? inv?.paid_usd ?? null,
    items: inv?.items ?? inv?.invoice_items ?? inv?.products ?? [],
    replace: inv?.replace ?? inv?.is_replacement ?? 'No',
    raw: inv,
  };
}

async function fetchInvoiceByOrderId(orderId) {
  // Prefer Supabase REST if configured
  const supabaseUrl = config.supabaseUrl || process.env.SUPABASE_URL;
  const supabaseKey = config.supabaseKey || process.env.SUPABASE_KEY;
  const supabaseTable = config.supabaseTable || process.env.SUPABASE_TABLE || 'invoices';
  const invoicesApiUrl = config.invoicesApiUrl || process.env.INVOICES_API_URL;

  // 1) Supabase
  if (supabaseUrl && supabaseKey) {
    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    };

    // Buscar por short_id
    let url = `${supabaseUrl}/rest/v1/${supabaseTable}?short_id=eq.${encodeURIComponent(
      orderId
    )}&select=*&limit=1`;
    console.log(`[invoice] Query short_id=${orderId}`);

    let res = await fetchWithTimeout(url, { headers });
    if (res.ok) {
      const rows = await res.json();
      console.log(`[invoice] Found ${rows.length || 0} rows`);
      if (Array.isArray(rows) && rows[0]) {
        console.log(`[invoice] Found order: ${rows[0]?.id}`);
        return rows[0];
      }
    } else {
      console.log(`[invoice] short_id query failed (${res.status}), fallback...`);
    }

    // Fallback UUID completo
    if (orderId.includes('-')) {
      url = `${supabaseUrl}/rest/v1/${supabaseTable}?id=eq.${encodeURIComponent(
        orderId
      )}&select=*&limit=1`;
      console.log(`[invoice] Query by full UUID`);
      res = await fetchWithTimeout(url, { headers });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0]) return rows[0];
      }
    }

    console.log(`[invoice] No order found for ${orderId}`);
    // Si supabase está configurado pero no existe, devolvemos null
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

  // Nada configurado
  throw new Error(
    'No billing backend configured. Set SUPABASE_URL/SUPABASE_KEY, INVOICES_API_URL, or SELLAUTH_API_KEY + SELLAUTH_SHOP_ID.'
  );
}

function toDiscordTs(ts) {
  if (!ts) return '—';
  const ms = typeof ts === 'string' ? Date.parse(ts) : Number(ts);
  if (!Number.isFinite(ms)) return '—';
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

function buildInvoiceEmbed(invoice, interaction) {
  const invoiceId = String(invoice?.id ?? invoice?.order_id ?? 'Unknown');
  const shortId = invoiceId.length > 8 ? invoiceId.substring(0, 8) : invoiceId;

  const status = String(invoice?.status ?? 'Unknown');
  const replace = invoice?.replace ?? 'No';

  const email =
    invoice?.email ??
    invoice?.buyer_email ??
    invoice?.customer_email ??
    invoice?.customer?.email ??
    'Unknown';

  let totalPrice =
    invoice?.total_price ??
    invoice?.total ??
    invoice?.amount ??
    (typeof invoice?.total_cents === 'number' ? invoice.total_cents / 100 : null);

  let totalPaid = invoice?.total_paid ?? invoice?.paid ?? null;

  const fmtMoney = (v) => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return `${v.toFixed(2)} €`;
    // si viene como string, lo mostramos tal cual
    return String(v);
  };

  // Items
  let items = invoice?.items ?? invoice?.products ?? [];
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch (_) {
      items = [];
    }
  }
  if (!Array.isArray(items)) items = [];

  const itemsText = items.length
    ? items.slice(0, 10).map((it, idx) => {
        let name, qty, price;

        if (typeof it === 'string') {
          try {
            const parsed = JSON.parse(it);
            name = parsed.plan ?? parsed.name ?? parsed.title ?? parsed.pid ?? `Item ${idx + 1}`;
            qty = parsed.qty ?? parsed.quantity ?? 1;
            price = parsed.unitAmount ?? parsed.price ?? parsed.total ?? null;
          } catch {
            name = it;
            qty = 1;
            price = null;
          }
        } else if (it?.pid && it?.plan) {
          name = `${String(it.pid).charAt(0).toUpperCase()}${String(it.pid).slice(1)} ${it.plan}`;
          qty = it.qty ?? 1;
          price = it.unitAmount ?? it.price ?? null;
        } else {
          name = it?.name ?? it?.title ?? it?.plan ?? it?.product_name ?? `Item ${idx + 1}`;
          qty = it?.quantity ?? it?.qty ?? 1;
          price = it?.price ?? it?.unit_price ?? it?.unitAmount ?? it?.total ?? null;
        }

        // Si viene en cents
        let priceStr = '';
        if (price !== null && price !== undefined && price !== '') {
          const num = Number(price);
          if (Number.isFinite(num)) {
            // Si parece cents (>= 100 y sin decimales), intenta /100
            const asEuros = Number.isInteger(num) && num >= 100 ? num / 100 : num;
            priceStr = ` • ${asEuros.toFixed(2)} €`;
          } else {
            priceStr = ` • ${String(price)}`;
          }
        }

        return `${idx + 1}. ${name} x${qty}${priceStr}`;
      }).join('\n')
    : '—';

  // Compute summed total from items as a best-effort fallback (handle cents vs euros)
  let computedTotal = 0;
  try {
    for (const it of items.slice(0, 100)) {
      let qty = 1;
      let price = null;

      if (typeof it === 'string') {
        try {
          const parsed = JSON.parse(it);
          qty = parsed.qty ?? parsed.quantity ?? 1;
          price = parsed.unitAmount ?? parsed.price ?? parsed.total ?? null;
        } catch {
          qty = 1;
          price = null;
        }
      } else if (it) {
        qty = it?.quantity ?? it?.qty ?? 1;
        price = it?.price ?? it?.unit_price ?? it?.unitAmount ?? it?.total ?? null;
      }

      if (price !== null && price !== undefined && price !== '') {
        const num = Number(price);
        if (Number.isFinite(num)) {
          const asEuros = Number.isInteger(num) && num >= 100 ? num / 100 : num;
          computedTotal += asEuros * (Number(qty) || 1);
        }
      }
    }
  } catch (e) {
    // ignore computation errors
  }

  // If reported totalPrice is missing or clearly incorrect (smaller than computed total), prefer computedTotal
  if ((totalPrice === null || totalPrice === undefined || totalPrice === '') && computedTotal > 0) {
    totalPrice = computedTotal;
  } else if (typeof totalPrice === 'number' && computedTotal > 0 && totalPrice + 0.01 < computedTotal) {
    // If invoice reports less than sum of items (allow small rounding), override
    totalPrice = computedTotal;
  }

  // Try to infer totalPaid from raw invoice data if missing
  if (totalPaid === null || totalPaid === undefined) {
    try {
      const raw = invoice?.raw ?? {};
      let paidSum = 0;
      let found = false;

      if (Array.isArray(raw.payments) && raw.payments.length) {
        for (const p of raw.payments) {
          const a = p.amount ?? p.amount_cents ?? p.paid_amount ?? p.value ?? null;
          if (a !== null && a !== undefined) {
            const num = Number(a);
            if (Number.isFinite(num)) {
              const asEuros = Number.isInteger(num) && num >= 100 ? num / 100 : num;
              paidSum += asEuros;
              found = true;
            }
          }
        }
      }

      // some APIs use transactions array
      if (!found && Array.isArray(raw.transactions) && raw.transactions.length) {
        for (const t of raw.transactions) {
          const a = t.amount ?? t.amount_cents ?? t.value ?? null;
          if (a !== null && a !== undefined) {
            const num = Number(a);
            if (Number.isFinite(num)) {
              const asEuros = Number.isInteger(num) && num >= 100 ? num / 100 : num;
              paidSum += asEuros;
              found = true;
            }
          }
        }
      }

      // fallback single fields
      if (!found) {
        const cand = raw.total_paid ?? raw.paid ?? raw.paid_amount ?? raw.amount_paid ?? null;
        if (cand !== null && cand !== undefined) {
          const num = Number(cand);
          if (Number.isFinite(num)) {
            paidSum = Number.isInteger(num) && num >= 100 ? num / 100 : num;
            found = true;
          }
        }
      }

      if (found) totalPaid = paidSum;
    } catch (e) {
      // ignore
    }
  }

  const createdAt = invoice?.created_at ?? invoice?.createdAt ?? invoice?.created ?? null;
  const completedAt = invoice?.completed_at ?? invoice?.completedAt ?? invoice?.completed ?? null;

  const e = new EmbedBuilder()
    .setTitle(`🧾 Invoice • ${shortId}`)
    .setColor(config?.colors?.primary ?? '#9d4edd')
    .addFields(
      { name: '🔖 Status', value: status, inline: true },
      { name: '🆔 ID', value: shortId, inline: true },
      { name: '⚙️ Replace', value: String(replace), inline: true },

      { name: '📧 Email', value: String(email), inline: false },

      {
        name: '💰 Amounts',
        value: `Total Price: ${fmtMoney(totalPrice)}\nTotal Paid: ${fmtMoney(totalPaid)}`,
        inline: false,
      },

      { name: '📦 Items', value: itemsText, inline: false },

      { name: '📅 Created', value: toDiscordTs(createdAt), inline: true },
      { name: '✔️ Completed', value: completedAt ? toDiscordTs(completedAt) : '—', inline: true }
    )
    .setFooter({ text: 'Max Market • Invoice Lookup', iconURL: interaction.client.user.displayAvatarURL() })
    .setTimestamp();

  // Botones
  const seeItemsBtn = new ButtonBuilder()
    .setCustomId(`invoice_items:${shortId}:${interaction.user.id}`)
    .setLabel('See Items')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('📦');

  const markReplaceBtn = new ButtonBuilder()
    .setCustomId(`invoice_replace:${invoiceId}`)
    .setLabel('Mark Replace')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔄');

  const buttonRow = new ActionRowBuilder().addComponents(seeItemsBtn, markReplaceBtn);

  return { embed: e, buttons: buttonRow };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invoice')
    .setDescription('🔎 Consultar una factura/pedido por Invoice ID')
    .addStringOption((opt) =>
      opt.setName('invoice_id').setDescription('ID de la factura (SellAuth) / Order ID').setRequired(true)
    ),

  async execute(interaction) {
    let invoiceId = interaction.options.getString('invoice_id');
    // Fallback: if the registered option name differs or is missing, try to grab the first provided option
    if (!invoiceId) {
      try {
        const opts = interaction.options && Array.isArray(interaction.options.data) ? interaction.options.data : null;
        if (opts && opts.length > 0 && typeof opts[0].value === 'string') {
          invoiceId = String(opts[0].value);
          console.warn('[invoice] invoice_id option was empty; falling back to first option value:', invoiceId);
        }
      } catch (e) {
        console.warn('[invoice] error while extracting fallback invoice id from options:', e);
      }
    }

    // Responder públicamente (defensivo: capturamos errores en deferReply para evitar Unknown interaction)
    try {
      await interaction.deferReply();
    } catch (deferErr) {
      console.error('[invoice] deferReply failed:', deferErr && deferErr.code ? deferErr.code : deferErr);
      // Intentar notificar al usuario de forma segura
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ No pude procesar la interacción a tiempo. Intenta de nuevo.', ephemeral: true });
        }
      } catch (replyErr) {
        console.warn('[invoice] fallback reply failed:', replyErr && replyErr.code ? replyErr.code : replyErr);
        try {
          if (interaction.channel && interaction.channel.send) {
            await interaction.channel.send('❌ No pude procesar tu interacción. Intenta de nuevo.');
          }
        } catch (chanErr) {
          console.error('[invoice] channel fallback failed:', chanErr && chanErr.code ? chanErr.code : chanErr);
        }
      }
      return;
    }

    try {
      if (!invoiceId) {
        return interaction.editReply({ content: `❌ No se proporcionó un Invoice ID válido.` });
      }
      const invoice = await fetchInvoiceByOrderId(invoiceId);
      if (!invoice) {
        return interaction.editReply({ content: `❌ No se encontró información para: ${invoiceId}` });
      }

      const invoiceData = buildInvoiceEmbed(invoice, interaction);
      await interaction.editReply({ embeds: [invoiceData.embed], components: [invoiceData.buttons] });
    } catch (err) {
      console.error('Invoice lookup error:', err);

      const msg =
        String(err?.message || '').includes('No billing backend configured')
          ? '❌ Backend de facturas no configurado. Configura SUPABASE_URL/SUPABASE_KEY, INVOICES_API_URL, o SELLAUTH_API_KEY + SELLAUTH_SHOP_ID (Render env).'
          : `❌ Error consultando la orden: ${err?.message || 'Unknown error'}`;

      await interaction.editReply({ content: msg });
    }
  },
};

