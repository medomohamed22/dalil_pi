"use client";

import { m } from "framer-motion";
import { ExternalLink, MapPin, MessageCircle, Navigation, Phone, Star, Store } from "lucide-react";
import type { Strings } from "@/lib/i18n";
import type { Lang, LocalShop, SallaApp } from "@/lib/types";
import { SmartImage } from "./cards";
import { track } from "@/lib/track";

/** Salla Local shops: pay in Pi at the counter (no price list, so not product cards). */
export function ShopCards({ shops, s, locatedBy }: { shops: LocalShop[]; s: Strings; locatedBy?: "gps" | "ip" }) {
  if (!shops.length) return null;
  return (
    <div className="space-y-2" data-testid="local-shops">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-fg-muted">
        <Store className="size-3.5" /> {s.shopsTitle} · Salla Local
      </div>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
        {shops.map((sh, i) => {
          const dest = sh.lat != null && sh.lon != null ? `${sh.lat},${sh.lon}` : [sh.name, sh.address].filter(Boolean).join(" ");
          return (
            <m.div
              key={sh.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 5) * 0.05 }}
              className="flex w-[15.5rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-line bg-bg shadow-card"
              data-shop-card={sh.id}
            >
              <a href={sh.url} target="_blank" rel="noopener noreferrer" className="block">
                <SmartImage src={sh.image} alt={sh.name} className="h-28 w-full" fallbackLabel="Salla Local" />
              </a>
              <div className="flex flex-1 flex-col gap-1.5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold" dir="auto">
                    {sh.name}
                  </span>
                  {sh.distanceKm != null && (
                    <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums" dir="ltr" data-testid="shop-distance">
                      {sh.distanceKm < 1 ? `${Math.round(sh.distanceKm * 1000)} m` : `${sh.distanceKm} ${s.km}`}
                    </span>
                  )}
                </div>
                {sh.description && (
                  <p className="line-clamp-2 text-[12px] leading-snug text-fg-soft" dir="auto">
                    {sh.description}
                  </p>
                )}
                {sh.address && (
                  <p className="flex items-start gap-1 text-[11px] text-fg-muted" dir="auto">
                    <MapPin className="mt-0.5 size-3 shrink-0" />
                    <span className="line-clamp-2">{sh.address}</span>
                  </p>
                )}
                <div className="mt-auto grid grid-cols-3 gap-1.5 pt-1">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1 rounded-xl border border-line py-1.5 text-[11px] font-medium"
                  >
                    <Navigation className="size-3" /> {s.directions}
                  </a>
                  {sh.whatsapp ? (
                    <a
                      href={`https://wa.me/${sh.whatsapp}?text=${encodeURIComponent(s.waShop)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1 rounded-xl border border-line py-1.5 text-[11px] font-medium"
                    >
                      <MessageCircle className="size-3" /> {s.whatsapp}
                    </a>
                  ) : (
                    <span />
                  )}
                  {sh.phone ? (
                    <a href={`tel:+${sh.phone}`} className="flex items-center justify-center gap-1 rounded-xl border border-line py-1.5 text-[11px] font-medium">
                      <Phone className="size-3" /> {s.call}
                    </a>
                  ) : (
                    <a href={sh.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center rounded-xl border border-line py-1.5 text-[11px] font-medium">
                      {s.shopPage}
                    </a>
                  )}
                </div>
                <a
                  href={sh.payUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("order", { store: "Salla Local", url: sh.payUrl, title: sh.name })}
                  className="flex items-center justify-center gap-1 rounded-xl bg-inv-bg py-2 text-[12px] font-semibold text-inv-fg"
                  data-testid="shop-pay"
                >
                  π {s.payShop}
                </a>
              </div>
            </m.div>
          );
        })}
      </div>
      {locatedBy === "ip" && <p className="text-[11px] text-fg-muted">{s.approxDistance}</p>}
    </div>
  );
}

/** Salla apps directory: tap opens it in the Salla app, where ordering and paying happen. */
export function SallaAppCards({ apps, s, lang }: { apps: SallaApp[]; s: Strings; lang: Lang }) {
  return (
    <ul className="space-y-2" data-testid="salla-apps">
      {apps.map((a, i) => {
        const name = lang === "ar" && a.name_ar ? a.name_ar : a.name;
        const sub = [s.svcType[a.type], a.specialty ?? a.category, a.city ?? (a.countries.length ? null : s.svcEverywhere)].filter(Boolean).join(" · ");
        return (
          <m.li key={a.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("visit", { store: "Salla Shop Mall", url: a.url, title: name })}
              className="flex items-center gap-3 rounded-2xl border border-line bg-bg p-2.5"
              data-salla-app={a.key}
            >
              <SmartImage src={a.image ?? undefined} alt={name} className="size-14 shrink-0 rounded-xl" fallbackLabel={s.svcType[a.type]} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold" dir="auto">
                  {name}
                </span>
                <span className="block truncate text-[12px] text-fg-muted" dir="auto">
                  {sub}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-[12px]">
                  {a.price != null ? (
                    <span className="font-semibold tabular-nums" dir="ltr">
                      {a.price.toLocaleString("en-US", { maximumFractionDigits: a.price < 10 ? 2 : 1 })} π{a.price_unit && s.svcUnit[a.price_unit] ? <span className="font-normal text-fg-muted"> · {s.svcUnit[a.price_unit]}</span> : null}
                    </span>
                  ) : (
                    <span className="text-fg-muted">{s.svcPriceInApp}</span>
                  )}
                  {a.rating != null && (a.ratings ?? 0) > 0 && (
                    <span className="flex items-center gap-0.5 text-fg-muted tabular-nums" dir="ltr">
                      <Star className="size-3 fill-current text-amber-500" /> {a.rating} ({a.ratings})
                    </span>
                  )}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-bg-soft px-3 py-1.5 text-[12px] font-medium">
                {s.svcOpen} <ExternalLink className="size-3" />
              </span>
            </a>
          </m.li>
        );
      })}
    </ul>
  );
}
