module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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
      const emailHtml = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#00205B;">
          <div style="background:#00205B;padding:24px 32px;border-radius:12px 12px 0 0;">
            <h1 style="margin:0;color:#CC9933;font-size:20px;font-weight:700;">New Free Sample Request</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,.7);font-size:14px;">${submittedAt}</p>
          </div>
          <div style="background:#F2EDE4;padding:32px;border-radius:0 0 12px 12px;">
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;font-weight:700;width:160px;">Name</td><td style="padding:8px 0;">${firstName} ${lastName}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700;">Email</td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#CC9933;">${email}</a></td></tr>
              ${company ? `<tr><td style="padding:8px 0;font-weight:700;">Company</td><td style="padding:8px 0;">${company}</td></tr>` : ''}
              <tr><td style="padding:8px 0;font-weight:700;">Location</td><td style="padding:8px 0;">${city}, ${state} ${zip}</td></tr>
              ${phone ? `<tr><td style="padding:8px 0;font-weight:700;">Phone</td><td style="padding:8px 0;">${phone}</td></tr>` : ''}
              <tr><td style="padding:8px 0;font-weight:700;vertical-align:top;">Sizes</td><td style="padding:8px 0;">${sizesText}</td></tr>
            </table>
            <div style="margin-top:20px;padding:16px;background:#fff;border-radius:8px;border-left:4px solid #CC9933;">
              <p style="margin:0;font-weight:700;margin-bottom:8px;">Message</p>
              <p style="margin:0;line-height:1.6;">${message.replace(/\n/g, '<br>')}</p>
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
          subject: `Sample Request — ${firstName} ${lastName}${company ? ` (${company})` : ''}`,
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
    res.status(500).json({ error: err.message });
  }
};
