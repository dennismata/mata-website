const ALLOWED_ORIGINS = ['https://www.mata-tape.com', 'https://mata-tape.com'];
const rateLimit = require('./_rateLimit');

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

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
  if (!rateLimit(`sample:${ip}`, 5, 60 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { firstName, lastName, email, company, city, state, zip, phone, message, sizes } = req.body;

    if (!firstName || !lastName || !email || !city || !state || !zip || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const sizesText = Array.isArray(sizes) && sizes.length ? sizes.join(', ') : 'None selected';
    const submittedAt = new Date().toISOString();

    // 1. Save to Supabase
    const supabaseUrl = process.env.SUPABASE_URL || 'https://nqlbagluwxotlxmcurru.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseKey) {
      await fetch(`${supabaseUrl}/rest/v1/sample_requests`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          email,
          company: company || null,
          city,
          state,
          zip,
          phone: phone || null,
          message,
          sizes: sizesText,
          submitted_at: submittedAt,
        }),
      });
    }

    // 2. Send email via Resend
    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      const eName      = `${escapeHtml(firstName)} ${escapeHtml(lastName)}`;
      const eEmail     = escapeHtml(email);
      const eCompany   = escapeHtml(company);
      const eCity      = escapeHtml(city);
      const eState     = escapeHtml(state);
      const eZip       = escapeHtml(zip);
      const ePhone     = escapeHtml(phone);
      const eSizesText = escapeHtml(sizesText);
      const eMessage   = escapeHtml(message).replace(/\n/g, '<br>');

      const emailHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#00205B;">
          <div style="background:#00205B;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="margin:0;color:#CC9933;font-size:20px;font-weight:700;">New Free Sample Request</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.7);font-size:14px;">${submittedAt}</p>
          </div>
          <div style="background:#F2EDE4;padding:32px;border-radius:0 0 12px 12px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;font-weight:700;width:160px;">Name</td><td style="padding:8px 0;">${eName}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700;">Email</td><td style="padding:8px 0;"><a href="mailto:${eEmail}" style="color:#CC9933;">${eEmail}</a></td></tr>
              ${eCompany ? `<tr><td style="padding:8px 0;font-weight:700;">Company</td><td style="padding:8px 0;">${eCompany}</td></tr>` : ''}
              <tr><td style="padding:8px 0;font-weight:700;">Location</td><td style="padding:8px 0;">${eCity}, ${eState} ${eZip}</td></tr>
              ${ePhone ? `<tr><td style="padding:8px 0;font-weight:700;">Phone</td><td style="padding:8px 0;">${ePhone}</td></tr>` : ''}
              <tr><td style="padding:8px 0;font-weight:700;vertical-align:top;">Sizes</td><td style="padding:8px 0;">${eSizesText}</td></tr>
            </table>
            <div style="margin-top:20px;padding:16px;background:#fff;border-radius:8px;border-left:4px solid #CC9933;">
              <p style="margin:0;font-weight:700;margin-bottom:8px;">Message</p>
              <p style="margin:0;line-height:1.6;">${eMessage}</p>
            </div>
          </div>
        </div>
      `;

      const resendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Mata Gold <noreply@mata-tape.com>',
          to: ['sales@mata-tape.com'],
          reply_to: email,
          subject: `Sample Request — ${escapeHtml(firstName)} ${escapeHtml(lastName)}${company ? ` (${escapeHtml(company)})` : ''}`,
          html: emailHtml,
        }),
      });
      const resendBody = await resendResp.json();
      if (!resendResp.ok) {
        console.error('Resend error:', resendResp.status, JSON.stringify(resendBody));
        return res.status(200).json({ ok: true, resendError: resendBody });
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Sample request error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};
