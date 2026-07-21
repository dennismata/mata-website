const PROGRAM_DISCOUNTS = { cpia: 30, resi: 30, bpn: 30, admin: 99, five: 5, ten: 10, fifteen: 15, twenty: 20, twentyfive: 25, thirty: 30, thirtyfive: 35, fourty: 40, fourtyfive: 45 };
const rateLimit = require('./_rateLimit');

const ALLOWED_ORIGINS = ['https://www.mata-tape.com', 'https://mata-tape.com'];

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app') || origin.startsWith('http://localhost');
  res.setHeader('Access-Control-Allow-Origin', allowed ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (!rateLimit(`validate:${ip}`, 30, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });

  let codes = {};
  try {
    codes = JSON.parse(process.env.PARTNER_CODES || '{}');
  } catch {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const program = codes[code.trim().toUpperCase()];
  if (!program) return res.status(200).json({ valid: false });

  res.status(200).json({
    valid: true,
    program,
    discount: PROGRAM_DISCOUNTS[program] ?? 0,
  });
};
