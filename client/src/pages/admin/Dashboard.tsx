import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAdminStats } from "@/hooks/use-stats";
import { useOrders } from "@/hooks/use-orders";
import { useQuery } from "@tanstack/react-query";
import { Package, Users, ShoppingCart, DollarSign, AlertCircle, ChevronDown, ChevronUp, Clock, Truck, PackageCheck, XCircle, ExternalLink, TrendingUp } from "lucide-react";
import { useLanguage } from "@/i18n";
import { Link } from "wouter";
import { useState } from "react";
import { format } from "date-fns";

function useLowStockProducts() {
  return useQuery({
    queryKey: ["/api/admin/low-stock"],
    queryFn: async () => {
      const res = await fetch("/api/admin/low-stock", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch low stock");
      return res.json() as Promise<{ id: number; name: string; stockQuantity: number; mainImage: string; price: string; categoryId: number }[]>;
    },
  });
}

const STATUS_CONFIG: Record<string, { label: string; labelAr: string; color: string; icon: any }> = {
  Pending:   { label: "Pending",    labelAr: "قيد الانتظار", color: "text-amber-600 bg-amber-50 border-amber-200",  icon: Clock },
  OnTheWay:  { label: "On The Way", labelAr: "في الطريق",    color: "text-blue-600 bg-blue-50 border-blue-200",     icon: Truck },
  Delivered: { label: "Delivered",  labelAr: "تم التسليم",   color: "text-green-600 bg-green-50 border-green-200",  icon: PackageCheck },
  Cancelled: { label: "Cancelled",  labelAr: "ملغي",          color: "text-red-600 bg-red-50 border-red-200",        icon: XCircle },
};

export default function Dashboard() {
  const { data: stats, isLoading } = useAdminStats();
  const { data: lowStockProducts } = useLowStockProducts();
  const { data: orders } = useOrders();
  const { t, language } = useLanguage();
  const isAr = language === "ar";

  const [lowStockExpanded, setLowStockExpanded] = useState(true);

  const recentOrders = orders
    ? [...orders]
        .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
        .slice(0, 8)
    : [];

  if (isLoading) return <AdminLayout><div className="animate-pulse h-full bg-card rounded-xl"></div></AdminLayout>;

  const cards = [
    { title: t.admin.totalRevenue,  value: `₪${stats?.totalSales?.toFixed(2) || "0.00"}`, icon: DollarSign,  gradient: "from-emerald-500 to-teal-600", ring: "ring-emerald-500/20" },
    { title: t.admin.totalOrders,   value: stats?.totalOrders || 0,                        icon: ShoppingCart, gradient: "from-blue-500 to-indigo-600",  ring: "ring-blue-500/20" },
    { title: t.admin.productsCount, value: stats?.totalProducts || 0,                      icon: Package,      gradient: "from-purple-500 to-fuchsia-600", ring: "ring-purple-500/20" },
    { title: t.admin.customers,     value: stats?.totalUsers || 0,                         icon: Users,        gradient: "from-orange-500 to-rose-600",  ring: "ring-orange-500/20" },
  ];

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-display font-semibold text-foreground tracking-tight" data-testid="text-dashboard-title">{t.admin.dashboardOverview}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.admin.welcomeAdmin}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8">
        {cards.map((card, i) => (
          <div
            key={i}
            className="group relative bg-card border border-border/60 rounded-xl p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
            data-testid={`card-stat-${i}`}
          >
            <div className={`absolute -top-10 -end-10 w-32 h-32 rounded-full bg-gradient-to-br ${card.gradient} opacity-10 group-hover:opacity-20 transition-opacity blur-xl`} />
            <div className="relative flex justify-between items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">{card.title}</p>
                <h3 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight truncate">{card.value}</h3>
              </div>
              <div className={`shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-md ring-4 ${card.ring}`}>
                <card.icon className="w-5 h-5 text-white" strokeWidth={2.2} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Low stock alert + product list */}
      {stats?.lowStockCount ? (
        <div className="dark-red-zone mb-8 border border-destructive/30 bg-destructive/5" data-testid="alert-low-stock">
          {/* Alert header — click to expand/collapse */}
          <button
            onClick={() => setLowStockExpanded(v => !v)}
            className="w-full flex items-center gap-3 p-5 text-start hover:bg-destructive/10 transition-colors"
            data-testid="button-toggle-low-stock"
          >
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div className="flex-1">
              <span className="text-base font-semibold text-destructive">{t.admin.lowStockAlert}</span>
              <span className="text-destructive/70 text-sm ms-2">
                — {stats.lowStockCount} {t.admin.lowStockDesc}
              </span>
            </div>
            {lowStockExpanded
              ? <ChevronUp className="w-4 h-4 text-destructive/60 flex-shrink-0" />
              : <ChevronDown className="w-4 h-4 text-destructive/60 flex-shrink-0" />}
          </button>

          {/* Expandable product list */}
          {lowStockExpanded && lowStockProducts && lowStockProducts.length > 0 && (
            <div className="border-t border-destructive/20">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-destructive/10">
                    <th className="px-4 py-2 text-start font-semibold text-destructive/80">{isAr ? "المنتج" : "Product"}</th>
                    <th className="px-4 py-2 text-center font-semibold text-destructive/80">{isAr ? "المخزون المتبقي" : "Remaining Stock"}</th>
                    <th className="px-4 py-2 text-center font-semibold text-destructive/80">{isAr ? "السعر" : "Price"}</th>
                    <th className="px-4 py-2 text-center font-semibold text-destructive/80"></th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.map((p, i) => (
                    <tr key={p.id} className={`border-t border-destructive/10 ${i % 2 === 0 ? "" : "bg-destructive/5"}`} data-testid={`row-low-stock-${p.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {p.mainImage && (
                            <img
                              src={p.mainImage}
                              alt={p.name}
                              className="w-10 h-10 object-cover rounded border border-destructive/20 flex-shrink-0"
                              onError={e => { (e.target as HTMLImageElement).src = "/placeholder-product.svg"; }}
                            />
                          )}
                          <span className="font-medium text-foreground">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center justify-center min-w-10 px-2 py-0.5 rounded text-xs font-bold border ${
                          p.stockQuantity === 0
                            ? "bg-red-100 text-red-700 border-red-300"
                            : p.stockQuantity <= 3
                            ? "bg-orange-100 text-orange-700 border-orange-300"
                            : "bg-amber-100 text-amber-700 border-amber-300"
                        }`}>
                          {p.stockQuantity === 0 ? (isAr ? "نفذ" : "Out") : p.stockQuantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">₪{parseFloat(p.price).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <Link href="/admin/products">
                          <button className="text-xs text-destructive underline hover:no-underline" data-testid={`button-edit-low-stock-${p.id}`}>
                            {isAr ? "تحديث" : "Update"}
                          </button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-destructive/20 text-end">
                <Link href="/admin/products">
                  <button className="text-xs text-destructive font-semibold uppercase tracking-widest hover:underline flex items-center gap-1 ms-auto" data-testid="button-manage-products">
                    {isAr ? "إدارة المنتجات" : "Manage Products"} <ExternalLink className="w-3 h-3" />
                  </button>
                </Link>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Recent orders */}
      <div className="bg-card border border-border" data-testid="section-recent-activity">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold uppercase tracking-widest">{t.admin.recentActivity}</h2>
          {recentOrders.length > 0 && (
            <Link href="/admin/orders">
              <button className="text-xs text-muted-foreground uppercase tracking-widest hover:text-foreground flex items-center gap-1" data-testid="button-view-all-orders">
                {isAr ? "عرض الكل" : "View All"} <ExternalLink className="w-3 h-3" />
              </button>
            </Link>
          )}
        </div>

        {recentOrders.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
            <ShoppingCart className="w-12 h-12 opacity-20" />
            <p className="text-sm">{t.admin.recentActivity}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="px-4 py-3 text-start font-semibold text-muted-foreground">{isAr ? "رقم الطلب" : "Order #"}</th>
                  <th className="px-4 py-3 text-start font-semibold text-muted-foreground">{isAr ? "العميل" : "Customer"}</th>
                  <th className="px-4 py-3 text-start font-semibold text-muted-foreground">{isAr ? "التاريخ" : "Date"}</th>
                  <th className="px-4 py-3 text-center font-semibold text-muted-foreground">{isAr ? "الحالة" : "Status"}</th>
                  <th className="px-4 py-3 text-end font-semibold text-muted-foreground">{isAr ? "الإجمالي" : "Total"}</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order, i) => {
                  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.Pending;
                  const Icon = cfg.icon;
                  return (
                    <tr key={order.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`} data-testid={`row-recent-order-${order.id}`}>
                      <td className="px-4 py-3 font-mono font-semibold">#{order.id.toString().padStart(6, "0")}</td>
                      <td className="px-4 py-3 text-muted-foreground">{order.fullName}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {order.createdAt ? format(new Date(order.createdAt), "yyyy-MM-dd") : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold ${cfg.color}`}>
                          <Icon className="w-3 h-3" />
                          {isAr ? cfg.labelAr : cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end font-semibold">₪{parseFloat(order.totalAmount).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
