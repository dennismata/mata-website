const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const rateLimit = require('./_rateLimit');

const SUPABASE_URL = 'https://nqlbagluwxotlxmcurru.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xbGJhZ2x1d3hvdGx4bWN1cnJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDA3MzMsImV4cCI6MjA4ODk3NjczM30.9-zmqT-Wzt-OtQCQ4yeXGHecthS_FghVXglb0J1VNtY';

const ALLOWED_ORIGINS = ['https://www.mata-tape.com', 'https://mata-tape.com'];

function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app') || origin.startsWith('http://localhost');
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Verify Supabase JWT
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Authentication required' });

  const { id: userId, email } = await userRes.json();

  if (!rateLimit(`orders:${userId}`, 20, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const allSessions = [];
    const seenIds = new Set();

    // Find Stripe customer(s) by email and their paid sessions
    const customers = await stripe.customers.list({ email, limit: 5 });
    for (const customer of customers.data) {
      const sessions = await stripe.checkout.sessions.list({
        customer: customer.id,
        limit: 50,
        expand: ['data.line_items'],
      });
      for (const s of sessions.data) {
        if (s.payment_status === 'paid' && !seenIds.has(s.id)) {
          seenIds.add(s.id);
          allSessions.push(s);
        }
      }
    }

    // Also scan recent sessions for ones with matching customer_details.email
    // (covers orders placed before customer_creation was enabled)
    const recentSessions = await stripe.checkout.sessions.list({
      limit: 100,
      expand: ['data.line_items'],
    });
    for (const s of recentSessions.data) {
      if (
        s.payment_status === 'paid' &&
        !seenIds.has(s.id) &&
        s.customer_details?.email?.toLowerCase() === email.toLowerCase()
      ) {
        seenIds.add(s.id);
        allSessions.push(s);
      }
    }

    // Fetch invoices for known customers
    const allInvoices = [];
    const seenInvoiceIds = new Set();
    for (const customer of customers.data) {
      const invoices = await stripe.invoices.list({ customer: customer.id, limit: 50 });
      for (const inv of invoices.data) {
        if (['open', 'paid'].includes(inv.status) && !seenInvoiceIds.has(inv.id)) {
          seenInvoiceIds.add(inv.id);
          allInvoices.push(inv);
        }
      }
    }

    // Combine and sort newest first
    const orders = [
      ...allSessions.map(s => ({
        type: 'checkout',
        id: s.id,
        created: s.created,
        amount_total: s.amount_total,
        currency: s.currency,
        status: 'paid',
        line_items: (s.line_items?.data || []).map(li => ({
          description: li.description,
          quantity: li.quantity,
          amount_total: li.amount_total,
        })),
        metadata: s.metadata || {},
      })),
      ...allInvoices.map(inv => ({
        type: 'invoice',
        id: inv.id,
        invoice_number: inv.number,
        invoice_url: inv.hosted_invoice_url,
        created: inv.created,
        amount_total: inv.amount_due,
        currency: inv.currency,
        status: inv.status,
        line_items: (inv.lines?.data || []).map(li => ({
          description: li.description,
          quantity: li.quantity,
          amount_total: li.amount,
        })),
        metadata: inv.metadata || {},
      })),
    ];

    orders.sort((a, b) => b.created - a.created);

    res.status(200).json({ orders });
  } catch (err) {
    console.error('Orders error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
