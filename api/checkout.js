const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const rateLimit = require('./_rateLimit');

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!rateLimit(`checkout:${ip}`, 20, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { items, partnerCode, state, email } = req.body;

    if (!items || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    const partnerDiscount = getPartnerDiscount(partnerCode);

    const totalBoxes = items.reduce((sum, item) => sum + (item.boxes || 0), 0);
    const bulkDiscount = getBulkDiscount(totalBoxes);

    const lineItems = [];
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

      const unitAmountCents = Math.round(boxPrice * 100);
      productSubtotal += boxPrice * boxes;

      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.name,
            description: `${product.rolls} rolls · ${boxes} box${boxes !== 1 ? 'es' : ''}`,
          },
          unit_amount: unitAmountCents,
        },
        quantity: boxes,
      });
    }

    const shippingCost = calcShipping(state, productSubtotal, totalBoxes, Math.max(partnerDiscount, bulkDiscount));
    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: { name: 'Shipping', tax_code: 'txcd_92010001' },
          unit_amount: shippingCost * 100,
        },
        quantity: 1,
      });
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const sessionParams = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      automatic_tax: { enabled: true },
      shipping_address_collection: { allowed_countries: ['US'] },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/cancel`,
      customer_creation: 'always',
      metadata: {
        partner_code: partnerCode || '',
        partner_discount_pct: String(partnerDiscount),
        bulk_discount_pct: String(bulkDiscount),
      },
    };
    if (email) sessionParams.customer_email = email;

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
