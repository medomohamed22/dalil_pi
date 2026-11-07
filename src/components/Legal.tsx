import Link from "next/link";

/** Plain bilingual legal page (English, then Arabic). Server component, no JS. */
export default function Legal({ title, updated, en, ar }: { title: { en: string; ar: string }; updated: string; en: [string, string][]; ar: [string, string][] }) {
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-[14px] leading-relaxed">
      <Link href="/" className="text-[12px] text-fg-muted underline underline-offset-2">
        ← Dalil Pi
      </Link>
      <article className="mt-4">
        <h1 className="text-2xl font-semibold tracking-tight">{title.en}</h1>
        <p className="mt-1 text-[12px] text-fg-muted">Last updated {updated}</p>
        {en.map(([h, b]) => (
          <section key={h} className="mt-6">
            <h2 className="font-semibold">{h}</h2>
            <p className="mt-1 whitespace-pre-line text-fg-soft">{b}</p>
          </section>
        ))}
        <p className="mt-6 text-fg-soft">Contact: {contact ? <a href={`mailto:${contact}`} className="underline">{contact}</a> : "through the Dalil Pi app page in the Pi Browser."}</p>
      </article>
      <hr className="my-10 border-line" />
      <article dir="rtl" lang="ar">
        <h1 className="text-2xl font-semibold">{title.ar}</h1>
        {ar.map(([h, b]) => (
          <section key={h} className="mt-6">
            <h2 className="font-semibold">{h}</h2>
            <p className="mt-1 whitespace-pre-line text-fg-soft">{b}</p>
          </section>
        ))}
        <p className="mt-6 text-fg-soft">للتواصل: {contact ? <a href={`mailto:${contact}`} className="underline">{contact}</a> : "من صفحة دليل باي في متصفح باي."}</p>
      </article>
    </main>
  );
}
