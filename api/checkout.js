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
    const { items, partnerCode } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    const partnerDiscount = getPartnerDiscount(partnerCode);

    const totalBoxes = items.reduce((sum, item) => sum + (item.boxes || 0), 0);
    const bulkDiscount = getBulkDiscount(totalBoxes);

    const lineItems = items.map(item => {
      const product = PRODUCTS[item.id];
      if (!product) throw new Error(`Unknown product: ${item.id}`);

      let boxPrice = product.boxPrice;
      const discount = Math.max(partnerDiscount, bulkDiscount);
      if (discount > 0) boxPrice *= (1 - discount / 100);

      const unitAmountCents = Math.round(boxPrice * 100);

      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.name,
            description: `${product.rolls} rolls · ${item.boxes} box${item.boxes !== 1 ? 'es' : ''}`,
          },
          unit_amount: unitAmountCents,
        },
        quantity: item.boxes,
      };
    });

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      automatic_tax: { enabled: true },
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel.html`,
      metadata: {
        partner_code: partnerCode || '',
        partner_discount_pct: String(partnerDiscount),
        bulk_discount_pct: String(bulkDiscount),
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
