import type { Metadata } from "next";
import { GroupPage } from "@/components/Group";

export const metadata: Metadata = {
  title: "Group buy · Dalil",
  description: "Chip in for a shared purchase with PayPal — nobody is charged until everyone has paid.",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupPage id={id} />;
}
