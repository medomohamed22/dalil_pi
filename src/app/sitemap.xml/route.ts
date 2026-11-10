import { sitemapProducts } from "@/lib/server/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = process.env.APP_URL || "https://dalilpi.vercel.app";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Every product page of Dalil Index (one sitemap holds up to 50,000 links). CDN-cached 1 h. */
export async function GET() {
  const items = await sitemapProducts().catch(() => []);
  const urls = [
    `<url><loc>${SITE}/</loc><changefreq>daily</changefreq></url>`,
    `<url><loc>${SITE}/merchants</loc></url>`,
    ...items.slice(0, 49_000).map((p) => `<url><loc>${esc(`${SITE}/p/${encodeURIComponent(p.id)}`)}</loc>${p.updated ? `<lastmod>${esc(p.updated.slice(0, 10))}</lastmod>` : ""}</url>`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
