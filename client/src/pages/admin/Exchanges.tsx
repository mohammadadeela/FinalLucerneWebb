import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import { useCategories } from "@/hooks/use-categories";
import { ArrowLeftRight, Clock, CheckCircle2, XCircle, Loader2, ExternalLink, Save, ChevronDown, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Link } from "wouter";

type AdminExchange = {
  id: number;
  orderId: number;
  userId: number;
  productId: number;
  reason: string;
  preferredSize: string | null;
  preferredColor: string | null;
  status: "pending" | "approved" | "denied";
  adminNote: string | null;
  createdAt: string | null;
  resolvedAt: string | null;
  product: { id: number; name: string; mainImage: string } | null;
  order: { id: number; fullName: string; phone: string; status: string } | null;
  user: { id: number; email: string; fullName: string | null } | null;
};

export default function AdminExchanges() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: siteSettings } = useSiteSettings();
  const exchangesEnabled = siteSettings?.exchanges_enabled !== "false";

  const { data: categories = [] } = useCategories();
  const { data: subcategories = [] } = useQuery<any[]>({ queryKey: ["/api/subcategories"] });

  const parseIdList = (raw: string | undefined): number[] => {
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map((x: any) => Number(x)).filter((n) => Number.isFinite(n)) : [];
    } catch { return []; }
  };
  const initialExcludedCats = useMemo(() => parseIdList(siteSettings?.exchange_excluded_category_ids), [siteSettings?.exchange_excluded_category_ids]);
  const initialExcludedSubs = useMemo(() => parseIdList(siteSettings?.exchange_excluded_subcategory_ids), [siteSettings?.exchange_excluded_subcategory_ids]);
  const [excludedCats, setExcludedCats] = useState<Set<number>>(new Set());
  const [excludedSubs, setExcludedSubs] = useState<Set<number>>(new Set());
  const [exclusionsOpen, setExclusionsOpen] = useState(false);
  useEffect(() => { setExcludedCats(new Set(initialExcludedCats)); }, [initialExcludedCats]);
  useEffect(() => { setExcludedSubs(new Set(initialExcludedSubs)); }, [initialExcludedSubs]);

  const exclusionsDirty =
    excludedCats.size !== initialExcludedCats.length ||
    [...excludedCats].some((id) => !initialExcludedCats.includes(id)) ||
    excludedSubs.size !== initialExcludedSubs.length ||
    [...excludedSubs].some((id) => !initialExcludedSubs.includes(id));

  const saveExclusions = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/site-settings/bulk", {
        exchange_excluded_category_ids: JSON.stringify([...excludedCats]),
        exchange_excluded_subcategory_ids: JSON.stringify([...excludedSubs]),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/site-settings"] });
      toast({ title: ar ? "تم حفظ التصنيفات المستثناة" : "Excluded categories saved" });
    },
    onError: (e: any) => toast({ title: ar ? "تعذر الحفظ" : "Failed to save", description: e.message, variant: "destructive" }),
  });

  const toggleCat = (id: number) => {
    setExcludedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSub = (id: number) => {
    setExcludedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Exchange notice (shown on customer exchange page)
  const [exchangeNote, setExchangeNote] = useState(() => getSetting(siteSettings, "exchange_note"));
  useEffect(() => { setExchangeNote(getSetting(siteSettings, "exchange_note")); }, [siteSettings]);

  const saveExchangeNote = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/site-settings", { key: "exchange_note", value: exchangeNote });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/site-settings"] });
      toast({ title: ar ? "تم حفظ الملاحظة" : "Notice saved" });
    },
    onError: (e: any) => toast({ title: ar ? "تعذر الحفظ" : "Failed to save", description: e.message, variant: "destructive" }),
  });

  const { data, isLoading } = useQuery<AdminExchange[]>({ queryKey: ["/api/admin/exchange-requests"] });
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "denied">("pending");
  const [decisionTarget, setDecisionTarget] = useState<{ ex: AdminExchange; action: "approved" | "denied" } | null>(null);
  const [adminNote, setAdminNote] = useState("");

  const decide = useMutation({
    mutationFn: async ({ id, status, adminNote }: { id: number; status: string; adminNote: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/exchange-requests/${id}`, { status, adminNote: adminNote || null });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/exchange-requests"] });
      toast({ title: ar ? "تم تحديث الطلب" : "Request updated" });
      setDecisionTarget(null);
      setAdminNote("");
    },
    onError: (e: any) => toast({ title: ar ? "تعذّر التحديث" : "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleExchangeFeature = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("POST", "/api/site-settings", {
        key: "exchanges_enabled",
        value: enabled ? "true" : "false",
      });
      return res.json();
    },
    onSuccess: (_data, enabled) => {
      qc.invalidateQueries({ queryKey: ["/api/site-settings"] });
      toast({
        title: enabled
          ? (ar ? "تم تفعيل الاستبدال" : "Exchange enabled")
          : (ar ? "تم تعطيل الاستبدال" : "Exchange disabled"),
      });
    },
    onError: (e: any) => toast({
      title: ar ? "تعذر تحديث الحالة" : "Failed to update setting",
      description: e.message,
      variant: "destructive",
    }),
  });

  const filtered = (data ?? []).filter(x => filter === "all" || x.status === filter);
  const counts = {
    all: data?.length ?? 0,
    pending: data?.filter(x => x.status === "pending").length ?? 0,
    approved: data?.filter(x => x.status === "approved").length ?? 0,
    denied: data?.filter(x => x.status === "denied").length ?? 0,
  };

  const tabs = [
    { key: "pending" as const, labelAr: "قيد المراجعة", labelEn: "Pending", color: "border-amber-400 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400" },
    { key: "approved" as const, labelAr: "موافق عليها", labelEn: "Approved", color: "border-emerald-400 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400" },
    { key: "denied" as const, labelAr: "مرفوضة", labelEn: "Denied", color: "border-rose-400 text-rose-700 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400" },
    { key: "all" as const, labelAr: "الكل", labelEn: "All", color: "border-foreground text-foreground bg-foreground/5" },
  ];

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6" data-testid="page-admin-exchanges">
        <div className="flex items-center gap-3">
          <ArrowLeftRight className="w-5 h-5 sm:w-6 sm:h-6" />
          <h1 className="text-xl sm:text-2xl font-bold">{ar ? "طلبات الاستبدال" : "Exchange Requests"}</h1>
        </div>

        <div className="border border-border rounded-xl p-4 bg-card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="section-exchange-toggle">
          <div>
            <p className="font-semibold">{ar ? "تفعيل طلبات الاستبدال" : "Enable Exchange Requests"}</p>
            <p className="text-sm text-muted-foreground">
              {ar
                ? "يمكنك تشغيل أو إيقاف طلبات الاستبدال للعملاء من هنا."
                : "Turn customer exchange requests on or off from here."}
            </p>
          </div>
          <Button
            type="button"
            variant={exchangesEnabled ? "outline" : "default"}
            className={exchangesEnabled ? "border-rose-300 text-rose-700 hover:bg-rose-50" : "bg-emerald-600 hover:bg-emerald-700"}
            disabled={toggleExchangeFeature.isPending}
            onClick={() => toggleExchangeFeature.mutate(!exchangesEnabled)}
            data-testid="button-toggle-exchanges-feature"
          >
            {toggleExchangeFeature.isPending && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
            {exchangesEnabled
              ? (ar ? "إيقاف الاستبدال" : "Disable Exchanges")
              : (ar ? "تفعيل الاستبدال" : "Enable Exchanges")}
          </Button>
        </div>

        {/* Exchange Notice Editor */}
        <div className="border border-border rounded-xl p-4 bg-card space-y-3" data-testid="section-exchange-note">
          <div className="flex items-start gap-2">
            <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{ar ? "ملاحظة الاستبدال" : "Exchange Notice"}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {ar
                  ? "هذا النص يظهر للعميلة في صفحة الاستبدال. اتركيه فارغاً لإخفائه."
                  : "This text appears to customers on the exchange page. Leave empty to hide it."}
              </p>
            </div>
          </div>
          <Input
            value={exchangeNote}
            onChange={e => setExchangeNote(e.target.value)}
            placeholder={ar ? "مثال: الفساتين والالبسة الرسمية لا تبدل" : "e.g. Formal dresses cannot be exchanged"}
            data-testid="input-exchange-note"
            dir="auto"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => saveExchangeNote.mutate()}
              disabled={saveExchangeNote.isPending || exchangeNote === getSetting(siteSettings, "exchange_note")}
              data-testid="button-save-exchange-note"
              size="sm"
              className="w-full sm:w-auto"
            >
              {saveExchangeNote.isPending ? <Loader2 className="w-4 h-4 me-2 animate-spin" /> : <Save className="w-4 h-4 me-2" />}
              {ar ? "حفظ الملاحظة" : "Save Notice"}
            </Button>
          </div>
        </div>

        <div className="border border-border rounded-xl bg-card overflow-hidden" data-testid="section-exchange-exclusions">
          <button
            type="button"
            onClick={() => setExclusionsOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 p-4 text-start hover:bg-muted/40 transition-colors"
            data-testid="button-toggle-exclusions"
          >
            <div className="min-w-0">
              <p className="font-semibold">{ar ? "التصنيفات المستثناة من الاستبدال" : "Categories Excluded from Exchange"}</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {ar
                  ? "اختاري التصنيفات والتصنيفات الفرعية التي لا يمكن للعميلة استبدالها."
                  : "Pick which categories and subcategories customers cannot exchange."}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {ar ? "محدد حالياً:" : "Currently selected:"}{" "}
                <span className="font-medium text-foreground">
                  {excludedCats.size} {ar ? "تصنيف" : "categories"} · {excludedSubs.size} {ar ? "فرعي" : "subcategories"}
                </span>
              </p>
            </div>
            <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${exclusionsOpen ? "rotate-180" : ""}`} />
          </button>

          {exclusionsOpen && (
            <div className="border-t border-border p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {ar ? "التصنيفات الرئيسية" : "Main Categories"}
                </p>
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{ar ? "لا توجد تصنيفات" : "No categories"}</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {categories.map((c: any) => {
                      const id = Number(c.id);
                      const checked = excludedCats.has(id);
                      return (
                        <label
                          key={id}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                            checked ? "border-rose-300 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800" : "border-border hover:bg-muted/40"
                          }`}
                          data-testid={`label-exclude-cat-${id}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleCat(id)}
                            data-testid={`checkbox-exclude-cat-${id}`}
                          />
                          <span className="text-sm truncate">{ar && c.nameAr ? c.nameAr : c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {ar ? "التصنيفات الفرعية" : "Subcategories"}
                </p>
                {subcategories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{ar ? "لا توجد تصنيفات فرعية" : "No subcategories"}</p>
                ) : (
                  <div className="space-y-3">
                    {categories.map((c: any) => {
                      const subsForCat = subcategories.filter((s: any) => Number(s.categoryId) === Number(c.id));
                      if (subsForCat.length === 0) return null;
                      return (
                        <div key={c.id}>
                          <p className="text-xs text-muted-foreground mb-1.5">{ar && c.nameAr ? c.nameAr : c.name}</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {subsForCat.map((s: any) => {
                              const id = Number(s.id);
                              const checked = excludedSubs.has(id);
                              return (
                                <label
                                  key={id}
                                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                                    checked ? "border-rose-300 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800" : "border-border hover:bg-muted/40"
                                  }`}
                                  data-testid={`label-exclude-sub-${id}`}
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() => toggleSub(id)}
                                    data-testid={`checkbox-exclude-sub-${id}`}
                                  />
                                  <span className="text-sm truncate">{ar && s.nameAr ? s.nameAr : s.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-border">
                <Button
                  type="button"
                  onClick={() => saveExclusions.mutate()}
                  disabled={!exclusionsDirty || saveExclusions.isPending}
                  data-testid="button-save-exclusions"
                  className="w-full sm:w-auto"
                >
                  {saveExclusions.isPending ? (
                    <Loader2 className="w-4 h-4 me-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 me-2" />
                  )}
                  {ar ? "حفظ التصنيفات المستثناة" : "Save Exclusions"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`px-4 py-2 rounded-full border text-sm font-semibold transition-all ${
                filter === t.key ? t.color + " shadow-sm" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
              }`}
              data-testid={`button-filter-${t.key}`}
            >
              {ar ? t.labelAr : t.labelEn}
              <span className="ms-2 text-xs opacity-80">({counts[t.key]})</span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">
            <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
            {ar ? "جارٍ التحميل..." : "Loading..."}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 border border-dashed rounded-xl" data-testid="empty-admin-exchanges">
            <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 text-muted-foreground/60" />
            <p className="text-muted-foreground">{ar ? "لا توجد طلبات" : "No requests"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map(ex => {
              const StatusIcon = ex.status === "pending" ? Clock : ex.status === "approved" ? CheckCircle2 : XCircle;
              const statusColor =
                ex.status === "pending" ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-900/20 dark:border-amber-800/50"
                : ex.status === "approved" ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-900/20 dark:border-emerald-800/50"
                : "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-900/20 dark:border-rose-800/50";

              return (
                <div key={ex.id} className="border border-border rounded-xl p-4 bg-background space-y-3" data-testid={`card-admin-exchange-${ex.id}`}>
                  <div className="flex items-start gap-3">
                    {ex.product?.mainImage && (
                      <img src={ex.product.mainImage} alt="" className="w-16 h-20 object-cover rounded flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/product/${ex.productId}`}>
                            <p className="font-semibold text-sm truncate hover:underline cursor-pointer" data-testid={`link-product-${ex.productId}`}>
                              {ex.product?.name ?? `#${ex.productId}`}
                              <ExternalLink className="inline w-3 h-3 ms-1 opacity-60" />
                            </p>
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {ar ? "طلب" : "Order"} #{ex.orderId} · {ex.user?.fullName || ex.user?.email}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {ex.createdAt ? format(new Date(ex.createdAt), "yyyy-MM-dd · h:mm aa") : ""}
                          </p>
                        </div>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border whitespace-nowrap ${statusColor}`}>
                          <StatusIcon className="w-3 h-3" />
                          {ex.status === "pending" ? (ar ? "قيد المراجعة" : "Pending") : ex.status === "approved" ? (ar ? "موافق" : "Approved") : (ar ? "مرفوض" : "Denied")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-sm bg-muted/30 rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{ar ? "السبب" : "Reason"}</p>
                    <p>{ex.reason}</p>
                    {(ex.preferredSize || ex.preferredColor) && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {ex.preferredSize && <>{ar ? "المقاس البديل" : "Preferred size"}: <span className="font-medium text-foreground">{ex.preferredSize}</span> </>}
                        {ex.preferredColor && <>· {ar ? "اللون البديل" : "Preferred color"}: <span className="font-medium text-foreground">{ex.preferredColor}</span></>}
                      </p>
                    )}
                  </div>

                  {ex.adminNote && (
                    <div className="text-xs bg-foreground/5 border-l-2 border-foreground/30 rounded px-3 py-2">
                      <span className="font-semibold">{ar ? "ملاحظة:" : "Note:"}</span> {ex.adminNote}
                    </div>
                  )}

                  {ex.status === "pending" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => { setDecisionTarget({ ex, action: "approved" }); setAdminNote(""); }}
                        data-testid={`button-approve-${ex.id}`}
                      >
                        <CheckCircle2 className="w-4 h-4 me-1" />
                        {ar ? "قبول" : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/20"
                        onClick={() => { setDecisionTarget({ ex, action: "denied" }); setAdminNote(""); }}
                        data-testid={`button-deny-${ex.id}`}
                      >
                        <XCircle className="w-4 h-4 me-1" />
                        {ar ? "رفض" : "Deny"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!decisionTarget} onOpenChange={(o) => !o && setDecisionTarget(null)}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>
              {decisionTarget?.action === "approved"
                ? (ar ? "قبول طلب الاستبدال" : "Approve Exchange Request")
                : (ar ? "رفض طلب الاستبدال" : "Deny Exchange Request")}
            </DialogTitle>
            <DialogDescription>
              {ar ? "يمكنك إضافة ملاحظة ستظهر للعميلة" : "Optionally add a note that will be shown to the customer"}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            rows={4}
            placeholder={ar ? "ملاحظة (اختيارية)..." : "Note (optional)..."}
            data-testid="textarea-admin-note"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDecisionTarget(null)} data-testid="button-cancel-decision">
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => decisionTarget && decide.mutate({ id: decisionTarget.ex.id, status: decisionTarget.action, adminNote })}
              disabled={decide.isPending}
              className={decisionTarget?.action === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}
              data-testid="button-confirm-decision"
            >
              {decide.isPending && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
              {decisionTarget?.action === "approved" ? (ar ? "قبول" : "Approve") : (ar ? "رفض" : "Deny")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
