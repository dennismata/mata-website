const SUPABASE_URL = 'https://nqlbagluwxotlxmcurru.supabase.co';

/**
 * Insert a row into a Supabase table using the service role key (bypasses RLS).
 */
module.exports = async function supabaseInsert(table, data) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY not set — skipping DB insert');
    return;
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`Supabase insert error (${table}):`, err);
  }
};
