import "server-only";
import type { Browser, Page } from "puppeteer-core";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { assertPublicUrl, isPrivateIp } from "./net";

/**
 * Real headless Chromium for the agent ("browser_open" / "browser_action").
 * - On Vercel: @sparticuz/chromium (a Lambda-friendly Chromium build).
 * - BROWSER_WS_ENDPOINT: connect to a remote browser instead (Browserless, Browserbase…).
 * - Locally: CHROME_PATH, or a Playwright/Chrome install.
 *
 * One session (one tab) lives for a single agent run and is closed when it ends.
 * Page content is untrusted data. Every navigation and sub-request is checked
 * against private/internal hosts (SSRF guard).
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36";
const VIEW = { width: 1280, height: 860 };
const NAV_TIMEOUT = 20000;

export function browserAvailable(): boolean {
  return process.env.DALIL_BROWSER !== "off";
}

async function executablePath(): Promise<{ path: string; args: string[] }> {
  if (process.env.CHROME_PATH) return { path: process.env.CHROME_PATH, args: ["--no-sandbox"] };
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return { path: await chromium.executablePath(), args: chromium.args };
  }
  const { existsSync } = await import("node:fs");
  for (const p of [
    "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ]) {
    if (existsSync(p)) return { path: p, args: ["--no-sandbox"] };
  }
  throw new Error("No Chromium found (set CHROME_PATH or BROWSER_WS_ENDPOINT)");
}

async function launch(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.BROWSER_WS_ENDPOINT) {
    return puppeteer.connect({ browserWSEndpoint: process.env.BROWSER_WS_ENDPOINT, defaultViewport: VIEW });
  }
  const exe = await executablePath();
  return puppeteer.launch({
    executablePath: exe.path,
    headless: true,
    defaultViewport: VIEW,
    args: [...exe.args, "--disable-blink-features=AutomationControlled", "--lang=en-US"],
  });
}

const PRIVATE_HOST =
  /^(localhost|.*\.local|.*\.internal|127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

export interface PageState {
  url: string;
  title: string;
  status?: number;
  product: { name?: string; price?: number; currency?: string; rating?: number; reviewCount?: number; availability?: string; image?: string; brand?: string };
  /** Clickable things, numbered so the model can act on them by id. */
  elements: Array<{ id: number; tag: string; text: string; href?: string }>;
  text: string;
  shot?: string;
}

/** Does this host resolve to a private/internal address? (cached per session) */
const hostVerdicts = new Map<string, Promise<boolean>>();
function hostIsPrivate(host: string): Promise<boolean> {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  let v = hostVerdicts.get(h);
  if (!v) {
    v = (net.isIP(h) ? Promise.resolve([{ address: h }]) : lookup(h, { all: true }))
      .then((addrs) => addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address)))
      .catch(() => true);
    hostVerdicts.set(h, v);
    if (hostVerdicts.size > 500) hostVerdicts.delete(hostVerdicts.keys().next().value!);
  }
  return v;
}

/** Local tests only: one exact host:port allowed past the SSRF guard (never on Vercel). */
const TEST_HOST = !process.env.VERCEL ? process.env.DALIL_TEST_BROWSER_HOST : undefined;
const isTestHost = (u: string) => {
  try {
    return !!TEST_HOST && new URL(u).host === TEST_HOST;
  } catch {
    return false;
  }
};
const checkUrl = async (u: string) => (isTestHost(u) ? new URL(u) : assertPublicUrl(u));

export class BrowserSession {
  private browser?: Browser;
  private page?: Page;
  pagesVisited = 0;

  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    this.browser ??= await launch();
    const page = await this.browser.newPage();
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9,ar;q=0.8" });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      let host = "";
      try {
        const u = new URL(req.url());
        if (u.protocol === "data:" || u.protocol === "blob:") return void req.continue();
        if (u.protocol !== "http:" && u.protocol !== "https:") return void req.abort();
        host = u.hostname;
      } catch {
        return void req.abort();
      }
      // Block internal hosts and heavy media (faster, cheaper).
      if (isTestHost(req.url())) return void req.continue();
      // Pattern check first (fast), then real DNS: blocks names like 127.0.0.1.nip.io.
      if (PRIVATE_HOST.test(host) || (await hostIsPrivate(host))) return void req.abort("blockedbyclient");
      const type = req.resourceType();
      if (type === "media" || type === "font") return void req.abort();
      void req.continue();
    });
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    page.setDefaultTimeout(8000);
    this.page = page;
    return page;
  }

  async open(rawUrl: string): Promise<PageState> {
    const url = (await checkUrl(rawUrl)).toString();
    const page = await this.ensurePage();
    const res = await page.goto(url, { waitUntil: "domcontentloaded" });
    this.pagesVisited++;
    await this.settle(page);
    return this.state(page, res?.status());
  }

  async act(input: { action: string; id?: number; text?: string }): Promise<PageState> {
    const page = await this.ensurePage();
    if (page.url() === "about:blank") throw new Error("Open a page first with browser_open");
    const { action, id, text } = input;
    if (action === "click" || action === "type") {
      if (id == null) throw new Error("id required");
      const el = await page.$(`[data-dalil-id="${Number(id)}"]`);
      if (!el) throw new Error(`Element ${id} not found — read the latest elements list`);
      await el.scrollIntoView().catch(() => {});
      if (action === "type") {
        await el.click({ count: 3 }).catch(() => {});
        await el.type(String(text ?? "").slice(0, 200), { delay: 15 });
        await page.keyboard.press("Enter");
      } else {
        await el.click();
      }
      // Clicking may navigate; never follow it to an internal host.
      await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 6000 }).catch(() => {});
      await checkUrl(page.url());
    } else if (action === "scroll") {
      await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.85)));
    } else if (action === "back") {
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    } else {
      throw new Error(`Unknown action ${action}`);
    }
    await this.settle(page);
    return this.state(page);
  }

  /** Give client-rendered pages a moment, and dismiss common cookie banners. */
  private async settle(page: Page) {
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 4000 }).catch(() => {});
    await page
      .evaluate(() => {
        const rx = /^(accept( all)?|agree|i agree|got it|ok|allow all|قبول|موافق)$/i;
        for (const b of Array.from(document.querySelectorAll("button, [role=button]")).slice(0, 300)) {
          const t = (b.textContent || "").trim();
          if (t.length < 20 && rx.test(t)) {
            (b as HTMLElement).click();
            break;
          }
        }
      })
      .catch(() => {});
  }

  private async state(page: Page, status?: number): Promise<PageState> {
    const data = await page.evaluate(() => {
      // ---- product facts: JSON-LD → microdata → OpenGraph/meta ----
      const product: Record<string, unknown> = {};
      const num = (v: unknown) => {
        const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.]/g, ""));
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };
      const visit = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach(visit);
        const o = node as Record<string, unknown>;
        const type = String(o["@type"] ?? "");
        if (/Product/i.test(type) && !product.name) {
          product.name = o.name;
          const img = o.image;
          product.image = Array.isArray(img) ? (typeof img[0] === "string" ? img[0] : (img[0] as { url?: string })?.url) : typeof img === "string" ? img : (img as { url?: string })?.url;
          const brand = o.brand as { name?: string } | string | undefined;
          product.brand = typeof brand === "string" ? brand : brand?.name;
          const offers = Array.isArray(o.offers) ? o.offers[0] : (o.offers as Record<string, unknown> | undefined);
          if (offers) {
            product.price = num(offers.price ?? offers.lowPrice);
            product.currency = offers.priceCurrency;
            product.availability = String(offers.availability ?? "").split("/").pop();
          }
          const ar = o.aggregateRating as Record<string, unknown> | undefined;
          if (ar) {
            product.rating = num(ar.ratingValue);
            product.reviewCount = num(ar.reviewCount ?? ar.ratingCount);
          }
        }
        if (o["@graph"]) visit(o["@graph"]);
      };
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
        try {
          visit(JSON.parse(s.textContent || ""));
        } catch {
          /* ignore */
        }
      });
      const meta = (sel: string) => document.querySelector(sel)?.getAttribute("content") ?? undefined;
      product.price ??= num(meta('meta[itemprop="price"]') ?? meta('meta[property="product:price:amount"]') ?? meta('meta[property="og:price:amount"]'));
      product.currency ??= meta('meta[itemprop="priceCurrency"]') ?? meta('meta[property="product:price:currency"]') ?? meta('meta[property="og:price:currency"]');
      product.image ??= meta('meta[property="og:image"]');
      product.name ??= meta('meta[property="og:title"]');

      // ---- clickable elements, numbered for the model ----
      let next = 1;
      const elements: Array<{ id: number; tag: string; text: string; href?: string }> = [];
      const vis = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < window.innerHeight * 2.5;
      };
      for (const el of Array.from(document.querySelectorAll("a[href], button, input:not([type=hidden]), select, [role=button]"))) {
        if (elements.length >= 60) break;
        if (!vis(el)) continue;
        const h = el as HTMLElement & { placeholder?: string; value?: string };
        const text = (h.innerText || h.getAttribute("aria-label") || h.placeholder || h.value || "").trim().replace(/\s+/g, " ").slice(0, 70);
        if (!text) continue;
        const id = next++;
        el.setAttribute("data-dalil-id", String(id));
        elements.push({ id, tag: el.tagName.toLowerCase(), text, href: (el as HTMLAnchorElement).href || undefined });
      }
      const text = (document.body?.innerText || "").replace(/\n{2,}/g, "\n").replace(/[ \t]+/g, " ").slice(0, 3500);
      return { title: document.title, product, elements, text };
    });
    const shot = await page
      .screenshot({ type: "jpeg", quality: 55, clip: { x: 0, y: 0, width: VIEW.width, height: VIEW.height } })
      .then((b) => `data:image/jpeg;base64,${Buffer.from(b).toString("base64")}`)
      .catch(() => undefined);
    return { url: page.url(), status, ...(data as Omit<PageState, "url" | "status" | "shot">), shot };
  }

  async close() {
    try {
      if (process.env.BROWSER_WS_ENDPOINT) await this.browser?.disconnect();
      else await this.browser?.close();
    } catch {
      /* ignore */
    }
    this.browser = undefined;
    this.page = undefined;
  }
}
