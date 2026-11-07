"use client";

import { motion } from "framer-motion";
import { AlertCircle, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Strings } from "@/lib/i18n";
import type { Block, ChatMessage, Lang, Offer, Protection, WatchMode } from "@/lib/types";
import { CartCard, type CartAction } from "./Cart";
import { WatchDraftCard } from "./Watches";
import { InsightCard } from "./Insight";
import { ApprovalCard, BrowserCard, LinkCard, OfferSkeletons, ProductCards, StepsTimeline } from "./cards";
import Logo from "./Logo";

export type ApprovalAction = "approve" | "decline" | "cancel" | "capture" | "retry" | "track" | "refund" | "negotiate" | "group";

export default function MessageView({
  msg,
  live,
  s,
  lang,
  busy,
  onBuy,
  onWatch,
  onOpenDraft,
  onApproval,
  onPatchApproval,
  onCart,
  onAddToCart,
  inCart,
  demo,
  city,
}: {
  onPatchApproval?: (msgId: string, blockIndex: number, patch: { protection?: Protection; familyId?: string }) => Promise<void> | void;
  onCart?: (msgId: string, blockIndex: number, action: CartAction, arg?: number) => Promise<void> | void;
  onAddToCart?: (o: Offer) => void;
  inCart?: (o: Offer) => boolean;
  demo?: boolean;
  msg: ChatMessage;
  live: boolean;
  s: Strings;
  lang: Lang;
  busy: boolean;
  onBuy: (o: Offer) => void;
  onWatch?: (o: Offer) => void;
  onOpenDraft?: (d: { offer: Offer; targetPrice?: number; mode?: WatchMode }) => void;
  city?: string;
  onApproval: (msgId: string, blockIndex: number, action: ApprovalAction, reason?: string) => Promise<void> | void;
}) {
  if (msg.role === "user") {
    const texts = msg.blocks.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text");
    const imgs = msg.blocks.filter((b): b is Extract<Block, { type: "image" }> => b.type === "image");
    const links = msg.blocks.filter((b): b is Extract<Block, { type: "link" }> => b.type === "link");
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-end gap-2"
      >
        {imgs.length > 0 && (
          <div className={`grid gap-1.5 ${imgs.length > 1 ? "grid-cols-2" : ""} max-w-[18rem]`}>
            {imgs.map((im, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={im.dataUrl}
                alt=""
                className="aspect-square w-full rounded-2xl border border-line object-cover"
              />
            ))}
          </div>
        )}
        {links.map((l, i) => (
          <LinkCard key={i} preview={l.preview} lang={lang} />
        ))}
        {texts.map((tb, i) => (
          <div
            key={i}
            dir="auto"
            className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl rounded-ee-lg bg-inv-bg px-4 py-2.5 text-[15px] leading-relaxed text-inv-fg"
          >
            {tb.text}
          </div>
        ))}
      </motion.div>
    );
  }

  const empty = msg.blocks.length === 0;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
      <div className="mt-0.5 shrink-0">
        <Logo size={28} spinning={live} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {empty && live && <div className="shimmer pt-1 text-sm font-medium">{s.working}…</div>}
        {msg.blocks.map((b, i) => {
          switch (b.type) {
            case "steps":
              return (
                <div key={i} className="contents">
                  <StepsTimeline steps={b.steps} live={live} s={s} lang={lang} note={b.note} startedAt={b.startedAt} endedAt={b.endedAt} />
                  {live && !msg.blocks.some((x) => x.type === "products" || x.type === "browser") && b.steps.length > 0 && <OfferSkeletons />}
                </div>
              );
            case "text":
              return (
                <div key={i} dir="auto" className="prose-dalil text-[15px] text-fg">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: (p) => <a {...p} target="_blank" rel="noopener noreferrer" />,
                      blockquote: ({ children }) => (
                        <div className="not-prose my-3 flex items-start gap-2.5 rounded-xl border border-line bg-bg-soft px-3 py-2.5 text-sm">
                          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
                          <div className="min-w-0 [&>p]:m-0">{children}</div>
                        </div>
                      ),
                    }}
                  >
                    {b.text}
                  </ReactMarkdown>
                </div>
              );
            case "products":
              return (
                <ProductCards
                  key={i}
                  offers={b.offers}
                  s={s}
                  lang={lang}
                  onBuy={onBuy}
                  onWatch={onWatch}
                  onAddToCart={onAddToCart}
                  inCart={inCart}
                  disabled={busy}
                  city={city}
                />
              );
            case "cart":
              return <CartCard key={i} block={b} lang={lang} onAction={(a, arg) => onCart?.(msg.id, i, a, arg)} />;
            case "approval":
              return (
                <ApprovalCard
                  key={i}
                  offer={b.offer}
                  status={b.status}
                  message={b.message}
                  holdExpiresAt={b.holdExpiresAt}
                  shipping={b.shipping}
                  payerEmail={b.payerEmail}
                  s={s}
                  lang={lang}
                  onApprove={() => onApproval(msg.id, i, "approve")}
                  onDecline={() => onApproval(msg.id, i, "decline")}
                  negotiation={b.negotiation}
                  context={b.context}
                  groupId={b.groupId}
                  onGroup={async (n) => onApproval(msg.id, i, "group", String(n))}
                  mandate={b.mandate}
                  orderId={b.orderId}
                  captureId={b.captureId}
                  onNegotiate={() => onApproval(msg.id, i, "negotiate")}
                  onCancelHold={() => onApproval(msg.id, i, "cancel")}
                  onCaptureNow={() => onApproval(msg.id, i, "capture")}
                  onRetry={() => onApproval(msg.id, i, "retry")}
                  tracking={b.tracking}
                  refund={b.refund}
                  onTrack={async () => onApproval(msg.id, i, "track")}
                  onRefund={async (r) => onApproval(msg.id, i, "refund", r)}
                  protection={b.protection}
                  captureToken={b.captureToken}
                  familyId={b.familyId}
                  suggest={b.suggest}
                  demo={demo}
                  onPatch={onPatchApproval ? (patch) => onPatchApproval(msg.id, i, patch) : undefined}
                />
              );
            case "link":
              return <LinkCard key={i} preview={b.preview} lang={lang} />;
            case "insight":
              return <InsightCard key={i} offer={b.offer} insight={b.insight} lang={lang} onBuy={onBuy} onWatch={onOpenDraft} />;
            case "browser":
              return <BrowserCard key={i} block={b} lang={lang} live={live && b.live !== false} />;
            case "watchDraft":
              return (
                <WatchDraftCard
                  key={i}
                  offer={b.offer}
                  targetPrice={b.targetPrice}
                  mode={b.mode}
                  lang={lang}
                  onOpen={() => onOpenDraft?.({ offer: b.offer, targetPrice: b.targetPrice, mode: b.mode })}
                />
              );
            case "error":
              return (
                <div key={i} className="flex items-start gap-2 rounded-2xl border border-danger/30 px-3 py-2.5 text-sm text-danger">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span className="break-words">{b.text}</span>
                </div>
              );
            default:
              return null;
          }
        })}
      </div>
    </motion.div>
  );
}
