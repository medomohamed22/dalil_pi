// Shared types used by both the client UI and the API routes.

export type Role = "user" | "assistant";

export type StepStatus = "running" | "done" | "error";

export interface Step {
  id: string;
  tool: string;
  label: string;
  detail?: string;
  status: StepStatus;
  /** Source sites discovered by this step (search results). */
  hosts?: string[];
}

export type TrustLevel = "verified" | "unknown" | "suspicious";

export interface Offer {
  id: string;
  title: string;
  image?: string;
  url?: string;
  store: string;
  storeDomain?: string;
  price: number;
  currency: string;
  shipping?: number;
  total: number;
  rating?: number;
  reviewCount?: number;
  distanceKm?: number;
  pickup?: boolean;
  deliveryDays?: number;
  trust: TrustLevel;
  flags: string[];
  badges: string[];
  reason?: string;
  score?: number;
  /** What PayPal will actually charge (EGP is charged in USD). */
  chargeAmount?: number;
  chargeCurrency?: string;
  fxRate?: number;
  /** Server signature over the offer — checkout refuses tampered offers. */
  sig?: string;
}

export type ApprovalStatus =
  | "pending"
  | "processing"
  | "held"
  | "captured"
  | "voided"
  | "declined"
  | "error";

export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  site?: string;
  price?: number;
  currency?: string;
}

export type Block =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string; name?: string }
  | { type: "link"; preview: LinkPreview }
  | { type: "steps"; steps: Step[]; note?: string; startedAt?: number; endedAt?: number }
  | { type: "products"; offers: Offer[]; note?: string }
  | {
      type: "approval";
      offer: Offer;
      /** Agent-to-agent negotiation that produced (or tried to improve) this offer. */
      negotiation?: Negotiation;
      status: ApprovalStatus;
      orderId?: string;
      authorizationId?: string;
      /** Proof (from the server) that this browser placed the hold / made the capture. */
      holdToken?: string;
      captureToken?: string;
      holdExpiresAt?: number;
      message?: string;
      shipping?: { name?: string; address?: string };
      payerEmail?: string;
      captureId?: string;
      /** Set when this approval came from a price watch (server owns the hold). */
      watchId?: string;
      tracking?: { trackingNumber: string; carrier: string; addedAt: number };
      refund?: { id: string; status: string; reason: string; amount?: string; currency?: string };
      /** What this offer was compared against (for the trust receipt and savings). */
      context?: PurchaseContext;
      /** Spending mandate in force when the user approved. */
      mandate?: { maxSpend: number; verifiedOnly: boolean };
      capturedAt?: number;
      /** Group buy started from this approval. */
      groupId?: string;
      /** Price protection on the captured payment (refunds a later price drop). */
      protection?: Protection;
      /** Family approval: someone else approves and pays from their own PayPal. */
      familyId?: string;
      /** Open a helper on the card right away (e.g. the user asked for family approval). */
      suggest?: "family";
    }
  /** Multi-store cart: one PayPal order (one approval), one hold per store. */
  | {
      type: "cart";
      offers: Offer[];
      status: ApprovalStatus;
      orderId?: string;
      holdExpiresAt?: number;
      message?: string;
      mandate?: { maxSpend: number; verifiedOnly: boolean };
      shipping?: { name?: string; address?: string };
      payerEmail?: string;
      units?: CartUnit[];
      /** Charged grand total (charge currency) as PayPal reported it. */
      charge?: { value: string; currency: string };
    }
  | { type: "watchDraft"; offer: Offer; targetPrice?: number; mode?: WatchMode }
  | { type: "error"; text: string }
  /** "Buy now or wait?" advice for the top offer. */
  | { type: "insight"; offer: Offer; insight: PriceInsight }
  /** Live view of the agent's real browser (latest screenshot). */
  | { type: "browser"; url: string; title?: string; shot?: string; action?: string; pages?: number; live?: boolean };

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: Role;
  blocks: Block[];
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  /** Optional leading icon in the sidebar (watch alerts, photo searches). */
  icon?: "bell" | "camera";
  createdAt: number;
  updatedAt: number;
}

export type Lang = "ar" | "en";
export type Market = "EG" | "US";
export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";

export interface Settings {
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  market: Market;
  city: string;
  lang: Lang;
  demoMode: boolean;
  /** Spending mandate: max total per purchase in market currency (0 = no limit). */
  maxSpend: number;
  verifiedOnly: boolean;
  /** Optional precise location for distance to pickup stores. */
  coords?: { lat: number; lon: number } | null;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  baseUrl: "https://api.meta.ai/v1",
  model: "muse-spark-1.3-contributor",
  reasoningEffort: "low",
  market: "US",
  city: "New York",
  lang: "en",
  demoMode: false,
  maxSpend: 0,
  verifiedOnly: true,
};

export const HOLD_MINUTES = 10;
/** Days Dalil keeps watching the price after a purchase. */
export const PROTECTION_DAYS = 14;

export interface Mandate {
  maxSpend: number;
  verifiedOnly: boolean;
}

export const KNOWN_MODELS = [
  "muse-spark-1.3-contributor",
  "muse-spark-1.3",
  "muse-spark-1.2",
  "muse-spark-1.1",
];

/** Events streamed (as NDJSON) from /api/chat to the client. */
export type AgentEvent =
  | { type: "step"; step: Step }
  | { type: "text"; delta: string }
  /** Interim narration from a turn that continued with tools — shown in the activity bar. */
  | { type: "thought"; text: string }
  /** The agent's browser session ended — the live view becomes a static snapshot. */
  | { type: "browserDone" }
  | { type: "block"; block: Block }
  | { type: "error"; message: string }
  | { type: "done" };

/** Message format the client sends to /api/chat (already trimmed for the model). */
export interface WireMessage {
  role: Role;
  text: string;
  images?: string[]; // data URLs, only sent for the latest user turn
}

/* ---------------- Price watches ---------------- */

export type WatchMode = "notify" | "auto";
export type WatchStatus = "active" | "triggered" | "held" | "bought" | "cancelled" | "error";

export interface PricePoint {
  t: number;
  price: number;
}

export interface WatchHold {
  orderId: string;
  authorizationId: string;
  captureAt: number;
  amount: string;
  currency: string;
  shipping?: { name?: string; address?: string };
}

/** Public view of a watch (what the browser sees). */
export interface Watch {
  id: string;
  title: string;
  store: string;
  url?: string;
  image?: string;
  currency: string;
  market: Market;
  shipping: number;
  trust: TrustLevel;
  targetPrice: number;
  mode: WatchMode;
  maxSpend: number;
  source: "live" | "demo";
  status: WatchStatus;
  lastPrice?: number;
  history: PricePoint[];
  createdAt: number;
  lastCheckedAt?: number;
  /** Signed offer at the triggered price — used for the approve flow. */
  triggeredOffer?: Offer;
  hold?: WatchHold;
  captureId?: string;
  message?: string;
}

export interface PriceInsight {
  verdict: "buy" | "wait";
  reason: "near_lowest" | "sale_soon" | "above_average" | "fair_price" | "no_history";
  confidence: "high" | "medium" | "low";
  price: number;
  currency: string;
  /** Suggested watch target when waiting. */
  targetPrice?: number;
  stats: { min: number; max: number; mean: number; points: number; days: number };
  history: Array<{ t: number; p: number }>;
  event?: { id: string; en: string; ar: string; date: string; daysAway: number; drop: number };
  /** channel3 = catalog history · dalil = prices Dalil recorded · sample = demo data · none = no history yet */
  source: "channel3" | "dalil" | "sample" | "none";
}

/** Agent-to-agent negotiation stream (buyer = Dalil, seller = the store's agent). */
export type NegotiationEvent =
  | { type: "typing"; from: "dalil" | "seller" }
  | { type: "msg"; from: "dalil" | "seller"; text: string; price?: number; shipping?: number }
  | { type: "done"; offer: Offer | null; saved: number; transport: "http" | "local" }
  | { type: "error"; message: string };

export interface Negotiation {
  status: "running" | "done" | "failed";
  messages: Array<{ from: "dalil" | "seller"; text: string; price?: number }>;
  typing?: "dalil" | "seller";
  original: { price: number; shipping: number; total: number };
  saved?: number;
  transport?: "http" | "local";
}

export interface PurchaseContext {
  /** Offers compared in the same reply (all, including flagged ones). */
  compared: number;
  stores: number;
  /** Average / highest total of the trustworthy offers in the same currency. */
  avgTotal: number;
  maxTotal: number;
  /** 1-based position of this offer in Dalil's ranking. */
  rank?: number;
  flaggedSkipped: number;
}

/** Comparison context for an offer, from the product lists it appeared in. */
export function purchaseContext(offer: Offer, lists: Offer[][]): PurchaseContext | undefined {
  const list = lists.find((l) => l.some((o) => o.id === offer.id || (o.store === offer.store && o.title === offer.title))) ?? lists[lists.length - 1];
  if (!list?.length) return undefined;
  const fair = list.filter((o) => o.trust !== "suspicious" && o.currency === offer.currency);
  const totals = fair.map((o) => o.total);
  if (!totals.length) return undefined;
  const idx = list.findIndex((o) => o.id === offer.id || (o.store === offer.store && o.title === offer.title));
  return {
    compared: list.length,
    stores: new Set(list.map((o) => o.store)).size,
    avgTotal: Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100,
    maxTotal: Math.max(...totals),
    rank: idx >= 0 ? idx + 1 : undefined,
    flaggedSkipped: list.filter((o) => o.trust === "suspicious" || o.flags.includes("suspicious_discount")).length,
  };
}

/** Public view of a group buy (no device ids). */
export interface GroupView {
  id: string;
  title: string;
  store: string;
  image?: string;
  url?: string;
  offerTotal: number;
  offerCurrency: string;
  /** Charged total and currency (USD for EGP offers). */
  total: string;
  currency: string;
  shares: number;
  /** Amount of the next share to pay. */
  shareAmount: string;
  paid: number;
  status: "open" | "completed" | "cancelled" | "expired";
  expiresAt: number;
  isOrganizer: boolean;
  organizerPaid: boolean;
  members: Array<{ name: string; organizer: boolean; status: "pending" | "held" | "captured" | "voided" | "failed"; at: number }>;
  message?: string;
}

/* ---------------- Price protection ---------------- */

export interface Protection {
  id: string;
  captureId: string;
  orderId: string;
  title: string;
  store: string;
  url?: string;
  image?: string;
  /** Offer currency (EGP/USD). */
  currency: string;
  paidPrice: number;
  shipping: number;
  /** What PayPal captured (USD for EGP offers). */
  charged: { value: string; currency: string };
  fxRate?: number;
  source: "live" | "demo";
  status: "active" | "expired" | "ended";
  createdAt: number;
  until: number;
  lastPrice?: number;
  lastCheckedAt?: number;
  history: PricePoint[];
  refunds: Array<{ id: string; status: string; amount: string; currency: string; price: number; at: number; simulated?: boolean }>;
  /** Sum of refunds, in the charge currency. */
  refundedTotal: string;
  message?: string;
}

/* ---------------- Multi-store cart ---------------- */

export interface CartUnit {
  referenceId: string;
  store: string;
  items: string[];
  /** Charged amount for this store (charge currency). */
  charge?: string;
  authorizationId?: string;
  holdToken?: string;
  captureId?: string;
  captureToken?: string;
  status: "pending" | "held" | "captured" | "refunded" | "voided" | "error";
  message?: string;
}

/* ---------------- Family approval ---------------- */

export type FamilyStatus = "pending" | "paying" | "held" | "captured" | "declined" | "cancelled" | "expired" | "error";

/** Public view of a family purchase request (no device ids). */
export interface FamilyView {
  id: string;
  title: string;
  store: string;
  image?: string;
  url?: string;
  price: number;
  shipping: number;
  total: number;
  currency: string;
  /** What PayPal will charge the approver (USD for EGP). */
  charge: { value: string; currency: string };
  /** Spending limit the requester set — the server refuses anything above it. */
  limit: number;
  requesterName: string;
  note?: string;
  trust: TrustLevel;
  status: FamilyStatus;
  isRequester: boolean;
  /** This browser approved (and so may cancel the hold or confirm now). */
  isApprover: boolean;
  createdAt: number;
  expiresAt: number;
  holdExpiresAt?: number;
  decidedAt?: number;
  approverEmail?: string;
  message?: string;
}
