import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, startOfWeek, startOfMonth, endOfMonth, subDays, subMonths } from "date-fns";
import ExcelJS from "exceljs";
import {
  Receipt,
  Banknote,
  CreditCard,
  Split,
  ArrowLeftRight,
  Search,
  Download,
  ChevronDown,
  Tag,
  ShoppingBag,
  CalendarDays,
  X,
  Undo2,
} from "lucide-react";
import { useLanguage } from "@/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/* ── Amount helpers ────────────────────────────────────────────────────
   Same rules the POS reports page uses, so the numbers here match the
   numbers the admin already sees in POS reports. Kept local so this
   component doesn't depend on the (very large) POS page module. */
function lineSubtotal(o: any): number {
  return (o.items || []).reduce(
    (s: number, it: any) => s + (parseFloat(it.price || 0) || 0) * (it.quantity || 1),
    0,
  );
}
function orderDiscount(o: any): number {
  const stored = parseFloat(o.discount_amount ?? o.discountAmount ?? 0);
  if (stored > 0) return stored;
  const sub = lineSubtotal(o);
  const total = parseFloat(o.total_amount ?? o.totalAmount ?? 0);
  const method = o.payment_method || o.paymentMethod || "cash";
  const cash = parseFloat(o.cash_amount ?? o.cashAmount ?? 0) || 0;
  const card = parseFloat(o.card_amount ?? o.cardAmount ?? 0) || 0;
  if (method === "card" && card > 0 && card < sub - 0.005) return sub - card;
  if (method === "split" && cash + card > 0 && cash + card < sub - 0.005) return sub - (cash + card);
  if (total < sub - 0.005) return sub - total;
  return 0;
}
function orderTotal(o: any): number {
  const sub = lineSubtotal(o);
  const discount = orderDiscount(o);
  const stored = parseFloat(o.total_amount ?? o.totalAmount ?? 0);
  const method = o.payment_method || o.paymentMethod || "cash";
  const cash = parseFloat(o.cash_amount ?? o.cashAmount ?? 0) || 0;
  const card = parseFloat(o.card_amount ?? o.cardAmount ?? 0) || 0;
  if (discount > 0) {
    if (Math.abs(stored - sub) < 0.01) return Math.max(0, sub - discount);
    return stored;
  }
  if (method === "card" && card > 0) return card;
  if (method === "split" && cash + card > 0) return cash + card;
  return stored;
}
function orderSplit(o: any): { cash: number; card: number } {
  const total = orderTotal(o);
  const method = o.payment_method || o.paymentMethod || "cash";
  const cash = parseFloat(o.cash_amount ?? o.cashAmount ?? 0) || 0;
  const card = parseFloat(o.card_amount ?? o.cardAmount ?? 0) || 0;
  if (method === "cash") return { cash: total, card: 0 };
  if (method === "card") return { cash: 0, card: total };
  if (method === "split" && cash + card > 0) return { cash, card };
  return { cash: total, card: 0 };
}
function orderMethod(o: any): "cash" | "card" | "split" {
  const m = String(o.payment_method || o.paymentMethod || "cash").toLowerCase();
  return m === "card" || m === "split" ? m : "cash";
}
function isExchange(o: any): boolean {
  const note = String(o.note || "");
  return note.includes("فاتورة تبديل") || note.includes("EXCHANGE INVOICE");
}
function orderDate(o: any): Date {
  return new Date(o.created_at || o.createdAt || 0);
}
function orderQty(o: any): number {
  return (o.items || []).reduce((s: number, it: any) => s + (Number(it.quantity) || 1), 0);
}
function sellerIdOf(o: any): number {
  return Number(o.seller_id ?? o.sellerId ?? 0);
}
const money = (n: number) => `₪${n.toFixed(2)}`;

/* ── Unified ledger rows: every sale and every return by this employee ── */
type Row = {
  kind: "sale" | "return";
  key: string;
  order: any;
  date: Date;
  amount: number;          // signed: + sale, − return
  cash: number;
  card: number;
  discount: number;
  qty: number;
  method: "cash" | "card" | "split";
  exchange: boolean;
  items: any[];
  note?: string;
};
function buildRows(orders: any[], userId: number): Row[] {
  const rows: Row[] = [];
  for (const o of orders) {
    if (sellerIdOf(o) === userId) {
      const s = orderSplit(o);
      rows.push({
        kind: "sale", key: `s-${o.id}`, order: o, date: orderDate(o),
        amount: orderTotal(o), cash: s.cash, card: s.card, discount: orderDiscount(o),
        qty: orderQty(o), method: orderMethod(o), exchange: isExchange(o), items: o.items || [], note: o.note || undefined,
      });
    }
    const returns: any[] = Array.isArray(o.return_history ?? o.returnHistory) ? (o.return_history ?? o.returnHistory) : [];
    returns.forEach((r, i) => {
      if (Number(r.byUserId) !== userId) return;
      const amt = parseFloat(r.amount || 0) || 0;
      rows.push({
        kind: "return", key: `r-${o.id}-${i}`, order: o, date: new Date(r.returnedAt || 0),
        amount: -amt, cash: 0, card: 0, discount: 0,
        qty: (r.items || []).reduce((q: number, it: any) => q + (Number(it.quantity) || 0), 0),
        method: orderMethod(o), exchange: false, items: r.items || [],
      });
    });
  }
  return rows;
}

/* ── Filters ─────────────────────────────────────────────────────────── */
type Preset = "today" | "yesterday" | "week" | "month" | "lastMonth" | "all" | "custom";
type MethodFilter = "all" | "cash" | "card" | "split";
type TypeFilter = "all" | "sale" | "exchange" | "return";
type SortKey = "newest" | "oldest" | "highest" | "lowest";

function presetRange(p: Preset, now: Date): { from: Date | null; to: Date | null } {
  switch (p) {
    case "today": return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    case "week": return { from: startOfWeek(now, { weekStartsOn: 6 }), to: endOfDay(now) };
    case "month": return { from: startOfMonth(now), to: endOfDay(now) };
    case "lastMonth": { const m = subMonths(now, 1); return { from: startOfMonth(m), to: endOfMonth(m) }; }
    default: return { from: null, to: null };
  }
}

interface Props {
  user: { id: number; fullName: string | null; email: string } | null;
  onClose: () => void;
}

const selectCls = "h-9 text-sm rounded-md border border-border bg-background px-2.5 focus:outline-none focus:ring-2 focus:ring-ring";

export function EmployeeSalesDialog({ user, onClose }: Props) {
  const { language } = useLanguage();
  const ar = language === "ar";

  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [method, setMethod] = useState<MethodFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showDaily, setShowDaily] = useState(false);

  const { data: allOrders = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/pos/orders"],
    enabled: !!user,
  });

  const mine = useMemo(() => (user ? buildRows(allOrders, user.id) : []), [allOrders, user]);

  const range = useMemo(() => {
    if (preset !== "custom") return presetRange(preset, new Date());
    const from = customFrom ? startOfDay(new Date(customFrom)) : null;
    const to = customTo ? endOfDay(new Date(customTo)) : null;
    return { from: from && !isNaN(+from) ? from : null, to: to && !isNaN(+to) ? to : null };
  }, [preset, customFrom, customTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = mine.filter((r) => {
      if (range.from && r.date < range.from) return false;
      if (range.to && r.date > range.to) return false;
      if (type === "sale" && (r.kind !== "sale" || r.exchange)) return false;
      if (type === "exchange" && !(r.kind === "sale" && r.exchange)) return false;
      if (type === "return" && r.kind !== "return") return false;
      if (method !== "all" && (r.kind !== "sale" || r.method !== method)) return false;
      if (q) {
        const inId = String(r.order.id).includes(q);
        const inItems = r.items.some((it: any) => String(it.name || "").toLowerCase().includes(q) || String(it.barcode || "").toLowerCase().includes(q));
        const inNote = String(r.note || "").toLowerCase().includes(q);
        if (!inId && !inItems && !inNote) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sort === "newest") return +b.date - +a.date;
      if (sort === "oldest") return +a.date - +b.date;
      if (sort === "highest") return Math.abs(b.amount) - Math.abs(a.amount);
      return Math.abs(a.amount) - Math.abs(b.amount);
    });
    return list;
  }, [mine, range, method, type, search, sort]);

  const stats = useMemo(() => {
    let sales = 0, cash = 0, card = 0, discount = 0, items = 0, returns = 0;
    let saleCount = 0, cashCount = 0, cardCount = 0, splitCount = 0, exchangeCount = 0, returnCount = 0, returnedQty = 0;
    for (const r of filtered) {
      if (r.kind === "sale") {
        sales += r.amount; cash += r.cash; card += r.card; discount += r.discount; items += r.qty; saleCount++;
        if (r.method === "cash") cashCount++; else if (r.method === "card") cardCount++; else splitCount++;
        if (r.exchange) exchangeCount++;
      } else {
        returns += -r.amount; returnCount++; returnedQty += r.qty;
      }
    }
    return { sales, cash, card, discount, items, returns, saleCount, cashCount, cardCount, splitCount, exchangeCount, returnCount, returnedQty, net: sales - returns, avg: saleCount ? sales / saleCount : 0 };
  }, [filtered]);

  const daily = useMemo(() => {
    const map = new Map<string, { date: string; count: number; items: number; cash: number; card: number; returns: number; total: number }>();
    for (const r of filtered) {
      const key = format(r.date, "yyyy-MM-dd");
      const row = map.get(key) || { date: key, count: 0, items: 0, cash: 0, card: 0, returns: 0, total: 0 };
      if (r.kind === "sale") { row.count++; row.items += r.qty; row.cash += r.cash; row.card += r.card; row.total += r.amount; }
      else { row.returns += -r.amount; row.total += r.amount; }
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [filtered]);

  const rangeLabel =
    preset === "all" || (preset === "custom" && !range.from && !range.to)
      ? (ar ? "كل الفترات" : "All time")
      : `${range.from ? format(range.from, "yyyy-MM-dd") : "…"} → ${range.to ? format(range.to, "yyyy-MM-dd") : "…"}`;

  const exportExcel = async () => {
    if (!user) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(ar ? "مبيعات الموظف" : "Employee sales");
    ws.addRow([ar ? "الموظف" : "Employee", user.fullName || user.email]);
    ws.addRow([ar ? "الفترة" : "Period", rangeLabel]);
    ws.addRow([]);
    ws.addRow([ar ? "عدد الفواتير" : "Invoices", stats.saleCount, ar ? "القطع المباعة" : "Items sold", stats.items]);
    ws.addRow([ar ? "نقدي" : "Cash", stats.cash.toFixed(2), ar ? "بطاقة (فيزا)" : "Card (Visa)", stats.card.toFixed(2)]);
    ws.addRow([ar ? "الخصومات" : "Discounts", stats.discount.toFixed(2), ar ? "المبيعات" : "Sales", stats.sales.toFixed(2)]);
    ws.addRow([ar ? "ترجيع" : "Returns", stats.returns.toFixed(2), ar ? "الصافي" : "Net", stats.net.toFixed(2)]);
    ws.addRow([]);
    ws.addRow(ar
      ? ["النوع", "رقم الفاتورة", "التاريخ", "الوقت", "طريقة الدفع", "القطع", "الخصم", "نقدي", "بطاقة", "المبلغ", "المنتجات", "ملاحظة"]
      : ["Type", "Invoice", "Date", "Time", "Payment", "Items", "Discount", "Cash", "Card", "Amount", "Products", "Note"]);
    for (const r of filtered) {
      ws.addRow([
        r.kind === "return" ? (ar ? "ترجيع" : "Return") : r.exchange ? (ar ? "تبديل" : "Exchange") : (ar ? "بيع" : "Sale"),
        r.order.id, format(r.date, "yyyy-MM-dd"), format(r.date, "hh:mm a"),
        r.kind === "sale" ? r.method : "", r.qty, r.discount.toFixed(2), r.cash.toFixed(2), r.card.toFixed(2), r.amount.toFixed(2),
        r.items.map((i: any) => `${i.name || i.productId}×${i.quantity}`).join(", "), r.note || "",
      ]);
    }
    ws.columns.forEach((c) => { c.width = 16; });
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-${(user.fullName || user.email).replace(/\s+/g, "_")}-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const methodColor = (m: "cash" | "card" | "split") =>
    m === "card" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      : m === "split" ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
        : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300";
  const methodLabel = (m: "cash" | "card" | "split") =>
    m === "card" ? (ar ? "بطاقة" : "Card") : m === "split" ? (ar ? "مختلط" : "Split") : (ar ? "نقدي" : "Cash");

  const typeTabs: { key: TypeFilter; label: string; count: number }[] = [
    { key: "all", label: ar ? "الكل" : "All", count: mine.length },
    { key: "sale", label: ar ? "بيع" : "Sales", count: mine.filter((r) => r.kind === "sale" && !r.exchange).length },
    { key: "exchange", label: ar ? "تبديل" : "Exchanges", count: mine.filter((r) => r.kind === "sale" && r.exchange).length },
    { key: "return", label: ar ? "ترجيع" : "Returns", count: mine.filter((r) => r.kind === "return").length },
  ];

  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-1rem)] sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="shrink-0 px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold truncate">{ar ? "مبيعات" : "Sales of"} {user?.fullName || user?.email}</p>
              <p className="text-xs text-muted-foreground font-normal">{user?.email}</p>
            </div>
            <button
              onClick={exportExcel}
              disabled={filtered.length === 0}
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted disabled:opacity-40"
              data-testid="button-export-employee-sales"
            >
              <Download className="w-3.5 h-3.5" />
              Excel
            </button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Type tabs */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/60 w-fit max-w-full overflow-x-auto">
            {typeTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setType(t.key)}
                className={`px-3.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${type === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                data-testid={`filter-type-${t.key}`}
              >
                {t.label}
                <span className={`ms-1.5 text-[10px] ltr-num ${type === t.key ? "text-muted-foreground" : "text-muted-foreground/70"}`}>{t.count}</span>
              </button>
            ))}
          </div>

          {/* Filters row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className={selectCls} data-testid="select-sales-period">
                <option value="today">{ar ? "اليوم" : "Today"}</option>
                <option value="yesterday">{ar ? "أمس" : "Yesterday"}</option>
                <option value="week">{ar ? "هذا الأسبوع" : "This week"}</option>
                <option value="month">{ar ? "هذا الشهر" : "This month"}</option>
                <option value="lastMonth">{ar ? "الشهر الماضي" : "Last month"}</option>
                <option value="all">{ar ? "كل الفترات" : "All time"}</option>
                <option value="custom">{ar ? "فترة مخصصة…" : "Custom…"}</option>
              </select>
            </div>
            {preset === "custom" && (
              <div className="flex items-center gap-1.5">
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-36 text-sm" data-testid="input-sales-from" />
                <span className="text-muted-foreground text-xs">→</span>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-36 text-sm" data-testid="input-sales-to" />
              </div>
            )}
            <select value={method} onChange={(e) => setMethod(e.target.value as MethodFilter)} className={selectCls} data-testid="select-sales-method">
              <option value="all">{ar ? "كل طرق الدفع" : "All payments"}</option>
              <option value="cash">{ar ? "نقدي" : "Cash"}</option>
              <option value="card">{ar ? "بطاقة (فيزا)" : "Card (Visa)"}</option>
              <option value="split">{ar ? "مختلط" : "Split"}</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={selectCls} data-testid="select-sales-sort">
              <option value="newest">{ar ? "الأحدث أولاً" : "Newest first"}</option>
              <option value="oldest">{ar ? "الأقدم أولاً" : "Oldest first"}</option>
              <option value="highest">{ar ? "الأعلى مبلغاً" : "Highest amount"}</option>
              <option value="lowest">{ar ? "الأقل مبلغاً" : "Lowest amount"}</option>
            </select>
            <div className="relative ms-auto">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={ar ? "رقم فاتورة / منتج / باركود" : "Invoice # / product / barcode"} className="h-9 ps-8 w-56 text-sm" data-testid="input-sales-search" />
              {search && <button onClick={() => setSearch("")} className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3 h-3" /></button>}
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Stat label={ar ? "الصافي" : "Net"} value={money(stats.net)} sub={stats.returns > 0 ? `${money(stats.sales)} − ${money(stats.returns)}` : undefined} strong />
            <Stat label={ar ? "نقدي" : "Cash"} value={money(stats.cash)} sub={`${stats.cashCount} ${ar ? "فاتورة" : "inv."}`} tone="green" />
            <Stat label={ar ? "بطاقة (فيزا)" : "Card (Visa)"} value={money(stats.card)} sub={`${stats.cardCount} ${ar ? "فاتورة" : "inv."}${stats.splitCount ? ` · ${stats.splitCount} ${ar ? "مختلط" : "split"}` : ""}`} tone="blue" />
            <Stat label={ar ? "ترجيع" : "Returns"} value={money(stats.returns)} sub={`${stats.returnCount} ${ar ? "عملية" : "ops"} · ${stats.returnedQty} ${ar ? "قطعة" : "items"}`} tone={stats.returns > 0 ? "red" : undefined} />
            <Stat label={ar ? "فواتير · قطع" : "Invoices · items"} value={`${stats.saleCount} · ${stats.items}`} sub={stats.exchangeCount ? `${stats.exchangeCount} ${ar ? "تبديل" : "exchange"}` : undefined} />
            <Stat label={ar ? "خصومات · متوسط" : "Discounts · avg"} value={money(stats.discount)} sub={money(stats.avg)} tone={stats.discount > 0 ? "red" : undefined} />
          </div>

          {/* Daily breakdown */}
          {daily.length > 1 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <button onClick={() => setShowDaily((s) => !s)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold bg-muted/40 hover:bg-muted/70">
                <span>{ar ? "ملخص يومي" : "Daily summary"} · {daily.length} {ar ? "يوم" : "days"}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showDaily ? "rotate-180" : ""}`} />
              </button>
              {showDaily && (
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-background border-b border-border text-muted-foreground">
                      <tr>
                        <th className="text-start px-3 py-1.5 font-medium">{ar ? "اليوم" : "Day"}</th>
                        <th className="text-center px-2 py-1.5 font-medium">{ar ? "فواتير" : "Inv."}</th>
                        <th className="text-center px-2 py-1.5 font-medium">{ar ? "قطع" : "Items"}</th>
                        <th className="text-end px-2 py-1.5 font-medium">{ar ? "نقدي" : "Cash"}</th>
                        <th className="text-end px-2 py-1.5 font-medium">{ar ? "بطاقة" : "Card"}</th>
                        <th className="text-end px-2 py-1.5 font-medium">{ar ? "ترجيع" : "Returns"}</th>
                        <th className="text-end px-3 py-1.5 font-medium">{ar ? "الصافي" : "Net"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daily.map((d) => (
                        <tr key={d.date} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-1.5 ltr-num">{d.date}</td>
                          <td className="px-2 py-1.5 text-center ltr-num">{d.count}</td>
                          <td className="px-2 py-1.5 text-center ltr-num">{d.items}</td>
                          <td className="px-2 py-1.5 text-end ltr-num text-green-700 dark:text-green-400">{money(d.cash)}</td>
                          <td className="px-2 py-1.5 text-end ltr-num text-blue-700 dark:text-blue-400">{money(d.card)}</td>
                          <td className="px-2 py-1.5 text-end ltr-num text-red-600 dark:text-red-400">{d.returns > 0 ? `-${money(d.returns)}` : "—"}</td>
                          <td className="px-3 py-1.5 text-end ltr-num font-semibold">{money(d.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Ledger */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {filtered.length} {ar ? "عملية" : "records"} · <span className="font-normal ltr-num">{rangeLabel}</span>
            </p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">{ar ? "جارٍ التحميل..." : "Loading..."}</p>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{mine.length === 0 ? (ar ? "لا توجد عمليات مسجّلة لهذا الموظف بعد" : "No activity recorded for this employee yet") : (ar ? "لا توجد نتائج تطابق الفلاتر" : "Nothing matches the filters")}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((r) => {
                  const open = expanded === r.key;
                  const isReturn = r.kind === "return";
                  return (
                    <div key={r.key} className={`border rounded-lg overflow-hidden ${isReturn ? "border-red-200 dark:border-red-900/60" : "border-border"}`} data-testid={`employee-${r.kind}-${r.order.id}`}>
                      <button onClick={() => setExpanded(open ? null : r.key)} className={`w-full flex items-center gap-3 px-3 py-2.5 text-start ${isReturn ? "bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-950/20" : "hover:bg-muted/40"}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isReturn ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : methodColor(r.method)}`}>
                          {isReturn ? <Undo2 className="w-3.5 h-3.5" /> : r.method === "card" ? <CreditCard className="w-3.5 h-3.5" /> : r.method === "split" ? <Split className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold ltr-num">#{r.order.id}</span>
                            {isReturn ? (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">{ar ? "ترجيع" : "Return"}</span>
                            ) : (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${methodColor(r.method)}`}>{methodLabel(r.method)}</span>
                            )}
                            {r.exchange && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><ArrowLeftRight className="w-2.5 h-2.5" />{ar ? "تبديل" : "Exchange"}</span>
                            )}
                            {r.discount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Tag className="w-2.5 h-2.5" />-{money(r.discount)}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground ltr-num">· {format(r.date, "yyyy-MM-dd · hh:mm a")}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {r.qty} {ar ? "قطعة" : "items"}{r.items.length > 0 && ` · ${r.items.slice(0, 3).map((it: any) => it.name || `#${it.productId}`).join("، ")}${r.items.length > 3 ? "…" : ""}`}
                          </p>
                        </div>
                        <div className="text-end shrink-0">
                          <p className={`text-sm font-bold ltr-num ${isReturn ? "text-red-600 dark:text-red-400" : ""}`}>{isReturn ? "-" : ""}{money(Math.abs(r.amount))}</p>
                          {r.method === "split" && !isReturn && <p className="text-[9px] text-muted-foreground ltr-num">{money(r.cash)} + {money(r.card)}</p>}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>
                      {open && (
                        <div className="border-t border-border bg-muted/20 px-3 py-2">
                          <table className="w-full text-xs">
                            <tbody>
                              {r.items.map((it: any, i: number) => (
                                <tr key={i} className="border-b border-border/50 last:border-0">
                                  <td className="py-1.5 pe-2">
                                    {it.name || `#${it.productId}`}
                                    {(it.size || it.color) && <span className="text-muted-foreground"> · {[it.size, it.color].filter(Boolean).join(" · ")}</span>}
                                  </td>
                                  <td className="py-1.5 px-2 text-center ltr-num text-muted-foreground">×{it.quantity}</td>
                                  <td className="py-1.5 ps-2 text-end ltr-num font-medium">{money((parseFloat(it.price || 0) || 0) * (it.quantity || 1))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                            {isReturn ? (
                              <span>{ar ? "قيمة المرتجع" : "Refund value"}: <b className="text-red-600 ltr-num">-{money(Math.abs(r.amount))}</b></span>
                            ) : (
                              <>
                                {r.discount > 0 && <span>{ar ? "خصم" : "Discount"}: <b className="text-amber-700 ltr-num">-{money(r.discount)}</b></span>}
                                <span>{ar ? "نقدي" : "Cash"}: <b className="ltr-num">{money(r.cash)}</b></span>
                                <span>{ar ? "بطاقة" : "Card"}: <b className="ltr-num">{money(r.card)}</b></span>
                                <span>{ar ? "الإجمالي" : "Total"}: <b className="text-foreground ltr-num">{money(r.amount)}</b></span>
                              </>
                            )}
                          </div>
                          {r.note && <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1 whitespace-pre-wrap">{r.note}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, sub, tone, strong }: { label: string; value: string; sub?: string; tone?: "green" | "blue" | "purple" | "red"; strong?: boolean }) {
  const toneCls =
    tone === "green" ? "text-green-700 dark:text-green-400"
      : tone === "blue" ? "text-blue-700 dark:text-blue-400"
        : tone === "purple" ? "text-purple-700 dark:text-purple-400"
          : tone === "red" ? "text-red-600 dark:text-red-400"
            : "text-foreground";
  return (
    <div className={`rounded-lg border px-3 py-2 ${strong ? "border-foreground/30 bg-foreground/5" : "border-border bg-muted/20"}`}>
      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      <p className={`text-base font-bold ltr-num leading-tight ${toneCls}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground ltr-num mt-0.5">{sub}</p>}
    </div>
  );
}
