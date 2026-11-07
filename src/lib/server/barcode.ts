import "server-only";
import { fetchWithTimeout } from "./net";

/**
 * Barcode (EAN/UPC) → product name. Free sources, no key:
 * UPCitemdb trial (electronics & general retail) → Open Food Facts (groceries).
 * If nothing matches, the agent falls back to searching the web for the code.
 */
export interface BarcodeHit {
  code: string;
  title?: string;
  brand?: string;
  model?: string;
  image?: string;
  source?: string;
}

export function normalizeBarcode(raw: string): string | null {
  const d = String(raw ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (d.length < 8 || d.length > 14) return null;
  return d.length === 12 ? "0" + d : d; // UPC-A → EAN-13
}

/** Finds a barcode-looking number in free text ("باركود: 6 223001 360001"). */
export function barcodeIn(text: string): string | null {
  const t = String(text ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
  const m = t.match(/(?:^|\D)(\d[\d ]{6,16}\d)(?!\d)/);
  return m ? normalizeBarcode(m[1]) : null;
}

export async function lookupBarcode(raw: string, signal?: AbortSignal): Promise<BarcodeHit> {
  const code = normalizeBarcode(raw);
  if (!code) throw new Error("Not a valid EAN/UPC barcode");
  try {
    const r = await fetchWithTimeout(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, { timeoutMs: 6000, signal });
    if (r.ok) {
      const j = (await r.json()) as { items?: Array<{ title?: string; brand?: string; model?: string; images?: string[] }> };
      const it = j.items?.[0];
      if (it?.title) return { code, title: it.title, brand: it.brand, model: it.model, image: it.images?.[0], source: "upcitemdb" };
    }
  } catch {
    /* try the next source */
  }
  try {
    const r = await fetchWithTimeout(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,image_front_url`, {
      timeoutMs: 6000,
      signal,
      headers: { "User-Agent": "Dalil/1.0 (shopping agent)" },
    });
    if (r.ok) {
      const j = (await r.json()) as { status?: number; product?: { product_name?: string; brands?: string; image_front_url?: string } };
      if (j.status === 1 && j.product?.product_name) {
        return { code, title: j.product.product_name, brand: j.product.brands?.split(",")[0], image: j.product.image_front_url, source: "openfoodfacts" };
      }
    }
  } catch {
    /* none */
  }
  return { code };
}
