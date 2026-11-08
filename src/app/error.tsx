"use client";

/** Shown instead of a blank page if the app crashes while rendering (e.g. an old in-app browser). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>Dalil Pi couldn&apos;t start · دليل باي مقدرش يفتح</h1>
      <p style={{ marginTop: 8, fontSize: 14 }}>Please send this screenshot to the developer · ابعت صورة الشاشة دي للمطوّر</p>
      <pre style={{ marginTop: 12, padding: 12, background: "#f4f4f5", color: "#111", borderRadius: 12, whiteSpace: "pre-wrap", fontSize: 12 }}>
        {String(error?.message || error)}
        {error?.digest ? `\n#${error.digest}` : ""}
        {typeof navigator !== "undefined" ? `\n${navigator.userAgent}` : ""}
      </pre>
      <button onClick={reset} style={{ marginTop: 12, padding: "10px 16px", borderRadius: 12, background: "#111", color: "#fff" }}>
        Try again · جرّب تاني
      </button>
    </main>
  );
}
