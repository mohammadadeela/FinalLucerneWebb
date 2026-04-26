import { useState } from "react";
import { format } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, Pencil, X, Check, Copy, ToggleLeft, ToggleRight, Search, ChevronDown, TicketPercent } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import type { DiscountCode } from "@shared/schema";

export default function DiscountCodes() {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [codeFilter, setCodeFilter] = useState<"all" | "active" | "inactive" | "expired">("all");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showSubCatPicker, setShowSubCatPicker] = useState(false);

  const [form, setForm] = useState({
    code: "",
    discountPercent: "",
    maxUses: "",
    expiresAt: "",
    isActive: true,
    categoryIds: [] as number[],
    subcategoryIds: [] as number[],
  });

  const { data: codes = [], isLoading } = useQuery<DiscountCode[]>({
    queryKey: ["/api/admin/discount-codes"],
  });
  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  const { data: allSubcategories = [] } = useQuery<any[]>({ queryKey: ["/api/subcategories"] });

  const availableSubcategories = form.categoryIds.length > 0
    ? allSubcategories.filter((s: any) => form.categoryIds.includes(s.categoryId))
    : allSubcategories;

  const toggleCategory = (id: number) => {
    setForm(prev => {
      const has = prev.categoryIds.includes(id);
      const next = has ? prev.categoryIds.filter(x => x !== id) : [...prev.categoryIds, id];
      const nextSubs = prev.subcategoryIds.filter(sid => {
        const sub = allSubcategories.find((s: any) => s.id === sid);
        return sub && next.includes(sub.categoryId);
      });
      return { ...prev, categoryIds: next, subcategoryIds: nextSubs };
    });
  };

  const toggleSubcategory = (id: number) => {
    setForm(prev => {
      const has = prev.subcategoryIds.includes(id);
      return { ...prev, subcategoryIds: has ? prev.subcategoryIds.filter(x => x !== id) : [...prev.subcategoryIds, id] };
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/admin/discount-codes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/discount-codes"] });
      resetForm();
      toast({ title: ar ? "تم إنشاء كود الخصم" : "Discount code created" });
    },
    onError: (err: any) => {
      toast({ title: err.message || (ar ? "فشل الإنشاء" : "Failed to create"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/discount-codes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/discount-codes"] });
      resetForm();
      toast({ title: ar ? "تم تحديث كود الخصم" : "Discount code updated" });
    },
    onError: (err: any) => {
      toast({ title: err.message || (ar ? "فشل التحديث" : "Failed to update"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/discount-codes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/discount-codes"] });
      toast({ title: ar ? "تم حذف كود الخصم" : "Discount code deleted" });
    },
  });

  const [bulkLoading, setBulkLoading] = useState(false);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      for (const id of selectedIds) {
        await apiRequest("DELETE", `/api/admin/discount-codes/${id}`);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/discount-codes"] });
      toast({ title: ar ? `تم حذف ${selectedIds.size} كود` : `Deleted ${selectedIds.size} code(s)` });
      setSelectedIds(new Set());
    } catch {
      toast({ title: ar ? "فشل الحذف" : "Delete failed", variant: "destructive" });
    }
    setBulkLoading(false);
  };

  const handleBulkToggle = async (activate: boolean) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      for (const id of selectedIds) {
        await apiRequest("PATCH", `/api/admin/discount-codes/${id}`, { isActive: activate });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/discount-codes"] });
      toast({
        title: activate
          ? (ar ? `تم تفعيل ${selectedIds.size} كود` : `Activated ${selectedIds.size} code(s)`)
          : (ar ? `تم تعطيل ${selectedIds.size} كود` : `Deactivated ${selectedIds.size} code(s)`),
      });
      setSelectedIds(new Set());
    } catch {
      toast({ title: ar ? "فشلت العملية" : "Operation failed", variant: "destructive" });
    }
    setBulkLoading(false);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredCodes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCodes.map(d => d.id)));
    }
  };

  const resetForm = () => {
    setForm({ code: "", discountPercent: "", maxUses: "", expiresAt: "", isActive: true, categoryIds: [], subcategoryIds: [] });
    setShowForm(false);
    setEditingId(null);
    setShowCatPicker(false);
    setShowSubCatPicker(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      code: form.code.toUpperCase().trim(),
      discountPercent: Number(form.discountPercent),
      maxUses: form.maxUses ? Number(form.maxUses) : null,
      expiresAt: form.expiresAt || null,
      isActive: form.isActive,
      categoryIds: form.categoryIds.length > 0 ? form.categoryIds : [],
      subcategoryIds: form.subcategoryIds.length > 0 ? form.subcategoryIds : [],
    };
    if (!data.code || !data.discountPercent || data.discountPercent < 1 || data.discountPercent > 100) {
      toast({ title: ar ? "يرجى إدخال بيانات صحيحة" : "Please enter valid data", variant: "destructive" });
      return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const startEdit = (code: DiscountCode) => {
    setForm({
      code: code.code,
      discountPercent: code.discountPercent.toString(),
      maxUses: code.maxUses?.toString() || "",
      expiresAt: code.expiresAt ? new Date(code.expiresAt).toISOString().slice(0, 16) : "",
      isActive: code.isActive ?? true,
      categoryIds: (code as any).categoryIds || [],
      subcategoryIds: (code as any).subcategoryIds || [],
    });
    setEditingId(code.id);
    setShowForm(true);
    setShowCatPicker(false);
    setShowSubCatPicker(false);
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: ar ? "تم نسخ الكود" : "Code copied" });
  };

  const isExpired = (d: DiscountCode) => d.expiresAt && new Date(d.expiresAt) < new Date();
  const isMaxedOut = (d: DiscountCode) => d.maxUses && d.usedCount !== null && d.usedCount >= d.maxUses;

  const getCodeStatus = (d: DiscountCode) => {
    if (isExpired(d)) return "expired";
    if (isMaxedOut(d)) return "inactive";
    if (!d.isActive) return "inactive";
    return "active";
  };

  const activeCodes = codes.filter(d => getCodeStatus(d) === "active");
  const inactiveCodes = codes.filter(d => getCodeStatus(d) === "inactive");
  const expiredCodes = codes.filter(d => getCodeStatus(d) === "expired");

  const filteredCodes = codes.filter(d => {
    if (codeFilter !== "all" && getCodeStatus(d) !== codeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return d.code.toLowerCase().includes(q) || String(d.discountPercent).includes(q);
    }
    return true;
  });

  const allSelected = filteredCodes.length > 0 && selectedIds.size === filteredCodes.length;

  const getCatLabel = (d: any) => {
    const catIds: number[] = d.categoryIds || [];
    const subIds: number[] = d.subcategoryIds || [];
    if (catIds.length === 0 && subIds.length === 0) return null;
    const catNames = catIds.map((id: number) => categories.find((c: any) => c.id === id)?.[ar ? "nameAr" : "name"] || `#${id}`);
    const subNames = subIds.map((id: number) => allSubcategories.find((s: any) => s.id === id)?.[ar ? "nameAr" : "name"] || `#${id}`);
    return [...catNames, ...subNames];
  };

  return (
    <AdminLayout>
      <AdminPageHeader
        title={ar ? "أكواد الخصم" : "Discount Codes"}
        description={ar ? "إدارة أكواد الخصم وحالتها" : "Create and manage promotional discount codes"}
        icon={TicketPercent}
        iconGradient="from-pink-500 to-rose-600"
        testId="text-discount-codes-title"
        actions={!showForm ? (
          <Button onClick={() => { resetForm(); setShowForm(true); }} data-testid="button-add-discount">
            <Plus className="w-4 h-4 me-1" /> {ar ? "إضافة كود" : "Add Code"}
          </Button>
        ) : undefined}
      />

      {codes.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={ar ? "ابحث عن كود..." : "Search codes..."}
            className="rounded-none ps-9 max-w-xs"
            data-testid="input-search-codes"
          />
        </div>
      )}

      {codes.length > 0 && (
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <button data-testid="filter-all-codes" onClick={() => { setCodeFilter("all"); setSelectedIds(new Set()); }} className={`text-xs px-3 py-1.5 rounded-full transition-colors cursor-pointer ${codeFilter === "all" ? "bg-foreground text-background font-semibold" : "text-muted-foreground bg-muted/50 hover:bg-muted"}`}>
            {ar ? "الكل" : "All"} ({codes.length})
          </button>
          <button data-testid="filter-active-codes" onClick={() => { setCodeFilter("active"); setSelectedIds(new Set()); }} className={`text-xs px-3 py-1.5 rounded-full transition-colors cursor-pointer ${codeFilter === "active" ? "bg-green-700 text-white font-semibold" : "text-green-700 bg-green-50 hover:bg-green-100"}`}>
            {ar ? "مفعّل" : "Active"} ({activeCodes.length})
          </button>
          <button data-testid="filter-inactive-codes" onClick={() => { setCodeFilter("inactive"); setSelectedIds(new Set()); }} className={`text-xs px-3 py-1.5 rounded-full transition-colors cursor-pointer ${codeFilter === "inactive" ? "bg-red-700 text-white font-semibold" : "text-red-700 bg-red-50 hover:bg-red-100"}`}>
            {ar ? "معطّل" : "Inactive"} ({inactiveCodes.length})
          </button>
          {expiredCodes.length > 0 && (
            <button data-testid="filter-expired-codes" onClick={() => { setCodeFilter("expired"); setSelectedIds(new Set()); }} className={`text-xs px-3 py-1.5 rounded-full transition-colors cursor-pointer ${codeFilter === "expired" ? "bg-orange-700 text-white font-semibold" : "text-orange-700 bg-orange-50 hover:bg-orange-100"}`}>
              {ar ? "منتهي" : "Expired"} ({expiredCodes.length})
            </button>
          )}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-none" data-testid="bulk-actions-bar">
          <span className="text-sm font-medium">{ar ? `تم تحديد ${selectedIds.size} كود` : `${selectedIds.size} selected`}</span>
          <div className="flex items-center gap-2 ms-auto">
            <Button size="sm" variant="outline" className="rounded-none text-green-700 border-green-300 hover:bg-green-50 dark:hover:bg-green-950/30 h-8 text-xs" onClick={() => handleBulkToggle(true)} disabled={bulkLoading} data-testid="button-bulk-activate">
              <ToggleRight className="w-3.5 h-3.5 me-1" />{ar ? "تفعيل" : "Activate"}
            </Button>
            <Button size="sm" variant="outline" className="rounded-none text-orange-700 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30 h-8 text-xs" onClick={() => handleBulkToggle(false)} disabled={bulkLoading} data-testid="button-bulk-deactivate">
              <ToggleLeft className="w-3.5 h-3.5 me-1" />{ar ? "تعطيل" : "Deactivate"}
            </Button>
            <Button size="sm" variant="destructive" className="rounded-none h-8 text-xs" onClick={handleBulkDelete} disabled={bulkLoading} data-testid="button-bulk-delete-codes">
              <Trash2 className="w-3.5 h-3.5 me-1" />{ar ? "حذف المحدد" : "Delete Selected"}
            </Button>
          </div>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="border border-border rounded-lg p-6 mb-8 space-y-5 bg-card shadow-sm" data-testid="form-discount-code">
          <div className="flex items-center justify-between mb-1 pb-3 border-b border-border">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <span className="w-7 h-7 rounded-md bg-gradient-to-br from-pink-500 to-rose-600 text-white flex items-center justify-center text-xs font-bold">%</span>
              {editingId ? (ar ? "تعديل كود الخصم" : "Edit Discount Code") : (ar ? "كود خصم جديد" : "New Discount Code")}
            </h2>
            <Button type="button" variant="ghost" size="icon" onClick={resetForm} data-testid="button-cancel-discount"><X className="w-4 h-4" /></Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{ar ? "الكود" : "Code"}</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder={ar ? "مثال: SUMMER20" : "e.g. SUMMER20"} className="h-10 uppercase tracking-wider font-mono" required data-testid="input-discount-code" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{ar ? "نسبة الخصم (%)" : "Discount Percent (%)"}</Label>
              <Input type="number" min={1} max={100} value={form.discountPercent} onChange={e => setForm({ ...form, discountPercent: e.target.value })} placeholder="20" className="h-10" required data-testid="input-discount-percent" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{ar ? "الحد الأقصى للاستخدام (اختياري)" : "Max Uses (optional)"}</Label>
              <Input type="number" min={1} value={form.maxUses} onChange={e => setForm({ ...form, maxUses: e.target.value })} placeholder={ar ? "اتركه فارغاً لاستخدام غير محدود" : "Leave empty for unlimited"} className="h-10" data-testid="input-discount-max-uses" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">{ar ? "تاريخ ووقت الانتهاء (اختياري)" : "Expiry Date & Time (optional)"}</Label>
              <Input type="datetime-local" value={form.expiresAt} onChange={e => setForm({ ...form, expiresAt: e.target.value })} className="h-10" data-testid="input-discount-expires" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{ar ? "تقييد الأقسام (اختياري، يمكن اختيار أكثر من قسم)" : "Category Restriction (optional, select multiple)"}</Label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowCatPicker(p => !p); setShowSubCatPicker(false); }}
                  className="w-full border border-input bg-background px-3 py-2 text-sm rounded-none flex items-center justify-between"
                  data-testid="button-toggle-cat-picker"
                >
                  <span className="truncate">
                    {form.categoryIds.length === 0
                      ? (ar ? "كل الأقسام" : "All categories")
                      : form.categoryIds.map(id => categories.find((c: any) => c.id === id)?.[ar ? "nameAr" : "name"] || `#${id}`).join("، ")}
                  </span>
                  <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showCatPicker ? "rotate-180" : ""}`} />
                </button>
                {showCatPicker && (
                  <div className="absolute z-50 top-full start-0 end-0 border border-input bg-background shadow-md max-h-52 overflow-y-auto">
                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer border-b border-border text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={form.categoryIds.length === 0}
                        onChange={() => setForm(prev => ({ ...prev, categoryIds: [], subcategoryIds: [] }))}
                        className="w-3.5 h-3.5"
                      />
                      {ar ? "كل الأقسام (بدون تقييد)" : "All categories (no restriction)"}
                    </label>
                    {categories.map((c: any) => (
                      <label key={c.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.categoryIds.includes(c.id)}
                          onChange={() => toggleCategory(c.id)}
                          className="w-3.5 h-3.5"
                        />
                        <span className="text-sm">{ar ? c.nameAr || c.name : c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{ar ? "تقييد الفئات الفرعية (اختياري، يمكن اختيار أكثر من فئة)" : "Subcategory Restriction (optional, select multiple)"}</Label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setShowSubCatPicker(p => !p); setShowCatPicker(false); }}
                  className="w-full border border-input bg-background px-3 py-2 text-sm rounded-none flex items-center justify-between"
                  data-testid="button-toggle-subcat-picker"
                >
                  <span className="truncate">
                    {form.subcategoryIds.length === 0
                      ? (ar ? "كل الفئات الفرعية" : "All subcategories")
                      : form.subcategoryIds.map(id => allSubcategories.find((s: any) => s.id === id)?.[ar ? "nameAr" : "name"] || `#${id}`).join("، ")}
                  </span>
                  <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${showSubCatPicker ? "rotate-180" : ""}`} />
                </button>
                {showSubCatPicker && (
                  <div className="absolute z-50 top-full start-0 end-0 border border-input bg-background shadow-md max-h-52 overflow-y-auto">
                    <label className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer border-b border-border text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={form.subcategoryIds.length === 0}
                        onChange={() => setForm(prev => ({ ...prev, subcategoryIds: [] }))}
                        className="w-3.5 h-3.5"
                      />
                      {ar ? "كل الفئات الفرعية (بدون تقييد)" : "All subcategories (no restriction)"}
                    </label>
                    {availableSubcategories.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">{ar ? "لا توجد فئات فرعية" : "No subcategories"}</p>
                    ) : availableSubcategories.map((s: any) => (
                      <label key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.subcategoryIds.includes(s.id)}
                          onChange={() => toggleSubcategory(s.id)}
                          className="w-3.5 h-3.5"
                        />
                        <span className="text-sm">{ar ? s.nameAr || s.name : s.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {(form.categoryIds.length > 0 || form.subcategoryIds.length > 0) && (
            <p className="text-xs text-muted-foreground">
              {ar
                ? "سيُطبَّق الخصم فقط على المنتجات التي تنتمي إلى الأقسام/الفئات الفرعية المختارة"
                : "Discount applies only to products belonging to the selected categories/subcategories"}
            </p>
          )}

          <div className="flex items-center gap-3">
            <input id="discount-active" type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4" data-testid="checkbox-discount-active" />
            <Label htmlFor="discount-active" className="cursor-pointer">{ar ? "مفعّل" : "Active"}</Label>
          </div>
          <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-discount">
            <Check className="w-4 h-4 me-1" /> {editingId ? (ar ? "تحديث" : "Update") : (ar ? "إنشاء" : "Create")}
          </Button>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
        </div>
      ) : codes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground" data-testid="text-no-discount-codes">
          {ar ? "لا توجد أكواد خصم بعد" : "No discount codes yet"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-discount-codes">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-3 px-2 w-10">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 cursor-pointer" data-testid="checkbox-select-all-codes" />
                </th>
                <th className="text-start py-3 px-2 font-medium">{ar ? "الكود" : "Code"}</th>
                <th className="text-start py-3 px-2 font-medium">{ar ? "الخصم" : "Discount"}</th>
                <th className="text-start py-3 px-2 font-medium">{ar ? "التقييد" : "Restriction"}</th>
                <th className="text-start py-3 px-2 font-medium">{ar ? "الاستخدام" : "Uses"}</th>
                <th className="text-start py-3 px-2 font-medium">{ar ? "الانتهاء" : "Expires"}</th>
                <th className="text-start py-3 px-2 font-medium">{ar ? "الحالة" : "Status"}</th>
                <th className="text-start py-3 px-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filteredCodes.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                    {ar ? "لا توجد أكواد تطابق الفلتر" : "No codes match this filter"}
                  </td>
                </tr>
              )}
              {filteredCodes.map((d) => {
                const expired = isExpired(d);
                const maxed = isMaxedOut(d);
                const active = d.isActive && !expired && !maxed;
                const isSelected = selectedIds.has(d.id);
                const restrictions = getCatLabel(d);
                return (
                  <tr key={d.id} className={`border-b border-border/50 hover:bg-muted/50 ${isSelected ? "bg-muted/30" : ""}`} data-testid={`row-discount-${d.id}`}>
                    <td className="py-3 px-2">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(d.id)} className="w-4 h-4 cursor-pointer" data-testid={`checkbox-select-code-${d.id}`} />
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <code className="bg-muted px-2 py-0.5 text-xs font-mono font-bold tracking-widest">{d.code}</code>
                        <button onClick={() => copyCode(d.code)} className="text-muted-foreground hover:text-foreground" data-testid={`button-copy-${d.id}`}>
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-2 font-semibold">{d.discountPercent}%</td>
                    <td className="py-3 px-2 text-xs max-w-[180px]">
                      {restrictions && restrictions.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {restrictions.map((name, i) => (
                            <span key={i} className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{ar ? "الكل" : "All"}</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {d.maxUses ? `${d.usedCount || 0} / ${d.maxUses}` : `${d.usedCount || 0} / ∞`}
                    </td>
                    <td className="py-3 px-2 text-xs">
                      {d.expiresAt ? (
                        <span className={expired ? "text-red-500" : ""}>
                          {format(new Date(d.expiresAt), "yyyy-MM-dd · h:mm aa")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : expired ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                        {active ? (ar ? "مفعّل" : "Active") : expired ? (ar ? "منتهي" : "Expired") : (ar ? "معطّل" : "Inactive")}
                      </span>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEdit(d)} className="p-1.5 hover:bg-muted rounded" data-testid={`button-edit-${d.id}`}><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteMutation.mutate(d.id)} className="p-1.5 hover:bg-muted rounded text-destructive" data-testid={`button-delete-${d.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
