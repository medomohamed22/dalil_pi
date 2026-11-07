import type { Metadata } from "next";
import { FamilyPage } from "@/components/Family";

export const metadata: Metadata = {
  title: "Family approval · Dalil",
  description: "Review a purchase Dalil drafted and approve it from your own PayPal account — funds are held first, within a spending limit.",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FamilyPage id={id} />;
}
