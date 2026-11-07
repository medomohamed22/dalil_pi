import type { Metadata } from "next";
import Legal from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy — Dalil Pi" };

const en: [string, string][] = [
  ["What Dalil Pi is", "Dalil Pi is an AI shopping assistant for Pi Network users. It searches stores that accept Pi, scores how trustworthy they are and opens the store's own checkout. Product payments go from your Pi wallet to the store; Dalil Pi only receives subscription payments."],
  ["What we store (on our server, Supabase)", "• Your Pi user id and username, from Pi sign-in.\n• Your country and language settings.\n• How many searches and orders you used, and your plans (30-day packs) and their Pi payments.\n• Addresses you save and orders you start (product, store, price, shipping details)."],
  ["What stays on your device", "• Your chat history (stored in your browser).\n• Voice typing: your voice is turned into text on your phone. Audio never leaves the device. The speech model is downloaded once from the Hugging Face CDN."],
  ["What is sent to the AI model", "Your search messages (and photos you attach) are sent to Meta's AI model to run the search. Meta may use these prompts to improve its models, so don't type personal details in the chat. Your saved addresses, phone and email are never sent to the AI.\nIf you choose \"Near me\", your location is rounded to about 1 km and shared with the model to find nearby shops."],
  ["What is sent to stores", "Only when you confirm an automatic order, your name, phone, shipping address and email go to that one store to create your order. With a normal \"Order\", nothing is sent — the store's page just opens."],
  ["Other services", "• Your country is detected from your IP address by our host (Vercel).\n• The Pi price comes from OKX.\n• Store website age is looked up on public RDAP (only the store's domain is sent).\n• Pi sign-in and payments run through Pi Network."],
  ["Your choices", "You can delete saved addresses any time in My account. To delete your account data, contact us with your Pi username."],
];

const ar: [string, string][] = [
  ["دليل باي إيه", "دليل باي مساعد تسوّق بالذكاء الاصطناعي لمستخدمي باي. بيدوّر في المتاجر اللي بتقبل باي، ويحسب رقم ثقة لكل متجر، ويفتح صفحة الدفع بتاعة المتجر نفسه. فلوس المنتجات بتروح من محفظتك للمتجر، ودليل باي بيستقبل فلوس الاشتراكات بس."],
  ["اللي بنحفظه عندنا (Supabase)", "• رقم حسابك واسم المستخدم من تسجيل الدخول بباي.\n• بلدك ولغتك.\n• عدد عمليات البحث والطلبات، والباقات (30 يوم) ومدفوعاتها بالباي.\n• العناوين اللي بتحفظها والطلبات اللي بتبدأها."],
  ["اللي بيفضل على جهازك", "• المحادثات (محفوظة في المتصفح).\n• الكتابة بالصوت: صوتك بيتحوّل لنص على موبايلك ومش بيطلع منه. نموذج الصوت بيتحمّل مرة واحدة من Hugging Face."],
  ["اللي بيروح لنموذج الذكاء الاصطناعي", "رسايل البحث (والصور اللي بترفعها) بتروح لنموذج ميتا علشان يعمل البحث، وميتا ممكن تستخدمها لتحسين نماذجها، فمتكتبش بيانات شخصية في المحادثة. عناوينك وتليفونك وإيميلك عمرهم ما بيروحوا للذكاء الاصطناعي.\nلو اخترت «قريب مني»، مكانك بيتقرّب لحوالي 1 كم ويتبعت للنموذج علشان يلاقي محلات قريبة."],
  ["اللي بيروح للمتاجر", "بس لما تأكد طلب أوتوماتيك، اسمك وتليفونك وعنوانك وإيميلك بيروحوا للمتجر ده بس علشان يعمل الطلب. مع زرار «اطلب» العادي مفيش حاجة بتتبعت، صفحة المتجر بس بتتفتح."],
  ["خدمات تانية", "• بلدك بيتعرف من الـ IP عن طريق Vercel.\n• سعر الباي من OKX.\n• عمر موقع المتجر من RDAP العام (بنبعت اسم الموقع بس).\n• تسجيل الدخول والدفع عن طريق Pi Network."],
  ["اختياراتك", "تقدر تمسح عناوينك في أي وقت من «حسابي». علشان تمسح بيانات حسابك، كلّمنا باسم المستخدم بتاعك على باي."],
];

export default function Page() {
  return <Legal title={{ en: "Privacy Policy", ar: "سياسة الخصوصية" }} updated="November 7, 2026" en={en} ar={ar} />;
}
