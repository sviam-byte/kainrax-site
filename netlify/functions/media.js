// netlify/functions/media.js
const WHITELIST = String(process.env.MEDIA_DOMAIN_WHITELIST || "")
  .split(",").map(s=>s.trim()).filter(Boolean);
const HUB_BASE = process.env.MEDIA_HUB_BASE || "";       // напр. https://hub.example.com/media
const ASSET_BASE = process.env.MEDIA_ASSETS_BASE || "";  // напр. https://assets.example.com

function resolveUrl(raw) {
  if (!raw) return null;
  if (raw.startsWith("hub:/")) {
    if (!HUB_BASE) return null;
    return HUB_BASE.replace(/\/+$/,"") + "/" + raw.replace(/^hub:\/*/, "");
  }
  if (raw.startsWith("asset:/")) {
    if (!ASSET_BASE) return null;
    return ASSET_BASE.replace(/\/+$/,"") + "/" + raw.replace(/^asset:\/*/, "");
  }
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}
function allowed(u) {
  try {
    const url = new URL(u);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (!WHITELIST.length) return true;
    return WHITELIST.includes(url.hostname);
  } catch { return false; }
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const raw = q.url || q.src || "";
    const target = resolveUrl(raw);
    if (!target) return { statusCode: 400, body: "bad url" };
    if (!allowed(target)) return { statusCode: 403, body: "forbidden domain" };

    const upstream = await fetch(target, { headers: { "User-Agent": "kx-media-proxy" }, redirect: "follow" });
    if (!upstream.ok) return { statusCode: upstream.status, body: `upstream ${upstream.status}` };

    const buf = Buffer.from(await upstream.arrayBuffer());
    const type = upstream.headers.get("content-type") || "application/octet-stream";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
        "X-From": "media-proxy"
      },
      body: buf.toString("base64"),
      isBase64Encoded: true
    };
  } catch {
    return { statusCode: 500, body: "media proxy failed" };
  }
};
