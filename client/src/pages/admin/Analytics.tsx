import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { BarChart2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/i18n";
import { format, subMonths, startOfMonth } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, Globe, Monitor, RefreshCw, Calendar, ShoppingBag, CreditCard, Banknote } from "lucide-react";

const REFRESH_INTERVAL_MS = 30_000;

interface AnalyticsData {
  websiteTotal: number;
  posTotal: number;
  websiteMonthly: { month: string; revenue: string; order_count: number }[];
  posMonthly: { month: string; revenue: string; order_count: number }[];
  websiteCategoryRevenue: { category: string; category_ar: string; revenue: string }[];
  posCategoryRevenue: { category: string; category_ar: string; revenue: string }[];
  websitePaymentBreakdown: { payment_type: string; revenue: string }[];
  posPaymentBreakdown: { cash: number; card: number };
  paymentByCategory: { category: string; category_ar: string; cash: number; card: number }[];
}

// Refined boutique color palette
const WEBSITE_COLOR = "#7C6EFA";
const POS_COLOR     = "#F06292";
const CASH_COLOR    = "#26A69A";
const CARD_COLOR    = "#FFA726";
const COLORS = [
  "#7C6EFA", "#F06292", "#26A69A", "#FFA726",
  "#AB8CF7", "#81C784", "#FF8A65", "#4FC3F7",
];

function getLast12Months(): string[] {
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    months.push(format(subMonths(startOfMonth(new Date()), i), "yyyy-MM"));
  }
  return months;
}

function buildMonthlyTimeline(
  websiteMonthly: AnalyticsData["websiteMonthly"],
  posMonthly: AnalyticsData["posMonthly"],
  language: string,
  selectedMonth: string
) {
  const months: string[] = [];
  for (let i = 11; i >= 0; i--) {
    months.push(format(subMonths(startOfMonth(new Date()), i), "yyyy-MM"));
  }
  const websiteMap = Object.fromEntries(websiteMonthly.map((r) => [r.month, Number(r.revenue)]));
  const posMap = Object.fromEntries(posMonthly.map((r) => [r.month, Number(r.revenue)]));
  const all = months.map((m) => {
    const label = format(new Date(m + "-01"), "MMM yy", { locale: language === "ar" ? ar : enUS });
    return { month: label, monthKey: m, website: websiteMap[m] ?? 0, pos: posMap[m] ?? 0 };
  });
  if (selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)) {
    return all.filter((d) => d.monthKey === selectedMonth);
  }
  return all;
}

function mergeCategoryRevenue(
  website: AnalyticsData["websiteCategoryRevenue"],
  pos: AnalyticsData["posCategoryRevenue"],
  language: string
) {
  const map: Record<string, { name: string; website: number; pos: number }> = {};
  for (const r of website) {
    const key = r.category;
    if (!map[key]) map[key] = { name: language === "ar" ? r.category_ar : r.category, website: 0, pos: 0 };
    map[key].website += Number(r.revenue);
  }
  for (const r of pos) {
    const key = r.category;
    if (!map[key]) map[key] = { name: language === "ar" ? r.category_ar : r.category, website: 0, pos: 0 };
    map[key].pos += Number(r.revenue);
  }
  return Object.values(map)
    .map((v) => ({ ...v, total: v.website + v.pos }))
    .sort((a, b) => b.total - a.total);
}

export default function Analytics() {
  const { language } = useLanguage();
  const isAr = language === "ar";

  const last12 = getLast12Months();
  const [selectedMonth, setSelectedMonth] = useState<string>("");

  const { data, isLoading, isFetching, error, refetch, dataUpdatedAt } = useQuery<AnalyticsData>({
    queryKey: ["/api/admin/analytics", selectedMonth],
    queryFn: async () => {
      const url = selectedMonth
        ? `/api/admin/analytics?month=${selectedMonth}`
        : "/api/admin/analytics";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_MS / 1000);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCountdown(REFRESH_INTERVAL_MS / 1000);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) return REFRESH_INTERVAL_MS / 1000;
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [dataUpdatedAt]);

  const lastUpdatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString(isAr ? "ar" : "en", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const monthlyData = data ? buildMonthlyTimeline(data.websiteMonthly, data.posMonthly, language, selectedMonth) : [];
  const categoryData = data ? mergeCategoryRevenue(data.websiteCategoryRevenue, data.posCategoryRevenue, language) : [];

  const websiteTotal = data?.websiteTotal ?? 0;
  const posTotal = data?.posTotal ?? 0;
  const combined = websiteTotal + posTotal;

  // Payment totals
  const websitePaymentMap = Object.fromEntries((data?.websitePaymentBreakdown ?? []).map((r) => [r.payment_type, Number(r.revenue)]));
  const websiteCash = websitePaymentMap["cash"] ?? 0;
  const websiteCard = websitePaymentMap["card"] ?? 0;
  const posCash = data?.posPaymentBreakdown?.cash ?? 0;
  const posCard = data?.posPaymentBreakdown?.card ?? 0;
  const totalCash = websiteCash + posCash;
  const totalCard = websiteCard + posCard;

  const paymentPieData = [
    { name: isAr ? "الدفع عند التسليم" : "Cash on Delivery", value: totalCash },
    { name: isAr ? "الدفع الإلكتروني" : "Online Payment", value: totalCard },
  ].filter((d) => d.value > 0);

  const paymentCategoryData = (data?.paymentByCategory ?? []).map((r) => ({
    name: isAr ? r.category_ar : r.category,
    cash: r.cash,
    card: r.card,
  })).sort((a, b) => (b.cash + b.card) - (a.cash + a.card));

  const selectedLabel = selectedMonth
    ? format(new Date(selectedMonth + "-01"), "MMMM yyyy", { locale: isAr ? ar : enUS })
    : (isAr ? "كل الأشهر" : "All months");

  const summaryCards = [
    { label: isAr ? "إجمالي الموقع" : "Website Revenue", value: fmt(websiteTotal), icon: Globe, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
    { label: isAr ? "إجمالي نقطة البيع" : "POS Revenue", value: fmt(posTotal), icon: Monitor, color: "text-pink-600", bg: "bg-pink-50 dark:bg-pink-950/30" },
    { label: isAr ? "الإجمالي الكلي" : "Combined Total", value: fmt(combined), icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  ];

  const paymentCards = [
    { label: isAr ? "الدفع عند التسليم" : "Cash on Delivery", value: fmt(totalCash), icon: Banknote, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30", sub: isAr ? `موقع: ${fmt(websiteCash)} · نقطة بيع: ${fmt(posCash)}` : `Website: ${fmt(websiteCash)} · POS: ${fmt(posCash)}` },
    { label: isAr ? "الدفع الإلكتروني" : "Online Payment (Card)", value: fmt(totalCard), icon: CreditCard, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30", sub: isAr ? `موقع: ${fmt(websiteCard)} · نقطة بيع: ${fmt(posCard)}` : `Website: ${fmt(websiteCard)} · POS: ${fmt(posCard)}` },
  ];

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="h-8 w-56 bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
          </div>
          <div className="h-80 bg-muted animate-pulse rounded-xl" />
          <div className="h-80 bg-muted animate-pulse rounded-xl" />
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="text-destructive p-6">{isAr ? "فشل تحميل البيانات" : "Failed to load analytics data."}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminPageHeader
        title={isAr ? "تقرير المبيعات" : "Sales Analytics"}
        description={isAr ? "مقارنة أرباح الموقع ونقطة البيع حسب الشهر والفئة وطريقة الدفع" : "Compare website and POS revenue by month, category, and payment method"}
        icon={BarChart2}
        iconGradient="from-violet-500 to-purple-600"
        testId="text-analytics-title"
        actions={
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <select
              data-testid="select-analytics-month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-w-[160px]"
              dir={isAr ? "rtl" : "ltr"}
            >
              <option value="">{isAr ? "كل الأشهر" : "All months"}</option>
              {last12.map((m) => {
                const label = format(new Date(m + "-01"), "MMMM yyyy", { locale: isAr ? ar : enUS });
                return <option key={m} value={m}>{label}</option>;
              })}
            </select>
          </div>
        }
      />

      {/* Auto-refresh status bar */}
      <div className="flex items-center justify-between gap-3 mb-6 px-4 py-2.5 rounded-lg border border-border bg-muted/40 text-sm" data-testid="analytics-refresh-bar">
        <div className="flex items-center gap-2.5 text-muted-foreground">
          {isFetching ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-violet-500" />
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
          <span>
            {isFetching
              ? (isAr ? "جارٍ التحديث..." : "Refreshing...")
              : lastUpdatedLabel
                ? (isAr ? `آخر تحديث: ${lastUpdatedLabel}` : `Last updated: ${lastUpdatedLabel}`)
                : (isAr ? "تحديث تلقائي مفعّل" : "Auto-refresh active")}
          </span>
          {!isFetching && (
            <span className="text-xs text-muted-foreground/60">
              {isAr ? `· التحديث التالي خلال ${countdown}ث` : `· next in ${countdown}s`}
            </span>
          )}
        </div>
        <button
          onClick={() => { refetch(); setCountdown(REFRESH_INTERVAL_MS / 1000); }}
          disabled={isFetching}
          className="flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-800 disabled:opacity-40 transition-colors"
          data-testid="button-manual-refresh-analytics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isAr ? "تحديث الآن" : "Refresh now"}
        </button>
      </div>

      {/* Active filter badge */}
      {selectedMonth && (
        <div className="mb-6 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-violet-50 text-violet-700 border border-violet-200 text-sm font-medium px-3 py-1 rounded-full">
            <Calendar className="w-3.5 h-3.5" />
            {selectedLabel}
          </span>
          <button
            data-testid="button-clear-month-filter"
            onClick={() => setSelectedMonth("")}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
          >
            {isAr ? "عرض الكل" : "Show all"}
          </button>
        </div>
      )}

      {/* Revenue Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {summaryCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-6 flex items-center gap-4" data-testid={`card-analytics-${card.label}`}>
            <div className={`w-12 h-12 rounded-full ${card.bg} flex items-center justify-center flex-shrink-0`}>
              <card.icon className={`w-6 h-6 ${card.color}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-xl font-semibold mt-0.5" data-testid={`value-analytics-${card.label}`}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Payment Method Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        {paymentCards.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-6 flex items-center gap-4" data-testid={`card-payment-${card.label}`}>
            <div className={`w-12 h-12 rounded-full ${card.bg} flex items-center justify-center flex-shrink-0`}>
              <card.icon className={`w-6 h-6 ${card.color}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-xl font-semibold mt-0.5" data-testid={`value-payment-${card.label}`}>{card.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Monthly Revenue Chart */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1">
          {isAr ? "الأرباح الشهرية" : "Monthly Revenue"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {selectedMonth
            ? (isAr ? `بيانات شهر ${selectedLabel}` : `Data for ${selectedLabel}`)
            : (isAr ? "آخر ١٢ شهراً — الموقع مقابل نقطة البيع" : "Last 12 months — Website vs POS")}
        </p>
        {monthlyData.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">
            {isAr ? "لا توجد بيانات لهذا الشهر" : "No data for this month"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} width={70} />
              <Tooltip
                formatter={(val: number, name: string) => [`₪${val.toFixed(2)}`, name === "website" ? (isAr ? "الموقع" : "Website") : (isAr ? "نقطة البيع" : "POS")]}
                contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))" }}
              />
              <Legend formatter={(val) => val === "website" ? (isAr ? "الموقع" : "Website") : (isAr ? "نقطة البيع" : "POS")} />
              <Bar dataKey="website" fill={WEBSITE_COLOR} radius={[4, 4, 0, 0]} name="website" />
              <Bar dataKey="pos" fill={POS_COLOR} radius={[4, 4, 0, 0]} name="pos" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Category Revenue Chart */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1">
          {isAr ? "الأرباح حسب الفئة" : "Revenue by Category"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {selectedMonth
            ? (isAr ? `الموقع ونقطة البيع — ${selectedLabel}` : `Website + POS — ${selectedLabel}`)
            : (isAr ? "إجمالي الموقع ونقطة البيع لكل فئة" : "Website + POS combined per category")}
        </p>
        {categoryData.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            {isAr ? "لا توجد بيانات بعد" : "No category data yet"}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(280, categoryData.length * 60)}>
            <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 20, left: 8, bottom: 0 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} width={isAr ? 100 : 90} />
              <Tooltip
                formatter={(val: number, name: string) => [`₪${val.toFixed(2)}`, name === "website" ? (isAr ? "الموقع" : "Website") : (isAr ? "نقطة البيع" : "POS")]}
                contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))" }}
              />
              <Legend formatter={(val) => val === "website" ? (isAr ? "الموقع" : "Website") : (isAr ? "نقطة البيع" : "POS")} />
              <Bar dataKey="website" fill={WEBSITE_COLOR} radius={[0, 4, 4, 0]} name="website" />
              <Bar dataKey="pos" fill={POS_COLOR} radius={[0, 4, 4, 0]} name="pos" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Payment Method Section */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          {isAr ? "طريقة الدفع" : "Payment Method"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {isAr ? "توزيع المبيعات حسب طريقة الدفع (موقع + نقطة بيع)" : "Sales split by payment method — Website + POS combined"}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Payment Pie */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4 text-center">
              {isAr ? "التوزيع الإجمالي" : "Overall split"}
            </h3>
            {paymentPieData.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={paymentPieData}
                    cx="50%" cy="45%" outerRadius={90}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: "#9ca3af", strokeWidth: 1 }}
                  >
                    <Cell fill={CASH_COLOR} />
                    <Cell fill={CARD_COLOR} />
                  </Pie>
                  <Tooltip formatter={(val: number, name: string) => [`₪${val.toFixed(2)}`, name]} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                  <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Payment by Category (website only) */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4 text-center">
              {isAr ? "حسب الفئة (الموقع)" : "By category (Website)"}
            </h3>
            {paymentCategoryData.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(260, paymentCategoryData.length * 55)}>
                <BarChart data={paymentCategoryData} layout="vertical" margin={{ top: 0, right: 20, left: 8, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }} width={isAr ? 100 : 90} />
                  <Tooltip
                    formatter={(val: number, name: string) => [`₪${val.toFixed(2)}`, name === "cash" ? (isAr ? "الدفع عند التسليم" : "Cash on Delivery") : (isAr ? "الدفع الإلكتروني" : "Online Payment")]}
                    contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))" }}
                  />
                  <Legend formatter={(val) => val === "cash" ? (isAr ? "الدفع عند التسليم" : "Cash on Delivery") : (isAr ? "الدفع الإلكتروني" : "Online Payment")} />
                  <Bar dataKey="cash" fill={CASH_COLOR} radius={[0, 4, 4, 0]} name="cash" />
                  <Bar dataKey="card" fill={CARD_COLOR} radius={[0, 4, 4, 0]} name="card" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Category Pie Breakdown */}
      {categoryData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Website Pie */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4" />
              {isAr ? "الموقع — حسب الفئة" : "Website — by Category"}
            </h2>
            {(data?.websiteCategoryRevenue?.length ?? 0) === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد مبيعات موقع بعد" : "No website sales yet"}</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={(data?.websiteCategoryRevenue ?? []).map((r) => ({
                      name: isAr ? r.category_ar : r.category,
                      value: Number(r.revenue),
                    }))}
                    cx="50%" cy="45%" outerRadius={90}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: "#9ca3af", strokeWidth: 1 }}
                  >
                    {(data?.websiteCategoryRevenue ?? []).map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number, name: string) => [`₪${val.toFixed(2)}`, name]} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                  <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* POS Pie */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              {isAr ? "نقطة البيع — حسب الفئة" : "POS — by Category"}
            </h2>
            {(data?.posCategoryRevenue?.length ?? 0) === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد مبيعات نقطة بيع بعد" : "No POS sales yet"}</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={(data?.posCategoryRevenue ?? []).map((r) => ({
                      name: isAr ? r.category_ar : r.category,
                      value: Number(r.revenue),
                    }))}
                    cx="50%" cy="45%" outerRadius={90}
                    dataKey="value"
                    label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: "#9ca3af", strokeWidth: 1 }}
                  >
                    {(data?.posCategoryRevenue ?? []).map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val: number, name: string) => [`₪${val.toFixed(2)}`, name]} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                  <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Category breakdown table */}
      {categoryData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" />
            {isAr ? "تفصيل الفئات" : "Category Breakdown"}
            {selectedMonth && (
              <span className="ms-2 text-xs font-normal text-muted-foreground">— {selectedLabel}</span>
            )}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start py-2 px-3 font-medium text-muted-foreground">{isAr ? "الفئة" : "Category"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "الموقع" : "Website"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "نقطة البيع" : "POS"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "الإجمالي" : "Total"}</th>
                </tr>
              </thead>
              <tbody>
                {categoryData.map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`row-category-${i}`}>
                    <td className="py-3 px-3 font-medium">{row.name}</td>
                    <td className="py-3 px-3 text-end text-violet-600 dark:text-violet-400">{fmt(row.website)}</td>
                    <td className="py-3 px-3 text-end text-pink-600 dark:text-pink-400">{fmt(row.pos)}</td>
                    <td className="py-3 px-3 text-end font-semibold">{fmt(row.total)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/40">
                  <td className="py-3 px-3 font-bold">{isAr ? "المجموع" : "Total"}</td>
                  <td className="py-3 px-3 text-end font-bold text-violet-600 dark:text-violet-400">{fmt(websiteTotal)}</td>
                  <td className="py-3 px-3 text-end font-bold text-pink-600 dark:text-pink-400">{fmt(posTotal)}</td>
                  <td className="py-3 px-3 text-end font-bold">{fmt(combined)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
