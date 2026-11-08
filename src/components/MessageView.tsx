"use client";

import { m } from "framer-motion";
import { AlertCircle, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Strings } from "@/lib/i18n";
import type { Block, ChatMessage, Lang, Offer } from "@/lib/types";
import { BrowserCard, LinkCard, OfferSkeletons, ProductCards, StepsTimeline } from "./cards";
import Logo from "./Logo";

export default function MessageView({
  msg,
  live,
  s,
  lang,
  city,
  onOrder,
  ordersLeft,
  onFollowUp,
  onRetry,
  onWatch,
  onAsk,
}: {
  msg: ChatMessage;
  live: boolean;
  s: Strings;
  lang: Lang;
  city?: string;
  onOrder?: (o: Offer) => void;
  ordersLeft?: number | null;
  /** Only on the latest finished answer: quick follow-up chips / retry. */
  onFollowUp?: (text: string) => void;
  onRetry?: () => void;
  onWatch?: (o: Offer) => Promise<boolean>;
  onAsk?: (text: string) => void;
}) {
  if (msg.role === "user") {
    const texts = msg.blocks.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text");
    const imgs = msg.blocks.filter((b): b is Extract<Block, { type: "image" }> => b.type === "image");
    const links = msg.blocks.filter((b): b is Extract<Block, { type: "link" }> => b.type === "link");
    return (
      <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-end gap-2">
        {imgs.length > 0 && (
          <div className={`grid gap-1.5 ${imgs.length > 1 ? "grid-cols-2" : ""} max-w-[18rem]`}>
            {imgs.map((im, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={im.dataUrl} alt="" className="aspect-square w-full rounded-2xl border border-line object-cover" />
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
      </m.div>
    );
  }

  const empty = msg.blocks.length === 0;
  return (
    <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
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
              return <ProductCards key={i} offers={b.offers} s={s} lang={lang} city={city} onOrder={onOrder} ordersLeft={ordersLeft} onWatch={onWatch} onAsk={onAsk} />;
            case "link":
              return <LinkCard key={i} preview={b.preview} lang={lang} />;
            case "browser":
              return <BrowserCard key={i} block={b} lang={lang} live={live && b.live !== false} />;
            case "error":
              return (
                <div key={i} className="flex items-start gap-2 rounded-2xl border border-danger/30 px-3 py-2.5 text-sm text-danger">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span className="flex-1 break-words">{b.text}</span>
                  {onRetry && (
                    <button onClick={onRetry} className="shrink-0 rounded-full border border-danger/40 px-2.5 py-0.5 text-[12px] font-medium" data-testid="retry">
                      {s.retry}
                    </button>
                  )}
                </div>
              );
            default:
              return null;
          }
        })}
        {onFollowUp && !live && msg.blocks.some((b) => b.type === "products") && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto" data-testid="follow-ups">
            {s.followUps.map((label, i) => (
              <m.button
                key={label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}
                onClick={() => onFollowUp(s.followUpsPrompt[i])}
                className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] font-medium text-fg-soft hover:bg-bg-soft"
              >
                {label}
              </m.button>
            ))}
          </div>
        )}
      </div>
    </m.div>
  );
}
