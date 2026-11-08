import { countryName, currencyOf, geoFromRequest } from "@/lib/server/geo";
import { hostedEnabled } from "@/lib/server/hosted";
import { mapOfPiConfigured, sallaApiConfigured } from "@/lib/server/partners";
import { piConfigured, piNetwork } from "@/lib/server/pi";
import { piUsdPrice } from "@/lib/server/price";
import { devLoginAllowed } from "@/lib/server/session";
import { supabaseEnabled } from "@/lib/server/supabase";
import { freeLimits } from "@/lib/server/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public config for the client (no secrets): country from IP, Pi network, live Pi price, free limits. */
export async function GET(req: Request) {
  const geo = geoFromRequest(req);
  const price = await piUsdPrice();
  return Response.json(
    {
      ai: hostedEnabled(),
      pi: { configured: piConfigured(), network: piNetwork() },
      database: supabaseEnabled,
      /** Partner data APIs switched on in Vercel (see docs/PARTNER_APIS.md). */
      partners: { mapOfPi: mapOfPiConfigured(), sallaApi: sallaApiConfigured() },
      devLogin: devLoginAllowed(),
      geo: {
        country: geo.country,
        city: geo.city,
        source: geo.source,
        currency: currencyOf(geo.country),
        name: { en: countryName(geo.country, "en"), ar: countryName(geo.country, "ar") },
      },
      piPrice: price ? { usd: price.usd, at: price.at, source: price.source } : null,
      freeLimits: freeLimits(),
      build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
