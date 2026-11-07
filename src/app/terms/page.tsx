import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = { title: "Terms — Dalil Pi" };

const en: [string, string][] = [
  ["The service", "Dalil Pi helps you find products and services you can buy with Pi. We are not the seller: each store is a separate business and is responsible for its products, delivery and refunds. Dalil Pi is an independent app and isn't run by Pi Network or by any store it shows."],
  ["Check before you pay", "Results come from an AI and from store pages, and can be wrong or out of date. The trust score is an estimate from public signals, not a guarantee. Always check the price, the store and the shipping on the store's own page before paying. Never share your wallet passphrase with anyone."],
  ["Plans", "The free plan includes a number of searches and orders each month. Paid plans and top-ups are paid in Pi, priced from the live OKX rate at purchase, and last 30 days. Searches and orders you don't use expire when the 30 days end. Pi payments are final."],
  ["Testnet", "While Dalil Pi runs on the Pi Testnet, plan payments use Test-Pi, which has no value."],
  ["Fair use", "Don't misuse the service: no automated scraping, no attempts to bypass limits or payments, and nothing illegal. We may limit or close accounts that do."],
  ["Changes", "We may update the service and these terms. We'll change the date at the top when we do."],
];

const ar: [string, string][] = [
  ["الخدمة", "دليل باي بيساعدك تلاقي منتجات وخدمات تشتريها بالباي. احنا مش البايع: كل متجر شركة لوحدها ومسؤول عن منتجاته وشحنه والاسترجاع. دليل باي تطبيق مستقل، ومش تابع لـ Pi Network ولا لأي متجر بيظهر فيه."],
  ["اتأكد قبل ما تدفع", "النتايج جاية من ذكاء اصطناعي ومن صفحات المتاجر، وممكن تكون غلط أو قديمة. رقم الثقة تقدير من معلومات عامة، مش ضمان. اتأكد دايماً من السعر والمتجر والشحن على صفحة المتجر قبل الدفع. ومتديش الكلمات السرية بتاعة محفظتك لأي حد."],
  ["الباقات", "الباقة المجانية فيها عدد بحث وطلبات كل شهر. الباقات المدفوعة والشحن بيتدفعوا بالباي، والسعر من OKX وقت الشراء، وصلاحيتهم 30 يوم. البحث والطلبات اللي متستخدمش بتنتهي بعد الـ 30 يوم. الدفع بالباي نهائي."],
  ["الشبكة التجريبية", "طول ما دليل باي شغال على الشبكة التجريبية، الباقات بتتدفع بباي تجريبي ملوش قيمة."],
  ["الاستخدام العادل", "متستخدمش الخدمة غلط: ممنوع السحب الآلي، أو محاولة تعدي الحدود أو الدفع، أو أي حاجة مخالفة للقانون. ممكن نوقف الحسابات اللي بتعمل كده."],
  ["التغييرات", "ممكن نحدّث الخدمة والشروط دي، وهنغيّر التاريخ اللي فوق لما ده يحصل."],
];

export default function Page() {
  return <Legal title={{ en: "Terms of Use", ar: "شروط الاستخدام" }} updated="November 7, 2026" en={en} ar={ar} />;
}
