import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Calendar, Info, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import { format } from "date-fns";
import { ar as arLocale, enUS } from "date-fns/locale";

/* ───────────────────────────── API data shapes ───────────────────────────── */
// Produced by server/reports.ts

export interface Agg {
  orders: number;
  units: number;
  gross: number;
  discounts: number;
  sales: number;
  profit: number;
  cash: number;
  card: number;
  credit: number;
}
export interface ChannelTotals {
  web: Agg;
  pos: Agg;
  all: Agg;
  exchangeInvoices: number;
}

export interface OverviewData {
  month: string | null;
  costRatio: number;
  availableMonths: string[];
  totals: ChannelTotals;
  monthly: {
    month: string;
    web: { sales: number; profit: number; orders: number; units: number };
    pos: { sales: number; profit: number; orders: number; units: number };
  }[];
  daily: { day: string; web: number; pos: number; profit: number }[];
  categories: {
    id: number;
    name: string;
    nameAr: string;
    web: Agg;
    pos: Agg;
    all: Agg;
    orders: number;
    sharePct: number;
  }[];
  topProducts: {
    id: number;
    name: string;
    image: string | null;
    category: string;
    categoryAr: string;
    units: number;
    sales: number;
    profit: number;
  }[];
  ordersByRegion: { region: string; orderCount: number }[];
  ordersByCity: { city: string; orderCount: number }[];
  generatedAt: string;
}

export interface InventorySummary {
  productCount: number;
  inStockCount: number;
  outOfStockCount: number;
  totalUnits: number;
  avgPrice: number;
  sellingValue: number;
  capital: number;
  expectedProfit: number;
}
export interface SalesSummary {
  units: number;
  sales: number;
  profit: number;
  discounts: number;
}
export interface CapitalData {
  month: string | null;
  costRatio: number;
  availableMonths: string[];
  total: { inventory: InventorySummary; sales: SalesSummary };
  categories: {
    id: number;
    name: string;
    nameAr: string;
    image: string | null;
    inventory: InventorySummary;
    sales: SalesSummary;
  }[];
}

export interface CategoryDetailData {
  month: string | null;
  costRatio: number;
  availableMonths: string[];
  category: { id: number; name: string; nameAr: string; image: string | null };
  inventory: InventorySummary;
  totals: ChannelTotals;
  subcategories: {
    id: number | null;
    name: string;
    nameAr: string;
    isActive: boolean;
    productCount: number;
    stockUnits: number;
    sellingValue: number;
    capital: number;
    webSales: number;
    posSales: number;
    units: number;
    sales: number;
    profit: number;
  }[];
  products: {
    id: number;
    name: string;
    image: string | null;
    barcode: string | null;
    subcategoryId: number | null;
    price: number;
    stock: number;
    sellingValue: number;
    capital: number;
    webUnits: number;
    posUnits: number;
    soldUnits: number;
    sales: number;
    profit: number;
  }[];
  bestSellers: CategoryDetailData["products"];
  monthly: { month: string; web: number; pos: number; profit: number; webCash: number; webCard: number; posCash: number; posCard: number }[];
  daily: { day: string; web: number; pos: number; profit: number }[];
  weeklyPayment: { week: string; webCash: number; webCard: number; posCash: number; posCard: number }[];
}

/* ─────────────────────────────── formatting ─────────────────────────────── */

export const fmtMoney = (n: number) =>
  `₪${(Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtInt = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString("en-US");
export const fmtPct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`;
export const pctOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

export function monthLabel(month: string, isAr: boolean, pattern = "MMMM yyyy") {
  try {
    return format(new Date(`${month}-01T12:00:00`), pattern, { locale: isAr ? arLocale : enUS });
  } catch {
    return month;
  }
}

/** Short YYYY-MM-DD → "05 Oct" */
export function dayLabel(day: string, isAr: boolean) {
  try {
    return format(new Date(`${day}T12:00:00`), "d MMM", { locale: isAr ? arLocale : enUS });
  } catch {
    return day;
  }
}

/* ───────────────────────────────── colours ───────────────────────────────── */

export const C = {
  web: "#7C6EFA",
  pos: "#F06292",
  profit: "#16A34A",
  sales: "#2563EB",
  cash: "#26A69A",
  card: "#FFA726",
  credit: "#94A3B8",
  capital: "#D97706",
  palette: ["#7C6EFA", "#F06292", "#26A69A", "#FFA726", "#AB8CF7", "#81C784", "#FF8A65", "#4FC3F7", "#BA68C8", "#A1887F"],
};

/* ──────────────────────────────── components ─────────────────────────────── */

type Tone = "violet" | "pink" | "emerald" | "amber" | "sky" | "rose" | "teal" | "slate" | "blue";
const TONES: Record<Tone, { bg: string; fg: string; ring: string }> = {
  violet: { bg: "bg-violet-50 dark:bg-violet-950/30", fg: "text-violet-600 dark:text-violet-400", ring: "border-violet-200/70 dark:border-violet-900/50" },
  pink: { bg: "bg-pink-50 dark:bg-pink-950/30", fg: "text-pink-600 dark:text-pink-400", ring: "border-pink-200/70 dark:border-pink-900/50" },
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/30", fg: "text-emerald-600 dark:text-emerald-400", ring: "border-emerald-200/70 dark:border-emerald-900/50" },
  amber: { bg: "bg-amber-50 dark:bg-amber-950/30", fg: "text-amber-600 dark:text-amber-400", ring: "border-amber-200/70 dark:border-amber-900/50" },
  sky: { bg: "bg-sky-50 dark:bg-sky-950/30", fg: "text-sky-600 dark:text-sky-400", ring: "border-sky-200/70 dark:border-sky-900/50" },
  rose: { bg: "bg-rose-50 dark:bg-rose-950/30", fg: "text-rose-600 dark:text-rose-400", ring: "border-rose-200/70 dark:border-rose-900/50" },
  teal: { bg: "bg-teal-50 dark:bg-teal-950/30", fg: "text-teal-600 dark:text-teal-400", ring: "border-teal-200/70 dark:border-teal-900/50" },
  slate: { bg: "bg-slate-50 dark:bg-slate-900/30", fg: "text-slate-600 dark:text-slate-300", ring: "border-slate-200/70 dark:border-slate-800/50" },
  blue: { bg: "bg-blue-50 dark:bg-blue-950/30", fg: "text-blue-600 dark:text-blue-400", ring: "border-blue-200/70 dark:border-blue-900/50" },
};
export const toneText = (t: Tone) => TONES[t].fg;

export function StatCard({
  label, value, sub, icon: Icon, tone = "slate", big = false, testId,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  big?: boolean;
  testId?: string;
}) {
  const t = TONES[tone];
  return (
    <div className={`bg-card border ${t.ring} rounded-xl p-4 sm:p-5 flex items-start gap-3`} data-testid={testId}>
      {Icon && (
        <div className={`w-10 h-10 rounded-lg ${t.bg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-5 h-5 ${t.fg}`} />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        <p className={`${big ? "text-2xl" : "text-xl"} font-semibold mt-1 leading-tight tabular-nums`} dir="ltr" style={{ unicodeBidi: "isolate" }}>
          {value}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{sub}</p>}
      </div>
    </div>
  );
}

export function Panel({
  title, subtitle, icon: Icon, actions, children, className = "",
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-card border border-border rounded-xl p-4 sm:p-6 mb-6 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />}
            {title}
          </h2>
          {subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** "How are these numbers calculated?" — always visible so nobody has to guess. */
export function RulesBox({ isAr, costRatio, show = ["sales", "profit", "capital"] }: { isAr: boolean; costRatio: number; show?: ("sales" | "profit" | "capital")[] }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(costRatio * 100);
  const rules: Record<string, { title: string; body: string }> = {
    sales: {
      title: isAr ? "المبيعات" : "Sales",
      body: isAr
        ? "قيمة ما بيع بعد الخصومات والتبديلات، بدون أجور الشحن. الموقع: الطلبات المُسلَّمة فقط. نقطة البيع: كل الفواتير."
        : "Value sold after discounts and exchanges, shipping excluded. Website: Delivered orders only. POS: every invoice.",
    },
    profit: {
      title: isAr ? "الأرباح" : "Profit",
      body: isAr
        ? `${100 - pct}% من سعر المنتج × عدد القطع المباعة (وليس من مبلغ المبيعات). القطع المُرجعة بالتبديل لا تُحتسب.`
        : `${100 - pct}% of the product price × units sold (not taken from the sales amount). Units returned in an exchange are not counted.`,
    },
    capital: {
      title: isAr ? "رأس المال" : "Capital",
      body: isAr
        ? `${pct}% من سعر المنتج × الكمية الموجودة بالمخزن حالياً.`
        : `${pct}% of the product price × units currently in stock.`,
    },
  };
  return (
    <div className="mb-6 rounded-xl border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        data-testid="button-toggle-rules"
      >
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4" />
          {isAr ? "كيف تُحسب الأرقام؟" : "How are these numbers calculated?"}
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className={`grid grid-cols-1 ${show.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2"} gap-3 px-4 pb-4`}>
          {show.map((k) => (
            <div key={k} className="rounded-lg bg-background border border-border p-3">
              <p className="text-sm font-semibold mb-1">{rules[k].title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{rules[k].body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MonthSelect({
  value, onChange, months, isAr, testId = "select-report-month", allLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  months: string[];
  isAr: boolean;
  testId?: string;
  allLabel?: string;
}) {
  const list = value && !months.includes(value) ? [value, ...months] : months;
  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-muted-foreground" />
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-w-[160px]"
        dir={isAr ? "rtl" : "ltr"}
      >
        <option value="">{allLabel ?? (isAr ? "كل الفترات" : "All time")}</option>
        {list.map((m) => (
          <option key={m} value={m}>{monthLabel(m, isAr)}</option>
        ))}
      </select>
    </div>
  );
}

/** Website | POS | Total comparison — every number side by side. */
export function ChannelTable({ totals, isAr }: { totals: ChannelTotals; isAr: boolean }) {
  const { web, pos, all } = totals;
  type Row = { label: string; get: (a: Agg) => number; kind?: "money" | "int" | "pct"; strong?: boolean; tone?: string; hint?: string };
  const rows: Row[] = [
    { label: isAr ? "عدد الفواتير / الطلبات" : "Orders / invoices", get: (a) => a.orders, kind: "int" },
    { label: isAr ? "القطع المباعة" : "Units sold", get: (a) => a.units, kind: "int" },
    { label: isAr ? "قيمة البيع قبل الخصم" : "Value before discounts", get: (a) => a.gross },
    { label: isAr ? "الخصومات" : "Discounts", get: (a) => a.discounts, tone: "text-rose-600 dark:text-rose-400" },
    { label: isAr ? "صافي المبيعات" : "Net sales", get: (a) => a.sales, strong: true, tone: "text-blue-600 dark:text-blue-400" },
    { label: isAr ? "الأرباح" : "Profit", get: (a) => a.profit, strong: true, tone: "text-emerald-600 dark:text-emerald-400" },
    { label: isAr ? "نسبة الربح من المبيعات" : "Profit / sales", get: (a) => pctOf(a.profit, a.sales), kind: "pct" },
    { label: isAr ? "متوسط قيمة الطلب" : "Average order", get: (a) => (a.orders > 0 ? a.sales / a.orders : 0) },
    { label: isAr ? "دفع نقدي / عند التسليم" : "Cash / on delivery", get: (a) => a.cash, tone: "text-teal-600 dark:text-teal-400" },
    { label: isAr ? "دفع بالبطاقة" : "Card", get: (a) => a.card, tone: "text-amber-600 dark:text-amber-400" },
    { label: isAr ? "رصيد المتجر" : "Store credit", get: (a) => a.credit },
  ];
  const show = (r: Row, a: Agg) => {
    const v = r.get(a);
    return r.kind === "int" ? fmtInt(v) : r.kind === "pct" ? fmtPct(v) : fmtMoney(v);
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-start py-2 px-3 font-medium"></th>
            <th className="text-end py-2 px-3 font-medium whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: C.web }} />{isAr ? "الموقع" : "Website"}</span></th>
            <th className="text-end py-2 px-3 font-medium whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: C.pos }} />{isAr ? "نقطة البيع" : "POS"}</span></th>
            <th className="text-end py-2 px-3 font-semibold whitespace-nowrap">{isAr ? "الإجمالي" : "Total"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={`border-b border-border/50 ${r.strong ? "bg-muted/30" : ""}`}>
              <td className={`py-2.5 px-3 ${r.strong ? "font-semibold" : "text-muted-foreground"}`}>{r.label}</td>
              <td className={`py-2.5 px-3 text-end tabular-nums ${r.tone ?? ""}`} dir="ltr">{show(r, web)}</td>
              <td className={`py-2.5 px-3 text-end tabular-nums ${r.tone ?? ""}`} dir="ltr">{show(r, pos)}</td>
              <td className={`py-2.5 px-3 text-end tabular-nums font-semibold ${r.tone ?? ""}`} dir="ltr">{show(r, all)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {totals.exchangeInvoices > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2">
          {isAr
            ? `منها ${totals.exchangeInvoices} فاتورة تبديل في نقطة البيع (القطع المُرجعة تُخصم من الفاتورة الأصلية).`
            : `Includes ${totals.exchangeInvoices} POS exchange invoice(s) — returned items are removed from the original invoice.`}
        </p>
      )}
    </div>
  );
}

/* ───────────────────────────── sortable tables ───────────────────────────── */

export function useSort<K extends string>(initialKey: K, initialDir: "asc" | "desc" = "desc") {
  const [key, setKey] = useState<K>(initialKey);
  const [dir, setDir] = useState<"asc" | "desc">(initialDir);
  const toggle = (k: K) => {
    if (k === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setKey(k); setDir("desc"); }
  };
  return { key, dir, toggle };
}

export function SortTh({
  label, k, sort, align = "end", className = "",
}: {
  label: string;
  k: string;
  sort: { key: string; dir: "asc" | "desc"; toggle: (k: any) => void };
  align?: "start" | "end";
  className?: string;
}) {
  const active = sort.key === k;
  return (
    <th className={`py-2 px-3 font-medium text-muted-foreground whitespace-nowrap text-${align} ${className}`}>
      <button
        type="button"
        onClick={() => sort.toggle(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : ""}`}
      >
        {label}
        {active ? (sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-40" />}
      </button>
    </th>
  );
}

export function sortRows<T>(rows: T[], get: (r: T) => number | string, dir: "asc" | "desc"): T[] {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (typeof x === "string" || typeof y === "string") return String(x).localeCompare(String(y)) * m;
    return ((x as number) - (y as number)) * m;
  });
}

export function ChartTooltipBox({ active, payload, label, isAr, labelFormatter }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-md text-xs" dir={isAr ? "rtl" : "ltr"}>
      <p className="font-semibold mb-1">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
            {p.name}
          </span>
          <span className="tabular-nums font-medium" dir="ltr">{fmtMoney(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}
