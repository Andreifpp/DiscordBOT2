// scripts/test_sellauth.js
// Usage: set SELLAUTH_API_KEY and SELLAUTH_SHOP_ID in env, then:
// node scripts/test_sellauth.js INVOICE_ID

const fetch = global.fetch || require('node-fetch');

function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(t));
}

const apiKey = process.env.SELLAUTH_API_KEY;
const shopId = process.env.SELLAUTH_SHOP_ID;
const invoiceId = process.argv[2];

if (!invoiceId) {
  console.error('Usage: node scripts/test_sellauth.js INVOICE_ID');
  process.exit(1);
}
if (!apiKey || !shopId) {
  console.error('Please set SELLAUTH_API_KEY and SELLAUTH_SHOP_ID in env.');
  process.exit(1);
}

(async () => {
  try {
    const url = `https://api.sellauth.com/v1/shops/${shopId}/invoices/${encodeURIComponent(invoiceId)}`;
    console.log('Requesting:', url);
    const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } }, 10000);
    console.log('Status:', res.status, res.statusText);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      console.log('JSON response:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Text response:', text.substring(0, 2000));
    }
  } catch (err) {
    console.error('Fetch error:', err && err.message ? err.message : err);
    process.exit(2);
  }
})();
