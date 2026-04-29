import { useState, useRef, useCallback } from "react";
import ImageCropDialog from "@/components/admin/ImageCropDialog";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { FolderTree } from "lucide-react";
import { useCategories } from "@/hooks/use-categories";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Upload, ImageIcon, ChevronDown, ChevronUp, Home, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import type { Subcategory } from "@shared/schema";

interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export default function AdminCategories() {
  const { data: categories, isLoading: catLoading } = useCategories();
  const { data: subcategoriesData, isLoading: subLoading } = useQuery<Subcategory[]>({
    queryKey: ["/api/subcategories"],
  });
  const { toast } = useToast();
  const { language } = useLanguage();
  const isAr = language === "ar";

  const [expandedCat, setExpandedCat] = useState<number | null>(null);

  const [confirm, setConfirm] = useState<ConfirmState>({ open: false, title: "", message: "", onConfirm: () => {} });
  const askConfirm = (title: string, message: string, onConfirm: () => void) =>
    setConfirm({ open: true, title, message, onConfirm });
  const closeConfirm = () => setConfirm(c => ({ ...c, open: false }));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subcategory | null>(null);
  const [subForm, setSubForm] = useState({ name: "", nameAr: "", slug: "", image: "", categoryId: 0, isActive: true, showOnHome: false });

  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [catForm, setCatForm] = useState({ name: "", nameAr: "", slug: "", image: "" });

  const [editCatDialogOpen, setEditCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<any | null>(null);
  const [editCatForm, setEditCatForm] = useState({ name: "", nameAr: "", slug: "", sizeGuide: "auto" });

  const openEditCat = (cat: any) => {
    setEditingCat(cat);
    setEditCatForm({ name: cat.name, nameAr: cat.nameAr || "", slug: cat.slug || "", sizeGuide: cat.sizeGuide || "auto" });
    setEditCatDialogOpen(true);
  };

  const handleSubmitEditCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat) return;
    try {
      const slug = editCatForm.slug || editCatForm.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      await updateCat.mutateAsync({ id: editingCat.id, name: editCatForm.name, nameAr: editCatForm.nameAr || null, slug, sizeGuide: editCatForm.sizeGuide });
      toast({ title: isAr ? "تم تحديث الفئة" : "Category updated" });
      setEditCatDialogOpen(false);
    } catch (err: any) {
      toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" });
    }
  };

  const [uploading, setUploading] = useState(false);
  const [catUploading, setCatUploading] = useState<number | null>(null);
  const [newCatUploading, setNewCatUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const newCatFileRef = useRef<HTMLInputElement>(null);
  const catFileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const [currentCrop, setCurrentCrop] = useState<{ file: File; resolve: (f: File) => void } | null>(null);
  const cropFile = useCallback((file: File): Promise<File> => {
    return new Promise((resolve) => setCurrentCrop({ file, resolve }));
  }, []);

  const createCat = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/categories", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/categories"] }),
  });

  const deleteCat = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subcategories"] });
    },
  });

  const createSub = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/subcategories", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/subcategories"] }),
  });

  const updateSub = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/subcategories/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/subcategories"] }),
  });

  const deleteSub = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/subcategories/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/subcategories"] }),
  });

  const updateCat = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/categories/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/categories"] }),
  });

  const handleUpload = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append("images", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      return data.urls?.[0] || null;
    } catch {
      toast({ title: isAr ? "فشل رفع الصورة" : "Upload failed", variant: "destructive" });
      return null;
    }
  };

  const handleCatImageUpload = async (catId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cropped = await cropFile(file);
    setCatUploading(catId);
    const url = await handleUpload(cropped);
    if (url) {
      await updateCat.mutateAsync({ id: catId, image: url });
      toast({ title: isAr ? "تم تحديث الصورة" : "Image updated" });
    }
    setCatUploading(null);
    const ref = catFileRefs.current[catId];
    if (ref) ref.value = "";
  };

  const handleSubImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cropped = await cropFile(file);
    setUploading(true);
    const url = await handleUpload(cropped);
    if (url) setSubForm(prev => ({ ...prev, image: url }));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleNewCatImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cropped = await cropFile(file);
    setNewCatUploading(true);
    const url = await handleUpload(cropped);
    if (url) setCatForm(prev => ({ ...prev, image: url }));
    setNewCatUploading(false);
    if (newCatFileRef.current) newCatFileRef.current.value = "";
  };

  const openAddSub = (categoryId: number) => {
    setEditingSub(null);
    setSubForm({ name: "", nameAr: "", slug: "", image: "", categoryId, isActive: true, showOnHome: false });
    setDialogOpen(true);
  };

  const openEditSub = (sub: Subcategory) => {
    setEditingSub(sub);
    setSubForm({
      name: sub.name,
      nameAr: sub.nameAr || "",
      slug: sub.slug,
      image: sub.image || "",
      categoryId: sub.categoryId,
      isActive: sub.isActive ?? true,
      showOnHome: (sub as any).showOnHome ?? false,
    });
    setDialogOpen(true);
  };

  const handleSubmitSub = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const slug = subForm.slug || subForm.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const payload = { ...subForm, slug, nameAr: subForm.nameAr || null, image: subForm.image || null };
      if (editingSub) {
        await updateSub.mutateAsync({ id: editingSub.id, ...payload });
        toast({ title: isAr ? "تم تحديث التصنيف الفرعي" : "Subcategory updated" });
      } else {
        await createSub.mutateAsync(payload);
        toast({ title: isAr ? "تم إضافة التصنيف الفرعي" : "Subcategory added" });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSubmitCat = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const slug = catForm.slug || catForm.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      await createCat.mutateAsync({ name: catForm.name, nameAr: catForm.nameAr || null, slug, image: catForm.image || null });
      toast({ title: isAr ? "تم إضافة الفئة" : "Category added" });
      setCatDialogOpen(false);
      setCatForm({ name: "", nameAr: "", slug: "", image: "" });
    } catch (err: any) {
      toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteCat = (id: number, name: string) => {
    askConfirm(
      isAr ? "حذف الفئة" : "Delete Category",
      isAr
        ? `هل أنت متأكد من حذف فئة "${name}"؟ سيتم حذف جميع تصنيفاتها الفرعية أيضاً.`
        : `Delete category "${name}"? All its subcategories will also be deleted.`,
      async () => {
        try {
          await deleteCat.mutateAsync(id);
          if (expandedCat === id) setExpandedCat(null);
          toast({ title: isAr ? "تم حذف الفئة" : "Category deleted" });
        } catch {
          toast({ title: isAr ? "خطأ" : "Error", variant: "destructive" });
        }
        closeConfirm();
      }
    );
  };

  const handleDeleteSub = (id: number) => {
    askConfirm(
      isAr ? "حذف التصنيف الفرعي" : "Delete Subcategory",
      isAr ? "هل تريد حذف هذا التصنيف الفرعي؟" : "Are you sure you want to delete this subcategory?",
      async () => {
        try {
          await deleteSub.mutateAsync(id);
          toast({ title: isAr ? "تم الحذف" : "Deleted" });
        } catch {
          toast({ title: isAr ? "خطأ" : "Error", variant: "destructive" });
        }
        closeConfirm();
      }
    );
  };

  const handleToggleActive = async (sub: Subcategory) => {
    await updateSub.mutateAsync({ id: sub.id, isActive: !sub.isActive });
  };

  return (
    <AdminLayout>
      <AdminPageHeader
        title={isAr ? "الفئات والتصنيفات الفرعية" : "Categories & Subcategories"}
        description={isAr ? "إدارة الفئات الرئيسية والتصنيفات الفرعية وصورها" : "Manage main categories, subcategories and their images"}
        icon={FolderTree}
        iconGradient="from-emerald-500 to-teal-600"
        testId="text-categories-title"
        actions={
          <Button
            onClick={() => { setCatForm({ name: "", nameAr: "", slug: "", image: "" }); setCatDialogOpen(true); }}
            data-testid="button-add-category"
          >
            <Plus className="w-4 h-4 me-2" />
            {isAr ? "إضافة فئة" : "Add Category"}
          </Button>
        }
      />

      {catLoading || subLoading ? (
        <div className="py-12 flex justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {categories?.map((cat) => {
            const catSubs = (subcategoriesData || []).filter(s => s.categoryId === cat.id);
            const isExpanded = expandedCat === cat.id;
            const displayName = isAr ? ((cat as any).nameAr || cat.name) : cat.name;
            const secondaryName = isAr ? cat.name : ((cat as any).nameAr || "");

            return (
              <div key={cat.id} className={`bg-card border border-border overflow-hidden rounded-md transition-all ${isExpanded ? "shadow-md border-foreground/20" : "hover:shadow-sm hover:border-foreground/15"}`} data-testid={`category-section-${cat.id}`}>
                {/* Row */}
                <div className="flex items-center">
                  {/* Expand chevron */}
                  <button
                    type="button"
                    className="flex items-center justify-center w-12 py-5 hover:bg-muted/30 transition-colors text-muted-foreground flex-shrink-0 self-stretch"
                    onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                    data-testid={`toggle-category-${cat.id}`}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {/* Clickable image square */}
                  <button
                    type="button"
                    className="relative w-11 h-11 flex-shrink-0 border border-dashed border-border bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-center overflow-hidden my-3"
                    onClick={() => catFileRefs.current[cat.id]?.click()}
                    disabled={catUploading === cat.id}
                    data-testid={`button-cat-image-${cat.id}`}
                    title={isAr ? "تغيير الصورة" : "Change image"}
                  >
                    {catUploading === cat.id ? (
                      <div className="w-4 h-4 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
                    ) : cat.image ? (
                      <img src={cat.image} alt={cat.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={el => { catFileRefs.current[cat.id] = el; }}
                      onChange={e => handleCatImageUpload(cat.id, e)}
                    />
                  </button>

                  {/* Text — fills rest, clicking expands */}
                  <button
                    type="button"
                    className="flex-1 px-4 py-4 text-end hover:bg-muted/20 transition-colors min-w-0"
                    onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                    data-testid={`label-category-${cat.id}`}
                  >
                    <div className="flex items-center gap-2 justify-end">
                      {(cat as any).showOnHome && <Home className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />}
                      <p className="font-semibold text-sm sm:text-base leading-snug">{displayName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {secondaryName && <span className="me-1">{secondaryName} ·</span>}
                      <span>{catSubs.length} {isAr ? "تصنيف فرعي" : "subcategories"}</span>
                    </p>
                  </button>

                  {/* Edit button */}
                  <button
                    type="button"
                    className="flex items-center justify-center w-10 self-stretch hover:bg-muted/30 transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
                    onClick={e => { e.stopPropagation(); openEditCat(cat); }}
                    data-testid={`button-edit-cat-${cat.id}`}
                    title={isAr ? "تعديل الفئة" : "Edit category"}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Expanded section */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/5 px-4 sm:px-6 py-5 space-y-5">
                    <div className="flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-2 text-xs"
                        onClick={() => handleDeleteCat(cat.id, (cat as any).nameAr || cat.name)}
                        disabled={deleteCat.isPending}
                        data-testid={`button-delete-cat-${cat.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 me-1" />
                        {isAr ? "حذف الفئة" : "Delete Category"}
                      </Button>
                      <div className="flex items-center gap-4 flex-wrap justify-end">
                        {/* Show on Home toggle */}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateCat.mutateAsync({ id: cat.id, showOnHome: !(cat as any).showOnHome })}
                            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${(cat as any).showOnHome ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`}
                            data-testid={`toggle-cat-show-home-${cat.id}`}
                          >
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${(cat as any).showOnHome ? "end-0.5" : "start-0.5"}`} />
                          </button>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {isAr ? "عرض في الرئيسية" : "Show on home"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{isAr ? "التصنيفات الفرعية" : "Subcategories"}</p>
                          <Button size="sm" onClick={() => openAddSub(cat.id)} className="h-8" data-testid={`button-add-sub-${cat.id}`}>
                            <Plus className="w-3.5 h-3.5 me-1" />
                            {isAr ? "إضافة" : "Add"}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {catSubs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {isAr ? "لا توجد تصنيفات فرعية بعد" : "No subcategories yet"}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {catSubs.map(sub => (
                          <div key={sub.id} className="border border-border p-3 flex items-center gap-3 bg-background" data-testid={`subcategory-card-${sub.id}`}>
                            {sub.image ? (
                              <div className="w-12 h-12 rounded-full overflow-hidden border border-border flex-shrink-0">
                                <img src={sub.image} alt={sub.name} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-full border border-dashed border-border bg-muted/20 flex items-center justify-center flex-shrink-0">
                                <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0 text-end">
                              <div className="flex items-center gap-1.5 justify-end">
                                {(sub as any).showOnHome && <Home className="w-3 h-3 text-blue-500 flex-shrink-0" />}
                                <p className="font-medium text-sm truncate">{isAr ? (sub.nameAr || sub.name) : sub.name}</p>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{isAr ? sub.name : (sub.nameAr || "")}</p>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleActive(sub)}
                                className={`relative w-9 h-5 rounded-full transition-colors ${sub.isActive ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
                                data-testid={`toggle-sub-active-${sub.id}`}
                              >
                                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${sub.isActive ? "end-0.5" : "start-0.5"}`} />
                              </button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditSub(sub)} data-testid={`button-edit-sub-${sub.id}`}>
                                <Edit2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeleteSub(sub.id)} data-testid={`button-delete-sub-${sub.id}`}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Category Dialog */}
      <Dialog open={editCatDialogOpen} onOpenChange={setEditCatDialogOpen}>
        <DialogContent className="max-w-md rounded-none w-[95vw] sm:w-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-end">
              {isAr ? "تعديل الفئة" : "Edit Category"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitEditCat} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-end block">{isAr ? "الاسم بالعربية *" : "Arabic Name *"}</Label>
                <Input required value={editCatForm.nameAr} onChange={e => setEditCatForm({ ...editCatForm, nameAr: e.target.value })} dir="rtl" placeholder="مثال: فساتين" data-testid="input-edit-cat-name-ar" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{isAr ? "الاسم بالإنجليزية *" : "English Name *"}</Label>
                <Input required value={editCatForm.name} onChange={e => setEditCatForm({ ...editCatForm, name: e.target.value })} dir="ltr" placeholder="e.g. Dresses" data-testid="input-edit-cat-name" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{isAr ? "الرابط (slug)" : "Slug"}</Label>
              <Input value={editCatForm.slug} onChange={e => setEditCatForm({ ...editCatForm, slug: e.target.value })} className="font-mono text-sm" dir="ltr" placeholder={isAr ? "يُولّد تلقائياً" : "Auto-generated from English name"} data-testid="input-edit-cat-slug" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{isAr ? "دليل المقاسات (Find My Size)" : "Size Guide (Find My Size)"}</Label>
              <select
                value={editCatForm.sizeGuide}
                onChange={e => setEditCatForm({ ...editCatForm, sizeGuide: e.target.value })}
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-foreground"
                data-testid="select-edit-cat-size-guide"
              >
                <option value="auto">{isAr ? "تلقائي (بناءً على اسم المنتج)" : "Auto (detect from product name)"}</option>
                <option value="clothes">{isAr ? "ملابس (XS – XXL)" : "Clothes (XS – XXL)"}</option>
                <option value="shoes">{isAr ? "أحذية (35 – 43 EU)" : "Shoes (35 – 43 EU)"}</option>
                <option value="pants">{isAr ? "بناطيل (34 – 42 EU)" : "Pants (34 – 42 EU)"}</option>
                <option value="none">{isAr ? "لا يوجد دليل مقاسات" : "None (hide Find My Size)"}</option>
              </select>
              <p className="text-xs text-muted-foreground">{isAr ? "سيُطبّق على جميع منتجات هذه الفئة" : "Applied to all products in this category"}</p>
            </div>
            <Button type="submit" className="w-full rounded-none" disabled={updateCat.isPending} data-testid="button-save-edit-cat">
              {updateCat.isPending ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : (isAr ? "حفظ التعديلات" : "Save Changes")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="max-w-md rounded-none w-[95vw] sm:w-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl text-end">
              {isAr ? "إضافة فئة جديدة" : "Add New Category"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitCat} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-end block">{isAr ? "الاسم بالعربية *" : "Arabic Name *"}</Label>
                <Input required value={catForm.nameAr} onChange={e => setCatForm({ ...catForm, nameAr: e.target.value })} dir="rtl" placeholder="مثال: فساتين" data-testid="input-cat-name-ar" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{isAr ? "الاسم بالإنجليزية *" : "English Name *"}</Label>
                <Input required value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} dir="ltr" placeholder="e.g. Dresses" data-testid="input-cat-name" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{isAr ? "الرابط (slug)" : "Slug"}</Label>
              <Input value={catForm.slug} onChange={e => setCatForm({ ...catForm, slug: e.target.value })} className="font-mono text-sm" dir="ltr" placeholder={isAr ? "يُولّد تلقائياً" : "Auto-generated from English name"} data-testid="input-cat-slug" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{isAr ? "الصورة (اختياري)" : "Image (optional)"}</Label>
              <div className="flex gap-3 items-center">
                <div className="w-16 h-16 border border-dashed border-border bg-muted/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {catForm.image ? <img src={catForm.image} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-muted-foreground/40" />}
                </div>
                <div className="flex-1">
                  <input type="file" accept="image/*" ref={newCatFileRef} className="hidden" onChange={handleNewCatImageUpload} />
                  <Button type="button" variant="outline" size="sm" className="rounded-none w-full" disabled={newCatUploading} onClick={() => newCatFileRef.current?.click()} data-testid="button-upload-new-cat-image">
                    {newCatUploading ? <div className="w-4 h-4 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" /> : <><Upload className="w-4 h-4 me-1" /> {isAr ? "رفع صورة" : "Upload"}</>}
                  </Button>
                </div>
              </div>
            </div>
            <Button type="submit" className="w-full rounded-none" disabled={createCat.isPending} data-testid="button-save-cat">
              {createCat.isPending ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : (isAr ? "إضافة الفئة" : "Add Category")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Subcategory Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm rounded-none w-[95vw] sm:w-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-end">
              {editingSub ? (isAr ? "تعديل التصنيف الفرعي" : "Edit Subcategory") : (isAr ? "إضافة تصنيف فرعي" : "Add Subcategory")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitSub} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium block text-end">{isAr ? "الاسم (إنجليزي) *" : "Name (English) *"}</label>
              <Input required value={subForm.name} onChange={e => setSubForm({ ...subForm, name: e.target.value })} dir="ltr" className="text-start" data-testid="input-sub-name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium block text-end">{isAr ? "الاسم (عربي)" : "Name (Arabic)"}</label>
              <Input value={subForm.nameAr} onChange={e => setSubForm({ ...subForm, nameAr: e.target.value })} dir="rtl" data-testid="input-sub-name-ar" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium block text-end">{isAr ? "الرابط (slug)" : "Slug"}</label>
              <Input value={subForm.slug} onChange={e => setSubForm({ ...subForm, slug: e.target.value })} dir="ltr" className="font-mono text-sm text-start" data-testid="input-sub-slug" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium block text-end">{isAr ? "الصورة" : "Image"}</label>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <Input value={subForm.image} onChange={e => setSubForm({ ...subForm, image: e.target.value })} placeholder={isAr ? "رابط الصورة" : "Image URL"} className="text-xs" dir="ltr" data-testid="input-sub-image-url" />
                  <input type="file" accept="image/*" ref={fileRef} className="hidden" onChange={handleSubImageUpload} />
                  <Button type="button" variant="outline" size="sm" className="rounded-none w-full" disabled={uploading} onClick={() => fileRef.current?.click()} data-testid="button-upload-sub-image">
                    {uploading ? <div className="w-4 h-4 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" /> : <><Upload className="w-4 h-4 me-1" /> {isAr ? "رفع صورة" : "Upload"}</>}
                  </Button>
                </div>
                <div className="w-14 h-14 rounded-full border border-border bg-muted/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {subForm.image ? <img src={subForm.image} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-5 h-5 text-muted-foreground/40" />}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between py-1">
              <button type="button" onClick={() => setSubForm(prev => ({ ...prev, isActive: !prev.isActive }))} className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${subForm.isActive ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} data-testid="toggle-sub-form-active">
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${subForm.isActive ? "end-0.5" : "start-0.5"}`} />
              </button>
              <label className="text-sm font-medium">{isAr ? "مفعّل" : "Active"}</label>
            </div>
            <div className="flex items-center justify-between py-1">
              <button type="button" onClick={() => setSubForm(prev => ({ ...prev, showOnHome: !prev.showOnHome }))} className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${subForm.showOnHome ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`} data-testid="toggle-sub-show-home">
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${subForm.showOnHome ? "end-0.5" : "start-0.5"}`} />
              </button>
              <label className="text-sm font-medium">{isAr ? "عرض في الصفحة الرئيسية" : "Show on Home Page"}</label>
            </div>
            <Button type="submit" className="w-full rounded-none" disabled={createSub.isPending || updateSub.isPending} data-testid="button-save-sub">
              {(createSub.isPending || updateSub.isPending) ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : (editingSub ? (isAr ? "حفظ التعديلات" : "Save Changes") : (isAr ? "إضافة التصنيف" : "Add Subcategory"))}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={confirm.open} onOpenChange={closeConfirm}>
        <DialogContent className="max-w-sm rounded-none w-[90vw] sm:w-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-end">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              {confirm.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-2 text-end">{confirm.message}</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" className="flex-1 rounded-none" onClick={closeConfirm}>{isAr ? "إلغاء" : "Cancel"}</Button>
            <Button variant="destructive" className="flex-1 rounded-none" onClick={confirm.onConfirm}>{isAr ? "حذف" : "Delete"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <ImageCropDialog
        file={currentCrop?.file ?? null}
        previewType="category"
        onConfirm={(croppedFile) => {
          const resolver = currentCrop?.resolve;
          setCurrentCrop(null);
          resolver?.(croppedFile);
        }}
        onCancel={() => {
          const resolver = currentCrop?.resolve;
          setCurrentCrop(null);
          if (currentCrop) resolver?.(currentCrop.file);
        }}
      />
    </AdminLayout>
  );
}
