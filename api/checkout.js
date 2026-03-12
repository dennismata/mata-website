const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRODUCTS = {
  small:  { name: 'Mata Gold – Small (24mm)',  boxPrice: 165, rolls: 36 },
  medium: { name: 'Mata Gold – Medium (36mm)', boxPrice: 165, rolls: 24 },
  large:  { name: 'Mata Gold – Large (48mm)',  boxPrice: 185, rolls: 20 },
};

const PARTNER_DISCOUNTS = {
  'CPIA2026': 30,
  'T1P2026':  30,
  'BPN2026':  30,
};

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

    const partnerDiscount = partnerCode
      ? (PARTNER_DISCOUNTS[partnerCode.toUpperCase()] || 0)
      : 0;

    const totalBoxes = items.reduce((sum, item) => sum + (item.boxes || 0), 0);
    const bulkDiscount = getBulkDiscount(totalBoxes);

    const lineItems = items.map(item => {
      const product = PRODUCTS[item.id];
      if (!product) throw new Error(`Unknown product: ${item.id}`);

      let boxPrice = product.boxPrice;
      if (partnerDiscount > 0) boxPrice *= (1 - partnerDiscount / 100);
      if (bulkDiscount > 0)    boxPrice *= (1 - bulkDiscount / 100);

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
