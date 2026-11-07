import "server-only";
import webpush, { type PushSubscription } from "web-push";

const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
export const pushConfigured = !!(pub && priv);
export const vapidPublicKey = pub ?? null;

if (pushConfigured) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:dalil@example.com", pub!, priv!);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  image?: string;
}

/** Returns false when the subscription is gone (caller should forget it). */
export async function sendPush(sub: PushSubscription, payload: PushPayload): Promise<boolean> {
  if (!pushConfigured) return true;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600 });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return !(code === 404 || code === 410);
  }
}
