import { useState, useEffect, useMemo } from "react";
import { useLocation, Link, useSearch } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { useOrders, useOrder } from "@/hooks/use-orders";
import { useProducts } from "@/hooks/use-products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, User, LogOut, ExternalLink, Clock, Truck, PackageCheck, XCircle, CheckCircle2, Search, X, Eye, Sparkles, Gift, Shield, ArrowLeft, ArrowRight, Mail, Settings, ArrowLeftRight } from "lucide-react";
import { AccountSettingsDialog } from "@/components/profile/AccountSettingsDialog";
import { ExchangeRequestDialog, type ExchangeItemType } from "@/components/profile/ExchangeRequestDialog";
import { MyExchangesList } from "@/components/profile/MyExchangesList";
import { format } from "date-fns";
import { useLanguage } from "@/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import { useCategories } from "@/hooks/use-categories";

export default function Profile() {
  const { data: user, isLoading } = useAuth();
  const { data: orders } = useOrders();
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const ar = language === "ar";
  const showRoleBadge = user?.role !== "customer";

  const { data: siteSettings } = useSiteSettings();
  const { data: categories = [] } = useCategories();
  const { data: subcategories = [] } = useQuery<any[]>({
    queryKey: ["/api/subcategories"],
  });
  const loyaltyPointsEnabled = siteSettings?.loyalty_points_enabled !== "false";

  const { data: loyalty } = useQuery<{ points: number; credit: string; pointsPerCredit: number; creditPerConversion: number; nextConversionIn: number }>({
    queryKey: ["/api/loyalty"],
    enabled: loyaltyPointsEnabled,
  });

  const [convertPointsInput, setConvertPointsInput] = useState<string>("");
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const convertMutation = useMutation({
    mutationFn: async (points?: number) => {
      const res = await fetch("/api/loyalty/convert", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: points ? JSON.stringify({ points }) : "{}",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty"] });
      toast({
        title: ar ? "تم التحويل بنجاح" : "Converted successfully",
        description: ar
          ? `أُضيف ₪${data.creditAdded} إلى رصيدك (تم استخدام ${data.converted} نقطة)`
          : `Added ₪${data.creditAdded} to your balance (used ${data.converted} points)`,
      });
    },
    onError: (err: any) => {
      toast({
        title: ar ? "تعذّر التحويل" : "Cannot convert",
        description: ar ? "تحتاجين إلى 450 نقطة على الأقل" : "You need at least 450 points",
        variant: "destructive",
      });
    },
  });
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const { data: orderDetails } = useOrder(selectedOrderId || 0);
  const [showDetails, setShowDetails] = useState(false);
  // Already-submitted exchange requests — used to block duplicates on the client
  const { data: myExchangeRequests } = useQuery<{ id: number; orderItemId: number; status: string }[]>({
    queryKey: ["/api/exchange-requests"],
    enabled: !!user,
  });
  const exchangedItemIds = useMemo(
    () => new Set((myExchangeRequests ?? []).map(r => r.orderItemId)),
    [myExchangeRequests]
  );
  const [activeTab, setActiveTab] = useState<"orders" | "recently_viewed" | "exchanges">("orders");
  const [exchangeSubTab, setExchangeSubTab] = useState<"eligible" | "submitted">("eligible");
  const [exchangeSubmittedFilter, setExchangeSubmittedFilter] = useState<"all" | "pending" | "approved" | "denied">("all");
  const [eligibleSort, setEligibleSort] = useState<"all" | "newest" | "oldest">("all");
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [exchangeItem, setExchangeItem] = useState<{ orderId: number; items: ExchangeItemType[]; clickedItemId: number } | null>(null);
  const exchangesEnabled = siteSettings?.exchanges_enabled !== "false";

  // Handle ?order= URL param — open that order's dialog and scroll to orders section
  useEffect(() => {
    const urlOrderId = new URLSearchParams(searchString).get("order");
    if (!urlOrderId) return;
    const id = Number(urlOrderId);
    if (!Number.isFinite(id) || id <= 0) return;
    setActiveTab("orders");
    setSelectedOrderId(id);
    setShowDetails(true);
    setTimeout(() => {
      document.getElementById("orders-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  }, [searchString]);

  // Handle ?tab= and ?subtab= URL params — e.g. from exchange toast notification
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const tab = params.get("tab");
    const subtab = params.get("subtab");
    if (!tab) return;
    if (tab === "exchanges") {
      setActiveTab("exchanges");
      if (subtab === "submitted") setExchangeSubTab("submitted");
      else if (subtab === "eligible") setExchangeSubTab("eligible");
      setTimeout(() => {
        document.getElementById("exchanges-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    } else if (tab === "orders") {
      setActiveTab("orders");
    } else if (tab === "recently_viewed") {
      setActiveTab("recently_viewed");
    }
  }, [searchString]);
  const EXCHANGE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
  const parseIdList = (raw: string | undefined): Set<number> => {
    if (!raw) return new Set();
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return new Set();
      return new Set(arr.map((x: any) => Number(x)).filter((n) => Number.isFinite(n)));
    } catch { return new Set(); }
  };
  const excludedCategoryIds = useMemo(
    () => parseIdList(siteSettings?.exchange_excluded_category_ids),
    [siteSettings?.exchange_excluded_category_ids]
  );
  const excludedSubcategoryIds = useMemo(
    () => parseIdList(siteSettings?.exchange_excluded_subcategory_ids),
    [siteSettings?.exchange_excluded_subcategory_ids]
  );
  const isDressProduct = (item: any) => {
    const product = item?.product;
    if (!product) return false;
    return (
      (product.categoryId != null && excludedCategoryIds.has(Number(product.categoryId))) ||
      (product.subcategoryId != null && excludedSubcategoryIds.has(Number(product.subcategoryId)))
    );
  };
  const isItemExchangeable = (order: any, item: any): { ok: boolean; reason?: string } => {
    if (!exchangesEnabled) return { ok: false, reason: ar ? "خدمة الاستبدال غير متاحة حالياً" : "Exchanges disabled" };
    if (order.status !== "Delivered") return { ok: false };
    const orderTime = new Date(order.createdAt).getTime();
    if (isNaN(orderTime) || Date.now() - orderTime > EXCHANGE_WINDOW_MS)
      return { ok: false, reason: ar ? "انتهت مهلة الاستبدال (3 أيام)" : "Exchange window expired (3 days)" };
    // Product was deleted — cannot exchange
    if (item?.product === null) return { ok: false, reason: ar ? "المنتج لم يعد متوفراً" : "Product no longer available" };
    if (isDressProduct(item)) return { ok: false, reason: ar ? "هذا التصنيف غير قابل للاستبدال" : "This category is not exchangeable" };
    // Already submitted an exchange for this item
    if (exchangedItemIds.has(item.id)) return { ok: false, reason: ar ? "تم تقديم طلب استبدال لهذا المنتج مسبقاً" : "Exchange already requested for this item" };
    return { ok: true };
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const { data: allProducts } = useProducts();
  const recentlyViewedIds: number[] = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("recently_viewed") || "[]"); } catch { return []; }
  }, []);
  const recentlyViewed = useMemo(() => {
    if (!allProducts || recentlyViewedIds.length === 0) return [];
    return recentlyViewedIds
      .map((rid) => allProducts.find((p) => p.id === rid))
      .filter(Boolean) as NonNullable<typeof allProducts[number]>[];
  }, [allProducts, recentlyViewedIds]);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(order => {
      const matchesStatus = statusFilter === "All" || order.status === statusFilter;
      const matchesSearch = !searchQuery.trim() ||
        order.id.toString().includes(searchQuery.trim()) ||
        order.id.toString().padStart(6, "0").includes(searchQuery.trim());
      return matchesStatus && matchesSearch;
    });
  }, [orders, statusFilter, searchQuery]);

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth");
    }
  }, [isLoading, user, setLocation]);

  useEffect(() => {
    if (!exchangesEnabled && activeTab === "exchanges") {
      setActiveTab("orders");
    }
  }, [exchangesEnabled, activeTab]);

  if (isLoading || !user) return null;

  const handleLogout = async () => {
    await logout.mutateAsync();
    setLocation("/");
  };

  const statusConfig: Record<string, { icon: any; bg: string; border: string; text: string; dot: string }> = {
    Pending:   { icon: Clock,        bg: "bg-amber-50",  border: "border-amber-300", text: "text-amber-700",  dot: "bg-amber-400"  },
    OnTheWay:  { icon: Truck,        bg: "bg-blue-50",   border: "border-blue-300",  text: "text-blue-700",   dot: "bg-blue-500"   },
    Delivered: { icon: PackageCheck, bg: "bg-green-50",  border: "border-green-300", text: "text-green-700",  dot: "bg-green-500"  },
    Cancelled: { icon: XCircle,      bg: "bg-red-50",    border: "border-red-300",   text: "text-red-600",    dot: "bg-red-400"    },
  };

  const getStatusBadge = (status: string) => {
    const cfg = statusConfig[status] || statusConfig.Pending;
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold rounded-full ${cfg.bg} ${cfg.border} ${cfg.text}`}>
        <Icon className="w-3.5 h-3.5" />
        {(t.orderStatus as any)?.[status] || status}
      </span>
    );
  };

  const PROGRESS_STEPS = ["Pending", "OnTheWay", "Delivered"] as const;
  const getProgressTracker = (status: string) => {
    if (status === "Cancelled") {
      return (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">{(t.orderStatus as any)?.["Cancelled"] || "Cancelled"}</p>
            <p className="text-xs text-red-500 mt-0.5">{"تم إلغاء هذا الطلب"}</p>
          </div>
        </div>
      );
    }
    const currentIdx = PROGRESS_STEPS.indexOf(status as any);
    return (
      <div className="relative flex items-center justify-between px-0.5 sm:px-2">
        {PROGRESS_STEPS.map((step, i) => {
          const done = i <= currentIdx;
          const active = i === currentIdx;
          const cfg = statusConfig[step];
          const Icon = cfg.icon;
          return (
            <div key={step} className="flex-1 flex flex-col items-center relative">
              {i < PROGRESS_STEPS.length - 1 && (
                <div className={`absolute top-3.5 sm:top-4 start-1/2 w-full h-0.5 transition-colors ${i < currentIdx ? "bg-green-400" : "bg-border"}`} />
              )}
              <div className={`relative z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                active ? `${cfg.dot} border-transparent shadow-md scale-110` :
                done   ? "bg-green-500 border-transparent" :
                         "bg-background border-border"
              }`}>
                <Icon className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${done || active ? "text-white" : "text-muted-foreground"}`} />
              </div>
              <p className={`mt-1.5 sm:mt-2 text-[8px] sm:text-[10px] font-semibold text-center leading-tight ${active ? cfg.text : done ? "text-green-600" : "text-muted-foreground"}`}>
                {(t.orderStatus as any)?.[step] || step}
              </p>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row justify-between items-baseline mb-8 sm:mb-12 border-b border-border pb-6">
          <h1 className="font-display text-3xl sm:text-4xl font-semibold" data-testid="text-profile-title">{t.profile.myAccount}</h1>
          <Button variant="ghost" onClick={handleLogout} className="text-muted-foreground hover:text-destructive" data-testid="button-profile-logout">
            <LogOut className="w-4 h-4 me-2" /> {t.profile.logout}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
          <div className="md:col-span-1 space-y-8">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-gradient-to-br from-secondary via-secondary to-background p-5 sm:p-6 shadow-sm">
              {/* decorative gradient blob */}
              <div className="absolute -top-12 -end-12 w-40 h-40 bg-foreground/5 rounded-full blur-2xl pointer-events-none" />

              <div className="relative flex items-start gap-4 mb-5">
                <div className="relative flex-shrink-0">
                  <div className="w-14 h-14 bg-foreground text-background rounded-full flex items-center justify-center font-display text-xl shadow-md ring-4 ring-background">
                    {user.fullName ? user.fullName[0].toUpperCase() : <User className="w-6 h-6" />}
                  </div>
                  {user.role === 'admin' && (
                    <span className="absolute -bottom-1 -end-1 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center ring-2 ring-background" title="Admin">
                      <Shield className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <h3 className="font-semibold text-lg leading-tight truncate" data-testid="text-user-name">{user.fullName || "User"}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setAccountSettingsOpen(true)}
                    className="h-10 w-full sm:w-auto rounded-full justify-center sm:justify-start gap-2 border-border/70 bg-background/70 px-4 hover:border-foreground/40 hover:bg-background"
                    style={{ fontSize: 0 }}
                    data-testid="button-account-settings"
                  >
                    <Settings className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                      {ar ? "إعدادات الحساب" : "Account Settings"}
                    </span>
                    {ar ? "Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª Ø§Ù„Ø­Ø³Ø§Ø¨" : "Account Settings"}
                  </Button>
                </div>
              </div>

              <div className="relative border-t border-border/60 pt-4 space-y-3">
                {showRoleBadge && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.profile.role}</span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      user.role === 'admin'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                    }`}>
                      {user.role === 'admin' && <Shield className="w-3 h-3" />}
                      <span className="capitalize">{user.role}</span>
                    </span>
                  </div>
                )}

                {user.role === 'admin' && (
                  <Link href="/admin">
                    <Button
                      className="group relative w-full mt-2 rounded-lg bg-foreground text-background hover:bg-foreground/90 shadow-sm hover:shadow-md transition-all duration-200 font-semibold gap-2 overflow-hidden"
                      data-testid="link-admin-dashboard"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                      <Sparkles className="w-4 h-4 relative" />
                      <span className="relative">{t.nav.adminDashboard}</span>
                      {language === "ar" ? (
                        <ArrowLeft className="w-4 h-4 relative ms-auto group-hover:-translate-x-1 transition-transform" />
                      ) : (
                        <ArrowRight className="w-4 h-4 relative ms-auto group-hover:translate-x-1 transition-transform" />
                      )}
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {/* Loyalty Rewards Card */}
            {loyaltyPointsEnabled && (() => {
                const points = loyalty?.points ?? 0;
                const credit = Number(loyalty?.credit ?? 0);
                const cyclePoints = points % 450;
                const progressPct = Math.min(100, (cyclePoints / 450) * 100);
                const remaining = points >= 450 ? 0 : 450 - points;
                return (
                  <div className="relative overflow-hidden rounded-2xl text-white shadow-lg" data-testid="card-loyalty">
                    {/* Background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-rose-500 to-pink-600" />
                    <div className="absolute -top-12 -end-12 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
                    <div className="absolute -bottom-16 -start-10 w-44 h-44 rounded-full bg-white/10 blur-2xl" />

                    <div className="relative p-6">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <h3 className="font-semibold text-sm tracking-wide">{ar ? "نقاطي" : "Loyalty Rewards"}</h3>
                        </div>
                        <span className="text-[10px] uppercase tracking-widest bg-white/15 px-2 py-1 rounded-full backdrop-blur">
                          Lucerne
                        </span>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-3 mb-5">
                        <div>
                          <p className="text-[10px] uppercase tracking-widest text-white/70 mb-1">{ar ? "نقاطك" : "Points"}</p>
                          <p className="text-3xl font-bold" data-testid="text-loyalty-points">{points.toLocaleString()}</p>
                        </div>
                        <div className="text-end">
                          <p className="text-[10px] uppercase tracking-widest text-white/70 mb-1">{ar ? "رصيدك" : "Credit"}</p>
                          <p className="text-3xl font-bold" data-testid="text-loyalty-credit">₪{credit.toFixed(2)}</p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mb-2 flex items-center justify-between text-[11px] text-white/80">
                        <span>{cyclePoints} / 450</span>
                        <span>{remaining > 0 ? (ar ? `${remaining} للحصول على 15 ₪` : `${remaining} pts → ₪15`) : (ar ? "جاهزة للتحويل!" : "Ready to redeem!")}</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/20 overflow-hidden mb-5">
                        <div
                          className="h-full bg-white rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>

                      {/* Rule */}
                      <p className="text-[11px] text-white/85 leading-relaxed mb-4">
                        {ar
                          ? "الحد الأدنى للتحويل 450 نقطة"
                          : "Minimum conversion is 450 points"}
                      </p>

                      {/* Convert button */}
                      <Button
                        onClick={() => {
                          const maxBlocks = Math.floor(points / 450);
                          setConvertPointsInput(maxBlocks > 0 ? String(maxBlocks * 450) : "450");
                          setShowConvertDialog(true);
                        }}
                        disabled={points < 450}
                        className="w-full rounded-full uppercase tracking-widest text-xs bg-white text-rose-600 hover:bg-white/90 disabled:bg-white/40 disabled:text-white/70 font-semibold"
                        data-testid="button-convert-points"
                      >
                        <Gift className="w-4 h-4 me-2" />
                        {ar ? "حوّلي النقاط إلى رصيد" : "Convert points to credit"}
                      </Button>
                    </div>
                  </div>
                );
              })()}

            <Button
              variant="outline"
              onClick={() => setAccountSettingsOpen(true)}
              className="hidden"
              data-testid="button-account-settings"
            >
              <Settings className="w-4 h-4" />
              {ar ? "إعدادات الحساب" : "Account Settings"}
            </Button>

            {/* ── Tab navigation ── */}
            {(() => {
              const tabs = [
                {
                  key: "orders" as const,
                  icon: Package,
                  label: t.profile.orderHistory,
                  labelShort: language === "ar" ? "طلباتي" : "Orders",
                  count: orders?.length ?? 0,
                  testId: "button-tab-orders",
                },
                {
                  key: "recently_viewed" as const,
                  icon: Eye,
                  label: language === "ar" ? "شاهدتِ مؤخراً" : "Recently Viewed",
                  labelShort: language === "ar" ? "المشاهدة" : "Viewed",
                  count: recentlyViewed.length,
                  testId: "button-tab-recently-viewed",
                },
                ...(exchangesEnabled ? [{
                  key: "exchanges" as const,
                  icon: ArrowLeftRight,
                  label: language === "ar" ? "طلبات الاستبدال" : "My Exchanges",
                  labelShort: language === "ar" ? "الاستبدال" : "Exchanges",
                  count: myExchangeRequests?.length ?? 0,
                  testId: "button-tab-exchanges",
                }] : []),
              ];
              return (
                <nav className="md:flex-col md:gap-1.5 md:p-1.5 md:bg-muted/30 md:rounded-xl md:border md:border-border/50">
                  {/* Mobile: equal-width icon+label pill bar */}
                  <div className="flex md:hidden gap-2 p-1.5 bg-muted/30 rounded-2xl border border-border/50">
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setActiveTab(tab.key)}
                          data-testid={tab.testId}
                          className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-1 rounded-xl font-semibold transition-all duration-200 ${
                            isActive
                              ? "bg-foreground text-background shadow-md"
                              : "text-foreground/60 hover:text-foreground hover:bg-background/60"
                          }`}
                        >
                          <div className="relative">
                            <Icon className="w-5 h-5" />
                            {tab.count > 0 && (
                              <span
                                className={`absolute -top-2 -end-2.5 min-w-[1.1rem] h-[1.1rem] text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 ${
                                  isActive
                                    ? "bg-background text-foreground"
                                    : "bg-foreground text-background"
                                }`}
                                data-testid={`badge-${tab.key}-count`}
                              >
                                {tab.count}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] leading-tight text-center">{tab.labelShort}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Desktop: vertical sidebar tabs */}
                  <div className="hidden md:flex flex-col gap-1.5">
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          onClick={() => setActiveTab(tab.key)}
                          data-testid={tab.testId}
                          className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 whitespace-nowrap ${
                            isActive
                              ? "bg-foreground text-background shadow-md"
                              : "text-foreground/80 hover:bg-background hover:shadow-sm hover:translate-x-0.5 rtl:hover:-translate-x-0.5"
                          }`}
                        >
                          <span
                            className={`flex items-center justify-center w-8 h-8 rounded-md transition-all ${
                              isActive ? "bg-background/15 text-background" : "bg-foreground/5 text-foreground/70 group-hover:bg-foreground/10"
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="flex-1 text-start">{tab.label}</span>
                          {tab.count > 0 && (
                            <span
                              className={`min-w-[1.5rem] h-6 px-2 inline-flex items-center justify-center text-[11px] font-bold rounded-full transition-colors ${
                                isActive ? "bg-background/20 text-background" : "bg-foreground/10 text-foreground/70 group-hover:bg-foreground/15"
                              }`}
                              data-testid={`badge-${tab.key}-count`}
                            >
                              {tab.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </nav>
              );
            })()}
          </div>

          <div id="orders-section" className="md:col-span-2 space-y-10">
{activeTab === "orders" && <div className="space-y-6">
              {/* Filter bar — only shown when there are orders */}
              {orders && orders.length > 0 && (
                <div className="space-y-3">
                  {/* Search input */}
                  <div className="relative group">
                    <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60 group-focus-within:text-foreground/70 pointer-events-none transition-colors" />
                    <Input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder={language === "ar" ? "ابحثي برقم الطلب..." : "Search by order number..."}
                      className="ps-11 h-12 rounded-2xl border-border/60 bg-background/80 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-foreground/20 focus-visible:border-foreground/40 transition-all placeholder:text-muted-foreground/50"
                      data-testid="input-order-search"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute end-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                        data-testid="button-clear-search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Status filter chips — horizontally scrollable */}
                  <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide" data-testid="filter-status-tabs">
                    {[
                      { key: "All",       labelAr: "الكل",         labelEn: "All",        dot: "",              activeBg: "bg-foreground text-background",                              inactiveHover: "hover:bg-muted" },
                      { key: "Pending",   labelAr: "قيد الانتظار", labelEn: "Pending",    dot: "bg-amber-400",  activeBg: "bg-amber-500 text-white",                                    inactiveHover: "hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-900/20 dark:hover:text-amber-400" },
                      { key: "OnTheWay",  labelAr: "في الطريق",    labelEn: "On The Way", dot: "bg-blue-500",   activeBg: "bg-blue-600 text-white",                                     inactiveHover: "hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-900/20 dark:hover:text-blue-400" },
                      { key: "Delivered", labelAr: "تم التسليم",   labelEn: "Delivered",  dot: "bg-emerald-500",activeBg: "bg-emerald-600 text-white",                                   inactiveHover: "hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400" },
                      { key: "Cancelled", labelAr: "ملغي",          labelEn: "Cancelled",  dot: "bg-rose-400",   activeBg: "bg-rose-600 text-white",                                     inactiveHover: "hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-900/20 dark:hover:text-rose-400" },
                    ].map(tab => {
                      const count = tab.key === "All"
                        ? orders.length
                        : orders.filter(o => o.status === tab.key).length;
                      const isActive = statusFilter === tab.key;

                      return (
                        <button
                          key={tab.key}
                          onClick={() => setStatusFilter(tab.key)}
                          data-testid={`filter-status-${tab.key.toLowerCase()}`}
                          className={`
                            inline-flex flex-shrink-0 items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold
                            border transition-all duration-200 whitespace-nowrap
                            ${isActive
                              ? `${tab.activeBg} border-transparent shadow-sm`
                              : `border-border/70 text-muted-foreground bg-background/60 ${tab.inactiveHover}`
                            }
                          `}
                        >
                          {tab.dot && (
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "bg-current opacity-70" : tab.dot}`} />
                          )}
                          {language === "ar" ? tab.labelAr : tab.labelEn}
                          <span className={`
                            min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center
                            ${isActive ? "bg-white/20 text-current" : "bg-muted text-muted-foreground"}
                          `}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!orders || orders.length === 0 ? (
                <div className="border border-border p-8 text-center bg-card">
                  <p className="text-muted-foreground mb-4">{t.profile.noOrders}</p>
                  <Link href="/shop">
                    <Button variant="outline" className="rounded-md uppercase tracking-widest text-sm" data-testid="button-start-shopping">{t.profile.startShopping}</Button>
                  </Link>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="border border-border p-8 text-center bg-card">
                  <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">
                    {language === "ar" ? "لا توجد طلبات تطابق بحثك" : "No orders match your search"}
                  </p>
                  <button
                    onClick={() => { setSearchQuery(""); setStatusFilter("All"); }}
                    className="mt-3 text-xs underline text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-clear-filters"
                  >
                    {language === "ar" ? "مسح الفلتر" : "Clear filters"}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map(order => (
                    <div key={order.id} className="rounded-[1.5rem] border border-border/70 bg-gradient-to-br from-card via-card to-secondary/30 p-4 sm:p-5 shadow-sm hover:border-primary/50 hover:shadow-md transition-all" data-testid={`card-order-${order.id}`}>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-3">
                          <div className="inline-flex items-center rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                            {t.profile.orderNumber} #{order.id.toString().padStart(6, '0')}
                          </div>
                          <div className="space-y-1">
                            <p className="font-semibold text-base">{order.createdAt ? format(new Date(order.createdAt), 'yyyy-MM-dd') : 'N/A'}</p>
                            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                              {t.profile.payment}:{" "}
                              {order.paymentMethod === "Exchange" ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-700">
                                  🔄 {ar ? "استبدال" : "Exchange"}
                                </span>
                              ) : order.paymentMethod}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-3 sm:items-end">
                          {getStatusBadge(order.status)}
                          <p className="font-bold text-lg">₪{parseFloat(order.totalAmount).toFixed(2)}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                          <span className="rounded-full bg-background px-3 py-1.5">{language === "ar" ? "طلب اونلاين" : "Online Order"}</span>
                          <span className="rounded-full bg-background px-3 py-1.5">{language === "ar" ? "تفاصيل جاهزة" : "Details available"}</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-11 rounded-full border border-border/70 px-4 text-xs font-semibold uppercase tracking-[0.18em] hover:bg-background sm:min-w-[170px] animate-shake-hint" onClick={() => { setSelectedOrderId(order.id); setShowDetails(true); }} data-testid={`button-view-details-${order.id}`}>
                          {t.profile.viewDetails} <ExternalLink className="w-3 h-3 ms-2" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>}

            {/* ─── My Exchanges ────────────────────────────────────── */}
            {activeTab === "exchanges" && (
              <div id="exchanges-section">
                <h2 className="text-xl font-semibold uppercase tracking-widest mb-5 flex items-center" data-testid="text-my-exchanges-title">
                  <ArrowLeftRight className="w-5 h-5 me-3" />
                  {ar ? "طلبات الاستبدال" : "My Exchanges"}
                </h2>

                {/* Exchange notice (admin-editable) */}
                {getSetting(siteSettings, "exchange_note") && (
                  <div className="mb-5 flex items-start gap-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-xl px-4 py-3" data-testid="banner-exchange-note">
                    <span className="text-rose-500 mt-0.5 flex-shrink-0">⚠️</span>
                    <p className="text-sm text-rose-800 dark:text-rose-300 leading-relaxed font-medium">{getSetting(siteSettings, "exchange_note")}</p>
                  </div>
                )}

                {/* ── Sub-tab toggle pills ── */}
                <div className="flex gap-2 mb-5 p-1 bg-muted/50 rounded-xl" data-testid="exchange-subtab-toggle">
                  <button
                    onClick={() => setExchangeSubTab("eligible")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                      exchangeSubTab === "eligible"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-subtab-eligible"
                  >
                    {ar ? "طلبات الاستبدال" : "Eligible Orders"}
                  </button>
                  <button
                    onClick={() => setExchangeSubTab("submitted")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                      exchangeSubTab === "submitted"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    data-testid="button-subtab-submitted"
                  >
                    {ar ? "الطلبات المقدَّمة" : "Submitted"}
                    {(myExchangeRequests?.length ?? 0) > 0 && (
                      <span className="ms-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                        {myExchangeRequests!.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* ── Eligible delivered orders panel ── */}
                {exchangeSubTab === "eligible" && exchangesEnabled && (() => {
                  const EXCHANGE_WINDOW_MS_LOCAL = 3 * 24 * 60 * 60 * 1000;
                  const deliveredOrders = (orders || []).filter(o => {
                    if (o.userId !== user.id) return false;
                    if (o.status !== "Delivered") return false;
                    const orderTime = new Date((o as any).createdAt).getTime();
                    if (isNaN(orderTime) || Date.now() - orderTime > EXCHANGE_WINDOW_MS_LOCAL) return false;
                    // At least one item must be exchangeable (not excluded category, not already requested)
                    const items = (o as any).items ?? [];
                    if (!items.some((item: any) => isItemExchangeable(o, item).ok)) return false;
                    return true;
                  });
                  const sorted = eligibleSort === "all"
                    ? [...deliveredOrders]
                    : [...deliveredOrders].sort((a, b) => {
                        const ta = new Date((a as any).createdAt).getTime();
                        const tb = new Date((b as any).createdAt).getTime();
                        return eligibleSort === "newest" ? tb - ta : ta - tb;
                      });
                  const eligibleSortOptions: { key: "all" | "newest" | "oldest"; ar: string; en: string }[] = [
                    { key: "all", ar: "الكل", en: "All" },
                    { key: "newest", ar: "الأحدث", en: "Newest" },
                    { key: "oldest", ar: "الأقدم", en: "Oldest" },
                  ];
                  return (
                    <div data-testid="section-eligible-orders">
                      {/* Sort filter */}
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {eligibleSortOptions.map(s => (
                          <button
                            key={s.key}
                            onClick={() => setEligibleSort(s.key)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                              eligibleSort === s.key
                                ? "bg-foreground text-background border-foreground"
                                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                            }`}
                            data-testid={`button-eligible-sort-${s.key}`}
                          >
                            {ar ? s.ar : s.en}
                          </button>
                        ))}
                      </div>
                      {sorted.length === 0 ? (
                        <div className="text-center py-12 border border-dashed rounded-xl" data-testid="empty-eligible-orders">
                          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">
                            {ar ? "لا توجد طلبات مؤهلة للاستبدال حالياً" : "No orders eligible for exchange right now"}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {sorted.map(o => (
                            <button
                              key={o.id}
                              type="button"
                              onClick={() => {
                                setSelectedOrderId(o.id);
                                setShowDetails(true);
                              }}
                              className="w-full text-start flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border hover:border-foreground/40 hover:bg-foreground/5 transition-colors"
                              data-testid={`button-eligible-order-${o.id}`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center flex-shrink-0">
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">
                                    {ar ? "طلب رقم" : "Order"} #{String(o.id).padStart(6, "0")}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {ar ? "تم التسليم · اضغطي للاستبدال" : "Delivered · Tap to request exchange"}
                                  </p>
                                </div>
                              </div>
                              <ArrowLeftRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Show message when exchanges are disabled and on eligible tab */}
                {exchangeSubTab === "eligible" && !exchangesEnabled && (
                  <div className="text-center py-12 border border-dashed rounded-xl">
                    <p className="text-sm text-muted-foreground">{ar ? "خدمة الاستبدال غير متاحة حالياً" : "Exchange service is currently unavailable"}</p>
                  </div>
                )}

                {/* ── Submitted requests panel ── */}
                {exchangeSubTab === "submitted" && (
                  <div>
                    {/* Status filter pills */}
                    <div className="flex items-center gap-2 mb-4 flex-wrap" data-testid="exchange-status-filters">
                      {(["all", "pending", "approved", "denied"] as const).map(f => {
                        const labels: Record<typeof f, { ar: string; en: string }> = {
                          all: { ar: "الكل", en: "All" },
                          pending: { ar: "قيد المراجعة", en: "Pending" },
                          approved: { ar: "موافق عليه", en: "Approved" },
                          denied: { ar: "مرفوض", en: "Denied" },
                        };
                        const active = exchangeSubmittedFilter === f;
                        return (
                          <button
                            key={f}
                            onClick={() => setExchangeSubmittedFilter(f)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                              active
                                ? "bg-foreground text-background border-foreground"
                                : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                            }`}
                            data-testid={`button-filter-${f}`}
                          >
                            {ar ? labels[f].ar : labels[f].en}
                          </button>
                        );
                      })}
                    </div>
                    <MyExchangesList statusFilter={exchangeSubmittedFilter === "all" ? undefined : exchangeSubmittedFilter} />
                  </div>
                )}
              </div>
            )}

            {/* ─── Recently Viewed ─────────────────────────────────── */}
            {activeTab === "recently_viewed" && (
              <div>
                <h2 className="text-xl font-semibold uppercase tracking-widest mb-6 flex items-center" data-testid="text-recently-viewed-title">
                  <Eye className="w-5 h-5 me-3" />
                  {language === "ar" ? "شاهدتِ مؤخراً" : "Recently Viewed"}
                </h2>
                {recentlyViewed.length === 0 ? (
                  <div className="border border-border p-8 text-center bg-card">
                    <Eye className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground mb-4">
                      {language === "ar" ? "لم تتصفحي أي منتجات بعد" : "You haven't browsed any products yet"}
                    </p>
                    <Link href="/shop">
                      <Button variant="outline" className="rounded-md uppercase tracking-widest text-sm" data-testid="button-browse-shop">
                        {language === "ar" ? "تصفحي المتجر" : "Browse Shop"}
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {recentlyViewed.map((p) => (
                      <Link key={p.id} href={`/product/${p.id}`}>
                        <div className="group cursor-pointer" data-testid={`card-recently-viewed-${p.id}`}>
                          <div className="relative aspect-[3/4] bg-secondary overflow-hidden mb-2">
                            <img
                              src={p.mainImage || ""}
                              alt={p.name}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                            {(p.stockQuantity ?? 1) === 0 && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <span className="text-white text-xs uppercase tracking-widest font-semibold">
                                  {language === "ar" ? "نفذت الكمية" : "Sold Out"}
                                </span>
                              </div>
                            )}
                          </div>
                          <p className="text-sm font-medium truncate leading-tight">{p.name}</p>
                          <p className="text-sm text-muted-foreground mt-0.5">₪{parseFloat(p.price).toFixed(2)}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </main>
      <Footer />

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-lg rounded-md max-h-[85svh] sm:max-h-[90vh] flex flex-col p-0 gap-0">
          <div className="flex items-center px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 pe-10 sm:pe-12 border-b border-border/60 flex-shrink-0">
            <DialogTitle className="font-display text-base sm:text-xl">{t.profile.orderNumber} #{selectedOrderId?.toString().padStart(6, '0')}</DialogTitle>
          </div>
          {orderDetails && (
            <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5">
              <div className="flex justify-between items-center">
                {getStatusBadge(orderDetails.order.status)}
                <span className="text-sm text-muted-foreground">
                  {orderDetails.order.createdAt ? format(new Date(orderDetails.order.createdAt), 'yyyy-MM-dd') : ''}
                </span>
              </div>

              <div className="pt-1 pb-2">
                {getProgressTracker(orderDetails.order.status)}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm">
                <div>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">{t.checkout.fullName}</p>
                  <p className="font-medium text-sm truncate">{orderDetails.order.fullName}</p>
                </div>
                <div>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">{t.checkout.phone}</p>
                  <p className="font-medium text-sm">{orderDetails.order.phone}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] sm:text-xs text-muted-foreground">{t.checkout.address}</p>
                  <p className="font-medium text-sm">{orderDetails.order.address}, {orderDetails.order.city}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3 text-sm uppercase tracking-widest">{t.profile.items}</h3>
                {orderDetails.items.length === 0 && (
                  <p className="text-sm text-muted-foreground italic py-2" data-testid="text-no-items">
                    {ar ? "تفاصيل المنتجات غير متوفرة لهذا الطلب" : "Product details are not available for this order"}
                  </p>
                )}
                <div className="space-y-3">
                  {orderDetails.items.map(item => {
                    const productId = item.product?.id ?? item.productId;
                    const goToProduct = () => {
                      if (!productId) return;
                      setShowDetails(false);
                      setLocation(`/product/${productId}`);
                    };
                    return (
                      <div
                        key={item.id}
                        role={productId ? "button" : undefined}
                        tabIndex={productId ? 0 : undefined}
                        onClick={productId ? goToProduct : undefined}
                        onKeyDown={productId ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToProduct(); } } : undefined}
                        className={`flex gap-3 text-sm border-b border-border pb-3 last:border-0 last:pb-0 ${productId ? "cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded transition-colors" : ""}`}
                        data-testid={`item-order-product-${productId ?? item.id}`}
                      >
                        {item.product?.mainImage && (
                          <img src={item.product.mainImage} alt="" className="w-12 h-16 object-cover bg-secondary flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium truncate ${productId ? "hover:underline" : ""}`}>{item.product?.name ?? (ar ? "منتج محذوف" : "Deleted product")}</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">{t.profile.qty}: {item.quantity}</span>
                            {item.size && (
                              <span className="text-xs bg-secondary px-1.5 py-0.5 font-medium">{t.product.size}: {item.size}</span>
                            )}
                            {item.color && (
                              <span className="text-xs bg-secondary px-1.5 py-0.5 font-medium">{t.product.color}: {item.color}</span>
                            )}
                          </div>
                          {productId && (
                            <p className="text-[10px] text-rose-600 dark:text-rose-400 uppercase tracking-wider mt-1.5 font-medium">
                              {ar ? "اطلبيه مجدداً ←" : "Buy again →"}
                            </p>
                          )}
                        </div>
                        <p className="font-medium flex-shrink-0">₪{(parseFloat(item.price) * item.quantity).toFixed(2)}</p>
                      </div>
                    );
                  })}
                </div>
                {(() => {
                  const elig = orderDetails.items.map(it => ({
                    it,
                    e: isDressProduct(it)
                      ? {
                          ok: false,
                          reason: ar
                            ? 'الفساتين والتصنيفات التابعة لها غير قابلة للاستبدال'
                            : 'Dresses and their subcategories cannot be exchanged',
                        }
                      : isItemExchangeable(orderDetails.order, it),
                  }));
                  const eligibleItems = elig.filter(x => x.e.ok);
                  const alreadyRequestedItems = elig.filter(x =>
                    !x.e.ok && exchangedItemIds.has(x.it.id)
                  );
                  if (eligibleItems.length === 0 && alreadyRequestedItems.length === 0) return null;
                  return (
                    <div className="mt-4 rounded-xl border border-pink-200 dark:border-pink-800/60 bg-pink-50/60 dark:bg-pink-900/10 overflow-hidden" data-testid="section-exchange-options">
                      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3 border-b border-pink-100 dark:border-pink-800/40">
                        <div className="w-8 h-8 rounded-full bg-pink-100 dark:bg-pink-800/40 flex items-center justify-center flex-shrink-0">
                          <ArrowLeftRight className="w-4 h-4 text-pink-700 dark:text-pink-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-pink-900 dark:text-pink-200">
                            {ar ? 'يمكنكِ استبدال هذه المنتجات' : 'These items are eligible for exchange'}
                          </p>
                          <p className="text-[11px] text-pink-700/70 dark:text-pink-400/70 mt-0.5">
                            {ar ? 'اضغطي على المنتج لبدء طلب الاستبدال' : 'Tap an item below to start an exchange request'}
                          </p>
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        {eligibleItems.map(({ it }) => (
                          <button
                            key={it.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDetails(false);
                              setExchangeItem({
                                orderId: orderDetails.order.id,
                                items: eligibleItems.map(({ it: ei }) => ({
                                  id: ei.id,
                                  productId: ei.productId,
                                  productName: ei.product?.name,
                                  size: ei.size,
                                  color: ei.color,
                                  image: ei.product?.mainImage,
                                })),
                                clickedItemId: it.id,
                              });
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white dark:bg-pink-900/20 border border-pink-100 dark:border-pink-800/50 hover:border-pink-400 dark:hover:border-pink-600 hover:shadow-sm active:scale-[0.98] transition-all text-start group"
                            data-testid={`button-request-exchange-${it.id}`}
                          >
                            {it.product?.mainImage && (
                              <img src={it.product.mainImage} alt="" className="w-10 h-12 object-cover rounded flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate text-foreground">{it.product?.name}</p>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {it.size && <span className="text-[10px] bg-pink-100 dark:bg-pink-800/40 text-pink-800 dark:text-pink-300 px-1.5 py-0.5 rounded font-medium">{it.size}</span>}
                                {it.color && <span className="text-[10px] bg-pink-100 dark:bg-pink-800/40 text-pink-800 dark:text-pink-300 px-1.5 py-0.5 rounded font-medium">{it.color}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-pink-700 dark:text-pink-400 group-hover:gap-2 transition-all flex-shrink-0">
                              <span className="text-xs font-semibold">{ar ? 'استبدال' : 'Exchange'}</span>
                              <ArrowLeftRight className="w-4 h-4" />
                            </div>
                          </button>
                        ))}
                        {alreadyRequestedItems.map(({ it }) => (
                          <div
                            key={it.id}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/40 border border-border/50 opacity-60 cursor-not-allowed"
                            data-testid={`item-exchange-already-${it.id}`}
                          >
                            {it.product?.mainImage && (
                              <img src={it.product.mainImage} alt="" className="w-10 h-12 object-cover rounded flex-shrink-0 grayscale" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate text-muted-foreground">{it.product?.name}</p>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {it.size && <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-medium">{it.size}</span>}
                                {it.color && <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-medium">{it.color}</span>}
                              </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-semibold flex-shrink-0 text-end leading-tight max-w-[80px]">
                              {ar ? 'تم تقديم طلب استبدال مسبقاً' : 'Exchange already requested'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {(() => {
                const total = parseFloat(orderDetails.order.totalAmount);
                const shipping = parseFloat(orderDetails.order.shippingCost || "0");
                const discount = parseFloat((orderDetails.order as any).discountAmount || "0");
                const credit = parseFloat((orderDetails.order as any).creditUsed || "0");
                const subtotal = total - shipping + discount + credit;
                return (
                  <div className="border-t pt-4 space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t.checkout.subtotal}</span>
                      <span>₪{subtotal.toFixed(2)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-rose-600 dark:text-rose-400">
                        <span className="flex items-center gap-1.5">
                          {ar ? "خصم" : "Discount"}
                          {orderDetails.order.discountCode && (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 font-semibold">
                              {orderDetails.order.discountCode}
                            </span>
                          )}
                        </span>
                        <span className="font-medium">−₪{discount.toFixed(2)}</span>
                      </div>
                    )}
                    {credit > 0 && (
                      <div className="flex justify-between text-amber-700 dark:text-amber-400">
                        <span>{ar ? "رصيد مستخدم" : "Credit applied"}</span>
                        <span className="font-medium">−₪{credit.toFixed(2)}</span>
                      </div>
                    )}
                    {shipping > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t.checkout.shipping}</span>
                        <span>₪{shipping.toFixed(2)}</span>
                      </div>
                    )}
                    {(discount + credit) > 0 && (
                      <div className="flex justify-between text-emerald-700 dark:text-emerald-400 text-xs pt-1">
                        <span className="font-semibold">{ar ? "إجمالي ما وفّرتيه" : "You saved"}</span>
                        <span className="font-bold">₪{(discount + credit).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2 border-t">
                      <p className="font-semibold text-base">{t.checkout.total}</p>
                      <p className="text-lg font-bold" data-testid="text-order-detail-total">₪{total.toFixed(2)}</p>
                    </div>
                  </div>
                );
              })()}

              <div className="text-sm text-muted-foreground flex items-center gap-1.5">
                {t.profile.payment}:{" "}
                {orderDetails.order.paymentMethod === "Exchange" ? (
                  <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-700">
                    🔄 {ar ? "استبدال" : "Exchange"}
                  </span>
                ) : orderDetails.order.paymentMethod}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Convert points dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-md rounded-2xl p-0 overflow-hidden border-0 shadow-2xl">
          {(() => {
            const points = loyalty?.points ?? 0;
            const maxWholeShekels = Math.floor(points / 30);
            const maxConvertible = maxWholeShekels * 30;
            const maxCredit = maxWholeShekels;
            const requested = Math.max(0, Math.floor(Number(convertPointsInput) || 0));
            const cappedRequested = Math.min(requested, points);
            const wholeShekels = Math.floor(cappedRequested / 30);
            const willConvert = wholeShekels >= 15 ? wholeShekels * 30 : 0;
            const willGetCredit = wholeShekels >= 15 ? wholeShekels : 0;
            const remainder = cappedRequested - willConvert;
            return (
              <>
                {/* Hero header */}
                <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-amber-500 via-rose-500 to-pink-600 text-white overflow-hidden">
                  <div className="absolute -top-10 -end-10 w-32 h-32 rounded-full bg-white/15 blur-2xl pointer-events-none" />
                  <div className="absolute -bottom-12 -start-8 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                  <DialogHeader className="relative">
                    <DialogTitle className="font-display text-xl flex items-center gap-2.5 text-white">
                      <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                        <Gift className="w-4.5 h-4.5" />
                      </div>
                      {ar ? "تحويل النقاط إلى رصيد" : "Convert points to credit"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="relative mt-4 grid grid-cols-2 gap-3 text-white">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-white/75 mb-0.5">{ar ? "نقاطك المتاحة" : "Available points"}</p>
                      <p className="text-2xl font-bold leading-tight">{points.toLocaleString()}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-[10px] uppercase tracking-widest text-white/75 mb-0.5">{ar ? "حدّ التحويل" : "Max credit"}</p>
                      <p className="text-2xl font-bold leading-tight">₪{maxCredit}</p>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4 bg-background">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-semibold">
                        {ar ? "كم نقطة تريدين تحويلها؟" : "Points to convert"}
                      </label>
                      <button
                        type="button"
                        onClick={() => setConvertPointsInput(String(maxConvertible))}
                        disabled={maxConvertible <= 0}
                        className="text-[10px] text-rose-600 hover:text-rose-700 font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 disabled:opacity-40"
                        data-testid="button-convert-max"
                      >
                        {ar ? `الحد الأقصى ${maxConvertible}` : `Max ${maxConvertible}`}
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="450"
                        max={maxConvertible}
                        step="1"
                        value={convertPointsInput}
                        onChange={e => {
                          const raw = e.target.value;
                          if (raw === "") { setConvertPointsInput(""); return; }
                          const n = Math.floor(Number(raw));
                          if (!Number.isFinite(n) || n < 0) return;
                          if (n > points) {
                            setConvertPointsInput(String(points));
                          } else {
                            setConvertPointsInput(String(n));
                          }
                        }}
                        placeholder="450"
                        className="rounded-lg h-12 text-base font-semibold ps-4 pe-16"
                        data-testid="input-convert-points"
                      />
                      <span className="absolute end-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">
                        {ar ? "نقطة" : "pts"}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
                      {ar
                        ? "الحد الأدنى 450 نقطة (= 15 ₪). كل 30 نقطة = 1 ₪، تحويل بأرقام صحيحة فقط."
                        : "Minimum 450 points (= ₪15). Every 30 points = ₪1, whole shekels only."}
                    </p>
                  </div>

                  {/* Preview card */}
                  {willConvert > 0 ? (
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] uppercase tracking-widest text-emerald-700/80 dark:text-emerald-300/80 font-semibold mb-1">
                            {ar ? "ستحصلين على" : "You'll receive"}
                          </p>
                          <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 leading-none" data-testid="text-convert-preview-credit">
                            ₪{willGetCredit}
                          </p>
                        </div>
                        <div className="flex flex-col items-center gap-1 px-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-md shrink-0">
                            <Gift className="w-5 h-5 text-white" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 text-end">
                          <p className="text-[10px] uppercase tracking-widest text-emerald-700/80 dark:text-emerald-300/80 font-semibold mb-1">
                            {ar ? "ستُخصم" : "Will be used"}
                          </p>
                          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300 leading-none">
                            {willConvert} <span className="text-xs font-medium text-emerald-700/70 dark:text-emerald-300/70">{ar ? "نقطة" : "pts"}</span>
                          </p>
                        </div>
                      </div>
                      {remainder > 0 && (
                        <p className="text-[11px] text-emerald-700/70 dark:text-emerald-300/70 mt-3 pt-3 border-t border-dashed border-emerald-300/50 dark:border-emerald-700/50 text-center">
                          {ar
                            ? `ستبقى ${remainder} نقطة في رصيد نقاطك`
                            : `${remainder} points will remain in your balance`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>{ar ? "أدخلي 450 نقطة على الأقل لإتمام التحويل" : "Enter at least 450 points to convert"}</span>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-lg h-11"
                      onClick={() => setShowConvertDialog(false)}
                      data-testid="button-convert-cancel"
                    >
                      {ar ? "إلغاء" : "Cancel"}
                    </Button>
                    <Button
                      className="flex-1 rounded-lg h-11 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white shadow-md font-semibold"
                      disabled={willConvert <= 0 || convertMutation.isPending}
                      onClick={async () => {
                        await convertMutation.mutateAsync(willConvert);
                        setShowConvertDialog(false);
                        setConvertPointsInput("");
                      }}
                      data-testid="button-convert-confirm"
                    >
                      {convertMutation.isPending
                        ? (ar ? "جارٍ التحويل..." : "Converting...")
                        : (ar ? `تأكيد · +₪${willGetCredit || 0}` : `Confirm · +₪${willGetCredit || 0}`)}
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AccountSettingsDialog
        open={accountSettingsOpen}
        onOpenChange={setAccountSettingsOpen}
        user={user}
      />

      <ExchangeRequestDialog
        open={!!exchangeItem}
        onOpenChange={(open) => {
          if (!open) setExchangeItem(null);
        }}
        orderId={exchangeItem?.orderId ?? null}
        items={exchangeItem?.items ?? []}
        initialItemId={exchangeItem?.clickedItemId}
      />
    </div>
  );
}
