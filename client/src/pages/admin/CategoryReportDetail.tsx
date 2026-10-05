import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet, ArrowLeft, ArrowRight, Banknote, CreditCard, Warehouse, Package, Trophy, Layers, TrendingUp,
  CheckCircle2, AlertTriangle, ShoppingBag, Search, RefreshCw, BarChart2,
} from "lucide-react";
import { ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  type CategoryDetailData, StatCard, Panel, RulesBox, MonthSelect, ChannelTable, ChartTooltipBox, SortTh, useSort, sortRows,
  fmtMoney, fmtInt, fmtPct, pctOf, monthLabel, dayLabel, C,
} from "@/components/admin/reports";
import { useLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";

type ProdSortKey = "name" | "price" | "stock" | "value" | "capital" | "web" | "pos" | "sold" | "sales" | "profit";

export default function CategoryReportDetail() {
  const params = useParams<{ id: string }>();
  const categoryId = params.id;
  const { language } = useLanguage();
  const isAr = language === "ar";
  const BackArrow = isAr ? ArrowRight : ArrowLeft;
  const [month, setMonth] = useState("");
  const [search, setSearch] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const sort = useSort<ProdSortKey>("capital");

  const { data, isLoading, isFetching, error, refetch } = useQuery<CategoryDetailData>({
    queryKey: [`/api/admin/category-report/${categoryId}`, month],
    queryFn: async () => {
      const url = `/api/admin/category-report/${categoryId}${month ? `?month=${month}` : ""}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        let detail = "";
        try { detail = (await res.json())?.message || ""; } catch {}
        throw new Error(detail || "Failed to load category report");
      }
      return res.json();
    },
    enabled: !!categoryId,
    staleTime: 0,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });

  const subNameById = useMemo(() => {
    const m = new Map<number, string>();
    data?.subcategories.forEach((s) => { if (s.id != null) m.set(s.id, isAr ? s.nameAr || s.name : s.name); });
    return m;
  }, [data, isAr]);

  const productRows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const rows = data.products
      .filter((p) => (onlyInStock ? p.stock > 0 : true))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q))
      .map((p) => ({ ...p, web: p.webUnits, pos: p.posUnits, sold: p.soldUnits, value: p.sellingValue }));
    return sortRows(rows, (r) => r[sort.key], sort.dir);
  }, [data, search, onlyInStock, sort.key, sort.dir]);

  const backLink = (
    <Link href="/admin/reports/categories" data-testid="link-back-category-reports">
      <Button variant="outline" size="sm" className="gap-1.5 h-9">
        <BackArrow className="w-4 h-4" />
        {isAr ? "رأس المال" : "Capital"}
      </Button>
    </Link>
  );

  if (isLoading) {
    return (
      <AdminLayout>
        <AdminPageHeader title="…" icon={Wallet} iconGradient="from-amber-500 to-orange-600" actions={backLink} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="h-80 bg-muted animate-pulse rounded-xl" />
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <AdminPageHeader title={isAr ? "تقرير الفئة" : "Category report"} icon={Wallet} iconGradient="from-amber-500 to-orange-600" actions={backLink} />
        <div className="text-destructive p-6">
          <p>{isAr ? "فشل تحميل بيانات الفئة" : "Failed to load category report."}</p>
          {error instanceof Error && error.message && <p className="text-xs text-muted-foreground mt-2" dir="ltr">{error.message}</p>}
        </div>
      </AdminLayout>
    );
  }

  const { category, inventory: inv, totals } = data;
  const { web, pos, all } = totals;
  const pct = Math.round(data.costRatio * 100);
  const periodLabel = month ? monthLabel(month, isAr) : (isAr ? "كل الفترات" : "All time");
  const name = isAr ? category.nameAr || category.name : category.name;

  const monthlyData = data.monthly.map((m) => ({ ...m, label: monthLabel(m.month, isAr, "MMM yy") }));
  const dailyData = data.daily.map((d) => ({ ...d, label: dayLabel(d.day, isAr) }));
  const weeklyData = data.weeklyPayment.map((w) => ({ ...w, label: dayLabel(w.week, isAr) }));
  const hasDaily = dailyData.some((d) => d.web > 0 || d.pos > 0);
  const hasWeekly = weeklyData.some((w) => w.webCash + w.webCard + w.posCash + w.posCard > 0);

  const subTotals = data.subcategories.reduce(
    (s, r) => ({ products: s.products + r.productCount, units: s.units + r.stockUnits, value: s.value + r.sellingValue, capital: s.capital + r.capital, web: s.web + r.webSales, pos: s.pos + r.posSales, sold: s.sold + r.units, sales: s.sales + r.sales, profit: s.profit + r.profit }),
    { products: 0, units: 0, value: 0, capital: 0, web: 0, pos: 0, sold: 0, sales: 0, profit: 0 },
  );

  return (
    <AdminLayout>
      <AdminPageHeader
        title={name}
        description={isAr ? "رأس المال والمخزون والمبيعات والأرباح لهذه الفئة بالتفصيل" : "Capital, stock, sales and profit for this category in detail"}
        icon={Wallet}
        iconGradient="from-amber-500 to-orange-600"
        testId="text-category-report-title"
        actions={
          <>
            {backLink}
            <MonthSelect value={month} onChange={setMonth} months={data.availableMonths} isAr={isAr} testId="select-category-month" allLabel={isAr ? "كل الفترات" : "All time"} />
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
              {isAr ? "تحديث" : "Refresh"}
            </Button>
          </>
        }
      />

      <RulesBox isAr={isAr} costRatio={data.costRatio} />

      {/* ── Stock ── */}
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><Warehouse className="w-4 h-4" />{isAr ? "المخزون الحالي" : "Stock right now"}</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-3">
        <StatCard big tone="amber" icon={Wallet} label={isAr ? `رأس المال (${pct}%)` : `Capital (${pct}%)`} value={fmtMoney(inv.capital)} testId="card-capital" />
        <StatCard tone="emerald" icon={ShoppingBag} label={isAr ? "قيمة المخزون (سعر البيع)" : "Stock value (selling price)"} value={fmtMoney(inv.sellingValue)} testId="card-inventory-value" />
        <StatCard tone="teal" icon={Banknote} label={isAr ? "الربح المتوقع من المخزون" : "Expected profit from stock"} value={fmtMoney(inv.expectedProfit)} />
        <StatCard tone="sky" icon={Layers} label={isAr ? "القطع في المخزن" : "Units in stock"} value={fmtInt(inv.totalUnits)} sub={isAr ? `متوسط السعر ${fmtMoney(inv.avgPrice)}` : `Average price ${fmtMoney(inv.avgPrice)}`} />
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard tone="slate" icon={Package} label={isAr ? "المنتجات" : "Products"} value={fmtInt(inv.productCount)} testId="card-product-count" />
        <StatCard tone="teal" icon={CheckCircle2} label={isAr ? "متوفر" : "In stock"} value={fmtInt(inv.inStockCount)} sub={fmtPct(pctOf(inv.inStockCount, inv.productCount))} />
        <StatCard tone="rose" icon={AlertTriangle} label={isAr ? "نفذ" : "Out of stock"} value={fmtInt(inv.outOfStockCount)} sub={fmtPct(pctOf(inv.outOfStockCount, inv.productCount))} />
      </div>

      {/* ── Sales ── */}
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><TrendingUp className="w-4 h-4" />{isAr ? "المبيعات والأرباح" : "Sales & profit"} — {periodLabel}</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard big tone="blue" icon={TrendingUp} label={isAr ? "صافي المبيعات" : "Net sales"} value={fmtMoney(all.sales)}
          sub={isAr ? `موقع ${fmtMoney(web.sales)} · نقطة بيع ${fmtMoney(pos.sales)}` : `Website ${fmtMoney(web.sales)} · POS ${fmtMoney(pos.sales)}`} />
        <StatCard big tone="emerald" icon={Banknote} label={isAr ? "الأرباح" : "Profit"} value={fmtMoney(all.profit)}
          sub={isAr ? `${fmtPct(pctOf(all.profit, all.sales))} من المبيعات` : `${fmtPct(pctOf(all.profit, all.sales))} of sales`} />
        <StatCard tone="violet" icon={ShoppingBag} label={isAr ? "الطلبات / الفواتير" : "Orders / invoices"} value={fmtInt(all.orders)} />
        <StatCard tone="sky" icon={Package} label={isAr ? "القطع المباعة" : "Units sold"} value={fmtInt(all.units)}
          sub={all.discounts > 0 ? (isAr ? `خصومات ${fmtMoney(all.discounts)}` : `Discounts ${fmtMoney(all.discounts)}`) : undefined} />
      </div>

      <Panel icon={BarChart2} title={isAr ? "الموقع مقابل نقطة البيع" : "Website vs POS"} subtitle={periodLabel}>
        <ChannelTable totals={totals} isAr={isAr} />
      </Panel>

      {/* ── Sub-categories ── */}
      <Panel icon={Layers} title={isAr ? "الفئات الفرعية" : "Sub-categories"} subtitle={isAr ? "مجموعها يساوي مجموع الفئة" : "These add up to the category total"}>
        {data.subcategories.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد فئات فرعية" : "No sub-categories"}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-start py-2 px-3 font-medium">{isAr ? "الفئة الفرعية" : "Sub-category"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "المنتجات" : "Products"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "القطع بالمخزن" : "Stock units"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "قيمة المخزون" : "Stock value"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "رأس المال" : "Capital"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "مبيعات الموقع" : "Website sales"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "مبيعات نقطة البيع" : "POS sales"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "القطع المباعة" : "Sold"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "المبيعات" : "Sales"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "الأرباح" : "Profit"}</th>
                </tr>
              </thead>
              <tbody>
                {data.subcategories.map((s) => (
                  <tr key={s.id ?? "none"} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2.5 px-3 font-medium">
                      {isAr ? s.nameAr || s.name : s.name}
                      {!s.isActive && <span className="ms-2 text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{isAr ? "معطّلة" : "inactive"}</span>}
                    </td>
                    <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtInt(s.productCount)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtInt(s.stockUnits)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">{fmtMoney(s.sellingValue)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums font-semibold text-amber-600 dark:text-amber-400" dir="ltr">{fmtMoney(s.capital)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums text-violet-600 dark:text-violet-400" dir="ltr">{fmtMoney(s.webSales)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums text-pink-600 dark:text-pink-400" dir="ltr">{fmtMoney(s.posSales)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtInt(s.units)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums font-semibold" dir="ltr">{fmtMoney(s.sales)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums font-semibold text-emerald-600 dark:text-emerald-400" dir="ltr">{fmtMoney(s.profit)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-bold border-t-2 border-border">
                  <td className="py-2.5 px-3">{isAr ? "المجموع" : "Total"}</td>
                  <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtInt(subTotals.products)}</td>
                  <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtInt(subTotals.units)}</td>
                  <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(subTotals.value)}</td>
                  <td className="py-2.5 px-3 text-end tabular-nums text-amber-600 dark:text-amber-400" dir="ltr">{fmtMoney(subTotals.capital)}</td>
                  <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(subTotals.web)}</td>
                  <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(subTotals.pos)}</td>
                  <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtInt(subTotals.sold)}</td>
                  <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(subTotals.sales)}</td>
                  <td className="py-2.5 px-3 text-end tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">{fmtMoney(subTotals.profit)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── Charts ── */}
      <Panel icon={TrendingUp} title={isAr ? "المبيعات والأرباح الشهرية" : "Monthly sales & profit"} subtitle={isAr ? "آخر ١٢ شهراً" : "Last 12 months"}>
        <div dir="ltr">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} width={64} />
              <Tooltip content={<ChartTooltipBox isAr={isAr} />} />
              <Legend />
              <Bar dataKey="web" stackId="s" fill={C.web} name={isAr ? "الموقع" : "Website"}>
                {monthlyData.map((m) => <Cell key={m.month} fill={C.web} fillOpacity={!month || month === m.month ? 1 : 0.3} />)}
              </Bar>
              <Bar dataKey="pos" stackId="s" fill={C.pos} name={isAr ? "نقطة البيع" : "POS"} radius={[4, 4, 0, 0]}>
                {monthlyData.map((m) => <Cell key={m.month} fill={C.pos} fillOpacity={!month || month === m.month ? 1 : 0.3} />)}
              </Bar>
              <Line type="monotone" dataKey="profit" stroke={C.profit} strokeWidth={2.5} dot={{ r: 3 }} name={isAr ? "الأرباح" : "Profit"} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {hasDaily && (
        <Panel icon={BarChart2} title={isAr ? "المبيعات اليومية" : "Daily sales"} subtitle={isAr ? "آخر ٣٠ يوماً" : "Last 30 days"}>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={dailyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" minTickGap={18} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} width={64} />
                <Tooltip content={<ChartTooltipBox isAr={isAr} />} />
                <Legend />
                <Bar dataKey="web" stackId="d" fill={C.web} name={isAr ? "الموقع" : "Website"} />
                <Bar dataKey="pos" stackId="d" fill={C.pos} name={isAr ? "نقطة البيع" : "POS"} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="profit" stroke={C.profit} strokeWidth={2} dot={false} name={isAr ? "الأرباح" : "Profit"} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {hasWeekly && (
        <Panel icon={CreditCard} title={isAr ? "طريقة الدفع أسبوعياً" : "Payment method by week"} subtitle={isAr ? "آخر ١٢ أسبوعاً (يبدأ الأسبوع يوم الاثنين)" : "Last 12 weeks (weeks start on Monday)"}>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weeklyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} width={64} />
                <Tooltip content={<ChartTooltipBox isAr={isAr} />} />
                <Legend />
                <Bar dataKey="webCash" stackId="p" fill="#0d9488" name={isAr ? "الموقع — عند التسليم" : "Website — cash"} />
                <Bar dataKey="webCard" stackId="p" fill="#0284c7" name={isAr ? "الموقع — بطاقة" : "Website — card"} />
                <Bar dataKey="posCash" stackId="p" fill="#d97706" name={isAr ? "نقطة البيع — نقدي" : "POS — cash"} />
                <Bar dataKey="posCard" stackId="p" fill="#db2777" name={isAr ? "نقطة البيع — بطاقة" : "POS — card"} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {/* ── Best sellers ── */}
      {data.bestSellers.length > 0 && (
        <Panel icon={Trophy} title={isAr ? "الأكثر مبيعاً" : "Best sellers"} subtitle={periodLabel}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.bestSellers.slice(0, 6).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <span className="text-sm font-semibold text-muted-foreground w-5 text-center">{i + 1}</span>
                <div className="w-12 h-12 rounded-md bg-muted overflow-hidden shrink-0">
                  {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">{fmtInt(p.soldUnits)} {isAr ? "قطعة" : "units"} · {fmtMoney(p.sales)}</p>
                </div>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums" dir="ltr">{fmtMoney(p.profit)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ── Products ── */}
      <Panel
        icon={Package}
        title={isAr ? "كل منتجات الفئة" : "All products in this category"}
        subtitle={isAr ? "المخزون الحالي ورأس المال + مبيعات الفترة المختارة" : "Current stock and capital + sales for the selected period"}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={onlyInStock} onChange={(e) => setOnlyInStock(e.target.checked)} className="rounded" />
              {isAr ? "المتوفر فقط" : "In stock only"}
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isAr ? "بحث بالاسم أو الباركود" : "Search name or barcode"}
                className="h-9 w-52 rounded-md border border-border bg-background ps-8 pe-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="input-search-products"
              />
            </div>
          </div>
        }
      >
        {productRows.length === 0 ? (
          <div className="text-center text-muted-foreground py-10 text-sm">{isAr ? "لا توجد منتجات" : "No products"}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <SortTh label={isAr ? "المنتج" : "Product"} k="name" sort={sort} align="start" />
                  <SortTh label={isAr ? "السعر" : "Price"} k="price" sort={sort} />
                  <SortTh label={isAr ? "المخزون" : "Stock"} k="stock" sort={sort} />
                  <SortTh label={isAr ? "قيمة المخزون" : "Stock value"} k="value" sort={sort} />
                  <SortTh label={isAr ? "رأس المال" : "Capital"} k="capital" sort={sort} />
                  <SortTh label={isAr ? "مباع (موقع)" : "Sold (web)"} k="web" sort={sort} />
                  <SortTh label={isAr ? "مباع (نقطة بيع)" : "Sold (POS)"} k="pos" sort={sort} />
                  <SortTh label={isAr ? "المبيعات" : "Sales"} k="sales" sort={sort} />
                  <SortTh label={isAr ? "الأرباح" : "Profit"} k="profit" sort={sort} />
                </tr>
              </thead>
              <tbody>
                {productRows.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5 min-w-[200px]">
                        <div className="w-9 h-9 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                          {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Package className="w-4 h-4 text-muted-foreground" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate max-w-[260px]">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {p.subcategoryId != null && subNameById.get(p.subcategoryId) ? subNameById.get(p.subcategoryId) : ""}
                            {p.barcode ? <span dir="ltr"> {p.subcategoryId != null && subNameById.get(p.subcategoryId) ? "· " : ""}{p.barcode}</span> : null}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(p.price)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">
                      {p.stock === 0 ? <span className="text-rose-600 dark:text-rose-400 font-medium">{isAr ? "نفذ" : "Out"}</span> : fmtInt(p.stock)}
                    </td>
                    <td className="py-2.5 px-3 text-end tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">{fmtMoney(p.sellingValue)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums font-semibold text-amber-600 dark:text-amber-400" dir="ltr">{fmtMoney(p.capital)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtInt(p.webUnits)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtInt(p.posUnits)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(p.sales)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums font-semibold text-emerald-600 dark:text-emerald-400" dir="ltr">{fmtMoney(p.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(search || onlyInStock) && (
          <p className="text-xs text-muted-foreground mt-3">{isAr ? `يعرض ${productRows.length} من ${data.products.length} منتج` : `Showing ${productRows.length} of ${data.products.length} products`}</p>
        )}
      </Panel>
    </AdminLayout>
  );
}
