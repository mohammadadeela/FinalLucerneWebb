import { useParams, Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/i18n";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Wallet, ArrowLeft, ArrowRight, Banknote, CreditCard, Globe, Monitor,
  Warehouse, Package, Trophy, Layers, TrendingUp, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const WEBSITE_COLOR = "#7C6EFA";
const POS_COLOR = "#F06292";
const WEBSITE_CASH_COLOR = "#0d9488";
const WEBSITE_CARD_COLOR = "#0284c7";
const POS_CASH_COLOR = "#d97706";
const POS_CARD_COLOR = "#db2777";

interface CategoryReportData {
  category: {
    id: number;
    name: string;
    nameAr: string;
    image: string | null;
  };
  capital: {
    productCount: number;
    inStockCount: number;
    outOfStockCount: number;
    totalUnits: number;
    avgPrice: number;
    sellingValue: number;
    paidUpCapital: number;
  };
  website: { revenue: number; units: number; orderCount: number; cash: number; card: number };
  pos: { revenue: number; units: number; orderCount: number; cash: number; card: number };
  subcategories: {
    id: number; name: string; nameAr: string; isActive: boolean; productCount: number;
    websiteRevenue: number; websiteUnits: number; posRevenue: number; posUnits: number; totalRevenue: number;
  }[];
  bestSellers: {
    id: number; name: string; image: string | null;
    webUnits: number; webRevenue: number; posUnits: number; posRevenue: number;
    totalUnits: number; totalRevenue: number;
  }[];
  monthly: { website: { month: string; revenue: string }[]; pos: { month: string; revenue: string }[] };
  daily: { website: { day: string; revenue: string }[]; pos: { day: string; revenue: string }[] };
  monthlyPayment: {
    websiteCash: { period: string; revenue: number }[];
    websiteCard: { period: string; revenue: number }[];
    posCash: { period: string; revenue: number }[];
    posCard: { period: string; revenue: number }[];
  };
  weeklyPayment: {
    websiteCash: { period: string; revenue: number }[];
    websiteCard: { period: string; revenue: number }[];
    posCash: { period: string; revenue: number }[];
    posCard: { period: string; revenue: number }[];
  };
}

function buildTimeline(website: { month?: string; day?: string; revenue: string }[], pos: { month?: string; day?: string; revenue: string }[], key: "month" | "day") {
  const webMap = Object.fromEntries(website.map((r: any) => [r[key], Number(r.revenue)]));
  const posMap = Object.fromEntries(pos.map((r: any) => [r[key], Number(r.revenue)]));
  const keys = Array.from(new Set([...Object.keys(webMap), ...Object.keys(posMap)])).sort();
  return keys.map((k) => ({ label: k, website: webMap[k] ?? 0, pos: posMap[k] ?? 0 }));
}

// Merges the 4 separate payment-type series (website cash/card, POS cash/card)
// into one array keyed by period, for a single 4-series bar chart.
function buildPaymentTimeline(payment: {
  websiteCash: { period: string; revenue: number }[];
  websiteCard: { period: string; revenue: number }[];
  posCash: { period: string; revenue: number }[];
  posCard: { period: string; revenue: number }[];
}) {
  const maps = {
    websiteCash: Object.fromEntries(payment.websiteCash.map((r) => [r.period, r.revenue])),
    websiteCard: Object.fromEntries(payment.websiteCard.map((r) => [r.period, r.revenue])),
    posCash: Object.fromEntries(payment.posCash.map((r) => [r.period, r.revenue])),
    posCard: Object.fromEntries(payment.posCard.map((r) => [r.period, r.revenue])),
  };
  const keys = Array.from(new Set([
    ...Object.keys(maps.websiteCash), ...Object.keys(maps.websiteCard),
    ...Object.keys(maps.posCash), ...Object.keys(maps.posCard),
  ])).sort();
  return keys.map((k) => ({
    label: k,
    websiteCash: maps.websiteCash[k] ?? 0,
    websiteCard: maps.websiteCard[k] ?? 0,
    posCash: maps.posCash[k] ?? 0,
    posCard: maps.posCard[k] ?? 0,
  }));
}

export default function CategoryReportDetail() {
  const params = useParams<{ id: string }>();
  const categoryId = params.id;
  const { language } = useLanguage();
  const isAr = language === "ar";
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const { data, isLoading, error } = useQuery<CategoryReportData>({
    queryKey: [`/api/admin/category-report/${categoryId}`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/category-report/${categoryId}`, { credentials: "include" });
      if (!res.ok) {
        let detail = "";
        try { detail = (await res.json())?.message || ""; } catch {}
        throw new Error(detail || "Failed to load category report");
      }
      return res.json();
    },
    enabled: !!categoryId,
  });

  const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="h-8 w-56 bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
          </div>
          <div className="h-80 bg-muted animate-pulse rounded-xl" />
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <div className="text-destructive p-6">
          <p>{isAr ? "فشل تحميل بيانات الفئة" : "Failed to load category report."}</p>
          {error instanceof Error && error.message && (
            <p className="text-xs text-muted-foreground mt-2" dir="ltr">{error.message}</p>
          )}
        </div>
      </AdminLayout>
    );
  }

  const { category, capital, website, pos, subcategories, bestSellers } = data;
  const combinedRevenue = website.revenue + pos.revenue;
  const combinedCash = website.cash + pos.cash;
  const combinedCard = website.card + pos.card;
  const inStockPct = capital.productCount > 0 ? Math.round((capital.inStockCount / capital.productCount) * 100) : 0;

  const monthlyData = buildTimeline(data.monthly.website, data.monthly.pos, "month").map((d) => ({
    ...d,
    label: d.label.slice(2), // yyyy-MM -> MM for compact axis; keep tooltip full
    full: d.label,
  }));
  const dailyData = buildTimeline(data.daily.website, data.daily.pos, "day").map((d) => ({
    ...d,
    label: d.label.slice(5), // yyyy-MM-DD -> MM-DD
    full: d.label,
  }));
  const monthlyPaymentData = buildPaymentTimeline(data.monthlyPayment).map((d) => ({
    ...d,
    label: d.label.slice(2), // yyyy-MM -> MM
    full: d.label,
  }));
  const weeklyPaymentData = buildPaymentTimeline(data.weeklyPayment).map((d) => ({
    ...d,
    label: d.label.slice(5), // yyyy-MM-DD (week start) -> MM-DD
    full: d.label,
  }));

  const paymentCards = [
    { label: isAr ? "الموقع — دفع عند التسليم" : "Website — Cash", value: fmt(website.cash), icon: Banknote, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950/30" },
    { label: isAr ? "الموقع — بطاقة/إلكتروني" : "Website — Card", value: fmt(website.card), icon: CreditCard, color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-950/30" },
    { label: isAr ? "نقطة البيع — كاش" : "POS — Cash", value: fmt(pos.cash), icon: Banknote, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/30" },
    { label: isAr ? "نقطة البيع — بطاقة" : "POS — Card", value: fmt(pos.card), icon: CreditCard, color: "text-pink-600", bg: "bg-pink-50 dark:bg-pink-950/30" },
  ];

  const paymentSeriesLabel = (name: string) => {
    switch (name) {
      case "websiteCash": return isAr ? "الموقع — دفع عند التسليم" : "Website — Cash";
      case "websiteCard": return isAr ? "الموقع — بطاقة/إلكتروني" : "Website — Card";
      case "posCash": return isAr ? "نقطة البيع — كاش" : "POS — Cash";
      case "posCard": return isAr ? "نقطة البيع — بطاقة" : "POS — Card";
      default: return name;
    }
  };

  return (
    <AdminLayout>
      <AdminPageHeader
        title={isAr ? (category.nameAr || category.name) : category.name}
        description={isAr ? "رأس المال، الفئات الفرعية، ومبيعات الموقع ونقطة البيع بالتفصيل" : "Capital, subcategories, and full website + POS sales breakdown"}
        icon={Wallet}
        iconGradient="from-amber-500 to-orange-600"
        testId="text-category-report-title"
        actions={
          <Link href="/admin/reports/categories" data-testid="link-back-category-reports">
            <Button variant="outline" size="sm" className="gap-1.5">
              <BackArrow className="w-4 h-4" />
              {isAr ? "كل الفئات" : "All categories"}
            </Button>
          </Link>
        }
      />

      {/* Capital & revenue summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard label={isAr ? "رأس المال (50%)" : "Paid-up Capital (50%)"} value={fmt(capital.paidUpCapital)} icon={Wallet} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-950/30" testId="capital" />
        <SummaryCard label={isAr ? "قيمة المخزون" : "Inventory Value"} value={fmt(capital.sellingValue)} icon={Warehouse} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-950/30" testId="inventory-value" />
        <SummaryCard label={isAr ? "أرباح الموقع" : "Website Revenue"} value={fmt(website.revenue)} icon={Globe} color="text-violet-600" bg="bg-violet-50 dark:bg-violet-950/30" testId="website-revenue" />
        <SummaryCard label={isAr ? "أرباح نقطة البيع" : "POS Revenue"} value={fmt(pos.revenue)} icon={Monitor} color="text-pink-600" bg="bg-pink-50 dark:bg-pink-950/30" testId="pos-revenue" />
        <SummaryCard label={isAr ? "الإجمالي الكلي" : "Combined Revenue"} value={fmt(combinedRevenue)} icon={TrendingUp} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-950/30" testId="combined-revenue" />
        <SummaryCard label={isAr ? "عدد المنتجات" : "Products"} value={String(capital.productCount)} icon={Package} color="text-slate-600" bg="bg-slate-50 dark:bg-slate-900/30" testId="product-count" />
        <SummaryCard label={isAr ? "متوفر" : "In Stock"} value={`${capital.inStockCount} (${inStockPct}%)`} icon={CheckCircle2} color="text-teal-600" bg="bg-teal-50 dark:bg-teal-950/30" testId="in-stock" />
        <SummaryCard label={isAr ? "نفذ من المخزون" : "Out of Stock"} value={String(capital.outOfStockCount)} icon={AlertTriangle} color="text-rose-600" bg="bg-rose-50 dark:bg-rose-950/30" testId="out-of-stock" />
      </div>

      {/* Payment breakdown — website & POS, cash & card each shown separately */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-sky-500" />
          {isAr ? "طريقة الدفع — الموقع ونقطة البيع" : "Payment Method — Website & POS"}
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          {isAr ? "الكاش والبطاقة لكل قناة على حدة" : "Cash and card shown separately for each channel"}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {paymentCards.map((card) => (
            <div key={card.label} className="bg-muted/30 border border-border rounded-lg p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${card.bg} flex items-center justify-center flex-shrink-0`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground leading-tight">{card.label}</p>
                <p className="text-base font-semibold mt-0.5">{card.value}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-border text-sm">
          <div>
            <span className="text-muted-foreground">{isAr ? "إجمالي الكاش: " : "Total Cash: "}</span>
            <span className="font-semibold text-teal-600 dark:text-teal-400">{fmt(combinedCash)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{isAr ? "إجمالي البطاقة: " : "Total Card: "}</span>
            <span className="font-semibold text-sky-600 dark:text-sky-400">{fmt(combinedCard)}</span>
          </div>
        </div>
      </div>

      {/* Monthly revenue chart */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1">{isAr ? "الأرباح الشهرية" : "Monthly Revenue"}</h2>
        <p className="text-sm text-muted-foreground mb-6">{isAr ? "آخر ١٢ شهراً — الموقع مقابل نقطة البيع" : "Last 12 months — Website vs POS"}</p>
        {monthlyData.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</div>
        ) : (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} width={70} />
                <Tooltip
                  formatter={(val: number, name: string) => [`₪${val.toFixed(2)}`, name === "website" ? (isAr ? "الموقع" : "Website") : (isAr ? "نقطة البيع" : "POS")]}
                  labelFormatter={(_, payload) => (payload && payload[0] ? (payload[0].payload as any).full : "")}
                  contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))" }}
                />
                <Legend formatter={(val) => val === "website" ? (isAr ? "الموقع" : "Website") : (isAr ? "نقطة البيع" : "POS")} />
                <Bar dataKey="website" fill={WEBSITE_COLOR} radius={[4, 4, 0, 0]} name="website" />
                <Bar dataKey="pos" fill={POS_COLOR} radius={[4, 4, 0, 0]} name="pos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Daily revenue chart */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1">{isAr ? "الأرباح اليومية" : "Daily Revenue"}</h2>
        <p className="text-sm text-muted-foreground mb-6">{isAr ? "آخر ٣٠ يوماً — الموقع مقابل نقطة البيع" : "Last 30 days — Website vs POS"}</p>
        {dailyData.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</div>
        ) : (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dailyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} width={70} />
                <Tooltip
                  formatter={(val: number, name: string) => [`₪${val.toFixed(2)}`, name === "website" ? (isAr ? "الموقع" : "Website") : (isAr ? "نقطة البيع" : "POS")]}
                  labelFormatter={(_, payload) => (payload && payload[0] ? (payload[0].payload as any).full : "")}
                  contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))" }}
                />
                <Legend formatter={(val) => val === "website" ? (isAr ? "الموقع" : "Website") : (isAr ? "نقطة البيع" : "POS")} />
                <Bar dataKey="website" fill={WEBSITE_COLOR} radius={[3, 3, 0, 0]} name="website" />
                <Bar dataKey="pos" fill={POS_COLOR} radius={[3, 3, 0, 0]} name="pos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Weekly payment-type breakdown */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-sky-500" />
          {isAr ? "المدفوعات الأسبوعية" : "Weekly Payments"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {isAr
            ? "آخر ١٢ أسبوعاً — الموقع (كاش/بطاقة) ونقطة البيع (كاش/بطاقة) كل على حدة"
            : "Last 12 weeks — Website (cash/card) and POS (cash/card) shown separately"}
        </p>
        {weeklyPaymentData.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</div>
        ) : (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weeklyPaymentData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} width={70} />
                <Tooltip
                  formatter={(val: number, name: string) => [`₪${val.toFixed(2)}`, paymentSeriesLabel(name)]}
                  labelFormatter={(_, payload) => (payload && payload[0] ? (payload[0].payload as any).full : "")}
                  contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))" }}
                />
                <Legend formatter={(val) => paymentSeriesLabel(val)} />
                <Bar dataKey="websiteCash" fill={WEBSITE_CASH_COLOR} radius={[3, 3, 0, 0]} name="websiteCash" />
                <Bar dataKey="websiteCard" fill={WEBSITE_CARD_COLOR} radius={[3, 3, 0, 0]} name="websiteCard" />
                <Bar dataKey="posCash" fill={POS_CASH_COLOR} radius={[3, 3, 0, 0]} name="posCash" />
                <Bar dataKey="posCard" fill={POS_CARD_COLOR} radius={[3, 3, 0, 0]} name="posCard" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Monthly payment-type breakdown */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-amber-500" />
          {isAr ? "المدفوعات الشهرية" : "Monthly Payments"}
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          {isAr
            ? "آخر ١٢ شهراً — الموقع (كاش/بطاقة) ونقطة البيع (كاش/بطاقة) كل على حدة"
            : "Last 12 months — Website (cash/card) and POS (cash/card) shown separately"}
        </p>
        {monthlyPaymentData.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">{isAr ? "لا توجد بيانات بعد" : "No data yet"}</div>
        ) : (
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyPaymentData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₪${v}`} width={70} />
                <Tooltip
                  formatter={(val: number, name: string) => [`₪${val.toFixed(2)}`, paymentSeriesLabel(name)]}
                  labelFormatter={(_, payload) => (payload && payload[0] ? (payload[0].payload as any).full : "")}
                  contentStyle={{ borderRadius: 8, fontSize: 13, border: "1px solid hsl(var(--border))" }}
                />
                <Legend formatter={(val) => paymentSeriesLabel(val)} />
                <Bar dataKey="websiteCash" fill={WEBSITE_CASH_COLOR} radius={[3, 3, 0, 0]} name="websiteCash" />
                <Bar dataKey="websiteCard" fill={WEBSITE_CARD_COLOR} radius={[3, 3, 0, 0]} name="websiteCard" />
                <Bar dataKey="posCash" fill={POS_CASH_COLOR} radius={[3, 3, 0, 0]} name="posCash" />
                <Bar dataKey="posCard" fill={POS_CARD_COLOR} radius={[3, 3, 0, 0]} name="posCard" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Best sellers */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          {isAr ? "الأكثر مبيعاً في هذه الفئة" : "Best Sellers in this Category"}
        </h2>
        {bestSellers.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد مبيعات بعد" : "No sales yet"}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start py-2 px-3 font-medium text-muted-foreground">#</th>
                  <th className="text-start py-2 px-3 font-medium text-muted-foreground">{isAr ? "المنتج" : "Product"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "قطع الموقع" : "Website Units"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "قطع نقطة البيع" : "POS Units"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "إجمالي القطع" : "Total Units"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "الإجمالي" : "Revenue"}</th>
                </tr>
              </thead>
              <tbody>
                {bestSellers.map((p, i) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`row-bestseller-${i}`}>
                    <td className="py-3 px-3 text-muted-foreground">{i + 1}</td>
                    <td className="py-3 px-3 font-medium flex items-center gap-2">
                      {p.image && <img src={p.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />}
                      <span className="truncate">{p.name}</span>
                      {i === 0 && <Trophy className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                    </td>
                    <td className="py-3 px-3 text-end text-violet-600 dark:text-violet-400">{p.webUnits}</td>
                    <td className="py-3 px-3 text-end text-pink-600 dark:text-pink-400">{p.posUnits}</td>
                    <td className="py-3 px-3 text-end font-medium">{p.totalUnits}</td>
                    <td className="py-3 px-3 text-end font-semibold">{fmt(p.totalRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Subcategories breakdown */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-500" />
          {isAr ? "الفئات الفرعية" : "Subcategories"}
        </h2>
        {subcategories.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">{isAr ? "لا توجد فئات فرعية لهذه الفئة" : "This category has no subcategories"}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-start py-2 px-3 font-medium text-muted-foreground">{isAr ? "الفئة الفرعية" : "Subcategory"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "المنتجات" : "Products"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "أرباح الموقع" : "Website Revenue"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "أرباح نقطة البيع" : "POS Revenue"}</th>
                  <th className="text-end py-2 px-3 font-medium text-muted-foreground">{isAr ? "الإجمالي" : "Total"}</th>
                </tr>
              </thead>
              <tbody>
                {subcategories.map((s) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`row-subcategory-${s.id}`}>
                    <td className="py-3 px-3 font-medium">
                      {isAr ? s.nameAr || s.name : s.name}
                      {!s.isActive && (
                        <span className="ms-2 text-xs text-muted-foreground">({isAr ? "غير مفعّلة" : "inactive"})</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-end">{s.productCount}</td>
                    <td className="py-3 px-3 text-end text-violet-600 dark:text-violet-400">{fmt(s.websiteRevenue)}</td>
                    <td className="py-3 px-3 text-end text-pink-600 dark:text-pink-400">{fmt(s.posRevenue)}</td>
                    <td className="py-3 px-3 text-end font-semibold">{fmt(s.totalRevenue)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/40">
                  <td className="py-3 px-3 font-bold">{isAr ? "المجموع" : "Total"}</td>
                  <td className="py-3 px-3 text-end font-bold">{subcategories.reduce((s, r) => s + r.productCount, 0)}</td>
                  <td className="py-3 px-3 text-end font-bold text-violet-600 dark:text-violet-400">{fmt(subcategories.reduce((s, r) => s + r.websiteRevenue, 0))}</td>
                  <td className="py-3 px-3 text-end font-bold text-pink-600 dark:text-pink-400">{fmt(subcategories.reduce((s, r) => s + r.posRevenue, 0))}</td>
                  <td className="py-3 px-3 text-end font-bold">{fmt(subcategories.reduce((s, r) => s + r.totalRevenue, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function SummaryCard({ label, value, icon: Icon, color, bg, testId }: { label: string; value: string; icon: any; color: string; bg: string; testId: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3" data-testid={`card-${testId}`}>
      <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        <p className="text-base font-semibold mt-0.5" data-testid={`value-${testId}`}>{value}</p>
      </div>
    </div>
  );
}
