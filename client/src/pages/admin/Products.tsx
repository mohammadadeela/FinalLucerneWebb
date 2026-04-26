import { useState, useRef, useEffect, useCallback } from "react";
import JsBarcode from "jsbarcode";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import {
  useProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
} from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Edit2,
  Trash2,
  Upload,
  X,
  ImageIcon,
  Palette,
  Search,
  Save,
  Star,
  Sparkles,
  Flame,
  Tag,
  ChevronDown,
  Check,
  Clock,
  Loader2,
  Eye,
  FileSpreadsheet,
  Download,
  Copy,
  CheckCheck,
  AlertCircle,
  RefreshCw,
  Package,
  DollarSign,
  Layers,
  Hash,
  Grid3X3,
  List,
  LayoutGrid,
  Printer,
  FileText,
  Images,
  ChevronLeft,
  ChevronRight,
  Pipette,
} from "lucide-react";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import {
  type InsertProduct,
  type Product,
  type ColorVariant,
  type MediaItem,
} from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import {
  COLOR_FAMILIES,
  type ColorFamily,
  type ColorMember,
} from "@/lib/colorFamilies";

function BarcodeSvg({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        displayValue: true,
        fontSize: 10,
        textMargin: 2,
        width: 1.3,
        height: 36,
        margin: 2,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {}
  }, [value]);
  return <svg ref={svgRef} className="w-full" />;
}

function printBarcodeLabels(
  products: { id: number; name: string; barcode: string | null }[],
) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  const labels = products
    .filter((p) => p.barcode)
    .map((p) => {
      const id = `bc_${p.id}`;
      return `
        <div class="label" id="wrap_${p.id}">
          <svg id="${id}"></svg>
          <div class="meta">
            <span class="pname">${p.name.slice(0, 28)}</span>
            <span class="pid">#${String(p.id).padStart(4, "0")}</span>
          </div>
        </div>`;
    })
    .join("");
  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Barcodes</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fff; }
  .grid { display: flex; flex-wrap: wrap; gap: 0; }
  .label { width: 6cm; height: 4cm; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3px 5px 2px; border: 0.5px dashed #ccc; page-break-inside: avoid; break-inside: avoid; }
  .label svg { width: 100%; max-height: 2.6cm; }
  .meta { display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 2px; }
  .pname { font-size: 7pt; font-family: sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%; }
  .pid { font-size: 7pt; font-family: monospace; color: #555; }
  @page { size: auto; margin: 5mm; }
  @media print { body { margin: 0; } .grid { gap: 0; } }
</style>
</head>
<body>
<div class="grid">${labels}</div>
<script>
  window.onload = function() {
    var products = ${JSON.stringify(products.filter((p) => p.barcode))};
    products.forEach(function(p) {
      var el = document.getElementById('bc_' + p.id);
      if (el && p.barcode) {
        JsBarcode(el, p.barcode, { format: 'CODE128', displayValue: true, fontSize: 10, textMargin: 2, width: 1.3, height: 36, margin: 2, background: '#ffffff', lineColor: '#000000' });
      }
    });
    setTimeout(function() { window.print(); }, 400);
  };
<\/script>
</body>
</html>`);
  win.document.close();
}

function generateBarcode(): string {
  const ts = Date.now().toString().slice(-8);
  const rnd = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `LB${ts}${rnd}`;
}

interface VariantState {
  name: string;
  colorCode: string;
  mainImage: string;
  images: string[];
  sizeRows: { size: string; qty: number }[];
  newSizeName: string;
  colorTags: string[];
  media: MediaItem[];
}

const CATEGORY_AR: Record<string, string> = {
  dresses: "فساتين",
  tops: "توبات وبلوزات",
  "pants-skirts": "بناطيل وتنانير",
  shoes: "أحذية",
  bags: "حقائب",
  accessories: "إكسسوارات",
};

// IDs: 1=Dresses, 2=Tops, 3=Pants-Skirts, 4=Shoes
const SHOES_CATEGORY_ID = 4;
const CLOTHES_CATEGORY_IDS = [1, 2, 3];

const QUICK_SIZES: Record<"shoes" | "clothes", string[]> = {
  shoes: ["35", "36", "37", "38", "39", "40", "41", "42", "43"],
  clothes: ["XS", "S", "M", "L", "XL", "XXL"],
};

function getQuickSizes(categoryId: number | string): string[] {
  const id = Number(categoryId);
  if (id === SHOES_CATEGORY_ID) return QUICK_SIZES.shoes;
  return QUICK_SIZES.clothes;
}

const NAME_TEMPLATES: Record<string, string[]> = {
  dresses: [
    "فستان سهرة أنيق",
    "فستان كاجوال يومي",
    "فستان فلوري عصري",
    "فستان ماكسي أنيق",
    "فستان ميدي راقي",
    "فستان بودي كون مميز",
    "فستان كلوش واسع",
    "فستان صيفي ملون",
    "فستان منقوش أنيق",
    "فستان شيفون سهرة",
  ],
  clothes: [
    "بلوزة أنيقة",
    "قميص كاجوال عصري",
    "توب محبوك أنيق",
    "بنطلون واسع بيج",
    "تنورة ميدي عصرية",
    "تنورة كلوش قصيرة",
    "بنطلون جينز مريح",
    "جاكيت أنيق",
    "كارديجان ناعم",
    "بلوزة برنت أنيقة",
  ],
  shoes: [
    "حذاء كعب عالي أنيق",
    "شوزات كاجوال مريحة",
    "حذاء فلات عصري",
    "شوزات بلاتفورم أنيقة",
    "كعب عالي كلاسيكي",
    "صندل صيفي",
    "بوت شتوي أنيق",
    "شوزات رياضية أنيقة",
    "كوتشي جلد",
    "حذاء ميول أنيق",
  ],
  bags: [
    "حقيبة يد أنيقة",
    "شنطة كروس بودي",
    "حقيبة تسوق عملية",
    "حقيبة كلاتش سهرة",
    "بالشوت جلد",
    "حقيبة ظهر عصرية",
    "توتباق كبير أنيق",
    "ميني باق أنيق",
  ],
  accessories: [
    "قلادة ذهبية أنيقة",
    "أسورة فضية رفيعة",
    "خاتم أنيق",
    "طاقة شعر مميزة",
    "حزام جلد أنيق",
    "نظارة شمس عصرية",
    "وشاح حرير أنيق",
    "بروش مرصع",
  ],
  default: ["قطعة أنيقة مميزة", "إطلالة عصرية", "موديل جديد", "قطعة فاخرة"],
};

const DESC_TEMPLATES: Record<string, string[]> = {
  ar: [
    "تصميم أنيق ومريح، مناسب لجميع المناسبات. مصنوع من أجود الأقمشة.",
    "قطعة عصرية بلمسات راقية، تمنحك إطلالة متميزة في كل مناسبة.",
    "تصميم فريد يجمع بين الأناقة والراحة، مثالية للمرأة الواثقة من نفسها.",
    "خامة عالية الجودة وتفاصيل دقيقة، لإطلالة لا تُنسى.",
    "قطعة متعددة الاستخدامات تناسب المناسبات الرسمية واليومية.",
    "تفصيل محكم وخياطة دقيقة، تُضفي عليكِ إطلالةً بالغة الأناقة.",
    "موديل حصري بألوان متعددة يناسب جميع الأذواق والمناسبات.",
  ],
  en: [
    "An elegant and comfortable design suitable for all occasions. Made from premium quality materials.",
    "A modern piece with refined touches that gives you a distinctive look for every occasion.",
    "A unique design combining elegance and comfort, perfect for the confident woman.",
    "High-quality fabric with fine details for an unforgettable look.",
    "A versatile piece suitable for all occasions from formal to everyday.",
    "Precise tailoring and fine stitching for an exceptionally elegant look.",
    "An exclusive model in multiple colors to suit all tastes and occasions.",
  ],
};

function getCategoryType(catId: number | string, cats?: any[]): string {
  const id = Number(catId);
  const cat = cats?.find((c: any) => c.id === id);
  if (!cat) {
    if (id === 4) return "shoes";
    if (id === 1) return "dresses";
    return "clothes";
  }
  const name = (cat.name || "").toLowerCase();
  const nameAr = (cat.nameAr || "").toLowerCase();
  if (name.includes("dress") || nameAr.includes("فسات")) return "dresses";
  if (
    name.includes("shoe") ||
    nameAr.includes("شوز") ||
    nameAr.includes("حذاء")
  )
    return "shoes";
  if (
    name.includes("bag") ||
    name.includes("handbag") ||
    nameAr.includes("حقيب") ||
    nameAr.includes("شنط")
  )
    return "bags";
  if (
    name.includes("access") ||
    nameAr.includes("إكسسوار") ||
    nameAr.includes("اكسسوار")
  )
    return "accessories";
  return "clothes";
}

function getFamilyForMember(member: ColorMember): ColorFamily | undefined {
  return COLOR_FAMILIES.find((family) =>
    family.members.some(
      (m) =>
        m.nameEn === member.nameEn &&
        m.hex.toLowerCase() === member.hex.toLowerCase(),
    ),
  );
}

function getVariantFamilies(tags: string[]): ColorFamily[] {
  return tags
    .map((tag) => COLOR_FAMILIES.find((family) => family.key === tag))
    .filter((family): family is ColorFamily => Boolean(family));
}

function SectionHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3 py-2 border-t border-border mt-1">
      <span className="w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold flex-shrink-0">
        {n}
      </span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
  );
}

function hexToColorName(hex: string, lang: "ar" | "en"): string {
  if (!hex || hex.length < 7) return "";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const rN = r / 255,
    gN = g / 255,
    bN = b / 255;
  const max = Math.max(rN, gN, bN),
    min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === rN) h = (((gN - bN) / d + 6) % 6) * 60;
    else if (max === gN) h = ((bN - rN) / d + 2) * 60;
    else h = ((rN - gN) / d + 4) * 60;
  }
  const lp = l * 100,
    sp = s * 100;
  const n = (() => {
    if (lp > 92) return { ar: "أبيض", en: "White" };
    if (lp < 8) return { ar: "أسود", en: "Black" };
    if (sp < 12) {
      if (lp > 70) return { ar: "رمادي فاتح", en: "Light Gray" };
      if (lp < 35) return { ar: "رمادي داكن", en: "Dark Gray" };
      return { ar: "رمادي", en: "Gray" };
    }
    if (lp < 22) return { ar: "داكن", en: "Dark" };
    if (h < 15 || h >= 345)
      return lp > 60 ? { ar: "وردي", en: "Pink" } : { ar: "أحمر", en: "Red" };
    if (h < 45)
      return lp > 65
        ? { ar: "خوخي", en: "Peach" }
        : { ar: "برتقالي", en: "Orange" };
    if (h < 65) return { ar: "أصفر", en: "Yellow" };
    if (h < 155)
      return lp > 65
        ? { ar: "أخضر فاتح", en: "Mint" }
        : { ar: "أخضر", en: "Green" };
    if (h < 200)
      return lp < 40
        ? { ar: "زيتي", en: "Olive Teal" }
        : { ar: "تركوازي", en: "Teal" };
    if (h < 255) {
      if (lp < 30) return { ar: "كحلي", en: "Navy" };
      if (lp > 65) return { ar: "أزرق سماوي", en: "Sky Blue" };
      return { ar: "أزرق", en: "Blue" };
    }
    if (h < 300)
      return lp > 60
        ? { ar: "لافندر", en: "Lavender" }
        : { ar: "بنفسجي", en: "Purple" };
    return { ar: "وردي فوشيا", en: "Fuchsia" };
  })();
  return lang === "ar" ? n.ar : n.en;
}

function getDefaultSizes(
  categoryId: number | string,
): { size: string; qty: number }[] {
  const id = Number(categoryId);
  if (id === SHOES_CATEGORY_ID) {
    return [
      { size: "36", qty: 1 },
      { size: "37", qty: 2 },
      { size: "38", qty: 2 },
      { size: "39", qty: 2 },
      { size: "40", qty: 1 },
    ];
  }
  if (CLOTHES_CATEGORY_IDS.includes(id)) {
    return [
      { size: "S", qty: 2 },
      { size: "M", qty: 2 },
      { size: "L", qty: 2 },
    ];
  }
  return [];
}

function SelectBox({
  checked,
  onChange,
  indeterminate = false,
  testId,
}: {
  checked: boolean;
  onChange: () => void;
  indeterminate?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      data-testid={testId}
      className={`w-5 h-5 flex-shrink-0 flex items-center justify-center border rounded transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary ${
        checked || indeterminate
          ? "bg-primary border-primary text-primary-foreground"
          : "bg-background border-border hover:border-primary/60"
      }`}
    >
      {indeterminate ? (
        <span className="block w-2.5 h-0.5 bg-current" />
      ) : checked ? (
        <Check className="w-3 h-3 stroke-[3]" />
      ) : null}
    </button>
  );
}

export default function Products() {
  const { data: products, isLoading } = useProducts();
  const { data: categories } = useCategories();
  const { data: subcategoriesData } = useQuery<any[]>({
    queryKey: ["/api/subcategories"],
  });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [, navigate] = useLocation();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | "">("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const initialForm: any = {
    name: "",
    description: "",
    price: "",
    costPrice: "",
    discountPrice: "",
    categoryId: 1,
    subcategoryId: "",
    isFeatured: false,
    isNewArrival: false,
    isBestSeller: false,
    brand: "",
    barcode: generateBarcode(),
    videoUrl: "",
  };
  const [formData, setFormData] = useState(initialForm);
  const [variants, setVariants] = useState<VariantState[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{
    images: string[];
    name: string;
    idx: number;
  } | null>(null);
  const nameInputRef = useRef<HTMLDivElement>(null);
  const [showDescSuggestions, setShowDescSuggestions] = useState(false);
  const [showNameTemplates, setShowNameTemplates] = useState(false);
  const [showDescTemplates, setShowDescTemplates] = useState(false);
  const [paletteFamily, setPaletteFamily] = useState<string | null>(null);

  // --- Barcode print dialog state ---
  const [showBarcodePreview, setShowBarcodePreview] = useState(false);
  const [barcodeSearch, setBarcodeSearch] = useState("");
  const [selectedBarcodeIds, setSelectedBarcodeIds] = useState<Set<number>>(
    new Set(),
  );

  // --- Excel import dialog state ---
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3>(1);
  const [importImageUrls, setImportImageUrls] = useState<string[]>([]);
  const [importImgLoading, setImportImgLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [pasteUrlInput, setPasteUrlInput] = useState("");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    errors: string[];
  } | null>(null);

  const LOW_STOCK_THRESHOLD = 5;
  const [showLowStock, setShowLowStock] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountApplying, setDiscountApplying] = useState(false);
  const [selectedLowStockIds, setSelectedLowStockIds] = useState<Set<number>>(
    new Set(),
  );

  const [isFlagsDialogOpen, setIsFlagsDialogOpen] = useState(false);
  const [flagSelections, setFlagSelections] = useState<{
    isBestSeller: "unchanged" | "on" | "off";
    isNewArrival: "unchanged" | "on" | "off";
    isFeatured: "unchanged" | "on" | "off";
  }>({
    isBestSeller: "unchanged",
    isNewArrival: "unchanged",
    isFeatured: "unchanged",
  });
  const [flagsApplying, setFlagsApplying] = useState(false);

  // New arrivals expiry
  const { data: siteSettings } = useSiteSettings();
  const [newArrivalDays, setNewArrivalDays] = useState(14);
  const [expireLoading, setExpireLoading] = useState(false);
  useEffect(() => {
    const saved = getSetting(siteSettings, "new_arrivals_days");
    if (saved) setNewArrivalDays(parseInt(saved) || 14);
  }, [siteSettings]);

  const handleApplyDiscount = async () => {
    const pct = parseFloat(discountPercent);
    if (!pct || pct <= 0 || pct >= 100) {
      toast({
        title: language === "ar" ? "نسبة غير صحيحة" : "Invalid percentage",
        variant: "destructive",
      });
      return;
    }
    const ids =
      selectedLowStockIds.size > 0
        ? Array.from(selectedLowStockIds)
        : lowStockProducts.map((p) => p.id);
    if (ids.length === 0) return;
    setDiscountApplying(true);
    try {
      const res = await fetch("/api/admin/products/bulk-discount", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, discountPercent: pct }),
      });
      if (!res.ok) throw new Error("Failed");
      const { updated } = await res.json();
      import("@/lib/queryClient").then(({ queryClient }) => {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      });
      toast({
        title:
          language === "ar"
            ? `تم تطبيق الخصم على ${updated} منتج`
            : `Discount applied to ${updated} product(s)`,
      });
      setShowDiscountDialog(false);
      setDiscountPercent("");
      setSelectedLowStockIds(new Set());
    } catch {
      toast({
        title: language === "ar" ? "فشل التطبيق" : "Failed to apply discount",
        variant: "destructive",
      });
    } finally {
      setDiscountApplying(false);
    }
  };

  const handleRemoveDiscount = async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/admin/products/remove-discount", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed");
      const { updated } = await res.json();
      import("@/lib/queryClient").then(({ queryClient }) => {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      });
      toast({
        title:
          language === "ar"
            ? `تمت إزالة الخصم من ${updated} منتج`
            : `Discount removed from ${updated} product(s)`,
      });
      setSelectedLowStockIds(new Set());
    } catch {
      toast({
        title: language === "ar" ? "فشل" : "Failed",
        variant: "destructive",
      });
    }
  };

  const handleExpireNewArrivals = async () => {
    setExpireLoading(true);
    try {
      const res = await fetch("/api/admin/products/expire-new-arrivals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: newArrivalDays }),
      });
      if (!res.ok) throw new Error("Failed");
      const { updated } = await res.json();
      import("@/lib/queryClient").then(({ queryClient }) => {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/site-settings"] });
      });
      toast({
        title:
          language === "ar"
            ? `تم تطبيق الفترة — ${updated} منتج خرج من الوصول الجديد`
            : `Applied — ${updated} product(s) removed from New Arrivals`,
      });
    } catch {
      toast({ title: t.auth.error, variant: "destructive" });
    } finally {
      setExpireLoading(false);
    }
  };

  const filteredProducts = products?.filter((p) => {
    if (categoryFilter !== "" && p.categoryId !== categoryFilter) return false;
    if (showLowStock && p.stockQuantity >= LOW_STOCK_THRESHOLD) return false;
    if (!search) return true;
    const q = search.toLowerCase().replace(/^#/, "");
    const productNum = String(p.id).padStart(4, "0");
    const productBarcode = String((p as any).barcode || "").toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.brand || "").toLowerCase().includes(q) ||
      (p.colors || []).some((c) => c.toLowerCase().includes(q)) ||
      productBarcode.includes(q) ||
      productNum.includes(q) ||
      String(p.id).includes(q)
    );
  });

  const lowStockProducts =
    filteredProducts?.filter((p) => p.stockQuantity < LOW_STOCK_THRESHOLD) ??
    [];

  const uploadFiles = async (files: FileList | File[]): Promise<string[]> => {
    const fd = new FormData();
    Array.from(files).forEach((file) => fd.append("images", file));
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || "Upload failed");
    }
    const data = await res.json();
    return data.urls as string[];
  };

  const deleteCloudinaryImage = async (url: string) => {
    if (!url || !url.includes("cloudinary.com")) return;
    try {
      await fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } catch {}
  };

  const openCreate = () => {
    setFormData(initialForm);
    setVariants([]);
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setFormData({
      name: p.name,
      description: p.description,
      price: p.price,
      costPrice: (p as any).costPrice || "",
      discountPrice: p.discountPrice || "",
      categoryId: p.categoryId,
      subcategoryId: (p as any).subcategoryId || "",
      isFeatured: p.isFeatured,
      isNewArrival: p.isNewArrival,
      isBestSeller: (p as any).isBestSeller || false,
      brand: p.brand || "",
      barcode: (p as any).barcode || "",
      videoUrl: (p as any).videoUrl || "",
    });

    const cv = (p as any).colorVariants as ColorVariant[] | undefined;
    const productVideoUrl = (p as any).videoUrl as string | undefined;
    if (cv && cv.length > 0) {
      setVariants(
        cv.map((v, vIdx) => {
          let media: MediaItem[];
          if (v.media && v.media.length > 0) {
            media = v.media;
          } else {
            media = [];
            if (v.mainImage)
              media.push({ type: "image", url: v.mainImage, isPrimary: true });
            for (const img of v.images || [])
              media.push({ type: "image", url: img });
            if (vIdx === 0 && productVideoUrl)
              media.push({ type: "video", url: productVideoUrl });
          }
          return {
            name: v.name,
            colorCode: v.colorCode || "#000000",
            mainImage: v.mainImage,
            images: v.images || [],
            sizeRows: Object.entries(v.sizeInventory || {}).map(
              ([size, qty]) => ({ size, qty: qty as number }),
            ),
            newSizeName: "",
            colorTags: v.colorTags || [],
            media,
          };
        }),
      );
    } else {
      const inv = (p as any).sizeInventory || {};
      const rows = Object.entries(inv).map(([size, qty]) => ({
        size,
        qty: qty as number,
      }));
      if (rows.length === 0 && p.sizes && p.sizes.length > 0) {
        const perSize =
          p.sizes.length > 0 ? Math.floor(p.stockQuantity / p.sizes.length) : 0;
        p.sizes.forEach((s) => rows.push({ size: s, qty: perSize }));
      }
      const colors = p.colors || [];
      if (colors.length > 0) {
        setVariants(
          colors.map((c, i) => ({
            name: c,
            colorCode: "#000000",
            mainImage: i === 0 ? p.mainImage : "",
            images: i === 0 ? p.images || [] : [],
            sizeRows: [...rows],
            newSizeName: "",
            colorTags: [],
            media:
              i === 0
                ? [
                    ...(p.mainImage
                      ? [
                          {
                            type: "image" as const,
                            url: p.mainImage,
                            isPrimary: true,
                          },
                        ]
                      : []),
                    ...(p.images || []).map((url: string) => ({
                      type: "image" as const,
                      url,
                    })),
                    ...(productVideoUrl
                      ? [{ type: "video" as const, url: productVideoUrl }]
                      : []),
                  ]
                : [],
          })),
        );
      } else {
        setVariants([
          {
            name: "Default",
            colorCode: "#000000",
            mainImage: p.mainImage,
            images: p.images || [],
            sizeRows: rows,
            newSizeName: "",
            colorTags: [],
            media: [
              ...(p.mainImage
                ? [
                    {
                      type: "image" as const,
                      url: p.mainImage,
                      isPrimary: true,
                    },
                  ]
                : []),
              ...(p.images || []).map((url: string) => ({
                type: "image" as const,
                url,
              })),
              ...(productVideoUrl
                ? [{ type: "video" as const, url: productVideoUrl }]
                : []),
            ],
          },
        ]);
      }
    }

    setEditingId(p.id);
    setIsDialogOpen(true);
  };

  const addVariant = () => {
    const defaultSizes = getDefaultSizes(formData.categoryId);
    setVariants((prev) => [
      {
        name: "",
        colorCode: "#000000",
        mainImage: "",
        images: [],
        sizeRows: defaultSizes,
        newSizeName: "",
        colorTags: [],
        media: [],
      },
      ...prev,
    ]);
  };

  const addVariantFromPalette = (member: ColorMember) => {
    const alreadyExists = variants.some(
      (v) => v.colorCode.toLowerCase() === member.hex.toLowerCase(),
    );
    if (alreadyExists) {
      toast({
        title:
          language === "ar"
            ? "هذا اللون موجود بالفعل"
            : "This color already exists",
        variant: "destructive",
      });
      return;
    }
    const name = language === "ar" ? member.nameAr : member.nameEn;
    const defaultSizes = getDefaultSizes(formData.categoryId);
    const family = getFamilyForMember(member);
    setVariants((prev) => [
      {
        name,
        colorCode: member.hex,
        mainImage: "",
        images: [],
        sizeRows: defaultSizes,
        newSizeName: "",
        colorTags: family ? [family.key] : [],
        media: [],
      },
      ...prev,
    ]);
  };

  const toggleVariantColorTag = (idx: number, family: ColorFamily) => {
    const variant = variants[idx];
    const selected = variant.colorTags.includes(family.key);
    const colorTags = selected
      ? variant.colorTags.filter((tag) => tag !== family.key)
      : [...variant.colorTags, family.key];
    const updates: Partial<VariantState> = { colorTags };
    if (!selected && colorTags.length === 1) {
      updates.colorCode = family.hex;
      const currentAutoName = hexToColorName(
        variant.colorCode,
        language === "ar" ? "ar" : "en",
      );
      if (!variant.name.trim() || variant.name === currentAutoName) {
        updates.name = language === "ar" ? family.nameAr : family.nameEn;
      }
    }
    updateVariant(idx, updates);
  };

  const removeVariant = (idx: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateVariant = (idx: number, updates: Partial<VariantState>) => {
    setVariants((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, ...updates } : v)),
    );
  };

  const handleMediaUpload = async (
    variantIdx: number,
    files: FileList | File[],
  ) => {
    const fileArr = Array.from(files);
    const videoFiles = fileArr.filter((f) => f.type.startsWith("video/"));
    const imageFiles = fileArr.filter((f) => !f.type.startsWith("video/"));

    for (const file of videoFiles) {
      setVideoUploading(true);
      try {
        const fd = new FormData();
        fd.append("video", file);
        const res = await fetch("/api/upload-video", {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Upload failed");
        }
        const data = await res.json();
        setVariants((prev) =>
          prev.map((v, i) => {
            if (i !== variantIdx) return v;
            const cur = v.media || [];
            const newItem: MediaItem = {
              type: "video",
              url: data.url,
              isPrimary: cur.length === 0,
            };
            return { ...v, media: [...cur, newItem] };
          }),
        );
        toast({
          title: language === "ar" ? "تم رفع الفيديو" : "Video uploaded",
        });
      } catch (err: any) {
        toast({
          title: t.auth.error,
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setVideoUploading(false);
      }
    }

    if (imageFiles.length > 0) {
      setUploading(true);
      try {
        const urls = await uploadFiles(imageFiles);
        setVariants((prev) =>
          prev.map((v, i) => {
            if (i !== variantIdx) return v;
            const cur = v.media || [];
            const newItems: MediaItem[] = urls.map((url, idx) => ({
              type: "image",
              url,
              isPrimary: cur.length === 0 && idx === 0,
            }));
            return { ...v, media: [...cur, ...newItems] };
          }),
        );
      } catch (err: any) {
        toast({
          title: t.auth.error,
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setUploading(false);
      }
    }
  };

  const handleRemoveMedia = (variantIdx: number, mediaIdx: number) => {
    const variant = variants[variantIdx];
    const item = variant.media[mediaIdx];
    deleteCloudinaryImage(item.url);
    const newMedia = variant.media.filter((_, i) => i !== mediaIdx);
    if (item.isPrimary && newMedia.length > 0) {
      newMedia[0] = { ...newMedia[0], isPrimary: true };
    }
    updateVariant(variantIdx, { media: newMedia });
  };

  const handleSetPrimary = (variantIdx: number, mediaIdx: number) => {
    const variant = variants[variantIdx];
    const newMedia = variant.media.map((item, i) => ({
      ...item,
      isPrimary: i === mediaIdx,
    }));
    updateVariant(variantIdx, { media: newMedia });
  };

  const addSizeToVariant = (idx: number) => {
    const v = variants[idx];
    const name = v.newSizeName.trim().toUpperCase();
    if (!name) return;
    if (v.sizeRows.some((r) => r.size === name)) {
      toast({
        title: t.auth.error,
        description: `${name} already exists`,
        variant: "destructive",
      });
      return;
    }
    updateVariant(idx, {
      sizeRows: [...v.sizeRows, { size: name, qty: 0 }],
      newSizeName: "",
    });
  };

  const updateSizeQtyInVariant = (
    variantIdx: number,
    sizeIdx: number,
    qty: number,
  ) => {
    const v = variants[variantIdx];
    updateVariant(variantIdx, {
      sizeRows: v.sizeRows.map((r, i) =>
        i === sizeIdx ? { ...r, qty: Math.max(0, qty) } : r,
      ),
    });
  };

  const removeSizeFromVariant = (variantIdx: number, sizeIdx: number) => {
    const v = variants[variantIdx];
    updateVariant(variantIdx, {
      sizeRows: v.sizeRows.filter((_, i) => i !== sizeIdx),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.discountPrice && formData.price) {
      if (parseFloat(formData.discountPrice) >= parseFloat(formData.price)) {
        toast({
          title: t.auth.error,
          description:
            language === "ar"
              ? "يجب أن يكون سعر الخصم أقل من السعر الأصلي"
              : "Discount price must be less than the original price",
          variant: "destructive",
        });
        return;
      }
    }
    if (variants.length === 0) {
      toast({
        title: t.auth.error,
        description: t.admin.noVariantsNote,
        variant: "destructive",
      });
      return;
    }
    const usedNames = new Set<string>();
    for (let vi = 0; vi < variants.length; vi++) {
      const v = variants[vi];
      if (!v.name.trim()) {
        toast({
          title: t.auth.error,
          description: "Color name required",
          variant: "destructive",
        });
        return;
      }
      const lowerName = v.name.trim().toLowerCase();
      if (usedNames.has(lowerName)) {
        toast({
          title: t.auth.error,
          description: `Duplicate color: ${v.name}`,
          variant: "destructive",
        });
        return;
      }
      usedNames.add(lowerName);
      const hasMedia =
        (v.media && v.media.length > 0) ||
        v.mainImage ||
        (vi === 0 && formData.videoUrl);
      if (!hasMedia) {
        toast({
          title: t.auth.error,
          description: `${v.name}: ${t.admin.variantMainImage} required`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const colorVariantsData: ColorVariant[] = variants.map((v) => {
        const sizeInventory: Record<string, number> = {};
        v.sizeRows.forEach((r) => {
          sizeInventory[r.size] = r.qty;
        });
        const mediaItems = v.media || [];
        const primaryImg =
          mediaItems.find((m) => m.type === "image" && m.isPrimary) ||
          mediaItems.find((m) => m.type === "image");
        const derivedMainImage = primaryImg?.url || v.mainImage || "";
        const derivedImages =
          mediaItems.length > 0
            ? mediaItems
                .filter((m) => m.type === "image" && m.url !== derivedMainImage)
                .map((m) => m.url)
            : v.images;
        return {
          name: v.name.trim(),
          colorCode: v.colorCode,
          mainImage: derivedMainImage,
          images: derivedImages,
          sizes: v.sizeRows.map((r) => r.size),
          sizeInventory,
          colorTags: v.colorTags,
          media: mediaItems,
        };
      });

      const allSizes = [...new Set(colorVariantsData.flatMap((v) => v.sizes))];
      const allColors = colorVariantsData.map((v) => v.name);
      const totalStock = colorVariantsData.reduce(
        (sum, v) =>
          sum + Object.values(v.sizeInventory).reduce((s, q) => s + q, 0),
        0,
      );
      const mergedSizeInventory: Record<string, number> = {};
      colorVariantsData.forEach((v) => {
        Object.entries(v.sizeInventory).forEach(([size, qty]) => {
          mergedSizeInventory[size] = (mergedSizeInventory[size] || 0) + qty;
        });
      });

      const firstVariantMedia = variants[0]?.media || [];
      const videoFromMedia = firstVariantMedia.find((m) => m.type === "video");
      const finalVideoUrl = videoFromMedia?.url || formData.videoUrl || null;

      const payload = {
        ...formData,
        videoUrl: finalVideoUrl,
        categoryId: Number(formData.categoryId),
        mainImage: colorVariantsData[0].mainImage || formData.videoUrl || "",
        images: colorVariantsData[0].images,
        sizes: allSizes,
        colors: allColors,
        sizeInventory: mergedSizeInventory,
        colorVariants: colorVariantsData,
        stockQuantity: totalStock,
        costPrice: formData.costPrice ? formData.costPrice : null,
        discountPrice: formData.discountPrice ? formData.discountPrice : null,
        subcategoryId: formData.subcategoryId
          ? Number(formData.subcategoryId)
          : null,
      };

      if (editingId) {
        await updateProduct.mutateAsync({ id: editingId, ...payload });
        toast({
          title: t.admin.productUpdated,
          description:
            language === "ar"
              ? "انقر للانتقال إلى صفحة المنتج"
              : "Click to view the product page",
          onClick: () => navigate(`/product/${editingId}`),
        });
      } else {
        const newProduct = await createProduct.mutateAsync(payload);
        toast({
          title: t.admin.productCreated,
          description:
            language === "ar"
              ? "انقر للانتقال إلى صفحة المنتج"
              : "Click to view the product page",
          onClick: () => navigate(`/product/${newProduct.id}`),
        });
      }
      setIsDialogOpen(false);
    } catch (err: any) {
      toast({
        title: t.auth.error,
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const [duplicatingId, setDuplicatingId] = useState<number | null>(null);

  const handleDuplicate = async (p: Product) => {
    setDuplicatingId(p.id);
    try {
      const cv = (p as any).colorVariants as ColorVariant[] | undefined;
      const colorVariants = cv && cv.length > 0 ? cv : undefined;
      const inv = (p as any).sizeInventory || {};
      const payload: any = {
        name: language === "ar" ? `نسخة من ${p.name}` : `Copy of ${p.name}`,
        description: p.description,
        price: p.price,
        costPrice: (p as any).costPrice || null,
        discountPrice: p.discountPrice || null,
        categoryId: p.categoryId,
        subcategoryId: (p as any).subcategoryId || null,
        isFeatured: p.isFeatured,
        isNewArrival: p.isNewArrival,
        isBestSeller: (p as any).isBestSeller || false,
        brand: p.brand || "",
        mainImage: p.mainImage,
        images: p.images || [],
        sizes: p.sizes || [],
        colors: p.colors || [],
        sizeInventory: inv,
        stockQuantity: p.stockQuantity,
        colorVariants: colorVariants || null,
      };
      await createProduct.mutateAsync(payload);
      toast({
        title:
          language === "ar" ? "تم تكرار المنتج بنجاح" : "Product duplicated",
        description:
          language === "ar"
            ? `نسخة من "${p.name}" تم إنشاؤها`
            : `A copy of "${p.name}" was created`,
      });
    } catch (err: any) {
      toast({
        title:
          language === "ar"
            ? "فشل تكرار المنتج"
            : "Failed to duplicate product",
        variant: "destructive",
      });
    }
    setDuplicatingId(null);
  };

  const handleDelete = async (id: number) => {
    if (confirm(t.admin.confirmDelete)) {
      try {
        await deleteProduct.mutateAsync(id);
        toast({ title: t.admin.productDeleted });
      } catch (err: any) {
        toast({
          title: t.auth.error,
          description: err.message,
          variant: "destructive",
        });
      }
    }
  };

  const getProductImages = (p: Product): string[] => {
    const imgs: string[] = [];
    if (p.mainImage) imgs.push(p.mainImage);
    const cvs = (p.colorVariants as ColorVariant[] | undefined) || [];
    for (const v of cvs) {
      if (v.mainImage && !imgs.includes(v.mainImage)) imgs.push(v.mainImage);
      for (const img of (v.images as string[] | undefined) || []) {
        if (img && !imgs.includes(img)) imgs.push(img);
      }
    }
    for (const img of (p.images as string[] | undefined) || []) {
      if (img && !imgs.includes(img)) imgs.push(img);
    }
    return imgs.filter(Boolean);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!filteredProducts) return;
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const handleClearAllFlags = async () => {
    setFlagsApplying(true);
    try {
      const res = await fetch("/api/products/bulk-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          updates: {
            isBestSeller: false,
            isNewArrival: false,
            isFeatured: false,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed");
      import("@/lib/queryClient").then(({ queryClient }) => {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({
          queryKey: ["/api/products/best-sellers"],
        });
      });
      toast({
        title:
          language === "ar" ? "تم إلغاء جميع التصنيفات" : "All labels cleared",
      });
    } catch {
      toast({ title: t.auth.error, variant: "destructive" });
    } finally {
      setFlagsApplying(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const msg =
      language === "ar"
        ? `هل تريد حذف ${selectedIds.size} منتج؟`
        : `Delete ${selectedIds.size} product(s)?`;
    if (!confirm(msg)) return;
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => deleteProduct.mutateAsync(id)),
      );
      toast({
        title:
          language === "ar"
            ? `تم حذف ${selectedIds.size} منتج`
            : `${selectedIds.size} product(s) deleted`,
      });
      setSelectedIds(new Set());
    } catch (err: any) {
      toast({
        title: t.auth.error,
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleBulkFlags = async () => {
    const updates: Record<string, boolean> = {};
    if (flagSelections.isBestSeller !== "unchanged")
      updates.isBestSeller = flagSelections.isBestSeller === "on";
    if (flagSelections.isNewArrival !== "unchanged")
      updates.isNewArrival = flagSelections.isNewArrival === "on";
    if (flagSelections.isFeatured !== "unchanged")
      updates.isFeatured = flagSelections.isFeatured === "on";
    if (Object.keys(updates).length === 0) {
      toast({
        title: language === "ar" ? "لم تختر أي تغيير" : "No changes selected",
        variant: "destructive",
      });
      return;
    }
    setFlagsApplying(true);
    try {
      const res = await fetch("/api/products/bulk-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), updates }),
      });
      if (!res.ok) throw new Error("Failed");
      const { updated } = await res.json();
      import("@/lib/queryClient").then(({ queryClient }) => {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({
          queryKey: ["/api/products/best-sellers"],
        });
      });
      toast({
        title:
          language === "ar"
            ? `تم تحديث ${updated} منتج`
            : `${updated} product(s) updated`,
      });
      setIsFlagsDialogOpen(false);
      setFlagSelections({
        isBestSeller: "unchanged",
        isNewArrival: "unchanged",
        isFeatured: "unchanged",
      });
    } catch {
      toast({ title: t.auth.error, variant: "destructive" });
    } finally {
      setFlagsApplying(false);
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 sm:mb-8">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-display font-semibold text-foreground"
            data-testid="text-products-title"
          >
            {t.admin.products}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t.admin.manageProducts}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="flex items-stretch rounded-lg border border-border bg-background overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all w-full sm:w-auto shadow-sm">
            <span className="flex items-center ps-3 text-muted-foreground flex-shrink-0">
              <Search className="w-4 h-4" />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder={
                language === "ar"
                  ? `${t.admin.searchProducts}... أو امسح الباركود`
                  : `${t.admin.searchProducts}... or scan barcode`
              }
              className="bg-transparent px-2.5 py-2 text-sm outline-none w-full sm:w-60 placeholder:text-muted-foreground/60"
              data-testid="input-admin-search-products"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  searchInputRef.current?.focus();
                }}
                className="flex items-center px-2 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                title={language === "ar" ? "مسح البحث" : "Clear search"}
                data-testid="button-clear-search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <div className="w-px bg-border my-1.5 flex-shrink-0" />
            <button
              type="button"
              onClick={() => {
                setSearch("");
                searchInputRef.current?.focus();
              }}
              className="flex items-center gap-1.5 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
              title={
                language === "ar"
                  ? "امسح الباركود للبحث"
                  : "Scan barcode to search"
              }
              data-testid="button-scan-product-search"
            >
              <Hash className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {language === "ar" ? "باركود" : "Scan"}
              </span>
            </button>
          </div>
          <Select
            value={categoryFilter === "" ? "all" : String(categoryFilter)}
            onValueChange={(v) =>
              setCategoryFilter(v === "all" ? "" : Number(v))
            }
          >
            <SelectTrigger
              className="w-full sm:w-52"
              data-testid="select-category-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {language === "ar"
                  ? `كل الفئات (${products?.length ?? 0})`
                  : `All Categories (${products?.length ?? 0})`}
              </SelectItem>
              {categories?.map((cat) => {
                const count =
                  products?.filter((p) => p.categoryId === cat.id).length ?? 0;
                const label =
                  language === "ar" ? cat.nameAr || cat.name : cat.name;
                return (
                  <SelectItem key={cat.id} value={String(cat.id)}>
                    {label} ({count})
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setShowLowStock((v) => !v);
                setSelectedLowStockIds(new Set());
              }}
              className={`flex items-center gap-1.5 h-10 px-3 text-xs font-semibold border transition-all rounded-md shadow-sm ${showLowStock ? "bg-amber-500 text-white border-amber-500 shadow-md" : "bg-background text-amber-600 border-amber-400/70 hover:bg-amber-50 hover:border-amber-500 dark:hover:bg-amber-950/30"}`}
              data-testid="button-low-stock-filter"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              {language === "ar" ? "مخزون منخفض" : "Low Stock"}
              {(products?.filter((p) => p.stockQuantity < LOW_STOCK_THRESHOLD)
                .length ?? 0) > 0 && (
                <span
                  className={`rounded-full text-[10px] font-bold px-1.5 py-0.5 ${showLowStock ? "bg-white text-amber-600" : "bg-amber-500 text-white"}`}
                >
                  {
                    products?.filter(
                      (p) => p.stockQuantity < LOW_STOCK_THRESHOLD,
                    ).length
                  }
                </span>
              )}
            </button>
            <div className="inline-flex items-center rounded-md border border-input bg-background p-0.5 shadow-sm">
              <button
                onClick={() => setViewMode("table")}
                className={`flex items-center justify-center w-8 h-8 rounded transition-all ${viewMode === "table" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                data-testid="button-view-table"
                title={language === "ar" ? "عرض جدول" : "Table view"}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`flex items-center justify-center w-8 h-8 rounded transition-all ${viewMode === "grid" ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                data-testid="button-view-grid"
                title={language === "ar" ? "عرض شبكي" : "Grid view"}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
            <Button
              onClick={() => setShowBarcodePreview(true)}
              variant="outline"
              className="gap-2 shadow-sm"
              data-testid="button-print-barcodes"
            >
              <Printer className="w-4 h-4" />
              {language === "ar" ? "طباعة الباركود" : "Print Barcodes"}
            </Button>
            <Button
              onClick={() => {
                setIsImportOpen(true);
                setImportStep(1);
                setImportImageUrls([]);
                setExcelFile(null);
                setImportResult(null);
              }}
              variant="outline"
              className="gap-2 shadow-sm"
              data-testid="button-bulk-import"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {language === "ar" ? "استيراد Excel" : "Import Excel"}
            </Button>
            <Button
              onClick={openCreate}
              className="bg-foreground text-background hover:bg-foreground/90 shadow-sm hover:shadow-md transition-all gap-1 group"
              data-testid="button-add-product"
            >
              <Plus className="w-4 h-4 me-2 group-hover:rotate-90 transition-transform duration-200" />{" "}
              {t.admin.addProduct}
            </Button>
          </div>
        </div>
      </div>

      {/* ── New Arrivals Expiry Panel ── */}
      {(() => {
        const PRESETS =
          language === "ar"
            ? [
                { label: "أسبوع", days: 7 },
                { label: "أسبوعان", days: 14 },
                { label: "شهر", days: 30 },
                { label: "شهران", days: 60 },
              ]
            : [
                { label: "1 wk", days: 7 },
                { label: "2 wks", days: 14 },
                { label: "1 mo", days: 30 },
                { label: "2 mo", days: 60 },
              ];
        const isPreset = PRESETS.some((p) => p.days === newArrivalDays);
        return (
          <div
            className="mb-6 border border-border bg-card shadow-sm rounded-md overflow-hidden"
            data-testid="panel-new-arrivals-expiry"
          >
            <div className="flex items-center gap-3 px-5 py-3 bg-foreground text-background">
              <Clock className="w-3.5 h-3.5 opacity-70 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-widest">
                {language === "ar"
                  ? "فترة الوصول الجديد"
                  : "New Arrivals Period"}
              </span>
              <span className="ms-auto text-xs opacity-60 font-mono tabular-nums">
                {language === "ar"
                  ? `${newArrivalDays} يوم`
                  : `${newArrivalDays} days`}
              </span>
            </div>
            <div className="px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((preset) => {
                  const active = newArrivalDays === preset.days;
                  return (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => setNewArrivalDays(preset.days)}
                      data-testid={`chip-days-${preset.days}`}
                      className={`px-3.5 py-1.5 text-xs font-medium border transition-all duration-150 rounded ${
                        active
                          ? "bg-foreground text-background border-foreground shadow-sm"
                          : "bg-background text-foreground border-border hover:border-foreground/40"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
                <div
                  className={`inline-flex items-center gap-1 border px-2.5 py-1 transition-all duration-150 rounded ${
                    !isPreset
                      ? "bg-foreground border-foreground shadow-sm"
                      : "bg-background border-border hover:border-foreground/40"
                  }`}
                >
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={newArrivalDays}
                    onChange={(e) =>
                      setNewArrivalDays(
                        Math.max(
                          1,
                          Math.min(365, parseInt(e.target.value) || 1),
                        ),
                      )
                    }
                    className={`w-9 text-xs text-center bg-transparent outline-none tabular-nums ${!isPreset ? "text-background" : "text-foreground"}`}
                    data-testid="input-new-arrival-days"
                  />
                  <span
                    className={`text-[10px] ${!isPreset ? "text-background/60" : "text-muted-foreground"}`}
                  >
                    {language === "ar" ? "يوم" : "d"}
                  </span>
                </div>
              </div>
              <div className="hidden sm:block w-px h-6 bg-border" />
              <Button
                type="button"
                onClick={handleExpireNewArrivals}
                disabled={expireLoading}
                className="rounded bg-foreground text-background hover:bg-foreground/85 gap-1.5 shrink-0 shadow-sm h-8 px-4 text-xs"
                data-testid="button-apply-new-arrivals-expiry"
              >
                {expireLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                {expireLoading
                  ? language === "ar"
                    ? "جارٍ..."
                    : "Applying..."
                  : language === "ar"
                    ? "تطبيق"
                    : "Apply"}
              </Button>
              <p className="w-full text-xs text-muted-foreground leading-relaxed">
                {language === "ar"
                  ? `المنتجات المضافة منذ أكثر من ${newArrivalDays} يوم ستُزال تلقائياً من قسم الوصول الجديد`
                  : `Products older than ${newArrivalDays} days are automatically hidden from New Arrivals`}
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Product count summary ── */}
      {!showLowStock && (
        <div
          className="flex items-center gap-2 mb-3 text-sm text-muted-foreground"
          data-testid="text-product-count"
        >
          <span className="font-semibold text-foreground">
            {filteredProducts?.length ?? 0}
          </span>
          {language === "ar" ? " منتج" : " products"}
          {(categoryFilter !== "" || search) && (
            <span className="text-xs opacity-70">
              {language === "ar"
                ? ` من أصل ${products?.length ?? 0}`
                : ` of ${products?.length ?? 0} total`}
            </span>
          )}
        </div>
      )}

      {/* ── Low Stock Panel ── */}
      {showLowStock && (
        <div
          className="mb-6 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 rounded-md overflow-hidden"
          data-testid="panel-low-stock"
        >
          <div className="flex items-center gap-3 px-5 py-3 bg-amber-500 text-white">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-widest">
              {language === "ar"
                ? "منتجات المخزون المنخفض"
                : "Low Stock Products"}
            </span>
            <span className="ms-auto text-xs opacity-80 font-mono tabular-nums">
              {language === "ar"
                ? `أقل من ${LOW_STOCK_THRESHOLD} قطع`
                : `Fewer than ${LOW_STOCK_THRESHOLD} units`}
            </span>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {language === "ar"
                ? `يوجد ${lowStockProducts.length} منتج بمخزون منخفض. يمكنك تطبيق خصم على هذه المنتجات لتسريع بيعها.`
                : `${lowStockProducts.length} product(s) with low stock. Apply a discount to sell them faster.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setShowDiscountDialog(true);
                  setSelectedLowStockIds(new Set());
                }}
                className="bg-amber-500 hover:bg-amber-600 text-white border-0 gap-1.5 h-8 px-4 text-xs rounded shadow-sm"
                data-testid="button-apply-low-stock-discount"
              >
                <Tag className="w-3.5 h-3.5" />
                {language === "ar"
                  ? "تطبيق خصم على الكل"
                  : "Apply Discount to All"}
              </Button>
              {lowStockProducts.some((p) => p.discountPrice) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleRemoveDiscount(lowStockProducts.map((p) => p.id))
                  }
                  className="text-xs h-8 px-4 rounded border-amber-400 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/20 gap-1.5"
                  data-testid="button-remove-low-stock-discount"
                >
                  <X className="w-3.5 h-3.5" />
                  {language === "ar" ? "إزالة الخصم" : "Remove Discount"}
                </Button>
              )}
            </div>
            {lowStockProducts.length > 0 && (
              <div className="border border-amber-200 dark:border-amber-800 rounded bg-white dark:bg-background overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/20">
                      <th className="px-3 py-2 text-start font-semibold text-amber-800 dark:text-amber-300 w-6">
                        <input
                          type="checkbox"
                          className="accent-amber-500"
                          checked={
                            selectedLowStockIds.size ===
                              lowStockProducts.length &&
                            lowStockProducts.length > 0
                          }
                          onChange={(e) =>
                            setSelectedLowStockIds(
                              e.target.checked
                                ? new Set(lowStockProducts.map((p) => p.id))
                                : new Set(),
                            )
                          }
                        />
                      </th>
                      <th className="px-3 py-2 text-start font-semibold text-amber-800 dark:text-amber-300">
                        {language === "ar" ? "المنتج" : "Product"}
                      </th>
                      <th className="px-3 py-2 text-start font-semibold text-amber-800 dark:text-amber-300">
                        {language === "ar" ? "المخزون" : "Stock"}
                      </th>
                      <th className="px-3 py-2 text-start font-semibold text-amber-800 dark:text-amber-300">
                        {language === "ar" ? "السعر" : "Price"}
                      </th>
                      <th className="px-3 py-2 text-start font-semibold text-amber-800 dark:text-amber-300">
                        {language === "ar" ? "الخصم" : "Discount"}
                      </th>
                      <th className="px-3 py-2 text-start font-semibold text-amber-800 dark:text-amber-300"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockProducts.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-amber-100 dark:border-amber-900/30 hover:bg-amber-50 dark:hover:bg-amber-900/10"
                        data-testid={`row-low-stock-${p.id}`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            className="accent-amber-500"
                            checked={selectedLowStockIds.has(p.id)}
                            onChange={(e) =>
                              setSelectedLowStockIds((prev) => {
                                const next = new Set(prev);
                                e.target.checked
                                  ? next.add(p.id)
                                  : next.delete(p.id);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground">
                          {p.name}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`font-bold ${p.stockQuantity === 0 ? "text-red-600" : "text-amber-600"}`}
                          >
                            {p.stockQuantity}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {p.price}
                        </td>
                        <td className="px-3 py-2">
                          {(p as any).discountPrice ? (
                            <span className="text-green-600 font-semibold">
                              {(p as any).discountPrice}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => {
                              setSelectedLowStockIds(new Set([p.id]));
                              setShowDiscountDialog(true);
                            }}
                            className="text-amber-600 hover:text-amber-800 transition-colors"
                            title={
                              language === "ar" ? "تطبيق خصم" : "Apply discount"
                            }
                            data-testid={`button-discount-product-${p.id}`}
                          >
                            <Tag className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {selectedLowStockIds.size > 0 && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                  {language === "ar"
                    ? `${selectedLowStockIds.size} محدد`
                    : `${selectedLowStockIds.size} selected`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setShowDiscountDialog(true)}
                  className="bg-amber-500 hover:bg-amber-600 text-white border-0 gap-1.5 h-7 px-3 text-xs rounded shadow-sm"
                  data-testid="button-discount-selected"
                >
                  <Tag className="w-3 h-3" />
                  {language === "ar" ? "خصم على المحدد" : "Discount Selected"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Discount Dialog ── */}
      <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
        <DialogContent className="max-w-sm" data-testid="dialog-discount">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Tag className="w-4 h-4 text-amber-500" />
              {language === "ar" ? "تطبيق خصم" : "Apply Discount"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              {language === "ar"
                ? `سيتم تطبيق الخصم على ${selectedLowStockIds.size > 0 ? selectedLowStockIds.size : lowStockProducts.length} منتج`
                : `Will apply to ${selectedLowStockIds.size > 0 ? selectedLowStockIds.size : lowStockProducts.length} product(s)`}
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {language === "ar"
                  ? "نسبة الخصم (%)"
                  : "Discount Percentage (%)"}
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={99}
                  placeholder={language === "ar" ? "مثال: 20" : "e.g. 20"}
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  className="h-10 rounded-md"
                  data-testid="input-discount-percent"
                />
                <span className="text-sm font-semibold text-muted-foreground">
                  %
                </span>
              </div>
              {discountPercent &&
                !isNaN(parseFloat(discountPercent)) &&
                parseFloat(discountPercent) > 0 &&
                parseFloat(discountPercent) < 100 && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {language === "ar"
                      ? `خصم ${discountPercent}% على السعر الأصلي`
                      : `${discountPercent}% off the original price`}
                  </p>
                )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={handleApplyDiscount}
                disabled={discountApplying || !discountPercent}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-md gap-2"
                data-testid="button-confirm-discount"
              >
                {discountApplying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {language === "ar" ? "تطبيق" : "Apply"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDiscountDialog(false);
                  setDiscountPercent("");
                }}
                className="rounded-md"
                data-testid="button-cancel-discount"
              >
                {language === "ar" ? "إلغاء" : "Cancel"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedIds.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-primary/5 border border-primary/20 rounded-md"
          data-testid="bulk-actions-bar"
        >
          <span
            className="text-sm font-medium"
            data-testid="text-selected-count"
          >
            {language === "ar"
              ? `${selectedIds.size} منتج محدد`
              : `${selectedIds.size} selected`}
          </span>
          <div className="w-px h-5 bg-border hidden sm:block" />
          <Button
            size="sm"
            onClick={() => {
              setFlagSelections({
                isBestSeller: "unchanged",
                isNewArrival: "unchanged",
                isFeatured: "unchanged",
              });
              setIsFlagsDialogOpen(true);
            }}
            className="rounded bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
            data-testid="button-bulk-flags"
          >
            <Tag className="w-4 h-4" />
            {language === "ar" ? "تعديل التصنيف" : "Edit Labels"}
          </Button>
          <Button
            size="sm"
            disabled={flagsApplying}
            onClick={handleClearAllFlags}
            variant="outline"
            className="rounded gap-1.5 border-rose-300 text-rose-600 hover:bg-rose-50 hover:border-rose-400"
            data-testid="button-clear-all-flags"
          >
            <X className="w-4 h-4" />
            {language === "ar" ? "إلغاء جميع التصنيفات" : "Clear All Labels"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            className="rounded"
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-4 h-4 me-1" />
            {language === "ar" ? "حذف المحدد" : "Delete Selected"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            className="rounded text-xs"
            data-testid="button-clear-selection"
          >
            {language === "ar" ? "إلغاء التحديد" : "Clear"}
          </Button>
        </div>
      )}

      <Dialog open={isFlagsDialogOpen} onOpenChange={setIsFlagsDialogOpen}>
        <DialogContent
          className="max-w-sm rounded-md"
          data-testid="dialog-bulk-flags"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {language === "ar"
                ? `تعديل تصنيف ${selectedIds.size} منتج`
                : `Edit Labels for ${selectedIds.size} Product(s)`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mt-1">
            {language === "ar"
              ? "اضغط على كل بطاقة لتغيير الحالة: بلا تغيير ← تفعيل ← إلغاء"
              : "Tap each card to cycle: No change → Enable → Disable"}
          </p>
          <div className="grid grid-cols-3 gap-3 mt-3">
            {[
              {
                key: "isBestSeller" as const,
                label: "أكثر مبيعاً",
                labelEn: "Best Seller",
                Icon: Flame,
                activeColor: "bg-amber-500",
                activeRing: "ring-amber-400",
              },
              {
                key: "isNewArrival" as const,
                label: "وصل حديثاً",
                labelEn: "New Arrival",
                Icon: Sparkles,
                activeColor: "bg-blue-500",
                activeRing: "ring-blue-400",
              },
              {
                key: "isFeatured" as const,
                label: "منتج مميز",
                labelEn: "Featured",
                Icon: Star,
                activeColor: "bg-purple-500",
                activeRing: "ring-purple-400",
              },
            ].map(({ key, label, labelEn, Icon, activeColor, activeRing }) => {
              const state = flagSelections[key];
              const cycle = () =>
                setFlagSelections((prev) => ({
                  ...prev,
                  [key]:
                    prev[key] === "unchanged"
                      ? "on"
                      : prev[key] === "on"
                        ? "off"
                        : "unchanged",
                }));
              return (
                <button
                  key={key}
                  type="button"
                  onClick={cycle}
                  data-testid={`button-flag-card-${key}`}
                  className={`relative flex flex-col items-center gap-2 p-4 border-2 transition-all duration-150 select-none focus:outline-none rounded-md ${
                    state === "on"
                      ? `${activeColor} border-transparent text-white ring-2 ${activeRing} ring-offset-1 shadow-md`
                      : state === "off"
                        ? "bg-red-500 border-transparent text-white ring-2 ring-red-400 ring-offset-1 shadow-md"
                        : "bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:border-foreground/30"
                  }`}
                >
                  {state === "off" ? (
                    <X className="w-6 h-6" />
                  ) : (
                    <Icon
                      className={`w-6 h-6 ${state === "on" ? "text-white" : ""}`}
                    />
                  )}
                  <span className="text-xs font-semibold text-center leading-tight">
                    {language === "ar" ? label : labelEn}
                  </span>
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      state === "on"
                        ? "bg-white/25 text-white"
                        : state === "off"
                          ? "bg-white/25 text-white"
                          : "bg-background text-muted-foreground"
                    }`}
                  >
                    {state === "on"
                      ? language === "ar"
                        ? "✓ تفعيل"
                        : "✓ ON"
                      : state === "off"
                        ? language === "ar"
                          ? "✗ إلغاء"
                          : "✗ OFF"
                        : language === "ar"
                          ? "— بلا تغيير"
                          : "— unchanged"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 mt-5 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="rounded"
              onClick={() => setIsFlagsDialogOpen(false)}
              data-testid="button-cancel-flags"
            >
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              className="rounded min-w-20"
              onClick={handleBulkFlags}
              disabled={flagsApplying}
              data-testid="button-apply-flags"
            >
              {flagsApplying
                ? language === "ar"
                  ? "جاري..."
                  : "Saving..."
                : language === "ar"
                  ? "تطبيق"
                  : "Apply"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Table View */}
      {viewMode === "table" && (
        <div className="bg-card border border-border rounded-md overflow-hidden">
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                <TableHead className="w-10">
                  <SelectBox
                    checked={
                      !!filteredProducts?.length &&
                      selectedIds.size === filteredProducts.length
                    }
                    indeterminate={
                      selectedIds.size > 0 &&
                      !!filteredProducts &&
                      selectedIds.size < filteredProducts.length
                    }
                    onChange={toggleSelectAll}
                    testId="checkbox-select-all"
                  />
                </TableHead>
                <TableHead>{t.admin.image}</TableHead>
                <TableHead className="text-muted-foreground font-mono">
                  #
                </TableHead>
                <TableHead>{t.admin.name}</TableHead>
                <TableHead>
                  {language === "ar" ? "الفئة" : "Category"}
                </TableHead>
                <TableHead>{t.admin.price}</TableHead>
                <TableHead>{t.admin.colors}</TableHead>
                <TableHead>{t.admin.stock}</TableHead>
                <TableHead>{t.admin.featuredNew}</TableHead>
                <TableHead className="text-end whitespace-nowrap w-[140px]">
                  {t.admin.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8">
                    <div className="flex justify-center">
                      <div className="w-7 h-7 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts?.map((p) => {
                  const cv = (p as any).colorVariants as
                    | ColorVariant[]
                    | undefined;
                  return (
                    <TableRow
                      key={p.id}
                      onClick={() => toggleSelect(p.id)}
                      className={`cursor-pointer transition-colors ${selectedIds.has(p.id) ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40"}`}
                      data-testid={`row-product-${p.id}`}
                    >
                      <TableCell>
                        <SelectBox
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          testId={`checkbox-select-product-${p.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => {
                            const imgs = getProductImages(p);
                            if (imgs.length)
                              setPhotoPreview({
                                images: imgs,
                                name: p.name,
                                idx: 0,
                              });
                          }}
                          className="block focus:outline-none group relative"
                          data-testid={`button-photo-preview-${p.id}`}
                          title={
                            language === "ar" ? "عرض الصور" : "View photos"
                          }
                        >
                          <img
                            src={p.mainImage}
                            alt={p.name}
                            className="w-12 h-16 object-cover bg-secondary rounded group-hover:opacity-75 transition-opacity"
                          />
                          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Plus
                              className="w-5 h-5 text-white drop-shadow"
                              strokeWidth={2.5}
                            />
                          </span>
                        </button>
                      </TableCell>
                      <TableCell
                        className="font-mono text-xs text-muted-foreground whitespace-nowrap"
                        data-testid={`text-product-num-${p.id}`}
                      >
                        #{String(p.id).padStart(4, "0")}
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        {(() => {
                          const cat = categories?.find(
                            (c) => c.id === p.categoryId,
                          );
                          return cat ? (
                            <span className="text-xs bg-secondary px-2 py-1 whitespace-nowrap rounded">
                              {language === "ar"
                                ? cat.nameAr || cat.name
                                : cat.name}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        ₪{parseFloat(p.price.toString()).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {cv && cv.length > 0 ? (
                          <div className="flex gap-1">
                            {cv.map((v, i) => (
                              <span
                                key={i}
                                className="w-5 h-5 rounded-full border border-border inline-block"
                                style={{ backgroundColor: v.colorCode }}
                                title={v.name}
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {cv && cv.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {cv.map((v, i) => {
                              const variantTotal = Object.values(
                                v.sizeInventory,
                              ).reduce((s, q) => s + q, 0);
                              return (
                                <span
                                  key={i}
                                  className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${variantTotal > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                                >
                                  {v.name}:{variantTotal}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span
                            className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${p.stockQuantity > 5 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                          >
                            {p.stockQuantity}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {p.isFeatured && (
                            <span className="text-xs bg-purple-100 text-purple-800 px-2 rounded-full">
                              F
                            </span>
                          )}
                          {p.isNewArrival && (
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 rounded-full">
                              N
                            </span>
                          )}
                          {(p as any).isBestSeller && (
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 rounded-full">
                              B
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell
                        className="text-end whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => navigate(`/product/${p.id}`)}
                          data-testid={`button-view-product-${p.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(p)}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          data-testid={`button-edit-product-${p.id}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDuplicate(p)}
                          disabled={duplicatingId === p.id}
                          className="text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                          title={
                            language === "ar"
                              ? "تكرار المنتج"
                              : "Duplicate product"
                          }
                          data-testid={`button-duplicate-product-${p.id}`}
                        >
                          {duplicatingId === p.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(p.id)}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50"
                          data-testid={`button-delete-product-${p.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Grid View */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {isLoading ? (
            <div className="col-span-full py-8 flex justify-center">
              <div className="w-7 h-7 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
            </div>
          ) : (
            filteredProducts?.map((p) => {
              const cv = (p as any).colorVariants as ColorVariant[] | undefined;
              return (
                <div
                  key={p.id}
                  onClick={() => toggleSelect(p.id)}
                  className={`bg-card border-2 rounded-md p-3 space-y-3 cursor-pointer transition-all duration-150 ${selectedIds.has(p.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  data-testid={`grid-product-${p.id}`}
                >
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center gap-2 flex-shrink-0">
                      <SelectBox
                        checked={selectedIds.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        testId={`checkbox-select-product-mobile-${p.id}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const imgs = getProductImages(p);
                        if (imgs.length)
                          setPhotoPreview({
                            images: imgs,
                            name: p.name,
                            idx: 0,
                          });
                      }}
                      className="block focus:outline-none group relative flex-shrink-0"
                      data-testid={`button-photo-preview-mobile-${p.id}`}
                    >
                      <img
                        src={p.mainImage}
                        alt={p.name}
                        className="w-16 h-20 object-cover bg-secondary rounded group-hover:opacity-75 transition-opacity"
                      />
                      <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus
                          className="w-5 h-5 text-white drop-shadow"
                          strokeWidth={2.5}
                        />
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        #{String(p.id).padStart(4, "0")}
                      </span>
                      <p className="font-semibold text-sm truncate">{p.name}</p>
                      {(() => {
                        const cat = categories?.find(
                          (c) => c.id === p.categoryId,
                        );
                        return cat ? (
                          <span className="text-[10px] bg-secondary px-1.5 py-0.5 inline-block mt-0.5 rounded">
                            {language === "ar"
                              ? cat.nameAr || cat.name
                              : cat.name}
                          </span>
                        ) : null;
                      })()}
                      <p className="text-sm font-bold mt-1">
                        {p.discountPrice ? (
                          <>
                            <span className="text-destructive">
                              ₪
                              {parseFloat(p.discountPrice.toString()).toFixed(
                                2,
                              )}
                            </span>
                            <span className="text-muted-foreground line-through text-xs ms-2">
                              ₪{parseFloat(p.price.toString()).toFixed(2)}
                            </span>
                          </>
                        ) : (
                          <>₪{parseFloat(p.price.toString()).toFixed(2)}</>
                        )}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.isFeatured && (
                          <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded-full">
                            F
                          </span>
                        )}
                        {p.isNewArrival && (
                          <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">
                            N
                          </span>
                        )}
                        {(p as any).isBestSeller && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                            B
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {cv && cv.length > 0 ? (
                        cv.map((v, i) => {
                          const variantTotal = Object.values(
                            v.sizeInventory,
                          ).reduce((s, q) => s + q, 0);
                          return (
                            <span
                              key={i}
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${variantTotal > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                            >
                              {v.name}:{variantTotal}
                            </span>
                          );
                        })
                      ) : (
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.stockQuantity > 5 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                        >
                          {t.admin.stock}: {p.stockQuantity}
                        </span>
                      )}
                    </div>
                    <div
                      className="flex gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground h-8 w-8"
                        onClick={() => navigate(`/product/${p.id}`)}
                        data-testid={`button-view-product-mobile-${p.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(p)}
                        className="text-blue-600 h-8 w-8"
                        data-testid={`button-edit-product-mobile-${p.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDuplicate(p)}
                        disabled={duplicatingId === p.id}
                        className="text-amber-600 h-8 w-8"
                        title={
                          language === "ar"
                            ? "تكرار المنتج"
                            : "Duplicate product"
                        }
                        data-testid={`button-duplicate-product-mobile-${p.id}`}
                      >
                        {duplicatingId === p.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(p.id)}
                        className="text-red-600 h-8 w-8"
                        data-testid={`button-delete-product-mobile-${p.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto rounded-md w-[95vw] sm:w-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editingId ? t.admin.editProduct : t.admin.addNewProduct}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-2">
            {/* ─── 1. Basic Info ─── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border">
                <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold">
                  1
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  {language === "ar" ? "المعلومات الأساسية" : "Basic Info"}
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.admin.productName} *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowNameTemplates((v) => !v)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-name-templates"
                    >
                      <FileText className="w-3 h-3" />
                      {language === "ar" ? "قوالب جاهزة" : "Templates"}
                      <ChevronDown
                        className={`w-3 h-3 transition-transform ${showNameTemplates ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  {showNameTemplates && (
                    <div
                      className="flex flex-wrap gap-1.5 p-3 bg-muted/40 border border-border rounded-md"
                      data-testid="panel-name-templates"
                    >
                      {(
                        NAME_TEMPLATES[
                          getCategoryType(
                            formData.categoryId,
                            categories as any[],
                          )
                        ] || NAME_TEMPLATES.default
                      ).map((tmpl, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={() => {
                            setFormData((f: any) => ({ ...f, name: tmpl }));
                            setShowNameTemplates(false);
                          }}
                          className="text-xs px-2.5 py-1 border border-border rounded-full hover:bg-foreground hover:text-background hover:border-foreground transition-all"
                          data-testid={`template-name-${i}`}
                        >
                          {tmpl}
                        </button>
                      ))}
                    </div>
                  )}
                  <div ref={nameInputRef} className="relative">
                    <Input
                      required
                      value={formData.name}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value });
                        setShowNameSuggestions(true);
                      }}
                      onFocus={() => setShowNameSuggestions(true)}
                      onBlur={() =>
                        setTimeout(() => setShowNameSuggestions(false), 150)
                      }
                      className="rounded-md"
                      data-testid="input-product-name"
                      autoComplete="off"
                    />
                    {showNameSuggestions &&
                      formData.name.trim().length >= 1 &&
                      (() => {
                        const q = formData.name.trim().toLowerCase();
                        const sameCat = (products ?? []).filter(
                          (p) =>
                            p.id !== editingId &&
                            p.categoryId === formData.categoryId &&
                            p.name.toLowerCase().includes(q) &&
                            p.name !== formData.name,
                        );
                        const otherCat = (products ?? []).filter(
                          (p) =>
                            p.id !== editingId &&
                            p.categoryId !== formData.categoryId &&
                            p.name.toLowerCase().includes(q) &&
                            p.name !== formData.name,
                        );
                        const suggestions = [
                          ...new Map(
                            [...sameCat, ...otherCat].map((p) => [p.name, p]),
                          ).values(),
                        ].slice(0, 6);
                        if (suggestions.length === 0) return null;
                        return (
                          <div className="absolute z-50 top-full left-0 right-0 bg-background border border-border shadow-xl mt-px overflow-hidden rounded-md">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/60">
                              <Sparkles className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                                {language === "ar" ? "اقتراحات" : "Suggestions"}
                              </span>
                            </div>
                            <ul className="max-h-44 overflow-y-auto">
                              {suggestions.map((p, idx) => (
                                <li
                                  key={p.id}
                                  onMouseDown={() => {
                                    setFormData((f: any) => ({
                                      ...f,
                                      name: p.name,
                                    }));
                                    setShowNameSuggestions(false);
                                  }}
                                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted transition-colors ${idx < suggestions.length - 1 ? "border-b border-border/40" : ""}`}
                                  data-testid={`suggestion-name-${p.id}`}
                                >
                                  {p.mainImage ? (
                                    <img
                                      src={p.mainImage}
                                      alt=""
                                      className="w-8 h-8 object-cover shrink-0 bg-muted rounded"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 shrink-0 bg-muted flex items-center justify-center rounded">
                                      <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                                    </div>
                                  )}
                                  <span className="text-sm flex-1 truncate">
                                    {p.name}
                                  </span>
                                  {p.categoryId === formData.categoryId && (
                                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-foreground/8 border border-border text-muted-foreground shrink-0 rounded">
                                      {language === "ar"
                                        ? "نفس الفئة"
                                        : "Same cat."}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                  </div>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t.admin.description} *
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowDescTemplates((v) => !v)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      data-testid="button-desc-templates"
                    >
                      <FileText className="w-3 h-3" />
                      {language === "ar" ? "قوالب جاهزة" : "Templates"}
                      <ChevronDown
                        className={`w-3 h-3 transition-transform ${showDescTemplates ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  {showDescTemplates && (
                    <div
                      className="flex flex-col gap-1.5 p-3 bg-muted/40 border border-border rounded-md"
                      data-testid="panel-desc-templates"
                    >
                      {(language === "ar"
                        ? DESC_TEMPLATES.ar
                        : DESC_TEMPLATES.en
                      ).map((tmpl, i) => (
                        <button
                          key={i}
                          type="button"
                          onMouseDown={() => {
                            setFormData((f: any) => ({
                              ...f,
                              description: tmpl,
                            }));
                            setShowDescTemplates(false);
                          }}
                          className="text-xs text-start px-3 py-2 border border-border rounded-md hover:bg-foreground hover:text-background hover:border-foreground transition-all truncate"
                          data-testid={`template-desc-${i}`}
                          title={tmpl}
                        >
                          {tmpl}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <Textarea
                      required
                      value={formData.description}
                      onChange={(e) => {
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        });
                        setShowDescSuggestions(true);
                      }}
                      onFocus={() => setShowDescSuggestions(true)}
                      onBlur={() =>
                        setTimeout(() => setShowDescSuggestions(false), 150)
                      }
                      className="rounded-md resize-none"
                      rows={3}
                      data-testid="textarea-description"
                      autoComplete="off"
                    />
                    {showDescSuggestions &&
                      (() => {
                        const q = formData.description.trim().toLowerCase();
                        const sameCat = (products ?? []).filter(
                          (p) =>
                            p.id !== editingId &&
                            p.categoryId === formData.categoryId &&
                            p.description &&
                            p.description !== formData.description &&
                            (q.length === 0 ||
                              p.description.toLowerCase().includes(q)),
                        );
                        const suggestions = [
                          ...new Map(
                            sameCat.map((p) => [p.description, p]),
                          ).values(),
                        ].slice(0, 5);
                        if (suggestions.length === 0) return null;
                        return (
                          <div className="absolute z-50 top-full left-0 right-0 bg-background border border-border shadow-xl mt-px overflow-hidden rounded-md">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border bg-muted/60">
                              <Sparkles className="w-3 h-3 text-muted-foreground" />
                              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                                {language === "ar"
                                  ? "اقتراحات من نفس الفئة"
                                  : "Suggestions from same category"}
                              </span>
                            </div>
                            <ul className="max-h-52 overflow-y-auto">
                              {suggestions.map((p, idx) => (
                                <li
                                  key={p.id}
                                  onMouseDown={() => {
                                    setFormData((f: any) => ({
                                      ...f,
                                      description: p.description,
                                    }));
                                    setShowDescSuggestions(false);
                                  }}
                                  className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted transition-colors ${idx < suggestions.length - 1 ? "border-b border-border/40" : ""}`}
                                  data-testid={`suggestion-desc-${p.id}`}
                                >
                                  {p.mainImage ? (
                                    <img
                                      src={p.mainImage}
                                      alt=""
                                      className="w-8 h-8 object-cover shrink-0 mt-0.5 bg-muted rounded"
                                    />
                                  ) : (
                                    <div className="w-8 h-8 shrink-0 mt-0.5 bg-muted flex items-center justify-center rounded">
                                      <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-foreground truncate mb-0.5">
                                      {p.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                                      {p.description}
                                    </p>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── 2. Pricing ─── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border">
                <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold">
                  2
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  {language === "ar" ? "التسعير" : "Pricing"}
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {language === "ar" ? "سعر التكلفة (₪)" : "Cost (₪)"}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.costPrice}
                    onChange={(e) =>
                      setFormData({ ...formData, costPrice: e.target.value })
                    }
                    className="rounded-md"
                    placeholder={language === "ar" ? "اختياري" : "Optional"}
                    data-testid="input-cost-price"
                  />
                  {formData.costPrice && parseFloat(formData.costPrice) > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          price: (
                            (parseFloat(formData.costPrice) + 1) *
                            3.5 *
                            2
                          ).toFixed(2),
                        })
                      }
                      className="text-xs text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                      data-testid="button-apply-suggested-price"
                    >
                      {language === "ar" ? "المقترح:" : "Suggested:"}{" "}
                      <span className="font-semibold text-primary">
                        ₪
                        {(
                          (parseFloat(formData.costPrice) + 2) *
                          3.5 *
                          2
                        ).toFixed(2)}
                      </span>
                      {" — "}
                      <span className="underline">
                        {language === "ar" ? "تطبيق" : "Apply"}
                      </span>
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.admin.priceILS} *
                  </label>
                  <Input
                    required
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    className="rounded-md"
                    data-testid="input-price"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.admin.discountPriceILS}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.discountPrice}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discountPrice: e.target.value,
                      })
                    }
                    className={`rounded-md ${formData.discountPrice && formData.price && parseFloat(formData.discountPrice) >= parseFloat(formData.price) ? "border-destructive focus-visible:ring-destructive" : ""}`}
                    data-testid="input-discount-price"
                  />
                  {formData.discountPrice &&
                    formData.price &&
                    parseFloat(formData.discountPrice) >=
                      parseFloat(formData.price) && (
                      <p
                        className="text-xs text-destructive"
                        data-testid="text-discount-error"
                      >
                        {language === "ar"
                          ? "يجب أن يكون أقل من السعر الأصلي"
                          : "Must be less than the original price"}
                      </p>
                    )}
                </div>
              </div>
            </div>

            {/* ─── 3. Category ─── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border">
                <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold">
                  3
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  {language === "ar" ? "التصنيف" : "Category"}
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.admin.category} *
                  </label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.categoryId}
                    onChange={(e) => {
                      const newCatId = e.target.value;
                      setFormData({
                        ...formData,
                        categoryId: newCatId,
                        subcategoryId: "",
                      });
                      if (!editingId) {
                        const defaults = getDefaultSizes(newCatId);
                        setVariants((prev) =>
                          prev.map((v) => ({ ...v, sizeRows: defaults })),
                        );
                      }
                    }}
                    data-testid="select-category"
                  >
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameAr ? `${c.nameAr} — ${c.name}` : c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {language === "ar" ? "التصنيف الفرعي" : "Subcategory"}
                  </label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={formData.subcategoryId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        subcategoryId: e.target.value,
                      })
                    }
                    data-testid="select-subcategory"
                  >
                    <option value="">
                      {language === "ar" ? "— بدون —" : "— None —"}
                    </option>
                    {(subcategoriesData || [])
                      .filter(
                        (s) => s.categoryId === Number(formData.categoryId),
                      )
                      .map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.nameAr ? `${s.nameAr} — ${s.name}` : s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.admin.brand}{" "}
                    <span className="normal-case font-normal text-muted-foreground/60">
                      ({language === "ar" ? "اختياري" : "optional"})
                    </span>
                  </label>
                  <Input
                    value={formData.brand}
                    onChange={(e) =>
                      setFormData({ ...formData, brand: e.target.value })
                    }
                    className="rounded-md"
                    placeholder={language === "ar" ? "اختياري" : "Optional"}
                    data-testid="input-brand"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {language === "ar" ? "الباركود" : "Barcode"}
                  </label>
                  <div className="flex gap-1.5">
                    <Input
                      ref={barcodeInputRef}
                      value={formData.barcode}
                      onChange={(e) =>
                        setFormData({ ...formData, barcode: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                      className="rounded-md font-mono flex-1"
                      placeholder={
                        language === "ar"
                          ? "اختياري — امسح هنا"
                          : "Optional — scan here"
                      }
                      data-testid="input-barcode"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, barcode: "" });
                        barcodeInputRef.current?.focus();
                      }}
                      className="px-2.5 border border-input bg-background hover:bg-muted text-muted-foreground transition-colors rounded-md"
                      title={
                        language === "ar"
                          ? "امسح باركود المنتج"
                          : "Scan product barcode"
                      }
                      data-testid="button-scan-barcode"
                    >
                      <Hash className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, barcode: generateBarcode() })
                      }
                      className="px-2.5 border border-input bg-background hover:bg-muted text-muted-foreground transition-colors rounded-md"
                      title={
                        language === "ar"
                          ? "توليد باركود جديد"
                          : "Generate new barcode"
                      }
                      data-testid="button-generate-barcode"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── 4. Colors & Inventory ─── */}
            <div className="space-y-3">
              <div className="flex justify-between items-center pb-1 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold">
                    4
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">
                    {language === "ar"
                      ? "الألوان والمخزون"
                      : "Colors & Inventory"}
                  </h3>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addVariant}
                  className="rounded-md border-dashed border-2 hover:border-solid hover:bg-primary/5 hover:border-primary transition-all duration-200 group"
                  data-testid="button-add-variant"
                >
                  <Plus className="w-4 h-4 me-1 group-hover:rotate-90 transition-transform duration-200" />{" "}
                  {t.admin.addColorVariant}
                </Button>
              </div>

              <div className="mb-4" data-testid="color-palette-picker">
                <p className="text-xs text-muted-foreground mb-2">
                  {language === "ar"
                    ? "أو اختر لون سريعاً:"
                    : "Or quick pick a color:"}
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {COLOR_FAMILIES.map((family) => {
                    const isLight = (() => {
                      const r = parseInt(family.hex.slice(1, 3), 16);
                      const g = parseInt(family.hex.slice(3, 5), 16);
                      const b = parseInt(family.hex.slice(5, 7), 16);
                      return (r * 299 + g * 587 + b * 114) / 1000 > 200;
                    })();
                    const isExpanded = paletteFamily === family.key;
                    return (
                      <button
                        key={family.key}
                        type="button"
                        onClick={() => {
                          if (family.members.length === 1) {
                            addVariantFromPalette(family.members[0]);
                          } else {
                            setPaletteFamily(isExpanded ? null : family.key);
                          }
                        }}
                        className={`flex flex-col items-center gap-1 p-1.5 rounded-md transition-all ${isExpanded ? "bg-secondary ring-2 ring-primary" : "hover:bg-secondary/50"}`}
                        title={`${family.nameAr} — ${family.nameEn}`}
                        data-testid={`button-family-${family.key}`}
                      >
                        <span
                          className={`w-8 h-8 rounded-full flex-shrink-0 border-2 ${isLight ? "border-gray-300" : "border-transparent"} ${isExpanded ? "ring-2 ring-offset-1 ring-primary" : ""}`}
                          style={{ backgroundColor: family.hex }}
                        />
                        <span className="text-[10px] leading-tight text-center max-w-[52px]">
                          {language === "ar" ? family.nameAr : family.nameEn}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {paletteFamily &&
                  (() => {
                    const family = COLOR_FAMILIES.find(
                      (f) => f.key === paletteFamily,
                    );
                    if (!family) return null;
                    const usedHexes = new Set(
                      variants.map((v) => v.colorCode.toLowerCase()),
                    );
                    return (
                      <div className="border border-border bg-secondary/30 p-3 space-y-2 rounded-md">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold">
                            {family.nameAr} — {family.nameEn}
                          </p>
                          <button
                            type="button"
                            onClick={() => setPaletteFamily(null)}
                            className="text-muted-foreground hover:text-foreground"
                            data-testid="button-close-shades"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {family.members.map((member) => {
                            const isUsed = usedHexes.has(
                              member.hex.toLowerCase(),
                            );
                            const isLight = (() => {
                              const r = parseInt(member.hex.slice(1, 3), 16);
                              const g = parseInt(member.hex.slice(3, 5), 16);
                              const b = parseInt(member.hex.slice(5, 7), 16);
                              return (r * 299 + g * 587 + b * 114) / 1000 > 200;
                            })();
                            return (
                              <button
                                key={member.nameEn}
                                type="button"
                                disabled={isUsed}
                                onClick={() => {
                                  addVariantFromPalette(member);
                                  setPaletteFamily(null);
                                }}
                                className={`flex items-center gap-2 px-2.5 py-1.5 border text-xs transition-all rounded-md ${
                                  isUsed
                                    ? "opacity-40 cursor-not-allowed border-border bg-muted"
                                    : "border-border hover:border-foreground hover:shadow-sm cursor-pointer bg-card"
                                }`}
                                title={`${member.nameAr} — ${member.nameEn} (${member.hex})`}
                                data-testid={`button-shade-${member.nameEn.replace(/\s+/g, "-").toLowerCase()}`}
                              >
                                <span
                                  className={`w-5 h-5 rounded-full flex-shrink-0 border ${isLight ? "border-gray-300" : "border-transparent"}`}
                                  style={{ backgroundColor: member.hex }}
                                />
                                <span className="whitespace-nowrap">
                                  {member.nameAr}
                                </span>
                                <span className="whitespace-nowrap text-muted-foreground">
                                  ({member.nameEn})
                                </span>
                                {isUsed && (
                                  <Check className="w-3 h-3 text-muted-foreground ms-1" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
              </div>

              {variants.length === 0 && (
                <p className="text-sm text-muted-foreground border border-dashed border-border p-4 text-center rounded-md">
                  {t.admin.noVariantsNote}
                </p>
              )}

              <div className="space-y-4">
                {variants.map((variant, vIdx) => (
                  <div
                    key={vIdx}
                    className="border border-border bg-card rounded-md overflow-hidden"
                    data-testid={`card-variant-${vIdx}`}
                  >
                    <div className="flex items-center justify-between bg-secondary/50 px-4 py-2 border-b border-border">
                      <div className="flex items-center gap-3">
                        <span className="flex -space-x-2 rtl:space-x-reverse flex-shrink-0">
                          {(() => {
                            const families = getVariantFamilies(
                              variant.colorTags,
                            );
                            const swatches =
                              families.length > 0
                                ? families
                                : [
                                    {
                                      key: "primary",
                                      hex: variant.colorCode,
                                      nameAr: variant.name,
                                      nameEn: variant.name,
                                    } as ColorFamily,
                                  ];
                            return swatches
                              .slice(0, 4)
                              .map((family) => (
                                <span
                                  key={family.key}
                                  className="w-6 h-6 rounded-full border-2 border-background ring-1 ring-border"
                                  style={{ backgroundColor: family.hex }}
                                />
                              ));
                          })()}
                        </span>
                        <span className="text-sm font-semibold">
                          {variant.name || `Color ${vIdx + 1}`}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeVariant(vIdx)}
                        className="text-destructive hover:text-destructive/80 h-7 text-xs"
                        data-testid={`button-remove-variant-${vIdx}`}
                      >
                        <Trash2 className="w-3 h-3 me-1" />{" "}
                        {t.admin.removeVariant}
                      </Button>
                    </div>

                    <div className="p-4 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium">
                            {t.admin.colorName} *
                          </label>
                          <Input
                            value={variant.name}
                            onChange={(e) =>
                              updateVariant(vIdx, { name: e.target.value })
                            }
                            className="rounded-md h-9 text-sm"
                            placeholder={t.admin.colorPlaceholder}
                            data-testid={`input-variant-name-${vIdx}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">
                            {t.admin.colorCode}
                          </label>
                          <div className="flex gap-2 items-center">
                            <input
                              type="color"
                              value={variant.colorCode}
                              onChange={(e) => {
                                const code = e.target.value;
                                const lang = language === "ar" ? "ar" : "en";
                                const prevAutoName = hexToColorName(
                                  variant.colorCode,
                                  lang,
                                );
                                const nameIsAutoOrEmpty =
                                  !variant.name.trim() ||
                                  variant.name === prevAutoName;
                                const updates: Partial<VariantState> = {
                                  colorCode: code,
                                };
                                if (nameIsAutoOrEmpty)
                                  updates.name = hexToColorName(code, lang);
                                updateVariant(vIdx, updates);
                              }}
                              className="w-9 h-9 border border-border cursor-pointer rounded-md p-0"
                              data-testid={`input-variant-color-${vIdx}`}
                            />
                            <Input
                              value={variant.colorCode}
                              onChange={(e) => {
                                const code = e.target.value;
                                const lang = language === "ar" ? "ar" : "en";
                                const prevAutoName = hexToColorName(
                                  variant.colorCode,
                                  lang,
                                );
                                const nameIsAutoOrEmpty =
                                  !variant.name.trim() ||
                                  variant.name === prevAutoName;
                                const updates: Partial<VariantState> = {
                                  colorCode: code,
                                };
                                if (nameIsAutoOrEmpty && code.length === 7)
                                  updates.name = hexToColorName(code, lang);
                                updateVariant(vIdx, updates);
                              }}
                              className="rounded-md h-9 text-sm flex-1 font-mono"
                              data-testid={`input-variant-hex-${vIdx}`}
                            />
                            {"EyeDropper" in window && (
                              <button
                                type="button"
                                title={
                                  language === "ar"
                                    ? "انتقاء لون من الصورة"
                                    : "Pick color from image"
                                }
                                onClick={async () => {
                                  try {
                                    const eyeDropper = new (
                                      window as any
                                    ).EyeDropper();
                                    const result = await eyeDropper.open();
                                    const code: string = result.sRGBHex;
                                    const lang =
                                      language === "ar" ? "ar" : "en";
                                    const prevAutoName = hexToColorName(
                                      variant.colorCode,
                                      lang,
                                    );
                                    const nameIsAutoOrEmpty =
                                      !variant.name.trim() ||
                                      variant.name === prevAutoName;
                                    const updates: Partial<VariantState> = {
                                      colorCode: code,
                                    };
                                    if (nameIsAutoOrEmpty)
                                      updates.name = hexToColorName(code, lang);
                                    updateVariant(vIdx, updates);
                                  } catch {}
                                }}
                                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-md border border-border hover:bg-accent hover:text-accent-foreground transition-colors"
                                data-testid={`button-eyedropper-${vIdx}`}
                              >
                                <Pipette className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-xs font-medium">
                            {language === "ar"
                              ? "ألوان القطعة"
                              : "Colors in this piece"}
                            <span className="ms-1 font-normal text-muted-foreground">
                              (
                              {language === "ar"
                                ? "يمكن اختيار أكثر من لون"
                                : "select multiple"}
                              )
                            </span>
                          </label>
                          {variant.colorTags.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                updateVariant(vIdx, { colorTags: [] })
                              }
                              className="text-[10px] text-muted-foreground hover:text-destructive underline"
                              data-testid={`button-clear-variant-colors-${vIdx}`}
                            >
                              {language === "ar" ? "مسح" : "Clear"}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5 p-2 border border-border bg-muted/20 rounded-md">
                          {COLOR_FAMILIES.map((family) => {
                            const selected = variant.colorTags.includes(
                              family.key,
                            );
                            const isLight = (() => {
                              const r = parseInt(family.hex.slice(1, 3), 16);
                              const g = parseInt(family.hex.slice(3, 5), 16);
                              const b = parseInt(family.hex.slice(5, 7), 16);
                              return (r * 299 + g * 587 + b * 114) / 1000 > 200;
                            })();
                            return (
                              <button
                                key={family.key}
                                type="button"
                                onClick={() =>
                                  toggleVariantColorTag(vIdx, family)
                                }
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border transition-all rounded-full ${
                                  selected
                                    ? "border-foreground bg-foreground text-background shadow-sm"
                                    : "border-border bg-background hover:border-foreground/50"
                                }`}
                                data-testid={`button-variant-${vIdx}-color-tag-${family.key}`}
                              >
                                <span
                                  className={`w-3.5 h-3.5 rounded-full border ${isLight ? "border-gray-300" : "border-transparent"}`}
                                  style={{ backgroundColor: family.hex }}
                                />
                                {language === "ar"
                                  ? family.nameAr
                                  : family.nameEn}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* ── Photos Section ── */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold uppercase tracking-wider text-foreground">
                            {language === "ar" ? "📷 الصور" : "📷 Photos"}
                          </label>
                          {variant.media.filter((m) => m.type === "image")
                            .length > 0 && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                              {language === "ar"
                                ? "الأولى = رئيسية · اضغط النجمة لتغيير الرئيسية"
                                : "1st = main · tap ★ to change main"}
                            </span>
                          )}
                        </div>

                        {/* Photo thumbnails */}
                        {variant.media.filter((m) => m.type === "image")
                          .length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {variant.media.map((item, mediaIdx) => {
                              if (item.type !== "image") return null;
                              const imgIndex =
                                variant.media.filter(
                                  (m, i) => m.type === "image" && i <= mediaIdx,
                                ).length - 1;
                              const isMain = item.isPrimary;
                              return (
                                <div key={mediaIdx} className="relative group">
                                  <img
                                    src={item.url}
                                    alt=""
                                    className={`w-20 h-24 object-cover rounded-lg transition-all ${isMain ? "ring-2 ring-offset-1 ring-yellow-400" : "ring-1 ring-border"}`}
                                  />
                                  {/* Main badge */}
                                  {isMain && (
                                    <div className="absolute top-0 inset-x-0 bg-yellow-400 text-yellow-900 text-[8px] font-bold text-center py-0.5 rounded-t-lg pointer-events-none uppercase tracking-wider">
                                      {language === "ar" ? "رئيسية" : "MAIN"}
                                    </div>
                                  )}
                                  {/* Set-as-main star (shows on hover for non-main) */}
                                  {!isMain && (
                                    <button
                                      type="button"
                                      title={
                                        language === "ar"
                                          ? "تعيين كصورة رئيسية"
                                          : "Set as main photo"
                                      }
                                      onClick={() =>
                                        handleSetPrimary(vIdx, mediaIdx)
                                      }
                                      className="absolute top-1 start-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-yellow-400"
                                      data-testid={`button-set-primary-${vIdx}-${mediaIdx}`}
                                    >
                                      <Star
                                        className="w-2.5 h-2.5"
                                        fill="none"
                                      />
                                    </button>
                                  )}
                                  {/* Remove */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveMedia(vIdx, mediaIdx)
                                    }
                                    className="absolute -top-1.5 -end-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                                    data-testid={`button-remove-media-${vIdx}-${mediaIdx}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                  {/* Position badge for non-main photos */}
                                  {!isMain && (
                                    <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[8px] text-center py-0.5 rounded-b-lg pointer-events-none">
                                      #{imgIndex + 1}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {/* Add more photos button */}
                            <label
                              className={`flex flex-col items-center justify-center w-20 h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors bg-muted/20 ${uploading ? "border-primary/60 opacity-60 pointer-events-none" : "border-border hover:border-primary hover:bg-muted/40"}`}
                            >
                              {uploading ? (
                                <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                              ) : (
                                <>
                                  <Upload className="w-4 h-4 text-muted-foreground mb-1" />
                                  <span className="text-[9px] text-muted-foreground text-center leading-tight px-1">
                                    {language === "ar"
                                      ? "إضافة صور"
                                      : "Add photos"}
                                  </span>
                                </>
                              )}
                              <input
                                type="file"
                                accept="image/*,.heic,.heif"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files) {
                                    handleMediaUpload(vIdx, e.target.files);
                                    e.target.value = "";
                                  }
                                }}
                                disabled={uploading}
                              />
                            </label>
                          </div>
                        )}

                        {/* Empty photos state — big upload button */}
                        {variant.media.filter((m) => m.type === "image")
                          .length === 0 && (
                          <label
                            className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${uploading ? "border-primary/40 opacity-60 pointer-events-none bg-primary/5" : "border-border hover:border-primary hover:bg-muted/30 bg-muted/10"}`}
                            data-testid={`input-variant-media-${vIdx}`}
                          >
                            {uploading ? (
                              <>
                                <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-2" />
                                <span className="text-xs text-muted-foreground">
                                  {language === "ar"
                                    ? "جاري الرفع..."
                                    : "Uploading..."}
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <Upload className="w-5 h-5 text-muted-foreground" />
                                  <span className="text-sm font-medium text-foreground">
                                    {language === "ar"
                                      ? "رفع الصور"
                                      : "Upload Photos"}
                                  </span>
                                </div>
                                <span className="text-[11px] text-muted-foreground text-center">
                                  {language === "ar"
                                    ? "اختر صورة واحدة أو أكثر · الأولى ستكون الرئيسية"
                                    : "Select one or more · first photo becomes the main"}
                                </span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/*,.heic,.heif"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files) {
                                  handleMediaUpload(vIdx, e.target.files);
                                  e.target.value = "";
                                }
                              }}
                              disabled={uploading}
                            />
                          </label>
                        )}
                      </div>

                      {/* ── Videos Section ── */}
                      <div className="space-y-2 mt-4">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold uppercase tracking-wider text-foreground">
                            {language === "ar" ? "🎬 الفيديوهات" : "🎬 Videos"}
                          </label>
                          {variant.media.filter((m) => m.type === "video")
                            .length > 0 && (
                            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                              {language === "ar"
                                ? "تتكرر تلقائياً بدون أيقونات"
                                : "auto-loop · no controls shown"}
                            </span>
                          )}
                        </div>

                        {/* Video thumbnails */}
                        {variant.media.filter((m) => m.type === "video")
                          .length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {variant.media.map((item, mediaIdx) => {
                              if (item.type !== "video") return null;
                              return (
                                <div key={mediaIdx} className="relative group">
                                  <video
                                    src={item.url}
                                    muted
                                    playsInline
                                    loop
                                    autoPlay
                                    preload="metadata"
                                    className="w-20 h-24 object-cover rounded-lg bg-black ring-1 ring-border"
                                    style={{ pointerEvents: "none" }}
                                  />
                                  {/* Video badge */}
                                  <div className="absolute top-0 inset-x-0 bg-black/70 text-white text-[8px] font-bold text-center py-0.5 rounded-t-lg pointer-events-none uppercase tracking-wider">
                                    {language === "ar" ? "فيديو" : "VIDEO"}
                                  </div>
                                  {/* Remove */}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveMedia(vIdx, mediaIdx)
                                    }
                                    className="absolute -top-1.5 -end-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
                                    data-testid={`button-remove-media-${vIdx}-${mediaIdx}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })}
                            {/* Add more videos */}
                            <label
                              className={`flex flex-col items-center justify-center w-20 h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors bg-muted/20 ${videoUploading ? "border-primary/60 opacity-60 pointer-events-none" : "border-border hover:border-primary hover:bg-muted/40"}`}
                            >
                              {videoUploading ? (
                                <div className="w-5 h-5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
                              ) : (
                                <>
                                  <Upload className="w-4 h-4 text-muted-foreground mb-1" />
                                  <span className="text-[9px] text-muted-foreground text-center leading-tight px-1">
                                    {language === "ar"
                                      ? "إضافة فيديو"
                                      : "Add video"}
                                  </span>
                                </>
                              )}
                              <input
                                type="file"
                                accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                                multiple
                                className="hidden"
                                onChange={(e) => {
                                  if (e.target.files) {
                                    handleMediaUpload(vIdx, e.target.files);
                                    e.target.value = "";
                                  }
                                }}
                                disabled={videoUploading}
                              />
                            </label>
                          </div>
                        )}

                        {/* Empty videos state — big upload button */}
                        {variant.media.filter((m) => m.type === "video")
                          .length === 0 && (
                          <label
                            className={`flex flex-col items-center justify-center w-full h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${videoUploading ? "border-primary/40 opacity-60 pointer-events-none bg-primary/5" : "border-border hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-900/10 bg-muted/10"}`}
                          >
                            {videoUploading ? (
                              <>
                                <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-2" />
                                <span className="text-xs text-muted-foreground">
                                  {language === "ar"
                                    ? "جاري رفع الفيديو..."
                                    : "Uploading video..."}
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <Upload className="w-5 h-5 text-muted-foreground" />
                                  <span className="text-sm font-medium text-foreground">
                                    {language === "ar"
                                      ? "رفع فيديو"
                                      : "Upload Video"}
                                  </span>
                                </div>
                                <span className="text-[11px] text-muted-foreground text-center">
                                  {language === "ar"
                                    ? "MP4 · WebM · MOV · سيتكرر تلقائياً"
                                    : "MP4 · WebM · MOV · will loop automatically"}
                                </span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files) {
                                  handleMediaUpload(vIdx, e.target.files);
                                  e.target.value = "";
                                }
                              }}
                              disabled={videoUploading}
                            />
                          </label>
                        )}
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium">
                          {t.admin.sizeInventory}
                        </label>

                        {/* Quick-size chips */}
                        {(() => {
                          const quickSizes = getQuickSizes(formData.categoryId);
                          const existingSizes = new Set(
                            variant.sizeRows.map((r) => r.size),
                          );
                          const available = quickSizes.filter(
                            (s) => !existingSizes.has(s),
                          );
                          if (available.length === 0) return null;
                          return (
                            <div className="flex flex-wrap gap-1.5 p-2 bg-muted/40 border border-dashed border-border rounded-md">
                              <span className="text-[10px] font-semibold uppercase text-muted-foreground self-center me-1">
                                {language === "ar"
                                  ? "إضافة سريعة:"
                                  : "Quick add:"}
                              </span>
                              {available.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() =>
                                    updateVariant(vIdx, {
                                      sizeRows: [
                                        ...variant.sizeRows,
                                        { size: s, qty: 1 },
                                      ],
                                    })
                                  }
                                  data-testid={`chip-quick-size-${vIdx}-${s}`}
                                  className="px-2.5 py-0.5 text-xs border border-primary/40 text-primary bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors rounded"
                                >
                                  + {s}
                                </button>
                              ))}
                              {available.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateVariant(vIdx, {
                                      sizeRows: [
                                        ...variant.sizeRows,
                                        ...available.map((s) => ({
                                          size: s,
                                          qty: 1,
                                        })),
                                      ],
                                    })
                                  }
                                  data-testid={`chip-quick-size-all-${vIdx}`}
                                  className="px-2.5 py-0.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-semibold rounded"
                                >
                                  {language === "ar" ? "+ الكل" : "+ All"}
                                </button>
                              )}
                            </div>
                          );
                        })()}

                        {variant.sizeRows.length > 0 && (
                          <div className="border border-border rounded-md overflow-hidden">
                            <div className="grid grid-cols-[1fr_auto_32px] bg-secondary/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider">
                              <span>{t.admin.sizeLabel}</span>
                              <span>{t.admin.qtyLabel}</span>
                              <span></span>
                            </div>
                            {variant.sizeRows.map((row, sIdx) => (
                              <div
                                key={sIdx}
                                className="grid grid-cols-[1fr_auto_32px] items-center px-3 py-2 border-t border-border"
                              >
                                <span className="font-bold text-base">
                                  {row.size}
                                </span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateSizeQtyInVariant(
                                        vIdx,
                                        sIdx,
                                        row.qty - 1,
                                      )
                                    }
                                    className="w-7 h-7 border border-border flex items-center justify-center text-lg font-bold hover:bg-secondary transition-colors rounded"
                                    data-testid={`button-variant-${vIdx}-qty-dec-${row.size}`}
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min="0"
                                    value={row.qty}
                                    onChange={(e) =>
                                      updateSizeQtyInVariant(
                                        vIdx,
                                        sIdx,
                                        parseInt(e.target.value) || 0,
                                      )
                                    }
                                    className="w-12 h-7 border border-border text-center text-sm font-semibold bg-background focus:outline-none focus:ring-1 focus:ring-primary rounded"
                                    data-testid={`input-variant-${vIdx}-qty-${row.size}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateSizeQtyInVariant(
                                        vIdx,
                                        sIdx,
                                        row.qty + 1,
                                      )
                                    }
                                    className="w-7 h-7 border border-border flex items-center justify-center text-lg font-bold hover:bg-secondary transition-colors rounded"
                                    data-testid={`button-variant-${vIdx}-qty-inc-${row.size}`}
                                  >
                                    +
                                  </button>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeSizeFromVariant(vIdx, sIdx)
                                  }
                                  className="text-destructive hover:text-destructive/80 flex justify-center"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                            {variant.sizeRows.length > 1 && (
                              <div className="px-3 py-2 border-t border-border bg-muted/20 flex items-center gap-2">
                                <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                                  {language === "ar"
                                    ? "تعيين الكل:"
                                    : "Set all:"}
                                </span>
                                {[1, 2, 3, 5, 10].map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    data-testid={`button-set-all-qty-${vIdx}-${n}`}
                                    onClick={() =>
                                      setVariants((prev) =>
                                        prev.map((v, i) =>
                                          i === vIdx
                                            ? {
                                                ...v,
                                                sizeRows: v.sizeRows.map(
                                                  (r) => ({ ...r, qty: n }),
                                                ),
                                              }
                                            : v,
                                        ),
                                      )
                                    }
                                    className="px-2.5 py-0.5 text-xs border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors rounded"
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="px-3 py-2 border-t border-border bg-secondary/30 text-xs font-semibold flex justify-between">
                              <span>{t.admin.totalStock}</span>
                              <span className="text-base font-bold text-primary">
                                {variant.sizeRows.reduce(
                                  (sum, r) => sum + r.qty,
                                  0,
                                )}
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Input
                            value={variant.newSizeName}
                            onChange={(e) =>
                              updateVariant(vIdx, {
                                newSizeName: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addSizeToVariant(vIdx);
                              }
                            }}
                            className="rounded-md flex-1 h-9 text-sm"
                            placeholder={
                              language === "ar"
                                ? "أضف مقاساً جديداً (مثل XL، 41...)"
                                : "Add new size (e.g. XL, 41...)"
                            }
                            data-testid={`input-variant-${vIdx}-new-size`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => addSizeToVariant(vIdx)}
                            className="rounded-md h-9 text-xs"
                            data-testid={`button-variant-${vIdx}-add-size`}
                          >
                            <Plus className="w-3 h-3 me-1" /> {t.admin.addSize}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ─── 5. Labels ─── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1 border-b border-border">
                <div className="w-7 h-7 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold">
                  5
                </div>
                <h3 className="text-sm font-semibold text-foreground">
                  {language === "ar" ? "التصنيفات" : "Labels"}
                </h3>
              </div>
              <div className="flex flex-wrap gap-3 pb-2">
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      isFeatured: !formData.isFeatured,
                    })
                  }
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-2 transition-all duration-200 cursor-pointer select-none rounded-md ${formData.isFeatured ? "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 shadow-sm" : "border-border bg-background text-muted-foreground hover:border-amber-300 hover:text-amber-600"}`}
                  data-testid="checkbox-featured"
                >
                  <Star
                    className={`w-4 h-4 transition-transform duration-200 ${formData.isFeatured ? "fill-amber-500 text-amber-500 scale-110" : ""}`}
                  />
                  {t.admin.featuredProduct}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      isNewArrival: !formData.isNewArrival,
                    })
                  }
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-2 transition-all duration-200 cursor-pointer select-none rounded-md ${formData.isNewArrival ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 shadow-sm" : "border-border bg-background text-muted-foreground hover:border-emerald-300 hover:text-emerald-600"}`}
                  data-testid="checkbox-new-arrival"
                >
                  <Sparkles
                    className={`w-4 h-4 transition-transform duration-200 ${formData.isNewArrival ? "text-emerald-500 scale-110" : ""}`}
                  />
                  {t.admin.newArrival}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      isBestSeller: !formData.isBestSeller,
                    })
                  }
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-2 transition-all duration-200 cursor-pointer select-none rounded-md ${formData.isBestSeller ? "border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 shadow-sm" : "border-border bg-background text-muted-foreground hover:border-rose-300 hover:text-rose-600"}`}
                  data-testid="checkbox-best-seller"
                >
                  <Flame
                    className={`w-4 h-4 transition-transform duration-200 ${formData.isBestSeller ? "text-rose-500 scale-110" : ""}`}
                  />
                  {t.admin.bestSeller}
                </button>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2 border-t border-border mt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
                className="rounded-md px-6 hover:bg-destructive/10 hover:text-destructive transition-colors"
                data-testid="button-cancel"
              >
                <X className="w-4 h-4 me-1.5" />
                {t.admin.cancel}
              </Button>
              <Button
                type="submit"
                className="rounded-md px-8 bg-foreground text-background hover:bg-foreground/90 relative overflow-hidden group shadow-md hover:shadow-lg transition-all duration-200"
                disabled={createProduct.isPending || updateProduct.isPending}
                data-testid="button-save"
              >
                <span className="absolute inset-0 bg-primary/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                <span className="relative flex items-center gap-1.5">
                  {createProduct.isPending || updateProduct.isPending ? (
                    <div className="w-4 h-4 rounded-full border-2 border-background/30 border-t-background animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {t.admin.save}
                </span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Excel Bulk Import Dialog ── */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent
          className="max-w-3xl rounded-md w-full p-0 overflow-hidden flex flex-col max-h-[92vh]"
          data-testid="dialog-excel-import"
        >
          {/* Header bar */}
          <div className="flex items-center justify-between px-6 py-4 bg-foreground text-background">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5" />
              <div>
                <h2 className="font-display text-lg font-semibold">
                  {language === "ar"
                    ? "استيراد منتجات بالجملة"
                    : "Bulk Import Products"}
                </h2>
                <p className="text-xs text-background/60 mt-0.5">
                  {language === "ar"
                    ? "أضف عشرات المنتجات دفعة واحدة"
                    : "Add dozens of products at once"}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsImportOpen(false)}
              className="p-1.5 hover:bg-background/10 rounded transition-colors"
              data-testid="button-close-import"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Step indicator */}
          {!importResult && (
            <div className="flex items-center px-6 py-3 bg-muted/30 border-b border-border">
              {[
                {
                  n: 1,
                  label: language === "ar" ? "حمّل القالب" : "Get Template",
                },
                {
                  n: 2,
                  label: language === "ar" ? "ارفع الصور" : "Upload Photos",
                },
                {
                  n: 3,
                  label: language === "ar" ? "استورد الملف" : "Import File",
                },
              ].map(({ n, label }, idx) => (
                <div key={n} className="flex items-center gap-1 flex-1">
                  <button
                    onClick={() => setImportStep(n as 1 | 2 | 3)}
                    className="flex items-center gap-2 group"
                    data-testid={`step-indicator-${n}`}
                  >
                    <span
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-200 ${
                        importStep === n
                          ? "bg-foreground text-background border-foreground"
                          : importStep > n
                            ? "bg-green-600 text-white border-green-600"
                            : "bg-background text-muted-foreground border-border"
                      }`}
                    >
                      {importStep > n ? <Check className="w-3.5 h-3.5" /> : n}
                    </span>
                    <span
                      className={`text-xs font-medium hidden sm:block ${importStep === n ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {label}
                    </span>
                  </button>
                  {idx < 2 && (
                    <div className="flex-1 h-px bg-border mx-2 hidden sm:block" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Scrollable step content */}
          <div className="flex-1 overflow-y-auto">
            {/* ── Step 1: Download Template ── */}
            {importStep === 1 && (
              <div className="p-6 space-y-5">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {language === "ar"
                    ? "حمّل ملف القالب أولاً، وعبّئ بيانات منتجاتك فيه، ثم ارجع وارفعه هنا."
                    : "Download the template file, fill in your product data, then come back and upload it here."}
                </p>

                {/* Column tags preview */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[
                    {
                      col: "name",
                      req: true,
                      label:
                        language === "ar"
                          ? "اسم المنتج (إنجليزي)"
                          : "Product Name (EN)",
                    },
                    {
                      col: "price",
                      req: true,
                      label: language === "ar" ? "السعر" : "Price",
                    },
                    {
                      col: "main_image_url",
                      req: true,
                      label: language === "ar" ? "رابط الصورة" : "Image URL",
                    },
                    {
                      col: "name_ar",
                      req: false,
                      label:
                        language === "ar"
                          ? "اسم المنتج (عربي)"
                          : "Product Name (AR)",
                    },
                    {
                      col: "category_id",
                      req: false,
                      label: language === "ar" ? "رقم الفئة" : "Category ID",
                    },
                    {
                      col: "sizes",
                      req: false,
                      label:
                        language === "ar" ? "المقاسات: S,M,L" : "Sizes: S,M,L",
                    },
                    {
                      col: "stock_quantity",
                      req: false,
                      label: language === "ar" ? "الكمية" : "Stock Qty",
                    },
                    {
                      col: "colors",
                      req: false,
                      label:
                        language === "ar"
                          ? "الألوان: Black,White"
                          : "Colors: Black,White",
                    },
                    {
                      col: "color_codes",
                      req: false,
                      label:
                        language === "ar"
                          ? "كودات اللون: #000,#FFF"
                          : "Color HEX: #000,#FFF",
                    },
                    {
                      col: "cost_price",
                      req: false,
                      label: language === "ar" ? "سعر التكلفة" : "Cost Price",
                    },
                    {
                      col: "discount_price",
                      req: false,
                      label: language === "ar" ? "سعر الخصم" : "Sale Price",
                    },
                    {
                      col: "barcode",
                      req: false,
                      label: language === "ar" ? "الباركود" : "Barcode",
                    },
                    {
                      col: "brand",
                      req: false,
                      label: language === "ar" ? "الماركة" : "Brand",
                    },
                    {
                      col: "is_featured",
                      req: false,
                      label: language === "ar" ? "مميز" : "Featured",
                    },
                    {
                      col: "is_new_arrival",
                      req: false,
                      label: language === "ar" ? "وصول جديد" : "New Arrival",
                    },
                  ].map(({ col, req, label }) => (
                    <div
                      key={col}
                      className={`flex items-center gap-2 px-3 py-2 border text-xs font-mono rounded-md ${req ? "border-foreground/30 bg-foreground/5" : col === "colors" || col === "color_codes" ? "border-purple-200 bg-purple-50/50 dark:border-purple-800 dark:bg-purple-950/20" : "border-border bg-muted/20 text-muted-foreground"}`}
                    >
                      {req && (
                        <span className="w-1.5 h-1.5 rounded-full bg-foreground flex-shrink-0" />
                      )}
                      {(col === "colors" || col === "color_codes") && (
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div
                          className={`font-semibold truncate ${req ? "text-foreground" : col === "colors" || col === "color_codes" ? "text-purple-700 dark:text-purple-300" : "text-muted-foreground"}`}
                        >
                          {col}
                        </div>
                        <div className="text-muted-foreground truncate">
                          {label}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Color tip */}
                <div className="flex items-start gap-2.5 text-xs bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 px-3 py-2.5 rounded-md">
                  <span className="w-3 h-3 rounded-full bg-purple-500 flex-shrink-0 mt-px" />
                  <div className="text-purple-800 dark:text-purple-200 space-y-1.5">
                    {language === "ar" ? (
                      <>
                        <p>
                          <strong>الألوان وكوداتها:</strong> أدخل أسماء الألوان
                          في عمود{" "}
                          <code
                            className="bg-purple-100 dark:bg-purple-900 px-1 rounded"
                            dir="ltr"
                          >
                            colors
                          </code>{" "}
                          مفصولة بفاصلة، وكوداتها في عمود{" "}
                          <code
                            className="bg-purple-100 dark:bg-purple-900 px-1 rounded"
                            dir="ltr"
                          >
                            color_codes
                          </code>
                          . عدد الكودات يجب أن يطابق عدد الألوان.
                        </p>
                        <div className="flex flex-col gap-1 mt-1" dir="ltr">
                          <div className="flex items-center gap-2">
                            <span className="text-purple-600 dark:text-purple-400 font-semibold w-24 text-right shrink-0">
                              colors:
                            </span>
                            <code className="bg-purple-100 dark:bg-purple-900 px-2 py-0.5 rounded">
                              Black,White,Red
                            </code>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-purple-600 dark:text-purple-400 font-semibold w-24 text-right shrink-0">
                              color_codes:
                            </span>
                            <code className="bg-purple-100 dark:bg-purple-900 px-2 py-0.5 rounded">
                              #000000,#FFFFFF,#FF0000
                            </code>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <p>
                          <strong>Colors & codes:</strong> Enter color names in{" "}
                          <code className="bg-purple-100 dark:bg-purple-900 px-1 rounded">
                            colors
                          </code>{" "}
                          comma-separated, and matching hex codes in{" "}
                          <code className="bg-purple-100 dark:bg-purple-900 px-1 rounded">
                            color_codes
                          </code>
                          . Count must match.
                        </p>
                        <div className="flex flex-col gap-1 mt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-purple-600 dark:text-purple-400 font-semibold w-24 shrink-0">
                              colors:
                            </span>
                            <code className="bg-purple-100 dark:bg-purple-900 px-2 py-0.5 rounded">
                              Black,White,Red
                            </code>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-purple-600 dark:text-purple-400 font-semibold w-24 shrink-0">
                              color_codes:
                            </span>
                            <code className="bg-purple-100 dark:bg-purple-900 px-2 py-0.5 rounded">
                              #000000,#FFFFFF,#FF0000
                            </code>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/30 px-3 py-2 border border-border rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground flex-shrink-0" />
                  {language === "ar"
                    ? "الأعمدة البا �زة مطلوبة، الباقية اختيارية"
                    : "Bold columns are required, others are optional"}
                  <span className="ms-auto">
                    {language === "ar"
                      ? "الفئات: 1=فساتين / 4=شوزات / 10=ملابس / 11=بناطيل"
                      : "Cat IDs: 1=Dresses 4=Shoes 10=Clothes 11=Pants"}
                  </span>
                </div>

                {/* Big download button */}
                <a
                  href="/api/admin/products/bulk-template"
                  className="flex items-center gap-4 p-4 bg-foreground text-background hover:bg-foreground/90 transition-colors group rounded-md"
                  data-testid="link-download-template"
                >
                  <div className="w-10 h-10 rounded-full bg-background/10 flex items-center justify-center flex-shrink-0 group-hover:bg-background/20 transition-colors">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold">
                      {language === "ar"
                        ? "تحميل قالب Excel الجاهز"
                        : "Download Excel Template"}
                    </div>
                    <div className="text-xs text-background/60 mt-0.5">
                      {language === "ar"
                        ? "ملف .xlsx جاهز مع تعليمات وصف لكل عمود"
                        : ".xlsx file with instructions and example row"}
                    </div>
                  </div>
                  <span className="ms-auto text-background/40 text-sm">
                    .xlsx →
                  </span>
                </a>

                <div className="flex justify-end pt-1">
                  <Button
                    onClick={() => setImportStep(2)}
                    className="rounded-md bg-foreground text-background hover:bg-foreground/90 gap-2"
                    data-testid="button-step1-next"
                  >
                    {language === "ar"
                      ? "التالي: رفع الصور"
                      : "Next: Upload Photos"}{" "}
                    →
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 2: Upload photos ── */}
            {importStep === 2 && (
              <div className="p-6 space-y-5">
                <p className="text-sm text-muted-foreground">
                  {language === "ar"
                    ? "ارفع صور المنتجات هنا للحصول على روابطها، ثم الصقها في عمود main_image_url في ملف Excel."
                    : "Upload product photos here to get their URLs, then paste them into the main_image_url column in Excel."}
                </p>

                {/* Upload zone */}
                <label
                  className={`flex flex-col items-center justify-center border-2 border-dashed transition-colors cursor-pointer py-7 gap-3 rounded-md ${importImgLoading ? "border-foreground/30 bg-muted/30" : "border-border hover:border-foreground/40 hover:bg-muted/30 bg-muted/10"}`}
                  data-testid="dropzone-import-images"
                >
                  {importImgLoading ? (
                    <>
                      <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {language === "ar" ? "جارٍ الرفع..." : "Uploading..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-7 h-7 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {language === "ar"
                          ? "اضغط أو اسحب الصور هنا"
                          : "Click or drag photos here"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {language === "ar"
                          ? "يمكنك رفع عدة صور معاً"
                          : "Multiple images supported"}
                      </span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept="image/*,.heic,.heif"
                    disabled={importImgLoading}
                    onChange={async (e) => {
                      if (!e.target.files?.length) return;
                      setImportImgLoading(true);
                      try {
                        const urls = await uploadFiles(e.target.files);
                        setImportImageUrls((prev) => [...prev, ...urls]);
                        toast({
                          title:
                            language === "ar"
                              ? `✓ تم رفع ${urls.length} صورة`
                              : `✓ Uploaded ${urls.length} image(s)`,
                        });
                      } catch (err: any) {
                        toast({
                          title:
                            language === "ar" ? "فشل الرفع" : "Upload failed",
                          description: err.message,
                          variant: "destructive",
                        });
                      } finally {
                        setImportImgLoading(false);
                        e.target.value = "";
                      }
                    }}
                    data-testid="input-import-images"
                  />
                </label>

                {/* ── Paste Cloudinary URL directly ── */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {language === "ar"
                      ? "أو الصق رابطاً مباشرة من Cloudinary"
                      : "Or paste a URL directly (e.g. from Cloudinary)"}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={pasteUrlInput}
                      onChange={(e) => setPasteUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const url = pasteUrlInput.trim();
                          if (!url) return;
                          const urls = url
                            .split(/[\n,]+/)
                            .map((u) => u.trim())
                            .filter((u) => u.startsWith("http"));
                          if (urls.length === 0) {
                            toast({
                              title:
                                language === "ar"
                                  ? "رابط غير صالح"
                                  : "Invalid URL",
                              variant: "destructive",
                            });
                            return;
                          }
                          const newUrls = urls.filter(
                            (u) => !importImageUrls.includes(u),
                          );
                          if (newUrls.length > 0)
                            setImportImageUrls((prev) => [...prev, ...newUrls]);
                          setPasteUrlInput("");
                        }
                      }}
                      placeholder={
                        language === "ar"
                          ? "https://res.cloudinary.com/..."
                          : "https://res.cloudinary.com/..."
                      }
                      className="flex-1 h-9 px-3 text-xs border border-border bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                      data-testid="input-paste-image-url"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const url = pasteUrlInput.trim();
                        if (!url) return;
                        const urls = url
                          .split(/[\n,]+/)
                          .map((u) => u.trim())
                          .filter((u) => u.startsWith("http"));
                        if (urls.length === 0) {
                          toast({
                            title:
                              language === "ar"
                                ? "رابط غير صالح"
                                : "Invalid URL",
                            variant: "destructive",
                          });
                          return;
                        }
                        const newUrls = urls.filter(
                          (u) => !importImageUrls.includes(u),
                        );
                        if (newUrls.length > 0)
                          setImportImageUrls((prev) => [...prev, ...newUrls]);
                        setPasteUrlInput("");
                      }}
                      className="h-9 px-3 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors flex-shrink-0"
                      data-testid="button-add-pasted-url"
                    >
                      {language === "ar" ? "إضافة" : "Add"}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {language === "ar"
                      ? "يمكنك لصق روابط متعددة مفصولة بفاصلة أو سطر جديد"
                      : "You can paste multiple URLs separated by commas or new lines"}
                  </p>
                </div>

                {/* Image grid with URL copy */}
                {importImageUrls.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {language === "ar"
                          ? `${importImageUrls.length} صورة — انسخ الرابط وضعه في Excel`
                          : `${importImageUrls.length} photos — copy each URL into Excel`}
                      </p>
                      <button
                        onClick={() => setImportImageUrls([])}
                        className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        {language === "ar" ? "مسح الكل" : "Clear all"}
                      </button>
                    </div>
                    <div className="max-h-52 overflow-y-auto space-y-1.5 pe-1">
                      {importImageUrls.map((url, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2.5 p-2 bg-muted/20 border border-border hover:bg-muted/40 transition-colors group rounded-md"
                        >
                          <img
                            src={url}
                            alt=""
                            className="w-9 h-9 object-cover flex-shrink-0 border border-border rounded"
                          />
                          <span
                            className="flex-1 text-xs truncate text-muted-foreground font-mono select-all"
                            title={url}
                          >
                            {url}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(url);
                              setCopiedUrl(url);
                              setTimeout(() => setCopiedUrl(null), 2000);
                            }}
                            className={`flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs font-medium transition-all rounded-md ${copiedUrl === url ? "text-green-700 bg-green-50 border border-green-200" : "text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30"}`}
                            data-testid={`button-copy-url-${i}`}
                          >
                            {copiedUrl === url ? (
                              <>
                                <CheckCheck className="w-3.5 h-3.5" />
                                {language === "ar" ? "تم" : "Copied"}
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                {language === "ar" ? "نسخ" : "Copy"}
                              </>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-1 border-t border-border">
                  <Button
                    variant="ghost"
                    onClick={() => setImportStep(1)}
                    className="rounded-md gap-2"
                    data-testid="button-step2-back"
                  >
                    ← {language === "ar" ? "رجوع" : "Back"}
                  </Button>
                  <Button
                    onClick={() => setImportStep(3)}
                    className="rounded-md bg-foreground text-background hover:bg-foreground/90 gap-2"
                    data-testid="button-step2-next"
                  >
                    {language === "ar"
                      ? "التالي: رفع الملف"
                      : "Next: Upload File"}{" "}
                    →
                  </Button>
                </div>
              </div>
            )}

            {/* ── Step 3: Upload Excel + import ── */}
            {importStep === 3 && (
              <div className="p-6 space-y-5">
                {!importResult ? (
                  <>
                    {/* Upload zone */}
                    <label
                      className={`flex flex-col items-center justify-center border-2 border-dashed py-10 gap-3 rounded-md cursor-pointer transition-colors ${excelFile ? "border-green-400 bg-green-50" : "border-border hover:border-foreground/40 hover:bg-muted/30 bg-muted/10"}`}
                      data-testid="dropzone-excel-file"
                    >
                      {excelFile ? (
                        <>
                          <div className="w-14 h-14 bg-green-100 border border-green-300 flex items-center justify-center rounded-md">
                            <FileSpreadsheet className="w-7 h-7 text-green-700" />
                          </div>
                          <div className="text-center">
                            <p className="font-semibold text-sm text-green-800">
                              {excelFile.name}
                            </p>
                            <p className="text-xs text-green-600 mt-0.5">
                              {(excelFile.size / 1024).toFixed(1)} KB —{" "}
                              {language === "ar"
                                ? "جاهز للاستيراد"
                                : "Ready to import"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setExcelFile(null);
                            }}
                            className="text-xs text-rose-500 hover:text-rose-700 flex items-center gap-1 mt-1"
                          >
                            <X className="w-3 h-3" />
                            {language === "ar" ? "إزال � الملف" : "Remove"}
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="w-14 h-14 bg-muted/40 border border-border flex items-center justify-center rounded-md">
                            <FileSpreadsheet className="w-7 h-7 text-muted-foreground" />
                          </div>
                          <div className="text-center">
                            <p className="font-medium text-sm">
                              {language === "ar"
                                ? "اضغط لاختيار ملف Excel المعبأ"
                                : "Click to select your filled Excel file"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              .xlsx / .xls
                            </p>
                          </div>
                        </>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                        onChange={(e) => {
                          if (e.target.files?.[0])
                            setExcelFile(e.target.files[0]);
                        }}
                        data-testid="input-excel-file"
                      />
                    </label>

                    {/* Reminder tip */}
                    {importImageUrls.length > 0 && !excelFile && (
                      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-md">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {language === "ar"
                          ? `لديك ${importImageUrls.length} صورة مرفوعة — تأكد من نسخ روابطها في ملف Excel قبل الاستيراد`
                          : `You have ${importImageUrls.length} uploaded photo(s) — make sure you pasted their URLs into Excel before importing`}
                      </div>
                    )}

                    <div className="flex justify-between pt-1 border-t border-border">
                      <Button
                        variant="ghost"
                        onClick={() => setImportStep(2)}
                        className="rounded-md gap-2"
                        data-testid="button-step3-back"
                      >
                        ← {language === "ar" ? "رجوع" : "Back"}
                      </Button>
                      <Button
                        disabled={!excelFile || importLoading}
                        onClick={async () => {
                          if (!excelFile) return;
                          setImportLoading(true);
                          try {
                            const fd = new FormData();
                            fd.append("file", excelFile);
                            const res = await fetch(
                              "/api/admin/products/bulk-import",
                              { method: "POST", body: fd },
                            );
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.message);
                            setImportResult(data);
                            import("@/lib/queryClient").then(
                              ({ queryClient }) => {
                                queryClient.invalidateQueries({
                                  queryKey: ["/api/products"],
                                });
                                queryClient.invalidateQueries({
                                  queryKey: ["/api/products/best-sellers"],
                                });
                              },
                            );
                          } catch (err: any) {
                            toast({
                              title:
                                language === "ar"
                                  ? "فشل الاستيراد"
                                  : "Import failed",
                              description: err.message,
                              variant: "destructive",
                            });
                          } finally {
                            setImportLoading(false);
                          }
                        }}
                        className="rounded-md bg-foreground text-background hover:bg-foreground/90 gap-2 px-6"
                        data-testid="button-run-import"
                      >
                        {importLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {language === "ar"
                              ? "جارٍ الاستيراد..."
                              : "Importing..."}
                          </>
                        ) : (
                          <>
                            <FileSpreadsheet className="w-4 h-4" />
                            {language === "ar" ? "استيراد الآن" : "Import Now"}
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  /* ── Result screen ── */
                  <div className="space-y-4">
                    {/* Big result card */}
                    <div
                      className={`text-center py-8 px-6 rounded-md ${importResult.created > 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}
                    >
                      <div
                        className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${importResult.created > 0 ? "bg-green-100" : "bg-amber-100"}`}
                      >
                        {importResult.created > 0 ? (
                          <Check className="w-8 h-8 text-green-600" />
                        ) : (
                          <AlertCircle className="w-8 h-8 text-amber-600" />
                        )}
                      </div>
                      <p
                        className={`text-2xl font-display font-bold ${importResult.created > 0 ? "text-green-800" : "text-amber-800"}`}
                      >
                        {importResult.created}
                      </p>
                      <p
                        className={`text-sm mt-1 ${importResult.created > 0 ? "text-green-700" : "text-amber-700"}`}
                      >
                        {language === "ar"
                          ? "منتج تم إضافته بنجاح"
                          : "product(s) imported successfully"}
                      </p>
                      {importResult.errors.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {language === "ar"
                            ? `${importResult.errors.length} صف يحتوي على أخطاء`
                            : `${importResult.errors.length} row(s) with errors`}
                        </p>
                      )}
                    </div>

                    {/* Errors list */}
                    {importResult.errors.length > 0 && (
                      <div className="bg-rose-50 border border-rose-200 p-3 max-h-36 overflow-y-auto space-y-1 rounded-md">
                        <p className="text-xs font-semibold text-rose-700 mb-2">
                          {language === "ar" ? "الأخطاء:" : "Errors:"}
                        </p>
                        {importResult.errors.map((e, i) => (
                          <p
                            key={i}
                            className="text-xs text-rose-600 flex gap-1.5 items-start"
                          >
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
                            {e}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-between pt-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setExcelFile(null);
                          setImportResult(null);
                          setImportStep(1);
                        }}
                        className="rounded-md gap-2"
                        data-testid="button-import-again"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        {language === "ar"
                          ? "استيراد ملف آخر"
                          : "Import another file"}
                      </Button>
                      <Button
                        onClick={() => setIsImportOpen(false)}
                        className="rounded-md bg-foreground text-background hover:bg-foreground/90"
                        data-testid="button-import-done"
                      >
                        {language === "ar" ? "إغلاق" : "Done"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* end scrollable content */}
        </DialogContent>
      </Dialog>
      {/* ── Barcode Preview Dialog ── */}
      <Dialog
        open={showBarcodePreview}
        onOpenChange={(open) => {
          setShowBarcodePreview(open);
          if (!open) {
            setBarcodeSearch("");
            setSelectedBarcodeIds(new Set());
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-hidden flex flex-col gap-0 p-0">
          <div className="px-5 pt-5 pb-3 border-b border-border space-y-3">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="w-4 h-4" />
                {language === "ar"
                  ? "طباعة الباركود — 6×4 سم"
                  : "Print Barcodes — 6×4 cm"}
              </DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={barcodeSearch}
                onChange={(e) => setBarcodeSearch(e.target.value)}
                placeholder={
                  language === "ar"
                    ? "ابحث بالباركود أو رقم المنتج..."
                    : "Search by barcode or product #..."
                }
                className="w-full ps-8 pe-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                data-testid="input-barcode-search"
              />
            </div>
            {(() => {
              const allWithBarcode = (products ?? []).filter((p) => {
                if (!(p as any).barcode) return false;
                const q = barcodeSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  ((p as any).barcode ?? "").toLowerCase().includes(q) ||
                  `#${String(p.id).padStart(4, "0")}`.includes(q) ||
                  String(p.id).includes(q)
                );
              });
              const allIds = allWithBarcode.map((p) => p.id);
              return (
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedBarcodeIds(new Set(allIds))}
                      className="text-[11px] underline text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {language === "ar" ? "تحديد الكل" : "Select all"}
                    </button>
                    <span className="text-muted-foreground text-[11px]">·</span>
                    <button
                      type="button"
                      onClick={() => setSelectedBarcodeIds(new Set())}
                      className="text-[11px] underline text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {language === "ar" ? "إلغاء الكل" : "Clear all"}
                    </button>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedBarcodeIds.size}{" "}
                    {language === "ar" ? "محدد" : "selected"}
                    {allWithBarcode.length > 0 && ` / ${allWithBarcode.length}`}
                  </span>
                </div>
              );
            })()}
          </div>

          <div className="overflow-y-auto flex-1 p-4">
            {(() => {
              const allWithBarcode = (products ?? []).filter((p) => {
                if (!(p as any).barcode) return false;
                const q = barcodeSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  ((p as any).barcode ?? "").toLowerCase().includes(q) ||
                  `#${String(p.id).padStart(4, "0")}`.includes(q) ||
                  String(p.id).includes(q)
                );
              });
              if (allWithBarcode.length === 0) {
                return (
                  <div className="py-16 text-center text-muted-foreground text-sm">
                    {barcodeSearch
                      ? language === "ar"
                        ? "لا نتائج للبحث"
                        : "No results found"
                      : language === "ar"
                        ? "لا توجد منتجات بباركود"
                        : "No products have a barcode yet"}
                  </div>
                );
              }
              return (
                <div className="flex flex-wrap gap-3">
                  {allWithBarcode.map((p) => {
                    const selected = selectedBarcodeIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          const next = new Set(selectedBarcodeIds);
                          selected ? next.delete(p.id) : next.add(p.id);
                          setSelectedBarcodeIds(next);
                        }}
                        className={`cursor-pointer border-2 rounded-md p-2 flex flex-col items-center gap-1 transition-all select-none ${
                          selected
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border hover:border-primary/50"
                        }`}
                        style={{ width: "175px" }}
                        data-testid={`card-barcode-${p.id}`}
                      >
                        <div className="flex items-center justify-between w-full mb-0.5">
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{String(p.id).padStart(4, "0")}
                          </span>
                          <div
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              selected
                                ? "bg-primary border-primary"
                                : "border-border"
                            }`}
                          >
                            {selected && (
                              <Check className="w-2.5 h-2.5 text-primary-foreground" />
                            )}
                          </div>
                        </div>
                        <div className="w-full bg-white rounded overflow-hidden">
                          {(p as any).barcode && (
                            <BarcodeSvg value={(p as any).barcode} />
                          )}
                        </div>
                        <span className="text-[9px] text-muted-foreground truncate w-full text-center mt-0.5">
                          {p.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <div className="px-5 py-3 border-t border-border flex justify-between items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {selectedBarcodeIds.size > 0
                ? language === "ar"
                  ? `${selectedBarcodeIds.size} باركود محدد للطباعة`
                  : `${selectedBarcodeIds.size} barcode(s) selected to print`
                : language === "ar"
                  ? "اختر باركودات للطباعة"
                  : "Select barcodes to print"}
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded"
                onClick={() => {
                  setShowBarcodePreview(false);
                  setBarcodeSearch("");
                  setSelectedBarcodeIds(new Set());
                }}
              >
                {language === "ar" ? "إغلاق" : "Close"}
              </Button>
              <Button
                size="sm"
                className="rounded gap-2"
                disabled={selectedBarcodeIds.size === 0}
                onClick={() => {
                  const toPrint = (products ?? [])
                    .filter((p) => selectedBarcodeIds.has(p.id))
                    .map((p) => ({
                      id: p.id,
                      name: p.name,
                      barcode: (p as any).barcode ?? null,
                    }));
                  printBarcodeLabels(toPrint);
                }}
                data-testid="button-print-barcodes-confirm"
              >
                <Printer className="w-4 h-4" />
                {language === "ar"
                  ? `طباعة${selectedBarcodeIds.size > 0 ? ` (${selectedBarcodeIds.size})` : ""}`
                  : `Print${selectedBarcodeIds.size > 0 ? ` (${selectedBarcodeIds.size})` : ""}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Photo quick-preview lightbox ───────────────────────────── */}
      {photoPreview && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center"
          onClick={() => setPhotoPreview(null)}
          data-testid="photo-lightbox"
        >
          {/* Close + counter */}
          <div className="absolute top-4 inset-x-0 flex items-center justify-between px-5 z-10">
            <span className="text-white/70 text-sm font-medium max-w-[60%] truncate">
              {photoPreview.name}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-white/50 text-sm">
                {photoPreview.idx + 1} / {photoPreview.images.length}
              </span>
              <button
                onClick={() => setPhotoPreview(null)}
                className="text-white/70 hover:text-white p-1"
                data-testid="button-lightbox-close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Main image */}
          <div className="relative flex items-center justify-center w-full h-full px-16">
            {/* Prev */}
            {photoPreview.images.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoPreview((prev) =>
                    prev
                      ? {
                          ...prev,
                          idx:
                            (prev.idx - 1 + prev.images.length) %
                            prev.images.length,
                        }
                      : null,
                  );
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                data-testid="button-lightbox-prev"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <img
              src={photoPreview.images[photoPreview.idx]}
              alt={photoPreview.name}
              className="max-h-[80vh] max-w-full object-contain rounded shadow-2xl select-none"
              data-testid="lightbox-image"
            />

            {/* Next */}
            {photoPreview.images.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setPhotoPreview((prev) =>
                    prev
                      ? { ...prev, idx: (prev.idx + 1) % prev.images.length }
                      : null,
                  );
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                data-testid="button-lightbox-next"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Thumbnail strip */}
          {photoPreview.images.length > 1 && (
            <div
              className="absolute bottom-4 inset-x-0 flex justify-center gap-2 px-4 overflow-x-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {photoPreview.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() =>
                    setPhotoPreview((prev) =>
                      prev ? { ...prev, idx: i } : null,
                    )
                  }
                  className={`w-14 h-14 flex-shrink-0 rounded overflow-hidden border-2 transition-all ${
                    i === photoPreview.idx
                      ? "border-white opacity-100"
                      : "border-transparent opacity-50 hover:opacity-80"
                  }`}
                  data-testid={`button-lightbox-thumb-${i}`}
                >
                  <img
                    src={img}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
