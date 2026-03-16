const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  small:  { name: 'Mata Gold – Small (24mm)',  boxPrice: 165, rolls: 36 },
  medium: { name: 'Mata Gold – Medium (36mm)', boxPrice: 165, rolls: 24 },
  large:  { name: 'Mata Gold – Large (48mm)',  boxPrice: 185, rolls: 20 },
};

const PROGRAM_DISCOUNTS = { cpia: 30, resi: 30, bpn: 30, admin: 94 };

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { items, partnerCode, email, companyName } = req.body;

    if (!items || !items.length) return res.status(400).json({ error: 'No items in cart' });
    if (!email) return res.status(400).json({ error: 'Email is required for invoicing' });

    const partnerDiscount = getPartnerDiscount(partnerCode);
    const totalBoxes  = items.reduce((sum, item) => sum + (item.boxes || 0), 0);
    const bulkDiscount = getBulkDiscount(totalBoxes);

    // Find or create Stripe customer
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data.length
      ? existing.data[0]
      : await stripe.customers.create({ email, name: companyName || email });

    // Create invoice with Net-15 terms
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: 'send_invoice',
      days_until_due: 15,
      auto_advance: false,
      footer: 'Payment due within 15 days of invoice date. Thank you for your business — Mata Tape, Inc.',
      metadata: {
        partner_code: partnerCode || '',
        partner_discount_pct: String(partnerDiscount),
        bulk_discount_pct: String(bulkDiscount),
      },
    });

    // Add line items to invoice
    for (const item of items) {
      const product = PRODUCTS[item.id];
      if (!product) throw new Error(`Unknown product: ${item.id}`);

      let boxPrice = product.boxPrice;
      const discount = Math.max(partnerDiscount, bulkDiscount);
      if (discount > 0) boxPrice *= (1 - discount / 100);

      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        quantity: item.boxes,
        unit_amount: Math.round(boxPrice * 100),
        currency: 'usd',
        description: `${product.name} – ${product.rolls} rolls/box`,
      });
    }

    // Finalize and send
    await stripe.invoices.finalizeInvoice(invoice.id);
    await stripe.invoices.sendInvoice(invoice.id);

    res.status(200).json({ success: true, invoiceNumber: invoice.number });
  } catch (err) {
    console.error('Invoice error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
