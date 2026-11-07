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
  kind?: OfferKind;
  /** ISO country the offer is sold / shipped in. */
  country?: string;
  /** How we know the store accepts Pi (short, factual). */
  piEvidence?: string;
  trust: TrustLevel;
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
}

export const DEFAULT_SETTINGS: Settings = {
  lang: "en",
  country: null,
  scope: "auto",
};

/** Monthly usage of the signed-in Pi user. */
export interface Usage {
  plan: "free";
  period: string;
  renewsAt: string;
  searchesUsed: number;
  searchLimit: number;
  ordersUsed: number;
  orderLimit: number;
}

export interface Me {
  uid: string;
  username?: string;
  usage: Usage;
  /** Saved country preference (null = from IP). */
  country: Country | null;
  lang: Lang;
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
