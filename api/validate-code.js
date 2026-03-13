const PROGRAM_DISCOUNTS = { cpia: 30, t1p: 20, bpn: 30, admin: 0 };
const PROGRAM_REBATES   = { cpia: 0,  t1p: 0,  bpn: 5,  admin: 0 };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
    rebate:   PROGRAM_REBATES[program]   ?? 0,
  });
};
