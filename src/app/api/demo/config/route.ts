import { HOSTED_MODEL, hostedEnabled } from "@/lib/server/hosted";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Settings for the guided demo. On the PayPal SANDBOX only, the judges' test
 * buyer account (DEMO_PAYPAL_BUYER_EMAIL / DEMO_PAYPAL_BUYER_PASSWORD in the
 * Vercel environment) is shown so they can log in when PayPal opens. It is a
 * sandbox account with play money — never set these on a live deployment;
 * this endpoint refuses to return them unless PAYPAL_ENV is the sandbox.
 */
export async function GET() {
  const sandbox = process.env.PAYPAL_ENV !== "live";
  const email = process.env.DEMO_PAYPAL_BUYER_EMAIL?.trim();
  const password = process.env.DEMO_PAYPAL_BUYER_PASSWORD;
  return Response.json(
    {
      ai: hostedEnabled(),
      model: HOSTED_MODEL,
      sandbox,
      buyer: sandbox && email && password ? { email, password } : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
