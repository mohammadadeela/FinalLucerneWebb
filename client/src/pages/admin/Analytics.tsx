import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BarChart2, Wallet, RefreshCw, TrendingUp, Banknote, CreditCard, ShoppingBag, Package, Globe, Monitor,
  Percent, ExternalLink, MapPin, Building2, Trophy, Tag,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart,
} from "recharts";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  type OverviewData, StatCard, Panel, RulesBox, MonthSelect, ChannelTable, ChartTooltipBox,
  SortTh, useSort, sortRows, fmtMoney, fmtInt, fmtPct, pctOf, monthLabel, dayLabel, C,
} from "@/components/admin/reports";
import { useLanguage } from "@/i18n";
import { useSiteSettings, getShippingZones } from "@/hooks/use-site-settings";
import { Button } from "@/components/ui/button";

// Admin tabs are often left open all day — refresh every 2 minutes, and only while visible.
const REFRESH_INTERVAL_MS = 120_000;

type CatSortKey = "name" | "web" | "pos" | "sales" | "profit" | "units" | "cash" | "card" | "share";

export default function Analytics() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const { data: siteSettings } = useSiteSettings();
  const [month, setMonth] = useState<string>("");

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery<OverviewData>({
    queryKey: ["/api/admin/analytics", month],
    queryFn: async () => {
      const url = month ? `/api/admin/analytics?month=${month}` : "/api/admin/analytics";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const catSort = useSort<CatSortKey>("sales");

  const reportsPageEnabled = siteSettings?.reports_page_enabled !== "false";

  const zoneNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    getShippingZones(siteSettings).forEach((z) => { m[z.id] = isAr ? (z.nameAr || z.nameEn) : z.nameEn; });
    return m;
  }, [siteSettings, isAr]);

  const categoryRows = useMemo(() => {
    if (!data) return [];
    const rows = data.categories.map((c) => ({
      id: c.id,
      name: isAr ? c.nameAr : c.name,
      web: c.web.sales,
      pos: c.pos.sales,
      sales: c.all.sales,
      profit: c.all.profit,
      units: c.all.units,
      cash: c.all.cash,
      card: c.all.card,
      share: c.sharePct,
    }));
    return sortRows(rows, (r) => r[catSort.key], catSort.dir);
  }, [data, isAr, catSort.key, catSort.dir]);

  if (!reportsPageEnabled) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <BarChart2 className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">
            {isAr ? "صفحة التقارير معطّلة حالياً" : "The reports page is currently disabled"}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {isAr ? "يمكن تفعيلها من صفحة محتوى الموقع" : "It can be re-enabled from the Site Content page"}
          </p>
        </div>
      </AdminLayout>
    );
  }

  const header = (
    <AdminPageHeader
      title={isAr ? "تقرير المبيعات والأرباح" : "Sales & Profit Report"}
      description={isAr ? "المبيعات والأرباح للموقع ونقطة البيع، حسب الشهر والفئة وطريقة الدفع" : "Sales and profit for the website and POS, by month, category and payment method"}
      icon={BarChart2}
      iconGradient="from-violet-500 to-purple-600"
      testId="text-analytics-title"
      actions={
        <>
          <Link href="/admin/reports/categories" data-testid="link-category-manager">
            <Button variant="outline" size="sm" className="gap-1.5 h-9">
              <Wallet className="w-4 h-4" />
              {isAr ? "رأس المال" : "Capital"}
            </Button>
          </Link>
          <MonthSelect
            value={month}
            onChange={setMonth}
            months={data?.availableMonths ?? []}
            isAr={isAr}
            testId="select-analytics-month"
            allLabel={isAr ? "كل الأشهر" : "All months"}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-manual-refresh-analytics"
          >
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
        <div className="h-80 bg-muted animate-pulse rounded-xl mb-6" />
        <div className="h-80 bg-muted animate-pulse rounded-xl" />
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        {header}
        <div className="text-destructive p-6">{isAr ? "فشل تحميل البيانات" : "Failed to load analytics data."}</div>
      </AdminLayout>
    );
  }

  const { totals } = data;
  const { web, pos, all } = totals;
  const periodLabel = month ? monthLabel(month, isAr) : (isAr ? "كل الأشهر" : "All months");
  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString(isAr ? "ar" : "en", { hour: "2-digit", minute: "2-digit" })
    : null;

  const monthlyData = data.monthly.map((m) => ({
    key: m.month,
    label: monthLabel(m.month, isAr, "MMM yy"),
    web: m.web.sales,
    pos: m.pos.sales,
    profit: Math.round((m.web.profit + m.pos.profit) * 100) / 100,
  }));
  const dailyData = data.daily.map((d) => ({ ...d, label: dayLabel(d.day, isAr) }));
  const hasDaily = dailyData.some((d) => d.web > 0 || d.pos > 0);

  const paymentPie = [
    { name: isAr ? "نقدي / عند التسليم" : "Cash / on delivery", value: all.cash, color: C.cash },
    { name: isAr ? "بطاقة" : "Card", value: all.card, color: C.card },
    { name: isAr ? "رصيد المتجر" : "Store credit", value: all.credit, color: C.credit },
  ].filter((d) => d.value > 0.004);

  const channelPie = [
    { name: isAr ? "الموقع" : "Website", value: web.sales, color: C.web },
    { name: isAr ? "نقطة البيع" : "POS", value: pos.sales, color: C.pos },
  ].filter((d) => d.value > 0.004);

  const categoryPie = data.categories
    .filter((c) => c.all.sales > 0)
    .map((c) => ({ name: isAr ? c.nameAr : c.name, value: c.all.sales }));

  const regionData = data.ordersByRegion.map((r) => ({ name: zoneNameMap[r.region] || r.region, value: r.orderCount }));
  const cityData = data.ordersByCity.map((r) => ({ name: r.city, orders: r.orderCount }));

  const tableTotals = categoryRows.reduce(
    (s, r) => ({ web: s.web + r.web, pos: s.pos + r.pos, sales: s.sales + r.sales, profit: s.profit + r.profit, units: s.units + r.units, cash: s.cash + r.cash, card: s.card + r.card }),
    { web: 0, pos: 0, sales: 0, profit: 0, units: 0, cash: 0, card: 0 },
  );

  const pieLabel = ({ percent }: any) => `${(percent * 100).toFixed(0)}%`;

  return (
    <AdminLayout>
      {header}

      <div className="flex items-center justify-between gap-3 mb-4 text-xs text-muted-foreground flex-wrap">
        <span className="inline-flex items-center gap-1.5 bg-muted px-3 py-1 rounded-full font-medium text-foreground">
          {periodLabel}
          {month && (
            <button onClick={() => setMonth("")} className="underline underline-offset-2 text-muted-foreground hover:text-foreground ms-2" data-testid="button-clear-month-filter">
              {isAr ? "عرض الكل" : "Show all"}
            </button>
          )}
        </span>
        {lastUpdated && <span>{isAr ? `آخر تحديث: ${lastUpdated}` : `Last updated: ${lastUpdated}`}</span>}
      </div>

      <RulesBox isAr={isAr} costRatio={data.costRatio} show={["sales", "profit"]} />

      {/* ── Headline numbers ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <StatCard big tone="blue" icon={TrendingUp} label={isAr ? "صافي المبيعات" : "Net sales"} value={fmtMoney(all.sales)}
          sub={isAr ? `موقع ${fmtMoney(web.sales)} · نقطة بيع ${fmtMoney(pos.sales)}` : `Website ${fmtMoney(web.sales)} · POS ${fmtMoney(pos.sales)}`} testId="card-total-sales" />
        <StatCard big tone="emerald" icon={Banknote} label={isAr ? "الأرباح" : "Profit"} value={fmtMoney(all.profit)}
          sub={isAr ? `موقع ${fmtMoney(web.profit)} · نقطة بيع ${fmtMoney(pos.profit)}` : `Website ${fmtMoney(web.profit)} · POS ${fmtMoney(pos.profit)}`} testId="card-total-profit" />
        <StatCard tone="violet" icon={ShoppingBag} label={isAr ? "الطلبات / الفواتير" : "Orders / invoices"} value={fmtInt(all.orders)}
          sub={isAr ? `متوسط الطلب ${fmtMoney(all.orders > 0 ? all.sales / all.orders : 0)}` : `Average ${fmtMoney(all.orders > 0 ? all.sales / all.orders : 0)}`} />
        <StatCard tone="sky" icon={Package} label={isAr ? "القطع المباعة" : "Units sold"} value={fmtInt(all.units)}
          sub={all.discounts > 0 ? (isAr ? `خصومات ${fmtMoney(all.discounts)}` : `Discounts ${fmtMoney(all.discounts)}`) : undefined} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard tone="teal" icon={Banknote} label={isAr ? "نقدي / عند التسليم" : "Cash / on delivery"} value={fmtMoney(all.cash)}
          sub={isAr ? `موقع ${fmtMoney(web.cash)} · نقطة بيع ${fmtMoney(pos.cash)}` : `Website ${fmtMoney(web.cash)} · POS ${fmtMoney(pos.cash)}`} />
        <StatCard tone="amber" icon={CreditCard} label={isAr ? "بطاقة" : "Card"} value={fmtMoney(all.card)}
          sub={isAr ? `موقع ${fmtMoney(web.card)} · نقطة بيع ${fmtMoney(pos.card)}` : `Website ${fmtMoney(web.card)} · POS ${fmtMoney(pos.card)}`} />
        <StatCard tone="slate" icon={Percent} label={isAr ? "نسبة الربح من المبيعات" : "Profit / sales"} value={fmtPct(pctOf(all.profit, all.sales))} />
        <StatCard tone="rose" icon={Tag} label={isAr ? "الخصومات" : "Discounts"} value={fmtMoney(all.discounts)}
          sub={all.credit > 0 ? (isAr ? `رصيد متجر مستخدم ${fmtMoney(all.credit)}` : `Store credit used ${fmtMoney(all.credit)}`) : undefined} />
      </div>

      {/* ── Website vs POS ── */}
      <Panel icon={BarChart2} title={isAr ? "الموقع مقابل نقطة البيع" : "Website vs POS"} subtitle={periodLabel}>
        <ChannelTable totals={totals} isAr={isAr} />
      </Panel>

      {/* ── Monthly ── */}
      <Panel
        icon={TrendingUp}
        title={isAr ? "المبيعات والأرباح الشهرية" : "Monthly sales & profit"}
        subtitle={isAr ? "آخر ١٢ شهراً — الأعمدة للمبيعات والخط للأرباح" : "Last 12 months — bars are sales, the line is profit"}
      >
        <div dir="ltr">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} width={64} />
              <Tooltip content={<ChartTooltipBox isAr={isAr} />} />
              <Legend />
              <Bar dataKey="web" stackId="s" fill={C.web} name={isAr ? "مبيعات الموقع" : "Website sales"} radius={[0, 0, 0, 0]}>
                {monthlyData.map((m) => <Cell key={m.key} fill={C.web} fillOpacity={!month || month === m.key ? 1 : 0.3} />)}
              </Bar>
              <Bar dataKey="pos" stackId="s" fill={C.pos} name={isAr ? "مبيعات نقطة البيع" : "POS sales"} radius={[4, 4, 0, 0]}>
                {monthlyData.map((m) => <Cell key={m.key} fill={C.pos} fillOpacity={!month || month === m.key ? 1 : 0.3} />)}
              </Bar>
              <Line type="monotone" dataKey="profit" stroke={C.profit} strokeWidth={2.5} dot={{ r: 3 }} name={isAr ? "الأرباح" : "Profit"} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      {/* ── Daily ── */}
      <Panel
        icon={BarChart2}
        title={isAr ? "المبيعات اليومية" : "Daily sales"}
        subtitle={month ? monthLabel(month, isAr) : (isAr ? "آخر ٣٠ يوماً" : "Last 30 days")}
      >
        {!hasDaily ? (
          <div className="text-center text-muted-foreground py-10 text-sm">{isAr ? "لا توجد مبيعات في هذه الفترة" : "No sales in this period"}</div>
        ) : (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={260}>
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
        )}
      </Panel>

      {/* ── Categories ── */}
      <Panel
        icon={ShoppingBag}
        title={isAr ? "تفصيل الفئات" : "Category breakdown"}
        subtitle={isAr ? "اضغط على اسم الفئة لعرض رأس مالها ومنتجاتها بالتفصيل — اضغط على العنوان للترتيب" : "Click a category to see its capital and products — click a heading to sort"}
      >
        {categoryRows.length === 0 ? (
          <div className="text-center text-muted-foreground py-10 text-sm">{isAr ? "لا توجد مبيعات في هذه الفترة" : "No sales in this period"}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <SortTh label={isAr ? "الفئة" : "Category"} k="name" sort={catSort} align="start" />
                  <SortTh label={isAr ? "الموقع" : "Website"} k="web" sort={catSort} />
                  <SortTh label={isAr ? "نقطة البيع" : "POS"} k="pos" sort={catSort} />
                  <SortTh label={isAr ? "صافي المبيعات" : "Net sales"} k="sales" sort={catSort} />
                  <SortTh label={isAr ? "الأرباح" : "Profit"} k="profit" sort={catSort} />
                  <SortTh label={isAr ? "القطع" : "Units"} k="units" sort={catSort} />
                  <SortTh label={isAr ? "نقدي" : "Cash"} k="cash" sort={catSort} />
                  <SortTh label={isAr ? "بطاقة" : "Card"} k="card" sort={catSort} />
                  <SortTh label={isAr ? "الحصة" : "Share"} k="share" sort={catSort} />
                </tr>
              </thead>
              <tbody>
                {categoryRows.map((r, i) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`row-category-${i}`}>
                    <td className="py-3 px-3 font-medium">
                      {r.id > 0 ? (
                        <Link href={`/admin/reports/categories/${r.id}`} className="inline-flex items-center gap-1.5 hover:text-amber-600 hover:underline" data-testid={`link-category-detail-${r.id}`}>
                          {r.name}
                          <ExternalLink className="w-3 h-3 opacity-60" />
                        </Link>
                      ) : r.name}
                    </td>
                    <td className="py-3 px-3 text-end tabular-nums text-violet-600 dark:text-violet-400" dir="ltr">{fmtMoney(r.web)}</td>
                    <td className="py-3 px-3 text-end tabular-nums text-pink-600 dark:text-pink-400" dir="ltr">{fmtMoney(r.pos)}</td>
                    <td className="py-3 px-3 text-end tabular-nums font-semibold" dir="ltr">{fmtMoney(r.sales)}</td>
                    <td className="py-3 px-3 text-end tabular-nums font-semibold text-emerald-600 dark:text-emerald-400" dir="ltr">{fmtMoney(r.profit)}</td>
                    <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtInt(r.units)}</td>
                    <td className="py-3 px-3 text-end tabular-nums text-teal-600 dark:text-teal-400" dir="ltr">{fmtMoney(r.cash)}</td>
                    <td className="py-3 px-3 text-end tabular-nums text-amber-600 dark:text-amber-400" dir="ltr">{fmtMoney(r.card)}</td>
                    <td className="py-3 px-3 text-end min-w-[110px]">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, r.share)}%`, background: C.sales }} /></div>
                        <span className="text-xs tabular-nums w-11 text-end" dir="ltr">{fmtPct(r.share)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/40 font-bold border-t-2 border-border">
                  <td className="py-3 px-3">{isAr ? "المجموع" : "Total"}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(tableTotals.web)}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(tableTotals.pos)}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(tableTotals.sales)}</td>
                  <td className="py-3 px-3 text-end tabular-nums text-emerald-600 dark:text-emerald-400" dir="ltr">{fmtMoney(tableTotals.profit)}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtInt(tableTotals.units)}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(tableTotals.cash)}</td>
                  <td className="py-3 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(tableTotals.card)}</td>
                  <td className="py-3 px-3"></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── Pies ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {[
          { title: isAr ? "المبيعات حسب القناة" : "Sales by channel", icon: Globe, data: channelPie, perItemColor: true },
          { title: isAr ? "المبيعات حسب طريقة الدفع" : "Sales by payment method", icon: CreditCard, data: paymentPie, perItemColor: true },
          { title: isAr ? "المبيعات حسب الفئة" : "Sales by category", icon: Monitor, data: categoryPie, perItemColor: false },
        ].map((p) => (
          <section key={p.title} className="bg-card border border-border rounded-xl p-4 sm:p-6">
            <h2 className="text-base font-semibold mb-3 flex items-center gap-2"><p.icon className="w-4 h-4 text-muted-foreground" />{p.title}</h2>
            {p.data.length === 0 ? (
              <div className="text-center text-muted-foreground py-10 text-sm">{isAr ? "لا توجد بيانات" : "No data"}</div>
            ) : (
              <div dir="ltr">
                <ResponsiveContainer width="100%" height={270}>
                  <PieChart>
                    <Pie data={p.data} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={80} label={pieLabel} labelLine={false}>
                      {p.data.map((d: any, i: number) => <Cell key={i} fill={p.perItemColor ? d.color : C.palette[i % C.palette.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [fmtMoney(Number(v)), n]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* ── Top products ── */}
      <Panel icon={Trophy} title={isAr ? "الأكثر مبيعاً" : "Best-selling products"} subtitle={periodLabel}>
        {data.topProducts.length === 0 ? (
          <div className="text-center text-muted-foreground py-10 text-sm">{isAr ? "لا توجد مبيعات في هذه الفترة" : "No sales in this period"}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-start py-2 px-3 font-medium w-8">#</th>
                  <th className="text-start py-2 px-3 font-medium">{isAr ? "المنتج" : "Product"}</th>
                  <th className="text-start py-2 px-3 font-medium">{isAr ? "الفئة" : "Category"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "القطع" : "Units"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "المبيعات" : "Sales"}</th>
                  <th className="text-end py-2 px-3 font-medium">{isAr ? "الأرباح" : "Profit"}</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((p, i) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2.5 px-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-md bg-muted overflow-hidden shrink-0">
                          {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" loading="lazy" />}
                        </div>
                        <span className="font-medium truncate max-w-[240px]">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{isAr ? p.categoryAr : p.category}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtInt(p.units)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums" dir="ltr">{fmtMoney(p.sales)}</td>
                    <td className="py-2.5 px-3 text-end tabular-nums font-semibold text-emerald-600 dark:text-emerald-400" dir="ltr">{fmtMoney(p.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ── Where website orders go ── */}
      {(regionData.length > 0 || cityData.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <section className="bg-card border border-border rounded-xl p-4 sm:p-6">
            <h2 className="text-base font-semibold mb-1 flex items-center gap-2"><MapPin className="w-4 h-4 text-rose-500" />{isAr ? "طلبات الموقع حسب منطقة التوصيل" : "Website orders by region"}</h2>
            <p className="text-xs text-muted-foreground mb-3">{isAr ? "كل الطلبات غير الملغاة" : "All non-cancelled orders"}</p>
            {regionData.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد بيانات" : "No data"}</div>
            ) : (
              <>
                <div dir="ltr">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={regionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={pieLabel} labelLine={false}>
                        {regionData.map((_, i) => <Cell key={i} fill={C.palette[i % C.palette.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number, n: string) => [`${v} ${isAr ? "طلب" : "orders"}`, n]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {regionData.map((r, i) => (
                    <div key={r.name} className="flex items-center justify-between text-sm px-1">
                      <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: C.palette[i % C.palette.length] }} />{r.name}</span>
                      <span className="text-muted-foreground tabular-nums">{r.value} {isAr ? "طلب" : "orders"}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
          <section className="bg-card border border-border rounded-xl p-4 sm:p-6">
            <h2 className="text-base font-semibold mb-1 flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-500" />{isAr ? "طلبات الموقع حسب المدينة" : "Website orders by city"}</h2>
            <p className="text-xs text-muted-foreground mb-3">{isAr ? "أعلى ١٥ مدينة" : "Top 15 cities"}</p>
            {cityData.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد بيانات" : "No data"}</div>
            ) : (
              <div dir="ltr">
                <ResponsiveContainer width="100%" height={Math.max(240, cityData.length * 30)}>
                  <BarChart data={cityData} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip formatter={(v: number) => [`${v} ${isAr ? "طلب" : "orders"}`]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="orders" fill="#60a5fa" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
