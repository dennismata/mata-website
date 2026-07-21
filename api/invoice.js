const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const rateLimit = require('./_rateLimit');
const sendEmail = require('./_sendEmail');
const supabaseInsert = require('./_supabaseInsert');

const SUPABASE_URL = 'https://nqlbagluwxotlxmcurru.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xbGJhZ2x1d3hvdGx4bWN1cnJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDA3MzMsImV4cCI6MjA4ODk3NjczM30.9-zmqT-Wzt-OtQCQ4yeXGHecthS_FghVXglb0J1VNtY';

const PRODUCTS = {
  small:  { name: 'Mata Gold – Small (24mm)',  boxPrice: 237.24, rolls: 36 },
  medium: { name: 'Mata Gold – Medium (36mm)', boxPrice: 208.56, rolls: 24 },
  large:  { name: 'Mata Gold – Large (48mm)',  boxPrice: 209.80, rolls: 20 },
};

const PROGRAM_DISCOUNTS = { cpia: 30, resi: 30, bpn: 30, admin: 99 };

function getPartnerDiscount(partnerCode) {
  if (!partnerCode) return 0;
  try {
    const codes = JSON.parse(process.env.PARTNER_CODES || '{}');
    const program = codes[partnerCode.trim().toUpperCase()];
    return program ? (PROGRAM_DISCOUNTS[program] ?? 0) : 0;
  } catch { return 0; }
}

function getBulkDiscount(totalBoxes) {
  if (totalBoxes >= 10) return 25;
  if (totalBoxes >= 5)  return 20;
  if (totalBoxes >= 2)  return 10;
  return 0;
}

function calcShipping(state, subtotal, totalBoxes, partnerDiscount) {
  if (partnerDiscount >= 99) return 0; // admin: always free shipping
  if (!state) return 0;
  if (['IL', 'IN'].includes(state.toUpperCase())) {
    return subtotal >= 250 ? 0 : 25;
  }
  if (subtotal >= 500) return 0;
  return totalBoxes === 1 ? 25 : 40;
}

const ALLOWED_ORIGINS = ['https://www.mata-tape.com', 'https://mata-tape.com'];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app') || origin.startsWith('http://localhost');
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verify Supabase JWT
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Authentication required' });

  // Rate limit: 10 invoice requests per hour per user
  const { id: userId } = await userRes.json();
  if (!rateLimit(`invoice:${userId}`, 10, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { items, partnerCode, email, companyName, addrLine1, addrLine2, city, state, zip } = req.body;

    if (!items || !Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items in cart' });
    if (!email) return res.status(400).json({ error: 'Email is required for invoicing' });

    const partnerDiscount = getPartnerDiscount(partnerCode);
    const totalBoxes  = items.reduce((sum, item) => sum + (item.boxes || 0), 0);
    const bulkDiscount = getBulkDiscount(totalBoxes);

    // Build full customer address for Stripe (used for automatic tax)
    const customerAddress = (zip || state) ? {
      ...(addrLine1 ? { line1: addrLine1 } : {}),
      ...(addrLine2 ? { line2: addrLine2 } : {}),
      ...(city      ? { city }              : {}),
      ...(state     ? { state: state.toUpperCase() } : {}),
      ...(zip       ? { postal_code: zip }  : {}),
      country: 'US',
    } : undefined;

    const existing = await stripe.customers.list({ email, limit: 1 });
    let customer;
    if (existing.data.length) {
      customer = existing.data[0];
      if (customerAddress) {
        await stripe.customers.update(customer.id, { address: customerAddress, name: companyName || customer.name });
      }
    } else {
      customer = await stripe.customers.create({
        email,
        name: companyName || email,
        ...(customerAddress ? { address: customerAddress } : {}),
      });
    }

    // Create invoice with Net-15 terms
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: 15,
      auto_advance: false,
      automatic_tax: { enabled: true },
      footer: 'Payment due within 15 days of invoice date. Thank you for your business — Mata Tape, Inc.',
      metadata: {
        partner_code: partnerCode || '',
        partner_discount_pct: String(partnerDiscount),
        bulk_discount_pct: String(bulkDiscount),
      },
    });

    // Add product line items to invoice
    let productSubtotal = 0;
    for (const item of items) {
      const product = PRODUCTS[item.id];
      if (!product) return res.status(400).json({ error: 'Invalid product' });

      const boxes = parseInt(item.boxes, 10);
      if (!Number.isInteger(boxes) || boxes < 1 || boxes > 500) {
        return res.status(400).json({ error: 'Invalid quantity' });
      }

      let boxPrice = product.boxPrice;
      const discount = Math.max(partnerDiscount, bulkDiscount);
      if (discount > 0) boxPrice *= (1 - discount / 100);

      productSubtotal += boxPrice * boxes;

      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        quantity: boxes,
        unit_amount: Math.round(boxPrice * 100),
        currency: 'usd',
        description: `${product.name} – ${product.rolls} rolls/box`,
      });
    }

    // Add shipping line item if applicable
    const shippingCost = calcShipping(state, productSubtotal, totalBoxes, Math.max(partnerDiscount, bulkDiscount));
    if (shippingCost > 0) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        quantity: 1,
        unit_amount: shippingCost * 100,
        currency: 'usd',
        description: 'Shipping',
        tax_code: 'txcd_92010001',
      });
    }

    // Finalize and send
    await stripe.invoices.finalizeInvoice(invoice.id);
    const sentInvoice = await stripe.invoices.sendInvoice(invoice.id);

    // Store in Supabase
    const discountUsedForInsert = Math.max(partnerDiscount, bulkDiscount);
    const cents = v => v != null ? Math.round(v) / 100 : null;
    const invShipping = (sentInvoice.lines?.data || []).find(l => l.description === 'Shipping');
    await supabaseInsert('orders', {
      user_id:        userId,
      email,
      company_name:   companyName || null,
      type:           'invoice',
      stripe_id:      sentInvoice.id,
      invoice_number: sentInvoice.number,
      status:         'open',
      subtotal:       cents(sentInvoice.subtotal),
      shipping:       cents(invShipping?.amount),
      tax:            cents(sentInvoice.tax),
      total:          cents(sentInvoice.amount_due),
      discount_pct:   discountUsedForInsert,
      partner_code:   partnerCode || null,
      shipping_line1: addrLine1 || null,
      shipping_line2: addrLine2 || null,
      shipping_city:  city      || null,
      shipping_state: state     || null,
      shipping_zip:   zip       || null,
      date:           new Date().toISOString().split('T')[0],
      items: items.map(item => {
        const product = PRODUCTS[item.id];
        return product ? { id: item.id, name: product.name, boxes: parseInt(item.boxes, 10) } : null;
      }).filter(Boolean),
    });

    // Notify sales team
    const totalCents = sentInvoice.amount_due;
    const total = (totalCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    const discountUsed = Math.max(partnerDiscount, bulkDiscount);
    const discountRow = discountUsed > 0
      ? `<p style="margin:4px 0;color:#555;font-size:14px;">Discount applied: <strong>${discountUsed}%</strong>${partnerCode ? ` (${partnerCode})` : ''}</p>`
      : '';
    const itemsHtml = items.map(item => {
      const product = PRODUCTS[item.id];
      if (!product) return '';
      const boxes = parseInt(item.boxes, 10);
      let boxPrice = product.boxPrice;
      if (discountUsed > 0) boxPrice *= (1 - discountUsed / 100);
      const lineTotal = (boxPrice * boxes).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      return `<tr>
        <td style="padding:8px 0;color:#00205b;">${product.name} – ${product.rolls} rolls/box</td>
        <td style="padding:8px 0;text-align:center;color:#555;">${boxes}</td>
        <td style="padding:8px 0;text-align:right;color:#00205b;">${lineTotal}</td>
      </tr>`;
    }).join('');

    const shippingLines = [addrLine1, addrLine2, [city, state, zip].filter(Boolean).join(' ')].filter(Boolean);
    const shippingAddrHtml = shippingLines.length
      ? `<p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.6;">Ships to:<br>${shippingLines.join('<br>')}</p>`
      : '';

    await sendEmail({
      to: 'sales@mata-tape.com',
      subject: `Invoice Request — ${email} · ${total}`,
      html: `
        <div style="font-family:'DM Sans',Arial,sans-serif;max-width:560px;margin:0 auto;color:#00205b;">
          <div style="background:#00205b;padding:24px 32px;border-radius:12px 12px 0 0;">
            <p style="color:#c9a84c;font-size:13px;font-weight:700;letter-spacing:.08em;margin:0;">MATA TAPE</p>
            <h1 style="color:#fff;font-size:22px;margin:8px 0 0;">Invoice Request Received</h1>
          </div>
          <div style="background:#f7f5f0;padding:28px 32px;border-radius:0 0 12px 12px;">
            <p style="margin:0 0 4px;font-size:14px;color:#555;">Invoice #${sentInvoice.number}</p>
            <p style="margin:0 0 20px;font-size:16px;font-weight:600;">${companyName ? `${companyName} &lt;${email}&gt;` : email}</p>
            ${shippingAddrHtml}
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
                  <td colspan="2" style="padding:12px 0;font-weight:700;font-size:16px;">Total (before tax)</td>
                  <td style="padding:12px 0;text-align:right;font-weight:700;font-size:16px;color:#c9a84c;">${total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>`,
    });

    res.status(200).json({ success: true, invoiceNumber: sentInvoice.number });
  } catch (err) {
    console.error('Invoice error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
