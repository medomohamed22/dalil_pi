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

/** Where the offer comes from: an online store, a physical shop, or a service. */
export type OfferKind = "online" | "local" | "service";

/** The six parts of the trust score, each 0..1 (see src/lib/server/trust.ts). */
export interface TrustParts {
  official: number;
  reviews: number;
  wallet: number;
  price: number;
  site: number;
  record: number;
}

export interface Offer {
  id: string;
  title: string;
  image?: string;
  url?: string;
  store: string;
  storeDomain?: string;
  /** Price as listed by the store. Pi offers use currency "PI". */
  price: number;
  currency: string;
  shipping?: number;
  total: number;
  /** ≈ total in USD at the live OKX Pi price (Pi offers only). */
  totalUsd?: number;
  rating?: number;
  reviewCount?: number;
  distanceKm?: number;
  pickup?: boolean;
  deliveryDays?: number;
  /** Physical shops: published address, phone and location. */
  address?: string;
  phone?: string;
  lat?: number;
  lon?: number;
  kind?: OfferKind;
  /** ISO country the offer is sold / shipped in. */
  country?: string;
  /** How we know the store accepts Pi (short, factual). */
  piEvidence?: string;
  trust: TrustLevel;
  /** Store trust score 0–100 (server-computed). Under 40 = no Order button. */
  trustScore?: number;
  /** "woo_pi": the store's own checkout takes Pi — Dalil Pi can place the order for you. */
  checkout?: "woo_pi";
  trustParts?: TrustParts;
  /** Up to 3 short review quotes, kept only if they appear verbatim on a page we read. */
  reviews?: string[];
  flags: string[];
  badges: string[];
  reason?: string;
  score?: number;
  /** Server signature over the offer — the order step refuses tampered offers. */
  sig?: string;
}

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
  | { type: "error"; text: string; code?: string }
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
  icon?: "camera";
  createdAt: number;
  updatedAt: number;
}

export type Lang = "en" | "ar";
/** ISO 3166-1 alpha-2 country code, e.g. "EG", "US", "CN". */
export type Country = string;

/** Search scope chosen by the user (auto = the agent decides from the message). */
export type Scope = "auto" | "online" | "local" | "services";

export interface Settings {
  lang: Lang;
  /** Country the user picked; null = use the country from the IP. */
  country: Country | null;
  scope: Scope;
  /** Optional precise location for local (physical) shops. */
  coords?: { lat: number; lon: number } | null;
  /** Shopping preferences (stored on this device, sent with each search). */
  prefs?: { budgetPi?: number | null; brands?: string | null; shipOnly?: boolean };
}

export const DEFAULT_SETTINGS: Settings = {
  lang: "en",
  country: null,
  scope: "auto",
};

export type PlanId = "free" | "basic" | "plus" | "pro";
/** What can be bought: a 30-day plan or a 30-day top-up. */
export type PaidPlanId = "basic" | "plus" | "pro" | "topup";

/** One purchase = one 30-day credit pack. Unused credit expires with it. */
export interface Pack {
  id: string;
  plan: PaidPlanId;
  searchesQuota: number;
  ordersQuota: number;
  searchesLeft: number;
  ordersLeft: number;
  startsAt: string;
  endsAt: string;
}

/** A shop registered on "Dalil Pi for merchants". */
export interface Merchant {
  id: string;
  name: string;
  kind: "online" | "local" | "service";
  country: string;
  city?: string | null;
  address?: string | null;
  lat?: number | null;
  lon?: number | null;
  phone?: string | null;
  website?: string | null;
  description?: string | null;
  categories?: string | null;
  items: { title: string; price: number }[];
  piWallet?: string | null;
  status: "pending" | "approved" | "rejected";
}

/** A product on the user's watchlist (price-drop alerts). */
export interface Watch {
  id: string;
  url: string;
  title: string;
  store: string;
  image?: string;
  currency: string;
  /** Price when saved. */
  price: number;
  /** Latest price from the daily check. */
  lastPrice: number;
  lastCheckedAt: string | null;
  droppedAt: string | null;
  /** A drop the user hasn't seen yet. */
  newDrop: boolean;
}

/** A plan in the shop, priced live in Pi from the OKX rate. */
export interface PlanOffer {
  id: PaidPlanId;
  priceUsd: number;
  searches: number;
  orders: number;
  days: number;
  /** null when the Pi price is unavailable right now. */
  amountPi: number | null;
  /** The user already has this plan: until when (ISO). Not buyable again until it ends. Never set for top-ups. */
  activeUntil?: string | null;
}

/** A saved shipping address (stored in Supabase, per Pi account). */
export interface Address {
  id: string;
  label?: string | null;
  fullName: string;
  phone: string;
  country: string;
  city: string;
  area?: string | null;
  street: string;
  building?: string | null;
  postalCode?: string | null;
  notes?: string | null;
  isDefault: boolean;
}

export type OrderStatus = "draft" | "placed" | "awaiting_payment" | "paid" | "shipped" | "delivered" | "cancelled" | "failed";

/** An order the user started from a product card. Payment goes to the store, never to Dalil Pi. */
export interface Order {
  id: string;
  status: OrderStatus;
  storeName: string;
  storeDomain?: string | null;
  productTitle: string;
  productUrl?: string | null;
  productImage?: string | null;
  quantity: number;
  price: number;
  currency: string;
  total: number;
  totalUsd?: number | null;
  country?: string | null;
  trust?: string | null;
  addressId?: string | null;
  shipping?: Omit<Address, "id" | "isDefault"> | null;
  connector?: string | null;
  checkoutUrl?: string | null;
  txid?: string | null;
  trackingNumber?: string | null;
  createdAt: string;
}

/** Monthly usage of the signed-in Pi user. */
export interface Usage {
  plan: PlanId;
  /** When the paid plan ends (ISO), if any. */
  planEndsAt?: string | null;
  period: string;
  renewsAt: string;
  searchesUsed: number;
  searchLimit: number;
  ordersUsed: number;
  orderLimit: number;
  /** Active 30-day packs (soonest to expire first). */
  packs?: Pack[];
}

export interface Me {
  uid: string;
  username?: string;
  usage: Usage;
  /** Saved country preference (null = from IP). */
  country: Country | null;
  lang: Lang;
  /** Saved email (for store receipts on automatic orders). */
  email?: string | null;
}

/** Events streamed (as NDJSON) from /api/chat to the client. */
export type AgentEvent =
  | { type: "step"; step: Step }
  | { type: "text"; delta: string }
  /** Interim narration from a turn that continued with tools — shown in the activity bar. */
  | { type: "thought"; text: string }
  /** The agent's browser session ended — the live view becomes a static snapshot. */
  | { type: "browserDone" }
  | { type: "block"; block: Block }
  | { type: "usage"; usage: Usage }
  | { type: "error"; message: string; code?: string }
  | { type: "done" };

/** Message format the client sends to /api/chat (already trimmed for the model). */
export interface WireMessage {
  role: Role;
  text: string;
  images?: string[]; // data URLs, only sent for the latest user turn
}
