const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const rateLimit = require('./_rateLimit');
const sendEmail = require('./_sendEmail');
const supabaseInsert = require('./_supabaseInsert');

const SUPABASE_URL = 'https://nqlbagluwxotlxmcurru.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xbGJhZ2x1d3hvdGx4bWN1cnJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDA3MzMsImV4cCI6MjA4ODk3NjczM30.9-zmqT-Wzt-OtQCQ4yeXGHecthS_FghVXglb0J1VNtY';
const SALES_EMAIL = 'sales@mata-tape.com';

const ALLOWED_ORIGINS = ['https://www.mata-tape.com', 'https://mata-tape.com'];

// In-memory dedup to avoid duplicate notifications for the same session
const notified = new Set();

function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app') || origin.startsWith('http://localhost');
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function getUserId(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const { id } = await res.json();
    return id || null;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!rateLimit(`notify:${ip}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests.' });
  }

  const { session_id } = req.body;
  if (!session_id || !session_id.startsWith('cs_')) {
    return res.status(400).json({ error: 'Invalid session_id' });
  }

  if (notified.has(session_id)) {
    return res.status(200).json({ ok: true });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['line_items', 'total_details'],
    });

    if (session.payment_status !== 'paid') {
      return res.status(200).json({ ok: true });
    }

    notified.add(session_id);

    const customerEmail = session.customer_details?.email || '';
    const customerName  = session.customer_details?.name  || '';
    const addr          = session.shipping_details?.address;
    const partnerCode     = session.metadata?.partner_code || '';
    const partnerDiscount = parseInt(session.metadata?.partner_discount_pct || '0');
    const bulkDiscount    = parseInt(session.metadata?.bulk_discount_pct    || '0');
    const discountUsed    = Math.max(partnerDiscount, bulkDiscount);

    // Resolve user_id from JWT if logged in
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
    const userId = await getUserId(token);

    const cents = v => v != null ? Math.round(v) / 100 : null;

    // Store in Supabase
    await supabaseInsert('orders', {
      user_id:        userId,
      email:          customerEmail,
      company_name:   customerName || null,
      type:           'checkout',
      stripe_id:      session.id,
      status:         'paid',
      subtotal:       cents(session.amount_subtotal),
      shipping:       cents(session.total_details?.amount_shipping),
      tax:            cents(session.total_details?.amount_tax),
      total:          cents(session.amount_total),
      discount_pct:   discountUsed,
      partner_code:   partnerCode || null,
      shipping_line1: addr?.line1        || null,
      shipping_line2: addr?.line2        || null,
      shipping_city:  addr?.city         || null,
      shipping_state: addr?.state        || null,
      shipping_zip:   addr?.postal_code  || null,
      date:           new Date().toISOString().split('T')[0],
      items: (session.line_items?.data || []).map(li => ({
        description: li.description,
        quantity:    li.quantity,
        amount:      cents(li.amount_total),
      })),
    });

    // Send email notification
    const total    = (session.amount_total / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const date     = new Date(session.created * 1000).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const shortId  = session.id.replace('cs_', '').slice(0, 12).toUpperCase();
    const shippingAddr = addr
      ? `${addr.line1}, ${addr.city}, ${addr.state} ${addr.postal_code}`
      : '';
    const discountRow = discountUsed > 0
      ? `<p style="margin:4px 0;color:#555;font-size:14px;">Discount applied: <strong>${discountUsed}%</strong>${partnerCode ? ` (${partnerCode})` : ''}</p>`
      : '';
    const itemsHtml = (session.line_items?.data || []).map(li => `
      <tr>
        <td style="padding:8px 0;color:#00205b;">${li.description || 'Item'}</td>
        <td style="padding:8px 0;text-align:center;color:#555;">${li.quantity}</td>
        <td style="padding:8px 0;text-align:right;color:#00205b;">${(li.amount_total / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
      </tr>`).join('');

    await sendEmail({
      to: SALES_EMAIL,
      subject: `New Order — ${customerEmail} · ${total}`,
      html: `
        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;color:#00205b;">
          <div style="background:#00205b;padding:24px 32px;border-radius:12px 12px 0 0;">
            <p style="color:#c9a84c;font-size:13px;font-weight:700;letter-spacing:.08em;margin:0;">MATA TAPE</p>
            <h1 style="color:#fff;font-size:22px;margin:8px 0 0;">New Order Received</h1>
          </div>
          <div style="background:#f7f5f0;padding:28px 32px;border-radius:0 0 12px 12px;">
            <p style="margin:0 0 4px;font-size:14px;color:#555;">Order #${shortId} &nbsp;·&nbsp; ${date}</p>
            <p style="margin:0 0 20px;font-size:16px;font-weight:600;">${customerName ? `${customerName} &lt;${customerEmail}&gt;` : customerEmail}</p>
            ${shippingAddr ? `<p style="margin:0 0 20px;font-size:14px;color:#555;">Ships to: ${shippingAddr}</p>` : ''}
            ${discountRow}
            <table style="width:100%;border-collapse:collapse;margin-top:16px;">
              <thead>
                <tr style="border-bottom:2px solid rgba(0,32,91,.12);">
                  <th style="padding:8px 0;text-align:left;font-size:13px;color:#888;font-weight:600;">Item</th>
                  <th style="padding:8px 0;text-align:center;font-size:13px;color:#888;font-weight:600;">Qty</th>
                  <th style="padding:8px 0;text-align:right;font-size:13px;color:#888;font-weight:600;">Amount</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
              <tfoot>
                <tr style="border-top:2px solid rgba(0,32,91,.12);">
                  <td colspan="2" style="padding:12px 0;font-weight:700;font-size:16px;">Total</td>
                  <td style="padding:12px 0;text-align:right;font-weight:700;font-size:16px;color:#c9a84c;">${total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>`,
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Notify checkout error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
