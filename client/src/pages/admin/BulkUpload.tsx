import { useState, useRef, useCallback } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import {
  CloudUpload, Download, Upload, Sparkles, CheckSquare, Square,
  ChevronRight, ChevronLeft, Loader2, ImageIcon, Wand2,
  Package, FolderOpen, RefreshCw, AlertCircle, Check,
  X, Edit3, Eye, Trash2, Plus, ArrowUpFromLine, Key
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CloudinaryImage {
  publicId: string;
  url: string;
  fullUrl: string;
  width: number;
  height: number;
  createdAt: string;
  format: string;
  bytes: number;
}

interface GeneratedProduct {
  imageUrl: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  colors: string[];
  suggestedPrice: number;
  price: string;
  categoryId: string;
  subcategoryId: string;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  stockQuantity: number;
  aiGenerated: boolean;
  confirmed: boolean;
}

const STEPS = [
  { id: 1, label: "Browse Cloudinary", icon: ImageIcon },
  { id: 2, label: "Select Images", icon: CheckSquare },
  { id: 3, label: "AI Generate", icon: Wand2 },
  { id: 4, label: "Review & Publish", icon: Package },
];

export default function AdminBulkUpload() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [fetchCount, setFetchCount] = useState(30);
  const [cloudinaryImages, setCloudinaryImages] = useState<CloudinaryImage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [generatedProducts, setGeneratedProducts] = useState<GeneratedProduct[]>([]);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<{ created: number; errors: any[] } | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [globalCategory, setGlobalCategory] = useState("");
  const [globalSubcategory, setGlobalSubcategory] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/categories"],
  });
  const { data: subcategories = [] } = useQuery<any[]>({
    queryKey: ["/api/subcategories"],
  });

  const filteredSubs = subcategories.filter(
    (s: any) => !globalCategory || String(s.categoryId) === String(globalCategory)
  );

  // ── Fetch Cloudinary images ───────────────────────────────────────────────
  const fetchImages = useCallback(async (cursor?: string) => {
    setLoadingImages(true);
    try {
      const params = new URLSearchParams({ max_results: String(fetchCount) });
      if (cursor) params.set("next_cursor", cursor);
      const res = await fetch(`/api/admin/cloudinary/images?${params}`);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to fetch");
      const data = await res.json();
      if (cursor) {
        setCloudinaryImages((prev) => [...prev, ...data.resources]);
      } else {
        setCloudinaryImages(data.resources);
      }
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingImages(false);
    }
  }, [fetchCount, toast]);

  const handleFetch = () => {
    setCloudinaryImages([]);
    setSelectedImages(new Set());
    setNextCursor(null);
    fetchImages();
    setStep(2);
  };

  // Navigate back to the selection step WITHOUT wiping anything — used when
  // the user has already loaded images and just wants to continue instead of
  // re-fetching from scratch.
  const continueToSelection = () => setStep(2);

  // ── Image selection ───────────────────────────────────────────────────────
  const toggleImage = (url: string) => {
    setSelectedImages((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  };

  const selectAll = () => setSelectedImages(new Set(cloudinaryImages.map((i) => i.fullUrl)));
  const deselectAll = () => setSelectedImages(new Set());

  // ── AI Generation ─────────────────────────────────────────────────────────
  const generateAI = async () => {
    const urls = Array.from(selectedImages);
    if (!urls.length) return;
    setGeneratingAI(true);
    setAiProgress(0);
    setStep(3);
    try {
      const BATCH = 5;
      const all: GeneratedProduct[] = [];
      for (let i = 0; i < urls.length; i += BATCH) {
        const batch = urls.slice(i, i + BATCH);
        const res = await fetch("/api/admin/ai-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrls: batch }),
        });
        if (!res.ok) {
          const err = await res.json();
          if (err.noKey) {
            toast({
              title: "OpenAI Key Required",
              description: "Add OPENAI_API_KEY in your Secrets tab to enable AI generation. Products will be pre-filled — you can edit them manually.",
              variant: "destructive",
            });
            // Create blank products for manual editing
            urls.forEach((url) => {
              all.push({
                imageUrl: url, name: "", nameAr: "", description: "", descriptionAr: "",
                colors: [], suggestedPrice: 0, price: "0", categoryId: globalCategory,
                subcategoryId: globalSubcategory, isFeatured: false, isNewArrival: true,
                isBestSeller: false, stockQuantity: 0, aiGenerated: false, confirmed: false,
              });
            });
            break;
          }
          throw new Error(err.message);
        }
        const data = await res.json();
        for (const r of data.results) {
          all.push({
            imageUrl: r.url,
            name: r.data?.name || "",
            nameAr: r.data?.nameAr || "",
            description: r.data?.description || "",
            descriptionAr: r.data?.descriptionAr || "",
            colors: r.data?.colors || [],
            suggestedPrice: r.data?.suggestedPrice || 0,
            price: String(r.data?.suggestedPrice || ""),
            categoryId: globalCategory,
            subcategoryId: globalSubcategory,
            isFeatured: false,
            isNewArrival: true,
            isBestSeller: false,
            stockQuantity: 0,
            aiGenerated: r.success,
            confirmed: false,
          });
        }
        setAiProgress(Math.round(((i + BATCH) / urls.length) * 100));
      }
      setGeneratedProducts(all);
      setStep(4);
    } catch (err: any) {
      toast({ title: "AI Error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingAI(false);
      setAiProgress(100);
    }
  };

  const skipAI = () => {
    const products: GeneratedProduct[] = Array.from(selectedImages).map((url) => ({
      imageUrl: url, name: "", nameAr: "", description: "", descriptionAr: "",
      colors: [], suggestedPrice: 0, price: "0", categoryId: globalCategory,
      subcategoryId: globalSubcategory, isFeatured: false, isNewArrival: true,
      isBestSeller: false, stockQuantity: 0, aiGenerated: false, confirmed: false,
    }));
    setGeneratedProducts(products);
    setStep(4);
  };

  // ── Apply global category ─────────────────────────────────────────────────
  const applyGlobalCategory = () => {
    setGeneratedProducts((prev) =>
      prev.map((p) => ({ ...p, categoryId: globalCategory, subcategoryId: globalSubcategory }))
    );
  };

  // ── Publish ───────────────────────────────────────────────────────────────
  const handlePublish = async () => {
    const toPublish = generatedProducts.filter((p) => p.name && p.price);
    if (!toPublish.length) {
      toast({ title: "Nothing to publish", description: "Fill in at least a name and price for each product.", variant: "destructive" });
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch("/api/admin/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: toPublish.map((p) => ({
            name: p.name,
            description: p.description || p.name,
            price: p.price,
            mainImage: p.imageUrl,
            images: [],
            categoryId: p.categoryId || null,
            subcategoryId: p.subcategoryId || null,
            colors: p.colors,
            stockQuantity: p.stockQuantity,
            isFeatured: p.isFeatured,
            isNewArrival: p.isNewArrival,
            isBestSeller: p.isBestSeller,
          })),
        }),
      });
      const data = await res.json();
      setPublishResults(data);
      toast({
        title: `${data.created} products published!`,
        description: data.errors?.length ? `${data.errors.length} failed` : "All products added successfully.",
      });
    } catch (err: any) {
      toast({ title: "Publish failed", description: err.message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  // ── Export backup ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const res = await fetch("/api/admin/products/export-json");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lucerne-products-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Backup downloaded!", description: "All products exported as JSON." });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  };

  // ── Import backup ─────────────────────────────────────────────────────────
  const handleImportFile = async (file: File) => {
    setImportLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const products = data.products || (Array.isArray(data) ? data : null);
      if (!products) throw new Error("Invalid backup file format");
      const res = await fetch("/api/admin/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products }),
      });
      const result = await res.json();
      toast({
        title: "Import Complete",
        description: `${result.created} created, ${result.updated} updated${result.errors?.length ? `, ${result.errors.length} errors` : ""}`,
      });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImportLoading(false);
    }
  };

  const removeProduct = (idx: number) => {
    setGeneratedProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateProduct = (idx: number, field: string, value: any) => {
    setGeneratedProducts((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p))
    );
  };

  const readyCount = generatedProducts.filter((p) => p.name && p.price).length;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <CloudUpload className="w-6 h-6 text-primary" />
              Bulk Product Upload
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Import images from Cloudinary, generate details with AI, and publish in bulk
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-1 sm:gap-2">
            {STEPS.map((s, i) => {
              const isDone = step > s.id;
              const isActive = step === s.id;
              return (
                <div key={s.id} className="flex items-center flex-1 min-w-0">
                  <button
                    onClick={() => isDone && setStep(s.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0",
                      isActive && "bg-primary text-primary-foreground shadow",
                      isDone && "text-primary hover:bg-primary/10 cursor-pointer",
                      !isActive && !isDone && "text-muted-foreground"
                    )}
                  >
                    <div className={cn(
                      "w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                      isActive && "bg-primary-foreground/20",
                      isDone && "bg-primary/15"
                    )}>
                      {isDone ? <Check className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                    </div>
                    <span className="hidden sm:inline truncate">{s.label}</span>
                    <span className="sm:hidden">{s.id}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <div className={cn("h-px flex-1 mx-1", step > s.id ? "bg-primary/40" : "bg-border")} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── STEP 1: Configure & Fetch ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card border border-border rounded-xl p-6 space-y-6">
              {(cloudinaryImages.length > 0 || generatedProducts.length > 0) && (
                <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {generatedProducts.length > 0
                        ? `You have ${generatedProducts.length} product(s) in progress`
                        : `${cloudinaryImages.length} image(s) already loaded (${selectedImages.size} selected)`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pick up where you left off, or fetch new images below (this clears the current progress).
                    </p>
                    <Button
                      size="sm"
                      className="mt-2 gap-1.5"
                      onClick={() => (generatedProducts.length > 0 ? setStep(4) : continueToSelection())}
                      data-testid="button-continue-bulk-upload"
                    >
                      <ChevronRight className="w-4 h-4" />
                      Continue where I left off
                    </Button>
                  </div>
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold mb-1">Cloudinary Image Browser</h2>
                <p className="text-sm text-muted-foreground">
                  Choose how many recent images to load from your Cloudinary account.
                </p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Number of images to fetch</Label>
                  <div className="flex gap-2">
                    {[10, 20, 30, 50, 100].map((n) => (
                      <button
                        key={n}
                        onClick={() => setFetchCount(n)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                          fetchCount === n
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:border-primary/50"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Loads the most recent {fetchCount} images from Cloudinary
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Default Category (optional)</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={globalCategory}
                    onChange={(e) => { setGlobalCategory(e.target.value); setGlobalSubcategory(""); }}
                  >
                    <option value="">No category</option>
                    {categories.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {globalCategory && (
                  <div className="space-y-2">
                    <Label>Default Subcategory (optional)</Label>
                    <select
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={globalSubcategory}
                      onChange={(e) => setGlobalSubcategory(e.target.value)}
                    >
                      <option value="">No subcategory</option>
                      {filteredSubs.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <Button className="w-full gap-2" onClick={handleFetch} disabled={loadingImages} variant={(cloudinaryImages.length > 0 || generatedProducts.length > 0) ? "outline" : "default"}>
                  {loadingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  {(cloudinaryImages.length > 0 || generatedProducts.length > 0) ? "Fetch New Images (clears current progress)" : "Browse Cloudinary Images"}
                </Button>
              </div>
            </div>

            <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                How it works
              </h2>
              <div className="space-y-3">
                {[
                  { icon: ImageIcon, title: "Browse Cloudinary", desc: "Pick images already in your Cloudinary account" },
                  { icon: CheckSquare, title: "Select Images", desc: "Choose all or specific images to import" },
                  { icon: Wand2, title: "AI Auto-Fill", desc: "GPT-4o analyzes each photo and writes the name, description & colors" },
                  { icon: Package, title: "Review & Publish", desc: "Edit anything, set prices, then publish all at once" },
                ].map((item, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <item.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-primary/20 pt-4">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Key className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
                  <span>AI generation requires an <strong>OPENAI_API_KEY</strong> in your Secrets. Without it, you can still fill product details manually.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Image Selection ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{cloudinaryImages.length} images loaded</p>
                <p className="text-sm text-muted-foreground">{selectedImages.size} selected</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  <CheckSquare className="w-4 h-4 me-1.5" /> Select All
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll} disabled={!selectedImages.size}>
                  <Square className="w-4 h-4 me-1.5" /> Deselect All
                </Button>
                {nextCursor && (
                  <Button variant="outline" size="sm" onClick={() => fetchImages(nextCursor)} disabled={loadingImages}>
                    <RefreshCw className={cn("w-4 h-4 me-1.5", loadingImages && "animate-spin")} />
                    Load More
                  </Button>
                )}
                <Button size="sm" onClick={() => setStep(1)} variant="ghost">
                  <ChevronLeft className="w-4 h-4" /> Back
                </Button>
                <Button
                  size="sm"
                  disabled={!selectedImages.size}
                  onClick={generateAI}
                  className="gap-1.5 bg-gradient-to-r from-violet-600 to-primary hover:from-violet-700 hover:to-primary/90 shadow"
                >
                  <Wand2 className="w-4 h-4" />
                  AI Generate ({selectedImages.size})
                </Button>
                <Button size="sm" variant="outline" disabled={!selectedImages.size} onClick={skipAI}>
                  Skip AI <ChevronRight className="w-4 h-4 ms-1" />
                </Button>
              </div>
            </div>

            {loadingImages && cloudinaryImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p>Loading images from Cloudinary…</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {cloudinaryImages.map((img) => {
                  const selected = selectedImages.has(img.fullUrl);
                  return (
                    <button
                      key={img.publicId}
                      onClick={() => toggleImage(img.fullUrl)}
                      className={cn(
                        "relative group rounded-xl overflow-hidden border-2 transition-all duration-150 aspect-square",
                        selected
                          ? "border-primary ring-2 ring-primary/30 shadow-lg"
                          : "border-transparent hover:border-primary/40"
                      )}
                    >
                      <img
                        src={img.url}
                        alt={img.publicId}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className={cn(
                        "absolute inset-0 transition-all duration-150",
                        selected ? "bg-primary/20" : "bg-black/0 group-hover:bg-black/10"
                      )} />
                      <div className={cn(
                        "absolute top-2 right-2 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center transition-all",
                        selected ? "bg-primary border-primary" : "bg-black/30"
                      )}>
                        {selected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-white text-[10px] truncate">{Math.round(img.bytes / 1024)}KB</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: AI Generating ─────────────────────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shadow-xl">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold">AI is analyzing your images…</h2>
              <p className="text-muted-foreground">Generating names, descriptions, and colors with GPT-4o Vision</p>
            </div>
            <div className="w-64 bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-primary rounded-full transition-all duration-500"
                style={{ width: `${aiProgress}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">{aiProgress}% complete — {selectedImages.size} images</p>
          </div>
        )}

        {/* ── STEP 4: Review & Publish ──────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            {/* Publish result banner */}
            {publishResults && (
              <div className={cn(
                "flex items-center gap-3 p-4 rounded-xl border",
                publishResults.errors?.length ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"
              )}>
                <Check className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-semibold">{publishResults.created} products published successfully!</p>
                  {publishResults.errors?.length > 0 && (
                    <p className="text-sm">{publishResults.errors.length} products had errors.</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" className="ms-auto" onClick={() => { setStep(1); setPublishResults(null); setGeneratedProducts([]); setSelectedImages(new Set()); setCloudinaryImages([]); }}>
                  Start Over
                </Button>
              </div>
            )}

            {/* Global category bar */}
            <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-end">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Apply Category to All</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={globalCategory}
                    onChange={(e) => { setGlobalCategory(e.target.value); setGlobalSubcategory(""); }}
                  >
                    <option value="">No category</option>
                    {categories.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Apply Subcategory to All</Label>
                  <select
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={globalSubcategory}
                    onChange={(e) => setGlobalSubcategory(e.target.value)}
                    disabled={!globalCategory}
                  >
                    <option value="">No subcategory</option>
                    {filteredSubs.map((s: any) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={applyGlobalCategory}>
                <FolderOpen className="w-4 h-4" /> Apply to All
              </Button>
            </div>

            {/* Products count & action */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{generatedProducts.length} products to review</p>
                <p className="text-sm text-muted-foreground">
                  <span className="text-emerald-600 font-medium">{readyCount} ready</span>
                  {generatedProducts.length - readyCount > 0 && (
                    <span className="text-amber-600"> · {generatedProducts.length - readyCount} need a name/price</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                  <ChevronLeft className="w-4 h-4 me-1" /> Back
                </Button>
                <Button
                  onClick={handlePublish}
                  disabled={publishing || readyCount === 0}
                  className="gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 shadow"
                >
                  {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Publish {readyCount} Products
                </Button>
              </div>
            </div>

            {/* Product cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {generatedProducts.map((product, idx) => {
                const isEditing = editingIdx === idx;
                const isReady = Boolean(product.name && product.price);
                return (
                  <div
                    key={idx}
                    className={cn(
                      "bg-card border rounded-xl overflow-hidden transition-all",
                      isReady ? "border-border" : "border-amber-300/60 bg-amber-50/30",
                      isEditing && "ring-2 ring-primary/40"
                    )}
                  >
                    {/* Image */}
                    <div className="relative aspect-square bg-muted">
                      <img
                        src={product.imageUrl.replace("/upload/", "/upload/f_auto,q_auto,w_400/")}
                        alt="product"
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute top-2 left-2 flex gap-1">
                        {product.aiGenerated && (
                          <Badge className="text-[10px] bg-violet-600 hover:bg-violet-600 shadow">
                            <Sparkles className="w-2.5 h-2.5 me-0.5" /> AI
                          </Badge>
                        )}
                        {isReady ? (
                          <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600 shadow">
                            <Check className="w-2.5 h-2.5 me-0.5" /> Ready
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500 shadow">
                            <AlertCircle className="w-2.5 h-2.5 me-0.5" /> Incomplete
                          </Badge>
                        )}
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          onClick={() => setEditingIdx(isEditing ? null : idx)}
                          className="w-7 h-7 rounded-lg bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeProduct(idx)}
                          className="w-7 h-7 rounded-lg bg-black/60 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-3 space-y-2">
                      {isEditing ? (
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">Name (EN) *</Label>
                            <Input
                              className="h-7 text-xs mt-0.5"
                              value={product.name}
                              onChange={(e) => updateProduct(idx, "name", e.target.value)}
                              placeholder="Product name"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Name (AR)</Label>
                            <Input
                              className="h-7 text-xs mt-0.5 text-right"
                              dir="rtl"
                              value={product.nameAr}
                              onChange={(e) => updateProduct(idx, "nameAr", e.target.value)}
                              placeholder="اسم المنتج"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Description</Label>
                            <textarea
                              className="w-full text-xs border border-input rounded-md p-2 mt-0.5 min-h-[60px] bg-background resize-none"
                              value={product.description}
                              onChange={(e) => updateProduct(idx, "description", e.target.value)}
                              placeholder="Product description"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Price (ILS) *</Label>
                              <Input
                                className="h-7 text-xs mt-0.5"
                                type="number"
                                value={product.price}
                                onChange={(e) => updateProduct(idx, "price", e.target.value)}
                                placeholder="0"
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Stock</Label>
                              <Input
                                className="h-7 text-xs mt-0.5"
                                type="number"
                                value={product.stockQuantity}
                                onChange={(e) => updateProduct(idx, "stockQuantity", parseInt(e.target.value) || 0)}
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Category</Label>
                            <select
                              className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs mt-0.5"
                              value={product.categoryId}
                              onChange={(e) => updateProduct(idx, "categoryId", e.target.value)}
                            >
                              <option value="">None</option>
                              {categories.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          {product.categoryId && (
                            <div>
                              <Label className="text-xs">Subcategory</Label>
                              <select
                                className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs mt-0.5"
                                value={product.subcategoryId}
                                onChange={(e) => updateProduct(idx, "subcategoryId", e.target.value)}
                              >
                                <option value="">None</option>
                                {subcategories
                                  .filter((s: any) => String(s.categoryId) === String(product.categoryId))
                                  .map((s: any) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                              </select>
                            </div>
                          )}
                          <div className="flex gap-3 text-xs">
                            {["isFeatured", "isNewArrival", "isBestSeller"].map((flag) => (
                              <label key={flag} className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean((product as any)[flag])}
                                  onChange={(e) => updateProduct(idx, flag, e.target.checked)}
                                />
                                {flag === "isFeatured" ? "Featured" : flag === "isNewArrival" ? "New" : "Best Seller"}
                              </label>
                            ))}
                          </div>
                          <Button size="sm" className="w-full h-7 text-xs" onClick={() => setEditingIdx(null)}>
                            <Check className="w-3 h-3 me-1" /> Done
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div>
                            <p className={cn("font-semibold text-sm truncate", !product.name && "text-muted-foreground italic")}>
                              {product.name || "— No name yet —"}
                            </p>
                            {product.nameAr && (
                              <p className="text-xs text-muted-foreground truncate text-right" dir="rtl">{product.nameAr}</p>
                            )}
                          </div>
                          {product.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <span className={cn("text-sm font-bold", !product.price && "text-muted-foreground italic")}>
                              {product.price ? `₪${product.price}` : "No price"}
                            </span>
                            <div className="flex gap-1 flex-wrap justify-end">
                              {product.colors.slice(0, 3).map((c) => (
                                <Badge key={c} variant="outline" className="text-[10px] px-1.5 py-0">{c}</Badge>
                              ))}
                            </div>
                          </div>
                          {(product.categoryId || product.subcategoryId) && (
                            <p className="text-xs text-muted-foreground truncate">
                              {categories.find((c: any) => String(c.id) === String(product.categoryId))?.name}
                              {product.subcategoryId && " › "}
                              {subcategories.find((s: any) => String(s.id) === String(product.subcategoryId))?.name}
                            </p>
                          )}
                          <div className="flex gap-1">
                            {product.isFeatured && <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500">Featured</Badge>}
                            {product.isNewArrival && <Badge className="text-[10px] bg-blue-500 hover:bg-blue-500">New</Badge>}
                            {product.isBestSeller && <Badge className="text-[10px] bg-rose-500 hover:bg-rose-500">Best Seller</Badge>}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Add placeholder card */}
              <button
                onClick={() => setStep(2)}
                className="border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 aspect-square text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors min-h-[200px]"
              >
                <Plus className="w-8 h-8" />
                <span className="text-sm">Add more images</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
