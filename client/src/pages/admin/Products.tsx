import { useState, useRef, useEffect, useMemo } from "react";
import { getVideoPosterUrl, optimizeCloudinaryUrl } from "@/lib/utils";
import JsBarcode from "jsbarcode";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { BulkUploadTab } from "@/components/admin/BulkUploadTab";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  SelectSeparator,
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
  Mail,
  Pencil,
  CloudUpload,
  Wand2,
  Bot,
  FilterX,
  Layers,
  PackageX,
  FolderX,
  Barcode,
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
import { getOllamaConfig, generateWithOllama, AI_PROMPT } from "@/lib/ollamaAI";

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

// A single, self-contained action-row button: click it to instantly see the
// product's barcode, and click the barcode itself to arm scan mode and
// replace it — same click-then-scan logic as the barcode field in the full
// edit form, just available right from the product list/grid without
// opening the whole edit dialog. Each instance owns its own local state, so
// it's safe to render one per row inside a .map().
//
// If the product has color variants, a compact list appears below the main
// barcode with one row per color — some products use a different physical
// barcode per color, so this lets the admin click a color, scan its tag,
// and move straight to the next color. Nothing to type or save; scanning
// (or typing + Enter) commits instantly, same as the main barcode.
function QuickBarcodeEditor({
  product,
  language,
  onSave,
  onSaveColor,
  buttonClassName,
}: {
  product: { id: number; barcode?: string | null; colorVariants?: ColorVariant[] | null };
  language: string;
  onSave: (id: number, barcode: string) => void;
  onSaveColor?: (id: number, colorName: string, barcode: string) => void;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  // What the next scan/keystroke will be saved to: null (nothing armed yet),
  // "__main__" (the product's main barcode), or a color's name.
  const [scanTarget, setScanTarget] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const colors = product.colorVariants || [];

  const arm = (target: string) => {
    setScanTarget(target);
    setValue("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed && scanTarget) {
      if (scanTarget === "__main__") {
        if (trimmed !== (product.barcode || "")) onSave(product.id, trimmed);
      } else if (onSaveColor) {
        const cv = colors.find((c) => c.name === scanTarget);
        if (trimmed !== (cv?.barcode || "")) onSaveColor(product.id, scanTarget, trimmed);
      }
    }
    // Stay open so several colors can be scanned back-to-back without
    // reopening the popover each time — just disarm and wait for the next click.
    setScanTarget(null);
    setValue("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setScanTarget(null);
        setValue("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => e.stopPropagation()}
          className={
            buttonClassName ??
            "text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"
          }
          title={
            language === "ar"
              ? "عرض الباركود / استبداله بالمسح"
              : "View barcode / replace by scanning"
          }
          data-testid={`button-quick-barcode-${product.id}`}
        >
          <Barcode className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3"
        onClick={(e) => e.stopPropagation()}
        data-testid={`popover-quick-barcode-${product.id}`}
      >
        <div
          onClick={() => arm("__main__")}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-3 cursor-pointer transition-all ${
            scanTarget === "__main__"
              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
              : product.barcode
                ? "border-border bg-white hover:border-primary/50"
                : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
          }`}
        >
          {scanTarget === "__main__" ? (
            <div className="flex flex-col items-center gap-1.5 py-2">
              <Barcode className="w-5 h-5 text-primary animate-pulse" />
              <span className="text-[11px] font-semibold text-primary">
                {language === "ar" ? "جاهز — امسح الآن" : "Ready — scan now"}
              </span>
            </div>
          ) : product.barcode ? (
            <>
              <div className="bg-white rounded px-2 py-1 w-full">
                <BarcodeSvg value={product.barcode} />
              </div>
              <span className="text-[9px] text-muted-foreground">
                {language === "ar" ? "انقر لاستبداله بالمسح" : "Click to scan a replacement"}
              </span>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-2 text-muted-foreground">
              <Barcode className="w-5 h-5" />
              <span className="text-[11px] font-medium">
                {language === "ar" ? "لا يوجد باركود — انقر للمسح" : "No barcode — click to scan"}
              </span>
            </div>
          )}
        </div>

        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => {
            if (!scanTarget) setScanTarget("__main__");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="mt-2 rounded-md font-mono text-xs h-8"
          placeholder={
            scanTarget && scanTarget !== "__main__"
              ? language === "ar"
                ? `${scanTarget}: امسح أو اكتب ثم Enter`
                : `${scanTarget}: scan or type + Enter`
              : language === "ar"
                ? "أو اكتب يدوياً ثم Enter"
                : "Or type manually + Enter"
          }
          data-testid={`input-quick-barcode-${product.id}`}
        />

        {colors.length > 0 && onSaveColor && (
          <div className="mt-3 pt-2.5 border-t border-border/60">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              {language === "ar" ? "باركود إضافي لكل لون" : "Additional barcode per color"}
            </p>
            <div className="space-y-1.5 max-h-52 overflow-y-auto pe-0.5">
              {colors.map((c) => {
                const armed = scanTarget === c.name;
                return (
                  <div
                    key={c.name}
                    className={`w-full rounded-md border transition-all overflow-hidden ${
                      armed
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : c.barcode
                          ? "border-border bg-white"
                          : "border-border/60 bg-muted/20"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => arm(c.name)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 text-start hover:brightness-95"
                      data-testid={`button-color-barcode-${product.id}-${c.name}`}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: c.colorCode }}
                      />
                      <span className="flex-1 text-xs font-medium truncate">{c.name}</span>
                      {armed ? (
                        <Barcode className="w-3.5 h-3.5 text-primary animate-pulse shrink-0" />
                      ) : c.barcode ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <Barcode className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                    </button>
                    {armed ? (
                      <div className="flex items-center justify-center gap-1.5 px-2 pb-2 text-[11px] font-semibold text-primary">
                        {language === "ar" ? "جاهز — امسح الآن" : "Ready — scan now"}
                      </div>
                    ) : c.barcode ? (
                      // This color's OWN barcode, rendered on the spot — makes
                      // it obvious it's different from (and not overwritten by)
                      // the main product barcode shown above.
                      <div className="px-2 pb-1.5">
                        <div className="bg-white rounded px-1.5 py-0.5 border border-border/40">
                          <BarcodeSvg value={c.barcode} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Renders a barcode to an SVG markup string using the JsBarcode copy
// already bundled with the app (no CDN script tag in the print popup).
// Rendering happens synchronously here, in the admin's own browser
// context, before the popup is even opened — so the popup's HTML has
// the finished barcode (and therefore the name/price around it) from
// the very first paint, instead of racing an external script load
// against window.print().
function renderLabelBarcodeSvg(
  value: string,
  opts: { height?: number; width?: number; fontSize?: number } = {},
): string {
  try {
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svgEl, value, {
      format: "CODE128",
      width: opts.width ?? 1.6,
      height: opts.height ?? 34,
      displayValue: true,
      fontSize: opts.fontSize ?? 11,
      fontOptions: "bold",
      textMargin: 2,
      margin: 2,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return svgEl.outerHTML;
  } catch {
    return `<div style="font-size:14px;font-weight:800;letter-spacing:2px;">${value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")}</div>`;
  }
}

// Suggests the next sizes an admin probably forgot to add, based on what's
// already there. Two cases: letter sizes (S, M, L...) walk a standard
// XS→4XL ladder and suggest whatever comes after the highest one entered;
// numeric sizes (shoe sizes like 36, 37, 38...) look at the gap between
// the entered sizes (usually 1) and continue upward from the highest one.
// Returns at most 3 suggestions, skipping anything already present.
const LETTER_SIZE_SEQUENCE = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];
function getSizeSuggestions(existingSizes: string[]): string[] {
  const existing = new Set(existingSizes.map((s) => s.trim().toUpperCase()));
  const letterMatches = existingSizes
    .map((s) => s.trim().toUpperCase())
    .filter((s) => LETTER_SIZE_SEQUENCE.includes(s));

  if (letterMatches.length > 0) {
    const maxIdx = Math.max(
      ...letterMatches.map((s) => LETTER_SIZE_SEQUENCE.indexOf(s)),
    );
    const suggestions: string[] = [];
    for (
      let i = maxIdx + 1;
      i < LETTER_SIZE_SEQUENCE.length && suggestions.length < 3;
      i++
    ) {
      if (!existing.has(LETTER_SIZE_SEQUENCE[i]))
        suggestions.push(LETTER_SIZE_SEQUENCE[i]);
    }
    return suggestions;
  }

  const numericSizes = existingSizes
    .map((s) => s.trim())
    .filter((s) => /^\d+(\.\d+)?$/.test(s))
    .map(Number)
    .sort((a, b) => a - b);

  if (numericSizes.length > 0) {
    const max = numericSizes[numericSizes.length - 1];
    let step = 1;
    if (numericSizes.length >= 2) {
      const freq: Record<number, number> = {};
      for (let i = 1; i < numericSizes.length; i++) {
        const d = numericSizes[i] - numericSizes[i - 1];
        if (d > 0) freq[d] = (freq[d] || 0) + 1;
      }
      const entries = Object.entries(freq).sort((a, b) => b[1] - a[1]);
      if (entries.length > 0) step = Number(entries[0][0]);
    }
    const suggestions: string[] = [];
    let next = max + step;
    while (suggestions.length < 3 && next < 100) {
      const label = String(Number.isInteger(next) ? next : next.toFixed(1));
      if (!existing.has(label.toUpperCase())) suggestions.push(label);
      next += step;
    }
    return suggestions;
  }

  return [];
}

function printBarcodeLabels(
  products: {
    id: number;
    name: string;
    barcode: string | null;
    price?: string | number | null;
    discountPrice?: string | number | null;
    colorVariants?: { name: string; barcode?: string }[];
  }[],
) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;

  const escLabelHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const labels = products
    .filter((p) => p.barcode)
    .flatMap((p) => {
      const hasDiscount = p.discountPrice && Number(p.discountPrice) > 0 && p.price;
      const displayPrice = hasDiscount
        ? Number(p.discountPrice).toFixed(0)
        : p.price ? Number(p.price).toFixed(0) : null;

      // A product with multiple colors gets one label per color so every
      // physical unit (in every color) leaves with its own barcode tag. If a
      // color has its OWN scanned barcode, that label prints that color's
      // barcode instead of the main one — otherwise it falls back to the
      // main barcode, same as before. Single-color / no-color products keep
      // exactly one label, unchanged.
      const colors = (p.colorVariants || [])
        .map((v) => ({ name: v.name.trim(), barcode: v.barcode?.trim() || null }))
        .filter((v) => v.name);
      const uniqueColors = Array.from(new Map(colors.map((c) => [c.name, c])).values());
      const copies: { colorName: string | null; barcode: string }[] =
        uniqueColors.length > 1
          ? uniqueColors.map((c) => ({ colorName: c.name, barcode: c.barcode || (p.barcode as string) }))
          : [{ colorName: null, barcode: p.barcode as string }];

      return copies.map(({ colorName, barcode }, i) => {
        const barcodeSvg = renderLabelBarcodeSvg(barcode, {
          height: 34,
          width: 1.6,
          fontSize: 11,
        });
        return `
        <div class="label" id="wrap_${p.id}_${i}">
          <div class="pname">${escLabelHtml(p.name.slice(0, 34))}</div>
          ${colorName ? `<div class="color">${escLabelHtml(colorName.slice(0, 24))}</div>` : ""}
          <div class="brand">LUCERNE BOUTIQUE</div>
          <div class="bc-wrap">${barcodeSvg}</div>
          ${displayPrice ? `
          <div class="price-row">
            ${hasDiscount ? `<span class="price-original">₪${Number(p.price).toFixed(0)}</span>` : ""}
            <span class="price-main">₪${displayPrice}</span>
          </div>` : ""}
        </div>`;
      });
    })
    .join("");

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Barcodes</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; color: #000; }
  .grid { display: flex; flex-wrap: wrap; gap: 0; }

  /* 6cm wide × 4cm tall — landscape orientation matching the UI cards */
  .label {
    width: 6cm;
    height: 4cm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2px 4px;
    border: 0.5px dashed #ccc;
    page-break-inside: avoid;
    break-inside: avoid;
    overflow: visible;
  }

  /* Product name — centered above the brand in print/PDF.
     Safe font stack that covers Arabic glyphs (Tahoma/Segoe UI), and
     text wraps onto a second line instead of being clipped, since a
     clipped/empty name was one of the things going missing on print. */
  .pname {
    width: 100%;
    max-width: 100%;
    font-size: 7.5pt;
    line-height: 1.15;
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    font-weight: 700;
    color: #000;
    max-height: 2.4em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    direction: rtl;
    text-align: center;
    margin-bottom: 1px;
  }

  /* Color name — shown only on multi-color products, one label per color */
  .color {
    font-size: 7pt;
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    font-weight: 600;
    color: #000;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  /* Brand name — clean, centered under product name */
  .brand {
    font-size: 7.5pt;
    font-family: Georgia, "Times New Roman", serif;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #000;
    font-weight: 700;
    margin-bottom: 1px;
    white-space: nowrap;
    text-align: center;
  }

  /* Barcode fills most of the label width */
  .bc-wrap {
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .bc-wrap svg {
    width: 100%;
    max-width: 100%;
    max-height: 1.8cm;
  }

  /* Price row */
  .price-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    margin-top: 1px;
  }
  .price-main {
    font-size: 10.5pt;
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    font-weight: 800;
    color: #000;
  }
  .price-original {
    font-size: 7pt;
    font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    color: #000;
    text-decoration: line-through;
  }

  @page { size: auto; margin: 5mm; }
  @media print {
    html, body { margin: 0; }
    .grid { gap: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    .pname, .brand, .color, .price-main, .price-original { color: #000 !important; }
  }
</style>
</head>
<body>
<div class="grid">${labels}</div>
</body>
</html>`);
  win.document.close();
  // Content (including barcodes) is already fully embedded, so just give
  // the popup a brief moment to finish layout/paint before printing.
  setTimeout(() => {
    win.focus();
    win.print();
  }, 250);
}

function generateBarcode(): string {
  // Numeric-only barcode — no letter prefix — so it always prints and
  // scans cleanly. 8-digit timestamp tail + 4-digit random suffix.
  const ts = Date.now().toString().slice(-8);
  const rnd = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `${ts}${rnd}`;
}

// A barcode has to be unique — POS and the quick-scan editor both look a
// scanned code up by exact match, so if two products (or two colors) shared
// one, scanning it would always resolve to whichever happens to be found
// first, silently ringing up or editing the wrong item. This checks a
// barcode against every OTHER product's main barcode AND every color's own
// barcode, and reports who already owns it so the admin gets a clear error
// instead of a silent overwrite. `excludeProductId` skips the product
// currently being edited, since its own in-progress values are checked
// separately (see the duplicate-within-this-form check at save time).
function findBarcodeConflict(
  barcode: string,
  allProducts: Product[] | undefined,
  excludeProductId?: number | null,
): { productName: string; colorName?: string } | null {
  const code = barcode.trim().toLowerCase();
  if (!code || !allProducts) return null;
  for (const p of allProducts) {
    if (excludeProductId != null && p.id === excludeProductId) continue;
    if (((p as any).barcode || "").toLowerCase() === code) {
      return { productName: p.name };
    }
    const cv = ((p as any).colorVariants as ColorVariant[] | undefined) || [];
    const match = cv.find((c) => (c.barcode || "").toLowerCase() === code);
    if (match) return { productName: p.name, colorName: match.name };
  }
  return null;
}

interface VariantState {
  id: string;
  name: string;
  colorCode: string;
  mainImage: string;
  images: string[];
  sizeRows: { size: string; qty: number }[];
  newSizeName: string;
  colorTags: string[];
  media: MediaItem[];
  barcode?: string;
}

// Stable per-variant id, independent of the variant's position in the array.
// Uploads (video/image) are async and can outlive a reorder caused by the
// admin adding/removing a color while the upload is still in flight — if we
// matched the upload result back to a variant by its array *index* alone,
// a color added or removed mid-upload would shift every index after it, and
// the finished file would land on the wrong color. Matching by this id
// instead keeps the file attached to the color it was actually uploaded for.
let variantIdSeq = 0;
const makeVariantId = () =>
  `variant-${Date.now()}-${++variantIdSeq}-${Math.random().toString(36).slice(2, 8)}`;

function normalizeVariantMediaState(
  variant: VariantState,
  mediaInput: MediaItem[] = variant.media || [],
): VariantState {
  const seen = new Set<string>();
  const media: MediaItem[] = [];

  for (const item of mediaInput) {
    if (!item || (item.type !== "image" && item.type !== "video")) continue;
    const url = typeof item.url === "string" ? item.url.trim() : "";
    if (!url) continue;
    const key = `${item.type}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    media.push({ ...item, url, poster: item.poster || (item.type === "video" ? getVideoPosterUrl(url) : undefined) });
  }

  // Prefer an image as the primary gallery item. A video may be primary only
  // when the variant has no images at all. This prevents video-only edits from
  // overwriting product.mainImage with a video URL.
  let primaryIndex = media.findIndex((item) => item.type === "image" && item.isPrimary);
  if (primaryIndex < 0) primaryIndex = media.findIndex((item) => item.type === "image");
  if (primaryIndex < 0) primaryIndex = media.findIndex((item) => item.type === "video" && item.isPrimary);
  if (primaryIndex < 0 && media.length > 0) primaryIndex = 0;

  const normalizedMedia = media.map((item, index) => {
    const next = { ...item };
    if (index === primaryIndex) next.isPrimary = true;
    else delete next.isPrimary;
    return next;
  });

  const primaryImage =
    normalizedMedia.find((item) => item.type === "image" && item.isPrimary) ||
    normalizedMedia.find((item) => item.type === "image");
  const firstVideoPoster = normalizedMedia.find((item) => item.type === "video" && item.poster)?.poster;
  const mainImage = primaryImage?.url || firstVideoPoster || "";
  const images = Array.from(
    new Set(
      normalizedMedia
        .filter((item) => item.type === "image" && item.url !== mainImage)
        .map((item) => item.url),
    ),
  );

  return { ...variant, media: normalizedMedia, mainImage, images };
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

// Small emoji + accent color for category/subcategory filter chips — matched
// by keyword against the (Arabic or English) name so it works for any
// category the admin creates, without needing a stored icon field.
function getCategoryVisual(name?: string, nameAr?: string): { emoji: string; color: string } {
  const n = (name || "").toLowerCase();
  const a = nameAr || "";
  const has = (en: string[], ar: string[]) =>
    en.some((k) => n.includes(k)) || ar.some((k) => a.includes(k));

  if (has(["abaya"], ["عباي"])) {
    return { emoji: "🧥", color: "bg-stone-100 dark:bg-stone-800/50" };
  }
  if (has(["dress"], ["فستان", "فساتين"])) {
    return { emoji: "👗", color: "bg-rose-50 dark:bg-rose-950/30" };
  }
  if (has(["heel", "pump", "stiletto"], ["كعب", "مسكر", "بلاطين"])) {
    return { emoji: "👠", color: "bg-fuchsia-50 dark:bg-fuchsia-950/30" };
  }
  if (has(["boot"], ["بوت"])) {
    return { emoji: "👢", color: "bg-amber-50 dark:bg-amber-950/30" };
  }
  if (has(["sandal", "slipper", "flip"], ["صندل", "بوابيج", "شبشب"])) {
    return { emoji: "🩴", color: "bg-orange-50 dark:bg-orange-950/30" };
  }
  if (has(["flat", "ballerina", "ballet"], ["باليرين", "فلات"])) {
    return { emoji: "🥿", color: "bg-emerald-50 dark:bg-emerald-950/30" };
  }
  if (has(["sneaker", "trainer"], ["كندر", "سنيكرز", "رياضي"])) {
    return { emoji: "👟", color: "bg-sky-50 dark:bg-sky-950/30" };
  }
  if (has(["shoe"], ["حذاء", "أحذية", "شوز"])) {
    return { emoji: "👟", color: "bg-sky-50 dark:bg-sky-950/30" };
  }
  if (has(["bag", "handbag", "clutch", "backpack"], ["حقيب", "شنط", "كلاتش", "باق"])) {
    return { emoji: "👜", color: "bg-violet-50 dark:bg-violet-950/30" };
  }
  if (
    has(
      ["jewel", "accessor", "ring", "necklace", "bracelet"],
      ["اكسسوار", "إكسسوار", "خاتم", "قلادة", "أسورة", "مجوهرات"],
    )
  ) {
    return { emoji: "💍", color: "bg-teal-50 dark:bg-teal-950/30" };
  }
  // General clothing fallback: shirts, blouses, tops, pants, skirts, sets, blazers
  return { emoji: "👕", color: "bg-blue-50 dark:bg-blue-950/30" };
}

function CategoryIconBadge({
  emoji,
  icon: Icon,
  color,
}: {
  emoji?: string;
  icon?: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  if (Icon) {
    return (
      <span className={`flex items-center justify-center w-5 h-5 rounded-md shrink-0 ${color}`}>
        <Icon className="w-3 h-3" />
      </span>
    );
  }
  return (
    <span
      className={`flex items-center justify-center w-6 h-6 rounded-full shrink-0 text-sm leading-none ${color}`}
    >
      {emoji}
    </span>
  );
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
  const handleQuickBarcodeSave = (id: number, barcode: string) => {
    const conflict = findBarcodeConflict(barcode, products, id);
    if (conflict) {
      toast({
        title: language === "ar" ? "باركود مكرر" : "Duplicate barcode",
        description:
          language === "ar"
            ? `هذا الباركود مستخدم بالفعل في "${conflict.productName}"${conflict.colorName ? ` (${conflict.colorName})` : ""}`
            : `This barcode is already used on "${conflict.productName}"${conflict.colorName ? ` (${conflict.colorName})` : ""}`,
        variant: "destructive",
      });
      return;
    }
    // Also can't collide with one of this same product's own color barcodes.
    const ownColors = ((products?.find((p) => p.id === id) as any)?.colorVariants as ColorVariant[] | undefined) || [];
    const ownColorMatch = ownColors.find((c) => (c.barcode || "").toLowerCase() === barcode.trim().toLowerCase());
    if (ownColorMatch) {
      toast({
        title: language === "ar" ? "باركود مكرر" : "Duplicate barcode",
        description:
          language === "ar"
            ? `هذا الباركود مستخدم بالفعل مع اللون "${ownColorMatch.name}" لنفس المنتج`
            : `This barcode is already used by this product's own "${ownColorMatch.name}" color`,
        variant: "destructive",
      });
      return;
    }
    updateProduct.mutate(
      { id, barcode },
      {
        onSuccess: () => {
          toast({
            title:
              language === "ar" ? "تم تحديث الباركود" : "Barcode updated",
          });
        },
        onError: (err: any) => {
          toast({
            title:
              language === "ar" ? "فشل تحديث الباركود" : "Failed to update barcode",
            description: err?.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  // Same idea as handleQuickBarcodeSave, but writes into the matching entry
  // of colorVariants instead of the top-level barcode field — lets a color
  // that ships under its own barcode (different from the main product tag)
  // get scanned in without opening the full edit dialog.
  const handleQuickColorBarcodeSave = (id: number, colorName: string, barcode: string) => {
    const product = products?.find((p) => p.id === id);
    if (!product) return;
    const conflict = findBarcodeConflict(barcode, products, id);
    if (conflict) {
      toast({
        title: language === "ar" ? "باركود مكرر" : "Duplicate barcode",
        description:
          language === "ar"
            ? `هذا الباركود مستخدم بالفعل في "${conflict.productName}"${conflict.colorName ? ` (${conflict.colorName})` : ""}`
            : `This barcode is already used on "${conflict.productName}"${conflict.colorName ? ` (${conflict.colorName})` : ""}`,
        variant: "destructive",
      });
      return;
    }
    const code = barcode.trim().toLowerCase();
    // Can't collide with the same product's own main barcode or another one
    // of its own colors either.
    if (((product as any).barcode || "").trim().toLowerCase() === code) {
      toast({
        title: language === "ar" ? "باركود مكرر" : "Duplicate barcode",
        description:
          language === "ar"
            ? `هذا الباركود مطابق للباركود الرئيسي لنفس المنتج`
            : `This barcode matches this same product's main barcode`,
        variant: "destructive",
      });
      return;
    }
    const existingColors = ((product as any).colorVariants as ColorVariant[] | undefined) || [];
    const sameProductOtherColorMatch = existingColors.find(
      (c) => c.name !== colorName && (c.barcode || "").toLowerCase() === code,
    );
    if (sameProductOtherColorMatch) {
      toast({
        title: language === "ar" ? "باركود مكرر" : "Duplicate barcode",
        description:
          language === "ar"
            ? `هذا الباركود مستخدم بالفعل مع اللون "${sameProductOtherColorMatch.name}" لنفس المنتج`
            : `This barcode is already used by this product's own "${sameProductOtherColorMatch.name}" color`,
        variant: "destructive",
      });
      return;
    }
    const colorVariants = existingColors.map((cv) => (cv.name === colorName ? { ...cv, barcode } : cv));
    updateProduct.mutate(
      { id, colorVariants } as any,
      {
        onSuccess: () => {
          toast({
            title:
              language === "ar"
                ? `تم تحديث باركود ${colorName}`
                : `${colorName} barcode updated`,
          });
        },
        onError: (err: any) => {
          toast({
            title:
              language === "ar" ? "فشل تحديث الباركود" : "Failed to update barcode",
            description: err?.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  // ── Size audit: flag Shoes-category products that still carry
  // letter sizes (S/M/L/XL...) instead of numeric shoe sizes. This never
  // changes any data on its own — it just surfaces old products for the
  // admin to review and fix by hand.
  const shoeSizeAuditResults = useMemo(() => {
    if (!products) return [];
    const isLetterSize = (label: string) => /^[A-Za-z\u0600-\u06FF]/.test(label.trim());
    const results: { id: number; name: string; nameAr?: string; badSizes: string[] }[] = [];
    for (const p of products as any[]) {
      if (Number(p.categoryId) !== SHOES_CATEGORY_ID) continue;
      const badSizes = new Set<string>();
      Object.keys(p.sizeInventory || {}).forEach((s) => {
        if (isLetterSize(s)) badSizes.add(s);
      });
      const cv = (p.colorVariants as any[]) || [];
      cv.forEach((v) => {
        Object.keys(v?.sizeInventory || {}).forEach((s) => {
          if (isLetterSize(s)) badSizes.add(s);
        });
      });
      if (badSizes.size > 0) {
        results.push({
          id: p.id,
          name: p.name,
          nameAr: p.nameAr,
          badSizes: Array.from(badSizes),
        });
      }
    }
    return results;
  }, [products]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [videoUploading, setVideoUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | "">("");
  const [subcategoryFilter, setSubcategoryFilter] = useState<number | "">("");
  const [showUncategorized, setShowUncategorized] = useState(false);
  const [showNoSubcategory, setShowNoSubcategory] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "grid" | "bulk-upload">("table");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  // Tracks the true (uploaded) pixel dimensions of each photo, read once the
  // thumbnail finishes loading, so we can flag ones too small to look sharp
  // at full product-page size — without touching/removing the photo itself.
  const [photoNaturalSizes, setPhotoNaturalSizes] = useState<Record<string, { w: number; h: number }>>({});
  const LOW_RES_THRESHOLD = 800; // px — below this, photos look soft on the product page's ~1200px main viewer
  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  // True the moment the admin clicks the barcode preview (or focuses the
  // field) to replace it — shows the "ready, scan now" state until a
  // scanner (or manual Enter) commits a new value.
  const [barcodeScanMode, setBarcodeScanMode] = useState(false);
  // Same click-then-scan idea as the main barcode, but per color variant —
  // holds the index of whichever variant card is currently armed (null =
  // none). Each variant renders its own input, so a plain single ref won't
  // do; this map holds one ref per variant index, keyed as they mount.
  const [variantBarcodeScanIdx, setVariantBarcodeScanIdx] = useState<number | null>(null);
  const variantBarcodeInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const initialForm: any = {
    name: "",
    description: "",
    price: "",
    costPrice: "",
    discountPrice: "",
    categoryId: 1,
    subcategoryId: "",
    subcategoryIds: [] as number[],
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
  const [isBulkAiPhotoOpen, setIsBulkAiPhotoOpen] = useState(false);
  // Which shot type(s) the admin wants generated for the selected products.
  // Defaults to both, but the admin can uncheck one to only generate that
  // single type (e.g. only the model-worn shot) for every color processed.
  const [bulkAiPhotoShotTypes, setBulkAiPhotoShotTypes] = useState<Set<"model" | "product">>(
    new Set(["model", "product"]),
  );
  const [bulkAiPhotoRunning, setBulkAiPhotoRunning] = useState(false);
  const [bulkAiPhotoProgress, setBulkAiPhotoProgress] = useState({
    done: 0,
    total: 0,
    failed: 0,
    currentName: "",
  });
  const bulkAiPhotoCancelRef = useRef(false);

  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [bulkEditFields, setBulkEditFields] = useState<{
    name: string;
    nameAr: string;
    price: string;
    discountPrice: string;
    categoryId: string;
    subcategoryIds: number[];
    clearSubcategories: boolean;
  }>({
    name: "",
    nameAr: "",
    price: "",
    discountPrice: "",
    categoryId: "",
    subcategoryIds: [],
    clearSubcategories: false,
  });
  const [bulkEditRegenBarcode, setBulkEditRegenBarcode] = useState(false);

  // ── Main product photo download + bulk AI autofill state ──
  const [downloadingPhotoIds, setDownloadingPhotoIds] = useState<Set<number>>(new Set());
  const [bulkPhotoDownloading, setBulkPhotoDownloading] = useState(false);
  const [isBulkAutofillOpen, setIsBulkAutofillOpen] = useState(false);
  const [autofillFields, setAutofillFields] = useState({
    name: true,
    description: true,
    colors: true,
  });
  const [autofillRunning, setAutofillRunning] = useState(false);
  const [autofillProgress, setAutofillProgress] = useState({
    done: 0,
    total: 0,
    failed: 0,
    currentName: "",
  });
  const autofillCancelRef = useRef(false);
  const [bulkEditApplying, setBulkEditApplying] = useState(false);
  const [mediaUrlInputs, setMediaUrlInputs] = useState<Record<string, string>>(
    {},
  );
  const [stockPopup, setStockPopup] = useState<{
    productId: number;
    variantName: string;
    colorCode: string;
    sizeInventory: Record<string, number>;
    saving: boolean;
    categoryId?: number;
  } | null>(null);
  const [stockPopupValues, setStockPopupValues] = useState<
    Record<string, number>
  >({});
  const [stockPopupNewSize, setStockPopupNewSize] = useState("");
  const [colorEditPopup, setColorEditPopup] = useState<{
    productId: number;
    variantIndex: number;
    saving: boolean;
  } | null>(null);
  const [colorEditValues, setColorEditValues] = useState<{
    name: string;
    colorCode: string;
  }>({ name: "", colorCode: "" });
  const [nameEditPopup, setNameEditPopup] = useState<{
    productId: number;
    saving: boolean;
  } | null>(null);
  const [nameEditValue, setNameEditValue] = useState("");
  const [priceEditPopup, setPriceEditPopup] = useState<{
    productId: number;
    saving: boolean;
  } | null>(null);
  const [priceEditValue, setPriceEditValue] = useState("");
  const [discountPriceEditValue, setDiscountPriceEditValue] = useState("");
  const [categoryEditPopup, setCategoryEditPopup] = useState<{
    productId: number;
    saving: boolean;
  } | null>(null);
  const [categoryEditValue, setCategoryEditValue] = useState<number | null>(null);
  const [subcategoryEditPopup, setSubcategoryEditPopup] = useState<{
    productId: number;
    categoryId: number | null;
    saving: boolean;
  } | null>(null);
  const [subcategoryEditValue, setSubcategoryEditValue] = useState<number | null>(null);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{
    images: string[];
    name: string;
    idx: number;
  } | null>(null);
  // Separate lightbox state for the barcode dialog specifically — rendered
  // as a child *inside* that dialog's DialogContent (not as a page-level
  // overlay), so Radix sees any click on it as happening inside the dialog
  // and never treats it as an "outside click" that would close the whole
  // barcode print window. Same pattern used for order photos in Orders.tsx.
  const [barcodePhotoPreview, setBarcodePhotoPreview] = useState<{
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
  const [barcodeCategoryFilter, setBarcodeCategoryFilter] = useState<number | "">("");
  const [barcodeSubcategoryFilter, setBarcodeSubcategoryFilter] = useState<number | "">("");
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
    updated: number;
    errors: string[];
  } | null>(null);

  // A product is considered low stock only when 2 units or fewer remain.
  const LOW_STOCK_MAX = 2;
  const [showLowStock, setShowLowStock] = useState(false);
  const [lowStockCategoryFilter, setLowStockCategoryFilter] = useState<number | "">("");
  const [lowStockSubcategoryFilter, setLowStockSubcategoryFilter] = useState<number | "">("");
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountApplying, setDiscountApplying] = useState(false);
  const [discountSendEmail, setDiscountSendEmail] = useState(false);
  const [discountSendWA, setDiscountSendWA] = useState(false);
  const [discountCategoryMention, setDiscountCategoryMention] = useState("");
  const [selectedLowStockIds, setSelectedLowStockIds] = useState<Set<number>>(
    new Set(),
  );
  // Bulk category/subcategory editor for low-stock products. "keep" means
  // leave the existing value untouched, while "none" explicitly clears it.
  const [showLowStockMoveDialog, setShowLowStockMoveDialog] = useState(false);
  const [lowStockMoveCategory, setLowStockMoveCategory] = useState<string>("keep");
  // Multi-select subcategories, same pattern as the add/edit product form: a
  // product can belong to several subcategories at once.
  const [lowStockMoveSubcategoryIds, setLowStockMoveSubcategoryIds] = useState<number[]>([]);
  const [lowStockClearSubcategories, setLowStockClearSubcategories] = useState(false);

  // "Add to subcategory" — appends subcategories to the selected products
  // without touching their existing category or existing subcategories.
  const [showLowStockAddSubcategoryDialog, setShowLowStockAddSubcategoryDialog] = useState(false);
  const [lowStockAddSubcategoryIds, setLowStockAddSubcategoryIds] = useState<number[]>([]);
  const [lowStockAddSubcategorySaving, setLowStockAddSubcategorySaving] = useState(false);
  const [lowStockMoveSaving, setLowStockMoveSaving] = useState(false);

  const [isFlagsDialogOpen, setIsFlagsDialogOpen] = useState(false);
  const [isSizeAuditOpen, setIsSizeAuditOpen] = useState(false);
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

      if (discountSendEmail) {
        try {
          const emailRes = await fetch("/api/admin/send-sale-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              discountPercent: pct,
              categoryMention: discountCategoryMention.trim() || null,
            }),
          });
          const emailData = await emailRes.json();
          if (emailRes.ok) {
            toast({
              title:
                language === "ar"
                  ? `تم إرسال البريد إلى ${emailData.recipientCount} عميل`
                  : `Email sent to ${emailData.recipientCount} customer(s)`,
            });
          }
        } catch {
          /* non-critical */
        }
      }

      if (discountSendWA) {
        try {
          const waRes = await fetch("/api/admin/send-sale-whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              discountPercent: pct,
              categoryMention: discountCategoryMention.trim() || null,
            }),
          });
          const waData = await waRes.json();
          if (waRes.ok) {
            toast({
              title:
                language === "ar"
                  ? `تم إرسال واتساب إلى ${waData.recipientCount} عميل`
                  : `WhatsApp sent to ${waData.recipientCount} customer(s)`,
            });
          }
        } catch {
          /* non-critical */
        }
      }

      setShowDiscountDialog(false);
      setDiscountPercent("");
      setDiscountSendEmail(false);
      setDiscountSendWA(false);
      setDiscountCategoryMention("");
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

  const openLowStockMoveDialog = () => {
    if (selectedLowStockIds.size === 0) return;
    // Always start in an explicit "keep current" state. This prevents simply
    // opening the bulk editor and pressing Save from accidentally clearing or
    // rewriting mixed category/subcategory values.
    setLowStockMoveCategory("keep");
    setLowStockMoveSubcategoryIds([]);
    setLowStockClearSubcategories(false);
    setShowLowStockMoveDialog(true);
  };

  const handleMoveLowStockProducts = async () => {
    const ids = Array.from(selectedLowStockIds);
    if (ids.length === 0) return;

    const categoryChanged = lowStockMoveCategory !== "keep";
    const subcategoryChanged =
      lowStockMoveSubcategoryIds.length > 0 || lowStockClearSubcategories;

    if (!categoryChanged && !subcategoryChanged) {
      setShowLowStockMoveDialog(false);
      return;
    }

    const categoryId =
      lowStockMoveCategory === "keep"
        ? undefined
        : lowStockMoveCategory === "none"
          ? null
          : Number(lowStockMoveCategory);

    // Multiple subcategories can be applied at once, mirroring the add/edit
    // product form. An empty array (with clear checked) removes them all.
    const targetSubcategoryIds = lowStockClearSubcategories
      ? []
      : lowStockMoveSubcategoryIds.map((id) => Number(id));

    if (targetSubcategoryIds.length > 0) {
      const targetSubcategories = (subcategoriesData || []).filter((sub: any) =>
        targetSubcategoryIds.includes(Number(sub.id)),
      );
      if (targetSubcategories.length !== targetSubcategoryIds.length) {
        toast({
          title: language === "ar" ? "التصنيف الفرعي غير موجود" : "Subcategory not found",
          variant: "destructive",
        });
        return;
      }
      if (
        typeof categoryId === "number" &&
        targetSubcategories.some((sub: any) => Number(sub.categoryId) !== categoryId)
      ) {
        toast({
          title: language === "ar" ? "التصنيف الفرعي لا يتبع الفئة المحددة" : "Subcategory does not belong to the selected category",
          variant: "destructive",
        });
        return;
      }
      // When several products with different categories are selected, new
      // subcategories are unsafe unless the destination category is also chosen.
      if (categoryId === undefined) {
        const selectedProducts = lowStockProducts.filter((p) => ids.includes(p.id));
        const selectedCategoryIds = new Set(selectedProducts.map((p) => p.categoryId));
        const targetCategoryIds = new Set(targetSubcategories.map((sub: any) => Number(sub.categoryId)));
        if (
          selectedCategoryIds.size !== 1 ||
          targetCategoryIds.size !== 1 ||
          !selectedCategoryIds.has(Array.from(targetCategoryIds)[0])
        ) {
          toast({
            title: language === "ar" ? "حدد الفئة الرئيسية أولاً" : "Choose the destination category first",
            description:
              language === "ar"
                ? "المنتجات المحددة ليست كلها في نفس الفئة، لذلك لا يمكن تطبيق تصنيفات فرعية بأمان."
                : "The selected products are not all in the same category, so subcategories cannot be applied safely.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    setLowStockMoveSaving(true);
    try {
      // Keep the request burst small so selecting dozens of products does not
      // overload the server. The normal product update API is reused so cache
      // updates and validation stay consistent with the rest of this page.
      const batchSize = 8;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        await Promise.all(
          batch.map((id) => {
            const updates: any = { id };
            if (categoryChanged) updates.categoryId = categoryId;

            if (subcategoryChanged) {
              updates.subcategoryId =
                targetSubcategoryIds.length > 0 ? targetSubcategoryIds[0] : null;
              updates.subcategoryIds = targetSubcategoryIds;
            } else if (categoryChanged) {
              // A new category must never keep stale subcategory links from the
              // old category. Clear both supported subcategory fields.
              updates.subcategoryId = null;
              updates.subcategoryIds = [];
            }
            return updateProduct.mutateAsync(updates);
          }),
        );
      }

      toast({
        title:
          language === "ar"
            ? `تم تحديث الفئة لـ ${ids.length} منتج`
            : `Category updated for ${ids.length} product(s)`,
      });
      setSelectedLowStockIds(new Set());
      setShowLowStockMoveDialog(false);
    } catch (err: any) {
      toast({
        title: language === "ar" ? "فشل تحديث الفئة" : "Failed to update category",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setLowStockMoveSaving(false);
    }
  };

  // Adds one or more subcategories to the selected products WITHOUT removing
  // their current category or any subcategory they already have — this is a
  // pure append/union, unlike handleMoveLowStockProducts which replaces.
  const handleAddLowStockSubcategories = async () => {
    const ids = Array.from(selectedLowStockIds);
    if (ids.length === 0 || lowStockAddSubcategoryIds.length === 0) {
      setShowLowStockAddSubcategoryDialog(false);
      return;
    }

    const chosenSubcategories = (subcategoriesData || []).filter((sub: any) =>
      lowStockAddSubcategoryIds.includes(Number(sub.id)),
    );

    setLowStockAddSubcategorySaving(true);
    try {
      let updatedCount = 0;
      let skippedCount = 0;
      const batchSize = 8;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (id) => {
            const product = lowStockProducts.find((p) => p.id === id);
            if (!product) return;

            // Only apply subcategories that belong to this product's own
            // category — a subcategory from a different category is skipped
            // rather than silently attached to the wrong category.
            const applicable = chosenSubcategories.filter(
              (sub: any) => Number(sub.categoryId) === Number(product.categoryId),
            );
            if (applicable.length === 0) {
              skippedCount++;
              return;
            }

            const existingIds = getProductSubcategoryIds(product);
            const beforeSize = existingIds.size;
            applicable.forEach((sub: any) => existingIds.add(Number(sub.id)));
            if (existingIds.size === beforeSize) {
              // Already had all of the chosen subcategories — nothing to do.
              skippedCount++;
              return;
            }

            const mergedIds = Array.from(existingIds);
            const updates: any = {
              id,
              // Keep the current primary subcategory if the product already
              // had one; otherwise use the first newly-added subcategory.
              subcategoryId: (product as any).subcategoryId || mergedIds[0],
              subcategoryIds: mergedIds,
            };
            await updateProduct.mutateAsync(updates);
            updatedCount++;
          }),
        );
      }

      toast({
        title:
          language === "ar"
            ? `تمت إضافة التصنيف الفرعي لـ ${updatedCount} منتج`
            : `Subcategory added to ${updatedCount} product(s)`,
        description:
          skippedCount > 0
            ? language === "ar"
              ? `تم تخطي ${skippedCount} منتج (فئة غير مطابقة أو التصنيف موجود مسبقاً)`
              : `${skippedCount} product(s) skipped (category mismatch or already had it)`
            : undefined,
      });
      setSelectedLowStockIds(new Set());
      setLowStockAddSubcategoryIds([]);
      setShowLowStockAddSubcategoryDialog(false);
    } catch (err: any) {
      toast({
        title: language === "ar" ? "فشل إضافة التصنيف الفرعي" : "Failed to add subcategory",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setLowStockAddSubcategorySaving(false);
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

  const getProductSubcategoryIds = (product: Product) => {
    const ids = new Set<number>();
    const primary = Number((product as any).subcategoryId);
    if (Number.isInteger(primary) && primary > 0) ids.add(primary);
    const extra = (product as any).subcategoryIds;
    if (Array.isArray(extra)) {
      extra.forEach((id) => {
        const n = Number(id);
        if (Number.isInteger(n) && n > 0) ids.add(n);
      });
    }
    return ids;
  };

  const filteredProducts = products?.filter((p) => {
    const pSubcategoryIds = getProductSubcategoryIds(p);
    if (showUncategorized) {
      if (p.categoryId || pSubcategoryIds.size > 0) return false;
    } else {
      if (categoryFilter !== "" && p.categoryId !== categoryFilter) return false;
      if (showNoSubcategory) {
        if (pSubcategoryIds.size > 0) return false;
      } else if (subcategoryFilter !== "" && !pSubcategoryIds.has(Number(subcategoryFilter))) {
        return false;
      }
    }
    if (showLowStock && p.stockQuantity > LOW_STOCK_MAX) return false;
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

  const allLowStockProducts = useMemo(
    () => (products ?? []).filter((p) => p.stockQuantity <= LOW_STOCK_MAX),
    [products],
  );

  const lowStockProducts = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, "");
    return allLowStockProducts.filter((p) => {
      if (lowStockCategoryFilter !== "" && p.categoryId !== lowStockCategoryFilter) return false;
      if (
        lowStockSubcategoryFilter !== "" &&
        !getProductSubcategoryIds(p).has(lowStockSubcategoryFilter)
      ) return false;
      if (!q) return true;
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
  }, [allLowStockProducts, lowStockCategoryFilter, lowStockSubcategoryFilter, search]);

  const lowStockCategories = useMemo(() => {
    return (categories ?? [])
      .map((cat) => ({
        ...cat,
        lowStockCount: allLowStockProducts.filter((p) => p.categoryId === cat.id).length,
      }))
      .filter((cat) => cat.lowStockCount > 0);
  }, [categories, allLowStockProducts]);

  const lowStockSubcategories = useMemo(() => {
    return (subcategoriesData ?? [])
      .filter((sub: any) =>
        lowStockCategoryFilter === "" || sub.categoryId === lowStockCategoryFilter,
      )
      .map((sub: any) => ({
        ...sub,
        lowStockCount: allLowStockProducts.filter((p) =>
          getProductSubcategoryIds(p).has(Number(sub.id)),
        ).length,
      }))
      .filter((sub: any) => sub.lowStockCount > 0);
  }, [subcategoriesData, allLowStockProducts, lowStockCategoryFilter]);

  const uncategorizedCount =
    products?.filter((p) => !p.categoryId && !(p as any).subcategoryId).length ??
    0;

  const noSubcategoryCount =
    products?.filter(
      (p) =>
        (categoryFilter === "" || p.categoryId === categoryFilter) &&
        !(p as any).subcategoryId,
    ).length ?? 0;

  const hasActiveFilters =
    categoryFilter !== "" ||
    subcategoryFilter !== "" ||
    showUncategorized ||
    showNoSubcategory ||
    showLowStock ||
    !!search;

  // Products eligible for the barcode print dialog: must have a barcode,
  // then narrowed by the dialog's own search + category + subcategory
  // filters (independent from the main table's filters above).
  const barcodeEligibleProducts = useMemo(() => {
    const q = barcodeSearch.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      if (!(p as any).barcode) return false;
      if (barcodeCategoryFilter !== "" && p.categoryId !== barcodeCategoryFilter) return false;
      if (barcodeSubcategoryFilter !== "" && !getProductSubcategoryIds(p).has(Number(barcodeSubcategoryFilter)))
        return false;
      if (!q) return true;
      return (
        ((p as any).barcode ?? "").toLowerCase().includes(q) ||
        `#${String(p.id).padStart(4, "0")}`.includes(q) ||
        String(p.id).includes(q)
      );
    });
  }, [products, barcodeSearch, barcodeCategoryFilter, barcodeSubcategoryFilter]);

  // Total physical barcode labels that will actually print for the current
  // selection — a selected product with N distinct colors contributes N
  // labels, not 1. Shared by the footer summary text and the Print button's
  // own count so neither one silently falls back to a plain product count.
  const totalBarcodeLabelsToPrint = useMemo(() => {
    return (products ?? [])
      .filter((p) => selectedBarcodeIds.has(p.id))
      .reduce((sum, p) => {
        const colorCount = new Set(
          (((p as any).colorVariants || []) as { name: string }[])
            .map((v) => v.name.trim())
            .filter(Boolean),
        ).size;
        return sum + Math.max(1, colorCount);
      }, 0);
  }, [products, selectedBarcodeIds]);

  const clearAllFilters = () => {
    setCategoryFilter("");
    setSubcategoryFilter("");
    setShowUncategorized(false);
    setShowNoSubcategory(false);
    setShowLowStock(false);
    setLowStockCategoryFilter("");
    setLowStockSubcategoryFilter("");
    setSelectedLowStockIds(new Set());
    setSearch("");
  };

  const uploadFiles = async (files: FileList | File[]): Promise<string[]> => {
    const fd = new FormData();
    Array.from(files).forEach((file) => fd.append("images", file));
    const res = await fetch("/api/upload", {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    if (!res.ok) {
      // The server (or a proxy in front of it, e.g. nginx) may return an HTML
      // error page instead of JSON — typically a 413 "request entity too large".
      // Read as text first so we never crash on `res.json()` parsing "<html>…".
      const raw = await res.text();
      let message = "";
      try {
        message = JSON.parse(raw)?.message || "";
      } catch {
        message = "";
      }
      if (!message) {
        message =
          res.status === 413
            ? "Image too large to upload. Please use a smaller file (or raise the server upload size limit)."
            : `Upload failed (${res.status}). Please try again.`;
      }
      throw new Error(message);
    }
    const data = await res.json();
    return (data?.data?.urls || data.urls || []) as string[];
  };

  const deleteCloudinaryImage = async (url: string) => {
    if (!url) return;
    if (!url.includes("cloudinary.com") && !url.startsWith("/uploads/")) return;
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
    setMediaUrlInputs({});
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const openEdit = (p: Product) => {
    setMediaUrlInputs({});
    setFormData({
      name: p.name,
      description: p.description,
      price: p.price,
      costPrice: (p as any).costPrice || "",
      discountPrice: p.discountPrice || "",
      categoryId: p.categoryId || "",
      subcategoryId: (p as any).subcategoryId || "",
      subcategoryIds: (() => {
        const raw = (p as any).subcategoryIds as number[] | null | undefined;
        const arr = Array.isArray(raw)
          ? raw.filter((x) => typeof x === "number")
          : [];
        if (arr.length > 0) return arr;
        return (p as any).subcategoryId
          ? [Number((p as any).subcategoryId)]
          : [];
      })(),
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
            media = [...v.media];
            if (v.mainImage && !media.some((item) => item.type === "image" && item.url === v.mainImage)) {
              media.unshift({ type: "image", url: v.mainImage, isPrimary: !media.some((item) => item.isPrimary) });
            }
            for (const imageUrl of v.images || []) {
              if (imageUrl && !media.some((item) => item.type === "image" && item.url === imageUrl)) {
                media.push({ type: "image", url: imageUrl });
              }
            }
            if (vIdx === 0 && productVideoUrl && !media.some((item) => item.type === "video" && item.url === productVideoUrl)) {
              media.push({ type: "video", url: productVideoUrl, poster: getVideoPosterUrl(productVideoUrl) });
            }
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
            id: makeVariantId(),
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
            barcode: v.barcode || "",
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
            id: makeVariantId(),
            name: c,
            colorCode: "#000000",
            mainImage: i === 0 ? p.mainImage : "",
            images: i === 0 ? p.images || [] : [],
            sizeRows: [...rows],
            newSizeName: "",
            colorTags: [],
            barcode: "",
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
            id: makeVariantId(),
            name: "Default",
            colorCode: "#000000",
            mainImage: p.mainImage,
            images: p.images || [],
            sizeRows: rows,
            newSizeName: "",
            colorTags: [],
            barcode: "",
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

    setVariants((current) =>
      current.map((variant) => normalizeVariantMediaState(variant, variant.media)),
    );
    setEditingId(p.id);
    setIsDialogOpen(true);
  };

  const addVariant = () => {
    const defaultSizes = getDefaultSizes(formData.categoryId);
    setVariants((prev) => [
      {
        id: makeVariantId(),
        name: "",
        colorCode: "#000000",
        mainImage: "",
        images: [],
        sizeRows: defaultSizes,
        newSizeName: "",
        colorTags: [],
        barcode: "",
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
        id: makeVariantId(),
        name,
        colorCode: member.hex,
        mainImage: "",
        images: [],
        sizeRows: defaultSizes,
        newSizeName: "",
        colorTags: family ? [family.key] : [],
        barcode: "",
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
    // Capture the variant's stable id now, synchronously, while variantIdx
    // is still guaranteed to point at the right color. The upload below is
    // async (video uploads especially can take a while); if the admin adds
    // or removes a color while it's in flight, every index after that point
    // shifts. Matching the result back to a variant by *index* later would
    // then attach the file to whatever color now happens to sit at that
    // index — i.e. the wrong color. Matching by id avoids that.
    const targetVariantId = variants[variantIdx]?.id;
    const fileArr = Array.from(files);
    const videoFiles = fileArr.filter((f) => f.type.startsWith("video/"));
    const imageFiles = fileArr.filter((f) => !f.type.startsWith("video/"));

    // Heads-up only — never blocks the upload. Lets the admin know a photo
    // is small enough that it may look soft on the full-size product page,
    // so they can swap in a better source photo if they have one.
    if (imageFiles.length > 0) {
      const dims = await Promise.all(
        imageFiles.map(
          (f) =>
            new Promise<{ name: string; w: number; h: number } | null>((resolve) => {
              const url = URL.createObjectURL(f);
              const img = new Image();
              img.onload = () => {
                resolve({ name: f.name, w: img.naturalWidth, h: img.naturalHeight });
                URL.revokeObjectURL(url);
              };
              img.onerror = () => {
                resolve(null);
                URL.revokeObjectURL(url);
              };
              img.src = url;
            }),
        ),
      );
      const small = dims.filter((d): d is { name: string; w: number; h: number } => !!d && Math.max(d.w, d.h) < 800);
      if (small.length > 0) {
        toast({
          title: language === "ar" ? "تنبيه: صور بدقة منخفضة" : "Heads up: low-resolution photo(s)",
          description:
            language === "ar"
              ? `${small.length} صورة أصغر من 800px قد تبدو غير واضحة على صفحة المنتج الكاملة.`
              : `${small.length} photo(s) under 800px may look soft on the full product page: ${small.map((d) => d.name).join(", ")}`,
        });
      }
    }

    for (const file of videoFiles) {
      setVideoUploading(true);
      try {
        const fd = new FormData();
        fd.append("video", file);
        const res = await fetch("/api/upload-video", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!res.ok) {
          // A proxy in front of the app (e.g. nginx) may reject large videos
          // with an HTML error page. Read text first so JSON.parse never throws
          // "Unexpected token '<'".
          const raw = await res.text();
          let message = "";
          try {
            message = JSON.parse(raw)?.message || "";
          } catch {
            message = "";
          }
          if (!message) {
            message =
              res.status === 413
                ? "Video too large to upload. Please use a smaller file (or raise the server upload size limit)."
                : `Video upload failed (${res.status}).`;
          }
          throw new Error(message);
        }
        const data = await res.json();
        setVariants((prev) =>
          prev.map((v) => {
            if (v.id !== targetVariantId) return v;
            const cur = v.media || [];
            const videoUrl = data?.data?.url || data.url;
            if (!videoUrl) throw new Error("Video upload did not return a URL");
            const posterUrl = data?.data?.poster || data.poster || getVideoPosterUrl(videoUrl);
            const newItem: MediaItem = {
              type: "video",
              url: videoUrl,
              poster: posterUrl,
              isPrimary: cur.length === 0,
            };
            return normalizeVariantMediaState(v, [...cur, newItem]);
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
          prev.map((v) => {
            if (v.id !== targetVariantId) return v;
            const cur = v.media || [];
            const newItems: MediaItem[] = urls.map((url, idx) => ({
              type: "image",
              url,
              isPrimary: cur.length === 0 && idx === 0,
            }));
            return normalizeVariantMediaState(v, [...cur, ...newItems]);
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

  const openColorEditPopup = (
    e: React.MouseEvent,
    productId: number,
    variantIndex: number,
    name: string,
    colorCode: string,
  ) => {
    e.stopPropagation();
    setColorEditValues({ name, colorCode });
    setColorEditPopup({ productId, variantIndex, saving: false });
  };

  const saveColorEditPopup = async () => {
    if (!colorEditPopup) return;
    setColorEditPopup((p) => (p ? { ...p, saving: true } : null));
    try {
      const product = products?.find((p) => p.id === colorEditPopup.productId);
      if (!product) throw new Error("Product not found");
      const cv = ((product as any).colorVariants as ColorVariant[]) || [];
      const updatedCv = cv.map((v, i) =>
        i === colorEditPopup.variantIndex
          ? { ...v, name: colorEditValues.name, colorCode: colorEditValues.colorCode }
          : v,
      );
      await updateProduct.mutateAsync({
        id: colorEditPopup.productId,
        colorVariants: updatedCv,
        colors: updatedCv.map((v) => v.name),
      } as any);
      toast({
        title: language === "ar" ? "تم تحديث اللون" : "Color updated",
      });
      setColorEditPopup(null);
    } catch (err: any) {
      toast({
        title: t.auth.error,
        description: err.message,
        variant: "destructive",
      });
      setColorEditPopup((p) => (p ? { ...p, saving: false } : null));
    }
  };

  const openNameEditPopup = (
    e: React.MouseEvent,
    productId: number,
    name: string,
  ) => {
    e.stopPropagation();
    setNameEditValue(name);
    setNameEditPopup({ productId, saving: false });
  };

  const saveNameEditPopup = async () => {
    if (!nameEditPopup) return;
    const name = nameEditValue.trim();
    if (!name) return;
    setNameEditPopup((p) => (p ? { ...p, saving: true } : null));
    try {
      await updateProduct.mutateAsync({
        id: nameEditPopup.productId,
        name,
      } as any);
      toast({ title: language === "ar" ? "تم تحديث الاسم" : "Name updated" });
      setNameEditPopup(null);
    } catch (err: any) {
      toast({ title: t.auth.error, description: err.message, variant: "destructive" });
      setNameEditPopup((p) => (p ? { ...p, saving: false } : null));
    }
  };

  const openPriceEditPopup = (
    e: React.MouseEvent,
    productId: number,
    price: string | number | null | undefined,
    discountPrice: string | number | null | undefined,
  ) => {
    e.stopPropagation();
    setPriceEditValue(price !== null && price !== undefined ? String(price) : "");
    setDiscountPriceEditValue(
      discountPrice !== null && discountPrice !== undefined ? String(discountPrice) : "",
    );
    setPriceEditPopup({ productId, saving: false });
  };

  const savePriceEditPopup = async () => {
    if (!priceEditPopup) return;
    const price = priceEditValue.trim();
    const discountPrice = discountPriceEditValue.trim();
    if (!price || isNaN(parseFloat(price))) return;
    if (discountPrice && parseFloat(discountPrice) >= parseFloat(price)) {
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
    setPriceEditPopup((p) => (p ? { ...p, saving: true } : null));
    try {
      await updateProduct.mutateAsync({
        id: priceEditPopup.productId,
        price,
        discountPrice: discountPrice ? discountPrice : null,
      } as any);
      toast({ title: language === "ar" ? "تم تحديث السعر" : "Price updated" });
      setPriceEditPopup(null);
    } catch (err: any) {
      toast({ title: t.auth.error, description: err.message, variant: "destructive" });
      setPriceEditPopup((p) => (p ? { ...p, saving: false } : null));
    }
  };

  const openCategoryEditPopup = (
    e: React.MouseEvent,
    productId: number,
    categoryId: number | null,
  ) => {
    e.stopPropagation();
    setCategoryEditValue(categoryId);
    setCategoryEditPopup({ productId, saving: false });
  };

  const saveCategoryEditPopup = async () => {
    if (!categoryEditPopup) return;
    setCategoryEditPopup((p) => (p ? { ...p, saving: true } : null));
    try {
      await updateProduct.mutateAsync({
        id: categoryEditPopup.productId,
        categoryId: categoryEditValue,
        subcategoryId: null,
        subcategoryIds: [],
      } as any);
      toast({ title: language === "ar" ? "تم تحديث الفئة" : "Category updated" });
      setCategoryEditPopup(null);
    } catch (err: any) {
      toast({ title: t.auth.error, description: err.message, variant: "destructive" });
      setCategoryEditPopup((p) => (p ? { ...p, saving: false } : null));
    }
  };

  const openSubcategoryEditPopup = (
    e: React.MouseEvent,
    productId: number,
    categoryId: number | null,
    subcategoryId: number | null,
  ) => {
    e.stopPropagation();
    setSubcategoryEditValue(subcategoryId);
    setSubcategoryEditPopup({ productId, categoryId, saving: false });
  };

  const saveSubcategoryEditPopup = async () => {
    if (!subcategoryEditPopup) return;
    setSubcategoryEditPopup((p) => (p ? { ...p, saving: true } : null));
    try {
      await updateProduct.mutateAsync({
        id: subcategoryEditPopup.productId,
        subcategoryId: subcategoryEditValue,
        subcategoryIds: subcategoryEditValue ? [subcategoryEditValue] : [],
      } as any);
      toast({ title: language === "ar" ? "تم تحديث الفئة الفرعية" : "Subcategory updated" });
      setSubcategoryEditPopup(null);
    } catch (err: any) {
      toast({ title: t.auth.error, description: err.message, variant: "destructive" });
      setSubcategoryEditPopup((p) => (p ? { ...p, saving: false } : null));
    }
  };

  const openStockPopup = (
    e: React.MouseEvent,
    productId: number,
    variantName: string,
    colorCode: string,
    sizeInventory: Record<string, number>,
    categoryId?: number,
  ) => {
    e.stopPropagation();
    setStockPopupValues({ ...sizeInventory });
    setStockPopupNewSize("");
    setStockPopup({
      productId,
      variantName,
      colorCode,
      sizeInventory,
      saving: false,
      categoryId,
    });
  };

  const saveStockPopup = async () => {
    if (!stockPopup) return;
    setStockPopup((p) => (p ? { ...p, saving: true } : null));
    try {
      const res = await fetch(
        `/api/products/${stockPopup.productId}/variant-stock`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            variantName: stockPopup.variantName,
            sizeInventory: stockPopupValues,
          }),
        },
      );
      if (!res.ok) throw new Error((await res.json()).message);
      import("@/lib/queryClient").then(({ queryClient }) => {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      });
      toast({
        title: language === "ar" ? "تم تحديث المخزون" : "Stock updated",
      });
      setStockPopup(null);
    } catch (err: any) {
      toast({
        title: t.auth.error,
        description: err.message,
        variant: "destructive",
      });
      setStockPopup((p) => (p ? { ...p, saving: false } : null));
    }
  };

  const handleAddMediaUrl = (variantIdx: number, kind: "image" | "video") => {
    const key = `${variantIdx}-${kind}`;
    const raw = mediaUrlInputs[key] || "";
    const urls = raw
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    if (urls.length === 0) return;
    const isVideo = (url: string) =>
      /\.(mp4|webm|mov|ogg|m4v)(\?|$)/i.test(url) ||
      /\/video\/upload\//i.test(url) ||
      /resource_type=video/i.test(url);
    setVariants((prev) =>
      prev.map((v, i) => {
        if (i !== variantIdx) return v;
        const cur = v.media || [];
        const newItems: MediaItem[] = urls.map((url, idx) => ({
          type: kind === "video" || isVideo(url) ? "video" : "image",
          url,
          isPrimary: cur.length === 0 && idx === 0,
        }));
        return normalizeVariantMediaState(v, [...cur, ...newItems]);
      }),
    );
    setMediaUrlInputs((prev) => ({ ...prev, [key]: "" }));
    toast({
      title:
        language === "ar"
          ? `تمت الإضافة (${urls.length})`
          : `Added ${urls.length} URL(s)`,
    });
  };

  const handleRemoveMedia = (variantIdx: number, mediaIdx: number) => {
    const variant = variants[variantIdx];
    const item = variant.media[mediaIdx];
    if (!item) return;

    const isUsedElsewhere = variants.some((candidate, candidateIdx) =>
      candidate.media.some(
        (mediaItem, candidateMediaIdx) =>
          mediaItem.url === item.url &&
          !(candidateIdx === variantIdx && candidateMediaIdx === mediaIdx),
      ),
    );
    if (!isUsedElsewhere) deleteCloudinaryImage(item.url);

    const newMedia = variant.media.filter((_, i) => i !== mediaIdx);
    const normalized = normalizeVariantMediaState(variant, newMedia);
    updateVariant(variantIdx, {
      media: normalized.media,
      mainImage: normalized.mainImage,
      images: normalized.images,
    });
  };

  const handleSetPrimary = (variantIdx: number, mediaIdx: number) => {
    const variant = variants[variantIdx];
    const newMedia = variant.media.map((item, i) => ({
      ...item,
      isPrimary: i === mediaIdx,
    }));
    const normalized = normalizeVariantMediaState(variant, newMedia);
    updateVariant(variantIdx, {
      media: normalized.media,
      mainImage: normalized.mainImage,
      images: normalized.images,
    });
  };

  // New sizes start with 1 unit of stock (not 0) so they're immediately
  // sellable on the site/POS the moment the product is saved — a size
  // sitting at 0 stock renders disabled/struck-through everywhere, which
  // was why a newly added size seemed to "not exist" anywhere to sell.
  // The qty field is also focused+selected right after adding so the
  // admin sees exactly where to correct the number if 1 isn't right.
  const focusNewSizeQtyInput = (variantIdx: number, sizeName: string) => {
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(
        `[data-testid="input-variant-${variantIdx}-qty-${sizeName}"]`,
      );
      if (el) {
        el.focus();
        el.select();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
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
      sizeRows: [...v.sizeRows, { size: name, qty: 1 }],
      newSizeName: "",
    });
    focusNewSizeQtyInput(idx, name);
  };

  // Adds a size straight from a suggestion chip (S/M/L.../36-37-38... hint
  // row), skipping the text field entirely. Same dedupe guard as manual add.
  const quickAddSizeToVariant = (idx: number, sizeName: string) => {
    const v = variants[idx];
    const name = sizeName.trim().toUpperCase();
    if (!name || v.sizeRows.some((r) => r.size === name)) return;
    updateVariant(idx, {
      sizeRows: [...v.sizeRows, { size: name, qty: 1 }],
    });
    toast({
      title:
        language === "ar"
          ? `تمت إضافة المقاس ${name} بمخزون 1`
          : `Added size ${name} with 1 in stock`,
      description:
        language === "ar"
          ? "عدّل الكمية إذا أردت رقماً مختلفاً، ثم احفظ المنتج"
          : "Adjust the quantity if you want a different number, then save the product",
    });
    focusNewSizeQtyInput(idx, name);
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

  // ── AI Photo Generation ──────────────────────────────────────────────────
  // Keys of "variantIdx-mediaIdx" (or "variantIdx-new") currently generating,
  // so multiple thumbnails can show independent spinners.
  const [generatingPhotoKeys, setGeneratingPhotoKeys] = useState<Set<string>>(new Set());

  const setPhotoGenerating = (key: string, on: boolean) => {
    setGeneratingPhotoKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  /**
   * Generates BOTH AI campaign photos (a model-worn shot and a clean
   * product-only shot) from `sourceUrl` (an existing photo of this exact
   * product), and makes the model-worn shot the new MAIN photo — the clean
   * product shot is added as a side photo. Footwear automatically gets a
   * legs-only model crop; everything else gets a faceless worn shot. The
   * source photo itself is never deleted. Shows a toast on any failure.
   */
  const generateAiPhotosForVariant = async (
    variantIdx: number,
    sourceUrl: string,
    key: string,
  ): Promise<void> => {
    setPhotoGenerating(key, true);
    const isFootwear = Number(formData.categoryId) === SHOES_CATEGORY_ID;

    const callGen = async (shotType: "model" | "product"): Promise<string | null> => {
      try {
        const res = await fetch("/api/admin/ai-generate-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: sourceUrl, shotType, isFootwear }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (json.noKey) {
            throw new Error(
              language === "ar"
                ? "مفتاح Gemini API غير مضبوط. أضف GEMINI_API_KEY في الأسرار."
                : "Gemini API key not configured. Add GEMINI_API_KEY in Secrets.",
            );
          }
          throw new Error(json.message || "AI photo generation failed");
        }
        return json.url as string;
      } catch (err: any) {
        toast({
          title: language === "ar" ? "فشل توليد الصورة" : "Photo generation failed",
          description: err.message || "Unknown error",
          variant: "destructive",
        });
        return null;
      }
    };

    try {
      const [modelUrl, productUrl] = await Promise.all([
        callGen("model"),
        callGen("product"),
      ]);
      if (!modelUrl && !productUrl) return;

      setVariants((prev) => {
        const variant = prev[variantIdx];
        if (!variant) return prev;
        const hasSource = variant.media.some((m) => m.url === sourceUrl);
        const baseMedia = hasSource
          ? variant.media
          : [...variant.media, { type: "image" as const, url: sourceUrl }];
        const additions: MediaItem[] = [];
        if (productUrl) additions.push({ type: "image", url: productUrl });
        // Model shot added last and marked primary so it becomes the main photo.
        if (modelUrl) additions.push({ type: "image", url: modelUrl });
        const primaryUrl = modelUrl || productUrl;
        const newMedia = [...baseMedia, ...additions].map((m) => ({
          ...m,
          isPrimary: m.url === primaryUrl,
        }));
        const normalized = normalizeVariantMediaState(variant, newMedia);
        return prev.map((v, i) =>
          i === variantIdx
            ? { ...v, media: normalized.media, mainImage: normalized.mainImage, images: normalized.images }
            : v,
        );
      });
    } finally {
      setPhotoGenerating(key, false);
    }
  };

  /**
   * Same idea as generateAiPhotosForVariant, but runs across every selected
   * product in the list instead of the single product currently open in the
   * edit dialog — and for EVERY color variant of each product, not just the
   * first. For each color it uses that color's main photo as the source,
   * generates a model-worn shot + a clean product shot, adds them to that
   * color's media (model shot becomes the new main photo for that color),
   * then saves the product once all its colors are processed. Runs
   * sequentially (not in parallel) so it doesn't hammer the AI API or the
   * server when many products/colors are selected, and can be cancelled
   * mid-run.
   */
  /**
   * Downloads only the main product photo for every color variant of the
   * selected products. The server exports clean, unwatermarked JPEG files
   * directly at the root of a single ZIP (no product/color subfolders).
   */
  const handleDownloadMainPhotos = async (ids: number[]) => {
    if (ids.length === 0) return;
    const single = ids.length === 1 ? ids[0] : null;
    if (single !== null) {
      setDownloadingPhotoIds((prev) => new Set(prev).add(single));
    } else {
      setBulkPhotoDownloading(true);
    }
    try {
      const res = await fetch("/api/admin/products/main-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        single !== null
          ? `lucerne-product-${single}-main-photos.zip`
          : `lucerne-${ids.length}-products-main-photos.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const included = res.headers.get("X-Photos-Included");
      toast({
        title:
          language === "ar"
            ? `تم تحميل ${included || ""} صورة رئيسية بدون علامة مائية`
            : `Downloaded ${included || ""} main photo(s) without watermark`,
      });
    } catch (err: any) {
      toast({
        title: language === "ar" ? "فشل التحميل" : "Download failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      if (single !== null) {
        setDownloadingPhotoIds((prev) => {
          const next = new Set(prev);
          next.delete(single);
          return next;
        });
      } else {
        setBulkPhotoDownloading(false);
      }
    }
  };

  /**
   * Bulk AI autofill for EXISTING products: for every selected product, the
   * AI looks at its photos (each color variant's main photo, or the product's
   * main photo) and regenerates the chosen fields — name, description, and/or
   * colors — then saves the product. Runs one product at a time and can be
   * cancelled mid-run. Reuses the same /api/admin/ai-generate endpoint as the
   * single-product AI Autofill.
   */
  const handleBulkAiAutofill = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !products) return;
    if (!autofillFields.name && !autofillFields.description && !autofillFields.colors) {
      toast({
        title:
          language === "ar"
            ? "اختر حقلاً واحداً على الأقل"
            : "Select at least one field",
        variant: "destructive",
      });
      return;
    }

    autofillCancelRef.current = false;
    setAutofillRunning(true);
    setAutofillProgress({ done: 0, total: ids.length, failed: 0, currentName: "" });

    for (const id of ids) {
      if (autofillCancelRef.current) break;
      const product = products.find((p) => p.id === id);
      if (!product) {
        setAutofillProgress((prev) => ({ ...prev, done: prev.done + 1, failed: prev.failed + 1 }));
        continue;
      }
      setAutofillProgress((prev) => ({ ...prev, currentName: product.name }));

      try {
        const cvs = ((product as any).colorVariants as ColorVariant[]) || [];
        const hasVariants = cvs.length > 0;
        const imageUrls = hasVariants
          ? cvs.map((v) => v.mainImage || (product as any).mainImage).filter(Boolean)
          : [(product as any).mainImage].filter(Boolean);
        if (imageUrls.length === 0) throw new Error("No photos on product");

        const res = await fetch("/api/admin/ai-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            imageUrls,
            isMultiColor: hasVariants && cvs.length > 1,
            variantNames: hasVariants ? cvs.map((v) => v.name) : undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message || `AI failed (${res.status})`);
        const results: any[] = json.results || [];
        const okResults = results.filter((r) => r.success && r.data);
        if (okResults.length === 0) {
          throw new Error(results[0]?.error || "AI returned no data");
        }
        const first = okResults[0].data;

        const updates: any = { id };
        if (autofillFields.name && first.name) {
          updates.name = String(first.name).trim();
        }
        if (autofillFields.description && first.description) {
          updates.description = String(first.description).trim();
        }
        if (autofillFields.colors) {
          if (hasVariants) {
            // Update each variant's color name + hex from its own image's
            // AI result (results come back in the same order as imageUrls).
            const updatedCv = cvs.map((v, i) => {
              const r = results[i];
              if (!r?.success || !r.data) return v;
              const colorName = r.data.colorNames?.[0];
              const colorCode = r.data.colors?.[0];
              return {
                ...v,
                ...(colorName ? { name: String(colorName).trim() } : {}),
                ...(colorCode ? { colorCode: String(colorCode).trim() } : {}),
              };
            });
            updates.colorVariants = updatedCv;
            updates.colors = updatedCv.map((v) => v.name);
          } else if (Array.isArray(first.colorNames) && first.colorNames.length) {
            updates.colors = first.colorNames.map((c: any) => String(c).trim());
          }
        }

        await updateProduct.mutateAsync(updates);
        setAutofillProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      } catch (err: any) {
        console.error("[bulk-autofill] product", id, err);
        setAutofillProgress((prev) => ({
          ...prev,
          done: prev.done + 1,
          failed: prev.failed + 1,
        }));
      }
    }

    setAutofillRunning(false);
    import("@/lib/queryClient").then(({ queryClient }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    });
  };

  const handleBulkGenerateAiPhotos = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !products) return;
    if (bulkAiPhotoShotTypes.size === 0) return;

    // One unit of work per color variant (a legacy product with no
    // colorVariants array still counts as one unit).
    const totalUnits = ids.reduce((sum, id) => {
      const product = products.find((p) => p.id === id);
      const cvs = ((product as any)?.colorVariants as any[]) || [];
      return sum + Math.max(cvs.length, 1);
    }, 0);

    bulkAiPhotoCancelRef.current = false;
    setBulkAiPhotoRunning(true);
    setBulkAiPhotoProgress({ done: 0, total: totalUnits, failed: 0, currentName: "" });

    const callGen = async (
      imageUrl: string,
      shotType: "model" | "product",
      isFootwear: boolean,
    ): Promise<string | null> => {
      try {
        const res = await fetch("/api/admin/ai-generate-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl, shotType, isFootwear }),
        });
        const json = await res.json();
        if (!res.ok) return null;
        return (json.url as string) || null;
      } catch {
        return null;
      }
    };

    const processVariant = async (variant: any, isFootwear: boolean): Promise<any> => {
      const sourceUrl: string | undefined = variant?.mainImage || undefined;
      if (!sourceUrl) throw new Error("no source image");

      const wantModel = bulkAiPhotoShotTypes.has("model");
      const wantProduct = bulkAiPhotoShotTypes.has("product");
      const [modelUrl, productUrl] = await Promise.all([
        wantModel ? callGen(sourceUrl, "model", isFootwear) : Promise.resolve(null),
        wantProduct ? callGen(sourceUrl, "product", isFootwear) : Promise.resolve(null),
      ]);
      if (!modelUrl && !productUrl) throw new Error("generation failed");

      const existingMedia: MediaItem[] =
        variant.media && Array.isArray(variant.media) && variant.media.length > 0
          ? variant.media
          : [
              ...(variant.mainImage
                ? [{ type: "image" as const, url: variant.mainImage, isPrimary: true }]
                : []),
              ...((variant.images as string[]) || []).map((url: string) => ({
                type: "image" as const,
                url,
              })),
            ];
      const hasSource = existingMedia.some((m) => m.url === sourceUrl);
      const baseMedia = hasSource
        ? existingMedia
        : [...existingMedia, { type: "image" as const, url: sourceUrl }];
      const additions: MediaItem[] = [];
      if (productUrl) additions.push({ type: "image", url: productUrl });
      if (modelUrl) additions.push({ type: "image", url: modelUrl });
      const primaryUrl = modelUrl || productUrl;
      const newMedia = [...baseMedia, ...additions].map((m) => ({
        ...m,
        isPrimary: m.url === primaryUrl,
      }));
      const normalized = normalizeVariantMediaState(
        { ...variant, sizeRows: [], newSizeName: "", colorTags: variant.colorTags || [] } as any,
        newMedia,
      );
      return { ...variant, media: normalized.media, mainImage: normalized.mainImage, images: normalized.images };
    };

    let failed = 0;
    productLoop: for (let i = 0; i < ids.length; i++) {
      if (bulkAiPhotoCancelRef.current) break;
      const id = ids[i];
      const product = products.find((p) => p.id === id);
      const colorVariants = ((product as any)?.colorVariants as any[]) || [];
      const isFootwear = Number((product as any)?.categoryId) === SHOES_CATEGORY_ID;
      const hasVariants = colorVariants.length > 0;
      const variantsToProcess = hasVariants
        ? colorVariants
        : [{ name: "", mainImage: product?.mainImage, images: (product as any)?.images || [], media: [] }];

      const newColorVariants: any[] = [];
      for (let vi = 0; vi < variantsToProcess.length; vi++) {
        if (bulkAiPhotoCancelRef.current) break productLoop;
        const variant = variantsToProcess[vi];
        setBulkAiPhotoProgress((prev) => ({
          ...prev,
          currentName: [product?.name, variant.name].filter(Boolean).join(" — ") || `#${id}`,
        }));

        try {
          newColorVariants.push(await processVariant(variant, isFootwear));
        } catch {
          failed += 1;
          newColorVariants.push(variant);
        } finally {
          setBulkAiPhotoProgress((prev) => ({ ...prev, done: prev.done + 1, failed }));
        }
      }

      try {
        if (hasVariants) {
          await updateProduct.mutateAsync({
            id,
            colorVariants: newColorVariants,
            mainImage: newColorVariants[0]?.mainImage || product?.mainImage,
            images: newColorVariants[0]?.images || (product as any)?.images || [],
          } as any);
        } else {
          const v = newColorVariants[0];
          if (v) {
            await updateProduct.mutateAsync({
              id,
              mainImage: v.mainImage,
              images: v.images,
            } as any);
          }
        }
      } catch {
        // Individual variant failures are already reflected in `failed`
        // above; a failed save here means none of this product's
        // generated photos made it to the server.
      }
    }

    setBulkAiPhotoRunning(false);
    import("@/lib/queryClient").then(({ queryClient }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    });
    toast({
      title:
        language === "ar"
          ? `تم توليد الصور لـ ${totalUnits - failed} لون${failed ? ` (فشل ${failed})` : ""}`
          : `Generated photos for ${totalUnits - failed} color(s)${failed ? ` (${failed} failed)` : ""}`,
    });
  };


  const [aiAutofilling, setAiAutofilling] = useState(false);
  const [aiProvider, setAiProvider] = useState<"gemini" | "ollama">(() => {
    return (localStorage.getItem("admin_ai_provider") as "gemini" | "ollama") || "gemini";
  });

  const switchAiProvider = (p: "gemini" | "ollama") => {
    setAiProvider(p);
    localStorage.setItem("admin_ai_provider", p);
  };

  const handleAiAutofill = async () => {
    const isMultiColor = variants.length > 1;

    // Helper: get the primary image URL for a variant
    const getVariantImage = (v: VariantState): string | undefined =>
      v.mainImage ||
      v.images[0] ||
      v.media.find((m) => m.type === "image")?.url;

    // Collect images — one per variant for multi-color, first available for single
    const variantImages: { variantIdx: number; url: string }[] = [];
    if (isMultiColor) {
      for (let i = 0; i < variants.length; i++) {
        const url = getVariantImage(variants[i]);
        if (url) variantImages.push({ variantIdx: i, url });
      }
    } else {
      const url = getVariantImage(variants[0] ?? ({} as VariantState)) ||
        variants.flatMap((v) => v.media).find((m) => m.type === "image")?.url;
      if (url) variantImages.push({ variantIdx: 0, url });
    }

    if (variantImages.length === 0) {
      toast({
        title: language === "ar"
          ? "يرجى إضافة صورة للمنتج أولاً"
          : "Please add a product image first",
        variant: "destructive",
      });
      return;
    }

    setAiAutofilling(true);
    try {
      const imageUrls = variantImages.map((vi) => vi.url);
      let results: { success: boolean; data?: any; error?: string }[] = [];

      // Collect the variant color names so the server can extract Arabic color
      // words from the INPUT names (rather than guessing from AI output).
      const variantNames = variantImages.map(
        (vi) => variants[vi.variantIdx]?.name || ""
      );

      if (aiProvider === "gemini") {
        const res = await fetch("/api/admin/ai-generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrls, isMultiColor, variantNames }),
        });
        const json = await res.json();
        if (!res.ok) {
          if (json.noKey) {
            throw new Error(
              language === "ar"
                ? "مفتاح Gemini API غير مضبوط. أضف GEMINI_API_KEY في الأسرار أو بدّل إلى Ollama."
                : "Gemini API key not configured. Add GEMINI_API_KEY in Secrets or switch to Ollama.",
            );
          }
          throw new Error(json.message || "AI generation failed");
        }
        results = json.results || [];
      } else {
        const config = getOllamaConfig();
        results = await generateWithOllama(imageUrls, config.model, isMultiColor);
      }

      const firstSuccess = results.find((r) => r.success);
      if (!firstSuccess?.data) {
        throw new Error(results[0]?.error || "AI generation failed");
      }
      const firstData = firstSuccess.data;

      // Server already stripped color words from names and injected the color
      // list into descriptions (after word 12) for multi-color groups.
      const description: string =
        firstData.description || firstData.descriptionAr || firstData.description_ar || "";

      setFormData((f: any) => ({
        ...f,
        name: firstData.name || firstData.nameAr || firstData.name_ar || f.name,
        description,
        price: firstData.suggestedPrice ? String(firstData.suggestedPrice) : f.price,
      }));

      // Update each variant's color from its corresponding AI result
      setVariants((vs) =>
        vs.map((v, i) => {
          const imgEntry = variantImages.find((vi) => vi.variantIdx === i);
          if (!imgEntry) return v;
          const resultIdx = variantImages.indexOf(imgEntry);
          const result = results[resultIdx];
          if (!result?.success || !result.data?.colors?.[0]) return v;
          return {
            ...v,
            colorCode: result.data.colors[0],
            name: result.data.colorNames?.[0] || v.name,
          };
        }),
      );

      toast({
        title: language === "ar" ? "تم ملء البيانات بالذكاء الاصطناعي" : "AI autofill complete",
        description: language === "ar" ? "راجع البيانات وعدّلها حسب الحاجة" : "Review and adjust the data as needed",
      });

      // ── Generate the AI campaign photos for each variant ─────────────────
      // The image the admin uploaded is kept as a side photo. Two new photos
      // are generated per variant — a model-worn shot (new main photo) and a
      // clean product-only shot (added as a side photo). Only Gemini can
      // generate photos, so this step is skipped when Ollama (text-only,
      // local) is the active provider.
      if (aiProvider === "gemini") {
        toast({
          title: language === "ar" ? "جاري توليد صور المنتج..." : "Generating product photos...",
          description: language === "ar"
            ? "سيتم إنشاء صورة بموديل وصورة منتج نظيفة لكل لون"
            : "Creating a model-worn photo and a clean product photo for each color",
        });
        // Each variant already fires 2 parallel Gemini calls (model + product),
        // so process variants one at a time to stay within free-tier limits.
        for (const vi of variantImages) {
          await generateAiPhotosForVariant(vi.variantIdx, vi.url, `${vi.variantIdx}-autofill`);
        }
        toast({
          title: language === "ar" ? "تم توليد صور المنتج" : "Product photos generated",
          description: language === "ar"
            ? "الصورة بالموديل أصبحت الرئيسية، وصورك الأصلية والمنتج النظيف محفوظة كصور جانبية"
            : "The model-worn photo is now main — your original and the clean product shot are kept as side photos",
        });
      }
    } catch (err: any) {
      toast({
        title: language === "ar" ? "فشل الملء التلقائي" : "Autofill failed",
        description: err.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAiAutofilling(false);
    }
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
    // Tracks every barcode used anywhere in THIS product (main + each color)
    // so two colors — or a color and the main barcode — can't accidentally
    // share one, and reports which label already claimed it.
    const usedBarcodes = new Map<string, string>();
    if (formData.barcode && formData.barcode.trim()) {
      const mainLabel = language === "ar" ? "الباركود الرئيسي" : "the main barcode";
      usedBarcodes.set(formData.barcode.trim().toLowerCase(), mainLabel);
      const conflict = findBarcodeConflict(formData.barcode, products, editingId);
      if (conflict) {
        toast({
          title: t.auth.error,
          description:
            language === "ar"
              ? `هذا الباركود مستخدم بالفعل في "${conflict.productName}"${conflict.colorName ? ` (${conflict.colorName})` : ""}`
              : `This barcode is already used on "${conflict.productName}"${conflict.colorName ? ` (${conflict.colorName})` : ""}`,
          variant: "destructive",
        });
        return;
      }
    }
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
      const hasMedia = (v.media && v.media.length > 0) || v.mainImage;
      if (!hasMedia) {
        toast({
          title: t.auth.error,
          description: `${v.name}: ${t.admin.variantMainImage} required`,
          variant: "destructive",
        });
        return;
      }
      if (v.barcode && v.barcode.trim()) {
        const code = v.barcode.trim().toLowerCase();
        const takenBy = usedBarcodes.get(code);
        if (takenBy) {
          toast({
            title: t.auth.error,
            description:
              language === "ar"
                ? `باركود اللون "${v.name}" مستخدم بالفعل مع ${takenBy}`
                : `${v.name}'s barcode is already used by ${takenBy}`,
            variant: "destructive",
          });
          return;
        }
        usedBarcodes.set(code, v.name);
        const conflict = findBarcodeConflict(v.barcode, products, editingId);
        if (conflict) {
          toast({
            title: t.auth.error,
            description:
              language === "ar"
                ? `باركود اللون "${v.name}" مستخدم بالفعل في "${conflict.productName}"${conflict.colorName ? ` (${conflict.colorName})` : ""}`
                : `${v.name}'s barcode is already used on "${conflict.productName}"${conflict.colorName ? ` (${conflict.colorName})` : ""}`,
            variant: "destructive",
          });
          return;
        }
      }
    }

    try {
      const colorVariantsData: ColorVariant[] = variants.map((v) => {
        const sizeInventory: Record<string, number> = {};
        v.sizeRows.forEach((r) => {
          sizeInventory[r.size] = r.qty;
        });

        const fallbackMedia: MediaItem[] = [
          ...(v.mainImage
            ? [{ type: "image" as const, url: v.mainImage, isPrimary: true }]
            : []),
          ...v.images.map((url) => ({ type: "image" as const, url })),
        ];
        const normalizedVariant = normalizeVariantMediaState(
          v,
          v.media.length > 0 ? v.media : fallbackMedia,
        );

        return {
          name: v.name.trim(),
          colorCode: v.colorCode,
          mainImage: normalizedVariant.mainImage,
          images: normalizedVariant.images,
          sizes: v.sizeRows.map((r) => r.size),
          sizeInventory,
          colorTags: v.colorTags,
          barcode: v.barcode && v.barcode.trim() ? v.barcode.trim() : undefined,
          media: normalizedVariant.media,
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

      // IMPORTANT: finalVideoUrl must come ONLY from variant #0's live media
      // list, never from formData.videoUrl. formData.videoUrl is a snapshot
      // taken once when the edit dialog opened (see openEdit) and never
      // updated afterwards — if the admin deletes the video from variant #0
      // in the editor, formData.videoUrl still holds the old URL, and
      // falling back to it here would silently resave the "deleted" video
      // right back onto the product every time.
      const firstVariantMedia = colorVariantsData[0]?.media || [];
      const videoFromMedia = firstVariantMedia.find((m) => m.type === "video");
      const finalVideoUrl = videoFromMedia?.url || null;
      const fallbackPoster = videoFromMedia?.poster || getVideoPosterUrl(finalVideoUrl || undefined) || "";
      const categoryIdValue = formData.categoryId === "" || formData.categoryId == null
        ? null
        : Number(formData.categoryId);

      const payload = {
        ...formData,
        videoUrl: finalVideoUrl,
        categoryId: categoryIdValue,
        mainImage: colorVariantsData[0].mainImage || fallbackPoster || "",
        images: colorVariantsData[0].images,
        sizes: allSizes,
        colors: allColors,
        sizeInventory: mergedSizeInventory,
        colorVariants: colorVariantsData,
        stockQuantity: totalStock,
        costPrice: formData.costPrice ? formData.costPrice : null,
        discountPrice: formData.discountPrice ? formData.discountPrice : null,
        subcategoryId:
          formData.subcategoryIds && formData.subcategoryIds.length > 0
            ? Number(formData.subcategoryIds[0])
            : formData.subcategoryId
              ? Number(formData.subcategoryId)
              : null,
        subcategoryIds: Array.isArray(formData.subcategoryIds)
          ? formData.subcategoryIds
              .map((x: any) => Number(x))
              .filter((n: number) => !Number.isNaN(n))
          : [],
      };

      if (editingId) {
        // Close the dialog immediately so editing feels instant. The mutation's
        // optimistic update already reflects the change in the list; the network
        // request continues in the background and reconciles on completion.
        const editId = editingId;
        setIsDialogOpen(false);
        updateProduct.mutate(
          { id: editId, ...payload },
          {
            onSuccess: () => {
              toast({
                title: t.admin.productUpdated,
                description:
                  language === "ar"
                    ? "انقر للانتقال إلى صفحة المنتج"
                    : "Click to view the product page",
                onClick: () => navigate(`/product/${editId}`),
              });
            },
            onError: (err: any) => {
              toast({
                title: t.auth.error,
                description: err?.message || "Update failed",
                variant: "destructive",
              });
            },
          },
        );
        return;
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
        subcategoryIds: Array.isArray((p as any).subcategoryIds)
          ? (p as any).subcategoryIds
          : [],
        isFeatured: p.isFeatured,
        isNewArrival: p.isNewArrival,
        isBestSeller: (p as any).isBestSeller || false,
        brand: p.brand || "",
        mainImage: p.mainImage,
        videoUrl: (p as any).videoUrl || null,
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

  const handleBulkEdit = async () => {
    const hasAnyField =
      bulkEditFields.name.trim() ||
      bulkEditFields.nameAr.trim() ||
      bulkEditFields.price.trim() ||
      bulkEditFields.discountPrice.trim() !== "" ||
      bulkEditFields.categoryId !== "" ||
      bulkEditFields.subcategoryIds.length > 0 ||
      bulkEditFields.clearSubcategories ||
      bulkEditRegenBarcode;
    if (!hasAnyField) {
      toast({
        title:
          language === "ar"
            ? "أدخل قيمة واحدة على الأقل"
            : "Enter at least one value",
        variant: "destructive",
      });
      return;
    }
    setBulkEditApplying(true);
    try {
      const updates: Record<string, any> = {};
      if (bulkEditFields.name.trim()) updates.name = bulkEditFields.name.trim();
      if (!updates.name && bulkEditFields.nameAr.trim())
        updates.name = bulkEditFields.nameAr.trim();
      if (bulkEditFields.price.trim())
        updates.price = bulkEditFields.price.trim();
      if (bulkEditFields.discountPrice.trim() !== "")
        updates.discountPrice = bulkEditFields.discountPrice.trim() || null;
      if (bulkEditFields.categoryId !== "") updates.categoryId = bulkEditFields.categoryId;
      if (bulkEditFields.subcategoryIds.length > 0) {
        updates.subcategoryIds = bulkEditFields.subcategoryIds;
      } else if (bulkEditFields.clearSubcategories) {
        updates.subcategoryIds = [];
      }
      const res = await fetch("/api/products/bulk-edit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          updates,
          regenerateBarcode: bulkEditRegenBarcode,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
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
            ? `تم تعديل ${updated} منتج`
            : `${updated} product(s) updated`,
      });
      setIsBulkEditOpen(false);
      setBulkEditFields({ name: "", nameAr: "", price: "", discountPrice: "", categoryId: "", subcategoryIds: [], clearSubcategories: false });
      setBulkEditRegenBarcode(false);
    } catch (err: any) {
      toast({
        title: t.auth.error,
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setBulkEditApplying(false);
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
          {/* ── Category / Subcategory filter group ── */}
          <div className="flex flex-wrap items-stretch gap-2">
            <Select
              value={
                showUncategorized
                  ? "none"
                  : categoryFilter === ""
                    ? "all"
                    : String(categoryFilter)
              }
              onValueChange={(v) => {
                if (v === "none") {
                  setShowUncategorized(true);
                  setCategoryFilter("");
                  setSubcategoryFilter("");
                  setShowNoSubcategory(false);
                  return;
                }
                setShowUncategorized(false);
                setShowNoSubcategory(false);
                setCategoryFilter(v === "all" ? "" : Number(v));
                setSubcategoryFilter("");
              }}
            >
              <SelectTrigger
                className="w-full sm:w-52 rounded-full border-border bg-background shadow-sm hover:border-foreground/40 [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                data-testid="select-category-filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <CategoryIconBadge icon={Tag} color="text-foreground bg-muted" />
                    {language === "ar"
                      ? `كل الفئات (${products?.length ?? 0})`
                      : `All Categories (${products?.length ?? 0})`}
                  </span>
                </SelectItem>
                {categories?.map((cat) => {
                  const count =
                    products?.filter((p) => p.categoryId === cat.id).length ?? 0;
                  const label =
                    language === "ar" ? cat.nameAr || cat.name : cat.name;
                  const { emoji, color } = getCategoryVisual(cat.name, cat.nameAr ?? undefined);
                  return (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      <span className="flex items-center gap-2">
                        <CategoryIconBadge emoji={emoji} color={color} />
                        {label} ({count})
                      </span>
                    </SelectItem>
                  );
                })}
                <SelectSeparator />
                <SelectItem value="none" data-testid="select-item-uncategorized">
                  <span className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                    <CategoryIconBadge
                      icon={PackageX}
                      color="text-amber-600 bg-amber-50 dark:bg-amber-950/30"
                    />
                    {language === "ar"
                      ? `بدون فئة (${uncategorizedCount})`
                      : `Uncategorized (${uncategorizedCount})`}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {/* Subcategory filter — shows only subs of the selected category (or all if none) */}
            <Select
              value={
                showNoSubcategory
                  ? "none"
                  : subcategoryFilter === ""
                    ? "all"
                    : String(subcategoryFilter)
              }
              onValueChange={(v) => {
                setShowUncategorized(false);
                if (v === "none") {
                  setShowNoSubcategory(true);
                  setSubcategoryFilter("");
                  return;
                }
                setShowNoSubcategory(false);
                setSubcategoryFilter(v === "all" ? "" : Number(v));
              }}
              disabled={showUncategorized}
            >
              <SelectTrigger
                className="w-full sm:w-52 rounded-full border-border bg-background shadow-sm hover:border-foreground/40 [&>span]:flex [&>span]:items-center [&>span]:gap-2"
                data-testid="select-subcategory-filter"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">
                    <CategoryIconBadge icon={Layers} color="text-foreground bg-muted" />
                    {language === "ar" ? "كل التصنيفات الفرعية" : "All Subcategories"}
                  </span>
                </SelectItem>
                {(subcategoriesData || [])
                  .filter((s: any) => categoryFilter === "" || s.categoryId === categoryFilter)
                  .map((s: any) => {
                    const count =
                      products?.filter((p) => getProductSubcategoryIds(p).has(s.id)).length ?? 0;
                    const label = language === "ar" ? (s.nameAr || s.name) : s.name;
                    const parentCat = categories?.find((c) => c.id === s.categoryId);
                    const { emoji, color } = getCategoryVisual(
                      parentCat?.name ?? s.name,
                      parentCat?.nameAr ?? s.nameAr ?? undefined,
                    );
                    return (
                      <SelectItem key={s.id} value={String(s.id)}>
                        <span className="flex items-center gap-2">
                          <CategoryIconBadge emoji={emoji} color={color} />
                          {label} ({count})
                        </span>
                      </SelectItem>
                    );
                  })}
                <SelectSeparator />
                <SelectItem value="none" data-testid="select-item-no-subcategory">
                  <span className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                    <CategoryIconBadge
                      icon={FolderX}
                      color="text-amber-600 bg-amber-50 dark:bg-amber-950/30"
                    />
                    {language === "ar"
                      ? `بدون تصنيف فرعي (${noSubcategoryCount})`
                      : `No Subcategory (${noSubcategoryCount})`}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="flex items-center gap-1.5 h-10 px-3 text-xs font-medium text-muted-foreground border border-transparent hover:text-foreground hover:border-border hover:bg-background rounded-full transition-colors flex-shrink-0"
                title={language === "ar" ? "مسح كل الفلاتر" : "Clear all filters"}
                data-testid="button-clear-filters"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {language === "ar" ? "مسح الفلاتر" : "Clear filters"}
                </span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setShowLowStock((v) => {
                  const next = !v;
                  if (next) {
                    // Low-stock mode has its own compact category/subcategory filters.
                    setCategoryFilter("");
                    setSubcategoryFilter("");
                    setShowUncategorized(false);
                    setShowNoSubcategory(false);
                  }
                  return next;
                });
                setLowStockCategoryFilter("");
                setLowStockSubcategoryFilter("");
                setSelectedLowStockIds(new Set());
              }}
              className={`flex items-center gap-1.5 h-10 px-3 text-xs font-semibold border transition-all rounded-md shadow-sm ${showLowStock ? "bg-amber-500 text-white border-amber-500 shadow-md" : "bg-background text-amber-600 border-amber-400/70 hover:bg-amber-50 hover:border-amber-500 dark:hover:bg-amber-950/30"}`}
              data-testid="button-low-stock-filter"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              {language === "ar" ? "مخزون منخفض" : "Low Stock"}
              {(products?.filter((p) => p.stockQuantity <= LOW_STOCK_MAX)
                .length ?? 0) > 0 && (
                <span
                  className={`rounded-full text-[10px] font-bold px-1.5 py-0.5 ${showLowStock ? "bg-white text-amber-600" : "bg-amber-500 text-white"}`}
                >
                  {
                    products?.filter(
                      (p) => p.stockQuantity <= LOW_STOCK_MAX,
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
            <button
              onClick={() => setViewMode(viewMode === "bulk-upload" ? "table" : "bulk-upload")}
              className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-md border text-sm font-medium transition-all shadow-sm ${viewMode === "bulk-upload" ? "bg-gradient-to-r from-violet-600 to-primary text-white border-transparent shadow-md" : "border-input bg-background text-muted-foreground hover:text-foreground hover:border-primary/50"}`}
              data-testid="button-view-bulk-upload"
              title={language === "ar" ? "رفع جماعي" : "Bulk upload"}
            >
              <CloudUpload className="w-4 h-4" />
              <span className="hidden sm:inline">{language === "ar" ? "رفع جماعي" : "Bulk Upload"}</span>
            </button>
            <Button
              onClick={() => setShowBarcodePreview(true)}
              variant="outline"
              className="gap-2 shadow-sm"
              data-testid="button-print-barcodes"
            >
              <Printer className="w-4 h-4" />
              {language === "ar" ? "طباعة الباركود" : "Print Barcodes"}
            </Button>
            <a
              href="/api/admin/products/export"
              download
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              data-testid="link-export-products"
            >
              <Download className="w-4 h-4" />
              {language === "ar" ? "تصدير Excel" : "Export Excel"}
            </a>
            <a
              href="/api/admin/products/export-sql"
              download
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              data-testid="link-export-sql"
            >
              <FileText className="w-4 h-4" />
              {language === "ar" ? "تصدير SQL" : "Export SQL"}
            </a>
            <Button
              onClick={() => setIsSizeAuditOpen(true)}
              variant="outline"
              className={`gap-2 shadow-sm ${shoeSizeAuditResults.length > 0 ? "border-amber-400 text-amber-700 dark:text-amber-400" : ""}`}
              data-testid="button-size-audit"
            >
              <AlertCircle className="w-4 h-4" />
              {language === "ar" ? "فحص مقاسات الأحذية" : "Audit Shoe Sizes"}
              {shoeSizeAuditResults.length > 0 && (
                <span className="ms-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-amber-500 text-white text-xs font-semibold">
                  {shoeSizeAuditResults.length}
                </span>
              )}
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
          {(categoryFilter !== "" || subcategoryFilter !== "" || showUncategorized || showNoSubcategory || search) && (
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
          className="mb-6 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 rounded-lg overflow-hidden shadow-sm"
          data-testid="panel-low-stock"
        >
          <div className="flex flex-wrap items-center gap-3 px-4 sm:px-5 py-3 bg-amber-500 text-white">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-widest truncate">
                {language === "ar" ? "منتجات المخزون المنخفض" : "Low Stock Products"}
              </span>
            </div>
            <div className="ms-auto flex items-center gap-2 text-[11px] font-medium">
              <span className="rounded-full bg-white/15 px-2.5 py-1 tabular-nums">
                {language === "ar"
                  ? `${allLowStockProducts.length} منتج`
                  : `${allLowStockProducts.length} products`}
              </span>
              <span className="rounded-full bg-white/15 px-2.5 py-1 tabular-nums">
                {language === "ar"
                  ? `${LOW_STOCK_MAX} قطع أو أقل`
                  : `${LOW_STOCK_MAX} units or fewer`}
              </span>
            </div>
          </div>

          <div className="px-3 sm:px-5 py-4 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
              <div className="min-w-0">
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {language === "ar"
                    ? `يعرض الآن ${lowStockProducts.length}${lowStockProducts.length !== allLowStockProducts.length ? ` من أصل ${allLowStockProducts.length}` : ""} منتج. يمكنك مشاهدة الصور وتعديل الفئة والتصنيف الفرعي مباشرة من الجدول.`
                    : `Showing ${lowStockProducts.length}${lowStockProducts.length !== allLowStockProducts.length ? ` of ${allLowStockProducts.length}` : ""} products. View photos and edit category/subcategory directly from the table.`}
                </p>
              </div>
              <div className="lg:ms-auto flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  <PackageX className="w-3 h-3" />
                  {language === "ar"
                    ? `نفد: ${allLowStockProducts.filter((p) => p.stockQuantity === 0).length}`
                    : `Out: ${allLowStockProducts.filter((p) => p.stockQuantity === 0).length}`}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-background dark:text-amber-300">
                  <Package className="w-3 h-3" />
                  {language === "ar"
                    ? `1–2 قطعة: ${allLowStockProducts.filter((p) => p.stockQuantity > 0).length}`
                    : `1–2 units: ${allLowStockProducts.filter((p) => p.stockQuantity > 0).length}`}
                </span>
              </div>
            </div>

            {/* Compact low-stock-only filters. */}
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200/80 dark:border-amber-800 bg-white/70 dark:bg-background/60 p-2">
              <Select
                value={lowStockCategoryFilter === "" ? "all" : String(lowStockCategoryFilter)}
                onValueChange={(value) => {
                  setLowStockCategoryFilter(value === "all" ? "" : Number(value));
                  setLowStockSubcategoryFilter("");
                  setSelectedLowStockIds(new Set());
                }}
              >
                <SelectTrigger
                  className="h-8 w-[145px] sm:w-[180px] rounded-md border-amber-300 bg-background text-xs shadow-none"
                  data-testid="select-low-stock-category"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {language === "ar"
                      ? `كل الفئات (${allLowStockProducts.length})`
                      : `All categories (${allLowStockProducts.length})`}
                  </SelectItem>
                  {lowStockCategories.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {(language === "ar" ? cat.nameAr || cat.name : cat.name)} ({cat.lowStockCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={lowStockSubcategoryFilter === "" ? "all" : String(lowStockSubcategoryFilter)}
                onValueChange={(value) => {
                  setLowStockSubcategoryFilter(value === "all" ? "" : Number(value));
                  setSelectedLowStockIds(new Set());
                }}
              >
                <SelectTrigger
                  className="h-8 w-[160px] sm:w-[200px] rounded-md border-amber-300 bg-background text-xs shadow-none"
                  data-testid="select-low-stock-subcategory"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {language === "ar" ? "كل التصنيفات الفرعية" : "All subcategories"}
                  </SelectItem>
                  {lowStockSubcategories.map((sub: any) => (
                    <SelectItem key={sub.id} value={String(sub.id)}>
                      {(language === "ar" ? sub.nameAr || sub.name : sub.name)} ({sub.lowStockCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(lowStockCategoryFilter !== "" || lowStockSubcategoryFilter !== "") && (
                <button
                  type="button"
                  onClick={() => {
                    setLowStockCategoryFilter("");
                    setLowStockSubcategoryFilter("");
                    setSelectedLowStockIds(new Set());
                  }}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md text-[11px] font-medium text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/30"
                  data-testid="button-clear-low-stock-filters"
                >
                  <FilterX className="w-3 h-3" />
                  {language === "ar" ? "مسح الفلتر" : "Clear"}
                </button>
              )}

              <div className="w-px h-5 bg-amber-200 dark:bg-amber-800 hidden sm:block" />

              <Button
                type="button"
                size="sm"
                disabled={lowStockProducts.length === 0}
                onClick={() => {
                  setShowDiscountDialog(true);
                  setSelectedLowStockIds(new Set());
                }}
                className="bg-amber-500 hover:bg-amber-600 text-white border-0 gap-1.5 h-8 px-3 text-xs rounded shadow-none"
                data-testid="button-apply-low-stock-discount"
              >
                <Tag className="w-3.5 h-3.5" />
                {language === "ar"
                  ? `خصم على الكل (${lowStockProducts.length})`
                  : `Discount All (${lowStockProducts.length})`}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!lowStockProducts.some((p) => p.discountPrice)}
                onClick={() => handleRemoveDiscount(lowStockProducts.map((p) => p.id))}
                className="text-xs h-8 px-3 rounded border-amber-300 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/20 gap-1.5"
                data-testid="button-remove-low-stock-discount"
              >
                <X className="w-3.5 h-3.5" />
                {language === "ar" ? "إزالة الخصم/التخفيض" : "Remove Sale/Discount"}
              </Button>

              <div className="w-px h-5 bg-amber-200 dark:bg-amber-800 hidden sm:block" />

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={selectedLowStockIds.size === 0}
                onClick={() => {
                  setLowStockAddSubcategoryIds([]);
                  setShowLowStockAddSubcategoryDialog(true);
                }}
                className="text-xs h-8 px-3 rounded border-amber-300 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/20 gap-1.5 disabled:opacity-50"
                title={
                  selectedLowStockIds.size === 0
                    ? (language === "ar"
                        ? "حدد منتجات أولاً من الجدول"
                        : "Select products in the table first")
                    : undefined
                }
                data-testid="button-add-low-stock-subcategory"
              >
                <Plus className="w-3.5 h-3.5" />
                {language === "ar"
                  ? `إضافة إلى تصنيف فرعي${selectedLowStockIds.size > 0 ? ` (${selectedLowStockIds.size})` : ""}`
                  : `Add to Subcategory${selectedLowStockIds.size > 0 ? ` (${selectedLowStockIds.size})` : ""}`}
              </Button>
            </div>

            {lowStockProducts.length === 0 && (
              <div className="border border-dashed border-amber-300 dark:border-amber-800 rounded-md bg-white/60 dark:bg-background/60 px-4 py-7 text-center text-xs text-amber-700 dark:text-amber-300">
                <Package className="w-6 h-6 mx-auto mb-2 opacity-60" />
                {language === "ar"
                  ? "لا توجد منتجات مخزونها قطعتان أو أقل ضمن هذا الفلتر."
                  : "No products with 2 units or fewer match this filter."}
              </div>
            )}

            {lowStockProducts.length > 0 && (
              <div className="border border-amber-200 dark:border-amber-800 rounded-md bg-white dark:bg-background overflow-x-auto">
                <table className="w-full min-w-[1050px] text-xs">
                  <thead>
                    <tr className="border-b border-amber-200 dark:border-amber-800 bg-amber-100/60 dark:bg-amber-900/20">
                      <th className="px-3 py-2.5 text-start font-semibold text-amber-800 dark:text-amber-300 w-8">
                        <input
                          type="checkbox"
                          className="accent-amber-500"
                          checked={
                            selectedLowStockIds.size === lowStockProducts.length &&
                            lowStockProducts.length > 0
                          }
                          onChange={(e) =>
                            setSelectedLowStockIds(
                              e.target.checked
                                ? new Set(lowStockProducts.map((p) => p.id))
                                : new Set(),
                            )
                          }
                          aria-label={language === "ar" ? "تحديد الكل" : "Select all"}
                        />
                      </th>
                      <th className="px-2 py-2.5 text-start font-semibold text-amber-800 dark:text-amber-300 w-16">
                        {language === "ar" ? "الصورة" : "Photo"}
                      </th>
                      <th className="px-3 py-2.5 text-start font-semibold text-amber-800 dark:text-amber-300 min-w-[190px]">
                        {language === "ar" ? "المنتج" : "Product"}
                      </th>
                      <th className="px-3 py-2.5 text-start font-semibold text-amber-800 dark:text-amber-300 min-w-[130px]">
                        {language === "ar" ? "الفئة" : "Category"}
                      </th>
                      <th className="px-3 py-2.5 text-start font-semibold text-amber-800 dark:text-amber-300 min-w-[150px]">
                        {language === "ar" ? "التصنيف الفرعي" : "Subcategory"}
                      </th>
                      <th className="px-3 py-2.5 text-center font-semibold text-amber-800 dark:text-amber-300 w-24">
                        {language === "ar" ? "المخزون" : "Stock"}
                      </th>
                      <th className="px-3 py-2.5 text-start font-semibold text-amber-800 dark:text-amber-300 w-24">
                        {language === "ar" ? "السعر" : "Price"}
                      </th>
                      <th className="px-3 py-2.5 text-start font-semibold text-amber-800 dark:text-amber-300 w-24">
                        {language === "ar" ? "التخفيض" : "Sale"}
                      </th>
                      <th className="px-3 py-2.5 text-center font-semibold text-amber-800 dark:text-amber-300 w-28">
                        {language === "ar" ? "إجراءات" : "Actions"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockProducts.map((p) => {
                      const imgs = getProductImages(p);
                      const thumb = imgs[0];
                      const category = categories?.find((c) => c.id === p.categoryId);
                      const subcategory = subcategoriesData?.find(
                        (s: any) => s.id === (p as any).subcategoryId,
                      );
                      return (
                        <tr
                          key={p.id}
                          className={`border-b border-amber-100 dark:border-amber-900/30 transition-colors ${
                            selectedLowStockIds.has(p.id)
                              ? "bg-amber-100/70 dark:bg-amber-900/20"
                              : "hover:bg-amber-50/80 dark:hover:bg-amber-900/10"
                          }`}
                          data-testid={`row-low-stock-${p.id}`}
                        >
                          <td className="px-3 py-2.5 align-middle">
                            <input
                              type="checkbox"
                              className="accent-amber-500"
                              checked={selectedLowStockIds.has(p.id)}
                              onChange={(e) =>
                                setSelectedLowStockIds((prev) => {
                                  const next = new Set(prev);
                                  e.target.checked ? next.add(p.id) : next.delete(p.id);
                                  return next;
                                })
                              }
                              aria-label={`${language === "ar" ? "تحديد" : "Select"} ${p.name}`}
                            />
                          </td>

                          <td className="px-2 py-2 align-middle">
                            <button
                              type="button"
                              disabled={!thumb}
                              onClick={() => {
                                if (imgs.length) setPhotoPreview({ images: imgs, name: p.name, idx: 0 });
                              }}
                              className="relative block w-11 h-14 rounded-md overflow-hidden border border-border bg-secondary group disabled:cursor-default"
                              title={language === "ar" ? "عرض جميع الصور" : "View all photos"}
                              data-testid={`button-low-stock-photo-${p.id}`}
                            >
                              {thumb ? (
                                <img
                                  src={optimizeCloudinaryUrl(thumb, 120) || thumb}
                                  alt={p.name}
                                  width={44}
                                  height={56}
                                  loading="lazy"
                                  decoding="async"
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                />
                              ) : (
                                <span className="w-full h-full flex items-center justify-center text-muted-foreground">
                                  <ImageIcon className="w-4 h-4" />
                                </span>
                              )}
                              {imgs.length > 1 && (
                                <span className="absolute bottom-0.5 end-0.5 inline-flex items-center gap-0.5 rounded bg-black/65 text-white px-1 py-0.5 text-[9px] leading-none">
                                  <Images className="w-2.5 h-2.5" />
                                  {imgs.length}
                                </span>
                              )}
                            </button>
                          </td>

                          <td className="px-3 py-2.5 align-middle">
                            <div className="font-semibold text-foreground leading-snug line-clamp-2">
                              {p.name}
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground font-mono">
                              #{String(p.id).padStart(4, "0")}
                            </div>
                          </td>

                          <td className="px-3 py-2.5 align-middle">
                            <button
                              type="button"
                              onClick={(e) => openCategoryEditPopup(e, p.id, p.categoryId ?? null)}
                              className="group inline-flex max-w-[170px] items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-start hover:border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                              title={language === "ar" ? "تعديل الفئة" : "Edit category"}
                              data-testid={`button-low-stock-category-${p.id}`}
                            >
                              <span className={category ? "truncate" : "text-muted-foreground"}>
                                {category
                                  ? language === "ar" ? category.nameAr || category.name : category.name
                                  : language === "ar" ? "بدون فئة" : "No category"}
                              </span>
                              <Pencil className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-70" />
                            </button>
                          </td>

                          <td className="px-3 py-2.5 align-middle">
                            <button
                              type="button"
                              onClick={(e) =>
                                openSubcategoryEditPopup(
                                  e,
                                  p.id,
                                  p.categoryId ?? null,
                                  (p as any).subcategoryId ?? null,
                                )
                              }
                              className="group inline-flex max-w-[190px] items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-start hover:border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                              title={language === "ar" ? "تعديل التصنيف الفرعي" : "Edit subcategory"}
                              data-testid={`button-low-stock-subcategory-${p.id}`}
                            >
                              <span className={subcategory ? "truncate" : "text-muted-foreground"}>
                                {subcategory
                                  ? language === "ar" ? subcategory.nameAr || subcategory.name : subcategory.name
                                  : language === "ar" ? "بدون تصنيف فرعي" : "No subcategory"}
                              </span>
                              <Pencil className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-70" />
                            </button>
                          </td>

                          <td className="px-3 py-2.5 text-center align-middle">
                            <span
                              className={`inline-flex min-w-14 items-center justify-center rounded-full px-2 py-1 font-bold tabular-nums ${
                                p.stockQuantity === 0
                                  ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                                  : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                              }`}
                            >
                              {p.stockQuantity === 0
                                ? language === "ar" ? "نفد" : "Out"
                                : p.stockQuantity}
                            </span>
                          </td>

                          <td className="px-3 py-2.5 align-middle text-muted-foreground whitespace-nowrap">
                            ₪{parseFloat(String(p.price || 0)).toFixed(2)}
                          </td>

                          <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                            {(p as any).discountPrice ? (
                              <div>
                                <span className="text-green-600 dark:text-green-400 font-semibold">
                                  ₪{parseFloat(String((p as any).discountPrice)).toFixed(2)}
                                </span>
                                <div className="text-[10px] text-muted-foreground mt-0.5">
                                  {Math.max(
                                    0,
                                    Math.round(
                                      (1 -
                                        parseFloat(String((p as any).discountPrice)) /
                                          Math.max(parseFloat(String(p.price || 0)), 0.01)) *
                                        100,
                                    ),
                                  )}%
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>

                          <td className="px-3 py-2.5 align-middle">
                            <div className="flex items-center justify-center gap-1">
                              {imgs.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setPhotoPreview({ images: imgs, name: p.name, idx: 0 })}
                                  className="w-7 h-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                                  title={language === "ar" ? "عرض الصور" : "View photos"}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLowStockIds(new Set([p.id]));
                                  setShowDiscountDialog(true);
                                }}
                                className="w-7 h-7 rounded-md inline-flex items-center justify-center text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                                title={language === "ar" ? "تطبيق/استبدال الخصم" : "Apply/replace discount"}
                                data-testid={`button-discount-product-${p.id}`}
                              >
                                <Tag className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEdit(p)}
                                className="w-7 h-7 rounded-md inline-flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-secondary transition-colors"
                                title={language === "ar" ? "تعديل المنتج بالكامل" : "Edit full product"}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {selectedLowStockIds.size > 0 && (
              <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-white/95 dark:bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
                <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold me-1">
                  {language === "ar"
                    ? `${selectedLowStockIds.size} منتج محدد`
                    : `${selectedLowStockIds.size} selected`}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={openLowStockMoveDialog}
                  className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 gap-1.5 h-8 px-3 text-xs rounded"
                  data-testid="button-move-selected-low-stock"
                >
                  <Layers className="w-3.5 h-3.5" />
                  {language === "ar" ? "تغيير الفئة/التصنيف" : "Change Category"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setShowDiscountDialog(true)}
                  className="bg-amber-500 hover:bg-amber-600 text-white border-0 gap-1.5 h-8 px-3 text-xs rounded shadow-none"
                  data-testid="button-discount-selected"
                >
                  <Tag className="w-3.5 h-3.5" />
                  {language === "ar" ? "خصم على المحدد" : "Discount Selected"}
                </Button>
                {lowStockProducts.some(
                  (p) => selectedLowStockIds.has(p.id) && !!p.discountPrice,
                ) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleRemoveDiscount(Array.from(selectedLowStockIds))}
                    className="border-amber-300 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 gap-1.5 h-8 px-3 text-xs rounded"
                    data-testid="button-remove-discount-selected"
                  >
                    <X className="w-3.5 h-3.5" />
                    {language === "ar" ? "إزالة خصم المحدد" : "Remove Discount"}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedLowStockIds(new Set())}
                  className="ms-auto inline-flex items-center gap-1 h-8 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                  {language === "ar" ? "إلغاء التحديد" : "Clear selection"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Low Stock Bulk Category/Subcategory Dialog ── */}
      <Dialog open={showLowStockMoveDialog} onOpenChange={setShowLowStockMoveDialog}>
        <DialogContent
          className="w-[calc(100%-1.5rem)] sm:max-w-md rounded-md"
          data-testid="dialog-low-stock-bulk-category"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Layers className="w-4 h-4 text-amber-500" />
              {language === "ar" ? "تغيير الفئة والتصنيف" : "Change Category & Subcategory"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              {language === "ar"
                ? `سيتم تحديث ${selectedLowStockIds.size} منتج محدد. عند تغيير الفئة الرئيسية سيتم حذف أي تصنيف فرعي قديم غير مناسب.`
                : `${selectedLowStockIds.size} selected product(s) will be updated. Changing the main category clears stale subcategory links.`}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {language === "ar" ? "الفئة الرئيسية" : "Category"}
              </label>
              <Select
                value={lowStockMoveCategory}
                onValueChange={(value) => {
                  setLowStockMoveCategory(value);
                  // A new category invalidates any subcategory selection made
                  // for the previous category, so reset it here.
                  setLowStockMoveSubcategoryIds([]);
                  setLowStockClearSubcategories(false);
                }}
              >
                <SelectTrigger className="h-10 rounded-md" data-testid="select-bulk-low-stock-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">
                    {language === "ar" ? "الإبقاء على الفئة الحالية" : "Keep current category"}
                  </SelectItem>
                  <SelectItem value="none">
                    {language === "ar" ? "بدون فئة" : "No category"}
                  </SelectItem>
                  <SelectSeparator />
                  {(categories || []).map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {language === "ar" ? cat.nameAr || cat.name : cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {language === "ar" ? "التصنيفات الفرعية" : "Subcategories"}
                <span className="normal-case font-normal text-muted-foreground/60 ms-1">
                  ({language === "ar" ? "اختر واحد أو أكثر" : "select one or more"})
                </span>
              </label>
              {lowStockMoveCategory === "none" ? (
                <div className="text-xs text-muted-foreground border border-dashed border-input rounded-md px-3 py-2 flex items-center">
                  {language === "ar"
                    ? "لا يمكن اختيار تصنيف فرعي بدون فئة رئيسية"
                    : "No subcategories when the category is set to none"}
                </div>
              ) : (
                (() => {
                  const subs = (subcategoriesData || []).filter(
                    (sub: any) =>
                      lowStockMoveCategory === "keep" ||
                      Number(sub.categoryId) === Number(lowStockMoveCategory),
                  );
                  if (subs.length === 0) {
                    return (
                      <div className="text-xs text-muted-foreground border border-dashed border-input rounded-md px-3 py-2 flex items-center">
                        {language === "ar" ? "لا توجد تصنيفات فرعية" : "No subcategories available"}
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto rounded-md border border-input bg-background p-2">
                      {subs.map((sub: any) => {
                        const isOn = lowStockMoveSubcategoryIds.includes(sub.id);
                        return (
                          <button
                            type="button"
                            key={sub.id}
                            data-testid={`chip-low-stock-subcategory-${sub.id}`}
                            onClick={() => {
                              setLowStockClearSubcategories(false);
                              setLowStockMoveSubcategoryIds((prev) =>
                                isOn ? prev.filter((x) => x !== sub.id) : [...prev, sub.id],
                              );
                            }}
                            className={`px-2 py-1 rounded-full text-xs border transition-colors ${
                              isOn
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:border-primary/50"
                            }`}
                          >
                            {language === "ar" ? sub.nameAr || sub.name : sub.name}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()
              )}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none pt-0.5">
                <input
                  type="checkbox"
                  checked={lowStockClearSubcategories}
                  onChange={(e) => {
                    setLowStockClearSubcategories(e.target.checked);
                    if (e.target.checked) setLowStockMoveSubcategoryIds([]);
                  }}
                />
                {language === "ar"
                  ? "مسح كل التصنيفات الفرعية بدلاً من ذلك"
                  : "Clear all subcategories instead"}
              </label>
              {lowStockMoveCategory === "keep" && (
                <p className="text-[11px] text-muted-foreground">
                  {language === "ar"
                    ? "إذا كانت المنتجات من فئات مختلفة، اختر فئة رئيسية أولاً قبل تعيين تصنيفات فرعية جديدة."
                    : "If selected products have different categories, choose a destination category before assigning new subcategories."}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="rounded"
              onClick={() => setShowLowStockMoveDialog(false)}
              disabled={lowStockMoveSaving}
            >
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              className="rounded min-w-24 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleMoveLowStockProducts}
              disabled={lowStockMoveSaving || selectedLowStockIds.size === 0}
              data-testid="button-save-bulk-low-stock-category"
            >
              {lowStockMoveSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" />
                  {language === "ar" ? "جاري الحفظ..." : "Saving..."}
                </>
              ) : language === "ar" ? (
                "حفظ التغييرات"
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Low Stock "Add to Subcategory" Dialog (append-only, keeps existing category/subcategories) ── */}
      <Dialog open={showLowStockAddSubcategoryDialog} onOpenChange={setShowLowStockAddSubcategoryDialog}>
        <DialogContent
          className="w-[calc(100%-1.5rem)] sm:max-w-md rounded-md"
          data-testid="dialog-low-stock-add-subcategory"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="w-4 h-4 text-amber-500" />
              {language === "ar" ? "إضافة إلى تصنيف فرعي" : "Add to Subcategory"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {language === "ar"
                ? `سيتم إضافة التصنيف/التصنيفات الفرعية المختارة إلى ${selectedLowStockIds.size} منتج محدد، مع الإبقاء على فئتها وتصنيفاتها الفرعية الحالية كما هي دون حذف أي شيء.`
                : `The chosen subcategory/subcategories will be added to ${selectedLowStockIds.size} selected product(s), keeping their current category and existing subcategories untouched.`}
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {language === "ar" ? "التصنيفات الفرعية" : "Subcategories"}
                <span className="normal-case font-normal text-muted-foreground/60 ms-1">
                  ({language === "ar" ? "اختر واحد أو أكثر" : "select one or more"})
                </span>
              </label>
              {(subcategoriesData || []).length === 0 ? (
                <div className="text-xs text-muted-foreground border border-dashed border-input rounded-md px-3 py-2 flex items-center">
                  {language === "ar" ? "لا توجد تصنيفات فرعية" : "No subcategories available"}
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto rounded-md border border-input bg-background p-2">
                  {(categories || []).map((cat) => {
                    const subs = (subcategoriesData || []).filter(
                      (sub: any) => Number(sub.categoryId) === Number(cat.id),
                    );
                    if (subs.length === 0) return null;
                    return (
                      <div key={cat.id} className="space-y-1">
                        <div className="text-[11px] font-semibold text-muted-foreground">
                          {language === "ar" ? cat.nameAr || cat.name : cat.name}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {subs.map((sub: any) => {
                            const isOn = lowStockAddSubcategoryIds.includes(sub.id);
                            return (
                              <button
                                type="button"
                                key={sub.id}
                                data-testid={`chip-add-low-stock-subcategory-${sub.id}`}
                                onClick={() => {
                                  setLowStockAddSubcategoryIds((prev) =>
                                    isOn ? prev.filter((x) => x !== sub.id) : [...prev, sub.id],
                                  );
                                }}
                                className={`px-2 py-1 rounded-full text-xs border transition-colors ${
                                  isOn
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-border hover:border-primary/50"
                                }`}
                              >
                                {language === "ar" ? sub.nameAr || sub.name : sub.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                {language === "ar"
                  ? "ملاحظة: يتم تطبيق كل تصنيف فرعي فقط على المنتجات التابعة لنفس فئته الرئيسية؛ يتم تخطي أي منتج من فئة مختلفة."
                  : "Note: each subcategory is only applied to products in its matching category; products from a different category are skipped."}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="rounded"
              onClick={() => setShowLowStockAddSubcategoryDialog(false)}
              disabled={lowStockAddSubcategorySaving}
            >
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              className="rounded min-w-24 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={handleAddLowStockSubcategories}
              disabled={
                lowStockAddSubcategorySaving ||
                selectedLowStockIds.size === 0 ||
                lowStockAddSubcategoryIds.length === 0
              }
              data-testid="button-save-add-low-stock-subcategory"
            >
              {lowStockAddSubcategorySaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" />
                  {language === "ar" ? "جاري الحفظ..." : "Saving..."}
                </>
              ) : language === "ar" ? (
                "إضافة"
              ) : (
                "Add"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Discount Dialog ── */}
      <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
        <DialogContent
          className="w-[calc(100%-1.5rem)] sm:max-w-sm"
          data-testid="dialog-discount"
        >
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
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 py-2">
              {language === "ar"
                ? "إذا كان المنتج عليه خصم أو تخفيض حالي، سيتم استبداله بهذا الخصم الجديد. لن يتم جمع خصمين معاً."
                : "If a product already has a sale/discount, this new discount replaces it. Discounts are never stacked."}
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
            <div className="border rounded-md p-3 space-y-3 bg-muted/30">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={discountSendEmail}
                  onChange={(e) => setDiscountSendEmail(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                  data-testid="checkbox-discount-email"
                />
                <Mail className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-medium">
                  {language === "ar"
                    ? "إرسال بريد للعملاء"
                    : "Notify customers by email"}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={discountSendWA}
                  onChange={(e) => setDiscountSendWA(e.target.checked)}
                  className="w-4 h-4 accent-green-600 cursor-pointer"
                  data-testid="checkbox-discount-whatsapp"
                />
                <svg
                  className="w-4 h-4 text-green-600"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                <span className="text-sm font-medium">
                  {language === "ar"
                    ? "إرسال واتساب للعملاء"
                    : "Notify customers by WhatsApp"}
                </span>
              </label>
              {(discountSendEmail || discountSendWA) && (
                <div className="space-y-1.5 ps-6">
                  <label className="text-xs text-muted-foreground">
                    {language === "ar"
                      ? "اذكر الفئة أو المناسبة (اختياري)"
                      : "Mention category or occasion (optional)"}
                  </label>
                  <Input
                    type="text"
                    placeholder={
                      language === "ar"
                        ? "مثال: الفساتين، مجموعة الصيف"
                        : "e.g. Dresses, Summer Collection"
                    }
                    value={discountCategoryMention}
                    onChange={(e) => setDiscountCategoryMention(e.target.value)}
                    className="h-9 text-sm rounded-md"
                    data-testid="input-discount-category-mention"
                  />
                </div>
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
                  setDiscountSendEmail(false);
                  setDiscountSendWA(false);
                  setDiscountCategoryMention("");
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
              setBulkEditFields({
                name: "",
                nameAr: "",
                price: "",
                discountPrice: "",
                categoryId: "",
                subcategoryIds: [],
                clearSubcategories: false,
              });
              setIsBulkEditOpen(true);
            }}
            className="rounded bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            data-testid="button-bulk-edit"
          >
            <Pencil className="w-4 h-4" />
            {language === "ar" ? "تعديل السعر/الاسم" : "Edit Price/Name"}
          </Button>
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
            size="sm"
            onClick={() => setIsBulkAiPhotoOpen(true)}
            className="rounded bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
            data-testid="button-bulk-ai-photos"
          >
            <Wand2 className="w-4 h-4" />
            {language === "ar" ? "توليد صور AI" : "Generate AI Photos"}
          </Button>
          <Button
            size="sm"
            onClick={() => setIsBulkAutofillOpen(true)}
            className="rounded bg-teal-600 hover:bg-teal-700 text-white gap-1.5"
            data-testid="button-bulk-ai-autofill"
          >
            <Bot className="w-4 h-4" />
            {language === "ar" ? "تعبئة AI (اسم/وصف/ألوان)" : "AI Autofill (Name/Desc/Colors)"}
          </Button>
          <Button
            size="sm"
            disabled={bulkPhotoDownloading}
            onClick={() => handleDownloadMainPhotos(Array.from(selectedIds))}
            className="rounded bg-slate-700 hover:bg-slate-800 text-white gap-1.5"
            data-testid="button-bulk-download-main-photos"
          >
            {bulkPhotoDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {language === "ar" ? "تحميل الصور الرئيسية" : "Download Main Photos"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            className="dark-red-zone rounded"
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



      {/* ── Bulk AI Photo Generation Dialog ── */}
      <Dialog
        open={isBulkAiPhotoOpen}
        onOpenChange={(open) => {
          if (!open && bulkAiPhotoRunning) return; // don't allow closing mid-run via backdrop/esc
          setIsBulkAiPhotoOpen(open);
        }}
      >
        <DialogContent
          className="w-[calc(100%-1.5rem)] sm:max-w-sm rounded-md"
          data-testid="dialog-bulk-ai-photos"
        >
          <DialogHeader>
            <DialogTitle>
              {language === "ar"
                ? `توليد صور AI لـ ${selectedIds.size} منتج`
                : `Generate AI Photos for ${selectedIds.size} Product(s)`}
            </DialogTitle>
          </DialogHeader>

          {!bulkAiPhotoRunning && bulkAiPhotoProgress.total === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {language === "ar"
                  ? "اختر نوع الصور المطلوب توليدها من الصورة الرئيسية لكل لون في كل منتج محدد. صورة الموديل تُستخدم كصورة رئيسية جديدة لذلك اللون عند توليدها. تعمل العملية لوناً تلو الآخر وقد تستغرق وقتاً طويلاً مع عدد كبير من المنتجات/الألوان."
                  : "Choose which photo type(s) to generate from the main photo of every color of every selected product. The model shot becomes that color's new main photo when generated. Colors are processed one at a time, so this can take a while for a large selection."}
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={bulkAiPhotoShotTypes.has("model")}
                    onCheckedChange={(checked) =>
                      setBulkAiPhotoShotTypes((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add("model");
                        else next.delete("model");
                        return next;
                      })
                    }
                    data-testid="checkbox-bulk-ai-shot-model"
                  />
                  {language === "ar" ? "صورة الموديل" : "Model-worn photo"}
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={bulkAiPhotoShotTypes.has("product")}
                    onCheckedChange={(checked) =>
                      setBulkAiPhotoShotTypes((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add("product");
                        else next.delete("product");
                        return next;
                      })
                    }
                    data-testid="checkbox-bulk-ai-shot-product"
                  />
                  {language === "ar" ? "صورة المنتج فقط (بدون موديل)" : "Clean product-only photo"}
                </label>
                {bulkAiPhotoShotTypes.size === 0 && (
                  <p className="text-xs text-destructive">
                    {language === "ar"
                      ? "اختر نوعاً واحداً على الأقل"
                      : "Select at least one photo type"}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleBulkGenerateAiPhotos}
                  disabled={bulkAiPhotoShotTypes.size === 0}
                  className="flex-1 rounded gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                  data-testid="button-confirm-bulk-ai-photos"
                >
                  <Wand2 className="w-4 h-4" />
                  {language === "ar" ? "بدء التوليد" : "Start Generating"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsBulkAiPhotoOpen(false)}
                  className="rounded"
                  data-testid="button-cancel-bulk-ai-photos"
                >
                  {language === "ar" ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </div>
          )}

          {(bulkAiPhotoRunning || bulkAiPhotoProgress.total > 0) && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span data-testid="text-bulk-ai-progress-count">
                    {bulkAiPhotoProgress.done} / {bulkAiPhotoProgress.total}
                  </span>
                  {bulkAiPhotoProgress.failed > 0 && (
                    <span className="text-destructive">
                      {language === "ar"
                        ? `فشل: ${bulkAiPhotoProgress.failed}`
                        : `Failed: ${bulkAiPhotoProgress.failed}`}
                    </span>
                  )}
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-violet-600 transition-all"
                    style={{
                      width: `${
                        bulkAiPhotoProgress.total
                          ? (bulkAiPhotoProgress.done / bulkAiPhotoProgress.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                {bulkAiPhotoRunning && bulkAiPhotoProgress.currentName && (
                  <p className="text-xs text-muted-foreground truncate">
                    {language === "ar" ? "جارٍ الآن: " : "Now: "}
                    {bulkAiPhotoProgress.currentName}
                  </p>
                )}
              </div>
              {bulkAiPhotoRunning ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    bulkAiPhotoCancelRef.current = true;
                  }}
                  className="w-full rounded gap-1.5 border-rose-300 text-rose-600 hover:bg-rose-50 hover:border-rose-400"
                  data-testid="button-stop-bulk-ai-photos"
                >
                  <X className="w-4 h-4" />
                  {language === "ar" ? "إيقاف" : "Stop"}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => {
                    setIsBulkAiPhotoOpen(false);
                    setBulkAiPhotoProgress({ done: 0, total: 0, failed: 0, currentName: "" });
                  }}
                  className="w-full rounded"
                  data-testid="button-close-bulk-ai-photos"
                >
                  {language === "ar" ? "تم" : "Done"}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk AI Autofill Dialog (name / description / colors) ── */}
      <Dialog
        open={isBulkAutofillOpen}
        onOpenChange={(open) => {
          if (!open && autofillRunning) return; // don't allow closing mid-run
          setIsBulkAutofillOpen(open);
          if (!open) setAutofillProgress({ done: 0, total: 0, failed: 0, currentName: "" });
        }}
      >
        <DialogContent
          className="w-[calc(100%-1.5rem)] sm:max-w-sm rounded-md"
          data-testid="dialog-bulk-ai-autofill"
        >
          <DialogHeader>
            <DialogTitle>
              {language === "ar"
                ? `تعبئة AI لـ ${selectedIds.size} منتج`
                : `AI Autofill for ${selectedIds.size} Product(s)`}
            </DialogTitle>
          </DialogHeader>

          {!autofillRunning && autofillProgress.total === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {language === "ar"
                  ? "سيقوم الذكاء الاصطناعي بالنظر إلى صور كل منتج محدد (صورة كل لون) وتوليد الحقول المختارة من جديد ثم حفظها. اختر الحقول التي تريد تحديثها:"
                  : "The AI will look at each selected product's photos (each color's photo) and regenerate the chosen fields, then save. Pick the fields to update:"}
              </p>
              <div className="space-y-2.5">
                {(
                  [
                    ["name", language === "ar" ? "الاسم" : "Name"],
                    ["description", language === "ar" ? "الوصف" : "Description"],
                    ["colors", language === "ar" ? "الألوان (اسم وكود اللون)" : "Colors (name + hex)"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center gap-2.5 cursor-pointer select-none text-sm"
                    data-testid={`checkbox-autofill-${key}`}
                  >
                    <input
                      type="checkbox"
                      checked={autofillFields[key]}
                      onChange={(e) =>
                        setAutofillFields((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      className="w-4 h-4 accent-teal-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {language === "ar"
                  ? "ملاحظة: هذا سيستبدل القيم الحالية للحقول المختارة ولا يمكن التراجع عنه."
                  : "Note: this overwrites the current values of the chosen fields and can't be undone."}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={handleBulkAiAutofill}
                  className="flex-1 rounded gap-2 bg-teal-600 hover:bg-teal-700 text-white"
                  data-testid="button-confirm-bulk-ai-autofill"
                >
                  <Bot className="w-4 h-4" />
                  {language === "ar" ? "بدء التعبئة" : "Start Autofill"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsBulkAutofillOpen(false)}
                  className="rounded"
                  data-testid="button-cancel-bulk-ai-autofill"
                >
                  {language === "ar" ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </div>
          )}

          {(autofillRunning || autofillProgress.total > 0) && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span data-testid="text-autofill-progress-count">
                    {autofillProgress.done} / {autofillProgress.total}
                  </span>
                  {autofillProgress.failed > 0 && (
                    <span className="text-destructive">
                      {language === "ar"
                        ? `فشل: ${autofillProgress.failed}`
                        : `Failed: ${autofillProgress.failed}`}
                    </span>
                  )}
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-teal-600 transition-all"
                    style={{
                      width: `${
                        autofillProgress.total
                          ? (autofillProgress.done / autofillProgress.total) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                {autofillRunning && autofillProgress.currentName && (
                  <p className="text-xs text-muted-foreground truncate">
                    {language === "ar" ? "جارٍ الآن: " : "Now: "}
                    {autofillProgress.currentName}
                  </p>
                )}
              </div>
              {autofillRunning ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    autofillCancelRef.current = true;
                  }}
                  className="w-full rounded gap-1.5 border-rose-300 text-rose-600 hover:bg-rose-50 hover:border-rose-400"
                  data-testid="button-stop-bulk-ai-autofill"
                >
                  <X className="w-4 h-4" />
                  {language === "ar" ? "إيقاف" : "Stop"}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => {
                    setIsBulkAutofillOpen(false);
                    setAutofillProgress({ done: 0, total: 0, failed: 0, currentName: "" });
                  }}
                  className="w-full rounded"
                  data-testid="button-close-bulk-ai-autofill"
                >
                  {language === "ar" ? "تم" : "Done"}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isFlagsDialogOpen} onOpenChange={setIsFlagsDialogOpen}>        <DialogContent
          className="w-[calc(100%-1.5rem)] sm:max-w-sm rounded-md"
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

      {/* Shoe Size Audit Dialog */}
      <Dialog open={isSizeAuditOpen} onOpenChange={setIsSizeAuditOpen}>
        <DialogContent
          className="w-[calc(100%-1.5rem)] sm:max-w-lg rounded-md max-h-[85vh] overflow-y-auto"
          data-testid="dialog-size-audit"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {language === "ar" ? "فحص مقاسات الأحذية" : "Shoe Size Audit"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            {language === "ar"
              ? "منتجات في تصنيف الأحذية ما زالت تحمل مقاسات حروف (S/M/L/XL) بدلاً من أرقام. هذا فحص فقط ولا يغيّر أي بيانات — افتح المنتج وعدّل المقاسات يدوياً."
              : "Products in the Shoes category that still carry letter sizes (S/M/L/XL) instead of numeric shoe sizes. This is a read-only check — open each product and fix its sizes manually."}
          </p>
          {shoeSizeAuditResults.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {language === "ar"
                ? "لا توجد مشاكل — جميع منتجات الأحذية تستخدم مقاسات رقمية."
                : "No issues found — all shoe products use numeric sizes."}
            </div>
          ) : (
            <div className="space-y-2 mt-1">
              {shoeSizeAuditResults.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 px-3 py-2"
                  data-testid={`size-audit-row-${r.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {language === "ar" && r.nameAr ? r.nameAr : r.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {language === "ar" ? "مقاسات خاطئة: " : "Bad sizes: "}
                      {r.badSizes.join(", ")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      const p = (products as any[])?.find((x) => x.id === r.id);
                      if (p) {
                        setIsSizeAuditOpen(false);
                        openEdit(p);
                      }
                    }}
                    data-testid={`button-fix-size-${r.id}`}
                  >
                    {language === "ar" ? "فتح للتعديل" : "Open to fix"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Dialog */}
      {/* ── Stock Quick-Edit Popup ── */}
      <Dialog
        open={!!stockPopup}
        onOpenChange={(open) => {
          if (!open) setStockPopup(null);
        }}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-sm rounded-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-base">
              {stockPopup && (
                <span
                  className="w-4 h-4 rounded-full border border-border shrink-0"
                  style={{ backgroundColor: stockPopup.colorCode }}
                />
              )}
              {language === "ar"
                ? `مخزون: ${stockPopup?.variantName}`
                : `Stock: ${stockPopup?.variantName}`}
            </DialogTitle>
          </DialogHeader>

          {/* ── Quick-size chips ── */}
          {stockPopup && (() => {
            const quickSizes = getQuickSizes(stockPopup.categoryId ?? 1);
            const existingSizes = new Set(Object.keys(stockPopupValues));
            const available = quickSizes.filter((s) => !existingSizes.has(s));
            if (available.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1.5 p-2 bg-muted/40 border border-dashed border-border rounded-md">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground self-center me-1">
                  {language === "ar" ? "إضافة سريعة:" : "Quick add:"}
                </span>
                {available.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setStockPopupValues((v) => ({ ...v, [s]: 1 }))
                    }
                    className="px-2.5 py-0.5 text-xs border border-primary/40 text-primary bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors rounded"
                  >
                    + {s}
                  </button>
                ))}
                {available.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setStockPopupValues((v) => {
                        const next = { ...v };
                        available.forEach((s) => { next[s] = 1; });
                        return next;
                      })
                    }
                    className="px-2.5 py-0.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-semibold rounded"
                  >
                    {language === "ar" ? "+ الكل" : "+ All"}
                  </button>
                )}
              </div>
            );
          })()}

          {/* ── Size rows ── */}
          <div className="space-y-2 mt-1">
            {stockPopup && Object.keys(stockPopupValues).length > 0 && (
              <div className="border border-border rounded-md overflow-hidden">
                <div className="grid grid-cols-[1fr_auto_28px] bg-secondary/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider">
                  <span>{language === "ar" ? "المقاس" : "Size"}</span>
                  <span>{language === "ar" ? "الكمية" : "Qty"}</span>
                  <span />
                </div>
                {Object.entries(stockPopupValues).map(([size, qty]) => (
                  <div key={size} className="grid grid-cols-[1fr_auto_28px] items-center px-3 py-2 border-t border-border">
                    <span className="text-sm font-bold">{size}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setStockPopupValues((v) => ({
                            ...v,
                            [size]: Math.max(0, (v[size] ?? 0) - 1),
                          }))
                        }
                        className="w-7 h-7 rounded border border-border flex items-center justify-center text-base font-bold hover:bg-secondary transition-colors"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={qty}
                        onChange={(e) => {
                          const n = parseInt(e.target.value);
                          setStockPopupValues((v) => ({
                            ...v,
                            [size]: isNaN(n) ? 0 : Math.max(0, n),
                          }));
                        }}
                        className="w-12 h-7 text-center border border-border rounded bg-background text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setStockPopupValues((v) => ({
                            ...v,
                            [size]: (v[size] ?? 0) + 1,
                          }))
                        }
                        className="w-7 h-7 rounded border border-border flex items-center justify-center text-base font-bold hover:bg-secondary transition-colors"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setStockPopupValues((v) => {
                          const next = { ...v };
                          delete next[size];
                          return next;
                        })
                      }
                      className="text-destructive hover:text-destructive/80 flex justify-center"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {Object.keys(stockPopupValues).length > 1 && (
                  <div className="px-3 py-1.5 border-t border-border bg-secondary/30 text-xs font-semibold flex justify-between">
                    <span>{language === "ar" ? "الإجمالي" : "Total"}</span>
                    <span className="text-base font-bold text-primary">
                      {Object.values(stockPopupValues).reduce((s, q) => s + q, 0)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Add custom size ── */}
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={stockPopupNewSize}
              onChange={(e) => setStockPopupNewSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const s = stockPopupNewSize.trim();
                  if (!s || stockPopupValues[s] !== undefined) return;
                  setStockPopupValues((v) => ({ ...v, [s]: 1 }));
                  setStockPopupNewSize("");
                }
              }}
              placeholder={language === "ar" ? "مقاس جديد (مثل XL، 41...)" : "New size (e.g. XL, 41...)"}
              className="flex-1 h-9 px-3 border border-border rounded-md bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => {
                const s = stockPopupNewSize.trim();
                if (!s || stockPopupValues[s] !== undefined) return;
                setStockPopupValues((v) => ({ ...v, [s]: 1 }));
                setStockPopupNewSize("");
              }}
              className="h-9 px-3 rounded-md border border-border text-sm font-medium hover:bg-secondary transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              {language === "ar" ? "إضافة" : "Add"}
            </button>
          </div>

          <div className="flex gap-2 mt-3 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="rounded"
              onClick={() => setStockPopup(null)}
            >
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              className="rounded min-w-20"
              onClick={saveStockPopup}
              disabled={stockPopup?.saving}
            >
              {stockPopup?.saving
                ? language === "ar"
                  ? "جاري الحفظ..."
                  : "Saving..."
                : language === "ar"
                  ? "حفظ"
                  : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Color Quick-Edit Popup ── */}
      <Dialog
        open={!!colorEditPopup}
        onOpenChange={(open) => { if (!open) setColorEditPopup(null); }}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-xs rounded-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-base">
              <span
                className="w-4 h-4 rounded-full border border-border shrink-0"
                style={{ backgroundColor: colorEditValues.colorCode }}
              />
              {language === "ar" ? "تعديل اللون" : "Edit Color"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {language === "ar" ? "اسم اللون" : "Color Name"}
              </label>
              <input
                type="text"
                value={colorEditValues.name}
                onChange={(e) =>
                  setColorEditValues((v) => ({ ...v, name: e.target.value }))
                }
                className="w-full h-9 px-3 border border-border rounded bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder={language === "ar" ? "مثال: أحمر" : "e.g. Red"}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {language === "ar" ? "كود اللون" : "Color Code"}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={colorEditValues.colorCode}
                  onChange={(e) =>
                    setColorEditValues((v) => ({ ...v, colorCode: e.target.value }))
                  }
                  className="w-10 h-9 rounded border border-border cursor-pointer p-0.5 bg-background"
                />
                <input
                  type="text"
                  value={colorEditValues.colorCode}
                  onChange={(e) =>
                    setColorEditValues((v) => ({ ...v, colorCode: e.target.value }))
                  }
                  className="flex-1 h-9 px-3 border border-border rounded bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="#000000"
                  maxLength={7}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="rounded"
              onClick={() => setColorEditPopup(null)}
            >
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              className="rounded min-w-20"
              onClick={saveColorEditPopup}
              disabled={colorEditPopup?.saving || !colorEditValues.name.trim()}
            >
              {colorEditPopup?.saving
                ? language === "ar" ? "جاري الحفظ..." : "Saving..."
                : language === "ar" ? "حفظ" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Name Quick-Edit Popup ── */}
      <Dialog
        open={!!nameEditPopup}
        onOpenChange={(open) => { if (!open) setNameEditPopup(null); }}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-xs rounded-md">
          <DialogHeader>
            <DialogTitle className="font-display text-base">
              {language === "ar" ? "تعديل الاسم" : "Edit Name"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 mt-1">
            <label className="text-xs font-medium text-muted-foreground">
              {language === "ar" ? "اسم المنتج" : "Product Name"}
            </label>
            <input
              type="text"
              value={nameEditValue}
              onChange={(e) => setNameEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && nameEditValue.trim()) saveNameEditPopup(); }}
              className="w-full h-9 px-3 border border-border rounded bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="ghost" size="sm" className="rounded" onClick={() => setNameEditPopup(null)}>
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              className="rounded min-w-20"
              onClick={saveNameEditPopup}
              disabled={nameEditPopup?.saving || !nameEditValue.trim()}
            >
              {nameEditPopup?.saving
                ? language === "ar" ? "جاري الحفظ..." : "Saving..."
                : language === "ar" ? "حفظ" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Price Quick-Edit Popup ── */}
      <Dialog
        open={!!priceEditPopup}
        onOpenChange={(open) => { if (!open) setPriceEditPopup(null); }}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-xs rounded-md">
          <DialogHeader>
            <DialogTitle className="font-display text-base">
              {language === "ar" ? "تعديل السعر" : "Edit Price"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {language === "ar" ? "السعر" : "Price"}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground">
                  ₪
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={priceEditValue}
                  onChange={(e) => setPriceEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && priceEditValue.trim()) savePriceEditPopup(); }}
                  className="w-full h-9 ps-7 pe-3 border border-border rounded bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                  data-testid="input-price-quick-edit"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {language === "ar" ? "سعر الخصم (اختياري)" : "Discount Price (optional)"}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground">
                  ₪
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={discountPriceEditValue}
                  onChange={(e) => setDiscountPriceEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && priceEditValue.trim()) savePriceEditPopup(); }}
                  className="w-full h-9 ps-7 pe-3 border border-border rounded bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder={language === "ar" ? "بدون خصم" : "No discount"}
                  data-testid="input-discount-price-quick-edit"
                />
              </div>
              {discountPriceEditValue.trim() && priceEditValue.trim() && (
                <p className="text-[11px] text-muted-foreground">
                  {!isNaN(parseFloat(discountPriceEditValue)) &&
                  !isNaN(parseFloat(priceEditValue)) &&
                  parseFloat(discountPriceEditValue) < parseFloat(priceEditValue)
                    ? language === "ar"
                      ? `خصم ${Math.round(
                          (1 -
                            parseFloat(discountPriceEditValue) /
                              parseFloat(priceEditValue)) *
                            100,
                        )}%`
                      : `${Math.round(
                          (1 -
                            parseFloat(discountPriceEditValue) /
                              parseFloat(priceEditValue)) *
                            100,
                        )}% off`
                    : language === "ar"
                      ? "يجب أن يكون سعر الخصم أقل من السعر الأصلي"
                      : "Discount price must be less than the original price"}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            {discountPriceEditValue.trim() && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded text-muted-foreground me-auto"
                onClick={() => setDiscountPriceEditValue("")}
                disabled={priceEditPopup?.saving}
                data-testid="button-clear-discount-quick-edit"
              >
                {language === "ar" ? "إزالة الخصم" : "Clear Discount"}
              </Button>
            )}
            <Button variant="ghost" size="sm" className="rounded" onClick={() => setPriceEditPopup(null)}>
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              className="rounded min-w-20"
              onClick={savePriceEditPopup}
              disabled={priceEditPopup?.saving || !priceEditValue.trim()}
              data-testid="button-save-price-quick-edit"
            >
              {priceEditPopup?.saving
                ? language === "ar" ? "جاري الحفظ..." : "Saving..."
                : language === "ar" ? "حفظ" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Category Quick-Edit Popup ── */}
      <Dialog
        open={!!categoryEditPopup}
        onOpenChange={(open) => { if (!open) setCategoryEditPopup(null); }}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-xs rounded-md">
          <DialogHeader>
            <DialogTitle className="font-display text-base">
              {language === "ar" ? "تعديل الفئة" : "Edit Category"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 mt-1">
            <label className="text-xs font-medium text-muted-foreground">
              {language === "ar" ? "الفئة" : "Category"}
            </label>
            <select
              value={categoryEditValue ?? ""}
              onChange={(e) => setCategoryEditValue(e.target.value ? Number(e.target.value) : null)}
              className="w-full h-9 px-3 border border-border rounded bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            >
              <option value="">{language === "ar" ? "بدون فئة" : "No category"}</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {language === "ar" ? c.nameAr || c.name : c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="ghost" size="sm" className="rounded" onClick={() => setCategoryEditPopup(null)}>
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              className="rounded min-w-20"
              onClick={saveCategoryEditPopup}
              disabled={categoryEditPopup?.saving}
            >
              {categoryEditPopup?.saving
                ? language === "ar" ? "جاري الحفظ..." : "Saving..."
                : language === "ar" ? "حفظ" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Subcategory Quick-Edit Popup ── */}
      <Dialog
        open={!!subcategoryEditPopup}
        onOpenChange={(open) => { if (!open) setSubcategoryEditPopup(null); }}
      >
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-xs rounded-md">
          <DialogHeader>
            <DialogTitle className="font-display text-base">
              {language === "ar" ? "تعديل الفئة الفرعية" : "Edit Subcategory"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 mt-1">
            <label className="text-xs font-medium text-muted-foreground">
              {language === "ar" ? "الفئة الفرعية" : "Subcategory"}
            </label>
            <select
              value={subcategoryEditValue ?? ""}
              onChange={(e) => setSubcategoryEditValue(e.target.value ? Number(e.target.value) : null)}
              className="w-full h-9 px-3 border border-border rounded bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            >
              <option value="">{language === "ar" ? "بدون فئة فرعية" : "No subcategory"}</option>
              {(subcategoriesData || [])
                .filter(
                  (s: any) =>
                    !subcategoryEditPopup?.categoryId ||
                    s.categoryId === subcategoryEditPopup.categoryId,
                )
                .map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {language === "ar" ? s.nameAr || s.name : s.name}
                  </option>
                ))}
            </select>
            {subcategoryEditPopup?.categoryId &&
              (subcategoriesData || []).filter(
                (s: any) => s.categoryId === subcategoryEditPopup.categoryId,
              ).length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {language === "ar"
                    ? "لا توجد فئات فرعية لهذه الفئة"
                    : "No subcategories for this category"}
                </p>
              )}
            {!subcategoryEditPopup?.categoryId && (
              <p className="text-xs text-muted-foreground">
                {language === "ar"
                  ? "حدد فئة رئيسية أولاً لهذا المنتج"
                  : "Set a category for this product first"}
              </p>
            )}
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button variant="ghost" size="sm" className="rounded" onClick={() => setSubcategoryEditPopup(null)}>
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              className="rounded min-w-20"
              onClick={saveSubcategoryEditPopup}
              disabled={subcategoryEditPopup?.saving}
            >
              {subcategoryEditPopup?.saving
                ? language === "ar" ? "جاري الحفظ..." : "Saving..."
                : language === "ar" ? "حفظ" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
        <DialogContent
          className="w-[calc(100%-1.5rem)] sm:max-w-md rounded-md"
          data-testid="dialog-bulk-edit"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              {language === "ar"
                ? `تعديل ${selectedIds.size} منتج`
                : `Edit ${selectedIds.size} Product(s)`}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            {language === "ar"
              ? "اترك الحقل فارغاً لعدم تغييره. الحقول المملوءة فقط ستُطبَّق على جميع المنتجات المحددة."
              : "Leave a field blank to keep it unchanged. Only filled fields will be applied to all selected products."}
          </p>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {language === "ar" ? "الاسم (إنجليزي)" : "Name (English)"}
                </label>
                <Input
                  value={bulkEditFields.name}
                  onChange={(e) =>
                    setBulkEditFields((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder={
                    language === "ar"
                      ? "اتركه فارغاً للإبقاء"
                      : "Leave blank to keep"
                  }
                  className="text-sm h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {language === "ar" ? "الاسم (عربي)" : "Name (Arabic)"}
                </label>
                <Input
                  value={bulkEditFields.nameAr}
                  onChange={(e) =>
                    setBulkEditFields((f) => ({ ...f, nameAr: e.target.value }))
                  }
                  placeholder={
                    language === "ar"
                      ? "اتركه فارغاً للإبقاء"
                      : "Leave blank to keep"
                  }
                  className="text-sm h-9"
                  dir="rtl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {language === "ar" ? "السعر الأصلي" : "Original Price"}
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bulkEditFields.price}
                  onChange={(e) =>
                    setBulkEditFields((f) => ({ ...f, price: e.target.value }))
                  }
                  placeholder={language === "ar" ? "مثال: 150" : "e.g. 150"}
                  className="text-sm h-9"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  {language === "ar"
                    ? "سعر الخصم (اتركه 0 لإلغائه)"
                    : "Sale Price (0 to remove)"}
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bulkEditFields.discountPrice}
                  onChange={(e) =>
                    setBulkEditFields((f) => ({
                      ...f,
                      discountPrice: e.target.value,
                    }))
                  }
                  placeholder={
                    language === "ar"
                      ? "مثال: 120 أو 0 للإلغاء"
                      : "e.g. 120 or 0 to remove"
                  }
                  className="text-sm h-9"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {language === "ar" ? "التصنيف" : "Category"}
              </label>
              <select
                value={bulkEditFields.categoryId}
                onChange={(e) => setBulkEditFields(f => ({ ...f, categoryId: e.target.value, subcategoryIds: [], clearSubcategories: false }))}
                className="w-full h-9 rounded-md border border-border bg-background px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">{language === "ar" ? "— لا تغيير —" : "— no change —"}</option>
                {(categories || []).map((c: any) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.nameAr ? `${c.nameAr} / ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {language === "ar" ? "التصنيفات الفرعية" : "Subcategories"}
                <span className="normal-case font-normal text-muted-foreground/60 ms-1">
                  ({language === "ar" ? "اختر واحد أو أكثر" : "select one or more"})
                </span>
              </label>
              {(() => {
                const subs = (subcategoriesData || []).filter(
                  (s: any) => !bulkEditFields.categoryId || String(s.categoryId) === bulkEditFields.categoryId,
                );
                if (subs.length === 0) {
                  return (
                    <div className="text-xs text-muted-foreground border border-dashed border-input rounded-md px-3 py-2 h-9 flex items-center">
                      {language === "ar"
                        ? "لا توجد تصنيفات فرعية"
                        : "No subcategories available"}
                    </div>
                  );
                }
                return (
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto rounded-md border border-input bg-background p-2">
                    {subs.map((s: any) => {
                      const isOn = bulkEditFields.subcategoryIds.includes(s.id);
                      return (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() =>
                            setBulkEditFields((f) => ({
                              ...f,
                              clearSubcategories: false,
                              subcategoryIds: isOn
                                ? f.subcategoryIds.filter((x) => x !== s.id)
                                : [...f.subcategoryIds, s.id],
                            }))
                          }
                          className={`px-2 py-1 rounded-full text-xs border transition-colors ${
                            isOn
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border hover:border-primary/50"
                          }`}
                        >
                          {s.nameAr ? `${s.nameAr} / ${s.name}` : s.name}
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none pt-0.5">
                <input
                  type="checkbox"
                  checked={bulkEditFields.clearSubcategories}
                  onChange={(e) =>
                    setBulkEditFields((f) => ({
                      ...f,
                      clearSubcategories: e.target.checked,
                      subcategoryIds: e.target.checked ? [] : f.subcategoryIds,
                    }))
                  }
                />
                {language === "ar"
                  ? "مسح كل التصنيفات الفرعية بدلاً من ذلك"
                  : "Clear all subcategories instead"}
              </label>
            </div>
          </div>
          <div
            className={`flex items-center gap-2 mt-2 p-3 rounded-md border cursor-pointer select-none transition-colors ${bulkEditRegenBarcode ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
            onClick={() => setBulkEditRegenBarcode((v) => !v)}
          >
            <div
              className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${bulkEditRegenBarcode ? "bg-primary border-primary" : "border-border"}`}
            >
              {bulkEditRegenBarcode && (
                <Check className="w-2.5 h-2.5 text-primary-foreground" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium leading-none">
                {language === "ar"
                  ? "إعادة توليد الباركود"
                  : "Regenerate Barcode"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {language === "ar"
                  ? "سيتم توليد باركود جديد فريد لكل منتج محدد"
                  : "A new unique barcode will be generated for each selected product"}
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-4 justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="rounded"
              onClick={() => {
                setIsBulkEditOpen(false);
                setBulkEditRegenBarcode(false);
              }}
            >
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              size="sm"
              className="rounded min-w-24"
              onClick={handleBulkEdit}
              disabled={bulkEditApplying}
            >
              {bulkEditApplying
                ? language === "ar"
                  ? "جاري الحفظ..."
                  : "Saving..."
                : language === "ar"
                  ? "تطبيق على الكل"
                  : "Apply to All"}
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
                <TableHead>
                  {language === "ar" ? "الفئة الفرعية" : "Subcategory"}
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
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
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
                            title={language === "ar" ? "عرض الصور" : "View photos"}
                          >
                            <img
                              src={optimizeCloudinaryUrl(p.mainImage, 120) || p.mainImage}
                              alt={p.name}
                              width={48}
                              height={64}
                              loading="lazy"
                              decoding="async"
                              className="w-12 h-16 object-cover bg-secondary rounded group-hover:opacity-75 transition-opacity"
                            />
                            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Plus className="w-5 h-5 text-white drop-shadow" strokeWidth={2.5} />
                            </span>
                          </button>
                        </div>
                      </TableCell>
                      <TableCell
                        className="font-mono text-xs text-muted-foreground whitespace-nowrap"
                        data-testid={`text-product-num-${p.id}`}
                      >
                        #{String(p.id).padStart(4, "0")}
                      </TableCell>
                      <TableCell
                        className="font-medium cursor-pointer hover:text-primary hover:underline underline-offset-2 transition-colors"
                        onClick={(e) => openNameEditPopup(e, p.id, p.name)}
                        title={language === "ar" ? "انقر للتعديل" : "Click to edit"}
                      >
                        {p.name}
                      </TableCell>
                      <TableCell
                        className="cursor-pointer"
                        onClick={(e) => openCategoryEditPopup(e, p.id, p.categoryId ?? null)}
                        title={language === "ar" ? "انقر للتعديل" : "Click to edit"}
                      >
                        {(() => {
                          const cat = categories?.find(
                            (c) => c.id === p.categoryId,
                          );
                          return cat ? (
                            <span className="text-xs bg-secondary px-2 py-1 whitespace-nowrap rounded hover:bg-primary/10 hover:text-primary transition-colors">
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
                      <TableCell
                        className="cursor-pointer"
                        onClick={(e) =>
                          openSubcategoryEditPopup(
                            e,
                            p.id,
                            p.categoryId ?? null,
                            (p as any).subcategoryId ?? null,
                          )
                        }
                        title={language === "ar" ? "انقر للتعديل" : "Click to edit"}
                      >
                        {(() => {
                          const sub = subcategoriesData?.find(
                            (s: any) => s.id === (p as any).subcategoryId,
                          );
                          return sub ? (
                            <span className="text-xs bg-secondary px-2 py-1 whitespace-nowrap rounded hover:bg-primary/10 hover:text-primary transition-colors">
                              {language === "ar"
                                ? sub.nameAr || sub.name
                                : sub.name}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell
                        className="cursor-pointer hover:text-primary font-medium transition-colors"
                        onClick={(e) => openPriceEditPopup(e, p.id, p.price, (p as any).discountPrice)}
                        title={language === "ar" ? "انقر للتعديل" : "Click to edit"}
                      >
                        {(p as any).discountPrice ? (
                          <span className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="text-destructive">
                              ₪{parseFloat((p as any).discountPrice.toString()).toFixed(2)}
                            </span>
                            <span className="text-muted-foreground line-through text-xs font-normal">
                              ₪{parseFloat(p.price.toString()).toFixed(2)}
                            </span>
                          </span>
                        ) : (
                          <>₪{parseFloat(p.price.toString()).toFixed(2)}</>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {cv && cv.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {cv.map((v, i) => (
                              <button
                                key={i}
                                type="button"
                                className="w-5 h-5 rounded-full border border-border inline-block cursor-pointer hover:scale-125 hover:ring-2 hover:ring-primary/60 transition-all"
                                style={{ backgroundColor: v.colorCode }}
                                title={`${v.name} — ${language === "ar" ? "انقر للتعديل" : "Click to edit"}`}
                                onClick={(e) =>
                                  openColorEditPopup(e, p.id, i, v.name, v.colorCode)
                                }
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {cv && cv.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {cv.map((v, i) => {
                              const variantTotal = Object.values(
                                v.sizeInventory,
                              ).reduce((s, q) => s + q, 0);
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={(e) =>
                                    openStockPopup(
                                      e,
                                      p.id,
                                      v.name,
                                      v.colorCode,
                                      v.sizeInventory,
                                      p.categoryId ?? undefined,
                                    )
                                  }
                                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium cursor-pointer transition-opacity hover:opacity-75 ${variantTotal > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                                  title={
                                    language === "ar"
                                      ? "انقر لتعديل الكمية"
                                      : "Click to edit quantity"
                                  }
                                >
                                  {v.name}:{variantTotal}
                                </button>
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
                        <QuickBarcodeEditor
                          product={p}
                          language={language}
                          onSave={handleQuickBarcodeSave}
                          onSaveColor={handleQuickColorBarcodeSave}
                        />
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
                          onClick={() => handleDownloadMainPhotos([p.id])}
                          disabled={downloadingPhotoIds.has(p.id)}
                          className="text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                          title={
                            language === "ar"
                              ? "تحميل الصور الرئيسية بدون علامة مائية"
                              : "Download main photos without watermark"
                          }
                          data-testid={`button-download-main-photos-${p.id}`}
                        >
                          {downloadingPhotoIds.has(p.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
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

      {/* Bulk Upload View */}
      {viewMode === "bulk-upload" && <BulkUploadTab />}

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
                    <div className="relative inline-block flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const imgs = getProductImages(p);
                          if (imgs.length)
                            setPhotoPreview({
                              images: imgs,
                              name: p.name,
                              idx: 0,
                            });
                        }}
                        className="block focus:outline-none group relative"
                        data-testid={`button-photo-preview-mobile-${p.id}`}
                      >
                        <img
                          src={optimizeCloudinaryUrl(p.mainImage, 160) || p.mainImage}
                          alt={p.name}
                          width={64}
                          height={80}
                          loading="lazy"
                          decoding="async"
                          className="w-16 h-20 object-cover bg-secondary rounded group-hover:opacity-75 transition-opacity"
                        />
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Plus className="w-5 h-5 text-white drop-shadow" strokeWidth={2.5} />
                        </span>
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        #{String(p.id).padStart(4, "0")}
                      </span>
                      <p
                        className="font-semibold text-sm truncate cursor-pointer hover:text-primary hover:underline underline-offset-2 transition-colors"
                        onClick={(e) => openNameEditPopup(e, p.id, p.name)}
                        title={language === "ar" ? "انقر للتعديل" : "Click to edit"}
                      >
                        {p.name}
                      </p>
                      {(() => {
                        const cat = categories?.find(
                          (c) => c.id === p.categoryId,
                        );
                        return cat ? (
                          <span
                            className="text-[10px] bg-secondary px-1.5 py-0.5 inline-block mt-0.5 rounded cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                            onClick={(e) => openCategoryEditPopup(e, p.id, p.categoryId ?? null)}
                          >
                            {language === "ar"
                              ? cat.nameAr || cat.name
                              : cat.name}
                          </span>
                        ) : null;
                      })()}
                      {(() => {
                        const sub = subcategoriesData?.find(
                          (s: any) => s.id === (p as any).subcategoryId,
                        );
                        return (
                          <span
                            className="text-[10px] bg-secondary px-1.5 py-0.5 inline-block mt-0.5 ms-1 rounded cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                            onClick={(e) =>
                              openSubcategoryEditPopup(
                                e,
                                p.id,
                                p.categoryId ?? null,
                                (p as any).subcategoryId ?? null,
                              )
                            }
                          >
                            {sub
                              ? language === "ar"
                                ? sub.nameAr || sub.name
                                : sub.name
                              : language === "ar"
                                ? "+ فئة فرعية"
                                : "+ Subcategory"}
                          </span>
                        );
                      })()}
                      <p
                        className="text-sm font-bold mt-1 cursor-pointer hover:text-primary transition-colors"
                        onClick={(e) => openPriceEditPopup(e, p.id, p.price, (p as any).discountPrice)}
                        title={language === "ar" ? "انقر للتعديل" : "Click to edit"}
                      >
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
                    <div
                      className="flex flex-wrap gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {cv && cv.length > 0 ? (
                        cv.map((v, i) => {
                          const variantTotal = Object.values(
                            v.sizeInventory,
                          ).reduce((s, q) => s + q, 0);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={(e) =>
                                openStockPopup(
                                  e,
                                  p.id,
                                  v.name,
                                  v.colorCode,
                                  v.sizeInventory,
                                  p.categoryId ?? undefined,
                                )
                              }
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-opacity hover:opacity-75 ${variantTotal > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                              title={
                                language === "ar"
                                  ? "انقر لتعديل الكمية"
                                  : "Click to edit quantity"
                              }
                            >
                              {v.name}:{variantTotal}
                            </button>
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
                      <QuickBarcodeEditor
                        product={p}
                        language={language}
                        onSave={handleQuickBarcodeSave}
                        onSaveColor={handleQuickColorBarcodeSave}
                        buttonClassName="text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 h-8 w-8"
                      />
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
                        onClick={() => handleDownloadMainPhotos([p.id])}
                        disabled={downloadingPhotoIds.has(p.id)}
                        className="text-slate-600 h-8 w-8"
                        title={
                          language === "ar"
                            ? "تحميل الصور الرئيسية بدون علامة مائية"
                            : "Download main photos without watermark"
                        }
                        data-testid={`button-download-main-photos-mobile-${p.id}`}
                      >
                        {downloadingPhotoIds.has(p.id) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
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
            {/* ─── AI Autofill Banner ─── */}
            <div className="flex items-center gap-2 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <Wand2 className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs text-muted-foreground flex-1">
                {language === "ar"
                  ? "أضف صورة أولاً ثم اضغط لملء البيانات تلقائياً"
                  : "Add an image first, then click to autofill"}
              </span>
              <div className="flex items-center gap-1 shrink-0 rounded-full border border-border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => switchAiProvider("gemini")}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
                    aiProvider === "gemini"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Google Gemini"
                >
                  <Sparkles className="w-3 h-3" />
                  Gemini
                </button>
                <button
                  type="button"
                  onClick={() => switchAiProvider("ollama")}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
                    aiProvider === "ollama"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="Ollama (local)"
                >
                  <Bot className="w-3 h-3" />
                  Ollama
                </button>
              </div>
              <button
                type="button"
                onClick={handleAiAutofill}
                disabled={aiAutofilling}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all shrink-0"
              >
                {aiAutofilling ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5" />
                )}
                {language === "ar" ? "ملء تلقائي" : "Autofill"}
              </button>
            </div>

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
                        subcategoryIds: [],
                      });
                      // Auto-fill the standard size grid whenever the
                      // category changes to a known shoe/clothing category —
                      // for brand-new products AND when re-categorizing an
                      // existing product. Categories we don't have a known
                      // size template for are left untouched so we never
                      // wipe out real stock data by accident.
                      const defaults = getDefaultSizes(newCatId);
                      if (defaults.length > 0) {
                        setVariants((prev) =>
                          prev.map((v) => ({ ...v, sizeRows: defaults })),
                        );
                      }
                    }}
                    data-testid="select-category"
                  >
                    <option value="">
                      {language === "ar" ? "بدون تصنيف" : "No category"}
                    </option>
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameAr ? `${c.nameAr} — ${c.name}` : c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {language === "ar" ? "التصنيفات الفرعية" : "Subcategories"}
                    <span className="normal-case font-normal text-muted-foreground/60 ms-1">
                      (
                      {language === "ar"
                        ? "اختر واحد أو أكثر"
                        : "select one or more"}
                      )
                    </span>
                  </label>
                  {(() => {
                    const subs = (subcategoriesData || []).filter(
                      (s: any) => s.categoryId === Number(formData.categoryId),
                    );
                    const selected: number[] = Array.isArray(
                      formData.subcategoryIds,
                    )
                      ? formData.subcategoryIds.map((x: any) => Number(x))
                      : [];
                    if (subs.length === 0) {
                      return (
                        <div className="text-xs text-muted-foreground border border-dashed border-input rounded-md px-3 py-2">
                          {language === "ar"
                            ? "لا توجد تصنيفات فرعية لهذه الفئة"
                            : "No subcategories for this category"}
                        </div>
                      );
                    }
                    return (
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto rounded-md border border-input bg-background p-2">
                        {subs.map((s: any) => {
                          const isOn = selected.includes(s.id);
                          return (
                            <button
                              type="button"
                              key={s.id}
                              onClick={() => {
                                const next = isOn
                                  ? selected.filter((x) => x !== s.id)
                                  : [...selected, s.id];
                                setFormData({
                                  ...formData,
                                  subcategoryIds: next,
                                  subcategoryId:
                                    next.length > 0 ? String(next[0]) : "",
                                });
                              }}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                isOn
                                  ? "bg-foreground text-background border-foreground"
                                  : "bg-background text-foreground border-input hover:border-foreground/40"
                              }`}
                              data-testid={`toggle-subcategory-${s.id}`}
                            >
                              {s.nameAr ? `${s.nameAr} — ${s.name}` : s.name}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
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

                  {/* Barcode preview / scan target — click it, then scan a
                      new barcode (or type one + Enter) to replace instantly.
                      No extra steps: click → scan → done. */}
                  <div
                    onClick={() => {
                      setFormData({ ...formData, barcode: "" });
                      setBarcodeScanMode(true);
                      requestAnimationFrame(() =>
                        barcodeInputRef.current?.focus(),
                      );
                    }}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-3 py-3 cursor-pointer transition-all ${
                      barcodeScanMode
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : formData.barcode
                          ? "border-border bg-white hover:border-primary/50"
                          : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-muted/40"
                    }`}
                    title={
                      language === "ar"
                        ? "انقر ثم امسح الباركود الجديد ليتم استبداله فوراً"
                        : "Click, then scan a new barcode to replace it instantly"
                    }
                    data-testid="barcode-scan-target"
                  >
                    {barcodeScanMode ? (
                      <div className="flex flex-col items-center gap-1.5 py-3">
                        <Barcode className="w-6 h-6 text-primary animate-pulse" />
                        <span className="text-xs font-semibold text-primary">
                          {language === "ar"
                            ? "جاهز — امسح الباركود الآن"
                            : "Ready — scan the barcode now"}
                        </span>
                      </div>
                    ) : formData.barcode ? (
                      <>
                        <div className="bg-white rounded px-2 py-1 w-full max-w-[240px]">
                          <BarcodeSvg value={formData.barcode} />
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {language === "ar"
                            ? "انقر لمسح باركود جديد واستبداله"
                            : "Click to scan and replace it"}
                        </span>
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 py-3 text-muted-foreground">
                        <Barcode className="w-6 h-6" />
                        <span className="text-xs font-medium">
                          {language === "ar"
                            ? "انقر أو امسح لإضافة باركود"
                            : "Click or scan to add a barcode"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1.5">
                    <Input
                      ref={barcodeInputRef}
                      value={formData.barcode}
                      onChange={(e) =>
                        setFormData({ ...formData, barcode: e.target.value })
                      }
                      onFocus={() => setBarcodeScanMode(true)}
                      onBlur={() => setBarcodeScanMode(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setBarcodeScanMode(false);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="rounded-md font-mono flex-1 text-xs"
                      placeholder={
                        language === "ar"
                          ? "أو اكتب الباركود يدوياً هنا"
                          : "Or type the barcode manually"
                      }
                      data-testid="input-barcode"
                    />
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
                          style={
                            family.swatch
                              ? { backgroundImage: family.swatch }
                              : { backgroundColor: family.hex }
                          }
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
                          {family.members
                            .filter((member) => !member.aliasOnly)
                            .map((member) => {
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

                      <div className="space-y-1.5">
                        <label className="text-xs font-medium flex items-center gap-1">
                          {language === "ar"
                            ? "باركود إضافي لهذا اللون"
                            : "Additional barcode for this color"}
                          <span className="font-normal text-muted-foreground/60">
                            ({language === "ar" ? "اختياري" : "optional"})
                          </span>
                        </label>
                        {/* Same click → scan → done pattern as the main barcode
                            field above, scoped to just this color. Some products
                            ship each color under its own physical barcode — this
                            captures it without leaving the variant card. */}
                        <div
                          onClick={() => {
                            updateVariant(vIdx, { barcode: "" });
                            setVariantBarcodeScanIdx(vIdx);
                            requestAnimationFrame(() =>
                              variantBarcodeInputRefs.current[vIdx]?.focus(),
                            );
                          }}
                          className={`flex items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-2 cursor-pointer transition-all ${
                            variantBarcodeScanIdx === vIdx
                              ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                              : variant.barcode
                                ? "border-border bg-white hover:border-primary/50"
                                : "border-border/60 bg-muted/20 hover:border-primary/40"
                          }`}
                          data-testid={`variant-barcode-scan-target-${vIdx}`}
                        >
                          {variantBarcodeScanIdx === vIdx ? (
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-primary py-1">
                              <Barcode className="w-4 h-4 animate-pulse" />
                              {language === "ar" ? "جاهز — امسح الآن" : "Ready — scan now"}
                            </span>
                          ) : variant.barcode ? (
                            <div className="w-full max-w-[220px]">
                              <BarcodeSvg value={variant.barcode} />
                            </div>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
                              <Barcode className="w-4 h-4" />
                              {language === "ar"
                                ? "انقر أو امسح لإضافة باركود لهذا اللون"
                                : "Click or scan to add this color's barcode"}
                            </span>
                          )}
                        </div>
                        <Input
                          ref={(el) => {
                            variantBarcodeInputRefs.current[vIdx] = el;
                          }}
                          value={variant.barcode || ""}
                          onChange={(e) =>
                            updateVariant(vIdx, { barcode: e.target.value })
                          }
                          onFocus={() => setVariantBarcodeScanIdx(vIdx)}
                          onBlur={() =>
                            setVariantBarcodeScanIdx((cur) => (cur === vIdx ? null : cur))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              setVariantBarcodeScanIdx(null);
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="rounded-md font-mono text-xs h-8"
                          placeholder={
                            language === "ar"
                              ? "أو اكتب يدوياً ثم Enter"
                              : "Or type manually + Enter"
                          }
                          data-testid={`input-variant-barcode-${vIdx}`}
                        />
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
                                  style={
                                    family.swatch
                                      ? { backgroundImage: family.swatch }
                                      : { backgroundColor: family.hex }
                                  }
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
                          <div className="flex items-center gap-2">
                            {variant.media.filter((m) => m.type === "image")
                              .length > 0 && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                {language === "ar"
                                  ? "الأولى = رئيسية · اضغط النجمة لتغيير الرئيسية"
                                  : "1st = main · tap ★ to change main"}
                              </span>
                            )}
                            {variant.mainImage && (
                              <button
                                type="button"
                                disabled={generatingPhotoKeys.has(`${vIdx}-mainbtn`)}
                                onClick={() =>
                                  generateAiPhotosForVariant(vIdx, variant.mainImage, `${vIdx}-mainbtn`)
                                }
                                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition-colors disabled:opacity-60"
                                data-testid={`button-generate-ai-main-photo-${vIdx}`}
                              >
                                {generatingPhotoKeys.has(`${vIdx}-mainbtn`) ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Wand2 className="w-3 h-3" />
                                )}
                                {language === "ar" ? "توليد صورتين (موديل + منتج)" : "Generate AI photos (model + product)"}
                              </button>
                            )}
                          </div>
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
                              const photoKey = `${vIdx}-${mediaIdx}`;
                              const isGeneratingThis = generatingPhotoKeys.has(photoKey);
                              return (
                                <div key={mediaIdx} className="relative group">
                                  <img
                                    src={item.url}
                                    alt=""
                                    onClick={() => setPreviewImageUrl(item.url)}
                                    onLoad={(e) => {
                                      const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                                      if (w && h) {
                                        setPhotoNaturalSizes((prev) =>
                                          prev[item.url]?.w === w ? prev : { ...prev, [item.url]: { w, h } },
                                        );
                                      }
                                    }}
                                    className={`w-20 h-24 object-cover rounded-lg transition-all cursor-zoom-in ${isMain ? "ring-2 ring-offset-1 ring-yellow-400" : "ring-1 ring-border"} ${isGeneratingThis ? "opacity-40" : ""}`}
                                    data-testid={`img-preview-thumb-${vIdx}-${mediaIdx}`}
                                  />
                                  {/* Low-resolution warning — this photo's original upload is small
                                      enough that it may look soft/blurry on the full product page.
                                      Purely informational: nothing about the photo is changed. */}
                                  {photoNaturalSizes[item.url] &&
                                    Math.max(photoNaturalSizes[item.url].w, photoNaturalSizes[item.url].h) < LOW_RES_THRESHOLD && (
                                      <div
                                        className="absolute bottom-1 start-0.5 z-10 bg-amber-500 text-white text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-wide pointer-events-none"
                                        title={
                                          language === "ar"
                                            ? `دقة منخفضة: ${photoNaturalSizes[item.url].w}×${photoNaturalSizes[item.url].h}px`
                                            : `Low resolution: ${photoNaturalSizes[item.url].w}×${photoNaturalSizes[item.url].h}px`
                                        }
                                        data-testid={`badge-low-res-${vIdx}-${mediaIdx}`}
                                      >
                                        {language === "ar" ? "دقة منخفضة" : "Low-res"}
                                      </div>
                                    )}
                                  {isGeneratingThis && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                      <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                    </div>
                                  )}
                                  {/* Main badge */}
                                  {isMain && (
                                    <div className="absolute top-0 inset-x-0 bg-yellow-400 text-yellow-900 text-[8px] font-bold text-center py-0.5 rounded-t-lg pointer-events-none uppercase tracking-wider">
                                      {language === "ar" ? "رئيسية" : "MAIN"}
                                    </div>
                                  )}
                                  {/* Generate AI model + product photos from this image */}
                                  <button
                                    type="button"
                                    title={
                                      language === "ar"
                                        ? "توليد صورة بموديل وصورة منتج نظيفة"
                                        : "Generate model + product AI photos from this"
                                    }
                                    disabled={isGeneratingThis}
                                    onClick={() =>
                                      generateAiPhotosForVariant(vIdx, item.url, photoKey)
                                    }
                                    className="absolute bottom-1 end-0.5 z-10 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary disabled:opacity-100"
                                    data-testid={`button-generate-ai-photo-${vIdx}-${mediaIdx}`}
                                  >
                                    {isGeneratingThis ? (
                                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                    ) : (
                                      <Wand2 className="w-2.5 h-2.5" />
                                    )}
                                  </button>
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

                      {/* URL paste row — Photos */}
                      <div className="flex gap-1.5 mt-2">
                        <input
                          type="url"
                          value={mediaUrlInputs[`${vIdx}-image`] || ""}
                          onChange={(e) =>
                            setMediaUrlInputs((prev) => ({
                              ...prev,
                              [`${vIdx}-image`]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddMediaUrl(vIdx, "image");
                            }
                          }}
                          placeholder={
                            language === "ar"
                              ? "الصق رابط صورة أو أكثر (مفصولة بفاصلة)"
                              : "Paste image URL(s), comma-separated"
                          }
                          className="flex-1 h-8 rounded-md border border-border bg-background px-2.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddMediaUrl(vIdx, "image")}
                          disabled={
                            !(mediaUrlInputs[`${vIdx}-image`] || "").trim()
                          }
                          className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
                        >
                          {language === "ar" ? "إضافة" : "Add"}
                        </button>
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
                                    poster={item.poster}
                                    muted
                                    playsInline
                                    loop
                                    autoPlay
                                    preload="none"
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

                      {/* URL paste row — Videos */}
                      <div className="flex gap-1.5 mt-2">
                        <input
                          type="url"
                          value={mediaUrlInputs[`${vIdx}-video`] || ""}
                          onChange={(e) =>
                            setMediaUrlInputs((prev) => ({
                              ...prev,
                              [`${vIdx}-video`]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddMediaUrl(vIdx, "video");
                            }
                          }}
                          placeholder={
                            language === "ar"
                              ? "الصق رابط فيديو أو أكثر (مفصولة بفاصلة)"
                              : "Paste video URL(s), comma-separated"
                          }
                          className="flex-1 h-8 rounded-md border border-border bg-background px-2.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => handleAddMediaUrl(vIdx, "video")}
                          disabled={
                            !(mediaUrlInputs[`${vIdx}-video`] || "").trim()
                          }
                          className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0"
                        >
                          {language === "ar" ? "إضافة" : "Add"}
                        </button>
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
                        {(() => {
                          const suggestions = getSizeSuggestions(
                            variant.sizeRows.map((r) => r.size),
                          );
                          if (suggestions.length === 0) return null;
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-semibold uppercase text-muted-foreground shrink-0">
                                {language === "ar" ? "اقتراح سريع:" : "Quick add:"}
                              </span>
                              {suggestions.map((sz) => (
                                <button
                                  key={sz}
                                  type="button"
                                  onClick={() => quickAddSizeToVariant(vIdx, sz)}
                                  className="px-2.5 py-1 text-xs font-semibold border border-dashed border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors rounded-full flex items-center gap-1"
                                  data-testid={`button-quick-add-size-${vIdx}-${sz}`}
                                >
                                  <Plus className="w-3 h-3" /> {sz}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
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

      {/* ── Image Preview Lightbox ── */}
      <Dialog
        open={!!previewImageUrl}
        onOpenChange={(open) => !open && setPreviewImageUrl(null)}
      >
        <DialogContent
          hideClose
          onClick={() => setPreviewImageUrl(null)}
          className="w-[calc(100%-1rem)] sm:max-w-3xl p-0 overflow-hidden bg-transparent border-none shadow-none flex items-center justify-center cursor-zoom-out"
          data-testid="dialog-image-preview"
        >
          <DialogTitle className="sr-only">
            {language === "ar" ? "معاينة الصورة" : "Image preview"}
          </DialogTitle>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewImageUrl(null);
            }}
            className="fixed top-4 end-4 z-50 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors"
            data-testid="button-close-image-preview"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
            <span className="sr-only">{language === "ar" ? "إغلاق" : "Close"}</span>
          </button>
          {previewImageUrl && (
            <img
              src={previewImageUrl}
              alt=""
              className="max-h-[85vh] w-auto max-w-full object-contain rounded-lg"
              data-testid="img-preview-full"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Excel Bulk Import Dialog ── */}
      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent
          className="w-[calc(100%-1rem)] sm:max-w-3xl rounded-md p-0 overflow-hidden flex flex-col max-h-[92vh]"
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
                    {(() => {
                      const total =
                        importResult.created + (importResult.updated ?? 0);
                      return (
                        <div
                          className={`text-center py-8 px-6 rounded-md ${total > 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}
                        >
                          <div
                            className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${total > 0 ? "bg-green-100" : "bg-amber-100"}`}
                          >
                            {total > 0 ? (
                              <Check className="w-8 h-8 text-green-600" />
                            ) : (
                              <AlertCircle className="w-8 h-8 text-amber-600" />
                            )}
                          </div>
                          {importResult.created > 0 && (
                            <p
                              className={`text-2xl font-display font-bold ${total > 0 ? "text-green-800" : "text-amber-800"}`}
                            >
                              {importResult.created}
                              <span className="text-base font-normal ml-1">
                                {language === "ar" ? "منتج جديد" : "new"}
                              </span>
                            </p>
                          )}
                          {(importResult.updated ?? 0) > 0 && (
                            <p
                              className={`text-2xl font-display font-bold ${total > 0 ? "text-green-800" : "text-amber-800"}`}
                            >
                              {importResult.updated}
                              <span className="text-base font-normal ml-1">
                                {language === "ar"
                                  ? "منتج تم تحديثه"
                                  : "updated"}
                              </span>
                            </p>
                          )}
                          {total === 0 && (
                            <p className="text-2xl font-display font-bold text-amber-800">
                              0
                            </p>
                          )}
                          <p
                            className={`text-sm mt-1 ${total > 0 ? "text-green-700" : "text-amber-700"}`}
                          >
                            {language === "ar"
                              ? "تمت المعالجة بنجاح"
                              : "processed successfully"}
                          </p>
                          {importResult.errors.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-2">
                              {language === "ar"
                                ? `${importResult.errors.length} صف يحتوي على أخطاء`
                                : `${importResult.errors.length} row(s) with errors`}
                            </p>
                          )}
                        </div>
                      );
                    })()}

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
            setBarcodeCategoryFilter("");
            setBarcodeSubcategoryFilter("");
            setSelectedBarcodeIds(new Set());
            setBarcodePhotoPreview(null);
          }
        }}
      >
        <DialogContent
          className="w-[calc(100%-1rem)] sm:max-w-3xl max-h-[88vh] overflow-hidden flex flex-col gap-0 p-0"
          onEscapeKeyDown={(e) => {
            // Let Escape close just the picture first; a second press (once
            // the lightbox is gone) closes the barcode dialog as usual.
            if (barcodePhotoPreview) {
              e.preventDefault();
              setBarcodePhotoPreview(null);
            }
          }}
        >
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
            <div className="flex flex-wrap gap-2">
              <Select
                value={barcodeCategoryFilter === "" ? "all" : String(barcodeCategoryFilter)}
                onValueChange={(v) => {
                  setBarcodeCategoryFilter(v === "all" ? "" : Number(v));
                  setBarcodeSubcategoryFilter("");
                }}
              >
                <SelectTrigger
                  className="w-full sm:w-48 h-8 text-xs rounded-full border-border bg-background shadow-sm hover:border-foreground/40"
                  data-testid="select-barcode-category-filter"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {language === "ar" ? "كل الفئات" : "All Categories"}
                  </SelectItem>
                  {categories?.map((cat) => {
                    const label = language === "ar" ? cat.nameAr || cat.name : cat.name;
                    return (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Select
                value={barcodeSubcategoryFilter === "" ? "all" : String(barcodeSubcategoryFilter)}
                onValueChange={(v) => setBarcodeSubcategoryFilter(v === "all" ? "" : Number(v))}
              >
                <SelectTrigger
                  className="w-full sm:w-48 h-8 text-xs rounded-full border-border bg-background shadow-sm hover:border-foreground/40"
                  data-testid="select-barcode-subcategory-filter"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {language === "ar" ? "كل التصنيفات الفرعية" : "All Subcategories"}
                  </SelectItem>
                  {(subcategoriesData || [])
                    .filter((s: any) => barcodeCategoryFilter === "" || s.categoryId === barcodeCategoryFilter)
                    .map((s: any) => {
                      const label = language === "ar" ? s.nameAr || s.name : s.name;
                      return (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {label}
                        </SelectItem>
                      );
                    })}
                </SelectContent>
              </Select>
              {(barcodeCategoryFilter !== "" || barcodeSubcategoryFilter !== "") && (
                <button
                  type="button"
                  onClick={() => {
                    setBarcodeCategoryFilter("");
                    setBarcodeSubcategoryFilter("");
                  }}
                  className="flex items-center gap-1.5 h-8 px-3 text-[11px] font-medium text-muted-foreground border border-transparent hover:text-foreground hover:border-border hover:bg-background rounded-full transition-colors"
                  data-testid="button-clear-barcode-filters"
                >
                  <FilterX className="w-3.5 h-3.5" />
                  {language === "ar" ? "مسح الفلاتر" : "Clear filters"}
                </button>
              )}
            </div>
            {(() => {
              const allWithBarcode = barcodeEligibleProducts;
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
              const allWithBarcode = barcodeEligibleProducts;
              if (allWithBarcode.length === 0) {
                return (
                  <div className="py-16 text-center text-muted-foreground text-sm">
                    {barcodeSearch || barcodeCategoryFilter !== "" || barcodeSubcategoryFilter !== ""
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
                        {(() => {
                          const colorVariants = ((p as any).colorVariants || []) as { name: string; colorCode: string }[];
                          const thumb = (p as any).mainImage || "";
                          const uniqueColorCount = new Set(
                            colorVariants.map((v) => v.name.trim()).filter(Boolean),
                          ).size;
                          return (
                            <div className="flex flex-col items-center gap-1 w-full mb-0.5">
                              {thumb && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    // Opens the lightbox that's rendered inside
                                    // this dialog's own DialogContent — so it
                                    // closes on its own without ever touching
                                    // the barcode print dialog underneath it.
                                    e.stopPropagation();
                                    const imgs = getProductImages(p as any);
                                    setBarcodePhotoPreview({
                                      images: imgs.length ? imgs : [thumb],
                                      name: p.name,
                                      idx: 0,
                                    });
                                  }}
                                  className="block focus:outline-none group relative"
                                  title={language === "ar" ? "عرض الصورة" : "View photo"}
                                  data-testid={`button-barcode-photo-preview-${p.id}`}
                                >
                                  <img
                                    src={optimizeCloudinaryUrl(thumb, 100) || thumb}
                                    alt={p.name}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-11 h-11 rounded object-cover bg-secondary border border-border transition-transform group-hover:scale-105"
                                    data-testid={`img-barcode-thumb-${p.id}`}
                                  />
                                  <span className="absolute inset-0 rounded bg-black/0 group-hover:bg-black/10 transition-colors" />
                                </button>
                              )}
                              {uniqueColorCount > 1 && (
                                <span
                                  className="text-[8px] font-semibold text-primary/80 leading-none"
                                  data-testid={`label-count-${p.id}`}
                                >
                                  {language === "ar"
                                    ? `${uniqueColorCount} ملصقات`
                                    : `×${uniqueColorCount} labels`}
                                </span>
                              )}
                              {colorVariants.length > 1 && (
                                <div
                                  className="flex items-center gap-0.5 flex-wrap justify-center max-w-full"
                                  title={
                                    language === "ar"
                                      ? `${colorVariants.length} ألوان متاحة`
                                      : `${colorVariants.length} colors available`
                                  }
                                  data-testid={`indicator-colors-${p.id}`}
                                >
                                  {colorVariants.slice(0, 6).map((v, i) => (
                                    <span
                                      key={i}
                                      className="w-2.5 h-2.5 rounded-full border border-border shrink-0"
                                      style={{ backgroundColor: v.colorCode }}
                                      title={v.name}
                                    />
                                  ))}
                                  {colorVariants.length > 6 && (
                                    <span className="text-[8px] font-semibold text-muted-foreground leading-none">
                                      +{colorVariants.length - 6}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        <div className="w-full bg-white rounded overflow-hidden">
                          {(p as any).barcode && (
                            <BarcodeSvg value={(p as any).barcode} />
                          )}
                        </div>
                        <span
                          className="text-[10px] font-semibold tracking-widest uppercase text-foreground w-full text-center"
                          style={{
                            fontFamily: "Georgia, serif",
                            letterSpacing: "1.5px",
                          }}
                        >
                          Lucerne Boutique
                        </span>
                        <span className="text-[9px] text-foreground truncate w-full text-center">
                          {p.name}
                        </span>
                        {(() => {
                          const hasDiscount = p.discountPrice && Number(p.discountPrice) > 0;
                          const displayPrice = hasDiscount
                            ? Number(p.discountPrice).toFixed(0)
                            : p.price ? Number(p.price).toFixed(0) : null;
                          if (!displayPrice) return null;
                          return (
                            <div className="flex items-center justify-center gap-1.5 w-full">
                              {hasDiscount && (
                                <span className="text-[9px] text-foreground line-through">
                                  ₪{Number(p.price).toFixed(0)}
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-foreground">
                                ₪{displayPrice}
                              </span>
                            </div>
                          );
                        })()}
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
                  ? `${selectedBarcodeIds.size} منتج محدد — ${totalBarcodeLabelsToPrint} ملصق للطباعة`
                  : `${selectedBarcodeIds.size} product(s) selected — ${totalBarcodeLabelsToPrint} label(s) to print`
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
                      price: p.price ?? null,
                      discountPrice: p.discountPrice ?? null,
                      colorVariants: (
                        ((p as any).colorVariants || []) as { name: string; barcode?: string }[]
                      ).map((v) => ({ name: v.name, barcode: v.barcode })),
                    }));
                  printBarcodeLabels(toPrint);
                }}
                data-testid="button-print-barcodes-confirm"
              >
                <Printer className="w-4 h-4" />
                {language === "ar"
                  ? `طباعة${totalBarcodeLabelsToPrint > 0 ? ` (${totalBarcodeLabelsToPrint})` : ""}`
                  : `Print${totalBarcodeLabelsToPrint > 0 ? ` (${totalBarcodeLabelsToPrint})` : ""}`}
              </Button>
            </div>
          </div>

          {/* ── Photo lightbox — lives INSIDE this DialogContent so Radix
              treats every interaction with it as happening inside the
              dialog. Clicking anywhere on it (backdrop, image, X, arrows)
              only ever closes the picture; the barcode dialog underneath
              is never touched. Same pattern as the order-photo lightbox
              in admin/Orders.tsx. ── */}
          {barcodePhotoPreview && (
            <div
              className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center"
              onClick={() => setBarcodePhotoPreview(null)}
              data-testid="barcode-photo-lightbox"
            >
              {/* Close + counter */}
              <div className="absolute top-4 inset-x-0 flex items-center justify-between px-5 z-10">
                <span className="text-white/70 text-sm font-medium max-w-[60%] truncate">
                  {barcodePhotoPreview.name}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-white/50 text-sm">
                    {barcodePhotoPreview.idx + 1} /{" "}
                    {barcodePhotoPreview.images.length}
                  </span>
                  <button
                    onClick={() => setBarcodePhotoPreview(null)}
                    className="text-white/70 hover:text-white p-1"
                    data-testid="button-barcode-lightbox-close"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Main image */}
              <div className="relative flex items-center justify-center w-full h-full px-16">
                {/* Prev */}
                {barcodePhotoPreview.images.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setBarcodePhotoPreview((prev) =>
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
                    data-testid="button-barcode-lightbox-prev"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                )}

                <img
                  src={barcodePhotoPreview.images[barcodePhotoPreview.idx]}
                  alt={barcodePhotoPreview.name}
                  className="max-h-[80vh] max-w-full object-contain rounded shadow-2xl select-none"
                  data-testid="barcode-lightbox-image"
                  onClick={(e) => e.stopPropagation()}
                />

                {/* Next */}
                {barcodePhotoPreview.images.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setBarcodePhotoPreview((prev) =>
                        prev
                          ? { ...prev, idx: (prev.idx + 1) % prev.images.length }
                          : null,
                      );
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center text-white transition-colors"
                    data-testid="button-barcode-lightbox-next"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                )}
              </div>

              {/* Thumbnail strip */}
              {barcodePhotoPreview.images.length > 1 && (
                <div
                  className="absolute bottom-4 inset-x-0 flex justify-center gap-2 px-4 overflow-x-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  {barcodePhotoPreview.images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        setBarcodePhotoPreview((prev) =>
                          prev ? { ...prev, idx: i } : null,
                        )
                      }
                      className={`w-14 h-14 flex-shrink-0 rounded overflow-hidden border-2 transition-all ${
                        i === barcodePhotoPreview.idx
                          ? "border-white opacity-100"
                          : "border-transparent opacity-50 hover:opacity-80"
                      }`}
                      data-testid={`button-barcode-lightbox-thumb-${i}`}
                    >
                      <img
                        src={optimizeCloudinaryUrl(img, 120) || img}
                        alt=""
                        width={56}
                        height={56}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
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
                    src={optimizeCloudinaryUrl(img, 120) || img}
                    alt=""
                    width={56}
                    height={56}
                    loading="lazy"
                    decoding="async"
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
