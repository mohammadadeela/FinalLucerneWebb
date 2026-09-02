import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import {
  COLOR_FAMILIES,
  type ColorFamily,
  type ColorMember,
} from "@/lib/colorFamilies";
import {
  CloudUpload, Download, Upload, Sparkles, CheckSquare, Square,
  ChevronRight, ChevronLeft, Loader2, ImageIcon, Wand2,
  Package, FolderOpen, RefreshCw, AlertCircle, Check,
  X, Plus, ArrowUpFromLine, Key, Hash, Trash2,
  Settings2, Wifi, WifiOff, Bot, Copy, Link2, Unlink, Layers,
  Film, Play, Images, ZoomIn,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  getOllamaConfig, saveOllamaConfig, checkOllamaHealth,
  getOllamaUrl, saveOllamaUrl, generateWithOllama,
} from "@/lib/ollamaAI";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface SizeRow { size: string; qty: number }
interface ColorVariant {
  name: string;
  colorCode: string;
  colorTags: string[];
  sizeRows: SizeRow[];
  newSizeName: string;
  mainImage?: string;
}
interface GeneratedProduct {
  imageUrl: string;
  name: string;
  nameAr: string;
  description: string;
  price: string;
  categoryId: string;
  subcategoryId: string;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  variants: ColorVariant[];
  aiGenerated: boolean;
  styleKey?: string;
  extraImages?: string[];
  videoUrl?: string;
}

/* ─── Constants ─── */
const STEPS = [
  { id: 1, label: "Browse", icon: ImageIcon },
  { id: 2, label: "Select", icon: CheckSquare },
  { id: 3, label: "AI Generate", icon: Wand2 },
  { id: 4, label: "Publish", icon: Package },
];
const CLOTHES_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const SHOES_SIZES   = ["35", "36", "37", "38", "39", "40", "41", "42", "43"];

// Clean Cloudinary delivery base, e.g. https://res.cloudinary.com/<cloud>/image/upload/
function cloudinaryBase(url: string): string {
  const i = url.indexOf("/upload/");
  return i === -1 ? url : url.slice(0, i + "/upload/".length);
}

/** Extract the stable public-id key from any Cloudinary URL by stripping:
 *  - transformation segments (e.g. f_auto,q_auto / w_400 / so_0)
 *  - version segments (v followed by digits only, e.g. v1780234551)
 *  so URLs stored with/without transforms or version still compare equal. */
function cloudinaryKey(url: string): string {
  if (!url) return "";
  const i = url.indexOf("/upload/");
  if (i === -1) return url;
  return url.slice(i + 8)
    .replace(/\?.*$/, "")
    .split("/")
    .filter(seg =>
      seg.length > 0 &&
      !/,/.test(seg) &&              // comma-separated transforms e.g. f_auto,q_auto
      !/^v\d+$/.test(seg) &&         // version segment e.g. v1780234551
      !/^[a-z]{1,4}_[a-z0-9]/.test(seg)   // named transform e.g. f_auto w_400 so_0 (always lowercase)
    )
    .join("/");
}

/** Same as cloudinaryKey but also strips the file extension, matching the
 *  publicId format that Cloudinary returns from its API (no extension). */
function cloudinaryPublicId(url: string): string {
  return cloudinaryKey(url).replace(/\.[^/.]+$/, "");
}

function buildKitPrompt(base: string, exampleFile: string): string {
  const exampleId = exampleFile.replace(/\.[^.]+$/, "");
  return `You are a fashion product data generator for a women's boutique (Arabic + English store).

Every dress photo I give you is named with its real image ID. Example file name:
  ${exampleFile}
The file name WITHOUT the extension is the image's ID.

To build the image link for any photo, use this EXACT pattern:
  ${base}<FILE-NAME-WITHOUT-EXTENSION>.jpg
Example for the file above:
  ${base}${exampleId}.jpg

For EVERY photo, create ONE product object with these fields:
- "name": short English product name, max 5 words (e.g. "Floral Wrap Midi Dress").
- "description": 2 short sentences in English, then the SAME description in Arabic on a new line.
- "colors": array with EXACTLY ONE hex color code — the single MAIN/DOMINANT fabric color only (e.g. ["#2c3e50"]). IGNORE beads, sequins, crystals, embroidery, trim, lace, buttons, prints and any accent. Never return more than one color.
- "styleKey": a short English description of the garment's STRUCTURAL design (type, cut, sleeve, neckline, length) WITHOUT any color, so the same item in different colors gets the same key (e.g. "long sleeve ribbed bodycon midi dress").
- "mainImage": the link you built from this photo's file name (use the pattern above — copy the ID EXACTLY, character for character).
- "images": an array containing that same link.
- "categoryName": "Dresses"
- "price": "100"
- "sizes": ["S", "M", "L"]
- "sizeInventory": { "S": 2, "M": 2, "L": 2 }
- "stockQuantity": 6

Return ONE JSON object exactly in this shape, valid JSON only — no markdown, no comments, no extra text:
{ "products": [ { ...one entry per photo... } ] }

EASIEST OPTION: I may also upload a file called "template.json". It already has one entry per photo with the correct "mainImage" link and all store settings filled in. If you get it, DO NOT rebuild the links — just match each photo to its entry by the "imageFile" field, fill in name/description/colors, and return the whole file unchanged otherwise.`;
}

/* ─── Helpers ─── */
function formatEta(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}
function catLabel(c: any) { return c.nameAr ? `${c.name} / ${c.nameAr}` : c.name; }
function subLabel(s: any) { return s.nameAr ? `${s.name} / ${s.nameAr}` : s.name; }
function isLight(hex: string) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return (r*299+g*587+b*114)/1000 > 200;
}
function getFamilyForHex(hex: string): ColorFamily | undefined {
  return COLOR_FAMILIES.find(f => f.members.some(m => m.hex.toLowerCase() === hex.toLowerCase()));
}
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
}
// Closest known color in our families (used to always produce a readable name).
function nearestMember(hex: string): { member: ColorMember; family: ColorFamily } | undefined {
  const target = hexToRgb(hex);
  if (!target) return undefined;
  let best: { member: ColorMember; family: ColorFamily } | undefined;
  let bestD = Infinity;
  for (const f of COLOR_FAMILIES) for (const m of f.members) {
    const c = hexToRgb(m.hex);
    if (!c) continue;
    const d = (c.r-target.r)**2 + (c.g-target.g)**2 + (c.b-target.b)**2;
    if (d < bestD) { bestD = d; best = { member: m, family: f }; }
  }
  return best;
}
function hexToName(hex: string): string {
  for (const f of COLOR_FAMILIES) {
    const m = f.members.find(m => m.hex.toLowerCase() === hex.toLowerCase());
    if (m) return m.nameAr || m.nameEn;
  }
  const near = nearestMember(hex)?.member;
  return near ? (near.nameAr || near.nameEn) : hex;
}
// Default size rows per category: shoes (id 4) get the boutique's standard run,
// everything else (clothes) gets S/M/L with 2 in stock each.
function defaultSizeRows(catId: string | number): SizeRow[] {
  if (Number(catId) === 4) return [
    { size: "36", qty: 1 }, { size: "37", qty: 2 }, { size: "38", qty: 2 },
    { size: "39", qty: 2 }, { size: "40", qty: 1 },
  ];
  return [{ size: "S", qty: 2 }, { size: "M", qty: 2 }, { size: "L", qty: 2 }];
}
function makeVariant(hex = "#000000", catId: string | number = ""): ColorVariant {
  const family = getFamilyForHex(hex) || nearestMember(hex)?.family;
  return {
    name: hexToName(hex),
    colorCode: hex,
    colorTags: family ? [family.key] : [],
    sizeRows: defaultSizeRows(catId),
    newSizeName: "",
  };
}
function getQuickSizes(catId: string): string[] {
  const id = Number(catId);
  return id === 4 ? SHOES_SIZES : CLOTHES_SIZES;
}

/* ── Same-product grouping ──────────────────────────────────────────────
   Merge photos that are clearly the SAME garment in a different colour into
   ONE product carrying several colour variants. High accuracy on purpose:
   we only merge when the AI's structural styleKey matches very strongly AND
   the products share a category — never on colour or name alone. The merged
   result still shows as editable cards before publishing, so any rare wrong
   merge can be split by hand. */
const COLOR_WORDS = new Set([
  "black","white","red","blue","green","yellow","pink","purple","orange","brown",
  "grey","gray","beige","cream","ivory","navy","gold","silver","maroon","burgundy",
  "teal","turquoise","olive","mint","coral","peach","lavender","violet","khaki",
  "tan","nude","wine","rose","light","dark","bright","pale","deep","neon","pastel",
  "color","colour","colored","coloured","shade","tone",
]);
function styleTokens(s: string): string[] {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !COLOR_WORDS.has(w));
}
function tokenSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  sa.forEach((x) => { if (sb.has(x)) inter++; });
  return inter / (sa.size + sb.size - inter);
}
// Fold the colour variants + photos of `members` into the `base` product.
function mergeInto(base: GeneratedProduct, members: GeneratedProduct[]) {
  const extra: string[] = base.extraImages ? [...base.extraImages] : [];
  for (const m of members) {
    for (const v of m.variants) {
      if (!base.variants.some((bv) => bv.colorCode.toLowerCase() === v.colorCode.toLowerCase())) {
        base.variants.push(v);
      }
    }
    extra.push(m.imageUrl);
  }
  if (extra.length) base.extraImages = extra;
}

// Apply index groups (from the AI visual grouping pass) to the product list.
// Each group's first index becomes the product; the rest fold into it.
// A real product rarely ships in more than ~10 colors. An AI cluster bigger than
// this almost certainly means the model over-merged distinct products.
const MAX_AI_GROUP = 10;

function applyGroups(items: GeneratedProduct[], groups: number[][], trusted = false): GeneratedProduct[] {
  // Safety gate: refuse oversized AI clusters and keep those photos separate
  // instead of collapsing distinct products. `trusted` groups (admin's manual
  // links, or already-guarded AI groups) bypass the gate — they're explicit.
  const out: GeneratedProduct[] = [];
  const taken = new Set<number>();
  for (const g of groups) {
    let valid = g.filter((i) => Number.isInteger(i) && i >= 0 && i < items.length && !taken.has(i));
    if (!valid.length) continue;
    if (!trusted && valid.length > MAX_AI_GROUP) {
      // Suspicious over-merge → treat every member as its own product.
      valid.forEach((i) => { taken.add(i); out.push(items[i]); });
      continue;
    }
    valid.forEach((i) => taken.add(i));
    const base = items[valid[0]];
    const members = valid.slice(1).map((i) => items[i]);
    if (members.length) mergeInto(base, members);
    out.push(base);
  }
  // Safety net: any item the AI never mentioned stays on its own.
  for (let i = 0; i < items.length; i++) if (!taken.has(i)) out.push(items[i]);
  return out;
}

// Merge several index-group sets (e.g. manual links + AI visual groups) into one
// consistent set of components via union-find, so both sources are honored.
function combineIndexGroups(n: number, sources: number[][][]): number[][] {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (const groups of sources)
    for (const g of groups)
      for (let k = 1; k < g.length; k++)
        if (g[0] >= 0 && g[0] < n && g[k] >= 0 && g[k] < n) union(g[0], g[k]);
  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const r = find(i); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r)!.push(i); }
  return Array.from(byRoot.values());
}

// A distinct, stable color per manual group id (for the thumbnail badges).
function groupColor(id: number): string { return `hsl(${(id * 67) % 360} 72% 45%)`; }

// ── Problem 2: Multi-color caption helpers ──────────────────────────────────
const ARABIC_COLOR_WORDS = [
  // Basic colors
  "أحمر","أسود","أبيض","أزرق","أخضر","أصفر","وردي","بنفسجي","برتقالي",
  "بيج","رمادي","ذهبي","فضي","بني","زيتي","كحلي","تركواز","كريمي",
  // Extended fashion colors
  "خمري","عنابي","نيلي","قرمزي","مشمشي","فيروزي","ليلكي","بلاتيني",
  "نحاسي","برونزي","خردلي","زهري","سلمون","فحمي","ترابي","سماوي",
  "رصاصي","قهوي","توتي","عقيقي","لبني","قرنفلي","ليموني","موف",
  "مارون","لافندر","بيرل","شامبين","أوف وايت","أوف-وايت","تيفاني",
  "صدئ","خوخي","أرجواني","نعناعي","كاراميل","شوكولاتي","طوبي","دموي",
];
function extractArabicColors(text: string): string[] {
  return ARABIC_COLOR_WORDS.filter(c => text.includes(c));
}
function stripArabicColors(text: string): string {
  // Sort longest first so compound words like "أوف وايت" are removed before "أبيض"
  const sorted = [...ARABIC_COLOR_WORDS].sort((a, b) => b.length - a.length);
  let result = text || "";
  for (const c of sorted) result = result.split(c).join("");
  return result.replace(/\s{2,}/g, " ").trim();
}
function injectColorsAfterNWords(text: string, colors: string[], n = 12): string {
  if (!colors.length || !text) return text;
  const words = text.split(/\s+/);
  const phrase = `متوفر باللون ${colors.join(" و")}`;
  if (words.length <= n) return text + " " + phrase;
  words.splice(n, 0, phrase);
  return words.join(" ");
}
function applyMultiColorFix(products: GeneratedProduct[]): GeneratedProduct[] {
  return products.map(p => {
    if (p.variants.length < 2) return p;
    // Collect colors from variant names AND from the product name itself
    const allColors: string[] = [];
    const scanTargets = [
      ...p.variants.map(v => v.name || ""),
      p.name || "",
      p.nameAr || "",
    ];
    for (const text of scanTargets) {
      for (const c of extractArabicColors(text)) {
        if (!allColors.includes(c)) allColors.push(c);
      }
    }
    // Always strip colors from name/nameAr for multi-variant products;
    // only inject color list into description when we found actual colors.
    const stripped = {
      ...p,
      name: stripArabicColors(p.name),
      nameAr: stripArabicColors(p.nameAr),
    };
    if (!allColors.length) return stripped;
    return {
      ...stripped,
      description: injectColorsAfterNWords(p.description, allColors),
    };
  });
}

// Text-only fallback grouping (used when the visual pass is unavailable).
// Merges only on the AI's structural styleKey — never on name — to stay safe.
function groupSameProducts(items: GeneratedProduct[]): GeneratedProduct[] {
  const SIM_THRESHOLD = 0.85; // strict — avoids merging different products
  const MIN_TOKENS = 4;       // need enough structural signal to be confident
  const used = new Array(items.length).fill(false);
  const out: GeneratedProduct[] = [];

  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const base = items[i];
    const baseTokens = styleTokens(base.styleKey || "");
    out.push(base);
    // Not enough structural signal → keep this product on its own.
    if (!base.aiGenerated || !base.styleKey || baseTokens.length < MIN_TOKENS) continue;

    const members: GeneratedProduct[] = [];
    for (let j = i + 1; j < items.length; j++) {
      if (used[j]) continue;
      const cand = items[j];
      if (!cand.aiGenerated || !cand.styleKey) continue;
      if (String(cand.categoryId) !== String(base.categoryId)) continue;
      const candTokens = styleTokens(cand.styleKey || "");
      if (candTokens.length < MIN_TOKENS) continue;
      if (tokenSimilarity(baseTokens, candTokens) < SIM_THRESHOLD) continue;
      used[j] = true;
      members.push(cand);
    }
    if (members.length) mergeInto(base, members);
  }
  return out;
}

/* ══════════════════════════════════════════════
   MediaPickerDialog — attach EXTRA photos + a video to a product.
   Added AFTER AI generation, so these never reach the AI (no token cost).
   ══════════════════════════════════════════════ */
interface CloudImage { publicId: string; url: string; fullUrl: string; }
interface CloudVideo { publicId: string; url: string; poster: string; duration?: number | null; }

function MediaPickerDialog({
  open, onOpenChange, mainImage, initialPhotos, initialVideo, onSave,
  usedImageUrls, usedVideoUrls,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mainImage: string;
  initialPhotos: string[];
  initialVideo?: string;
  onSave: (photos: string[], video: string | undefined) => void;
  usedImageUrls?: Set<string>;
  usedVideoUrls?: Set<string>;
}) {
  const { toast } = useToast();
  const [images, setImages] = useState<CloudImage[]>([]);
  const [videos, setVideos] = useState<CloudVideo[]>([]);
  const [loadingImg, setLoadingImg] = useState(false);
  const [loadingVid, setLoadingVid] = useState(false);
  const [nextCursorImg, setNextCursorImg] = useState<string | null>(null);
  const [nextCursorVid, setNextCursorVid] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [video, setVideo] = useState<string | undefined>(initialVideo);

  const fetchImages = useCallback((append = false, cursor?: string | null) => {
    setLoadingImg(true);
    const p = new URLSearchParams({ max_results: "100" });
    if (cursor) p.set("next_cursor", cursor);
    fetch(`/api/admin/cloudinary/images?${p}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => {
        setImages(prev => append ? [...prev, ...(d.resources || [])] : (d.resources || []));
        setNextCursorImg(d.nextCursor || null);
      })
      .catch(() => toast({ title: "Failed to load photos", variant: "destructive" }))
      .finally(() => setLoadingImg(false));
  }, []);

  const fetchVideos = useCallback((append = false, cursor?: string | null) => {
    setLoadingVid(true);
    const p = new URLSearchParams({ max_results: "100" });
    if (cursor) p.set("next_cursor", cursor);
    fetch(`/api/admin/cloudinary/videos?${p}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(d => {
        setVideos(prev => append ? [...prev, ...(d.resources || [])] : (d.resources || []));
        setNextCursorVid(d.nextCursor || null);
      })
      .catch(() => toast({ title: "Failed to load videos", variant: "destructive" }))
      .finally(() => setLoadingVid(false));
  }, []);

  useEffect(() => {
    if (open) { setPhotos(initialPhotos.filter(u => u !== mainImage)); setVideo(initialVideo); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!images.length) fetchImages();
    if (!videos.length) fetchVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const togglePhoto = (url: string) =>
    setPhotos(prev => prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]);

  const fmtDur = (s?: number | null) => {
    if (!s) return null;
    const m = Math.floor(s / 60); const sec = Math.round(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Images className="w-4 h-4" /> Extra media
            <Badge variant="secondary" className="text-[10px] font-normal">Not sent to AI</Badge>
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="photos" className="flex-1 flex flex-col min-h-0">
          <TabsList className="self-start">
            <TabsTrigger value="photos">
              <ImageIcon className="w-3.5 h-3.5 me-1.5" /> Photos{photos.length ? ` (${photos.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="video">
              <Film className="w-3.5 h-3.5 me-1.5" /> Video{video ? " (1)" : ""}
            </TabsTrigger>
          </TabsList>

          {/* Photos tab */}
          <TabsContent value="photos" className="flex-1 overflow-y-auto mt-3">
            {loadingImg ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin me-2" /> Loading photos…
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {images.map(img => {
                  const sel = photos.includes(img.fullUrl);
                  const mainPublicId = cloudinaryPublicId(mainImage || "");
                  const isMain = !!mainPublicId && img.publicId === mainPublicId;
                  const inUse = !isMain && !!(usedImageUrls?.has(img.publicId) || usedImageUrls?.has(cloudinaryPublicId(img.fullUrl)));
                  return (
                    <button key={img.publicId} type="button"
                      onClick={() => !isMain && togglePhoto(img.fullUrl)}
                      className={cn(
                        "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
                        isMain ? "border-violet-500 opacity-60 cursor-default"
                          : sel ? "border-emerald-500 ring-2 ring-emerald-500/30"
                          : "border-transparent hover:border-border",
                      )}>
                      <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      {isMain && <span className="absolute bottom-1 left-1 text-[9px] bg-violet-600 text-white px-1 rounded">Main · AI</span>}
                      {inUse && !sel && (
                        <span className="absolute bottom-1 left-1 text-[9px] bg-amber-500 text-white px-1 rounded leading-tight">In use</span>
                      )}
                      {sel && !isMain && (
                        <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
                {!images.length && !loadingImg && (
                  <div className="col-span-full text-center text-sm text-muted-foreground py-8">No photos found in your library.</div>
                )}
              </div>
            )}
            {nextCursorImg && (
              <div className="flex justify-center pt-3">
                <Button variant="outline" size="sm" onClick={() => fetchImages(true, nextCursorImg)} disabled={loadingImg}>
                  {loadingImg ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" /> : null}
                  Load more photos
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Video tab */}
          <TabsContent value="video" className="flex-1 overflow-y-auto mt-3">
            {loadingVid ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin me-2" /> Loading videos…
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {video && (
                  <button type="button" onClick={() => setVideo(undefined)}
                    className="relative aspect-video rounded-lg overflow-hidden border-2 border-dashed border-red-400/60 flex flex-col items-center justify-center text-red-500 text-xs gap-1 hover:bg-red-500/5">
                    <X className="w-4 h-4" /> Remove
                  </button>
                )}
                {videos.map(v => {
                  const sel = v.url === video;
                  const inUse = !!(usedVideoUrls?.has(v.publicId) || usedVideoUrls?.has(cloudinaryPublicId(v.url)));
                  return (
                    <button key={v.publicId} type="button"
                      onClick={() => setVideo(sel ? undefined : v.url)}
                      className={cn(
                        "relative aspect-video rounded-lg overflow-hidden border-2 transition-all bg-black",
                        sel ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-transparent hover:border-border",
                      )}>
                      <img src={v.poster} alt="" className="w-full h-full object-cover opacity-90" loading="lazy" />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                          <Play className="w-4 h-4 text-white fill-white" />
                        </span>
                      </span>
                      {fmtDur(v.duration) && (
                        <span className="absolute bottom-1 right-1 text-[9px] bg-black/70 text-white px-1 rounded">{fmtDur(v.duration)}</span>
                      )}
                      {inUse && !sel && (
                        <span className="absolute bottom-1 left-1 text-[9px] bg-amber-500 text-white px-1 rounded leading-tight">In use</span>
                      )}
                      {sel && (
                        <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
                {!videos.length && !loadingVid && (
                  <div className="col-span-full text-center text-sm text-muted-foreground py-8">
                    No videos found. Upload a video from the product editor first, then it appears here.
                  </div>
                )}
              </div>
            )}
            {nextCursorVid && (
              <div className="flex justify-center pt-3">
                <Button variant="outline" size="sm" onClick={() => fetchVideos(true, nextCursorVid)} disabled={loadingVid}>
                  {loadingVid ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" /> : null}
                  Load more videos
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
        <DialogFooter className="border-t pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onSave(photos.filter(u => u !== mainImage), video); onOpenChange(false); }}>
            <Check className="w-4 h-4 me-1.5" /> Attach media
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════
   Lightbox — full-screen preview of the whole photo library.
   Click the dark backdrop (anything else) to close.
   ══════════════════════════════════════════════ */
function Lightbox({ images, index, setIndex, onClose }: {
  images: any[];
  index: number;
  setIndex: (i: number) => void;
  onClose: () => void;
}) {
  const go = useCallback((dir: number) => {
    if (!images.length) return;
    setIndex((index + dir + images.length) % images.length);
  }, [index, images.length, setIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const img = images[index];
  if (!img) return null;

  return (
    <div onClick={onClose}
      className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-sm flex flex-col animate-in fade-in duration-150">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={e => e.stopPropagation()}>
        <span className="text-sm font-medium tabular-nums bg-white/10 rounded-full px-3 py-1">
          {index + 1} / {images.length}
        </span>
        <button onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main image */}
      <div className="flex-1 flex items-center justify-center px-2 sm:px-4 min-h-0 relative">
        {images.length > 1 && (
          <button onClick={e => { e.stopPropagation(); go(-1); }}
            className="absolute left-2 sm:left-6 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <img src={img.fullUrl || img.url} alt="" onClick={e => e.stopPropagation()}
          className="max-h-full max-w-full object-contain rounded-xl shadow-2xl select-none" />
        {images.length > 1 && (
          <button onClick={e => { e.stopPropagation(); go(1); }}
            className="absolute right-2 sm:right-6 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors">
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Filmstrip — every photo on one page */}
      <div className="shrink-0 overflow-x-auto px-4 py-3" onClick={e => e.stopPropagation()}>
        <div className="flex gap-2 justify-center min-w-min">
          {images.map((t, i) => (
            <button key={t.publicId ?? i} onClick={() => setIndex(i)}
              className={cn("relative w-12 h-12 sm:w-14 sm:h-14 rounded-md overflow-hidden border-2 shrink-0 transition-all",
                i === index ? "border-white scale-105 shadow-lg" : "border-transparent opacity-50 hover:opacity-100")}>
              <img src={t.url} alt="" className="w-full h-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      </div>

      <p className="text-center text-white/45 text-[11px] pb-3 select-none" onClick={e => e.stopPropagation()}>
        Click anywhere outside to close · ← → to browse · Esc
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════
   ProductCard — full inline form for one product
   ══════════════════════════════════════════════ */
function ProductCard({
  product, idx, categories, subcategories, onUpdate, onRemove,
  usedImageUrls, usedVideoUrls,
}: {
  product: GeneratedProduct;
  idx: number;
  categories: any[];
  subcategories: any[];
  onUpdate: (idx: number, patch: Partial<GeneratedProduct>) => void;
  onRemove: (idx: number) => void;
  usedImageUrls?: Set<string>;
  usedVideoUrls?: Set<string>;
}) {
  const [paletteOpen, setPaletteOpen] = useState<string | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const cardSubs = subcategories.filter(
    (s: any) => String(s.categoryId) === String(product.categoryId),
  );
  const quickSizes = getQuickSizes(product.categoryId);
  const isReady = Boolean(product.name && product.price);

  /* variant helpers */
  const updV = (vIdx: number, patch: Partial<ColorVariant>) =>
    onUpdate(idx, { variants: product.variants.map((v,i) => i===vIdx ? {...v,...patch} : v) });
  const removeV = (vIdx: number) =>
    onUpdate(idx, { variants: product.variants.filter((_,i) => i!==vIdx) });
  const addVariantFromPalette = (member: ColorMember) => {
    if (product.variants.some(v => v.colorCode.toLowerCase() === member.hex.toLowerCase())) return;
    const family = getFamilyForHex(member.hex);
    onUpdate(idx, { variants: [
      ...product.variants,
      { name: member.nameEn, colorCode: member.hex, colorTags: family?[family.key]:[], sizeRows:[], newSizeName:"" },
    ]});
    setPaletteOpen(null);
  };
  const toggleColorTag = (vIdx: number, family: ColorFamily) => {
    const v = product.variants[vIdx];
    const selected = v.colorTags.includes(family.key);
    const colorTags = selected
      ? v.colorTags.filter(t => t !== family.key)
      : [...v.colorTags, family.key];
    const patch: Partial<ColorVariant> = { colorTags };
    if (!selected && colorTags.length === 1) patch.colorCode = family.hex;
    updV(vIdx, patch);
  };
  const addSize = (vIdx: number, sizeName: string) => {
    const name = sizeName.trim().toUpperCase();
    if (!name || product.variants[vIdx].sizeRows.some(r => r.size === name)) return;
    updV(vIdx, { sizeRows: [...product.variants[vIdx].sizeRows, { size: name, qty: 1 }], newSizeName: "" });
  };
  const updateSizeQty = (vIdx: number, sIdx: number, qty: number) =>
    updV(vIdx, { sizeRows: product.variants[vIdx].sizeRows.map((r,i) => i===sIdx ? {...r,qty} : r) });
  const removeSize = (vIdx: number, sIdx: number) =>
    updV(vIdx, { sizeRows: product.variants[vIdx].sizeRows.filter((_,i) => i!==sIdx) });

  return (
    <div className={cn(
      "bg-card border rounded-xl overflow-hidden flex flex-col",
      isReady ? "border-border" : "border-amber-300/70 dark:border-amber-700/50",
    )}>
      {/* Image header */}
      <div className="relative w-full aspect-video bg-muted shrink-0">
        <img
          src={product.imageUrl.replace("/upload/", "/upload/f_auto,q_auto,w_600/")}
          alt="" className="w-full h-full object-cover" loading="lazy"
        />
        <div className="absolute top-2 left-2 flex gap-1">
          {product.aiGenerated && (
            <Badge className="text-[10px] bg-violet-600 hover:bg-violet-600">
              <Sparkles className="w-2.5 h-2.5 me-0.5" /> AI
            </Badge>
          )}
          {isReady
            ? <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600"><Check className="w-2.5 h-2.5 me-0.5" /> Ready</Badge>
            : <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500"><AlertCircle className="w-2.5 h-2.5 me-0.5" /> Incomplete</Badge>
          }
        </div>
        <button onClick={() => onRemove(idx)}
          className="absolute top-2 right-2 w-6 h-6 rounded-md bg-black/60 hover:bg-red-600 flex items-center justify-center text-white transition-colors">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* ── Extra media (gallery photos + video) — NOT sent to AI ── */}
      <div className="px-3 pt-3">
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-2.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold flex items-center gap-1.5 text-muted-foreground">
              <Images className="w-3.5 h-3.5" /> Extra media
              <span className="text-[9px] font-normal opacity-70">· skips AI</span>
            </span>
            <button type="button" onClick={() => setMediaOpen(true)}
              className="text-[11px] font-medium text-primary hover:underline flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {(product.extraImages?.length || product.videoUrl) ? (
            <div className="flex flex-wrap gap-1.5">
              {product.videoUrl && (
                <span className="relative w-12 h-12 rounded overflow-hidden border border-border bg-black flex items-center justify-center">
                  <video src={product.videoUrl} className="w-full h-full object-cover" muted playsInline />
                  <Play className="absolute w-4 h-4 text-white fill-white pointer-events-none" />
                  <button type="button" onClick={() => onUpdate(idx, { videoUrl: undefined })}
                    className="absolute top-0 right-0 w-4 h-4 bg-black/70 text-white flex items-center justify-center rounded-bl">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              )}
              {(product.extraImages || []).map((u, i) => (
                <span key={i} className="relative w-12 h-12 rounded overflow-hidden border border-border">
                  <img src={u.replace("/upload/", "/upload/f_auto,q_auto,w_120/")} alt="" className="w-full h-full object-cover" />
                  <button type="button"
                    onClick={() => onUpdate(idx, { extraImages: (product.extraImages || []).filter((_, j) => j !== i) })}
                    className="absolute top-0 right-0 w-4 h-4 bg-black/70 text-white flex items-center justify-center rounded-bl">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/70 leading-snug">
              Add gallery photos &amp; a video — saved to the product but skipped by the AI to save tokens.
            </p>
          )}
        </div>
      </div>

      <MediaPickerDialog
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        mainImage={product.imageUrl}
        initialPhotos={product.extraImages || []}
        initialVideo={product.videoUrl}
        onSave={(photos, video) => onUpdate(idx, { extraImages: photos, videoUrl: video })}
        usedImageUrls={usedImageUrls}
        usedVideoUrls={usedVideoUrls}
      />

      {/* ── Form body ── */}
      <div className="p-3 space-y-3 flex-1">

        {/* Section 1: Basic info */}
        <div className="rounded-md border border-border overflow-hidden">
          <div className="bg-secondary/50 px-3 py-2 flex items-center gap-2 border-b border-border">
            <span className="w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-bold shrink-0">1</span>
            <span className="text-xs font-semibold">Basic Info</span>
          </div>
          <div className="p-3 space-y-2.5">
            {/* Name EN */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[11px] text-destructive font-medium">Required *</span>
                <span className="text-[11px] text-muted-foreground">Name (EN)</span>
              </div>
              <Input className="h-9 text-sm text-right" value={product.name}
                onChange={e => onUpdate(idx,{name:e.target.value})} placeholder="Product name" />
            </div>
            {/* Name AR */}
            <div>
              <div className="flex justify-end mb-1">
                <span className="text-[11px] text-muted-foreground">Name (AR)</span>
              </div>
              <Input className="h-9 text-sm text-right" dir="rtl" value={product.nameAr}
                onChange={e => onUpdate(idx,{nameAr:e.target.value})} placeholder="اسم المنتج" />
            </div>
            {/* Description */}
            <div>
              <div className="flex justify-end mb-1">
                <span className="text-[11px] text-muted-foreground">Description</span>
              </div>
              <textarea className="w-full text-sm border border-input rounded-md p-2 min-h-[56px] bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60"
                value={product.description} onChange={e => onUpdate(idx,{description:e.target.value})} placeholder="Description" />
            </div>
            {/* Price */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex justify-end mb-1">
                  <span className="text-[11px] text-destructive font-medium">* (₪) Price</span>
                </div>
                <Input className="h-9 text-sm text-right" type="number" min={0}
                  value={product.price} onChange={e => onUpdate(idx,{price:e.target.value})} placeholder="0" />
              </div>
              <div className="flex flex-col justify-end">
                <div className="flex gap-3 mt-1 pb-0.5">
                  {(["isFeatured","isNewArrival","isBestSeller"] as const).map(flag => (
                    <label key={flag} className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" className="w-3.5 h-3.5 accent-foreground"
                        checked={Boolean(product[flag])} onChange={e => onUpdate(idx,{[flag]:e.target.checked})} />
                      <span className="text-[10px]">{flag==="isFeatured"?"Featured":flag==="isNewArrival"?"New":"Best"}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {/* Category */}
            <div>
              <div className="flex justify-end mb-1"><span className="text-[11px] text-muted-foreground">Category</span></div>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                value={product.categoryId} onChange={e => onUpdate(idx,{categoryId:e.target.value,subcategoryId:""})}>
                <option value="">None</option>
                {categories.map((c:any) => <option key={c.id} value={c.id}>{catLabel(c)}</option>)}
              </select>
            </div>
            {/* Subcategory */}
            <div>
              <div className="flex justify-end mb-1"><span className="text-[11px] text-muted-foreground">Subcategory</span></div>
              <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                value={product.subcategoryId} onChange={e => onUpdate(idx,{subcategoryId:e.target.value})}
                disabled={!product.categoryId}>
                <option value="">None</option>
                {cardSubs.map((s:any) => <option key={s.id} value={s.id}>{subLabel(s)}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Section 2: Colors & Inventory */}
        <div className="rounded-md border border-border overflow-hidden">
          <div className="bg-secondary/50 px-3 py-2 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center text-[10px] font-bold shrink-0">2</span>
              <span className="text-xs font-semibold">Colors &amp; Inventory</span>
            </div>
            <Button type="button" variant="outline" size="sm"
              className="h-7 text-xs border-dashed border-2 hover:border-solid hover:border-primary hover:bg-primary/5 transition-all"
              onClick={() => onUpdate(idx, { variants: [...product.variants, makeVariant()] })}>
              <Plus className="w-3 h-3 me-1" /> Add Color
            </Button>
          </div>

          <div className="p-3 space-y-3">
            {/* Color palette quick-pick */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5">Quick pick a color:</p>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_FAMILIES.map(family => {
                  const light = isLight(family.hex);
                  const isExpanded = paletteOpen === family.key;
                  return (
                    <button key={family.key} type="button"
                      onClick={() => {
                        if (family.members.length === 1) { addVariantFromPalette(family.members[0]); }
                        else { setPaletteOpen(isExpanded ? null : family.key); }
                      }}
                      className={cn("flex flex-col items-center gap-0.5 p-1 rounded-md transition-all",
                        isExpanded ? "bg-secondary ring-2 ring-primary" : "hover:bg-secondary/50")}
                      title={`${family.nameAr} — ${family.nameEn}`}>
                      <span className={cn("w-6 h-6 rounded-full border-2 flex-shrink-0",
                        light ? "border-gray-300" : "border-transparent",
                        isExpanded && "ring-2 ring-offset-1 ring-primary")}
                        style={{ backgroundColor: family.hex }} />
                      <span className="text-[8px] leading-tight text-center max-w-[36px]">{family.nameEn}</span>
                    </button>
                  );
                })}
              </div>
              {paletteOpen && (() => {
                const family = COLOR_FAMILIES.find(f => f.key === paletteOpen);
                if (!family) return null;
                const usedHexes = new Set(product.variants.map(v => v.colorCode.toLowerCase()));
                return (
                  <div className="mt-2 border border-border bg-secondary/30 p-2 rounded-md space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold">{family.nameAr} — {family.nameEn}</p>
                      <button type="button" onClick={() => setPaletteOpen(null)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {family.members.map(member => {
                        const used = usedHexes.has(member.hex.toLowerCase());
                        const light = isLight(member.hex);
                        return (
                          <button key={member.nameEn} type="button" disabled={used}
                            onClick={() => addVariantFromPalette(member)}
                            className={cn("flex items-center gap-1.5 px-2 py-1 border text-[10px] rounded-md transition-all",
                              used ? "opacity-40 cursor-not-allowed border-border bg-muted"
                                   : "border-border hover:border-foreground hover:shadow-sm cursor-pointer bg-card")}>
                            <span className={cn("w-4 h-4 rounded-full border shrink-0", light?"border-gray-300":"border-transparent")}
                              style={{ backgroundColor: member.hex }} />
                            <span>{member.nameAr}</span>
                            <span className="text-muted-foreground">({member.nameEn})</span>
                            {used && <Check className="w-2.5 h-2.5 text-muted-foreground ms-0.5" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Variant list */}
            {product.variants.length === 0 && (
              <p className="text-xs text-muted-foreground border border-dashed border-border p-3 text-center rounded-md">
                No colors yet — click Add Color or pick from palette above.
              </p>
            )}
            <div className="space-y-3">
              {product.variants.map((variant, vIdx) => (
                <div key={vIdx} className="border border-border rounded-md overflow-hidden">
                  {/* Variant header */}
                  <div className="flex items-center justify-between bg-secondary/40 px-3 py-1.5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full border-2 border-background ring-1 ring-border shrink-0"
                        style={{ backgroundColor: variant.colorCode }} />
                      <span className="text-xs font-semibold">{variant.name || `Color ${vIdx+1}`}</span>
                    </div>
                    <button type="button" onClick={() => removeV(vIdx)}
                      className="text-destructive hover:text-destructive/70 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-2.5 space-y-2.5">
                    {/* Color name + picker */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-medium block mb-1">Color Name *</label>
                        <Input className="h-8 text-xs" value={variant.name}
                          onChange={e => updV(vIdx,{name:e.target.value})} placeholder="e.g. Black" />
                      </div>
                      <div>
                        <label className="text-[10px] font-medium block mb-1">Color Code</label>
                        <div className="flex gap-1.5 items-center">
                          <input type="color" value={variant.colorCode}
                            onChange={e => updV(vIdx,{colorCode:e.target.value})}
                            className="w-8 h-8 border border-border cursor-pointer rounded-md p-0 shrink-0" />
                          <Input className="h-8 text-xs font-mono flex-1 min-w-0" value={variant.colorCode}
                            onChange={e => { if(e.target.value.length <= 7) updV(vIdx,{colorCode:e.target.value}); }} />
                        </div>
                      </div>
                    </div>

                    {/* Multi-color tags */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-medium">Colors in this piece <span className="text-muted-foreground">(select multiple)</span></label>
                        {variant.colorTags.length > 0 && (
                          <button type="button" onClick={() => updV(vIdx,{colorTags:[]})}
                            className="text-[9px] text-muted-foreground hover:text-destructive underline">Clear</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1 p-1.5 border border-border bg-muted/20 rounded-md">
                        {COLOR_FAMILIES.map(family => {
                          const selected = variant.colorTags.includes(family.key);
                          const light = isLight(family.hex);
                          return (
                            <button key={family.key} type="button"
                              onClick={() => toggleColorTag(vIdx, family)}
                              className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] border rounded-full transition-all",
                                selected ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/50")}>
                              <span className={cn("w-3 h-3 rounded-full border shrink-0", light?"border-gray-300":"border-transparent")}
                                style={{ backgroundColor: family.hex }} />
                              {family.nameEn}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sizes */}
                    <div>
                      <label className="text-[10px] font-medium block mb-1">Sizes &amp; Qty</label>

                      {/* Quick-add chips */}
                      {(() => {
                        const existing = new Set(variant.sizeRows.map(r => r.size));
                        const available = quickSizes.filter(s => !existing.has(s));
                        if (!available.length) return null;
                        return (
                          <div className="flex flex-wrap gap-1 p-1.5 bg-muted/40 border border-dashed border-border rounded-md mb-1.5">
                            <span className="text-[9px] font-semibold uppercase text-muted-foreground self-center me-0.5">Quick:</span>
                            {available.map(s => (
                              <button key={s} type="button" onClick={() => addSize(vIdx, s)}
                                className="px-2 py-0.5 text-[10px] border border-primary/40 text-primary bg-background hover:bg-primary hover:text-primary-foreground hover:border-primary rounded transition-colors">
                                +{s}
                              </button>
                            ))}
                            {available.length > 1 && (
                              <button type="button"
                                onClick={() => onUpdate(idx, { variants: product.variants.map((v,i) =>
                                  i !== vIdx ? v : { ...v, sizeRows: [...v.sizeRows, ...available.map(s=>({size:s,qty:1}))] }
                                )})}
                                className="px-2 py-0.5 text-[10px] bg-primary text-primary-foreground font-semibold rounded">
                                +All
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      {/* Size rows */}
                      {variant.sizeRows.length > 0 && (
                        <div className="border border-border rounded-md overflow-hidden mb-1.5">
                          <div className="grid grid-cols-[1fr_80px_28px] bg-secondary/50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider border-b border-border">
                            <span>Size</span><span>Qty</span><span />
                          </div>
                          {variant.sizeRows.map((row, sIdx) => (
                            <div key={sIdx} className="grid grid-cols-[1fr_80px_28px] items-center px-2 py-1 border-t border-border first:border-t-0">
                              <span className="text-xs font-medium">{row.size}</span>
                              <input type="number" min={0} value={row.qty}
                                onChange={e => updateSizeQty(vIdx, sIdx, parseInt(e.target.value)||0)}
                                className="h-7 w-full border border-input rounded-md px-2 text-xs text-right bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                              <button type="button" onClick={() => removeSize(vIdx, sIdx)}
                                className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ms-0.5">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Custom size input */}
                      <div className="flex gap-1.5">
                        <Input className="h-7 text-xs flex-1" placeholder="Custom size (e.g. 38 or XXL)"
                          value={variant.newSizeName}
                          onChange={e => updV(vIdx,{newSizeName:e.target.value})}
                          onKeyDown={e => { if(e.key==="Enter"){ e.preventDefault(); addSize(vIdx,variant.newSizeName); }}} />
                        <Button type="button" size="sm" variant="outline"
                          className="h-7 text-xs px-3"
                          onClick={() => addSize(vIdx, variant.newSizeName)}
                          disabled={!variant.newSizeName.trim()}>
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ */
export function BulkUploadTab() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [fetchCount, setFetchCount] = useState(30);
  const [fetchCountInput, setFetchCountInput] = useState("30");
  const [selectNInput, setSelectNInput] = useState("");
  const [loadMoreInput, setLoadMoreInput] = useState("50");
  const [cloudinaryImages, setCloudinaryImages] = useState<any[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  // Problem 1: per-image staging — independent from main selectedImages.
  const [stagedForGroup, setStagedForGroup] = useState<Set<string>>(new Set());
  const [groupPopoverUrl, setGroupPopoverUrl] = useState<string | null>(null);
  const [groupPopoverPos, setGroupPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const [createGroupSingleUrl, setCreateGroupSingleUrl] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  // Manual "same product, different colors" grouping: url -> group id (1-based).
  const [imageGroups, setImageGroups] = useState<Record<string, number>>({});
  const [nextGroupId, setNextGroupId] = useState(1);
  // When off (default), AI never auto-merges — only the admin's manual groups
  // are applied, so distinct products are never wrongly combined.
  const [autoGroup, setAutoGroup] = useState(false);
  const [dimGrouped, setDimGrouped] = useState(false);
  const [generatedProducts, setGeneratedProducts] = useState<GeneratedProduct[]>([]);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiCount, setAiCount] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [aiEtaMs, setAiEtaMs] = useState<number | null>(null);
  const [globalPrice, setGlobalPrice] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<{ created: number; errors: any[] } | null>(null);
  const [globalCategory, setGlobalCategory] = useState("");
  const [globalSubcategory, setGlobalSubcategory] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  // ── Existing products — for "In use" indicators on Cloudinary media ──────────
  const { data: existingProducts } = useQuery<any[]>({ queryKey: ["/api/products"] });
  const usedImageUrls = useMemo(() => {
    const s = new Set<string>();
    (existingProducts || []).forEach((p: any) => {
      if (p.mainImage) s.add(cloudinaryPublicId(p.mainImage));
      (p.images || []).forEach((u: string) => s.add(cloudinaryPublicId(u)));
      (p.colorVariants || []).forEach((v: any) => {
        if (v.mainImage) s.add(cloudinaryPublicId(v.mainImage));
        (v.images || []).forEach((u: string) => s.add(cloudinaryPublicId(u)));
        (v.media || []).forEach((m: any) => { if (m?.url) s.add(cloudinaryPublicId(m.url)); });
      });
    });
    return s;
  }, [existingProducts]);
  const usedVideoUrls = useMemo(() => {
    const s = new Set<string>();
    (existingProducts || []).forEach((p: any) => {
      if (p.videoUrl) s.add(cloudinaryPublicId(p.videoUrl));
      (p.colorVariants || []).forEach((v: any) => {
        (v.media || []).forEach((m: any) => { if (m?.type === "video" && m?.url) s.add(cloudinaryPublicId(m.url)); });
      });
    });
    return s;
  }, [existingProducts]);

  // ── Ollama (via backend proxy) ──────────────────────────────────────────────
  const [showOllamaSettings, setShowOllamaSettings] = useState(false);
  const [useOllama, setUseOllama] = useState(() => getOllamaConfig().enabled);
  const [ollamaHost, setOllamaHost] = useState("");
  const [ollamaModel, setOllamaModel] = useState(() => getOllamaConfig().model);
  const [ollamaStatus, setOllamaStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaError, setOllamaError] = useState<string>("");
  const [ollamaLastCode, setOllamaLastCode] = useState<number | null>(null);
  const [savingOllamaUrl, setSavingOllamaUrl] = useState(false);
  const [downloadingKit, setDownloadingKit] = useState(false);

  // Load the server-configured Ollama URL once.
  useEffect(() => {
    getOllamaUrl().then(({ url }) => setOllamaHost(url)).catch(() => {});
  }, []);

  const testOllama = async () => {
    setOllamaStatus("checking");
    setOllamaError("");
    const health = await checkOllamaHealth();
    setOllamaLastCode(health.upstreamStatus ?? health.status ?? null);
    if (health.tunnelUrl) setOllamaHost(health.tunnelUrl);
    setOllamaStatus(health.reachable ? "ok" : "error");
    if (health.reachable) {
      setOllamaModels(health.models);
      if (health.models.length === 0) {
        toast({ title: "Ollama connected, but no models",
          description: "Run `ollama pull llava` on the Ollama machine to install a vision model.",
          variant: "destructive" });
      }
    } else {
      setOllamaError(health.error || "");
      toast({ title: "Ollama not reachable", description: health.error || "", variant: "destructive" });
    }
  };

  const applyOllamaUrl = async () => {
    setSavingOllamaUrl(true);
    try {
      const { url } = await saveOllamaUrl(ollamaHost);
      setOllamaHost(url);
      toast({ title: "Ollama URL saved", description: url });
      await testOllama();
    } catch (err: any) {
      toast({ title: "Couldn't save URL", description: err?.message, variant: "destructive" });
    } finally {
      setSavingOllamaUrl(false);
    }
  };

  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  const { data: subcategories = [] } = useQuery<any[]>({ queryKey: ["/api/subcategories"] });
  const filteredSubs = (subcategories as any[]).filter(
    s => !globalCategory || String(s.categoryId) === String(globalCategory),
  );

  const fetchImages = useCallback(async (cursor?: string, count?: number) => {
    setLoadingImages(true);
    try {
      const params = new URLSearchParams({ max_results: String(count && count > 0 ? count : fetchCount) });
      if (cursor) params.set("next_cursor", cursor);
      const res = await fetch(`/api/admin/cloudinary/images?${params}`);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to fetch");
      const data = await res.json();
      setCloudinaryImages(prev => cursor ? [...prev, ...data.resources] : data.resources);
      setNextCursor(data.nextCursor);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setLoadingImages(false); }
  }, [fetchCount, toast]);

  const handleFetch = () => {
    const n = parseInt(fetchCountInput) || 30;
    setFetchCount(n);
    setCloudinaryImages([]); setSelectedImages(new Set()); setNextCursor(null);
    setImageGroups({}); setNextGroupId(1);
    fetchImages(); setStep(2);
  };
  const toggleImage = (url: string) =>
    setSelectedImages(prev => { const n = new Set(prev); n.has(url) ? n.delete(url) : n.add(url); return n; });
  const selectAll = () => setSelectedImages(new Set(cloudinaryImages.map(i => i.fullUrl)));
  const deselectAll = () => setSelectedImages(new Set());
  const selectFirstN = () => {
    const n = parseInt(selectNInput);
    if (!n || n < 1) return;
    setSelectedImages(new Set(cloudinaryImages.slice(0, n).map(i => i.fullUrl)));
  };
  // ── Manual grouping (admin marks photos as "same product, different colors") ──
  const selectedGroupedCount = Array.from(selectedImages).filter(u => imageGroups[u]).length;
  const groupCount = new Set(Object.values(imageGroups)).size;
  const linkSelected = () => {
    // Only group photos that aren't already in a group — never reassign existing groups.
    const urls = Array.from(selectedImages).filter(u => !imageGroups[u]);
    if (urls.length < 2) {
      toast({ title: "Select 2+ ungrouped photos", description: "Pick 2 or more photos that aren't grouped yet, then create a group.", variant: "destructive" });
      return;
    }
    const id = nextGroupId;
    setImageGroups(prev => { const n = { ...prev }; urls.forEach(u => { n[u] = id; }); return n; });
    setNextGroupId(id + 1);
    setSelectedImages(new Set());
    toast({ title: `Group ${id} created`, description: `${urls.length} photos linked as one product.` });
  };
  const addSelectedToGroup = (id: number) => {
    const urls = Array.from(selectedImages).filter(u => !imageGroups[u]);
    if (urls.length === 0) {
      toast({ title: "No new photos selected", description: "Select ungrouped photos first, then tap the group to add them.", variant: "destructive" });
      return;
    }
    setImageGroups(prev => { const n = { ...prev }; urls.forEach(u => { n[u] = id; }); return n; });
    setSelectedImages(new Set());
    toast({ title: `Added to Group ${id}`, description: `${urls.length} photo${urls.length > 1 ? "s" : ""} added.` });
  };
  const unlinkSelected = () => {
    const urls = Array.from(selectedImages);
    setImageGroups(prev => { const n = { ...prev }; urls.forEach(u => { delete n[u]; }); return n; });
  };
  // Toggle: ADD group's photos to existing selection; click again deselects just that group.
  const selectGroup = (id: number) => {
    const urls = Object.entries(imageGroups).filter(([, g]) => g === id).map(([u]) => u);
    setSelectedImages(prev => {
      const allAlreadyIn = urls.length > 0 && urls.every(u => prev.has(u));
      const n = new Set(prev);
      if (allAlreadyIn) { urls.forEach(u => n.delete(u)); }
      else { urls.forEach(u => n.add(u)); }
      return n;
    });
  };
  // Toggle: ADD every grouped photo to selection; click again deselects all grouped.
  const selectAllGroups = () => {
    const urls = Object.keys(imageGroups);
    setSelectedImages(prev => {
      const allAlreadyIn = urls.length > 0 && urls.every(u => prev.has(u));
      const n = new Set(prev);
      if (allAlreadyIn) { urls.forEach(u => n.delete(u)); }
      else { urls.forEach(u => n.add(u)); }
      return n;
    });
  };
  // Toggle: ADD unassigned photos to selection; click again deselects them.
  const selectUnassigned = () => {
    const urls = cloudinaryImages.map(img => img.fullUrl).filter(u => !imageGroups[u]);
    setSelectedImages(prev => {
      const allAlreadyIn = urls.length > 0 && urls.every(u => prev.has(u));
      const n = new Set(prev);
      if (allAlreadyIn) { urls.forEach(u => n.delete(u)); }
      else { urls.forEach(u => n.add(u)); }
      return n;
    });
  };
  const clearGroups = () => { setImageGroups({}); setNextGroupId(1); };
  const deleteGroup = (id: number) => {
    setImageGroups(prev => {
      const n = { ...prev };
      Object.keys(n).forEach(url => { if (n[url] === id) delete n[url]; });
      return n;
    });
    setStagedForGroup(prev => {
      const n = new Set(prev);
      Object.entries(imageGroups).filter(([, g]) => g === id).forEach(([u]) => n.delete(u));
      return n;
    });
    toast({ title: `Group ${id} disbanded`, description: "All images removed from this group." });
  };

  // ── Problem 1: staged per-image helpers ────────────────────────────────────
  const toggleStaged = (url: string) =>
    setStagedForGroup(prev => { const n = new Set(prev); n.has(url) ? n.delete(url) : n.add(url); return n; });
  const createGroupFromStaged = () => {
    const urls = Array.from(stagedForGroup).filter(u => !imageGroups[u]);
    if (urls.length < 2) {
      toast({ title: "Stage 2+ ungrouped images first", variant: "destructive" }); return;
    }
    const id = nextGroupId;
    setImageGroups(prev => { const n = { ...prev }; urls.forEach(u => { n[u] = id; }); return n; });
    setNextGroupId(id + 1);
    setStagedForGroup(new Set());
    toast({ title: `Group ${id} created`, description: `${urls.length} images linked as one product.` });
  };
  const addStagedToExistingGroup = (id: number) => {
    const urls = Array.from(stagedForGroup).filter(u => !imageGroups[u]);
    if (!urls.length) {
      toast({ title: "No new staged images to add", variant: "destructive" }); return;
    }
    setImageGroups(prev => { const n = { ...prev }; urls.forEach(u => { n[u] = id; }); return n; });
    setStagedForGroup(new Set());
    toast({ title: `Added to Group ${id}`, description: `${urls.length} image${urls.length > 1 ? "s" : ""} added.` });
  };
  const openGroupPopover = (url: string, e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (groupPopoverUrl === url) { setGroupPopoverUrl(null); setGroupPopoverPos(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const POPOVER_H = 180; // generous estimated height
    const POPOVER_W = 192;
    // Fixed positioning is viewport-relative — do NOT add scrollY/scrollX.
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= POPOVER_H ? rect.bottom + 4 : rect.top - POPOVER_H - 4;
    const left = Math.min(rect.left, window.innerWidth - POPOVER_W - 8);
    setGroupPopoverPos({ top, left });
    setGroupPopoverUrl(url);
  };

  // Manual groups (size ≥ 2) as index sets into the given url order.
  const manualGroupsFor = (urls: string[]): number[][] => {
    const byG = new Map<number, number[]>();
    urls.forEach((u, i) => { const g = imageGroups[u]; if (g) { if (!byG.has(g)) byG.set(g, []); byG.get(g)!.push(i); } });
    return Array.from(byG.values()).filter(g => g.length > 1);
  };

  const makeBlank = (url: string): GeneratedProduct => ({
    imageUrl: url, name: "", nameAr: "", description: "",
    price: "", categoryId: globalCategory, subcategoryId: globalSubcategory,
    isFeatured: false, isNewArrival: true, isBestSeller: false,
    variants: [], aiGenerated: false,
  });

  const generateAI = async () => {
    const urls = Array.from(selectedImages);
    if (!urls.length) return;
    setAiProgress(0); setStep(3);

    const pushResult = (r: { url: string; success: boolean; data?: any }, all: GeneratedProduct[]) => {
      const aiColors: string[] = r.data?.colors || [];
      const aiNames: string[] = r.data?.colorNames || [];
      // Only the ONE main color of this photo — secondary accents are ignored.
      let variants: ColorVariant[] = aiColors.slice(0,1).map((hex, ci) => {
        try {
          const v = makeVariant(hex.startsWith("#") ? hex : "#" + hex, globalCategory);
          if (aiNames[ci]) v.name = String(aiNames[ci]);
          v.mainImage = r.url;
          return v;
        } catch { const v = makeVariant("#000000", globalCategory); v.mainImage = r.url; return v; }
      });
      // Always ship at least one variant so the default sizes are present.
      if (variants.length === 0) { const v = makeVariant("#000000", globalCategory); v.mainImage = r.url; variants = [v]; }
      all.push({ imageUrl: r.url, name: r.data?.name||"", nameAr: r.data?.nameAr||"",
        description: r.data?.description||"", price: String(r.data?.suggestedPrice||""),
        categoryId: globalCategory, subcategoryId: globalSubcategory,
        isFeatured: false, isNewArrival: true, isBestSeller: false,
        variants, aiGenerated: r.success, styleKey: r.data?.styleKey || "" });
    };

    const startedAt = Date.now();
    setAiCount({ done: 0, total: urls.length });
    setAiEtaMs(null);
    const tick = (done: number) => {
      const elapsed = Date.now() - startedAt;
      const avg = done > 0 ? elapsed / done : 0;
      setAiCount({ done, total: urls.length });
      setAiEtaMs(done > 0 ? Math.round(avg * (urls.length - done)) : null);
      setAiProgress(Math.min(100, Math.round((done / urls.length) * 100)));
    };

    try {
      const all: GeneratedProduct[] = [];

      if (useOllama) {
        // ── Ollama via backend proxy (browser → our server → Ollama) ──────
        // Process ONE image at a time: a home CPU runs a single vision request
        // far more reliably than several at once. Slower, but rock-solid for 50+.
        for (let i = 0; i < urls.length; i++) {
          const [r] = await generateWithOllama([urls[i]], ollamaModel);
          if (!r || !r.success) {
            toast({ title: "Ollama error", description: r?.error, variant: "destructive" });
            all.push(makeBlank(urls[i]));
          } else {
            pushResult(r, all);
          }
          tick(i + 1);
        }
      } else {
        // ── Server-side AI (Gemini / OpenAI) ─────────────────────────────
        // Small batches keep each request short so it never hits a gateway timeout.
        const SERVER_BATCH = 2;
        for (let i = 0; i < urls.length; i += SERVER_BATCH) {
          const batch = urls.slice(i, i + SERVER_BATCH);
          let res: Response;
          try {
            res = await fetch("/api/admin/ai-generate", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ imageUrls: batch }),
            });
          } catch {
            batch.forEach(url => all.push(makeBlank(url)));
            tick(Math.min(urls.length, i + SERVER_BATCH));
            continue;
          }

          // Parse the body safely — a timeout/proxy error returns HTML, not JSON.
          const raw = await res.text();
          let parsed: any = null;
          try { parsed = JSON.parse(raw); } catch { parsed = null; }

          if (!res.ok || !parsed) {
            if (parsed?.noKey) {
              toast({ title: "No AI Key",
                description: "Add GEMINI_API_KEY in Secrets, or switch to Ollama (local).",
                variant: "destructive" });
              urls.forEach(url => all.push(makeBlank(url))); break;
            }
            // Timeout / server error / HTML page — keep going with blanks.
            toast({ title: "AI batch skipped",
              description: parsed?.message || "Server timed out on this batch. Try fewer images or use Ollama.",
              variant: "destructive" });
            batch.forEach(url => all.push(makeBlank(url)));
            tick(Math.min(urls.length, i + SERVER_BATCH));
            continue;
          }

          for (const r of parsed.results || []) pushResult(r, all);
          tick(Math.min(urls.length, i + SERVER_BATCH));
        }
      }

      // Build the admin's MANUAL groups (the reliable source) as index sets.
      const manualGroups = manualGroupsFor(urls);

      let grouped: GeneratedProduct[];
      if (autoGroup) {
        // Opt-in: also let the AI visually compare photos, then UNION its result
        // with the admin's manual links so both are honored.
        let visualGroups: number[][] = [];
        try {
          const gRes = await fetch("/api/admin/ai-group", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrls: urls }),
          });
          if (gRes.ok) {
            const gData = await gRes.json();
            if (Array.isArray(gData?.groups)) visualGroups = gData.groups;
          }
        } catch { /* manual groups still apply */ }
        // Apply the over-merge guard to the AI groups FIRST (drop oversized
        // clusters), then union with manual links so the admin's explicit links
        // are never discarded by a bad AI cluster.
        const guardedVisual = visualGroups.filter(g => Array.isArray(g) && g.length <= MAX_AI_GROUP);
        const combined = combineIndexGroups(all.length, [manualGroups, guardedVisual]);
        grouped = applyGroups(all, combined, /* trusted */ true);
      } else {
        // Default: trust ONLY the admin's manual links — never auto-merge, so
        // different products are never wrongly combined.
        grouped = applyGroups(all, manualGroups, /* trusted */ true);
      }
      const mergedCount = all.length - grouped.length;
      setGeneratedProducts(applyMultiColorFix(grouped)); setStep(4);
      if (mergedCount > 0) {
        toast({ title: `Grouped ${mergedCount} photo${mergedCount > 1 ? "s" : ""}`,
          description: `Combined same-product photos into ${grouped.length} product${grouped.length > 1 ? "s" : ""} — review before publishing.` });
      }
    } catch (err: any) {
      toast({ title: "AI Error", description: err.message, variant: "destructive" });
    }
  };

  const skipAI = () => {
    const urls = Array.from(selectedImages);
    const blanks = urls.map(makeBlank);
    // Honor manual links even when skipping AI, so same-product photos share one card.
    setGeneratedProducts(applyMultiColorFix(applyGroups(blanks, manualGroupsFor(urls), /* trusted */ true)));
    setStep(4);
  };

  const copyImageUrls = async () => {
    const urls = selectedImages.size
      ? Array.from(selectedImages)
      : cloudinaryImages.map(i => i.fullUrl);
    if (!urls.length) {
      toast({ title: "No images", description: "Load or select images first.", variant: "destructive" });
      return;
    }
    const text = urls.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `Copied ${urls.length} URL${urls.length > 1 ? "s" : ""}`,
        description: "Plain links copied, one per line — ready to paste anywhere." });
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access. Select the URLs manually.", variant: "destructive" });
    }
  };

  // Builds a ZIP with renamed images + a pre-filled template.json + PROMPT.txt.
  const downloadAiKit = async () => {
    const imgs = selectedImages.size
      ? cloudinaryImages.filter(i => selectedImages.has(i.fullUrl))
      : cloudinaryImages;
    if (!imgs.length) {
      toast({ title: "No images", description: "Load or select images first.", variant: "destructive" });
      return;
    }
    setDownloadingKit(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      const imgFolder = zip.folder("images")!;
      const products: any[] = [];
      const base = cloudinaryBase(imgs[0].fullUrl);
      let firstFile = "";

      for (let idx = 0; idx < imgs.length; idx++) {
        const img = imgs[idx];
        // File name = the real Cloudinary image ID, so the link can be rebuilt from it.
        const id = String(img.publicId || `image_${idx + 1}`).replace(/\//g, "__");
        const extMatch = String(img.fullUrl).match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
        const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
        const fileName = `${id}.${ext}`;
        if (!firstFile) firstFile = fileName;

        // Clean, version-free delivery link (matches the link the AI will rebuild).
        const cleanUrl = `${base}${String(img.publicId)}.${ext}`;

        const resp = await fetch(img.fullUrl);
        if (!resp.ok) throw new Error(`Couldn't download image ${idx + 1}`);
        imgFolder.file(fileName, await resp.blob());

        products.push({
          imageFile: fileName,
          name: "",
          description: "",
          mainImage: cleanUrl,
          images: [],
          categoryName: "Dresses",
          price: "100",
          colors: [],
          sizes: ["S", "M", "L"],
          sizeInventory: { S: 2, M: 2, L: 2 },
          stockQuantity: 6,
        });
        setAiProgress(Math.round(((idx + 1) / imgs.length) * 100));
      }

      zip.file("template.json", JSON.stringify({ products }, null, 2));
      zip.file("PROMPT.txt", buildKitPrompt(base, firstFile));

      const out = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(out);
      a.download = `lucerne-ai-kit-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);

      toast({ title: `Kit ready — ${imgs.length} image${imgs.length > 1 ? "s" : ""}`,
        description: "Unzip it, then upload the photos + template.json to ChatGPT using PROMPT.txt." });
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message, variant: "destructive" });
    } finally {
      setDownloadingKit(false);
      setAiProgress(0);
    }
  };

  // Applies the chosen category to every product AND refills the correct default
  // size run for that category (clothes S/M/L 2 each, shoes 36-40). Creates a
  // default colour variant for any product that has none so sizes always exist.
  const applyGlobalCategory = () =>
    setGeneratedProducts(prev =>
      prev.map(p => {
        const variants = (p.variants.length ? p.variants : [makeVariant("#000000", globalCategory)])
          .map(v => ({ ...v, sizeRows: defaultSizeRows(globalCategory) }));
        return { ...p, categoryId: globalCategory, subcategoryId: globalSubcategory, variants };
      }));

  const applyGlobalPrice = () => {
    const price = globalPrice.trim();
    if (!price) {
      toast({ title: "Enter a price first", variant: "destructive" });
      return;
    }
    setGeneratedProducts(prev => prev.map(p => ({ ...p, price })));
    toast({ title: `Price set to ${price} for all products` });
  };

  const handlePublish = async () => {
    const toPublish = generatedProducts.filter(p => p.name && p.price);
    if (!toPublish.length) {
      toast({ title: "Nothing to publish", description: "Fill in name & price for each product.", variant: "destructive" }); return;
    }
    setPublishing(true);
    try {
      const res = await fetch("/api/admin/bulk-create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: toPublish.map((p) => {
            const variantMainImages = new Set(
              p.variants
                .map((variant) => (variant.mainImage || "").trim())
                .filter(Boolean),
            );

            const sideImages = Array.from(
              new Set(
                (p.extraImages || [])
                  .map((url: string) => url.trim())
                  .filter(
                    (url: string) =>
                      Boolean(url) &&
                      url !== p.imageUrl &&
                      !variantMainImages.has(url),
                  ),
              ),
            );

            return {
              name: p.name,
              description: p.description || p.name,
              price: p.price,
              mainImage: p.imageUrl,
              images: sideImages,
              videoUrl: p.videoUrl || null,
              categoryId: p.categoryId || null,
              subcategoryId: p.subcategoryId || null,
              colorVariants: p.variants.map((variant, variantIndex) => {
                const variantMainImage =
                  (variant.mainImage || "").trim() ||
                  (variantIndex === 0 ? p.imageUrl : "");
                const variantSideImages =
                  variantIndex === 0
                    ? sideImages.filter((url) => url !== variantMainImage)
                    : [];

                return {
                  name: variant.name,
                  colorCode: variant.colorCode,
                  colorTags: variant.colorTags,
                  mainImage: variantMainImage,
                  images: variantSideImages,
                  media: [
                    // Keep the product-level video inside the first color
                    // variant as well. ProductDetails prioritizes variant.media
                    // when it exists; without this, videos attached in the final
                    // AI publish step were saved but never shown on the product page.
                    ...(variantIndex === 0 && p.videoUrl
                      ? [
                          {
                            type: "video" as const,
                            url: p.videoUrl,
                            isPrimary: false,
                          },
                        ]
                      : []),
                    ...(variantMainImage
                      ? [
                          {
                            type: "image" as const,
                            url: variantMainImage,
                            isPrimary: true,
                          },
                        ]
                      : []),
                    ...variantSideImages.map((url) => ({
                      type: "image" as const,
                      url,
                      isPrimary: false,
                    })),
                  ],
                  sizeInventory: Object.fromEntries(
                    variant.sizeRows.map((row) => [row.size, row.qty]),
                  ),
                  sizes: variant.sizeRows.map((row) => row.size),
                };
              }),
              stockQuantity: p.variants
                .flatMap((variant) => variant.sizeRows)
                .reduce((sum, row) => sum + row.qty, 0),
              isFeatured: p.isFeatured,
              isNewArrival: p.isNewArrival,
              isBestSeller: p.isBestSeller,
            };
          }),
        }),
      });
      const data = await res.json();
      setPublishResults(data);
      toast({ title: `${data.created} products published!`, description: data.errors?.length ? `${data.errors.length} failed` : "All added successfully." });
    } catch (err: any) {
      toast({ title: "Publish failed", description: err.message, variant: "destructive" });
    } finally { setPublishing(false); }
  };

  const handleExport = async () => {
    try {
      const res = await fetch("/api/admin/products/export-json");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `lucerne-backup-${new Date().toISOString().slice(0,10)}.json`; a.click();
      URL.revokeObjectURL(url); toast({ title: "Backup downloaded!" });
    } catch (err: any) { toast({ title: "Export failed", description: err.message, variant: "destructive" }); }
  };

  const handleImportFile = async (file: File) => {
    setImportLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const products = data.products || (Array.isArray(data) ? data : null);
      if (!products) throw new Error("Invalid backup format");
      const res = await fetch("/api/admin/products/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products }),
      });
      const result = await res.json();
      toast({ title: "Import Complete",
        description: `${result.created} created, ${result.updated} updated${result.errors?.length?`, ${result.errors.length} errors`:""}` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImportLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateProduct = (idx: number, patch: Partial<GeneratedProduct>) =>
    setGeneratedProducts(prev => prev.map((p,i) => i===idx ? {...p,...patch} : p));
  const removeProduct = (idx: number) =>
    setGeneratedProducts(prev => prev.filter((_,i) => i!==idx));

  const readyCount = generatedProducts.filter(p => p.name && p.price).length;

  /* ── Render ── */
  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-violet-50 to-primary/5 dark:from-violet-950/20 dark:to-primary/5 border border-violet-200/60 dark:border-violet-800/40 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-primary flex items-center justify-center shadow-md shrink-0">
            <CloudUpload className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-base">Bulk Upload from Cloudinary</h2>
            <p className="text-xs text-muted-foreground">Import, AI-generate details, and publish many products at once</p>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const isDone = step > s.id; const isActive = step === s.id;
          return (
            <div key={s.id} className="flex items-center flex-1 min-w-0">
              <button onClick={() => isDone && setStep(s.id)}
                className={cn("flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0",
                  isActive && "bg-primary text-primary-foreground shadow",
                  isDone && "text-primary hover:bg-primary/10 cursor-pointer",
                  !isActive && !isDone && "text-muted-foreground")}>
                <div className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0",
                  isActive && "bg-primary-foreground/20", isDone && "bg-primary/15")}>
                  {isDone ? <Check className="w-3 h-3" /> : <s.icon className="w-3 h-3" />}
                </div>
                <span className="hidden sm:inline truncate">{s.label}</span>
              </button>
              {i < STEPS.length-1 && <div className={cn("h-px flex-1 mx-1", step > s.id ? "bg-primary/40" : "bg-border")} />}
            </div>
          );
        })}
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div>
              <h3 className="font-semibold mb-0.5">Browse Cloudinary</h3>
              <p className="text-sm text-muted-foreground">Load recent images and select which to import.</p>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-sm mb-2 block">How many images to load?</Label>
                <div className="flex flex-wrap gap-2 items-center">
                  {[10,20,30,50,100].map(n => (
                    <button key={n} onClick={() => { setFetchCount(n); setFetchCountInput(String(n)); }}
                      className={cn("px-3 py-1.5 rounded-lg text-sm font-medium border transition-all",
                        fetchCount===n && fetchCountInput===String(n)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary/50")}>
                      {n}
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <Input type="number" min={1} max={500} value={fetchCountInput}
                      onChange={e => { setFetchCountInput(e.target.value); const n=parseInt(e.target.value); if(n>0) setFetchCount(n); }}
                      className="h-9 w-20 text-sm text-center" placeholder="Custom" />
                    <span className="text-xs text-muted-foreground">custom</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Default Category</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={globalCategory} onChange={e => { setGlobalCategory(e.target.value); setGlobalSubcategory(""); }}>
                    <option value="">None</option>
                    {(categories as any[]).map(c => <option key={c.id} value={c.id}>{catLabel(c)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Default Subcategory</Label>
                  <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                    value={globalSubcategory} onChange={e => setGlobalSubcategory(e.target.value)} disabled={!globalCategory}>
                    <option value="">None</option>
                    {filteredSubs.map((s:any) => <option key={s.id} value={s.id}>{subLabel(s)}</option>)}
                  </select>
                </div>
              </div>
              <Button className="w-full gap-2" onClick={handleFetch} disabled={loadingImages}>
                {loadingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                Load {fetchCount} Images from Cloudinary
              </Button>
            </div>
          </div>
          <div className="bg-gradient-to-br from-primary/5 to-violet-500/5 border border-primary/20 rounded-xl p-5 space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> How it works</h3>
            <div className="space-y-3">
              {[
                { icon: ImageIcon, t:"Browse Cloudinary", d:"Load your most recent photos" },
                { icon: CheckSquare, t:"Select images", d:"Pick individual, all, or first N" },
                { icon: Wand2, t:"AI Auto-Fill", d:"Gemini Vision writes names, descriptions & colors" },
                { icon: Package, t:"Review & Publish", d:"Add colors, sizes, then publish" },
              ].map((item,i) => (
                <div key={i} className="flex gap-3 items-start">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <item.icon className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.t}</p>
                    <p className="text-xs text-muted-foreground">{item.d}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-primary/15 pt-3 space-y-2">
              {/* AI source toggle */}
              <div className="flex items-center gap-2">
                <Bot className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs font-medium text-foreground">AI Source</span>
                <div className="flex rounded-md border border-border overflow-hidden text-xs ms-auto">
                  <button
                    onClick={() => { setUseOllama(false); saveOllamaConfig({ enabled: false }); }}
                    className={cn("px-2.5 py-1 transition-colors", !useOllama ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}
                  >Gemini / Cloud</button>
                  <button
                    onClick={() => { setUseOllama(true); saveOllamaConfig({ enabled: true }); setShowOllamaSettings(true); }}
                    className={cn("px-2.5 py-1 transition-colors", useOllama ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}
                  >Ollama (Local)</button>
                </div>
              </div>

              {/* Ollama diagnostics panel */}
              {useOllama ? (
                <div className="bg-background/60 rounded-lg border border-border p-2.5 space-y-2">
                  {/* Health status */}
                  <div className="flex items-center gap-1.5">
                    {ollamaStatus === "ok" && <Wifi className="w-3 h-3 text-green-500" />}
                    {ollamaStatus === "error" && <WifiOff className="w-3 h-3 text-red-500" />}
                    {ollamaStatus === "checking" && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                    {ollamaStatus === "idle" && <Wifi className="w-3 h-3 text-muted-foreground" />}
                    <span className="text-xs text-muted-foreground">
                      {ollamaStatus === "ok" && <span className="text-green-600 font-medium">Connected</span>}
                      {ollamaStatus === "error" && <span className="text-red-600 font-medium">Not reachable</span>}
                      {ollamaStatus === "checking" && "Checking…"}
                      {ollamaStatus === "idle" && "Not tested"}
                    </span>
                    {ollamaLastCode !== null && (
                      <span className="ms-auto text-[10px] text-muted-foreground font-mono">HTTP {ollamaLastCode}</span>
                    )}
                  </div>

                  {/* Last error */}
                  {ollamaStatus === "error" && ollamaError && (
                    <p className="text-[11px] leading-snug text-red-600/90 bg-red-50 border border-red-200 rounded p-1.5">
                      {ollamaError}
                    </p>
                  )}

                  {/* Ollama URL (saved on the server) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-muted-foreground">Ollama URL (local or Cloudflare Tunnel)</label>
                    <div className="flex gap-1.5">
                      <Input
                        value={ollamaHost}
                        onChange={e => setOllamaHost(e.target.value)}
                        placeholder="https://your-tunnel.trycloudflare.com"
                        className="h-7 text-xs font-mono"
                      />
                      <button
                        onClick={applyOllamaUrl}
                        disabled={savingOllamaUrl}
                        className="px-2 h-7 rounded-md border border-border text-xs hover:bg-accent whitespace-nowrap disabled:opacity-50"
                      >{savingOllamaUrl ? "Saving…" : "Save"}</button>
                      <button
                        onClick={testOllama}
                        className="px-2 h-7 rounded-md border border-border text-xs hover:bg-accent whitespace-nowrap"
                      >Test</button>
                    </div>

                    {/* Model picker */}
                    {ollamaModels.length > 0 ? (
                      <select
                        value={ollamaModel}
                        onChange={e => { setOllamaModel(e.target.value); saveOllamaConfig({ model: e.target.value }); }}
                        className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <Input
                        value={ollamaModel}
                        onChange={e => setOllamaModel(e.target.value)}
                        placeholder="e.g. llava, llava-phi3, moondream"
                        className="h-7 text-xs"
                        onBlur={() => saveOllamaConfig({ model: ollamaModel })}
                      />
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Requests are proxied through this site's server (no browser CORS). Set the URL to your local Ollama
                    (<span className="font-mono">http://localhost:11434</span>) only if the server runs on the same machine, otherwise paste your Cloudflare Tunnel URL. Needs a vision model (llava, llava-phi3, moondream).
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Key className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                  <span>Requires <strong>GEMINI_API_KEY</strong> in Secrets. Or switch to Ollama (no key needed).</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-xl p-3 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold text-sm">{cloudinaryImages.length} images</span>
                {selectedImages.size > 0 && (() => {
                  const selGrouped = Array.from(selectedImages).filter(u => imageGroups[u]).length;
                  const selFree = selectedImages.size - selGrouped;
                  return (
                    <span className="text-xs text-primary font-medium">
                      {selectedImages.size} selected
                      {selGrouped > 0 && selFree > 0 && <span className="text-muted-foreground font-normal"> ({selGrouped} grouped · {selFree} free)</span>}
                      {selGrouped > 0 && selFree === 0 && <span className="text-muted-foreground font-normal"> (all grouped)</span>}
                      {selGrouped === 0 && selFree > 0 && <span className="text-muted-foreground font-normal"> (all free)</span>}
                    </span>
                  );
                })()}
                {groupCount > 0 && (
                  <span className="text-xs inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 font-medium">
                    <Layers className="w-3 h-3" />{groupCount} group{groupCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button variant="outline" size="sm" onClick={selectAll}><CheckSquare className="w-3.5 h-3.5 me-1" />All</Button>
                <Button variant="outline" size="sm" onClick={deselectAll} disabled={!selectedImages.size}><Square className="w-3.5 h-3.5 me-1" />None</Button>
                <Button variant="outline" size="sm" onClick={copyImageUrls}
                  title="Copy image URLs to paste into ChatGPT/Claude with the import prompt">
                  <Copy className="w-3.5 h-3.5 me-1" />Copy URLs
                </Button>
                <Button variant="outline" size="sm" onClick={downloadAiKit} disabled={downloadingKit}
                  title="Download a ZIP with the renamed photos, a pre-filled template.json, and the AI prompt">
                  {downloadingKit
                    ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" />
                    : <Download className="w-3.5 h-3.5 me-1" />}
                  {downloadingKit ? `Building ${aiProgress}%` : "Download AI Kit"}
                </Button>
                {nextCursor && (
                  <div className="flex items-center gap-1">
                    <Input type="number" min={1} max={500} value={loadMoreInput}
                      onChange={e => setLoadMoreInput(e.target.value)}
                      className="h-8 w-16 text-xs text-center" placeholder="50"
                      title="How many more images to load"
                      onKeyDown={e => e.key === "Enter" && fetchImages(nextCursor, parseInt(loadMoreInput) || 50)} />
                    <Button variant="outline" size="sm" onClick={() => fetchImages(nextCursor, parseInt(loadMoreInput) || 50)} disabled={loadingImages}
                      title="Load more images from Cloudinary and add them to the grid below">
                      <RefreshCw className={cn("w-3.5 h-3.5 me-1", loadingImages && "animate-spin")} />
                      {loadingImages ? "Loading…" : "Load More"}
                    </Button>
                  </div>
                )}
                {!nextCursor && cloudinaryImages.length > 0 && (
                  <span className="text-[11px] text-muted-foreground px-1">No more images to load</span>
                )}
                <Button size="sm" variant="ghost" onClick={() => setStep(1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
            {/* Manual grouping: tell the AI which photos are the SAME product in different colors */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
              <Layers className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">Same product?</span>
              <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={linkSelected}
                disabled={selectedImages.size < 2}
                title="Select the photos of the SAME product (different colors), then click here to combine them into one product">
                <Link2 className="w-3.5 h-3.5 me-1" />Add ALL selected to group ({selectedImages.size})
              </Button>
              {selectedGroupedCount > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={unlinkSelected}>
                  <Unlink className="w-3.5 h-3.5 me-1" />Unlink
                </Button>
              )}
              {groupCount > 0 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-muted-foreground" onClick={clearGroups}>
                  <X className="w-3.5 h-3.5 me-1" />Clear groups
                </Button>
              )}
              <label className="ms-auto flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none"
                title="Let the AI also try to auto-detect same-product photos. Off by default for best accuracy — use manual links instead.">
                <input type="checkbox" checked={autoGroup} onChange={e => setAutoGroup(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
                Auto-detect with AI
              </label>
            </div>
            {/* Per-group select buttons — click to add/remove group from selection */}
            {groupCount > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Groups:</span>
                {Array.from(new Set(Object.values(imageGroups))).sort((a, b) => a - b).map(gid => {
                  const gUrls = Object.entries(imageGroups).filter(([, g]) => g === gid).map(([u]) => u);
                  const count = gUrls.length;
                  const allSel = gUrls.length > 0 && gUrls.every(u => selectedImages.has(u));
                  return (
                    <span key={gid}
                      className={cn("flex items-center rounded-full font-semibold text-white text-[11px] overflow-hidden ring-offset-1 transition-all",
                        allSel ? "ring-2 ring-white ring-offset-2" : "")}
                      style={{ backgroundColor: groupColor(gid), outline: `2px solid ${groupColor(gid)}` }}>
                      <button onClick={() => selectGroup(gid)}
                        title={allSel ? `Deselect Group ${gid}` : `Add Group ${gid} (${count}) to selection`}
                        className="flex items-center gap-1 h-7 px-2.5 hover:bg-white/15 transition-colors">
                        {allSel ? <CheckSquare className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                        G{gid} ({count})
                      </button>
                      <button onClick={() => deleteGroup(gid)}
                        title={`Disband Group ${gid} — remove all ${count} images from this group`}
                        className="flex items-center justify-center w-5 h-7 pe-1 hover:bg-black/25 transition-colors cursor-pointer">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
                <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={selectAllGroups}
                  title="Add all grouped images to selection">
                  <CheckSquare className="w-3.5 h-3.5 me-1" />All groups
                </Button>
                {cloudinaryImages.some(img => !imageGroups[img.fullUrl]) && (
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2.5" onClick={selectUnassigned}
                    title="Add all unassigned (not in any group) images to selection">
                    <Square className="w-3.5 h-3.5 me-1" />Unassigned
                  </Button>
                )}
                <label className="ms-auto flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none"
                  title="Dim grouped images so ungrouped ones stand out">
                  <input type="checkbox" checked={dimGrouped} onChange={e => setDimGrouped(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
                  Dim grouped
                </label>
              </div>
            )}
            <div className="flex items-center gap-2 border-t border-border pt-2">
              <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">Select first</span>
              <Input type="number" min={1} max={cloudinaryImages.length} value={selectNInput}
                onChange={e => setSelectNInput(e.target.value)} className="h-7 w-20 text-sm text-center" placeholder="N"
                onKeyDown={e => e.key==="Enter" && selectFirstN()} />
              <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={selectFirstN}>Go</Button>
              <div className="ms-auto flex items-center gap-1.5">
                {useOllama && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1",
                    ollamaStatus === "ok" ? "border-green-400 text-green-700 bg-green-50" : "border-amber-400 text-amber-700 bg-amber-50"
                  )}>
                    <Bot className="w-2.5 h-2.5" />
                    {ollamaModel || "llava"}
                  </span>
                )}
                <Button size="sm" disabled={!selectedImages.size} onClick={generateAI}
                  className="gap-1.5 bg-gradient-to-r from-violet-600 to-primary hover:opacity-90 shadow">
                  <Wand2 className="w-3.5 h-3.5" /> AI Generate ({selectedImages.size})
                </Button>
                <Button size="sm" variant="outline" disabled={!selectedImages.size} onClick={skipAI}>
                  Manual <ChevronRight className="w-3.5 h-3.5 ms-0.5" />
                </Button>
              </div>
            </div>
          </div>
          {loadingImages && cloudinaryImages.length === 0
            ? <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-sm">Loading images…</p>
              </div>
            : <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                {cloudinaryImages.map((img, imgIdx) => {
                  const selected = selectedImages.has(img.fullUrl);
                  const gid = imageGroups[img.fullUrl];
                  const inUse = usedImageUrls.has(img.publicId) || usedImageUrls.has(cloudinaryPublicId(img.fullUrl));
                  return (
                    <button key={img.publicId} onClick={() => toggleImage(img.fullUrl)}
                      className={cn("relative group rounded-lg overflow-hidden border-2 transition-all aspect-square",
                        selected ? "border-primary ring-2 ring-primary/30" : "border-transparent hover:border-primary/40",
                        dimGrouped && gid && !selected ? "opacity-35 saturate-50" : "")}>
                      <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      <div className={cn("absolute inset-0 transition-all", selected ? "bg-primary/20" : "bg-black/0 group-hover:bg-black/10")} />
                      {inUse && !selected && (
                        <span className="absolute bottom-1 left-1 text-[8px] font-semibold bg-amber-500 text-white px-1 py-px rounded leading-tight z-10">In use</span>
                      )}
                      {/* View large (does not toggle selection) */}
                      <span role="button" tabIndex={-1} title="View large"
                        onClick={e => { e.stopPropagation(); e.preventDefault(); setLightboxIndex(imgIdx); }}
                        className="absolute top-1.5 left-1.5 w-6 h-6 rounded-md bg-black/45 hover:bg-black/75 text-white items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-zoom-in hidden sm:flex">
                        <ZoomIn className="w-3.5 h-3.5" />
                      </span>
                      <div className={cn("absolute top-1.5 right-1.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center",
                        selected ? "bg-primary" : "bg-black/30")}>
                        {selected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      {gid && (
                        <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 ps-1.5 pe-0.5 h-4 rounded-full text-[9px] font-bold text-white shadow ring-1 ring-white/60"
                          style={{ backgroundColor: groupColor(gid) }} title={`Group ${gid} — same product, different color`}>
                          <Layers className="w-2 h-2" />{gid}
                          <span role="button" tabIndex={-1} title={`Remove from Group ${gid}`}
                            onClick={e => { e.stopPropagation(); e.preventDefault();
                              setImageGroups(prev => { const n = { ...prev }; delete n[img.fullUrl]; return n; }); }}
                            className="flex items-center justify-center w-3 h-3 rounded-full bg-black/30 hover:bg-black/60 transition-colors cursor-pointer">
                            <X className="w-2 h-2" />
                          </span>
                        </div>
                      )}
                      {/* Per-image group button — Problem 1 fix */}
                      <span role="button" tabIndex={-1}
                        title="Add to group"
                        onClick={e => openGroupPopover(img.fullUrl, e)}
                        className={cn(
                          "absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all z-10 cursor-pointer",
                          stagedForGroup.has(img.fullUrl)
                            ? "bg-violet-500 text-white opacity-100"
                            : "bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-black/80"
                        )}>
                        {stagedForGroup.has(img.fullUrl) ? <Check className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
          }
          {lightboxIndex !== null && (
            <Lightbox images={cloudinaryImages} index={lightboxIndex}
              setIndex={setLightboxIndex} onClose={() => setLightboxIndex(null)} />
          )}
        </div>
      )}

      {/* ── Fixed popover for per-image group button (Problem 1) ── */}
      {groupPopoverUrl && groupPopoverPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setGroupPopoverUrl(null); setGroupPopoverPos(null); }} />
          <div className="fixed z-50 bg-background border border-border rounded-xl shadow-2xl p-1.5 min-w-44 text-sm"
            style={{ top: groupPopoverPos.top, left: groupPopoverPos.left }}>
            <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted flex items-center gap-2 text-xs"
              onClick={() => { toggleStaged(groupPopoverUrl); setGroupPopoverUrl(null); setGroupPopoverPos(null); }}>
              <Layers className="w-3.5 h-3.5 text-violet-500" />
              {stagedForGroup.has(groupPopoverUrl) ? "Remove from staged" : "Stage for multi-select"}
            </button>
            {Array.from(new Set(Object.values(imageGroups))).sort((a, b) => a - b).map(gid => (
              <button key={gid} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted flex items-center gap-2 text-xs"
                onClick={() => { setImageGroups(prev => ({ ...prev, [groupPopoverUrl]: gid })); setGroupPopoverUrl(null); setGroupPopoverPos(null); }}>
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: groupColor(gid) }} />
                Add to Group {gid}
              </button>
            ))}
            <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted flex items-center gap-2 text-xs"
              onClick={() => { setCreateGroupSingleUrl(groupPopoverUrl); setNewGroupName(""); setGroupPopoverUrl(null); setGroupPopoverPos(null); }}>
              <Plus className="w-3.5 h-3.5 text-primary" />
              Create new group with this
            </button>
          </div>
        </>
      )}

      {/* ── "Create group" dialog for single-image button (Problem 1) ── */}
      {createGroupSingleUrl && (
        <Dialog open onOpenChange={() => setCreateGroupSingleUrl(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Create new group</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This image will be the first member of the group. Stage more images to add them.</p>
            <Input placeholder="Group label (optional)" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateGroupSingleUrl(null)}>Cancel</Button>
              <Button onClick={() => {
                const id = nextGroupId;
                setImageGroups(prev => ({ ...prev, [createGroupSingleUrl!]: id }));
                setNextGroupId(id + 1);
                setCreateGroupSingleUrl(null);
                toast({ title: `Group ${id} created`, description: "Stage more images then click '+ G${id}' to add them." });
              }}>Create Group {nextGroupId}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Staged floating bar (Problem 1) — independent from main selection ── */}
      {step === 2 && stagedForGroup.size >= 2 && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl border border-violet-400 bg-violet-950/95 backdrop-blur-sm flex-wrap max-w-lg justify-center">
          <Layers className="w-3.5 h-3.5 text-violet-300" />
          <span className="text-xs font-medium text-violet-200 whitespace-nowrap">
            {stagedForGroup.size} staged
          </span>
          <div className="w-px h-4 bg-violet-700" />
          <Button size="sm" className="h-7 text-xs px-3 bg-violet-600 hover:bg-violet-500 text-white border-0"
            onClick={createGroupFromStaged}
            title="Create a new group from staged images">
            <Link2 className="w-3.5 h-3.5 me-1" />Create Group
          </Button>
          {Array.from(new Set(Object.values(imageGroups))).sort((a, b) => a - b).map(gid => (
            <button key={gid}
              onClick={() => addStagedToExistingGroup(gid)}
              title={`Add staged images to Group ${gid}`}
              className="h-7 text-[11px] px-2.5 rounded-full border font-semibold text-white flex items-center gap-1 hover:opacity-85"
              style={{ backgroundColor: groupColor(gid), borderColor: groupColor(gid) }}>
              + G{gid}
            </button>
          ))}
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-violet-300 hover:text-white hover:bg-violet-800"
            onClick={() => setStagedForGroup(new Set())}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* ── Floating Link bar — visible while scrolled down in step 2 ── */}
      {step === 2 && selectedImages.size >= 1 && (() => {
        const existingGroupIds = Array.from(new Set(Object.values(imageGroups))).sort((a, b) => a - b);
        const unassignedCount = Array.from(selectedImages).filter(u => !imageGroups[u]).length;
        return (
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-2xl border border-border bg-background/95 backdrop-blur-sm flex-wrap max-w-lg justify-center">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {selectedImages.size} selected
            </span>
            <div className="w-px h-4 bg-border" />
            {/* New group from ALL selected */}
            <Button size="sm" className="h-7 text-xs px-3" onClick={linkSelected}
              disabled={unassignedCount < 2}
              title="Group ALL currently selected photos together">
              <Link2 className="w-3.5 h-3.5 me-1" />Add ALL selected to group
            </Button>
            {/* Add to existing groups */}
            {existingGroupIds.map(gid => (
              <button key={gid}
                onClick={() => addSelectedToGroup(gid)}
                disabled={unassignedCount === 0}
                title={`Add selected unassigned photos to Group ${gid}`}
                className="h-7 text-[11px] px-2.5 rounded-full border font-semibold text-white disabled:opacity-40 flex items-center gap-1"
                style={{ backgroundColor: groupColor(gid), borderColor: groupColor(gid) }}>
                + G{gid}
              </button>
            ))}
            {selectedGroupedCount > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={unlinkSelected}>
                <Unlink className="w-3.5 h-3.5 me-1" />Unlink
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-muted-foreground" onClick={deselectAll}>
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        );
      })()}

      {/* ── STEP 3 ── */}
      {step === 3 && (
        <div className="flex flex-col items-center justify-center py-20 gap-5">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shadow-xl">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-ping" />
          </div>
          <div className="text-center">
            <h3 className="font-bold text-lg">Analyzing images with AI…</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {useOllama
                ? "Your local Ollama is writing names, descriptions & colors — one image at a time"
                : "Gemini Vision is writing names, descriptions & colors"}
            </p>
          </div>
          <div className="w-56 bg-muted rounded-full h-1.5 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-primary rounded-full transition-all duration-500"
              style={{ width: `${aiProgress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">
            {aiProgress}% — {aiCount.done}/{aiCount.total || selectedImages.size} done
            {aiEtaMs != null && aiEtaMs > 0 && <> · ~{formatEta(aiEtaMs)} left</>}
          </p>
          {useOllama && (
            <p className="text-[11px] text-muted-foreground max-w-xs text-center">
              On a home PC without a graphics card this can take ~30s–2min per image. You can leave this open — it keeps going.
            </p>
          )}
        </div>
      )}

      {/* ── STEP 4 ── */}
      {step === 4 && (
        <div className="space-y-4">
          {publishResults && (
            <div className={cn("flex items-center gap-3 p-4 rounded-xl border",
              publishResults.errors?.length
                ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800/40 dark:text-amber-300"
                : "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-300")}>
              <Check className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">{publishResults.created} products published!</p>
                {publishResults.errors?.length > 0 && <p className="text-sm">{publishResults.errors.length} failed.</p>}
              </div>
              <Button variant="ghost" size="sm" className="ms-auto" onClick={() => {
                setStep(1); setPublishResults(null); setGeneratedProducts([]);
                setSelectedImages(new Set()); setCloudinaryImages([]);
                setImageGroups({}); setNextGroupId(1);
              }}>Start Over</Button>
            </div>
          )}

          {/* Apply category to all */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Apply Category to All</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={globalCategory} onChange={e => { setGlobalCategory(e.target.value); setGlobalSubcategory(""); }}>
                  <option value="">None</option>
                  {(categories as any[]).map(c => <option key={c.id} value={c.id}>{catLabel(c)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Apply Subcategory to All</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
                  value={globalSubcategory} onChange={e => setGlobalSubcategory(e.target.value)} disabled={!globalCategory}>
                  <option value="">None</option>
                  {filteredSubs.map((s:any) => <option key={s.id} value={s.id}>{subLabel(s)}</option>)}
                </select>
              </div>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={applyGlobalCategory}>
              <FolderOpen className="w-3.5 h-3.5" /> Apply to All
            </Button>
          </div>

          {/* Set one price for all products (optional) */}
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Set Price for All (optional)</Label>
              <Input type="number" min={0} step="0.01" inputMode="decimal"
                value={globalPrice} onChange={e => setGlobalPrice(e.target.value)}
                placeholder="e.g. 120" className="h-9 text-sm" />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={applyGlobalPrice}>
              <Hash className="w-3.5 h-3.5" /> Apply Price to All
            </Button>
          </div>

          {/* Publish bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-sm">{generatedProducts.length} products to review</p>
              <p className="text-xs text-muted-foreground">
                <span className="text-emerald-600 font-medium">{readyCount} ready</span>
                {generatedProducts.length - readyCount > 0 &&
                  <span className="text-amber-500"> · {generatedProducts.length - readyCount} need name/price</span>}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep(2)}>
                <ChevronLeft className="w-4 h-4 me-1" /> Back
              </Button>
              <Button onClick={handlePublish} disabled={publishing || readyCount===0}
                className="gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 shadow text-white">
                {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Publish {readyCount} Products
              </Button>
            </div>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {generatedProducts.map((product, idx) => (
              <ProductCard key={idx} product={product} idx={idx}
                categories={categories as any[]} subcategories={subcategories as any[]}
                onUpdate={updateProduct} onRemove={removeProduct}
                usedImageUrls={usedImageUrls} usedVideoUrls={usedVideoUrls} />
            ))}
            <button onClick={() => setStep(2)}
              className="border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors min-h-[200px]">
              <Plus className="w-6 h-6" />
              <span className="text-xs">Add more</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
