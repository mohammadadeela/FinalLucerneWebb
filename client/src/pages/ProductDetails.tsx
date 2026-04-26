import { useParams, useLocation } from "wouter";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useProduct, useProducts } from "@/hooks/use-products";
import { useCart } from "@/store/use-cart";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Minus, Plus, ShoppingBag, Check, X, Heart, Ruler, Share, Link2, BookOpen, ChevronUp, ChevronDown } from "lucide-react";
import { useLanguage } from "@/i18n";
import type { ColorVariant } from "@shared/schema";
import { COLOR_FAMILIES, translateColorName } from "@/lib/colorFamilies";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductWatermark } from "@/components/ui/ProductWatermark";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWishlist } from "@/hooks/use-wishlist";
import { useAuth } from "@/hooks/use-auth";
import { useCategories } from "@/hooks/use-categories";
import { trackProductEvent } from "@/lib/tracking";

function normalizeArabicDigits(str: string): string {
  return str
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/،/g, ".");
}

// ─── Seeded shuffle (Fisher-Yates with LCG RNG) ──────────────────────────────
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Color hue helpers for similarity matching ───────────────────────────────
function hexToHue(hex: string): number {
  if (!hex || hex.length < 7) return -1;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return -1; // achromatic (gray/black/white)
  let h = 0;
  if (max === r) h = ((g - b) / d + 6) % 6 * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return h;
}
function hueDist(a: number, b: number): number {
  if (a < 0 || b < 0) return 180; // achromatic vs any = neutral distance
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function getSwatchColors(variant: ColorVariant): string[] {
  const tagged = (variant.colorTags || [])
    .map((tag) => COLOR_FAMILIES.find((family) => family.key === tag)?.hex)
    .filter((hex): hex is string => Boolean(hex));
  return tagged.length > 0 ? tagged : [variant.colorCode];
}

// ─── localStorage helpers ────────────────────────────────────────────────────
function getSavedSize(): Record<string, any> {
  try {
    return JSON.parse(localStorage.getItem("my_size") || "{}");
  } catch {
    return {};
  }
}
function saveSize(data: Record<string, any>) {
  try {
    const existing = getSavedSize();
    localStorage.setItem("my_size", JSON.stringify({ ...existing, ...data }));
  } catch {}
}

// ─── Clothing size logic ─────────────────────────────────────────────────────
const CLOTHING_SIZES = [
  { label: "XS", cMin: 80, cMax: 84, wMin: 62, wMax: 66, hMin: 86, hMax: 90 },
  { label: "S",  cMin: 84, cMax: 88, wMin: 66, wMax: 70, hMin: 90, hMax: 94 },
  { label: "M",  cMin: 88, cMax: 92, wMin: 70, wMax: 74, hMin: 94, hMax: 98 },
  { label: "L",  cMin: 92, cMax: 96, wMin: 74, wMax: 78, hMin: 98, hMax: 102 },
  { label: "XL", cMin: 96, cMax: 100, wMin: 78, wMax: 82, hMin: 102, hMax: 106 },
  { label: "XXL",cMin: 100,cMax: 106, wMin: 82, wMax: 88, hMin: 106, hMax: 112 },
];
const FIT_OFFSET: Record<string, number> = { tight: -1, slim: 0, normal: 0, relaxed: 1, loose: 2 };

function computeClothingSize(chest: number, waist: number, hip: number, fit: string): string {
  let best = 0, bestScore = Infinity;
  CLOTHING_SIZES.forEach((sz, i) => {
    const score =
      Math.abs(chest - (sz.cMin + sz.cMax) / 2) +
      Math.abs(waist - (sz.wMin + sz.wMax) / 2) +
      Math.abs(hip  - (sz.hMin + sz.hMax) / 2);
    if (score < bestScore) { bestScore = score; best = i; }
  });
  const idx = Math.min(Math.max(best + (FIT_OFFSET[fit] || 0), 0), CLOTHING_SIZES.length - 1);
  return CLOTHING_SIZES[idx].label;
}

// ─── Pants size logic ─────────────────────────────────────────────────────────
const PANTS_SIZES = [
  { label: "XS",  eu: 34, wMin: 60, wMax: 64 },
  { label: "S",   eu: 36, wMin: 65, wMax: 69 },
  { label: "M",   eu: 38, wMin: 70, wMax: 74 },
  { label: "L",   eu: 40, wMin: 75, wMax: 79 },
  { label: "XL",  eu: 42, wMin: 80, wMax: 85 },
];
function computePantsSize(waist: number, fit: string): string {
  let best = 0, bestScore = Infinity;
  PANTS_SIZES.forEach((sz, i) => {
    const score = Math.abs(waist - (sz.wMin + sz.wMax) / 2);
    if (score < bestScore) { bestScore = score; best = i; }
  });
  const idx = Math.min(Math.max(best + (FIT_OFFSET[fit] || 0), 0), PANTS_SIZES.length - 1);
  return PANTS_SIZES[idx].label;
}

// ─── Shoe size data ───────────────────────────────────────────────────────────
const SHOE_DATA = {
  women: [
    { cm: 22, eu: 35, uk: 2, us: 4.5 },
    { cm: 22.5, eu: 36, uk: 3, us: 5 },
    { cm: 23, eu: 37, uk: 4, us: 6 },
    { cm: 23.5, eu: 37.5, uk: 4.5, us: 6.5 },
    { cm: 24, eu: 38, uk: 5, us: 7 },
    { cm: 24.5, eu: 39, uk: 6, us: 8 },
    { cm: 25, eu: 39.5, uk: 6.5, us: 8.5 },
    { cm: 25.5, eu: 40, uk: 7, us: 9 },
    { cm: 26, eu: 41, uk: 7.5, us: 9.5 },
    { cm: 26.5, eu: 42, uk: 8, us: 10 },
  ],
  men: [
    { cm: 24, eu: 38, uk: 5, us: 6 },
    { cm: 24.5, eu: 39, uk: 6, us: 7 },
    { cm: 25, eu: 40, uk: 6.5, us: 7.5 },
    { cm: 25.5, eu: 41, uk: 7, us: 8 },
    { cm: 26, eu: 42, uk: 8, us: 9 },
    { cm: 26.5, eu: 43, uk: 9, us: 10 },
    { cm: 27, eu: 44, uk: 9.5, us: 10.5 },
    { cm: 27.5, eu: 45, uk: 10.5, us: 11.5 },
    { cm: 28, eu: 46, uk: 11, us: 12 },
  ],
  unisex: [
    { cm: 23, eu: 36, uk: 3, us: 5 },
    { cm: 23.5, eu: 37, uk: 4, us: 6 },
    { cm: 24, eu: 38, uk: 5, us: 6.5 },
    { cm: 24.5, eu: 39, uk: 6, us: 7.5 },
    { cm: 25, eu: 40, uk: 6.5, us: 8 },
    { cm: 25.5, eu: 41, uk: 7, us: 8.5 },
    { cm: 26, eu: 42, uk: 8, us: 9 },
    { cm: 26.5, eu: 43, uk: 9, us: 10 },
    { cm: 27, eu: 44, uk: 9.5, us: 10.5 },
    { cm: 27.5, eu: 45, uk: 10.5, us: 11.5 },
  ],
};

// ─── FindMySizeDialog ─────────────────────────────────────────────────────────
type FindMySizeMode = "clothes" | "shoes" | "pants";

const CLOTHING_ORDER = ["XS", "S", "M", "L", "XL", "XXL"];

function closestClothesSize(recommended: string, available: string[]): string {
  if (!available.length) return recommended;
  if (available.includes(recommended)) return recommended;
  const recIdx = CLOTHING_ORDER.indexOf(recommended);
  let best = available[0];
  let bestDist = Infinity;
  for (const s of available) {
    const idx = CLOTHING_ORDER.indexOf(s);
    if (idx === -1) continue;
    const dist = Math.abs(idx - recIdx);
    if (dist < bestDist) { bestDist = dist; best = s; }
  }
  return best;
}

function closestShoeSize(euRecommended: number, available: string[]): string {
  if (!available.length) return String(euRecommended);
  const numeric = available.map(Number).filter((n) => !isNaN(n));
  if (!numeric.length) return String(euRecommended);
  const closest = numeric.reduce((a, b) => Math.abs(b - euRecommended) < Math.abs(a - euRecommended) ? b : a);
  return String(closest);
}

function FindMySizeDialog({
  open,
  onClose,
  mode,
  language,
  productSizes,
  onSizePicked,
}: {
  open: boolean;
  onClose: () => void;
  mode: FindMySizeMode;
  language: string;
  productSizes?: string[];
  onSizePicked?: (size: string) => void;
}) {
  const isAr = language === "ar";
  const [step, setStep] = useState(0);

  // clothes state
  const [chest, setChest] = useState("");
  const [waist, setWaist] = useState("");
  const [hip, setHip] = useState("");
  const [fit, setFit] = useState("normal");

  // shoes state
  const [foot, setFoot] = useState("");
  const [shoeGender, setShoeGender] = useState<"women" | "men" | "unisex">(
    "women",
  );
  const [shoeWidth, setShoeWidth] = useState("standard");
  const [shoeError, setShoeError] = useState("");

  // pants state
  const [pantsWaist, setPantsWaist] = useState("");
  const [pantsFit, setPantsFit] = useState("normal");
  const [pantsResult, setPantsResult] = useState("");
  const [pantsError, setPantsError] = useState("");

  // results
  const [clothesResult, setClothesResult] = useState("");
  const [shoeResult, setShoeResult] = useState<{
    eu: number;
    uk: number;
    us: number;
    cm: number;
  } | null>(null);
  const [clothesError, setClothesError] = useState("");

  const totalSteps = 2;

  useEffect(() => {
    if (open) {
      setStep(0);
      setClothesError("");
      setShoeError("");
      setPantsError("");
      setClothesResult("");
      setShoeResult(null);
      setPantsResult("");
      // Pre-fill from localStorage
      const saved = getSavedSize();
      if (mode === "clothes") {
        if (saved.clothes) setClothesResult(saved.clothes);
      } else if (mode === "pants") {
        if (saved.pants) setPantsResult(saved.pants);
      } else {
        if (saved.shoe_eu)
          setShoeResult({
            eu: saved.shoe_eu,
            uk: saved.shoe_uk,
            us: saved.shoe_us,
            cm: saved.shoe_cm,
          });
      }
    }
  }, [open, mode]);

  const progressBar = (
    <div className="flex gap-1 mb-5">
      {Array.from({ length: totalSteps }).map((_, i) => (
        <div
          key={i}
          className={`flex-1 h-0.5 rounded-full transition-all ${i <= step ? "bg-foreground" : "bg-border"}`}
        />
      ))}
    </div>
  );

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      className={`px-4 py-2 rounded-full border text-sm transition-all ${
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-background text-muted-foreground border-border hover:border-foreground/50"
      }`}
    >
      {label}
    </button>
  );

  // ── CLOTHES STEPS ──
  if (mode === "clothes") {
    // Step 0: How to measure + inputs
    if (step === 0)
      return (
        <Dialog open={open} onOpenChange={onClose}>
          <DialogContent className="max-w-sm" dir={isAr ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest text-base">
                {isAr ? "اكتشف مقاسك" : "Find my size"}
              </DialogTitle>
            </DialogHeader>
            {progressBar}
            <div className="bg-secondary rounded-lg p-4 mb-4 text-xs text-muted-foreground space-y-1 leading-relaxed">
              <p className="font-medium text-foreground mb-2">
                {isAr ? "طريقة القياس" : "How to measure"}
              </p>
              <p>1. {isAr ? "قيسي الصدر عند أوسع نقطة" : "Measure chest at the fullest point"}</p>
              <p>2. {isAr ? "قيسي الخصر عند أضيق نقطة" : "Measure waist at the narrowest point"}</p>
              <p>3. {isAr ? "قيسي الورك عند أوسع نقطة" : "Measure hips at the widest point"}</p>
              <p>4. {isAr ? "أدخلي الأرقام بالسنتيمتر" : "Enter all values in centimeters"}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { label: isAr ? "الصدر" : "Chest", val: chest, set: setChest, placeholder: isAr ? "مثلاً ٨٨" : "e.g. 88" },
                { label: isAr ? "الخصر" : "Waist",  val: waist, set: setWaist, placeholder: isAr ? "مثلاً ٧٠" : "e.g. 70" },
                { label: isAr ? "الورك" : "Hip",    val: hip,   set: setHip,   placeholder: isAr ? "مثلاً ٩٦" : "e.g. 96" },
              ].map(({ label, val, set, placeholder }) => (
                <div key={label}>
                  <label className="text-xs text-muted-foreground block mb-1">{label} <span className="text-muted-foreground/60">{isAr ? "سم" : "cm"}</span></label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={val}
                    onChange={(e) => set(normalizeArabicDigits(e.target.value))}
                    placeholder={placeholder}
                    className="w-full border border-border rounded px-2 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-foreground text-center"
                  />
                </div>
              ))}
            </div>
            {clothesError && <p className="text-xs text-destructive mb-2">{clothesError}</p>}
            <Button
              className="w-full rounded-md uppercase tracking-widest text-xs"
              onClick={() => {
                if (!chest || !waist || !hip) {
                  setClothesError(isAr ? "يرجى إدخال جميع المقاسات" : "Please enter all three measurements.");
                  return;
                }
                setClothesError("");
                setStep(1);
              }}
            >
              {isAr ? "التالي" : "Continue"}
            </Button>
          </DialogContent>
        </Dialog>
      );

    // Step 1: Fit preference
    if (step === 1)
      return (
        <Dialog open={open} onOpenChange={onClose}>
          <DialogContent className="max-w-sm" dir={isAr ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest text-base">
                {isAr ? "تفضيل القصة" : "Fit preference"}
              </DialogTitle>
            </DialogHeader>
            {progressBar}
            <p className="text-sm font-medium mb-2">
              {isAr ? "كيف تفضلين ملابسك؟" : "How do you prefer your clothes to fit?"}
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              {(isAr
                ? [["tight","ضيق جداً"],["slim","ضيق"],["normal","عادي"],["relaxed","مريح"],["loose","فضفاض"]]
                : [["tight","Tight"],["slim","Slim"],["normal","Normal"],["relaxed","Relaxed"],["loose","Loose"]]
              ).map(([val, lbl]) => chip(lbl, fit === val, () => setFit(val)))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="w-11 rounded-md" onClick={() => setStep(0)}>←</Button>
              <Button
                className="flex-1 rounded-md uppercase tracking-widest text-xs"
                onClick={() => {
                  const raw = computeClothingSize(+chest, +waist, +hip, fit);
                  const result = productSizes?.length ? closestClothesSize(raw, productSizes) : raw;
                  setClothesResult(result);
                  saveSize({ clothes: result });
                  setStep(2);
                }}
              >
                {isAr ? "اعرضي مقاسي" : "Show my size"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      );

    // Result step
    const resultSize = CLOTHING_SIZES.find((s) => s.label === clothesResult);
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm" dir={isAr ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="uppercase tracking-widest text-base">
              {isAr ? "مقاسك المقترح" : "Your recommended size"}
            </DialogTitle>
          </DialogHeader>
          <div className="bg-secondary rounded-lg p-6 text-center mb-4">
            <div className="text-5xl font-semibold mb-1">{clothesResult}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest">
              {isAr ? "مقاس الملابس" : "Clothing size"}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: isAr ? "الصدر" : "Chest", val: `${chest} cm`, range: resultSize ? `${resultSize.cMin}–${resultSize.cMax}` : "" },
              { label: isAr ? "الخصر" : "Waist",  val: `${waist} cm`, range: resultSize ? `${resultSize.wMin}–${resultSize.wMax}` : "" },
              { label: isAr ? "الورك" : "Hip",    val: `${hip} cm`,   range: resultSize ? `${resultSize.hMin}–${resultSize.hMax}` : "" },
            ].map(({ label, val, range }) => (
              <div key={label} className="bg-secondary rounded-lg p-3 text-center">
                <div className="text-sm font-semibold">{val}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                {range && <div className="text-xs text-muted-foreground/60 mt-1">({range})</div>}
              </div>
            ))}
          </div>
          {fit !== "normal" && (
            <p className="text-xs text-muted-foreground bg-secondary rounded p-3 mb-4 leading-relaxed">
              {fit === "tight" || fit === "slim"
                ? isAr ? "اخترتِ قصة ضيقة — قد تحتاجين مقاساً أكبر للراحة." : "You chose a slim fit — consider sizing up for comfort."
                : isAr ? "اخترتِ قصة مريحة — المقاس أكبر قليلاً من مقاسك الأساسي." : "You chose a relaxed fit — this is slightly larger than your base size."}
            </p>
          )}
          <Button
            className="w-full rounded-md uppercase tracking-widest text-xs mb-2"
            onClick={() => { onSizePicked?.(clothesResult); onClose(); }}
          >
            {isAr ? "اختر هذا المقاس" : "Select this size"}
          </Button>
          <Button variant="outline" className="w-full rounded-md text-xs" onClick={() => setStep(0)}>
            {isAr ? "ابدأ من جديد" : "Start over"}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  // ── PANTS STEPS ──
  if (mode === "pants") {
    // Step 0: Measurements
    if (step === 0)
      return (
        <Dialog open={open} onOpenChange={onClose}>
          <DialogContent className="max-w-sm" dir={isAr ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest text-base">
                {isAr ? "اكتشفي مقاس البنطلون" : "Find my pants size"}
              </DialogTitle>
            </DialogHeader>
            {progressBar}
            <div className="bg-secondary rounded-lg p-4 mb-4 text-xs text-muted-foreground space-y-1 leading-relaxed">
              <p className="font-medium text-foreground mb-2">
                {isAr ? "طريقة القياس" : "How to measure"}
              </p>
              <p>{isAr ? "قيسي الخصر عند أضيق نقطة (فوق السرة) بالسنتيمتر." : "Measure your waist at the narrowest point (above your navel), in centimeters."}</p>
            </div>
            <div className="mb-3">
              <label className="text-xs text-muted-foreground block mb-1">
                {isAr ? "محيط الخصر" : "Waist circumference"} <span className="text-muted-foreground/60">cm</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={pantsWaist}
                onChange={(e) => setPantsWaist(normalizeArabicDigits(e.target.value))}
                placeholder={isAr ? "مثلاً ٧٠" : "e.g. 70"}
                className="w-full border border-border rounded px-2 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-foreground text-center"
              />
            </div>
            {pantsError && <p className="text-xs text-destructive mb-2">{pantsError}</p>}
            <Button
              className="w-full rounded-md uppercase tracking-widest text-xs"
              onClick={() => {
                if (!pantsWaist) {
                  setPantsError(isAr ? "يرجى إدخال مقاس الخصر" : "Please enter your waist measurement.");
                  return;
                }
                setPantsError("");
                setStep(1);
              }}
            >
              {isAr ? "التالي" : "Continue"}
            </Button>
          </DialogContent>
        </Dialog>
      );

    // Step 1: Fit preference
    if (step === 1)
      return (
        <Dialog open={open} onOpenChange={onClose}>
          <DialogContent className="max-w-sm" dir={isAr ? "rtl" : "ltr"}>
            <DialogHeader>
              <DialogTitle className="uppercase tracking-widest text-base">
                {isAr ? "تفضيل القصة" : "Fit preference"}
              </DialogTitle>
            </DialogHeader>
            {progressBar}
            <p className="text-sm font-medium mb-2">
              {isAr ? "كيف تفضلين قصة البنطلون؟" : "How do you prefer your pants to fit?"}
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              {(isAr
                ? [["tight","ضيق جداً"],["slim","ضيق"],["normal","عادي"],["relaxed","مريح"],["loose","فضفاض"]]
                : [["tight","Tight"],["slim","Slim"],["normal","Normal"],["relaxed","Relaxed"],["loose","Loose"]]
              ).map(([val, lbl]) => chip(lbl, pantsFit === val, () => setPantsFit(val)))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="w-11 rounded-md" onClick={() => setStep(0)}>←</Button>
              <Button
                className="flex-1 rounded-md uppercase tracking-widest text-xs"
                onClick={() => {
                  const raw = computePantsSize(+pantsWaist, pantsFit);
                  const result = productSizes?.length ? closestClothesSize(raw, productSizes) : raw;
                  setPantsResult(result);
                  saveSize({ pants: result });
                  setStep(2);
                }}
              >
                {isAr ? "اعرضي مقاسي" : "Show my size"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      );

    // Result step
    const pantsResultSize = PANTS_SIZES.find((s) => s.label === pantsResult);
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm" dir={isAr ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="uppercase tracking-widest text-base">
              {isAr ? "مقاس البنطلون المقترح" : "Your recommended pants size"}
            </DialogTitle>
          </DialogHeader>
          <div className="bg-secondary rounded-lg p-6 text-center mb-4">
            {pantsResultSize && (
              <div className="text-5xl font-semibold mb-1">EU {pantsResultSize.eu}</div>
            )}
            <div className="text-sm text-muted-foreground mt-1">{pantsResult}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
              {isAr ? "مقاس البنطلون" : "Pants size"}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-secondary rounded-lg p-3 text-center">
              <div className="text-sm font-semibold">{pantsWaist} cm</div>
              <div className="text-xs text-muted-foreground mt-0.5">{isAr ? "الخصر" : "Waist"}</div>
              {pantsResultSize && (
                <div className="text-xs text-muted-foreground/60 mt-1">({pantsResultSize.wMin}–{pantsResultSize.wMax} cm)</div>
              )}
            </div>
            <div className="bg-secondary rounded-lg p-3 text-center">
              <div className="text-sm font-semibold">EU {pantsResultSize?.eu ?? "—"}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{isAr ? "مقاس أوروبي" : "EU size"}</div>
            </div>
          </div>
          {pantsFit !== "normal" && (
            <p className="text-xs text-muted-foreground bg-secondary rounded p-3 mb-4 leading-relaxed">
              {pantsFit === "tight" || pantsFit === "slim"
                ? isAr ? "اخترتِ قصة ضيقة — قد تحتاجين مقاساً أكبر للراحة." : "You chose a slim fit — consider sizing up for comfort."
                : isAr ? "اخترتِ قصة مريحة — المقاس أكبر قليلاً من مقاسك الأساسي." : "You chose a relaxed fit — this is slightly larger than your base size."}
            </p>
          )}
          <Button
            className="w-full rounded-md uppercase tracking-widest text-xs mb-2"
            onClick={() => { onSizePicked?.(pantsResult); onClose(); }}
          >
            {isAr ? "اختر هذا المقاس" : "Select this size"}
          </Button>
          <Button variant="outline" className="w-full rounded-md text-xs" onClick={() => setStep(0)}>
            {isAr ? "ابدأ من جديد" : "Start over"}
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  // ── SHOES STEPS ──
  if (step === 0)
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm" dir={isAr ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="uppercase tracking-widest text-base">
              {isAr ? "اكتشف مقاس حذائك" : "Find my shoe size"}
            </DialogTitle>
          </DialogHeader>
          {progressBar}
          <div className="bg-secondary rounded-lg p-4 mb-4 text-xs text-muted-foreground space-y-1 leading-relaxed">
            <p className="font-medium text-foreground mb-2">
              {isAr ? "طريقة القياس" : "How to measure"}
            </p>
            <p>
              1. {isAr ? "ضع قدمك على ورقة" : "Place your foot flat on paper"}
            </p>
            <p>
              2.{" "}
              {isAr
                ? "ضع علامة عند أطول إصبع وعند الكعب"
                : "Mark your longest toe and heel"}
            </p>
            <p>
              3.{" "}
              {isAr ? "قِس المسافة بالسنتيمتر" : "Measure the distance in cm"}
            </p>
            <p>
              4.{" "}
              {isAr
                ? "استخدم القدم الأكبر إذا اختلفتا"
                : "Use the larger foot if they differ"}
            </p>
          </div>
          <label className="text-xs text-muted-foreground block mb-1">
            {isAr ? "طول القدم (سم)" : "Foot length (cm)"}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={foot}
            onChange={(e) => setFoot(normalizeArabicDigits(e.target.value))}
            placeholder={isAr ? "مثلاً ٢٥.٥" : "e.g. 25.5"}
            className="w-full border border-border rounded px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-foreground mb-1"
          />
          {shoeError && (
            <p className="text-xs text-destructive mb-2">{shoeError}</p>
          )}
          <Button
            className="w-full mt-3 rounded-md uppercase tracking-widest text-xs"
            onClick={() => {
              const v = parseFloat(foot);
              if (!v || v < 20 || v > 30) {
                setShoeError(
                  isAr
                    ? "يرجى إدخال طول صحيح (٢٠–٣٠ سم)"
                    : "Please enter a valid foot length (20–30 cm).",
                );
                return;
              }
              setShoeError("");
              setStep(1);
            }}
          >
            {isAr ? "التالي" : "Continue"}
          </Button>
        </DialogContent>
      </Dialog>
    );

  if (step === 1)
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-sm" dir={isAr ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="uppercase tracking-widest text-base">
              {isAr ? "تفضيلاتك" : "Your preferences"}
            </DialogTitle>
          </DialogHeader>
          {progressBar}
          <p className="text-sm font-medium mb-2">
            {isAr ? "أتسوق لـ" : "Shopping for"}
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            {(isAr
              ? [
                  ["women", "نساء"],
                  ["men", "رجال"],
                  ["unisex", "للجنسين"],
                ]
              : [
                  ["women", "Women"],
                  ["men", "Men"],
                  ["unisex", "Unisex"],
                ]
            ).map(([val, lbl]) =>
              chip(lbl, shoeGender === val, () => setShoeGender(val as any)),
            )}
          </div>
          <p className="text-sm font-medium mb-2">
            {isAr ? "عرض القدم" : "Foot width"}
          </p>
          <div className="flex flex-wrap gap-2 mb-5">
            {(isAr
              ? [
                  ["narrow", "ضيق"],
                  ["standard", "عادي"],
                  ["wide", "عريض"],
                ]
              : [
                  ["narrow", "Narrow"],
                  ["standard", "Standard"],
                  ["wide", "Wide"],
                ]
            ).map(([val, lbl]) =>
              chip(lbl, shoeWidth === val, () => setShoeWidth(val)),
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="w-11 rounded-md"
              onClick={() => setStep(0)}
            >
              ←
            </Button>
            <Button
              className="flex-1 rounded-md uppercase tracking-widest text-xs"
              onClick={() => {
                const table = SHOE_DATA[shoeGender];
                let best = table.reduce((a, b) =>
                  Math.abs(b.cm - parseFloat(foot)) <
                  Math.abs(a.cm - parseFloat(foot))
                    ? b
                    : a,
                );
                // snap to a size available on this product
                if (productSizes?.length) {
                  const snapped = closestShoeSize(best.eu, productSizes);
                  const snappedEntry = table.find((r) => String(r.eu) === snapped);
                  if (snappedEntry) best = snappedEntry;
                }
                setShoeResult(best);
                saveSize({
                  shoe_eu: best.eu,
                  shoe_uk: best.uk,
                  shoe_us: best.us,
                  shoe_cm: best.cm,
                });
                setStep(2);
              }}
            >
              {isAr ? "اعرض مقاسي" : "Show my size"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );

  // shoe result
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="uppercase tracking-widest text-base">
            {isAr ? "مقاس حذائك" : "Your shoe size"}
          </DialogTitle>
        </DialogHeader>
        <div className="bg-secondary rounded-lg p-6 text-center mb-4">
          <div className="text-5xl font-semibold mb-1">{shoeResult?.eu}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest">
            EU
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "UK", val: shoeResult?.uk },
            { label: "US", val: shoeResult?.us },
            { label: "cm", val: shoeResult?.cm },
          ].map(({ label, val }) => (
            <div
              key={label}
              className="bg-secondary rounded-lg p-3 text-center"
            >
              <div className="text-lg font-semibold">{val}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {label}
              </div>
            </div>
          ))}
        </div>
        {shoeWidth !== "standard" && (
          <p className="text-xs text-muted-foreground bg-secondary rounded p-3 mb-4 leading-relaxed">
            {shoeWidth === "narrow"
              ? isAr
                ? "للقدم الضيقة — فكر في أخذ نصف مقاس أكبر لمزيد من الراحة."
                : "For narrow feet — consider going half a size up for more room."
              : isAr
                ? "للقدم العريضة — قد تكون الأحذية العادية ضيقة. ابحث عن أحذية العرض الواسع."
                : "For wide feet — standard shoes may feel tight. Look for wide-fit styles."}
          </p>
        )}
        <Button
          className="w-full rounded-md uppercase tracking-widest text-xs mb-2"
          onClick={() => {
            onSizePicked?.(String(shoeResult?.eu));
            onClose();
          }}
        >
          {isAr ? "اختر هذا المقاس" : "Select this size"}
        </Button>
        <Button
          variant="outline"
          className="w-full rounded-md text-xs"
          onClick={() => setStep(0)}
        >
          {isAr ? "ابدأ من جديد" : "Start over"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── SizeGuideDialog (unchanged) ─────────────────────────────────────────────
function SizeGuideDialog({
  open,
  onClose,
  language,
}: {
  open: boolean;
  onClose: () => void;
  language: string;
}) {
  const isAr = language === "ar";

  const clothingRows = [
    { size: "XS", bust: "80-84", waist: "62-66", hip: "86-90" },
    { size: "S", bust: "84-88", waist: "66-70", hip: "90-94" },
    { size: "M", bust: "88-92", waist: "70-74", hip: "94-98" },
    { size: "L", bust: "92-96", waist: "74-78", hip: "98-102" },
    { size: "XL", bust: "96-100", waist: "78-82", hip: "102-106" },
    { size: "XXL", bust: "100-106", waist: "82-88", hip: "106-112" },
  ];

  const shoeRows = [
    { eu: "36", uk: "3", cm: "23" },
    { eu: "37", uk: "4", cm: "23.5" },
    { eu: "38", uk: "5", cm: "24" },
    { eu: "39", uk: "6", cm: "25" },
    { eu: "40", uk: "6.5", cm: "25.5" },
    { eu: "41", uk: "7", cm: "26" },
    { eu: "42", uk: "8", cm: "26.5" },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-lg max-h-[85vh] overflow-y-auto"
        dir={isAr ? "rtl" : "ltr"}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold uppercase tracking-widest">
            {isAr ? "دليل المقاسات" : "Size Guide"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest mb-3 text-muted-foreground">
              {isAr ? "ملابس (سم)" : "Clothing (cm)"}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border border-border px-3 py-2 text-center font-semibold">
                      {isAr ? "المقاس" : "Size"}
                    </th>
                    <th className="border border-border px-3 py-2 text-center font-semibold">
                      {isAr ? "الصدر" : "Bust"}
                    </th>
                    <th className="border border-border px-3 py-2 text-center font-semibold">
                      {isAr ? "الخصر" : "Waist"}
                    </th>
                    <th className="border border-border px-3 py-2 text-center font-semibold">
                      {isAr ? "الورك" : "Hip"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clothingRows.map((row, i) => (
                    <tr
                      key={row.size}
                      className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                    >
                      <td className="border border-border px-3 py-2 text-center font-bold">
                        {row.size}
                      </td>
                      <td className="border border-border px-3 py-2 text-center">
                        {row.bust}
                      </td>
                      <td className="border border-border px-3 py-2 text-center">
                        {row.waist}
                      </td>
                      <td className="border border-border px-3 py-2 text-center">
                        {row.hip}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest mb-3 text-muted-foreground">
              {isAr ? "أحذية" : "Shoes"}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border border-border px-3 py-2 text-center font-semibold">
                      EU
                    </th>
                    <th className="border border-border px-3 py-2 text-center font-semibold">
                      UK
                    </th>
                    <th className="border border-border px-3 py-2 text-center font-semibold">
                      {isAr ? "سم" : "cm"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shoeRows.map((row, i) => (
                    <tr
                      key={row.eu}
                      className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}
                    >
                      <td className="border border-border px-3 py-2 text-center font-bold">
                        {row.eu}
                      </td>
                      <td className="border border-border px-3 py-2 text-center">
                        {row.uk}
                      </td>
                      <td className="border border-border px-3 py-2 text-center">
                        {row.cm}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-muted-foreground border-t border-border pt-3">
            {isAr
              ? "للحصول على أفضل مقاس، نوصي بقياس جسمك ومقارنته بالجدول أعلاه. في حال ترددتِ بين مقاسين، نختار المقاس الأكبر."
              : "For the best fit, we recommend measuring your body and comparing to the chart above. When between sizes, we suggest sizing up."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── RelatedProductsSlider ────────────────────────────────────────────────────
function RelatedProductsSlider({
  products,
  title,
  accent,
  accentColor = "text-muted-foreground",
}: {
  products: any[];
  title: string;
  accent?: string;
  accentColor?: string;
}) {
  const sliderRef = useRef<HTMLDivElement>(null);

  return (
    <section className="mt-16 sm:mt-24" data-testid="section-related-products">
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          {accent && (
            <span className={`block text-[10px] uppercase tracking-[0.3em] mb-1.5 font-semibold ${accentColor}`}>
              {accent}
            </span>
          )}
          <h2 className="font-display text-2xl sm:text-3xl font-semibold">
            {title}
          </h2>
          <span className={`block mt-2 h-px w-10 ${accentColor.replace("text-", "bg-")}`} />
        </div>
      </div>

      {/* Mobile: 2-column grid */}
      <div className="grid grid-cols-2 gap-3 sm:hidden">
        {products.map((p) => (
          <div key={p.id} data-testid={`related-product-${p.id}`}>
            <ProductCard product={p} />
          </div>
        ))}
      </div>

      {/* Desktop: horizontal scroll */}
      <div
        ref={sliderRef}
        className="hidden sm:flex gap-6 overflow-x-auto pb-4"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {products.map((p) => (
          <div
            key={p.id}
            className="flex-shrink-0 w-56 md:w-64"
            data-testid={`related-product-${p.id}`}
          >
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── ProductDetails ───────────────────────────────────────────────────────────
export default function ProductDetails() {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading } = useProduct(Number(id));
  const { data: allProducts } = useProducts();
  const { addToCart, items: cartItems } = useCart();
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const [, navigate] = useLocation();
  const { data: user } = useAuth();
  const { isWishlisted, toggle } = useWishlist();
  const { data: categories } = useCategories();

  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [showFindMySize, setShowFindMySize] = useState(false);
  const [zoomPos, setZoomPos] = useState<{ x: number; y: number } | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [recentlyViewedIds, setRecentlyViewedIds] = useState<number[]>(() => {
    try { return JSON.parse(localStorage.getItem("recently_viewed") || "[]"); } catch { return []; }
  });

  // detect whether this product has shoe-like sizes (numeric EU sizes)
  const isAr = language === "ar";

  const thumbsRef = useRef<HTMLDivElement>(null);
  const [thumbsCanUp, setThumbsCanUp] = useState(false);
  const [thumbsCanDown, setThumbsCanDown] = useState(false);
  const infoPanelRef = useRef<HTMLDivElement>(null);
  const galleryColRef = useRef<HTMLDivElement>(null);

  const checkThumbsScroll = useCallback(() => {
    const el = thumbsRef.current;
    if (!el) return;
    setThumbsCanUp(el.scrollTop > 4);
    setThumbsCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  }, []);

  const scrollThumbs = useCallback((dir: "up" | "down") => {
    const el = thumbsRef.current;
    if (!el) return;
    el.scrollBy({ top: dir === "up" ? -160 : 160, behavior: "smooth" });
  }, []);

  const variants: ColorVariant[] = useMemo(() => {
    if (!product) return [];
    const cv = (product as any).colorVariants as ColorVariant[] | undefined;
    if (cv && cv.length > 0) return cv;
    const inv = (product as any).sizeInventory || {};
    return [
      {
        name: "Default",
        colorCode: "#000000",
        mainImage: product.mainImage,
        images: product.images || [],
        sizes: product.sizes || [],
        sizeInventory: Object.keys(inv).length > 0 ? inv : {},
      },
    ];
  }, [product]);

  const hasMultipleColors =
    variants.length > 1 ||
    (variants.length === 1 && variants[0].name !== "Default");
  const activeVariant = variants[selectedColorIdx] || variants[0];

  const allMedia = useMemo(() => {
    if (!activeVariant) return [];
    const variantAny = activeVariant as any;
    const vid = (product as any)?.videoUrl as string | null | undefined;
    if (variantAny.media && Array.isArray(variantAny.media) && variantAny.media.length > 0) {
      const items: { type: "image" | "video"; url: string }[] = [...variantAny.media];
      // Append top-level videoUrl if not already present in variant media
      if (vid && !items.some((m) => m.url === vid)) {
        items.push({ type: "video" as const, url: vid });
      }
      const primary = items.find((m) => (m as any).isPrimary) || items[0];
      const rest = items.filter((m) => m !== primary);
      return [primary, ...rest];
    }
    const imgs = [activeVariant.mainImage, ...(activeVariant.images || [])]
      .filter(Boolean)
      .map((url) => ({ type: "image" as const, url }));
    if (vid) imgs.push({ type: "video" as const, url: vid });
    return imgs;
  }, [activeVariant, product]);

  const goToPrev = useCallback(() => {
    setSelectedImageIdx((i) => (i - 1 + allMedia.length) % allMedia.length);
    setZoomPos(null);
  }, [allMedia.length]);

  const goToNext = useCallback(() => {
    setSelectedImageIdx((i) => (i + 1) % allMedia.length);
    setZoomPos(null);
  }, [allMedia.length]);

  const sizes = activeVariant?.sizes || [];
  const sizeInv = activeVariant?.sizeInventory || {};
  const hasSizes = sizes.length > 0;

  // ── Determine Find My Size mode ──────────────────────────────────────────────
  // Priority: category sizeGuide setting → keyword auto-detection
  const findMySizeMode: FindMySizeMode = useMemo(() => {
    if (!product) return "clothes";
    const cat = categories?.find((c) => c.id === product.categoryId);
    const guide = (cat as any)?.sizeGuide ?? "auto";

    // Explicit admin-set mode
    if (guide === "clothes") return "clothes";
    if (guide === "shoes")   return "shoes";
    if (guide === "pants")   return "pants";
    if (guide === "none")    return "none" as any;

    // Auto-detect by category keywords
    if (cat) {
      const slug   = (cat.slug   ?? "").toLowerCase();
      const name   = (cat.name   ?? "").toLowerCase();
      const nameAr = (cat.nameAr ?? "").toLowerCase();
      const PANTS_AR = ["بنطلون", "بنطال", "بناطيل", "بلاطين"];
      const PANTS_EN = ["pant", "trouser", "jean", "legging"];
      if (slug.includes("shoe") || name.includes("shoe") || nameAr.includes("شوز") || nameAr.includes("أحذية"))
        return "shoes";
      if (PANTS_AR.some((k) => nameAr.includes(k)) || PANTS_EN.some((k) => name.includes(k) || slug.includes(k)))
        return "pants";
    }
    // Auto-detect by product name keywords
    const pName = (product.name ?? "").toLowerCase();
    const PANTS_AR = ["بنطلون", "بنطال", "بناطيل", "بلاطين"];
    const PANTS_EN = ["pant", "trouser", "jean", "legging"];
    if (PANTS_AR.some((k) => pName.includes(k)) || PANTS_EN.some((k) => pName.includes(k))) return "pants";
    // Fallback: numeric sizes = shoes
    if (hasSizes && sizes.some((s) => /^\d{2,3}$/.test(s.trim()))) return "shoes";
    return "clothes";
  }, [product, categories, hasSizes, sizes]);

  const isShoeProduct   = findMySizeMode === "shoes";
  const isPantsProduct  = findMySizeMode === "pants";
  const hideFindMySize  = (findMySizeMode as string) === "none";

  // Pre-highlight saved size on mount / product change
  const [savedHighlight, setSavedHighlight] = useState<string>("");
  useEffect(() => {
    const saved = getSavedSize();
    if (isShoeProduct && saved.shoe_eu)
      setSavedHighlight(String(saved.shoe_eu));
    else if (isPantsProduct && saved.pants) setSavedHighlight(saved.pants);
    else if (!isShoeProduct && !isPantsProduct && saved.clothes) setSavedHighlight(saved.clothes);
    else setSavedHighlight("");
  }, [id, isShoeProduct, isPantsProduct]);

  const selectedSizeStock =
    selectedSize && sizeInv[selectedSize] !== undefined
      ? sizeInv[selectedSize]
      : null;
  const colorName = hasMultipleColors ? activeVariant?.name : undefined;

  const availableStock = hasSizes
    ? selectedSize
      ? Math.max(0, selectedSizeStock ?? 0)
      : 0
    : Math.max(0, product?.stockQuantity ?? 0);

  const cartQtyForThis = cartItems.reduce((sum, ci) => {
    if (
      ci.product.id === Number(id) &&
      ci.color === colorName &&
      ci.size === selectedSize
    )
      return sum + ci.quantity;
    return sum;
  }, 0);

  const remainingStock = Math.max(0, availableStock - cartQtyForThis);
  const canAdd = hasSizes
    ? !!selectedSize && remainingStock > 0
    : remainingStock > 0;

  useEffect(() => {
    setSelectedSize("");
    setQuantity(1);
    setSelectedImageIdx(0);
  }, [selectedColorIdx]);
  useEffect(() => {
    setSelectedSize("");
    setQuantity(1);
    setSelectedColorIdx(0);
    setSelectedImageIdx(0);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [id]);

  // Re-check thumb scroll whenever images load or change (e.g. color switch)
  useEffect(() => {
    const t = setTimeout(checkThumbsScroll, 80);
    return () => clearTimeout(t);
  }, [allMedia, checkThumbsScroll]);

  // Clamp selectedImageIdx if allMedia shrinks (e.g. switching to a product with fewer images)
  useEffect(() => {
    if (allMedia.length > 0 && selectedImageIdx >= allMedia.length) {
      setSelectedImageIdx(0);
    }
  }, [allMedia, selectedImageIdx]);


  // Watch the strip's size + enable mouse-wheel scrolling
  useEffect(() => {
    const el = thumbsRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    const ro = new ResizeObserver(checkThumbsScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("wheel", handleWheel);
      ro.disconnect();
    };
  }, [allMedia, checkThumbsScroll]);

  // Track product view + recently viewed — fire once per product ID change
  useEffect(() => {
    if (!product) return;
    trackProductEvent(product.id, "view", user?.id ?? null);
    // Recently viewed: prepend current id, deduplicate, keep max 8, then push to state
    try {
      const stored: number[] = JSON.parse(localStorage.getItem("recently_viewed") || "[]");
      const updated = [product.id, ...stored.filter((x) => x !== product.id)].slice(0, 8);
      localStorage.setItem("recently_viewed", JSON.stringify(updated));
      setRecentlyViewedIds(updated);
    } catch {}
  }, [product?.id]);

  // Fetch real recommendations from the API
  const { data: recommendedIds } = useQuery<number[]>({
    queryKey: ["/api/products", Number(id), "recommendations"],
    queryFn: async () => {
      const res = await fetch(`/api/products/${id}/recommendations`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const peopleAlsoBuy = useMemo(() => {
    if (!product || !allProducts) return [];
    // Use real recommendation IDs when we have enough data (>=2 results)
    if (recommendedIds && recommendedIds.length >= 2) {
      const idSet = new Set(recommendedIds);
      // Only keep same-category products from the recommendation list
      const ordered = recommendedIds
        .map((rid) => allProducts.find((p) => p.id === rid && p.categoryId === product.categoryId))
        .filter(Boolean) as typeof allProducts;
      // Fill remainder with seeded shuffle from same category
      const pool = allProducts.filter(
        (p) => p.id !== product.id && !idSet.has(p.id) && p.categoryId === product.categoryId
      );
      return [...ordered, ...seededShuffle(pool, product.id)].slice(0, 8);
    }
    // Fallback: seeded shuffle from same category
    const pool = allProducts.filter((p) => p.id !== product.id && p.categoryId === product.categoryId);
    return seededShuffle(pool, product.id).slice(0, 8);
  }, [product, allProducts, recommendedIds]);

  const matchingOutfits = useMemo(() => {
    if (!product || !allProducts) return [];

    // Pool: products from DIFFERENT categories only
    const pool = allProducts.filter((p) => p.id !== product.id && p.categoryId !== product.categoryId);
    if (pool.length === 0) return [];

    // Signal 1 — real cross-category co-purchases from the recommendation API
    const crossCatIds = new Set(
      (recommendedIds ?? []).filter((rid) => {
        const found = allProducts.find((p) => p.id === rid);
        return found && found.categoryId !== product.categoryId;
      })
    );

    // Signal 2 — this product's color hues
    const productHues = ((product as any).colorVariants as any[] ?? [])
      .map((v: any) => hexToHue(v.colorCode))
      .filter((h: number) => h >= 0);

    const productPrice = parseFloat(product.price as string) || 0;

    const scored = pool.map((p) => {
      let score = 0;

      // ── Signal 1: real purchase data (highest weight) ──────────────────────
      if (crossCatIds.has(p.id)) score += 1000;

      // ── Signal 2: color harmony ────────────────────────────────────────────
      const candidateHues = ((p as any).colorVariants as any[] ?? [])
        .map((v: any) => hexToHue(v.colorCode))
        .filter((h: number) => h >= 0);

      if (productHues.length === 0 || candidateHues.length === 0) {
        // Achromatic (black / white / grey) — pairs universally
        score += 35;
      } else {
        let bestHarmony = 0;
        for (const ph of productHues) {
          for (const ch of candidateHues) {
            const dist = hueDist(ph, ch);
            let h = 0;
            if (dist <= 30)                    h = 55;  // Analogous — coordinated look
            else if (dist >= 150 && dist <= 210) h = 70; // Complementary — bold & stylish
            else if (dist >= 60 && dist <= 120)  h = 25; // Triadic — creative
            else                               h = 10;  // Other
            bestHarmony = Math.max(bestHarmony, h);
          }
        }
        score += bestHarmony;
      }

      // ── Signal 3: price tier proximity ────────────────────────────────────
      const candidatePrice = parseFloat(p.price as string) || 0;
      if (productPrice > 0 && candidatePrice > 0) {
        const diff = Math.abs(productPrice - candidatePrice) / productPrice;
        if (diff <= 0.4)       score += 20;
        else if (diff <= 0.8)  score += 10;
      }

      // ── Stable tie-breaking (no Math.random) ──────────────────────────────
      score += ((product.id * 1000 + p.id) % 100) * 0.01;

      return { p, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .map((s) => s.p)
      .slice(0, 8);
  }, [product, allProducts, recommendedIds]);

  // ─── Recently viewed ───────────────────────────────────────────────────────
  const recentlyViewed = useMemo(() => {
    if (!allProducts || !product) return [];
    return recentlyViewedIds
      .filter((rid) => rid !== product.id)
      .map((rid) => allProducts.find((p) => p.id === rid))
      .filter(Boolean) as typeof allProducts;
  }, [allProducts, product?.id, recentlyViewedIds]);

  // ─── For sold-out products: same category, sorted by color similarity ─────
  const isSoldOut = (product?.stockQuantity ?? 1) === 0;

  const similarProducts = useMemo(() => {
    if (!product || !allProducts || !isSoldOut) return [];
    const cv = (product as any).colorVariants as ColorVariant[] | undefined;
    const productHues = (cv ?? []).map((v) => hexToHue(v.colorCode)).filter((h) => h >= 0);

    const pool = allProducts.filter(
      (p) => p.id !== product.id && p.categoryId === product.categoryId && p.stockQuantity > 0
    );

    if (productHues.length === 0) return pool.slice(0, 8);

    return pool
      .map((p) => {
        const pCv = (p as any).colorVariants as ColorVariant[] | undefined;
        const pHues = (pCv ?? []).map((v) => hexToHue(v.colorCode)).filter((h) => h >= 0);
        const minDist =
          pHues.length > 0
            ? Math.min(...productHues.flatMap((h1) => pHues.map((h2) => hueDist(h1, h2))))
            : 180;
        return { p, minDist };
      })
      .sort((a, b) => a.minDist - b.minDist)
      .slice(0, 8)
      .map(({ p }) => p);
  }, [product, allProducts, isSoldOut]);

  if (isLoading && !product)
    return (
      <div className="min-h-screen flex flex-col pt-navbar">
        <Navbar />
        <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-[48%_52%] gap-6 sm:gap-10 lg:gap-14">
              <div className="flex gap-2 sm:gap-3">
                <div className="flex flex-col gap-2 w-[68px] sm:w-[84px] flex-shrink-0">
                  {[1, 2, 3].map(i => <div key={i} className="aspect-[3/4] rounded-xl bg-muted animate-pulse" />)}
                </div>
                <div className="flex-1 aspect-[3/4] rounded-2xl bg-muted animate-pulse" />
              </div>
              <div className="flex flex-col gap-4 py-2">
                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                <div className="h-7 w-3/4 bg-muted animate-pulse rounded" />
                <div className="h-6 w-1/3 bg-muted animate-pulse rounded" />
                <div className="h-px bg-muted" />
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(i => <div key={i} className="w-8 h-8 rounded-full bg-muted animate-pulse" />)}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 w-14 bg-muted animate-pulse rounded-lg" />)}
                </div>
                <div className="h-12 w-full bg-muted animate-pulse rounded-lg mt-2" />
                <div className="h-12 w-full bg-muted animate-pulse rounded-lg" />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  if (!product)
    return (
      <div className="min-h-screen pt-navbar flex items-center justify-center">
        <Navbar />
        <div data-testid="text-product-not-found">{t.product.notFound}</div>
      </div>
    );

  const price = parseFloat(product.price.toString()).toFixed(2);
  const discountPrice = product.discountPrice
    ? parseFloat(product.discountPrice.toString()).toFixed(2)
    : null;

  const handleAddToCart = () => {
    if (hasSizes && !selectedSize) {
      toast({ title: t.product.selectSize, variant: "destructive" });
      return;
    }
    if (hasMultipleColors && !activeVariant) {
      toast({ title: t.product.selectColor, variant: "destructive" });
      return;
    }
    if (remainingStock <= 0) {
      const msg =
        language === "ar"
          ? cartQtyForThis > 0
            ? `لديك ${cartQtyForThis} من هذا المنتج في السلة، الكمية المتاحة ${availableStock} فقط`
            : "نفد المخزون"
          : cartQtyForThis > 0
            ? `You already have ${cartQtyForThis} in your cart. Only ${availableStock} available.`
            : "Out of stock";
      toast({
        title: language === "ar" ? "لا يمكن إضافة المزيد" : "Cannot add more",
        description: msg,
        variant: "destructive",
      });
      return;
    }
    const qtyToAdd = Math.min(quantity, remainingStock);
    addToCart(product as any, qtyToAdd, selectedSize, colorName);
    trackProductEvent(product.id, "cart_add", user?.id ?? null);
    toast({
      title: t.product.addedToCart,
      description: t.product.tapToViewCart,
      icon: "cart",
      onClick: () => navigate("/cart"),
    } as any);
  };

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[48%_52%] gap-6 sm:gap-10 lg:gap-14">
            {/* ── Images + Video ── */}
            <div ref={galleryColRef} className="flex flex-col gap-4">
            {/* Side thumbnails + main image with zoom */}
            <div className="flex gap-2 sm:gap-3 h-[520px] sm:h-[620px] lg:h-[780px]">
              {allMedia.length > 1 && (
                <div className="relative w-[56px] sm:w-[80px] lg:w-[96px] flex-shrink-0 h-full group/thumbstrip">
                  {/* Thumbnail scroll area — full height, no space reserved for buttons */}
                  <div
                    ref={thumbsRef}
                    className="flex flex-col gap-2 overflow-y-auto h-full py-1"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none", touchAction: "pan-y", overscrollBehavior: "contain" }}
                    onScroll={checkThumbsScroll}
                  >
                    {allMedia.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => { setSelectedImageIdx(idx); setZoomPos(null); }}
                        className={`w-full aspect-[3/4] bg-secondary overflow-hidden flex-shrink-0 transition-all duration-200 rounded-lg relative ${
                          selectedImageIdx === idx
                            ? "ring-2 ring-offset-1 ring-foreground scale-[0.97]"
                            : "hover:scale-[0.97]"
                        }`}
                        data-testid={`button-gallery-item-${idx}`}
                      >
                        {item.type === "video" ? (
                          <>
                            <video
                              src={item.url}
                              autoPlay
                              muted
                              loop
                              playsInline
                              preload="auto"
                              disablePictureInPicture
                              className="w-full h-full object-cover object-top"
                              style={{ pointerEvents: "none", filter: "brightness(1.05) contrast(0.9) saturate(0.92)" }}
                            />
                            <ProductWatermark />
                          </>
                        ) : (
                          <img
                            src={item.url}
                            alt={`${product.name} ${idx + 1}`}
                            className="w-full h-full object-cover object-top"
                            style={{ filter: "brightness(1.05) contrast(0.9) saturate(0.92)" }}
                          />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* ── Top fade + arrow overlay ── */}
                  <div
                    className={`absolute top-0 inset-x-0 h-16 flex items-start justify-center pt-1 transition-opacity duration-200 pointer-events-none z-10 ${thumbsCanUp ? "opacity-100" : "opacity-0"}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-background/80 to-transparent" />
                    <button
                      onClick={() => scrollThumbs("up")}
                      aria-label="Scroll thumbnails up"
                      className="relative z-10 flex items-center justify-center h-8 w-8 rounded-full bg-black text-white shadow-lg pointer-events-auto transition-opacity duration-200 hover:bg-black/80 active:scale-95 lg:opacity-0 lg:group-hover/thumbstrip:opacity-100"
                      data-testid="button-thumb-scroll-up"
                    >
                      <ChevronUp className="w-4 h-4" strokeWidth={3} />
                    </button>
                  </div>

                  {/* ── Bottom fade + arrow overlay ── */}
                  <div
                    className={`absolute bottom-0 inset-x-0 h-16 flex items-end justify-center pb-1 transition-opacity duration-200 pointer-events-none z-10 ${thumbsCanDown ? "opacity-100" : "opacity-0"}`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                    <button
                      onClick={() => scrollThumbs("down")}
                      aria-label="Scroll thumbnails down"
                      className="relative z-10 flex items-center justify-center h-8 w-8 rounded-full bg-black text-white shadow-lg pointer-events-auto transition-opacity duration-200 hover:bg-black/80 active:scale-95 lg:opacity-0 lg:group-hover/thumbstrip:opacity-100"
                      data-testid="button-thumb-scroll-down"
                    >
                      <ChevronDown className="w-4 h-4" strokeWidth={3} />
                    </button>
                  </div>
                </div>
              )}
              {/* Main view — image with zoom OR video autoplay */}
              {(() => {
                const safeIdx = selectedImageIdx < allMedia.length ? selectedImageIdx : 0;
                const currentMedia = allMedia[safeIdx];
                const videoItem = allMedia.find((m) => m.type === "video");
                const isVideoSelected = currentMedia?.type === "video";
                return (
                  <div className="flex-1 relative overflow-hidden">
                    {/* ── Video: always mounted so it never stops looping ── */}
                    {videoItem && (
                      <div
                        className="absolute inset-0 bg-black flex items-center justify-center"
                        style={{ visibility: isVideoSelected ? "visible" : "hidden", zIndex: isVideoSelected ? 2 : 0 }}
                      >
                        <video
                          key={videoItem.url}
                          src={videoItem.url}
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="auto"
                          disablePictureInPicture
                          className="w-full h-full object-contain"
                          data-testid="video-product-main"
                          style={{ pointerEvents: "none" }}
                        />
                        <ProductWatermark />
                      </div>
                    )}
                    {/* ── Image with zoom ── */}
                    <div
                      className="absolute inset-0 bg-secondary"
                      style={{ visibility: isVideoSelected ? "hidden" : "visible", zIndex: isVideoSelected ? 0 : 2, cursor: zoomPos ? "crosshair" : "default" }}
                      onMouseMove={(e) => {
                        if (window.innerWidth < 1024) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setZoomPos({
                          x: ((e.clientX - rect.left) / rect.width) * 100,
                          y: ((e.clientY - rect.top) / rect.height) * 100,
                        });
                      }}
                      onMouseLeave={() => setZoomPos(null)}
                    >
                      {zoomPos ? (
                        <div
                          className="w-full h-full"
                          style={{
                            backgroundImage: `url(${currentMedia?.url || allMedia[0]?.url || product.mainImage})`,
                            backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
                            backgroundSize: "200%",
                            backgroundRepeat: "no-repeat",
                            filter: "brightness(1.05) contrast(0.9) saturate(0.92)",
                          }}
                        />
                      ) : (
                        <img
                          key={currentMedia?.url || product.mainImage}
                          src={currentMedia?.url || allMedia[0]?.url || product.mainImage}
                          alt={product.name}
                          className="w-full h-full object-cover object-top"
                          style={{ filter: "brightness(1.05) contrast(0.9) saturate(0.92)" }}
                          data-testid="img-product-main"
                        />
                      )}
                      {/* Watermark */}
                      {!isVideoSelected && <ProductWatermark />}

                      {/* Zoom hint */}
                      {!zoomPos && (
                        <span className="hidden lg:flex absolute bottom-3 end-3 items-center justify-center w-8 h-8 rounded-full bg-black/70 pointer-events-none">
                          <Plus className="w-4 h-4 text-white" strokeWidth={2.5} />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
            </div>{/* end images + video wrapper */}

            {/* ── Info panel ── */}
            <div ref={infoPanelRef} className="flex flex-col pt-4 sm:pt-8 lg:pt-0 lg:sticky lg:top-28 h-fit">
              <div className="text-sm text-muted-foreground uppercase tracking-widest mb-2">
                {product.brand || "Lucerne Boutique"}
              </div>
              <h1
                className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold mb-4 text-balance"
                data-testid="text-product-name"
              >
                {product.name}
              </h1>

              <div className="flex items-center gap-4 mb-6 sm:mb-8 text-lg sm:text-xl">
                {discountPrice ? (
                  <>
                    <span
                      className="font-semibold text-destructive"
                      data-testid="text-discount-price"
                    >
                      ₪{discountPrice}
                    </span>
                    <span
                      className="text-muted-foreground line-through"
                      data-testid="text-original-price"
                    >
                      ₪{price}
                    </span>
                    <span className="text-xs uppercase tracking-widest bg-destructive text-destructive-foreground px-2 py-1">
                      Save{" "}
                      {Math.round(
                        (1 - parseFloat(discountPrice) / parseFloat(price)) *
                          100,
                      )}
                      %
                    </span>
                  </>
                ) : (
                  <span className="font-medium" data-testid="text-price">
                    ₪{price}
                  </span>
                )}
              </div>

              <div
                className="prose prose-sm md:prose-base text-muted-foreground mb-6 sm:mb-10 leading-relaxed max-w-none"
                data-testid="text-product-description"
              >
                {product.description}
              </div>

              {/* Colors */}
              {hasMultipleColors && (
                <div className="mb-8">
                  <span className="block text-sm font-semibold uppercase tracking-widest mb-3">
                    {t.product.color}:{" "}
                    <span className="text-muted-foreground font-normal ms-2">
                      {translateColorName(activeVariant.name, isAr ? "ar" : "en")}
                    </span>
                  </span>
                  <div className="flex flex-wrap gap-3">
                    {variants.map((v, idx) => {
                      return (
                        <button
                          key={idx}
                          onClick={() => setSelectedColorIdx(idx)}
                          className={`relative w-11 h-11 rounded-full border-2 transition-all duration-200 overflow-hidden flex-shrink-0 ${
                            selectedColorIdx === idx
                              ? "border-primary scale-110 shadow-lg ring-2 ring-primary/20"
                              : "border-border hover:border-primary/60 hover:scale-105"
                          }`}
                          title={translateColorName(v.name, isAr ? "ar" : "en")}
                          data-testid={`button-color-swatch-${idx}`}
                        >
                          {v.mainImage ? (
                            <img
                              src={v.mainImage}
                              alt={v.name}
                              className="w-full h-full object-cover"
                              draggable={false}
                            />
                          ) : (
                            <span className="flex w-full h-full">
                              <span className="h-full flex-1" style={{ backgroundColor: v.colorCode }} />
                            </span>
                          )}
                          {selectedColorIdx === idx && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-full">
                              <Check className="w-4 h-4 text-white drop-shadow-md" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sizes */}
              {hasSizes && (
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-semibold uppercase tracking-widest">
                      {t.product.size}
                    </span>
                    <div className="flex items-center gap-2">
                      {/* ── Find My Size button ── */}
                      {!hideFindMySize && (
                        <button
                          onClick={() => setShowFindMySize(true)}
                          className="animate-shake-hint relative flex items-center gap-1.5 text-[11px] font-semibold tracking-wide bg-foreground text-background hover:bg-foreground/80 active:scale-95 transition-all duration-150 px-3 py-1.5 rounded-full shadow-sm"
                          data-testid="button-find-my-size"
                        >
                          <Ruler className="w-3.5 h-3.5 flex-shrink-0" />
                          {isAr ? "اكتشفي مقاسك" : "Find my size"}
                        </button>
                      )}
                      {/* ── Size Guide button ── */}
                      <button
                        onClick={() => setShowSizeGuide(true)}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border hover:border-foreground/40 active:scale-95 transition-all duration-150 px-3 py-1.5 rounded-full"
                        data-testid="button-size-guide"
                      >
                        <BookOpen className="w-3.5 h-3.5 flex-shrink-0" />
                        {t.product.sizeGuide}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {sizes.map((size) => {
                      const sizeQty =
                        sizeInv[size] !== undefined ? sizeInv[size] : null;
                      const isOOS = sizeQty !== null && sizeQty <= 0;
                      const isMySaved =
                        savedHighlight &&
                        size === savedHighlight &&
                        !selectedSize;
                      return (
                        <button
                          key={size}
                          onClick={() => {
                            if (!isOOS) {
                              setSelectedSize(size);
                              setQuantity(1);
                            }
                          }}
                          disabled={isOOS}
                          className={`relative min-w-12 h-12 px-3 flex flex-col items-center justify-center border transition-all ${
                            isOOS
                              ? "border-border text-muted-foreground/40 line-through cursor-not-allowed"
                              : selectedSize === size
                                ? "border-primary bg-primary text-primary-foreground"
                                : isMySaved
                                  ? "border-foreground bg-background text-foreground ring-2 ring-foreground/30"
                                  : "border-border hover:border-primary text-foreground"
                          }`}
                          data-testid={`button-size-${size}`}
                          data-size={size}
                        >
                          <span className="text-sm leading-none">{size}</span>
                          {isMySaved && (
                            <span className="text-[9px] leading-none mt-0.5 font-medium opacity-70">
                              {isAr ? "مقاسي" : "mine"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {savedHighlight && (
                    <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                      <Ruler className="w-3 h-3" />
                      {isAr
                        ? `مقاسك المحفوظ: ${savedHighlight} — `
                        : `Your saved size: ${savedHighlight} — `}
                      <button
                        onClick={() => setShowFindMySize(true)}
                        className="underline hover:text-foreground"
                      >
                        {isAr ? "تحديث" : "update"}
                      </button>
                    </p>
                  )}
                </div>
              )}

              {hasSizes && !selectedSize && (
                <p
                  className="text-sm text-muted-foreground mb-4 border border-dashed border-border p-3"
                  data-testid="text-select-size-prompt"
                >
                  {t.product.selectSizePrompt}
                </p>
              )}

              {/* Qty + Add to cart */}
              <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
                <div className="flex items-center border border-border h-11 sm:h-12">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={!canAdd}
                    className="px-3 sm:px-4 h-full hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="button-qty-minus"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span
                    className="w-8 text-center font-medium"
                    data-testid="text-quantity"
                  >
                    {quantity}
                  </span>
                  <button
                    onClick={() =>
                      setQuantity(Math.min(remainingStock, quantity + 1))
                    }
                    disabled={!canAdd || quantity >= remainingStock}
                    className="px-3 sm:px-4 h-full hover:bg-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="button-qty-plus"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <Button
                  onClick={handleAddToCart}
                  className="flex-1 h-11 sm:h-12 rounded-md uppercase tracking-widest text-xs sm:text-sm font-semibold"
                  disabled={!canAdd}
                  data-testid="button-add-to-cart"
                >
                  {canAdd ? (
                    <>
                      <ShoppingBag className="w-4 h-4 me-2" />{" "}
                      {t.product.addToCart}
                    </>
                  ) : hasSizes && !selectedSize ? (
                    t.product.selectSize
                  ) : cartQtyForThis > 0 &&
                    availableStock > 0 &&
                    remainingStock === 0 ? (
                    language === "ar" ? (
                      `الحد الأقصى في السلة (${cartQtyForThis})`
                    ) : (
                      `Max in cart (${cartQtyForThis})`
                    )
                  ) : (
                    t.product.outOfStock
                  )}
                </Button>
              </div>


              {/* Wishlist */}
              {product && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!user) {
                      toast({
                        title: t.wishlist.loginRequired,
                        variant: "destructive",
                      });
                      return;
                    }
                    toggle(product.id, colorName ?? null);
                  }}
                  className={`w-full h-11 sm:h-12 rounded-md uppercase tracking-widest text-xs sm:text-sm font-semibold border-2 transition-all duration-200 mt-3 ${
                    isWishlisted(product.id)
                      ? "border-rose-500 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"
                      : "border-border hover:border-foreground"
                  }`}
                  data-testid="button-wishlist-product"
                >
                  <Heart
                    className={`w-4 h-4 me-2 transition-all duration-200 ${isWishlisted(product.id) ? "fill-rose-500 stroke-rose-500" : "fill-transparent"}`}
                    strokeWidth={1.5}
                  />
                  {isWishlisted(product.id)
                    ? t.wishlist.removeFromWishlist
                    : t.wishlist.addToWishlist}
                </Button>
              )}

              {/* ── Share button ── */}
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: product?.name || "",
                      url: window.location.href,
                    }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(window.location.href).then(() => {
                      setShareCopied(true);
                      setTimeout(() => setShareCopied(false), 2500);
                    });
                  }
                }}
                className={`mt-3 w-full flex items-center justify-center gap-2 h-10 border text-xs uppercase tracking-widest transition-all ${
                  shareCopied
                    ? "border-green-500 text-green-600 bg-green-50"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                }`}
                data-testid="button-share"
              >
                {shareCopied
                  ? <><Check className="w-4 h-4" /> {isAr ? "تم النسخ!" : "Copied!"}</>
                  : navigator.share
                    ? <><Share className="w-4 h-4" /> {isAr ? "مشاركة" : "Share"}</>
                    : <><Link2 className="w-4 h-4" /> {isAr ? "نسخ الرابط" : "Copy URL"}</>
                }
              </button>

              {selectedSize && availableStock > 0 && (
                <p
                  className="text-xs text-muted-foreground mb-4"
                  data-testid="text-size-stock"
                >
                  {t.product.availableInSize} {selectedSize}: {availableStock}{" "}
                  {t.product.pieces}
                </p>
              )}

              <div className="border-t border-border pt-6 mt-5 space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t.product.availability}
                  </span>
                  <span
                    className={
                      availableStock > 0 ? "text-green-600" : "text-destructive"
                    }
                    data-testid="text-availability"
                  >
                    {hasSizes && !selectedSize
                      ? t.product.selectSizeFirst
                      : availableStock > 0
                        ? t.product.inStock
                        : t.product.outOfStock}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t.product.shipping}
                  </span>
                  <span>{t.product.freeDelivery}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Sold-out: similar in-stock alternatives ── */}
          {isSoldOut && similarProducts.length > 0 && (
            <RelatedProductsSlider
              products={similarProducts}
              title={isAr ? "منتجات مشابهة" : "Similar Products"}
              accent={isAr ? "متاحة الآن · نفس الفئة والألوان" : "Available Now · Same Category & Style"}
              accentColor="text-pink-500"
            />
          )}

          {matchingOutfits.length > 0 && (
            <RelatedProductsSlider
              products={matchingOutfits}
              title={isAr ? "تنسيق الإطلالة" : "Matching Outfits"}
              accent={isAr ? "أكملي إطلالتك" : "Complete Your Look"}
              accentColor="text-rose-500"
            />
          )}

          {peopleAlsoBuy.length > 0 && (
            <RelatedProductsSlider
              products={peopleAlsoBuy}
              title={isAr ? "يشتري الناس أيضاً" : "People Also Buy"}
              accent={isAr ? "منتجات مشابهة" : "Similar Items"}
              accentColor="text-pink-500"
            />
          )}

          {recentlyViewed.length > 0 && (
            <RelatedProductsSlider
              products={recentlyViewed}
              title={isAr ? "شاهدتِ مؤخراً" : "Recently Viewed"}
              accent={isAr ? "تصفحتِها من قبل" : "Your browsing history"}
              accentColor="text-amber-500"
            />
          )}
        </div>
      </main>
      <Footer />

      <SizeGuideDialog
        open={showSizeGuide}
        onClose={() => setShowSizeGuide(false)}
        language={language}
      />

      {/* ── Find My Size dialog ── */}
      <FindMySizeDialog
        open={showFindMySize}
        onClose={() => setShowFindMySize(false)}
        mode={findMySizeMode}
        language={language}
        productSizes={sizes}
        onSizePicked={(size) => {
          setSavedHighlight(size);
          // auto-select if the size exists in this product
          if (sizes.includes(size)) {
            setSelectedSize(size);
            setQuantity(1);
          }
        }}
      />
    </div>
  );
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return false;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
