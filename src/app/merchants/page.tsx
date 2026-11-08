import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Dalil Pi for merchants",
  description: "Sell for Pi? Get found by Pi buyers in your country — free listing, trust badge and orders with the buyer's address.",
};

const en = [
  ["Get found", "Buyers ask Dalil Pi for what they need. Your shop shows up in their results — online, local or as a service."],
  ["Free listing", "No fees while Dalil Pi is on the Pi Testnet. Every shop is reviewed before it appears."],
  ["Paid directly in Pi", "Buyers pay you in Pi on your own page or in your shop. Dalil Pi never holds the money."],
  ["Automatic orders", "WooCommerce shop with a Pi gateway (e.g. Sallanet Pay)? Dalil Pi can place orders with the buyer's address for you."],
];
const ar = [
  ["المشترين يلاقوك", "المشتري بيطلب من دليل باي اللي محتاجه، ومتجرك بيظهر في النتايج — أونلاين أو محل أو خدمة."],
  ["التسجيل ببلاش", "مفيش رسوم طول ما دليل باي على الشبكة التجريبية. بنراجع كل متجر قبل ما يظهر."],
  ["الدفع ليك مباشرة بالباي", "المشتري بيدفعلك بالباي في صفحتك أو في محلك. دليل باي عمره ما بيمسك الفلوس."],
  ["طلبات أوتوماتيك", "عندك متجر ووكومرس عليه دفع باي (زي سلة نت باي)؟ دليل باي يقدر يعمل الطلب بعنوان المشتري."],
];

export default function Page() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="text-[12px] text-fg-muted underline underline-offset-2">
        ← Dalil Pi
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Dalil Pi for merchants</h1>
      <p className="mt-2 text-fg-soft">Sell for Pi? Get found by Pi buyers in your country.</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {en.map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-line p-4">
            <div className="font-semibold">{t}</div>
            <p className="mt-1 text-sm text-fg-muted">{d}</p>
          </div>
        ))}
      </div>
      <Link href="/?shop=1" className="mt-6 inline-flex rounded-full bg-inv-bg px-5 py-2.5 text-sm font-semibold text-inv-fg" data-testid="register-shop">
        Register your shop with Pi
      </Link>
      <hr className="my-10 border-line" />
      <section dir="rtl" lang="ar">
        <h2 className="text-2xl font-semibold">دليل باي للتجار</h2>
        <p className="mt-2 text-fg-soft">بتبيع بالباي؟ خلّي مشترين باي في بلدك يلاقوك.</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {ar.map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-line p-4">
              <div className="font-semibold">{t}</div>
              <p className="mt-1 text-sm text-fg-muted">{d}</p>
            </div>
          ))}
        </div>
        <Link href="/?shop=1" className="mt-6 inline-flex rounded-full bg-inv-bg px-5 py-2.5 text-sm font-semibold text-inv-fg">
          سجّل متجرك بحساب باي
        </Link>
      </section>
    </main>
  );
}
