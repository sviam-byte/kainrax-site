const { Deta } = require('deta');           // npm i deta
const deta = Deta(process.env.DETA_PROJECT_KEY);
const db = deta.Base('pageviews');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  const { slug } = JSON.parse(event.body || '{}');
  if (!slug) return { statusCode: 400, body: 'Missing slug' };

  const key = slug.startsWith('/') ? slug : `/${slug}`;

  let rec = await db.get(key);
  if (!rec) { await db.put({ count: 1 }, key); rec = { count: 1 }; }
  else { rec.count += 1; await db.update({ count: rec.count }, key); }

  return {
    statusCode: 200,
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ count: rec.count })
  };
};
