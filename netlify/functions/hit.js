// /netlify/functions/hit.js
const { Deta } = require('deta');
const deta = Deta(process.env.DETA_PROJECT_KEY);
const db = deta.Base('pageviews');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')  return { statusCode: 405, headers, body: JSON.stringify({ error:'Method Not Allowed' }) };

  try {
    const { slug } = JSON.parse(event.body || '{}');
    if (!slug) return { statusCode: 400, headers, body: JSON.stringify({ error:'Missing "slug"' }) };

    const key = slug.startsWith('/') ? slug : `/${slug}`;
    let rec = await db.get(key);
    if (!rec) { await db.put({ count: 1 }, key); rec = { count: 1 }; }
    else { rec.count = (Number(rec.count)||0) + 1; await db.update({ count: rec.count }, key); }

    return { statusCode: 200, headers, body: JSON.stringify({ count: rec.count }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: String(e && e.message || e) }) };
  }
};
