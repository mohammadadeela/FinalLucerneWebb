// Admin home: staff activity log (audit trail).
// Replaces the old overview. Shows what every admin and employee did,
// with filters, per-staff summaries, and a "needs attention" panel.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfDay, endOfDay, subDays, isSameDay, formatDistanceToNowStrict } from "date-fns";
import { ar as arLocale, enUS } from "date-fns/locale";
import {
  Activity, Banknote, CreditCard, Split, Undo2, ArrowLeftRight, Package, ShoppingCart, UserCog, Tag,
  FolderTree, Percent, LogIn, LogOut, Settings, Database, Trash2, AlertTriangle, ShieldAlert, Clock,
  Search, X, RefreshCw, ChevronDown, Crown, UserRound, Sparkles, Megaphone, Moon, KeyRound, Filter, Download,
} from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { useLanguage } from "@/i18n";
import { Input } from "@/components/ui/input";

/* ── Types ───────────────────────────────────────────────────────────── */
interface AuditRow {
  id: number;
  created_at: string;
  user_id: number | null;
  user_name: string;
  user_role: string;
  action: string;
  method: string;
  path: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  details: any;
  status: number;
  ip: string | null;
}
interface StaffUser { id: number; email: string; fullName: string | null; role: string; lastLoginAt?: string | null; isBlocked?: boolean | null }

/* ── Action catalogue ────────────────────────────────────────────────── */
type Group = "sales" | "returns" | "products" | "orders" | "users" | "categories" | "discounts" | "auth" | "settings" | "other";
const GROUP_LABEL: Record<Group, { ar: string; en: string }> = {
  sales: { ar: "المبيعات", en: "Sales" },
  returns: { ar: "ترجيع وتبديل", en: "Returns & exchanges" },
  products: { ar: "المنتجات", en: "Products" },
  orders: { ar: "الطلبات", en: "Orders" },
  users: { ar: "المستخدمون", en: "Users" },
  categories: { ar: "الفئات", en: "Categories" },
  discounts: { ar: "الخصومات والحملات", en: "Discounts & campaigns" },
  auth: { ar: "تسجيل الدخول", en: "Sign-ins" },
  settings: { ar: "الإعدادات وقاعدة البيانات", en: "Settings & database" },
  other: { ar: "أخرى", en: "Other" },
};
const ACTIONS: Record<string, { ar: string; en: string; group: Group; icon: any; tone: string; danger?: boolean }> = {
  "pos.sale": { ar: "بيع على الكاشير", en: "POS sale", group: "sales", icon: Banknote, tone: "green" },
  "pos.return": { ar: "ترجيع", en: "Return", group: "returns", icon: Undo2, tone: "red", danger: true },
  "pos.exchange": { ar: "تبديل", en: "Exchange", group: "returns", icon: ArrowLeftRight, tone: "blue" },
  "pos.delete_invoices": { ar: "حذف فواتير كاشير", en: "Deleted POS invoices", group: "sales", icon: Trash2, tone: "red", danger: true },
  "pos.update_invoice": { ar: "تعديل فاتورة كاشير", en: "Edited POS invoice", group: "sales", icon: Banknote, tone: "amber" },
  "pos.transfer": { ar: "تحويل فواتير", en: "Invoice transfer", group: "sales", icon: Banknote, tone: "slate" },
  "product.create": { ar: "إضافة منتج", en: "Added product", group: "products", icon: Package, tone: "green" },
  "product.update": { ar: "تعديل منتج", en: "Edited product", group: "products", icon: Package, tone: "amber" },
  "product.delete": { ar: "حذف منتج", en: "Deleted product", group: "products", icon: Trash2, tone: "red", danger: true },
  "product.stock": { ar: "تعديل مخزون", en: "Stock change", group: "products", icon: Package, tone: "amber" },
  "product.bulk_edit": { ar: "تعديل جماعي للمنتجات", en: "Bulk product edit", group: "products", icon: Package, tone: "amber" },
  "product.bulk_flags": { ar: "تعديل جماعي (مميز/جديد)", en: "Bulk flags", group: "products", icon: Sparkles, tone: "amber" },
  "product.bulk_discount": { ar: "خصم جماعي", en: "Bulk discount", group: "products", icon: Percent, tone: "amber" },
  "product.remove_discount": { ar: "إزالة خصم", en: "Removed discount", group: "products", icon: Percent, tone: "slate" },
  "product.expire_new": { ar: "إنهاء \"جديد\"", en: "Expired new arrivals", group: "products", icon: Sparkles, tone: "slate" },
  "product.import": { ar: "استيراد منتجات", en: "Imported products", group: "products", icon: Package, tone: "green" },
  "product.photos": { ar: "تعديل صور", en: "Photos updated", group: "products", icon: Package, tone: "slate" },
  "product.group": { ar: "مجموعات منتجات", en: "Product groups", group: "products", icon: Package, tone: "slate" },
  "ai.generate": { ar: "توليد بالذكاء الاصطناعي", en: "AI generation", group: "products", icon: Sparkles, tone: "purple" },
  "order.status": { ar: "تغيير حالة طلب", en: "Order status", group: "orders", icon: ShoppingCart, tone: "blue" },
  "order.delete": { ar: "حذف طلبات", en: "Deleted orders", group: "orders", icon: Trash2, tone: "red", danger: true },
  "order.items": { ar: "تعديل أصناف طلب", en: "Order items edited", group: "orders", icon: ShoppingCart, tone: "amber" },
  "exchange.update": { ar: "طلب استبدال", en: "Exchange request", group: "orders", icon: ArrowLeftRight, tone: "blue" },
  "user.update": { ar: "تعديل مستخدم", en: "User updated", group: "users", icon: UserCog, tone: "amber", danger: true },
  "user.delete": { ar: "حذف مستخدم", en: "User deleted", group: "users", icon: Trash2, tone: "red", danger: true },
  "category.create": { ar: "إضافة فئة", en: "Category added", group: "categories", icon: FolderTree, tone: "green" },
  "category.update": { ar: "تعديل فئة", en: "Category edited", group: "categories", icon: FolderTree, tone: "amber" },
  "category.delete": { ar: "حذف فئة", en: "Category deleted", group: "categories", icon: Trash2, tone: "red", danger: true },
  "discount.create": { ar: "إضافة كود خصم", en: "Discount code added", group: "discounts", icon: Tag, tone: "green" },
  "discount.update": { ar: "تعديل كود خصم", en: "Discount code edited", group: "discounts", icon: Tag, tone: "amber" },
  "discount.delete": { ar: "حذف كود خصم", en: "Discount code deleted", group: "discounts", icon: Trash2, tone: "red", danger: true },
  "marketing.send": { ar: "إرسال حملة", en: "Campaign sent", group: "discounts", icon: Megaphone, tone: "purple" },
  "auth.login": { ar: "تسجيل دخول", en: "Signed in", group: "auth", icon: LogIn, tone: "slate" },
  "auth.login_failed": { ar: "محاولة دخول فاشلة", en: "Failed sign-in", group: "auth", icon: ShieldAlert, tone: "red", danger: true },
  "auth.logout": { ar: "تسجيل خروج", en: "Signed out", group: "auth", icon: LogOut, tone: "slate" },
  "auth.change_password": { ar: "تغيير كلمة المرور", en: "Password changed", group: "auth", icon: KeyRound, tone: "amber" },
  "auth.profile": { ar: "تعديل الملف الشخصي", en: "Profile edited", group: "auth", icon: UserRound, tone: "slate" },
  "settings.update": { ar: "تعديل إعدادات الموقع", en: "Site settings changed", group: "settings", icon: Settings, tone: "amber", danger: true },
  "database.edit": { ar: "تعديل مباشر في قاعدة البيانات", en: "Direct database edit", group: "settings", icon: Database, tone: "red", danger: true },
  other: { ar: "إجراء آخر", en: "Other action", group: "other", icon: Activity, tone: "slate" },
};
const TONE: Record<string, string> = {
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  slate: "bg-muted text-muted-foreground",
};
const money = (n: number) => `₪${n.toFixed(2)}`;

// A POS "sale" whose note marks it as an exchange invoice is shown as an
// exchange; a /return with mode=exchange too. Everything else keeps its key.
function effectiveAction(r: AuditRow): string {
  if (r.action === "pos.sale" && r.details?.exchange) return "pos.exchange";
  if (r.action === "pos.return" && r.details?.mode === "exchange") return "pos.exchange";
  return ACTIONS[r.action] ? r.action : "other";
}
function isAfterHours(d: Date) { const h = d.getHours(); return h >= 23 || h < 8; }

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";

/* ── Page ────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const locale = ar ? arLocale : enUS;

  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [userFilter, setUserFilter] = useState<number | "all">("all");
  const [groupFilter, setGroupFilter] = useState<Group | "all" | "attention">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const range = useMemo(() => {
    const now = new Date();
    if (preset === "today") return { from: startOfDay(now), to: endOfDay(now) };
    if (preset === "yesterday") { const y = subDays(now, 1); return { from: startOfDay(y), to: endOfDay(y) }; }
    if (preset === "7d") return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    if (preset === "30d") return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    const f = customFrom ? startOfDay(new Date(customFrom)) : startOfDay(subDays(now, 29));
    const t = customTo ? endOfDay(new Date(customTo)) : endOfDay(now);
    return { from: isNaN(+f) ? startOfDay(subDays(now, 29)) : f, to: isNaN(+t) ? endOfDay(now) : t };
  }, [preset, customFrom, customTo]);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery<AuditRow[]>({
    queryKey: ["/api/admin/audit", range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const res = await fetch(`/api/admin/audit?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}&limit=4000`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    refetchInterval: 60_000,
  });
  const { data: users = [] } = useQuery<StaffUser[]>({ queryKey: ["/api/admin/users"] });
  const staff = useMemo(() => users.filter((u) => u.role === "admin" || u.role === "employee"), [users]);

  // Attention: deletions, returns, failed sign-ins, user/setting/database changes, discounted sales, after-hours activity.
  const attentionReason = (r: AuditRow): string | null => {
    const a = effectiveAction(r);
    const meta = ACTIONS[a];
    if (a === "auth.login_failed") return ar ? "دخول فاشل" : "failed sign-in";
    if (a === "pos.return") return ar ? "ترجيع" : "return";
    if (meta?.danger) return ar ? "إجراء حساس" : "sensitive";
    if (a === "pos.sale" && Number(r.details?.discount) > 0) return ar ? `خصم ${money(Number(r.details.discount))}` : `discount ${money(Number(r.details.discount))}`;
    if (r.status >= 400) return ar ? "فشل" : "failed";
    if (isAfterHours(new Date(r.created_at)) && a !== "auth.logout") return ar ? "خارج الدوام" : "after hours";
    return null;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (userFilter !== "all" && r.user_id !== userFilter) return false;
      const a = effectiveAction(r);
      if (groupFilter === "attention") { if (!attentionReason(r)) return false; }
      else if (groupFilter !== "all" && ACTIONS[a].group !== groupFilter) return false;
      if (q) {
        const label = ar ? ACTIONS[a].ar : ACTIONS[a].en;
        const hay = [r.user_name, r.entity_name, r.path, label, JSON.stringify(r.details || {})].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, userFilter, groupFilter, search, ar]);

  // Headline numbers for the selected period (before user/group/search filters).
  const kpi = useMemo(() => {
    let sales = 0, salesAmt = 0, cash = 0, card = 0, returns = 0, exchanges = 0, products = 0, orders = 0, failedLogins = 0, attention = 0;
    for (const r of rows) {
      const a = effectiveAction(r);
      if (r.status < 400) {
        if (a === "pos.sale") { sales++; const t = Number(r.details?.total) || 0; salesAmt += t; const m = r.details?.paymentMethod; const c = Number(r.details?.cashAmount) || 0; const k = Number(r.details?.cardAmount) || 0; if (m === "card") card += t; else if (m === "split" && c + k > 0) { cash += c; card += k; } else cash += t; }
        if (a === "pos.return") returns++;
        if (a === "pos.exchange") exchanges++;
        if (ACTIONS[a].group === "products") products++;
        if (ACTIONS[a].group === "orders") orders++;
      }
      if (a === "auth.login_failed") failedLogins++;
      if (attentionReason(r)) attention++;
    }
    return { sales, salesAmt, cash, card, returns, exchanges, products, orders, failedLogins, attention, total: rows.length };
  }, [rows, ar]);

  // Per-staff summary for the period.
  const staffSummary = useMemo(() => {
    const map = new Map<number, { actions: number; sales: number; salesAmt: number; returns: number; failed: number; last: Date | null }>();
    for (const r of rows) {
      if (r.user_id == null) continue;
      const s = map.get(r.user_id) || { actions: 0, sales: 0, salesAmt: 0, returns: 0, failed: 0, last: null };
      const a = effectiveAction(r);
      if (a === "auth.login_failed") s.failed++;
      else {
        s.actions++;
        if (a === "pos.sale" && r.status < 400) { s.sales++; s.salesAmt += Number(r.details?.total) || 0; }
        if (a === "pos.return" && r.status < 400) s.returns++;
      }
      const d = new Date(r.created_at);
      if (!s.last || d > s.last) s.last = d;
      map.set(r.user_id, s);
    }
    return map;
  }, [rows]);

  // Timeline grouped by day.
  const byDay = useMemo(() => {
    const groups: { day: Date; rows: AuditRow[] }[] = [];
    for (const r of filtered) {
      const d = new Date(r.created_at);
      const g = groups[groups.length - 1];
      if (g && isSameDay(g.day, d)) g.rows.push(r); else groups.push({ day: d, rows: [r] });
    }
    return groups;
  }, [filtered]);

  const exportCsv = () => {
    const head = ["time", "user", "role", "action", "target", "details", "status", "ip"];
    const lines = filtered.map((r) => {
      const a = effectiveAction(r);
      return [format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"), r.user_name, r.user_role, ar ? ACTIONS[a].ar : ACTIONS[a].en, r.entity_name || "", JSON.stringify(r.details || {}), r.status, r.ip || ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a"); el.href = url; el.download = `activity-${format(new Date(), "yyyy-MM-dd")}.csv`; el.click();
    URL.revokeObjectURL(url);
  };

  const selectCls = "h-9 text-sm rounded-md border border-border bg-background px-2.5 focus:outline-none focus:ring-2 focus:ring-ring";
  const dayLabel = (d: Date) => {
    const now = new Date();
    if (isSameDay(d, now)) return ar ? "اليوم" : "Today";
    if (isSameDay(d, subDays(now, 1))) return ar ? "أمس" : "Yesterday";
    return format(d, "EEEE، d MMMM yyyy", { locale });
  };

  return (
    <AdminLayout>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight flex items-center gap-2" data-testid="text-activity-title">
            <Activity className="w-7 h-7 text-primary" />
            {ar ? "سجل النشاط" : "Activity log"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {ar ? "كل ما قام به المدراء والموظفون — مبيعات، ترجيع، تعديلات، ودخول." : "Everything admins and employees did — sales, returns, edits and sign-ins."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted" data-testid="button-activity-refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {ar ? "تحديث" : "Refresh"}
          </button>
          <button onClick={exportCsv} disabled={filtered.length === 0} className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted disabled:opacity-40" data-testid="button-activity-export">
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Period */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/60">
          {([["today", ar ? "اليوم" : "Today"], ["yesterday", ar ? "أمس" : "Yesterday"], ["7d", ar ? "7 أيام" : "7 days"], ["30d", ar ? "30 يوم" : "30 days"], ["custom", ar ? "مخصص" : "Custom"]] as [Preset, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setPreset(k)} className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${preset === k ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`} data-testid={`activity-period-${k}`}>
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 w-36 text-sm" />
            <span className="text-muted-foreground text-xs">→</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-9 w-36 text-sm" />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-6">
        <Kpi label={ar ? "مبيعات الكاشير" : "POS sales"} value={money(kpi.salesAmt)} sub={`${kpi.sales} ${ar ? "فاتورة" : "invoices"}`} icon={Banknote} tone="green" onClick={() => setGroupFilter("sales")} />
        <Kpi label={ar ? "نقدي / بطاقة" : "Cash / card"} value={`${money(kpi.cash)}`} sub={`${ar ? "بطاقة" : "card"} ${money(kpi.card)}`} icon={CreditCard} tone="blue" />
        <Kpi label={ar ? "ترجيع / تبديل" : "Returns / exchanges"} value={`${kpi.returns} / ${kpi.exchanges}`} icon={Undo2} tone={kpi.returns > 0 ? "red" : "slate"} onClick={() => setGroupFilter("returns")} />
        <Kpi label={ar ? "تعديلات منتجات" : "Product changes"} value={String(kpi.products)} icon={Package} tone="amber" onClick={() => setGroupFilter("products")} />
        <Kpi label={ar ? "تحديثات طلبات" : "Order updates"} value={String(kpi.orders)} icon={ShoppingCart} tone="blue" onClick={() => setGroupFilter("orders")} />
        <Kpi label={ar ? "يستحق الانتباه" : "Needs attention"} value={String(kpi.attention)} sub={kpi.failedLogins ? `${kpi.failedLogins} ${ar ? "دخول فاشل" : "failed sign-ins"}` : undefined} icon={AlertTriangle} tone={kpi.attention > 0 ? "red" : "slate"} onClick={() => setGroupFilter("attention")} />
      </div>

      {/* Staff */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-muted-foreground mb-2">{ar ? "الفريق" : "Team"}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setUserFilter("all")} className={`shrink-0 rounded-lg border px-3 py-2 text-start min-w-[150px] transition-colors ${userFilter === "all" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`} data-testid="staff-card-all">
            <p className="text-sm font-semibold">{ar ? "الجميع" : "Everyone"}</p>
            <p className="text-[11px] text-muted-foreground ltr-num">{kpi.total} {ar ? "إجراء" : "actions"}</p>
          </button>
          {staff.map((u) => {
            const s = staffSummary.get(u.id);
            const active = userFilter === u.id;
            const name = u.fullName || u.email;
            return (
              <button key={u.id} onClick={() => setUserFilter(active ? "all" : u.id)} className={`shrink-0 rounded-lg border px-3 py-2 text-start min-w-[190px] transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"} ${u.isBlocked ? "opacity-60" : ""}`} data-testid={`staff-card-${u.id}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${u.role === "admin" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"}`}>
                    {name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate flex items-center gap-1">
                      {name}
                      {u.role === "admin" ? <Crown className="w-3 h-3 text-amber-600" /> : null}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {u.lastLoginAt ? `${ar ? "آخر دخول" : "last sign-in"} ${formatDistanceToNowStrict(new Date(u.lastLoginAt), { locale, addSuffix: true })}` : (ar ? "لم يسجّل دخول بعد" : "never signed in")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] ltr-num">
                  <span className="text-muted-foreground">{s?.actions ?? 0} {ar ? "إجراء" : "actions"}</span>
                  {s && s.sales > 0 && <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{s.sales} {ar ? "بيع" : "sales"} · {money(s.salesAmt)}</span>}
                  {s && s.returns > 0 && <span className="text-red-600">{s.returns} {ar ? "ترجيع" : "ret."}</span>}
                  {s && s.failed > 0 && <span className="text-red-600 font-semibold">{s.failed} {ar ? "دخول فاشل" : "failed"}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value as any)} className={selectCls} data-testid="select-activity-group">
          <option value="all">{ar ? "كل الإجراءات" : "All actions"}</option>
          <option value="attention">{ar ? "⚠ يستحق الانتباه" : "⚠ Needs attention"}</option>
          {(Object.keys(GROUP_LABEL) as Group[]).map((g) => <option key={g} value={g}>{ar ? GROUP_LABEL[g].ar : GROUP_LABEL[g].en}</option>)}
        </select>
        <select value={userFilter} onChange={(e) => setUserFilter(e.target.value === "all" ? "all" : Number(e.target.value))} className={selectCls} data-testid="select-activity-user">
          <option value="all">{ar ? "كل الفريق" : "All staff"}</option>
          {staff.map((u) => <option key={u.id} value={u.id}>{u.fullName || u.email}</option>)}
        </select>
        <div className="relative ms-auto">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={ar ? "ابحث: اسم، فاتورة، منتج…" : "Search: name, invoice, product…"} className="h-9 ps-8 w-64 text-sm" data-testid="input-activity-search" />
          {search && <button onClick={() => setSearch("")} className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X className="w-3 h-3" /></button>}
        </div>
        <span className="text-xs text-muted-foreground ltr-num">{filtered.length} / {rows.length}</span>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="py-16 flex justify-center"><div className="w-7 h-7 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{rows.length === 0 ? (ar ? "لا يوجد نشاط في هذه الفترة" : "No activity in this period") : (ar ? "لا نتائج تطابق الفلاتر" : "Nothing matches the filters")}</p>
          {rows.length === 0 && <p className="text-xs mt-1 opacity-70">{ar ? "يبدأ التسجيل من لحظة تشغيل هذا التحديث." : "Recording starts from the moment this update went live."}</p>}
        </div>
      ) : (
        <div className="space-y-6">
          {byDay.map((g) => (
            <div key={g.day.toISOString()}>
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-1.5 mb-2 flex items-center gap-2">
                <span className="text-sm font-bold">{dayLabel(g.day)}</span>
                <span className="text-[11px] text-muted-foreground ltr-num">{g.rows.length} {ar ? "إجراء" : "actions"}</span>
                <span className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-1">
                {g.rows.map((r) => {
                  const a = effectiveAction(r);
                  const meta = ACTIONS[a];
                  const Icon = meta.icon;
                  const reason = attentionReason(r);
                  const open = expanded === r.id;
                  const d = new Date(r.created_at);
                  const failed = r.status >= 400;
                  return (
                    <div key={r.id} className={`rounded-lg border transition-colors ${reason ? "border-amber-200/80 dark:border-amber-900/50" : "border-border"} ${open ? "bg-muted/30" : "hover:bg-muted/30"}`} data-testid={`activity-row-${r.id}`}>
                      <button onClick={() => setExpanded(open ? null : r.id)} className="w-full flex items-center gap-3 px-3 py-2 text-start">
                        <span className="text-[11px] text-muted-foreground ltr-num w-14 shrink-0">{format(d, "hh:mm a")}</span>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${TONE[meta.tone]}`}><Icon className="w-4 h-4" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap text-sm">
                            <span className="font-semibold">{r.user_name}</span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${r.user_role === "admin" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"}`}>{r.user_role === "admin" ? (ar ? "مدير" : "Admin") : (ar ? "موظف" : "Employee")}</span>
                            <span className={failed ? "text-red-600 line-through decoration-red-400/60" : ""}>{ar ? meta.ar : meta.en}</span>
                            {r.entity_name && <span className="font-medium text-foreground/90 truncate max-w-[260px]">{r.entity_name}</span>}
                            {failed && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">{ar ? "فشل" : "failed"} {r.status}</span>}
                            {reason && !failed && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">{isAfterHours(d) && reason === (ar ? "خارج الدوام" : "after hours") ? <Moon className="w-2.5 h-2.5" /> : <AlertTriangle className="w-2.5 h-2.5" />}{reason}</span>}
                          </div>
                          <DetailChips r={r} action={a} ar={ar} />
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>
                      {open && (
                        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground space-y-1">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 ltr-num">
                            <span><Clock className="inline w-3 h-3 me-1" />{format(d, "yyyy-MM-dd HH:mm:ss")}</span>
                            <span>{r.method} {r.path}</span>
                            {r.ip && <span>IP {r.ip}</span>}
                            <span>HTTP {r.status}</span>
                          </div>
                          {r.details && <pre className="mt-1 bg-background border border-border rounded p-2 overflow-x-auto text-[10px] leading-relaxed max-h-48" dir="ltr">{JSON.stringify(r.details, null, 2)}</pre>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

/* ── Small pieces ────────────────────────────────────────────────────── */
function Kpi({ label, value, sub, icon: Icon, tone, onClick }: { label: string; value: string; sub?: string; icon: any; tone: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="rounded-lg border border-border bg-card px-3 py-2.5 text-start hover:border-primary/40 transition-colors disabled:cursor-default disabled:hover:border-border">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-muted-foreground truncate">{label}</p>
        <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${TONE[tone]}`}><Icon className="w-3.5 h-3.5" /></span>
      </div>
      <p className="text-lg font-bold ltr-num leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground ltr-num mt-0.5 truncate">{sub}</p>}
    </button>
  );
}

function DetailChips({ r, action, ar }: { r: AuditRow; action: string; ar: boolean }) {
  const d = r.details || {};
  const chips: { text: string; tone?: string }[] = [];
  const chip = (text: string, tone = "slate") => chips.push({ text, tone });
  if (action === "pos.sale" || action === "pos.exchange") {
    if (d.total != null) chip(money(Number(d.total)), "green");
    if (d.paymentMethod) chip(d.paymentMethod === "cash" ? (ar ? "نقدي" : "cash") : d.paymentMethod === "card" ? (ar ? "بطاقة" : "card") : (ar ? "مختلط" : "split"), d.paymentMethod === "card" ? "blue" : d.paymentMethod === "split" ? "purple" : "green");
    if (d.items) chip(`${d.items} ${ar ? "قطعة" : "items"}`);
    if (Number(d.discount) > 0) chip(`${ar ? "خصم" : "disc."} ${money(Number(d.discount))}`, "amber");
  } else if (action === "pos.return") {
    if (d.items) chip(`${d.items} ${ar ? "قطعة" : "items"}`, "red");
  } else if (action === "order.status" && d.status) chip(String(d.status), "blue");
  else if (action === "user.update") { if (d.role) chip(`${ar ? "الدور" : "role"}: ${d.role}`, "amber"); if (d.isBlocked != null) chip(d.isBlocked ? (ar ? "حظر" : "blocked") : (ar ? "إلغاء حظر" : "unblocked"), d.isBlocked ? "red" : "green"); }
  else if (action.startsWith("product.")) { if (d.price != null) chip(`${ar ? "سعر" : "price"} ${money(Number(d.price))}`); if (Number(d.discountPrice) > 0) chip(`${ar ? "بعد الخصم" : "sale"} ${money(Number(d.discountPrice))}`, "amber"); if (d.count) chip(`${d.count} ${ar ? "منتج" : "products"}`); }
  else if (action === "auth.login_failed" && d.reason) chip(String(d.reason), "red");
  else if (d.count) chip(`${d.count}`);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {chips.map((c, i) => <span key={i} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ltr-num ${TONE[c.tone || "slate"]}`}>{c.text}</span>)}
    </div>
  );
}
