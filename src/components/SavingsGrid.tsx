"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import { formatMoney } from "@/lib/i18n";
import type { Lang } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

export interface PurchaseRow {
  id: string;
  conversationId: string;
  date: number;
  title: string;
  image?: string;
  store: string;
  paid: number;
  currency: string;
  saved: number;
  negotiated: number;
  /** Paid back by price protection (offer currency). */
  priceDrop?: number;
  status: "captured" | "held" | "refunded";
  orderId?: string;
}

/** Black-and-white grid that follows the app's theme tokens (light & dark). */
const theme = themeQuartz.withParams({
  backgroundColor: "var(--bg)",
  foregroundColor: "var(--fg)",
  headerBackgroundColor: "var(--bg-soft)",
  headerTextColor: "var(--fg-muted)",
  borderColor: "var(--line)",
  accentColor: "var(--fg)",
  rowHoverColor: "var(--bg-soft)",
  oddRowBackgroundColor: "var(--bg)",
  chromeBackgroundColor: "var(--bg)",
  fontFamily: "inherit",
  fontSize: 13,
  headerFontSize: 11,
  headerFontWeight: 600,
  spacing: 6,
  wrapperBorderRadius: 16,
  rowHeight: 56,
  headerHeight: 36,
});

export default function SavingsGrid({ rows, lang, onOpen }: { rows: PurchaseRow[]; lang: Lang; onOpen: (r: PurchaseRow) => void }) {
  const ar = lang === "ar";
  const money = (v: number, c: string) => formatMoney(c === "EGP" ? Math.round(v) : Math.round(v * 100) / 100, c, lang);
  const cols = useMemo<ColDef<PurchaseRow>[]>(
    () => [
      {
        headerName: ar ? "المنتج" : "Product",
        field: "title",
        flex: 2,
        minWidth: 170,
        cellRenderer: (p: ICellRendererParams<PurchaseRow>) => (
          <div className="flex h-full items-center gap-2.5">
            {p.data?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.data.image} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-lg border border-line bg-white object-contain" />
            ) : (
              <span className="size-9 shrink-0 rounded-lg bg-bg-soft" />
            )}
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-medium" dir="auto">{p.data?.title}</span>
              <span className="block truncate text-[11px] text-fg-muted">{p.data?.store}</span>
            </span>
          </div>
        ),
      },
      {
        headerName: ar ? "وفّرت" : "Saved",
        field: "saved",
        width: 120,
        sort: "desc",
        cellRenderer: (p: ICellRendererParams<PurchaseRow>) =>
          p.data && p.data.saved > 0 ? (
            <div className="flex h-full items-center">
              <span className="rounded-full bg-inv-bg px-2 text-[11.5px] font-semibold leading-6 tabular-nums text-inv-fg">
                −{money(p.data.saved, p.data.currency)}
              </span>
            </div>
          ) : (
            <span className="text-fg-muted">—</span>
          ),
      },
      {
        headerName: ar ? "دفعت" : "Paid",
        field: "paid",
        width: 120,
        valueFormatter: (p) => (p.data ? money(p.data.paid, p.data.currency) : ""),
        cellClass: "tabular-nums",
      },
      {
        headerName: ar ? "الحالة" : "Status",
        field: "status",
        width: 110,
        cellRenderer: (p: ICellRendererParams<PurchaseRow>) => {
          const label = { captured: ar ? "تم الشراء" : "Bought", held: ar ? "محجوز" : "On hold", refunded: ar ? "مسترجع" : "Refunded" }[p.data?.status ?? "captured"];
          return (
            <div className="flex h-full items-center">
              <span className={`rounded-full border border-line px-2 text-[11px] leading-5 ${p.data?.status === "captured" ? "" : "text-fg-muted"}`}>{label}</span>
            </div>
          );
        },
      },
      {
        headerName: ar ? "التاريخ" : "Date",
        field: "date",
        width: 120,
        valueFormatter: (p) =>
          p.value ? new Date(p.value).toLocaleDateString(ar ? "ar-EG-u-nu-latn" : "en-US", { day: "numeric", month: "short", year: "numeric" }) : "",
      },
      {
        headerName: "PayPal",
        field: "orderId",
        width: 170,
        cellClass: "font-mono text-[11px] text-fg-muted",
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ar],
  );
  return (
    <div className="savings-grid w-full" dir={ar ? "rtl" : "ltr"}>
      <AgGridReact<PurchaseRow>
        theme={theme}
        rowData={rows}
        columnDefs={cols}
        enableRtl={ar}
        domLayout="autoHeight"
        defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }}
        onRowClicked={(e) => e.data && onOpen(e.data)}
        rowClass="cursor-pointer"
        getRowId={(p) => p.data.id}
        animateRows
      />
    </div>
  );
}
