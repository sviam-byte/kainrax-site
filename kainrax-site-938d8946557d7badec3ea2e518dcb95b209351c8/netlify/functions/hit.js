// netlify/functions/hit.js
const { Deta } = require('deta');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { slug } = JSON.parse(event.body || '{}');
    if (!slug) {
      return { statusCode: 400, body: JSON.stringify({ error: 'missing slug' }) };
    }

    const key = process.env.DETA_PROJECT_KEY;
    if (!key) {
      // Мягкий фолбэк: если ключ не задан, не падаем.
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        body: JSON.stringify({ count: 0 })
      };
    }

    const deta = Deta(key);
    const db = deta.Base('views');

    const existing = await db.get(slug);
    const count = (existing?.count || 0) + 1;
    await db.put({ key: slug, count });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ count })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'internal', reason: String(e && e.message || e) })
    };
  }
};
