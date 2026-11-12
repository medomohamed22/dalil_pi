import "server-only";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  images?: string[];
}

/** Only real photos (what the app's camera/upload produces): JPEG, PNG or WebP as base64 data URLs. */
const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/**
 * The client sends the conversation, so the server bounds what reaches the model: one AI credit
 * can't carry a huge (or invented) history. Last 12 messages, each clipped, ~24k characters in all,
 * photos only on the latest user message. Returns null when a photo is not a real image.
 */
export function boundHistory(history: ChatTurn[]): ChatTurn[] | null {
  let h = history.slice(-12);
  while (h.length && h[0].role !== "user") h = h.slice(1);
  if (!h.length) return [];
  const last = h.length - 1;
  const out = h.map((m, i) => {
    const text = m.text.slice(0, m.role === "user" ? 4000 : 2000);
    if (i !== last || m.role !== "user" || !m.images?.length) return { role: m.role, text: text || (m.images?.length ? "(photo)" : "") };
    return { role: m.role, text, images: m.images };
  });
  if (out[last].images?.some((u) => !PHOTO.test(u))) return null;
  // Oldest first out until the text fits.
  const size = (xs: typeof out) => xs.reduce((n, m) => n + m.text.length, 0);
  while (out.length > 1 && size(out) > 24_000) {
    out.shift();
    while (out.length > 1 && out[0].role !== "user") out.shift();
  }
  return out;
}

