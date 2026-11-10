import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { productHomeCountry } from "@/lib/server/catalog";
import { productPage } from "@/lib/server/shop";

/**
 * Public product page (/p/<id>): plain HTML a search engine or a link preview can read, for every
 * product in Dalil Index. The app's own product view is one tap away. Rebuilt at most hourly.
 */
export const revalidate = 3600;

const SITE = process.env.APP_URL || "https://dalilpi.vercel.app";
const ID = /^(pcm|salla|gtp|pkt):[\w-]{1,64}$/;

const load = cache(async (raw: string) => {
  const id = decodeURIComponent(raw);
  if (!ID.test(id)) return null;
  const country = await productHomeCountry(id).catch(() => null);
  if (!country) return null;
  const page = await productPage(id, country).catch(() => null);
  return page ? { id, country, page } : null;
});

const pi = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 2 : 1 })} π`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const r = await load((await params).id);
  if (!r) return { title: "Dalil Pi", robots: { index: false } };
  const o = r.page.offer;
  const title = `${clip(o.title, 70)} — ${pi(o.total)} | ${o.store}`;
  const description = clip(
    [r.page.title_ar && r.page.title_ar !== o.title ? r.page.title_ar : "", `${pi(o.total)} at ${o.store}.`, r.page.description ?? "", "Pay with Pi — compare prices and store trust on Dalil Pi."].filter(Boolean).join(" "),
    300,
  );
  const url = `${SITE}/p/${encodeURIComponent(r.id)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "Dalil Pi", type: "website", images: r.page.images.slice(0, 1).map((u) => ({ url: u })) },
    twitter: { card: r.page.images.length ? "summary_large_image" : "summary", title, description, images: r.page.images.slice(0, 1) },
  };
}

export default async function ProductSeoPage({ params }: { params: Promise<{ id: string }> }) {
  const r = await load((await params).id);
  if (!r) notFound();
  const { page, id } = r;
  const o = page.offer;
  const appUrl = `/?v=p&id=${encodeURIComponent(id)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: o.title,
    ...(page.title_ar ? { alternateName: page.title_ar } : {}),
    ...(page.images.length ? { image: page.images.slice(0, 4) } : {}),
    ...(page.description ? { description: clip(page.description, 500) } : {}),
    ...(page.brand ? { brand: { "@type": "Brand", name: page.brand } } : {}),
    ...(page.category ? { category: page.category } : {}),
    url: `${SITE}/p/${encodeURIComponent(id)}`,
  };
  return (
    <main className="mx-auto min-h-dvh max-w-3xl bg-bg px-4 pb-16 pt-4 text-fg" data-testid="seo-product">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-4 flex items-center gap-2 text-[13px] text-fg-muted">
        <Link href="/" className="flex items-center gap-1.5 font-semibold text-fg">
          <span className="flex size-7 items-center justify-center rounded-lg bg-inv-bg text-[13px] font-bold text-inv-fg">π</span>
          Dalil Pi
        </Link>
        <span>›</span>
        <span className="truncate">{o.store}</span>
      </nav>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          {page.images[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={page.images[0]} alt={o.title} className="aspect-square w-full rounded-2xl bg-white object-contain ring-1 ring-line" />
          )}
          {page.images.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {page.images.slice(1, 6).map((u) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={u} src={u} alt="" loading="lazy" className="size-16 shrink-0 rounded-xl bg-white object-contain ring-1 ring-line" />
              ))}
            </div>
          )}
        </div>
        <div>
          <h1 className="text-[20px] font-bold leading-snug" dir="auto">{o.title}</h1>
          {page.title_ar && page.title_ar !== o.title && (
            <p className="mt-1 text-[15px] text-fg-muted" dir="rtl" lang="ar">{page.title_ar}</p>
          )}
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-[26px] font-bold tabular-nums">{pi(o.total)}</span>
            {o.listPrice && o.listPrice > o.price && <span className="text-[15px] text-fg-muted line-through tabular-nums">{pi(o.listPrice)}</span>}
          </div>
          <p className="mt-1 text-[13px] text-fg-muted">
            {o.store}
            {o.trustScore != null && <> · Trust {o.trustScore}/100</>}
            {o.shipping ? <> · Shipping {pi(o.shipping)}</> : null}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link href={appUrl} className="rounded-full bg-inv-bg px-4 py-3 text-center text-[15px] font-semibold text-inv-fg" data-testid="seo-open-app">
              Open in Dalil Pi · افتح في دليل باي
            </Link>
            {o.url && (
              <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" className="rounded-full border border-line px-4 py-3 text-center text-[15px] font-medium">
                View at {o.store} ↗
              </a>
            )}
          </div>
          {page.description && (
            <p className="mt-5 whitespace-pre-line text-[14px] leading-relaxed text-fg-muted" dir="auto">
              {clip(page.description, 1200)}
            </p>
          )}
        </div>
      </div>

      {!!o.twins?.length && (
        <section className="mt-8">
          <h2 className="mb-2 text-[16px] font-bold">Same product in other Pi stores</h2>
          <ul className="space-y-1.5">
            {o.twins.map((t) => (
              <li key={t.url}>
                <Link href={t.ref ? `/p/${encodeURIComponent(t.ref)}` : t.url} className="flex justify-between gap-2 rounded-xl bg-bg-soft px-3 py-2 text-[14px]">
                  <span className="min-w-0 truncate" dir="auto">{t.store} — {t.title}</span>
                  <span className="shrink-0 tabular-nums">{pi(t.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!page.similar.length && (
        <section className="mt-8">
          <h2 className="mb-2 text-[16px] font-bold">Similar products you can buy with Pi</h2>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {page.similar.map((s) => (
              <li key={s.id}>
                <Link href={s.ref ? `/p/${encodeURIComponent(s.ref)}` : appUrl} className="block rounded-2xl border border-line p-2">
                  {s.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.image} alt="" loading="lazy" className="aspect-square w-full rounded-xl bg-white object-contain" />
                  )}
                  <span className="mt-1.5 line-clamp-2 text-[12.5px]" dir="auto">{s.title}</span>
                  <span className="text-[13px] font-semibold tabular-nums">{pi(s.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-[12px] text-fg-muted">
        Dalil Pi lists products from stores that accept Pi and checks each store&apos;s trust. You order and pay on the store&apos;s own site. Prices are copied from the store&apos;s catalog and may change.
      </p>
    </main>
  );
}
