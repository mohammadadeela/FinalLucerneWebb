import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Wallet, Package, Warehouse, ArrowLeft, ArrowRight, ChevronRight, ChevronLeft, ShoppingBag, TrendingUp,
  CheckCircle2, AlertTriangle, Layers, RefreshCw, Banknote,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  type CapitalData, StatCard, Panel, RulesBox, MonthSelect, SortTh, useSort, sortRows,
  fmtMoney, fmtInt, fmtPct, pctOf, monthLabel, C,
} from "@/components/admin/reports";
import { useLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";

type SortKey = "name" | "products" | "inStock" | "out" | "units" | "avg" | "value" | "capital" | "share" | "expected" | "sold" | "sales" | "profit";

export default function CategoryReports() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const Arrow = isAr ? ChevronLeft : ChevronRight;
  const BackArrow = isAr ? ArrowRight : ArrowLeft;
  const [, navigate] = useLocation();
  const [month, setMonth] = useState("");
  const [showEmpty, setShowEmpty] = useState(true);
  const sort = useSort<SortKey>("capital");

  const { data, isLoading, isFetching, error, refetch } = useQuery<CapitalData>({
    queryKey: ["/api/admin/category-inventory", month],
    queryFn: async () => {
      const url = month ? `/api/admin/category-inventory?month=${month}` : "/api/admin/category-inventory";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load capital data");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const totalCapital = data.total.inventory.capital;
    const mapped = data.categories.map((c) => ({
      id: c.id,
      name: isAr ? c.nameAr || c.name : c.name,
      image: c.image,
      products: c.inventory.productCount,
      inStock: c.inventory.inStockCount,
      out: c.inventory.outOfStockCount,
      units: c.inventory.totalUnits,
      avg: c.inventory.avgPrice,
      value: c.inventory.sellingValue,
      capital: c.inventory.capital,
      expected: c.inventory.expectedProfit,
      share: pctOf(c.inventory.capital, totalCapital),
      sold: c.sales.units,
      sales: c.sales.sales,
      profit: c.sales.profit,
    }));
    const filtered = showEmpty ? mapped : mapped.filter((r) => r.products > 0);
    return sortRows(filtered, (r) => r[sort.key], sort.dir);
  }, [data, isAr, sort.key, sort.dir, showEmpty]);

  const header = (
    <AdminPageHeader
      title={isAr ? "رأس المال" : "Capital"}
      description={isAr ? "رأس المال والمخزون لكل فئة — اضغط على أي فئة لعرض فئاتها الفرعية ومنتجاتها بالتفصيل" : "Capital and stock for every category — click a category for its sub-categories and products"}
      icon={Wallet}
      iconGradient="from-amber-500 to-orange-600"
      testId="text-category-reports-title"
      actions={
        <>
          <Link href="/admin/analytics" data-testid="link-back-to-reports">
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              <BackArrow className="w-4 h-4" />
              {isAr ? "تقرير المبيعات" : "Sales report"}
            </Button>
          </Link>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            {isAr ? "تحديث" : "Refresh"}
          </Button>
        </>
      }
    />
  );

  if (isLoading) {
    return (
      <AdminLayout>
        {header}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="h-96 bg-muted animate-pulse rounded-xl" />
      </AdminLayout>
    );
  }
  if (error || !data) {
    return (
      <AdminLayout>
        {header}
        <div className="text-destructive p-6">{isAr ? "فشل تحميل البيانات" : "Failed to load capital data."}</div>
      </AdminLayout>
    );
  }

  const inv = data.total.inventory;
  const sold = data.total.sales;
  const chartData = [...data.categories]
    .filter((c) => c.inventory.capital > 0)
    .sort((a, b) => b.inventory.capital - a.inventory.capital)
    .map((c) => ({ name: isAr ? c.nameAr || c.name : c.name, capital: c.inventory.capital, profit: c.inventory.expectedProfit }));

  const totals = rows.reduce(
    (s, r) => ({ products: s.products + r.products, inStock: s.inStock + r.inStock, out: s.out + r.out, units: s.units + r.units, value: s.value + r.value, capital: s.capital + r.capital, expected: s.expected + r.expected, sold: s.sold + r.sold, sales: s.sales + r.sales, profit: s.profit + r.profit }),
    { products: 0, inStock: 0, out: 0, units: 0, value: 0, capital: 0, expected: 0, sold: 0, sales: 0, profit: 0 },
  );
  const periodLabel = month ? monthLabel(month, isAr) : (isAr ? "كل الفترات" : "All time");
  const pct = Math.round(data.costRatio * 100);

  return (
    <AdminLayout>
      {header}

      <RulesBox isAr={isAr} costRatio={data.costRatio} show={["capital", "profit", "sales"]} />

      {/* ── Stock side (right now) ── */}
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Warehouse className="w-4 h-4" />
        {isAr ? "المخزون الحالي" : "Stock right now"}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-3">
        <StatCard big tone="amber" icon={Wallet} label={isAr ? `رأس المال (${pct}%)` : `Capital (${pct}%)`} value={fmtMoney(inv.capital)}
          sub={isAr ? `${pct}% من قيمة المخزون بسعر البيع` : `${pct}% of the stock's selling value`} testId="card-total-capital" />
        <StatCard tone="emerald" icon={ShoppingBag} label={isAr ? "قيمة المخزون (سعر البيع)" : "Stock value (selling price)"} value={fmtMoney(inv.sellingValue)} testId="card-stock-value" />
        <StatCard tone="teal" icon={Banknote} label={isAr ? "الربح المتوقع من المخزون" : "Expected profit from stock"} value={fmtMoney(inv.expectedProfit)}
          sub={isAr ? "إذا بيع كل المخزون بسعره" : "if all stock sells at list price"} />
        <StatCard tone="sky" icon={Layers} label={isAr ? "القطع في المخزن" : "Units in stock"} value={fmtInt(inv.totalUnits)}
          sub={isAr ? `متوسط السعر ${fmtMoney(inv.avgPrice)}` : `Average price ${fmtMoney(inv.avgPrice)}`} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard tone="slate" icon={Package} label={isAr ? "عدد المنتجات" : "Products"} value={fmtInt(inv.productCount)} />
        <StatCard tone="teal" icon={CheckCircle2} label={isAr ? "منتجات متوفرة" : "In stock"} value={fmtInt(inv.inStockCount)} sub={fmtPct(pctOf(inv.inStockCount, inv.productCount))} />
        <StatCard tone="rose" icon={AlertTriangle} label={isAr ? "منتجات نفذت" : "Out of stock"} value={fmtInt(inv.outOfStockCount)} sub={fmtPct(pctOf(inv.outOfStockCount, inv.productCount))} />
        <StatCard tone="violet" icon={Wallet} label={isAr ? "عدد الفئات" : "Categories"} value={fmtInt(data.categories.filter((c) => c.inventory.productCount > 0).length)} />
      </div>

      {/* ── Sales side (period) ── */}
      <div className="mb-2 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <TrendingUp className="w-4 h-4" />
          {isAr ? "المبيعات والأرباح" : "Sales & profit"} — {periodLabel}
        </div>
        <MonthSelect value={month} onChange={setMonth} months={data.availableMonths} isAr={isAr} testId="select-capital-month" allLabel={isAr ? "كل الفترات" : "All time"} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard tone="blue" icon={TrendingUp} label={isAr ? "صافي المبيعات" : "Net sales"} value={fmtMoney(sold.sales)} />
        <StatCard tone="emerald" icon={Banknote} label={isAr ? "الأرباح" : "Profit"} value={fmtMoney(sold.profit)} sub={isAr ? `${fmtPct(pctOf(sold.profit, sold.sales))} من المبيعات` : `${fmtPct(pctOf(sold.profit, sold.sales))} of sales`} />
        <StatCard tone="sky" icon={Package} label={isAr ? "القطع المباعة" : "Units sold"} value={fmtInt(sold.units)} />
        <StatCard tone="rose" icon={ShoppingBag} label={isAr ? "الخصومات" : "Discounts"} value={fmtMoney(sold.discounts)} />
      </div>

      {/* ── Chart ── */}
      {chartData.length > 0 && (
        <Panel icon={Wallet} title={isAr ? "رأس المال حسب الفئة" : "Capital by category"} subtitle={isAr ? "رأس المال والربح المتوقع لكل فئة" : "Capital and expected profit per category"}>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 46)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} />
                <Tooltip
                  formatter={(v: number, n: string) => [fmtMoney(Number(v)), n]}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="capital" stackId="c" fill={C.capital} name={isAr ? "رأس المال" : "Capital"} />
                <Bar dataKey="profit" stackId="c" fill={C.profit} name={isAr ? "الربح المتوقع" : "Expected profit"} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      )}

      {/* ── Table ── */}
      <Panel
        icon={Warehouse}
        title={isAr ? "كل الفئات" : "All categories"}
        subtitle={isAr ? "المخزون الحالي + مبيعات الفترة المختارة — اضغط على العنوان للترتيب وعلى الفئة للتفاصيل" : "Current stock + sales for the selected period — click a heading to sort, a category for details"}
        actions={
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} className="rounded" />
            {isAr ? "عرض الفئات الفارغة" : "Show empty categories"}
          </label>
        }
      >
        {rows.length === 0 ? (
          <div className="text-center text-muted-foreground py-16">{isAr ? "لا توجد فئات بعد" : "No categories yet"}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <SortTh label={isAr ? "الفئة" : "Category"} k="name" sort={sort} align="start" />
                  <SortTh label={isAr ? "المنتجات" : "Products"} k="products" sort={sort} />
                  <SortTh label={isAr ? "متوفر" : "In stock"} k="inStock" sort={sort} />
                  <SortTh label={isAr ? "نفذ" : "Out"} k="out" sort={sort} />
                  <SortTh label={isAr ? "القطع" : "Units"} k="units" sort={sort} />
                  <SortTh label={isAr ? "متوسط السعر" : "Avg price"} k="avg" sort={sort} />
                  <SortTh label={isAr ? "قيمة المخزون" : "Stock value"} k="value" sort={sort} />
                  <SortTh label={isAr ? "رأس المال" : "Capital"} k="capital" sort={sort} />
                  <SortTh label={isAr ? "حصة الفئة" : "Share"} k="share" sort={sort} />
                  <SortTh label={isAr ? "ربح متوقع" : "Exp. profit"} k="expected" sort={sort} />
                  <SortTh label={isAr ? "مباع" : "Sold"} k="sold" sort={sort} />
                  <SortTh label={isAr ? "المبيعات" : "Sales"} k="sales" sort={sort} />
                  <SortTh label={isAr ? "الأرباح" : "Profit"} k="profit" sort={sort} />
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const Row = (
                    <>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2.5 min-w-[140px]">
                          <div className="w-9 h-9 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                            {r.image ? <img src={r.image} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Package className="w-4 h-4 text-muted-foreground" />}
                          </div>
                          <span className="font-medium">{r.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtInt(r.products)}</td>
                      <td className="py-3 px-3 text-end tabular-nums text-teal-600 dark:text-teal-400" dir="ltr">{fmtInt(r.inStock)}</td>
                      <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{r.out > 0 ? <span className="text-rose-600 dark:text-rose-400 font-medium">{fmtInt(r.out)}</span> : <span className="text-muted-foreground">0</span>}</td>
                      <td className="py-3 px-3 text-end tabular-nums text-sky-600 dark:text-sky-400" dir="ltr">{fmtInt(r.units)}</td>
                      <td className="py-3 px-3 text-end tabular-nums text-muted-foreground" dir="ltr">{fmtMoney(r.avg)}</td>
                      <td className="py-3 px-3 text-end tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">{fmtMoney(r.value)}</td>
                      <td className="py-3 px-3 text-end tabular-nums font-bold text-amber-600 dark:text-amber-400" dir="ltr">{fmtMoney(r.capital)}</td>
                      <td className="py-3 px-3 text-end min-w-[110px]">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, r.share)}%`, background: C.capital }} /></div>
                          <span className="text-xs tabular-nums w-11 text-end" dir="ltr">{fmtPct(r.share)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-end tabular-nums text-teal-600 dark:text-teal-400" dir="ltr">{fmtMoney(r.expected)}</td>
                      <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtInt(r.sold)}</td>
                      <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(r.sales)}</td>
                      <td className="py-3 px-3 text-end tabular-nums font-semibold text-emerald-600 dark:text-emerald-400" dir="ltr">{fmtMoney(r.profit)}</td>
                      <td className="py-3 pe-2">{r.id > 0 && <Arrow className="w-4 h-4 text-muted-foreground" />}</td>
                    </>
                  );
                  return r.id > 0 ? (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/40 transition-colors cursor-pointer" data-testid={`link-category-report-${r.id}`}
                      onClick={() => navigate(`/admin/reports/categories/${r.id}`)}>
                      {Row}
                    </tr>
                  ) : (
                    <tr key={r.id} className="border-b border-border/50">{Row}</tr>
                  );
                })}
                <tr className="bg-muted/40 font-bold border-t-2 border-border">
                  <td className="py-3 px-3">{isAr ? "المجموع" : "Total"}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtInt(totals.products)}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtInt(totals.inStock)}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtInt(totals.out)}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtInt(totals.units)}</td>
                  <td className="py-3 px-3 text-end text-muted-foreground">—</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(totals.value)}</td>
                  <td className="py-3 px-3 text-end tabular-nums text-amber-600 dark:text-amber-400" dir="ltr">{fmtMoney(totals.capital)}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{showEmpty ? "100%" : ""}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(totals.expected)}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtInt(totals.sold)}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(totals.sales)}</td>
                  <td className="py-3 px-3 text-end tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">{fmtMoney(totals.profit)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AdminLayout>
  );
}
