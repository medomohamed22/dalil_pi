"use client";

/** Last-resort screen if even the root layout fails — never a blank white page. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ padding: 24, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Dalil Pi couldn&apos;t start · دليل باي مقدرش يفتح</h1>
        <pre style={{ marginTop: 12, padding: 12, background: "#f4f4f5", borderRadius: 12, whiteSpace: "pre-wrap", fontSize: 12 }}>
          {String(error?.message || error)}
          {error?.digest ? `\n#${error.digest}` : ""}
          {typeof navigator !== "undefined" ? `\n${navigator.userAgent}` : ""}
        </pre>
        <button onClick={reset} style={{ marginTop: 12, padding: "10px 16px", borderRadius: 12, background: "#111", color: "#fff" }}>
          Try again · جرّب تاني
        </button>
      </body>
    </html>
  );
}
