// netlify/functions/media.js
// Прокси картинок: поддержка схем hub:/..., asset:/..., а также прямых https://
// Белый список доменов настраивается env-переменной MEDIA_DOMAIN_WHITELIST (через запятую).
// Дополнительно можно задать MEDIA_HUB_BASE и MEDIA_ASSETS_BASE.

const ALLOWED = String(process.env.MEDIA_DOMAIN_WHITELIST || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const HUB_BASE = process.env.MEDIA_HUB_BASE || '';     // напр. https://hub.example.com/media
const ASSETS_BASE = process.env.MEDIA_ASSETS_BASE || ''; // напр. https://assets.example.com

function resolveUrl(raw) {
  if (!raw) return null;
  if (raw.startsWith('hub:/')) {
    if (!HUB_BASE) return null;
    return `${HUB_BASE.replace(/\/+$/,'')}/${raw.replace(/^hub:\/*/, '')}`;
  }
  if (raw.startsWith('asset:/')) {
    if (!ASSETS_BASE) return null;
    return `${ASSETS_BASE.replace(/\/+$/,'')}/${raw.replace(/^asset:\/*/, '')}`;
  }
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

function allowed(u) {
  try {
    const url = new URL(u);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (!ALLOWED.length) return true; // если whitelist пуст — разрешаем всё
    return ALLOWED.includes(url.hostname);
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const raw = q.url || q.src || '';
    const target = resolveUrl(raw);
    if (!target) return { statusCode: 400, body: 'bad url' };
    if (!allowed(target)) return { statusCode: 403, body: 'forbidden domain' };

    const upstream = await fetch(target, {
      // передаём только минимальные заголовки
      headers: { 'User-Agent': 'kx-media-proxy' },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return { statusCode: upstream.status, body: `upstream error ${upstream.status}` };
    }

    // Буферизуем (простота и кэш CDN), можно сделать и stream если понадобится
    const arrbuf = await upstream.arrayBuffer();
    const buf = Buffer.from(arrbuf);
    const type = upstream.headers.get('content-type') || 'application/octet-stream';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, s-maxage=604800',
        'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox",
        'X-From': 'media-proxy',
      },
      body: buf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (e) {
    return { statusCode: 500, body: 'media proxy failed' };
  }
};
