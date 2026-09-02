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
import { TrendingUp, Globe, Monitor, RefreshCw, Calendar, ShoppingBag, CreditCard, Banknote, MapPin, Building2, Package, Warehouse, BarChart3, AlertTriangle, CheckCircle2, Wallet, ExternalLink } from "lucide-react";
import { useSiteSettings, getShippingZones } from "@/hooks/use-site-settings";
import { useCategories } from "@/hooks/use-categories";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

// Admin tabs are often left open all day. 30s polling on heavy aggregate
// queries was a primary contributor to VPS CPU exhaustion. Slow to 2 minutes
// and only when the tab is actually visible.
const REFRESH_INTERVAL_MS = 120_000;

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
  posCategoryPayment: { category: string; category_ar: string; cash: number; card: number }[];
  ordersByRegion: { region: string; order_count: number }[];
  ordersByCity: { city: string; order_count: number }[];
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
  const map: Record<string, { key: string; name: string; website: number; pos: number }> = {};
  for (const r of website) {
    const key = r.category;
    if (!map[key]) map[key] = { key, name: language === "ar" ? r.category_ar : r.category, website: 0, pos: 0 };
    map[key].website += Number(r.revenue);
  }
  for (const r of pos) {
    const key = r.category;
    if (!map[key]) map[key] = { key, name: language === "ar" ? r.category_ar : r.category, website: 0, pos: 0 };
    map[key].pos += Number(r.revenue);
  }
  return Object.values(map)
    .map((v) => ({ ...v, total: v.website + v.pos }))
    .sort((a, b) => b.total - a.total);
}

export default function Analytics() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const { data: siteSettings } = useSiteSettings();
  const { data: categoriesList } = useCategories();
  const categoryIdByName = new Map((categoriesList ?? []).map((c: any) => [c.name, c.id]));

  const last12 = getLast12Months();
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"sales" | "inventory">("sales");

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/category-inventory"],
    queryFn: async () => {
      const res = await fetch("/api/admin/category-inventory", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load inventory data");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });

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

  const reportsPageEnabled = siteSettings?.reports_page_enabled !== "false";

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

  // Merge website + POS cash/card per category
  const combinedPaymentByCategory = (() => {
    const map: Record<string, { category: string; category_ar: string; webCash: number; webCard: number; posCash: number; posCard: number }> = {};
    for (const r of (data?.paymentByCategory ?? [])) {
      if (!map[r.category]) map[r.category] = { category: r.category, category_ar: r.category_ar, webCash: 0, webCard: 0, posCash: 0, posCard: 0 };
      map[r.category].webCash += r.cash;
      map[r.category].webCard += r.card;
    }
    for (const r of (data?.posCategoryPayment ?? [])) {
      if (!map[r.category]) map[r.category] = { category: r.category, category_ar: r.category_ar, webCash: 0, webCard: 0, posCash: 0, posCard: 0 };
      map[r.category].posCash += r.cash;
      map[r.category].posCard += r.card;
    }
    return Object.values(map).sort((a, b) =>
      (b.webCash + b.webCard + b.posCash + b.posCard) - (a.webCash + a.webCard + a.posCash + a.posCard)
    );
  })();

  const paymentCategoryData = combinedPaymentByCategory.map((r) => ({
    name: isAr ? r.category_ar : r.category,
    cash: r.webCash + r.posCash,
    card: r.webCard + r.posCard,
  }));

  // Region name lookup from shipping zones settings
  const shippingZones = getShippingZones(siteSettings);
  const zoneNameMap: Record<string, string> = {};
  shippingZones.forEach(z => {
    zoneNameMap[z.id] = isAr ? (z.nameAr || z.nameEn) : z.nameEn;
  });

  const regionData = (data?.ordersByRegion ?? []).map(r => ({
    name: zoneNameMap[r.region] || r.region,
    value: r.order_count,
  }));

  const cityData = (data?.ordersByCity ?? []).map(r => ({
    name: r.city,
    orders: r.order_count,
  }));

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

  if (!reportsPageEnabled) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <BarChart2 className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">
            {isAr ? "صفحة التقارير معطّلة حالياً" : "The reports page is currently disabled"}
          </p>
          <p className="text-xs text-muted-foreground/70">
            {isAr
              ? "يمكن تفعيلها من صفحة محتوى الموقع"
              : "It can be re-enabled from the Site Content page"}
          </p>
        </div>
      </AdminLayout>
    );
  }

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
            <Link href="/admin/reports/categories" data-testid="link-category-manager">
              <Button variant="outline" size="sm" className="gap-1.5 h-9">
                <Wallet className="w-4 h-4" />
                {isAr ? "رأس مال الفئات" : "Category Manager"}
              </Button>
            </Link>
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

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 p-1 bg-muted rounded-xl w-fit">
        <button
          onClick={() => setActiveTab("sales")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "sales" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <BarChart3 className="w-4 h-4" />
          {isAr ? "تقرير المبيعات" : "Sales Report"}
        </button>
        <button
          onClick={() => setActiveTab("inventory")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === "inventory" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Warehouse className="w-4 h-4" />
          {isAr ? "المخزون والرأسمال" : "Inventory & Capital"}
        </button>
      </div>

      {activeTab === "sales" && <>
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
          <div dir="ltr"><ResponsiveContainer width="100%" height={300}>
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
          </ResponsiveContainer></div>
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
          <div dir="ltr"><ResponsiveContainer width="100%" height={Math.max(280, categoryData.length * 60)}>
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
          </ResponsiveContainer></div>
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
              <div dir="ltr"><ResponsiveContainer width="100%" height={260}>
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
              </ResponsiveContainer></div>
            )}
          </div>

          {/* Payment by Category (website + POS combined) */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-4 text-center">
              {isAr ? "حسب الفئة (موقع + نقطة بيع)" : "By category (Website + POS)"}
            </h3>
            {paymentCategoryData.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</div>
            ) : (
              <div dir="ltr"><ResponsiveContainer width="100%" height={Math.max(260, paymentCategoryData.length * 55)}>
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
              </ResponsiveContainer></div>
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
              <div dir="ltr"><ResponsiveContainer width="100%" height={300}>
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
              </ResponsiveContainer></div>
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
              <div dir="ltr"><ResponsiveContainer width="100%" height={300}>
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
              </ResponsiveContainer></div>
            )}
          </div>
        </div>
      )}

      {/* Orders by Region & City */}
      {(regionData.length > 0 || cityData.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

          {/* Region Pie Chart */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-rose-500" />
              {isAr ? "الطلبات حسب منطقة التوصيل" : "Orders by Shipping Region"}
              {selectedMonth && <span className="ms-2 text-xs font-normal text-muted-foreground">— {selectedLabel}</span>}
            </h2>
            {regionData.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</div>
            ) : (
              <>
                <div dir="ltr"><ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={regionData}
                      cx="50%" cy="50%" outerRadius={90}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: "#9ca3af", strokeWidth: 1 }}
                    >
                      {regionData.map((_, idx) => (
                        <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: number, name: string) => [
                        `${val} ${isAr ? "طلب" : "orders"}`,
                        name,
                      ]}
                      contentStyle={{ borderRadius: 8, fontSize: 13 }}
                    />
                  </PieChart>
                </ResponsiveContainer></div>
                <div className="mt-3 space-y-1.5">
                  {regionData.map((r, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm px-1">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full flex-none" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                        <span className="font-medium">{r.name}</span>
                      </div>
                      <span className="text-muted-foreground">{r.value} {isAr ? "طلب" : "orders"}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* City Bar Chart */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-500" />
              {isAr ? "الطلبات حسب المدينة" : "Orders by City"}
              {selectedMonth && <span className="ms-2 text-xs font-normal text-muted-foreground">— {selectedLabel}</span>}
            </h2>
            {cityData.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</div>
            ) : (
              <div dir="ltr"><ResponsiveContainer width="100%" height={Math.max(240, cityData.length * 36)}>
                <BarChart data={cityData} layout="vertical" margin={{ top: 0, right: 20, left: 8, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" className="text-border/40" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11, fill: "currentColor" }}
                    className="text-muted-foreground"
                  />
                  <Tooltip
                    formatter={(val: number) => [`${val} ${isAr ? "طلب" : "orders"}`]}
                    contentStyle={{ borderRadius: 8, fontSize: 13 }}
                  />
                  <Bar dataKey="orders" fill="#60a5fa" radius={[0, 4, 4, 0]} name={isAr ? "الطلبات" : "Orders"} />
                </BarChart>
              </ResponsiveContainer></div>
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
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "دفع عند التسليم" : "Cash on Delivery"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "بطاقة / إلكتروني" : "Card / Online"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "الإجمالي" : "Total"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "رأس المال" : "Capital"}</th>
                </tr>
              </thead>
              <tbody>
                {categoryData.map((row, i) => {
                  const payment = combinedPaymentByCategory.find((p) => p.category === row.key);
                  const cash = payment ? payment.webCash + payment.posCash : 0;
                  const card = payment ? payment.webCard + payment.posCard : 0;
                  const catId = categoryIdByName.get(row.key);
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`row-category-${i}`}>
                      <td className="py-3 px-3 font-medium">
                        {catId ? (
                          <Link
                            href={`/admin/reports/categories/${catId}`}
                            className="inline-flex items-center gap-1.5 hover:text-amber-600 dark:hover:text-amber-400 hover:underline transition-colors"
                            data-testid={`link-category-detail-${catId}`}
                          >
                            {row.name}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </Link>
                        ) : row.name}
                      </td>
                      <td className="py-3 px-3 text-end text-violet-600 dark:text-violet-400">{fmt(row.website)}</td>
                      <td className="py-3 px-3 text-end text-pink-600 dark:text-pink-400">{fmt(row.pos)}</td>
                      <td className="py-3 px-3 text-end text-amber-600 dark:text-amber-400">{fmt(cash)}</td>
                      <td className="py-3 px-3 text-end text-sky-600 dark:text-sky-400">{fmt(card)}</td>
                      <td className="py-3 px-3 text-end font-semibold">{fmt(row.total)}</td>
                      <td className="py-3 px-3 text-end">
                        {catId && (
                          <Link href={`/admin/reports/categories/${catId}`} data-testid={`button-view-capital-${catId}`}>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                              <Wallet className="w-3.5 h-3.5" />
                              {isAr ? "عرض" : "View"}
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/40">
                  <td className="py-3 px-3 font-bold">{isAr ? "المجموع" : "Total"}</td>
                  <td className="py-3 px-3 text-end font-bold text-violet-600 dark:text-violet-400">{fmt(websiteTotal)}</td>
                  <td className="py-3 px-3 text-end font-bold text-pink-600 dark:text-pink-400">{fmt(posTotal)}</td>
                  <td className="py-3 px-3 text-end font-bold text-amber-600 dark:text-amber-400">
                    {fmt(combinedPaymentByCategory.reduce((s, r) => s + r.webCash + r.posCash, 0))}
                  </td>
                  <td className="py-3 px-3 text-end font-bold text-sky-600 dark:text-sky-400">
                    {fmt(combinedPaymentByCategory.reduce((s, r) => s + r.webCard + r.posCard, 0))}
                  </td>
                  <td className="py-3 px-3 text-end font-bold">{fmt(combined)}</td>
                  <td className="py-3 px-3 text-end"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>}

      {/* ── INVENTORY TAB ─────────────────────────────────────────────── */}
      {activeTab === "inventory" && (
        <InventoryTab inventoryData={inventoryData ?? []} inventoryLoading={inventoryLoading} isAr={isAr} fmt={fmt} />
      )}

    </AdminLayout>
  );
}

function InventoryTab({ inventoryData, inventoryLoading, isAr, fmt }: {
  inventoryData: any[];
  inventoryLoading: boolean;
  isAr: boolean;
  fmt: (n: number) => string;
}) {
  const rows = inventoryData;
  const totalProducts = rows.reduce((s, r) => s + Number(r.product_count), 0);
  const totalUnits    = rows.reduce((s, r) => s + Number(r.total_units), 0);
  const totalValue    = rows.reduce((s, r) => s + Number(r.total_selling_value), 0);
  const totalCapital  = totalValue * 0.5;
  const totalInStock  = rows.reduce((s, r) => s + Number(r.in_stock_count), 0);
  const totalOOS      = rows.reduce((s, r) => s + Number(r.out_of_stock_count), 0);

  const summaryInv = [
    { label: isAr ? "إجمالي المنتجات" : "Total Products",           value: totalProducts.toLocaleString(), icon: Package,      color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/30" },
    { label: isAr ? "إجمالي الوحدات في المخزن" : "Total Stock Units", value: totalUnits.toLocaleString(),   icon: Warehouse,    color: "text-sky-600",    bg: "bg-sky-50 dark:bg-sky-950/30" },
    { label: isAr ? "قيمة المخزون (سعر البيع)" : "Inventory Value",   value: fmt(totalValue),                icon: ShoppingBag,  color: "text-emerald-600",bg: "bg-emerald-50 dark:bg-emerald-950/30" },
    { label: isAr ? "رأس المال المدفوع (50%)" : "Paid-up Capital (50%)", value: fmt(totalCapital),           icon: Banknote,     color: "text-amber-600",  bg: "bg-amber-50 dark:bg-amber-950/30" },
    { label: isAr ? "منتجات متوفرة" : "In-Stock Products",            value: totalInStock.toLocaleString(), icon: CheckCircle2, color: "text-teal-600",   bg: "bg-teal-50 dark:bg-teal-950/30" },
    { label: isAr ? "منتجات نفذت" : "Out-of-Stock Products",          value: totalOOS.toLocaleString(),     icon: AlertTriangle,color: "text-rose-600",   bg: "bg-rose-50 dark:bg-rose-950/30" },
  ];

  if (inventoryLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {[1,2,3,4,5,6].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {summaryInv.map((card) => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-full ${card.bg} flex items-center justify-center flex-shrink-0`}>
              <card.icon className={`w-5 h-5 ${card.color}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground leading-tight">{card.label}</p>
              <p className="text-lg font-semibold mt-0.5">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
          <Warehouse className="w-4 h-4 text-sky-500" />
          {isAr ? "تفصيل المخزون حسب الفئة" : "Inventory by Category"}
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          {isAr
            ? "رأس المال المدفوع = 50% من إجمالي قيمة البيع للمخزون الحالي"
            : "Paid-up capital = 50% of total selling value of current stock"}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start py-2 px-3 font-medium text-muted-foreground">{isAr ? "الفئة" : "Category"}</th>
                <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "عدد المنتجات" : "Products"}</th>
                <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "متوفر" : "In Stock"}</th>
                <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "نفذ" : "Out of Stock"}</th>
                <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "إجمالي الوحدات" : "Total Units"}</th>
                <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "متوسط السعر" : "Avg Price"}</th>
                <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "قيمة البيع" : "Selling Value"}</th>
                <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "رأس المال (50%)" : "Capital (50%)"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any, i: number) => {
                const sellingValue = Number(row.total_selling_value);
                const capital = sellingValue * 0.5;
                const inStockPct = row.product_count > 0
                  ? Math.round((row.in_stock_count / row.product_count) * 100)
                  : 0;
                return (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-3 font-medium">{isAr ? row.category_ar : row.category}</td>
                    <td className="py-3 px-3 text-end">{row.product_count}</td>
                    <td className="py-3 px-3 text-end">
                      <span className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400 font-medium">
                        {row.in_stock_count}
                        <span className="text-xs text-muted-foreground font-normal">({inStockPct}%)</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-end">
                      {row.out_of_stock_count > 0
                        ? <span className="text-rose-600 dark:text-rose-400 font-medium">{row.out_of_stock_count}</span>
                        : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="py-3 px-3 text-end text-sky-600 dark:text-sky-400">{Number(row.total_units).toLocaleString()}</td>
                    <td className="py-3 px-3 text-end text-muted-foreground">{fmt(Number(row.avg_price))}</td>
                    <td className="py-3 px-3 text-end text-emerald-600 dark:text-emerald-400 font-medium">{fmt(sellingValue)}</td>
                    <td className="py-3 px-3 text-end text-amber-600 dark:text-amber-400 font-semibold">{fmt(capital)}</td>
                  </tr>
                );
              })}
              <tr className="bg-muted/40 font-bold border-t-2 border-border">
                <td className="py-3 px-3">{isAr ? "المجموع" : "Total"}</td>
                <td className="py-3 px-3 text-end">{totalProducts}</td>
                <td className="py-3 px-3 text-end text-teal-600 dark:text-teal-400">{totalInStock}</td>
                <td className="py-3 px-3 text-end text-rose-600 dark:text-rose-400">{totalOOS}</td>
                <td className="py-3 px-3 text-end text-sky-600 dark:text-sky-400">{totalUnits.toLocaleString()}</td>
                <td className="py-3 px-3 text-end text-muted-foreground">—</td>
                <td className="py-3 px-3 text-end text-emerald-600 dark:text-emerald-400">{fmt(totalValue)}</td>
                <td className="py-3 px-3 text-end text-amber-600 dark:text-amber-400">{fmt(totalCapital)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
