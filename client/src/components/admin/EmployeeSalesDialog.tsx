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

/* ── Filters ─────────────────────────────────────────────────────────── */
type Preset = "today" | "yesterday" | "week" | "month" | "lastMonth" | "all" | "custom";
type MethodFilter = "all" | "cash" | "card" | "split";
type TypeFilter = "all" | "sale" | "exchange";
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
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showDaily, setShowDaily] = useState(true);

  const { data: allOrders = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/pos/orders"],
    enabled: !!user,
  });

  // Everything this employee ever sold (no filters) — used for the header.
  const mine = useMemo(
    () => (user ? allOrders.filter((o) => sellerIdOf(o) === user.id) : []),
    [allOrders, user],
  );

  const range = useMemo(() => {
    if (preset !== "custom") return presetRange(preset, new Date());
    const from = customFrom ? startOfDay(new Date(customFrom)) : null;
    const to = customTo ? endOfDay(new Date(customTo)) : null;
    return { from: from && !isNaN(+from) ? from : null, to: to && !isNaN(+to) ? to : null };
  }, [preset, customFrom, customTo]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = mine.filter((o) => {
      const d = orderDate(o);
      if (range.from && d < range.from) return false;
      if (range.to && d > range.to) return false;
      if (method !== "all" && orderMethod(o) !== method) return false;
      if (type === "sale" && isExchange(o)) return false;
      if (type === "exchange" && !isExchange(o)) return false;
      if (q) {
        const inId = String(o.id).includes(q);
        const inItems = (o.items || []).some((it: any) => String(it.name || "").toLowerCase().includes(q) || String(it.barcode || "").toLowerCase().includes(q));
        const inNote = String(o.note || "").toLowerCase().includes(q);
        if (!inId && !inItems && !inNote) return false;
      }
      return true;
    });
    list.sort((a, b) => {
      if (sort === "newest") return +orderDate(b) - +orderDate(a);
      if (sort === "oldest") return +orderDate(a) - +orderDate(b);
      if (sort === "highest") return orderTotal(b) - orderTotal(a);
      return orderTotal(a) - orderTotal(b);
    });
    return list;
  }, [mine, range, method, type, search, sort]);

  const stats = useMemo(() => {
    let total = 0, cash = 0, card = 0, discount = 0, items = 0;
    let cashCount = 0, cardCount = 0, splitCount = 0, exchangeCount = 0;
    for (const o of filtered) {
      const s = orderSplit(o);
      total += orderTotal(o);
      cash += s.cash;
      card += s.card;
      discount += orderDiscount(o);
      items += orderQty(o);
      const m = orderMethod(o);
      if (m === "cash") cashCount++; else if (m === "card") cardCount++; else splitCount++;
      if (isExchange(o)) exchangeCount++;
    }
    const count = filtered.length;
    return { total, cash, card, discount, items, count, cashCount, cardCount, splitCount, exchangeCount, avg: count ? total / count : 0 };
  }, [filtered]);

  const daily = useMemo(() => {
    const map = new Map<string, { date: string; count: number; items: number; cash: number; card: number; total: number }>();
    for (const o of filtered) {
      const key = format(orderDate(o), "yyyy-MM-dd");
      const row = map.get(key) || { date: key, count: 0, items: 0, cash: 0, card: 0, total: 0 };
      const s = orderSplit(o);
      row.count++; row.items += orderQty(o); row.cash += s.cash; row.card += s.card; row.total += orderTotal(o);
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [filtered]);

  const exportExcel = async () => {
    if (!user) return;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(ar ? "مبيعات الموظف" : "Employee sales");
    ws.addRow([ar ? "الموظف" : "Employee", user.fullName || user.email]);
    ws.addRow([ar ? "الفترة" : "Period", rangeLabel]);
    ws.addRow([]);
    ws.addRow([ar ? "عدد الفواتير" : "Invoices", stats.count, ar ? "القطع" : "Items", stats.items]);
    ws.addRow([ar ? "نقدي" : "Cash", stats.cash.toFixed(2), ar ? "بطاقة (فيزا)" : "Card (Visa)", stats.card.toFixed(2)]);
    ws.addRow([ar ? "الخصومات" : "Discounts", stats.discount.toFixed(2), ar ? "الإجمالي" : "Total", stats.total.toFixed(2)]);
    ws.addRow([]);
    ws.addRow(ar
      ? ["رقم الفاتورة", "التاريخ", "الوقت", "النوع", "طريقة الدفع", "القطع", "المجموع الفرعي", "الخصم", "نقدي", "بطاقة", "الإجمالي", "المنتجات", "ملاحظة"]
      : ["Invoice", "Date", "Time", "Type", "Payment", "Items", "Subtotal", "Discount", "Cash", "Card", "Total", "Products", "Note"]);
    for (const o of filtered) {
      const d = orderDate(o); const s = orderSplit(o);
      ws.addRow([
        o.id, format(d, "yyyy-MM-dd"), format(d, "hh:mm a"),
        isExchange(o) ? (ar ? "تبديل" : "Exchange") : (ar ? "بيع" : "Sale"),
        orderMethod(o), orderQty(o),
        (orderTotal(o) + orderDiscount(o)).toFixed(2), orderDiscount(o).toFixed(2),
        s.cash.toFixed(2), s.card.toFixed(2), orderTotal(o).toFixed(2),
        (o.items || []).map((i: any) => `${i.name}×${i.quantity}`).join(", "),
        o.note || "",
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

  const presets: { key: Preset; ar: string; en: string }[] = [
    { key: "today", ar: "اليوم", en: "Today" },
    { key: "yesterday", ar: "أمس", en: "Yesterday" },
    { key: "week", ar: "هذا الأسبوع", en: "This week" },
    { key: "month", ar: "هذا الشهر", en: "This month" },
    { key: "lastMonth", ar: "الشهر الماضي", en: "Last month" },
    { key: "all", ar: "الكل", en: "All time" },
    { key: "custom", ar: "فترة مخصصة", en: "Custom" },
  ];
  const rangeLabel =
    preset === "all" ? (ar ? "كل الفترات" : "All time")
      : `${range.from ? format(range.from, "yyyy-MM-dd") : "…"} → ${range.to ? format(range.to, "yyyy-MM-dd") : "…"}`;

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:border-foreground/40"}`;

  const MethodIcon = ({ m }: { m: "cash" | "card" | "split" }) =>
    m === "card" ? <CreditCard className="w-3.5 h-3.5" /> : m === "split" ? <Split className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />;
  const methodColor = (m: "cash" | "card" | "split") =>
    m === "card" ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      : m === "split" ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
        : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300";
  const methodLabel = (m: "cash" | "card" | "split") =>
    m === "card" ? (ar ? "بطاقة" : "Card") : m === "split" ? (ar ? "مختلط" : "Split") : (ar ? "نقدي" : "Cash");

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
              <p className="text-xs text-muted-foreground font-normal">
                {user?.email} · {mine.length} {ar ? "فاتورة إجمالاً" : "invoices overall"}
              </p>
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
          {/* Filters */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground me-1" />
              {presets.map((p) => (
                <button key={p.key} onClick={() => setPreset(p.key)} className={chip(preset === p.key)} data-testid={`filter-preset-${p.key}`}>
                  {ar ? p.ar : p.en}
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">{ar ? "من" : "From"}</span>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-40 text-xs" data-testid="input-sales-from" />
                <span className="text-muted-foreground">{ar ? "إلى" : "To"}</span>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-40 text-xs" data-testid="input-sales-to" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1.5">
                {(["all", "cash", "card", "split"] as MethodFilter[]).map((m) => (
                  <button key={m} onClick={() => setMethod(m)} className={chip(method === m)} data-testid={`filter-method-${m}`}>
                    {m === "all" ? (ar ? "كل طرق الدفع" : "All payments") : methodLabel(m)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                {(["all", "sale", "exchange"] as TypeFilter[]).map((t) => (
                  <button key={t} onClick={() => setType(t)} className={chip(type === t)} data-testid={`filter-type-${t}`}>
                    {t === "all" ? (ar ? "بيع + تبديل" : "Sales + exchanges") : t === "sale" ? (ar ? "بيع فقط" : "Sales only") : (ar ? "تبديل فقط" : "Exchanges only")}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 ms-auto">
                <div className="relative">
                  <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={ar ? "رقم فاتورة / منتج / باركود" : "Invoice # / product / barcode"} className="h-8 ps-8 w-56 text-xs" data-testid="input-sales-search" />
                  {search && <button onClick={() => setSearch("")} className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3 h-3" /></button>}
                </div>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-8 text-xs rounded-md border border-border bg-background px-2" data-testid="select-sales-sort">
                  <option value="newest">{ar ? "الأحدث أولاً" : "Newest first"}</option>
                  <option value="oldest">{ar ? "الأقدم أولاً" : "Oldest first"}</option>
                  <option value="highest">{ar ? "الأعلى قيمة" : "Highest amount"}</option>
                  <option value="lowest">{ar ? "الأقل قيمة" : "Lowest amount"}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Stat label={ar ? "الإجمالي" : "Total sales"} value={money(stats.total)} strong />
            <Stat label={ar ? "نقدي" : "Cash"} value={money(stats.cash)} sub={`${stats.cashCount} ${ar ? "فاتورة" : "inv."}`} tone="green" />
            <Stat label={ar ? "بطاقة (فيزا)" : "Card (Visa)"} value={money(stats.card)} sub={`${stats.cardCount} ${ar ? "فاتورة" : "inv."}`} tone="blue" />
            <Stat label={ar ? "مختلط" : "Split"} value={String(stats.splitCount)} sub={ar ? "فاتورة" : "invoices"} tone="purple" />
            <Stat label={ar ? "الفواتير / القطع" : "Invoices / items"} value={`${stats.count} / ${stats.items}`} sub={stats.exchangeCount ? `${stats.exchangeCount} ${ar ? "تبديل" : "exchange"}` : undefined} />
            <Stat label={ar ? "الخصومات · متوسط الفاتورة" : "Discounts · avg invoice"} value={money(stats.discount)} sub={money(stats.avg)} tone={stats.discount > 0 ? "red" : undefined} />
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
                        <th className="text-end px-3 py-1.5 font-medium">{ar ? "الإجمالي" : "Total"}</th>
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
                          <td className="px-3 py-1.5 text-end ltr-num font-semibold">{money(d.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Invoice list */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              {ar ? "الفواتير" : "Invoices"} · {filtered.length} · <span className="font-normal ltr-num">{rangeLabel}</span>
            </p>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">{ar ? "جارٍ التحميل..." : "Loading..."}</p>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">
                <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">{mine.length === 0 ? (ar ? "لا توجد مبيعات مسجّلة لهذا الموظف بعد" : "No sales recorded for this employee yet") : (ar ? "لا توجد فواتير تطابق الفلاتر" : "No invoices match the filters")}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((o) => {
                  const m = orderMethod(o); const s = orderSplit(o); const d = orderDate(o);
                  const discount = orderDiscount(o); const total = orderTotal(o);
                  const open = expanded === o.id; const items = o.items || [];
                  return (
                    <div key={o.id} className="border border-border rounded-lg overflow-hidden" data-testid={`employee-sale-${o.id}`}>
                      <button onClick={() => setExpanded(open ? null : o.id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-start hover:bg-muted/40">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${methodColor(m)}`}><MethodIcon m={m} /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold ltr-num">#{o.id}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${methodColor(m)}`}>{methodLabel(m)}</span>
                            {isExchange(o) && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"><ArrowLeftRight className="w-2.5 h-2.5" />{ar ? "تبديل" : "Exchange"}</span>
                            )}
                            {discount > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"><Tag className="w-2.5 h-2.5" />-{money(discount)}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground ltr-num">· {format(d, "yyyy-MM-dd · hh:mm a")}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                            {orderQty(o)} {ar ? "قطعة" : "items"}{items.length > 0 && ` · ${items.slice(0, 3).map((it: any) => it.name).join("، ")}${items.length > 3 ? "…" : ""}`}
                          </p>
                        </div>
                        <div className="text-end shrink-0">
                          <p className="text-sm font-bold ltr-num">{money(total)}</p>
                          {m === "split" && <p className="text-[9px] text-muted-foreground ltr-num">{money(s.cash)} + {money(s.card)}</p>}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>
                      {open && (
                        <div className="border-t border-border bg-muted/20 px-3 py-2">
                          <table className="w-full text-xs">
                            <tbody>
                              {items.map((it: any, i: number) => (
                                <tr key={i} className="border-b border-border/50 last:border-0">
                                  <td className="py-1.5 pe-2">
                                    {it.name}
                                    {(it.size || it.color) && <span className="text-muted-foreground"> · {[it.size, it.color].filter(Boolean).join(" · ")}</span>}
                                  </td>
                                  <td className="py-1.5 px-2 text-center ltr-num text-muted-foreground">×{it.quantity}</td>
                                  <td className="py-1.5 ps-2 text-end ltr-num font-medium">{money((parseFloat(it.price || 0) || 0) * (it.quantity || 1))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                            {discount > 0 && <span>{ar ? "خصم" : "Discount"}: <b className="text-red-600 ltr-num">-{money(discount)}</b></span>}
                            <span>{ar ? "نقدي" : "Cash"}: <b className="ltr-num">{money(s.cash)}</b></span>
                            <span>{ar ? "بطاقة" : "Card"}: <b className="ltr-num">{money(s.card)}</b></span>
                            <span>{ar ? "الإجمالي" : "Total"}: <b className="text-foreground ltr-num">{money(total)}</b></span>
                          </div>
                          {o.note && <p className="mt-2 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1 whitespace-pre-wrap">{o.note}</p>}
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
