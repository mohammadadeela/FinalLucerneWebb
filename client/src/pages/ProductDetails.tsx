import { useParams, useLocation } from "wouter";
import {
optimizeCloudinaryUrl,
optimizeCloudinaryVideoUrl,
getVideoPosterUrl,
blurCloudinaryUrl,
sortSizes,
} from "@/lib/utils";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useProduct, useProducts } from "@/hooks/use-products";
import { useCart } from "@/store/use-cart";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
Minus,
Plus,
ShoppingBag,
Check,
X,
Heart,
Ruler,
Share,
Link2,
BookOpen,
ChevronUp,
ChevronDown,
ChevronLeft,
ChevronRight,
Truck,
} from "lucide-react";
import { useLanguage } from "@/i18n";
import type { ColorVariant, MediaItem } from "@shared/schema";
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
import { unwrapApiResponse } from "@/lib/queryClient";

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
const rand = () => {
s = (s * 1664525 + 1013904223) & 0xffffffff;
return (s >>> 0) / 0xffffffff;
};
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
const max = Math.max(r, g, b),
min = Math.min(r, g, b),
d = max - min;
if (d === 0) return -1;
let h = 0;
if (max === r) h = (((g - b) / d + 6) % 6) * 60;
else if (max === g) h = ((b - r) / d + 2) * 60;
else h = ((r - g) / d + 4) * 60;
return h;
}
function hueDist(a: number, b: number): number {
if (a < 0 || b < 0) return 180;
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
{ label: "S", cMin: 84, cMax: 88, wMin: 66, wMax: 70, hMin: 90, hMax: 94 },
{ label: "M", cMin: 88, cMax: 92, wMin: 70, wMax: 74, hMin: 94, hMax: 98 },
{ label: "L", cMin: 92, cMax: 96, wMin: 74, wMax: 78, hMin: 98, hMax: 102 },
{
label: "XL",
cMin: 96,
cMax: 100,
wMin: 78,
wMax: 82,
hMin: 102,
hMax: 106,
},
{
label: "XXL",
cMin: 100,
cMax: 106,
wMin: 82,
wMax: 88,
hMin: 106,
hMax: 112,
},
];
const FIT_OFFSET: Record<string, number> = {
tight: -1,
slim: 0,
normal: 0,
relaxed: 1,
loose: 2,
};

function computeClothingSize(
chest: number,
waist: number,
hip: number,
fit: string,
): string {
let best = 0,
bestScore = Infinity;
CLOTHING_SIZES.forEach((sz, i) => {
const score =
Math.abs(chest - (sz.cMin + sz.cMax) / 2) +
Math.abs(waist - (sz.wMin + sz.wMax) / 2) +
Math.abs(hip - (sz.hMin + sz.hMax) / 2);
if (score < bestScore) {
bestScore = score;
best = i;
}
});
const idx = Math.min(
Math.max(best + (FIT_OFFSET[fit] || 0), 0),
CLOTHING_SIZES.length - 1,
);
return CLOTHING_SIZES[idx].label;
}

// ─── Pants size logic ─────────────────────────────────────────────────────────
const PANTS_SIZES = [
{ label: "XS", eu: 34, wMin: 60, wMax: 64 },
{ label: "S", eu: 36, wMin: 65, wMax: 69 },
{ label: "M", eu: 38, wMin: 70, wMax: 74 },
{ label: "L", eu: 40, wMin: 75, wMax: 79 },
{ label: "XL", eu: 42, wMin: 80, wMax: 85 },
];
function computePantsSize(waist: number, fit: string): string {
let best = 0,
bestScore = Infinity;
PANTS_SIZES.forEach((sz, i) => {
const score = Math.abs(waist - (sz.wMin + sz.wMax) / 2);
if (score < bestScore) {
bestScore = score;
best = i;
}
});
const idx = Math.min(
Math.max(best + (FIT_OFFSET[fit] || 0), 0),
PANTS_SIZES.length - 1,
);
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
if (dist < bestDist) {
bestDist = dist;
best = s;
}
}
return best;
}

function closestShoeSize(euRecommended: number, available: string[]): string {
if (!available.length) return String(euRecommended);
const numeric = available.map(Number).filter((n) => !isNaN(n));
if (!numeric.length) return String(euRecommended);
const closest = numeric.reduce((a, b) =>
Math.abs(b - euRecommended) < Math.abs(a - euRecommended) ? b : a,
);
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

const [chest, setChest] = useState("");
const [waist, setWaist] = useState("");
const [hip, setHip] = useState("");
const [fit, setFit] = useState("normal");

const [foot, setFoot] = useState("");
const [shoeGender, setShoeGender] = useState<"women" | "men" | "unisex">(
"women",
);
const [shoeWidth, setShoeWidth] = useState("standard");
const [shoeError, setShoeError] = useState("");

const [pantsWaist, setPantsWaist] = useState("");
const [pantsFit, setPantsFit] = useState("normal");
const [pantsResult, setPantsResult] = useState("");
const [pantsError, setPantsError] = useState("");

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

if (mode === "clothes") {
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
<p>
1.{" "}
{isAr
? "قيسي الصدر عند أوسع نقطة"
: "Measure chest at the fullest point"}
</p>
<p>
2.{" "}
{isAr
? "قيسي الخصر عند أضيق نقطة"
: "Measure waist at the narrowest point"}
</p>
<p>
3.{" "}
{isAr
? "قيسي الورك عند أوسع نقطة"
: "Measure hips at the widest point"}
</p>
<p>
4.{" "}
{isAr
? "أدخلي الأرقام بالسنتيمتر"
: "Enter all values in centimeters"}
</p>
</div>
<div className="grid grid-cols-3 gap-3 mb-3">
{[
{
label: isAr ? "الصدر" : "Chest",
val: chest,
set: setChest,
placeholder: isAr ? "مثلاً ٨٨" : "e.g. 88",
},
{
label: isAr ? "الخصر" : "Waist",
val: waist,
set: setWaist,
placeholder: isAr ? "مثلاً ٧٠" : "e.g. 70",
},
{
label: isAr ? "الورك" : "Hip",
val: hip,
set: setHip,
placeholder: isAr ? "مثلاً ٩٦" : "e.g. 96",
},
].map(({ label, val, set, placeholder }) => (
<div key={label}>
<label className="text-xs text-muted-foreground block mb-1">
{label}{" "}
<span className="text-muted-foreground/60">
{isAr ? "سم" : "cm"}
</span>
</label>
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
{clothesError && (
<p className="text-xs text-destructive mb-2">{clothesError}</p>
)}
<Button
className="w-full rounded-md uppercase tracking-widest text-xs"
onClick={() => {
if (!chest || !waist || !hip) {
setClothesError(
isAr
? "يرجى إدخال جميع المقاسات"
: "Please enter all three measurements.",
);
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
{isAr
? "كيف تفضلين ملابسك؟"
: "How do you prefer your clothes to fit?"}
</p>
<div className="flex flex-wrap gap-2 mb-5">
{(isAr
? [
["tight", "ضيق جداً"],
["slim", "ضيق"],
["normal", "عادي"],
["relaxed", "مريح"],
["loose", "فضفاض"],
]
: [
["tight", "Tight"],
["slim", "Slim"],
["normal", "Normal"],
["relaxed", "Relaxed"],
["loose", "Loose"],
]
).map(([val, lbl]) => chip(lbl, fit === val, () => setFit(val)))}
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
const raw = computeClothingSize(+chest, +waist, +hip, fit);
const result = productSizes?.length
? closestClothesSize(raw, productSizes)
: raw;
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
{
label: isAr ? "الصدر" : "Chest",
val: `${chest} cm`,
range: resultSize
? `${resultSize.cMin}–${resultSize.cMax}`
: "",
},
{
label: isAr ? "الخصر" : "Waist",
val: `${waist} cm`,
range: resultSize
? `${resultSize.wMin}–${resultSize.wMax}`
: "",
},
{
label: isAr ? "الورك" : "Hip",
val: `${hip} cm`,
range: resultSize
? `${resultSize.hMin}–${resultSize.hMax}`
: "",
},
].map(({ label, val, range }) => (
<div
key={label}
className="bg-secondary rounded-lg p-3 text-center"
>
<div className="text-sm font-semibold">{val}</div>
<div className="text-xs text-muted-foreground mt-0.5">
{label}
</div>
{range && (
<div className="text-xs text-muted-foreground/60 mt-1">
({range})
</div>
)}
</div>
))}
</div>
{fit !== "normal" && (
<p className="text-xs text-muted-foreground bg-secondary rounded p-3 mb-4 leading-relaxed">
{fit === "tight" || fit === "slim"
? isAr
? "اخترتِ قصة ضيقة — قد تحتاجين مقاساً أكبر للراحة."
: "You chose a slim fit — consider sizing up for comfort."
: isAr
? "اخترتِ قصة مريحة — المقاس أكبر قليلاً من مقاسك الأساسي."
: "You chose a relaxed fit — this is slightly larger than your base size."}
</p>
)}
<Button
className="w-full rounded-md uppercase tracking-widest text-xs mb-2"
onClick={() => {
onSizePicked?.(clothesResult);
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

if (mode === "pants") {
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
<p>
{isAr
? "قيسي الخصر عند أضيق نقطة (فوق السرة) بالسنتيمتر."
: "Measure your waist at the narrowest point (above your navel), in centimeters."}
</p>
</div>
<div className="mb-3">
<label className="text-xs text-muted-foreground block mb-1">
{isAr ? "محيط الخصر" : "Waist circumference"}{" "}
<span className="text-muted-foreground/60">cm</span>
</label>
<input
type="text"
inputMode="decimal"
value={pantsWaist}
onChange={(e) =>
setPantsWaist(normalizeArabicDigits(e.target.value))
}
placeholder={isAr ? "مثلاً ٧٠" : "e.g. 70"}
className="w-full border border-border rounded px-2 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-foreground text-center"
/>
</div>
{pantsError && (
<p className="text-xs text-destructive mb-2">{pantsError}</p>
)}
<Button
className="w-full rounded-md uppercase tracking-widest text-xs"
onClick={() => {
if (!pantsWaist) {
setPantsError(
isAr
? "يرجى إدخال مقاس الخصر"
: "Please enter your waist measurement.",
);
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
{isAr
? "كيف تفضلين قصة البنطلون؟"
: "How do you prefer your pants to fit?"}
</p>
<div className="flex flex-wrap gap-2 mb-5">
{(isAr
? [
["tight", "ضيق جداً"],
["slim", "ضيق"],
["normal", "عادي"],
["relaxed", "مريح"],
["loose", "فضفاض"],
]
: [
["tight", "Tight"],
["slim", "Slim"],
["normal", "Normal"],
["relaxed", "Relaxed"],
["loose", "Loose"],
]
).map(([val, lbl]) =>
chip(lbl, pantsFit === val, () => setPantsFit(val)),
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
const raw = computePantsSize(+pantsWaist, pantsFit);
const result = productSizes?.length
? closestClothesSize(raw, productSizes)
: raw;
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
<div className="text-5xl font-semibold mb-1">
EU {pantsResultSize.eu}
</div>
)}
<div className="text-sm text-muted-foreground mt-1">
{pantsResult}
</div>
<div className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
{isAr ? "مقاس البنطلون" : "Pants size"}
</div>
</div>
<div className="grid grid-cols-2 gap-3 mb-4">
<div className="bg-secondary rounded-lg p-3 text-center">
<div className="text-sm font-semibold">{pantsWaist} cm</div>
<div className="text-xs text-muted-foreground mt-0.5">
{isAr ? "الخصر" : "Waist"}
</div>
{pantsResultSize && (
<div className="text-xs text-muted-foreground/60 mt-1">
({pantsResultSize.wMin}–{pantsResultSize.wMax} cm)
</div>
)}
</div>
<div className="bg-secondary rounded-lg p-3 text-center">
<div className="text-sm font-semibold">
EU {pantsResultSize?.eu ?? "—"}
</div>
<div className="text-xs text-muted-foreground mt-0.5">
{isAr ? "مقاس أوروبي" : "EU size"}
</div>
</div>
</div>
{pantsFit !== "normal" && (
<p className="text-xs text-muted-foreground bg-secondary rounded p-3 mb-4 leading-relaxed">
{pantsFit === "tight" || pantsFit === "slim"
? isAr
? "اخترتِ قصة ضيقة — قد تحتاجين مقاساً أكبر للراحة."
: "You chose a slim fit — consider sizing up for comfort."
: isAr
? "اخترتِ قصة مريحة — المقاس أكبر قليلاً من مقاسك الأساسي."
: "You chose a relaxed fit — this is slightly larger than your base size."}
</p>
)}
<Button
className="w-full rounded-md uppercase tracking-widest text-xs mb-2"
onClick={() => {
onSizePicked?.(pantsResult);
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
if (productSizes?.length) {
const snapped = closestShoeSize(best.eu, productSizes);
const snappedEntry = table.find(
(r) => String(r.eu) === snapped,
);
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

// ─── SizeGuideDialog ──────────────────────────────────────────────────────────
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
const [atStart, setAtStart] = useState(true);
const [atEnd, setAtEnd] = useState(false);

const updateSliderEdges = useCallback(() => {
const el = sliderRef.current;
if (!el) return;

const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
const currentScroll = Math.abs(el.scrollLeft);

setAtStart(currentScroll <= 4);
setAtEnd(maxScroll <= 4 || currentScroll >= maxScroll - 4);
}, []);

const scroll = (dir: "prev" | "next") => {
const el = sliderRef.current;
if (!el) return;

const isRTL = window.getComputedStyle(el).direction === "rtl";
const direction = isRTL ? -1 : 1;

// Move one complete visible page. Because the card widths are calculated
// from the viewport, every resting position shows complete cards only.
el.scrollBy({
left:
dir === "next"
? direction * el.clientWidth
: -direction * el.clientWidth,
behavior: "smooth",
});
};

useEffect(() => {
const el = sliderRef.current;
if (!el) return;

const frame = requestAnimationFrame(updateSliderEdges);
const resizeObserver = new ResizeObserver(updateSliderEdges);
resizeObserver.observe(el);

return () => {
cancelAnimationFrame(frame);
resizeObserver.disconnect();
};
}, [products, updateSliderEdges]);

return (
<section
className="mt-16 sm:mt-24"
style={{
marginLeft: "calc(-50vw + 50%)",
marginRight: "calc(-50vw + 50%)",
}}
data-testid="section-related-products"
>
<div className="flex items-center justify-between mb-6 sm:mb-8 px-4 sm:px-6 lg:px-8">
<div>
{accent && (
<span
className={`block text-[10px] uppercase tracking-[0.3em] mb-1.5 font-semibold ${accentColor}`}
>
{accent}
</span>
)}
<h2 className="font-display text-2xl sm:text-3xl font-semibold">
{title}
</h2>
<span
className={`block mt-2 h-px w-10 ${accentColor.replace("text-", "bg-")}`}
/>
</div>
</div>

{/* Mobile: keep the clean two-column layout. */}
<div className="grid grid-cols-2 gap-3 sm:hidden px-4">
{products.map((p) => (
<div key={p.id} data-testid={`related-product-${p.id}`}>
<ProductCard product={p} />
</div>
))}
</div>

{/* Desktop/tablet: exact-width cards, so no card is cut in half. */}
<div className="relative hidden sm:block overflow-hidden px-4 sm:px-6 lg:px-8">
<button
type="button"
onClick={() => scroll("prev")}
disabled={atStart}
className="absolute start-2 sm:start-3 lg:start-4 top-[40%] -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-all hover:bg-foreground/85 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
aria-label="Previous products"
>
<ChevronRight className="h-5 w-5" />
</button>

<button
type="button"
onClick={() => scroll("next")}
disabled={atEnd}
className="absolute end-2 sm:end-3 lg:end-4 top-[40%] -translate-y-1/2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-all hover:bg-foreground/85 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
aria-label="Next products"
>
<ChevronLeft className="h-5 w-5" />
</button>

<div
ref={sliderRef}
onScroll={updateSliderEdges}
className="flex gap-4 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory"
style={{
scrollbarWidth: "none",
msOverflowStyle: "none",
}}
>
{products.map((p) => (
<div
key={p.id}
className="flex-none basis-[calc(33.333%_-_0.667rem)] lg:basis-[calc(25%_-_0.75rem)] xl:basis-[calc(20%_-_0.8rem)] snap-start [scroll-snap-stop:always]"
data-testid={`related-product-${p.id}`}
>
<ProductCard product={p} />
</div>
))}
</div>
</div>
</section>
);
}

// ─── VideoPlayer: zero-wait, poster-first, mobile-optimised ──────────────────
// Strategy:
// 1. Show the Cloudinary poster image IMMEDIATELY (no network wait).
// 2. Start loading the video in the background with preload="auto".
// 3. Once the video has buffered enough to play (onCanPlay), crossfade it over
// the poster — the user never sees a black/white flash.
// 4. On mobile we add playsinline + muted (already required for autoplay).
// 5. We use preload="metadata" on mobile to avoid wasting bandwidth until
// the user navigates to the video slide; the ref callback swaps it to
// "auto" when the video slide becomes active.
function VideoPlayer({
url,
poster,
isThumbnail = false,
}: {
url: string;
poster?: string;
isActive?: boolean;
isThumbnail?: boolean;
}) {
const videoRef = useRef<HTMLVideoElement>(null);
const [videoReady, setVideoReady] = useState(false);
const [posterReady, setPosterReady] = useState(false);
const blurPoster = blurCloudinaryUrl(poster);

// Start playing immediately — no user interaction required
useEffect(() => {
const vid = videoRef.current;
if (!vid) return;
vid.preload = "auto";
vid.play().catch(() => {});
}, [url]);

// Reset ready state when URL changes (color variant swap)
useEffect(() => {
setVideoReady(false);
setPosterReady(false);
}, [url]);

return (
<div className="w-full h-full relative bg-muted overflow-hidden">
{/* ── Blur-up layer: instant tiny preview, no black flash while the
full poster is still downloading ── */}
{blurPoster && (
<img
src={blurPoster}
alt=""
aria-hidden
className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-500 ${
posterReady ? "opacity-0" : "opacity-100"
}`}
/>
)}

{/* ── Poster layer: visible until video has buffered — no icon ── */}
{poster && (
<img
src={poster}
alt=""
aria-hidden
className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
videoReady ? "opacity-0 pointer-events-none" : "opacity-100"
}`}
fetchpriority={isThumbnail ? "low" : "high"}
decoding="async"
onLoad={() => setPosterReady(true)}
onError={() => setPosterReady(true)}
/>
)}

{/* ── Video: always looping, always muted, zero controls ── */}
<video
ref={videoRef}
key={url}
src={optimizeCloudinaryVideoUrl(url, isThumbnail ? 360 : 720)}
poster={poster}
preload="auto"
autoPlay
muted
loop
playsInline
disablePictureInPicture
className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
videoReady || !poster ? "opacity-100" : "opacity-0"
}`}
style={{ pointerEvents: "none" }}
onCanPlay={() => setVideoReady(true)}
data-testid={isThumbnail ? "video-product-thumb" : "video-product-main"}
/>
</div>
);
}

function ThumbImage({ src, alt, size = 300 }: { src: string; alt: string; size?: number }) {
  const [ready, setReady] = useState(false);
  const blurSrc = blurCloudinaryUrl(src);
  const optimized = optimizeCloudinaryUrl(src, size) || src;
  return (
    <div className="relative w-full h-full overflow-hidden">
      {blurSrc && (
        <img
          src={blurSrc}
          aria-hidden
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-700 ${ready ? "opacity-0" : "opacity-100"}`}
        />
      )}
      <img
        src={optimized}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover"
        onLoad={() => setReady(true)}
        onError={() => setReady(true)}
      />
      <div className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/15 transition-all duration-300" />
    </div>
  );
}

// ─── ProductDetails ───────────────────────────────────────────────────────────
export default function ProductDetails() {
const { id } = useParams<{ id: string }>();
const { data: product, isLoading } = useProduct(Number(id));
const { data: allProducts } = useProducts();
const { addToCart, items: cartItems } = useCart();
const qc2 = useQueryClient();
const { toast } = useToast();
const { t, language } = useLanguage();
const [, navigate] = useLocation();
const { data: user } = useAuth();
const { isWishlisted, toggle } = useWishlist();
const { data: categories } = useCategories();

// Keep the browser tab title in sync when navigating between products via
// client-side routing (SPA navigation doesn't reload index.html, so the
// server-rendered <title> from server/seo.ts only applies to the very first
// hit — this keeps it accurate afterwards too).
useEffect(() => {
  if (!product?.name) return;
  const prevTitle = document.title;
  document.title = `${product.name} | Lucerne Boutique`;
  return () => {
    document.title = prevTitle;
  };
}, [product?.name]);

const [quantity, setQuantity] = useState(1);
const [selectedSize, setSelectedSize] = useState<string>("");
const [selectedColorIdx, setSelectedColorIdx] = useState(0);
const [selectedImageIdx, setSelectedImageIdx] = useState(0);
const [showSizeGuide, setShowSizeGuide] = useState(false);
const [showFindMySize, setShowFindMySize] = useState(false);
const [zoomPos, setZoomPos] = useState<{ x: number; y: number } | null>(null);
const [shareCopied, setShareCopied] = useState(false);
const [mainImgReady, setMainImgReady] = useState(false);
const [recentlyViewedIds, setRecentlyViewedIds] = useState<number[]>(() => {
try {
return JSON.parse(localStorage.getItem("recently_viewed") || "[]");
} catch {
return [];
}
});

// ── Touch / swipe state for mobile gallery ──
const touchStartX = useRef<number | null>(null);
const touchStartY = useRef<number | null>(null);

const isAr = language === "ar";

const thumbsRef = useRef<HTMLDivElement>(null);
const [thumbsCanUp, setThumbsCanUp] = useState(false);
const [thumbsCanDown, setThumbsCanDown] = useState(false);
const infoPanelRef = useRef<HTMLDivElement>(null);
const galleryColRef = useRef<HTMLDivElement>(null);
const imageLayerRef = useRef<HTMLDivElement>(null);
const mainImageRef = useRef<HTMLImageElement>(null);
const [mainImageBox, setMainImageBox] = useState<{
left: number;
top: number;
width: number;
height: number;
} | null>(null);

const measureMainImage = useCallback(() => {
const layer = imageLayerRef.current;
const image = mainImageRef.current;
if (!layer || !image) return;

// offsetLeft/offsetTop are relative to the positioned image layer.
// This keeps the zoom frame and icon attached to the real rendered photo
// even when the page is RTL, resized, or the image is vertically centered.
const width = image.offsetWidth;
const height = image.offsetHeight;
if (width <= 0 || height <= 0) return;

const next = {
left: image.offsetLeft,
top: image.offsetTop,
width,
height,
};

setMainImageBox((previous) => {
if (
previous &&
Math.abs(previous.left - next.left) < 0.5 &&
Math.abs(previous.top - next.top) < 0.5 &&
Math.abs(previous.width - next.width) < 0.5 &&
Math.abs(previous.height - next.height) < 0.5
) {
return previous;
}
return next;
});
}, []);

const checkThumbsScroll = useCallback(() => {
const el = thumbsRef.current;
if (!el) return;
setThumbsCanUp(el.scrollTop > 4);
setThumbsCanDown(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
}, []);

const scrollThumbs = useCallback((dir: "up" | "down") => {
const el = thumbsRef.current;
if (!el) return;
// Scroll by one thumbnail's real height (+ its gap) so each click lands
// cleanly on the next item instead of stopping mid-thumbnail.
const firstThumb = el.querySelector<HTMLElement>("button");
const gap = parseFloat(getComputedStyle(el).rowGap || "8") || 8;
const step = firstThumb ? firstThumb.offsetHeight + gap : 160;
el.scrollBy({ top: dir === "up" ? -step : step, behavior: "smooth" });
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
type GalleryMedia = { type: "image" | "video"; url: string; poster?: string; isPrimary?: boolean };
const variantAny = activeVariant as any;
const productVideoUrl = ((product as any)?.videoUrl as string | null | undefined)?.trim();
const addProductLevelVideo = (items: GalleryMedia[]) => {
if (!productVideoUrl) return items;
const alreadyIncluded = items.some((m) => m.type === "video" && m.url === productVideoUrl);
if (alreadyIncluded) return items;
return [{ type: "video" as const, url: productVideoUrl, poster: getVideoPosterUrl(productVideoUrl) }, ...items];
};

if (
variantAny.media &&
Array.isArray(variantAny.media) &&
variantAny.media.length > 0
) {
let items: GalleryMedia[] = variantAny.media
.filter((m: MediaItem) => m && (m.type === "image" || m.type === "video") && typeof m.url === "string" && m.url.trim())
.map((m: MediaItem) => ({
  type: m.type,
  url: m.url.trim(),
  poster: m.poster || (m.type === "video" ? getVideoPosterUrl(m.url) : undefined),
  isPrimary: m.isPrimary,
}));
// NOTE: intentionally NOT calling addProductLevelVideo here. This variant
// already defines its own media array, which is the full source of truth
// for what this color should show. product.videoUrl is only a legacy
// fallback (it mirrors whichever color happened to be saved first) and
// injecting it here would leak that color's video into every other
// color's gallery.
const primary = items.find((m) => m.isPrimary) || items[0];
const rest = items.filter((m) => m !== primary);
return [primary, ...rest];
}
const imgs: GalleryMedia[] = [activeVariant.mainImage, ...(activeVariant.images || [])]
.filter(Boolean)
.map((url) => ({ type: "image" as const, url }));
// product.videoUrl is a legacy field that, at save time, is always derived
// from color variant #0's media (see admin Products.tsx: finalVideoUrl
// comes from colorVariantsData[0]). It belongs to that one color only.
// Only attach it here when the color actually being viewed is variant #0
// and that variant has no explicit media of its own — otherwise every
// other color (or every color, if there's only one) would incorrectly
// inherit the main color's video. Put video FIRST so it autoplays
// immediately without user clicking.
if (selectedColorIdx !== 0) return imgs;
return addProductLevelVideo(imgs);
}, [activeVariant, product, selectedColorIdx]);

const goToPrev = useCallback(() => {
setSelectedImageIdx((i) => (i - 1 + allMedia.length) % allMedia.length);
setZoomPos(null);
}, [allMedia.length]);

const goToNext = useCallback(() => {
setSelectedImageIdx((i) => (i + 1) % allMedia.length);
setZoomPos(null);
}, [allMedia.length]);

// ── Swipe handlers for mobile gallery ──
const handleTouchStart = useCallback((e: React.TouchEvent) => {
touchStartX.current = e.touches[0].clientX;
touchStartY.current = e.touches[0].clientY;
}, []);

const handleTouchEnd = useCallback(
(e: React.TouchEvent) => {
if (touchStartX.current === null || touchStartY.current === null) return;
const dx = e.changedTouches[0].clientX - touchStartX.current;
const dy = e.changedTouches[0].clientY - touchStartY.current;
// Only register horizontal swipes that are clearly intentional
// dx > 0 = finger moved right = go to previous (like flipping a page back)
// dx < 0 = finger moved left = go to next
if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
// In RTL (Arabic), natural swipe direction is mirrored
if (isAr) {
if (dx > 0) goToNext();
else goToPrev();
} else {
if (dx > 0) goToPrev();
else goToNext();
}
}
touchStartX.current = null;
touchStartY.current = null;
},
[goToNext, goToPrev],
);

const sizes = sortSizes(activeVariant?.sizes || []);
const sizeInv = activeVariant?.sizeInventory || {};
const hasSizes = sizes.length > 0;

const findMySizeMode: FindMySizeMode = useMemo(() => {
if (!product) return "clothes";
const cat = categories?.find((c) => c.id === product.categoryId);
const guide = (cat as any)?.sizeGuide ?? "auto";
if (guide === "clothes") return "clothes";
if (guide === "shoes") return "shoes";
if (guide === "pants") return "pants";
if (guide === "none") return "none" as any;
if (cat) {
const slug = (cat.slug ?? "").toLowerCase();
const name = (cat.name ?? "").toLowerCase();
const nameAr = (cat.nameAr ?? "").toLowerCase();
const PANTS_AR = ["بنطلون", "بنطال", "بناطيل", "بلاطين"];
const PANTS_EN = ["pant", "trouser", "jean", "legging"];
if (
slug.includes("shoe") ||
name.includes("shoe") ||
nameAr.includes("شوز") ||
nameAr.includes("أحذية")
)
return "shoes";
if (
PANTS_AR.some((k) => nameAr.includes(k)) ||
PANTS_EN.some((k) => name.includes(k) || slug.includes(k))
)
return "pants";
}
const pName = (product.name ?? "").toLowerCase();
const PANTS_AR = ["بنطلون", "بنطال", "بناطيل", "بلاطين"];
const PANTS_EN = ["pant", "trouser", "jean", "legging"];
if (
PANTS_AR.some((k) => pName.includes(k)) ||
PANTS_EN.some((k) => pName.includes(k))
)
return "pants";
if (hasSizes && sizes.some((s) => /^\d{2,3}$/.test(s.trim())))
return "shoes";
return "clothes";
}, [product, categories, hasSizes, sizes]);

const isShoeProduct = findMySizeMode === "shoes";
const isPantsProduct = findMySizeMode === "pants";
const hideFindMySize = (findMySizeMode as string) === "none";

const [savedHighlight, setSavedHighlight] = useState<string>("");
useEffect(() => {
const saved = getSavedSize();
if (isShoeProduct && saved.shoe_eu)
setSavedHighlight(String(saved.shoe_eu));
else if (isPantsProduct && saved.pants) setSavedHighlight(saved.pants);
else if (!isShoeProduct && !isPantsProduct && saved.clothes)
setSavedHighlight(saved.clothes);
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
setMainImgReady(false);
}, [selectedColorIdx]);

useEffect(() => {
setMainImgReady(false);
setMainImageBox(null);
}, [selectedImageIdx]);

useEffect(() => {
const layer = imageLayerRef.current;
const image = mainImageRef.current;
if (!layer || !image) return;

let animationFrame = 0;
const update = () => {
cancelAnimationFrame(animationFrame);
animationFrame = requestAnimationFrame(measureMainImage);
};

const resizeObserver = new ResizeObserver(update);
resizeObserver.observe(layer);
resizeObserver.observe(image);
window.addEventListener("resize", update);
update();

return () => {
cancelAnimationFrame(animationFrame);
resizeObserver.disconnect();
window.removeEventListener("resize", update);
};
}, [measureMainImage, selectedImageIdx, selectedColorIdx, allMedia.length]);

useEffect(() => {
setSelectedSize("");
setQuantity(1);
setSelectedColorIdx(0);
setSelectedImageIdx(0);
window.scrollTo({ top: 0, behavior: "instant" });
}, [id]);

useEffect(() => {
const t = setTimeout(checkThumbsScroll, 80);
return () => clearTimeout(t);
}, [allMedia, checkThumbsScroll]);

useEffect(() => {
if (allMedia.length > 0 && selectedImageIdx >= allMedia.length) {
setSelectedImageIdx(0);
}
}, [allMedia, selectedImageIdx]);

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

useEffect(() => {
if (!product) return;
trackProductEvent(product.id, "view", user?.id ?? null);
try {
const stored: number[] = JSON.parse(
localStorage.getItem("recently_viewed") || "[]",
);
const updated = [
product.id,
...stored.filter((x) => x !== product.id),
].slice(0, 12);
localStorage.setItem("recently_viewed", JSON.stringify(updated));
setRecentlyViewedIds(updated);
} catch {}
}, [product?.id]);

useEffect(() => {
if (!product) return;
const mainImageUrl = optimizeCloudinaryUrl(product.mainImage, 1200);
if (!mainImageUrl) return;
const link = document.createElement("link");
link.rel = "preload";
link.as = "image";
link.href = mainImageUrl;
(link as any).fetchPriority = "high";
document.head.appendChild(link);
return () => {
if (document.head.contains(link)) document.head.removeChild(link);
};
}, [product?.mainImage]);

// ── Preload video poster as soon as the product loads so it's instant ──
useEffect(() => {
if (!product) return;
const vid = (product as any)?.videoUrl as string | undefined;
if (!vid) return;
const posterUrl = getVideoPosterUrl(vid);
if (!posterUrl) return;
const link = document.createElement("link");
link.rel = "preload";
link.as = "image";
link.href = posterUrl;
document.head.appendChild(link);
return () => {
if (document.head.contains(link)) document.head.removeChild(link);
};
}, [(product as any)?.videoUrl]);

// Preload all gallery images (and video posters) for the active color
// variant so switching images, colors, and starting video playback is
// instant with zero network wait. Uses Cloudinary-optimised URLs so what
// is fetched matches what's rendered (no double-download).
useEffect(() => {
if (!allMedia.length) return;
const links: HTMLLinkElement[] = [];
for (const m of allMedia) {
if (m.type === "image" && m.url) {
const optimized = optimizeCloudinaryUrl(m.url, 1200) || m.url;
const img = new Image();
img.src = optimized;
} else if (m.type === "video" && m.url) {
// Preload the video poster image so the video tile appears instantly
const poster = (m as any).poster || getVideoPosterUrl(m.url);
if (poster) {
const img = new Image();
img.src = poster;
}
// Hint the browser to start fetching the video itself in the
// background so playback begins with zero buffering wait
const link = document.createElement("link");
link.rel = "preload";
link.as = "video";
link.href = optimizeCloudinaryVideoUrl(m.url) || m.url;
document.head.appendChild(link);
links.push(link);
}
}
return () => {
for (const l of links) {
if (document.head.contains(l)) document.head.removeChild(l);
}
};
}, [allMedia]);

const { data: recommendedIds } = useQuery<number[]>({
queryKey: ["/api/products", Number(id), "recommendations"],
queryFn: async () => {
const res = await fetch(`/api/products/${id}/recommendations`);
if (!res.ok) return [];
return unwrapApiResponse<number[]>(await res.json());
},
enabled: !!id,
staleTime: 5 * 60 * 1000,
});

const peopleAlsoBuy = useMemo(() => {
if (!product || !allProducts) return [];
if (recommendedIds && recommendedIds.length >= 2) {
const idSet = new Set(recommendedIds);
const ordered = recommendedIds
.map((rid) =>
allProducts.find(
(p) => p.id === rid && p.categoryId === product.categoryId,
),
)
.filter(Boolean) as typeof allProducts;
const pool = allProducts.filter(
(p) =>
p.id !== product.id &&
!idSet.has(p.id) &&
p.categoryId === product.categoryId,
);
return [...ordered, ...seededShuffle(pool, product.id)].slice(0, 12);
}
const pool = allProducts.filter(
(p) => p.id !== product.id && p.categoryId === product.categoryId,
);
return seededShuffle(pool, product.id).slice(0, 12);
}, [product, allProducts, recommendedIds]);

const matchingOutfits = useMemo(() => {
if (!product || !allProducts) return [];
const pool = allProducts.filter(
(p) => p.id !== product.id && p.categoryId !== product.categoryId,
);
if (pool.length === 0) return [];
const crossCatIds = new Set(
(recommendedIds ?? []).filter((rid) => {
const found = allProducts.find((p) => p.id === rid);
return found && found.categoryId !== product.categoryId;
}),
);
const productHues = (((product as any).colorVariants as any[]) ?? [])
.map((v: any) => hexToHue(v.colorCode))
.filter((h: number) => h >= 0);
const productPrice = parseFloat(product.price as string) || 0;
const scored = pool.map((p) => {
let score = 0;
if (crossCatIds.has(p.id)) score += 1000;
const candidateHues = (((p as any).colorVariants as any[]) ?? [])
.map((v: any) => hexToHue(v.colorCode))
.filter((h: number) => h >= 0);
if (productHues.length === 0 || candidateHues.length === 0) {
score += 35;
} else {
let bestHarmony = 0;
for (const ph of productHues) {
for (const ch of candidateHues) {
const dist = hueDist(ph, ch);
let h = 0;
if (dist <= 30) h = 55;
else if (dist >= 150 && dist <= 210) h = 70;
else if (dist >= 60 && dist <= 120) h = 25;
else h = 10;
bestHarmony = Math.max(bestHarmony, h);
}
}
score += bestHarmony;
}
const candidatePrice = parseFloat(p.price as string) || 0;
if (productPrice > 0 && candidatePrice > 0) {
const diff = Math.abs(productPrice - candidatePrice) / productPrice;
if (diff <= 0.4) score += 20;
else if (diff <= 0.8) score += 10;
}
score += ((product.id * 1000 + p.id) % 100) * 0.01;
return { p, score };
});
return scored
.sort((a, b) => b.score - a.score)
.map((s) => s.p)
.slice(0, 12);
}, [product, allProducts, recommendedIds]);

const recentlyViewed = useMemo(() => {
if (!allProducts || !product) return [];
return recentlyViewedIds
.filter((rid) => rid !== product.id)
.map((rid) => allProducts.find((p) => p.id === rid))
.filter(Boolean) as typeof allProducts;
}, [allProducts, product?.id, recentlyViewedIds]);

const isSoldOut = (product?.stockQuantity ?? 1) === 0;

const similarProducts = useMemo(() => {
if (!product || !allProducts || !isSoldOut) return [];
const cv = (product as any).colorVariants as ColorVariant[] | undefined;
const productHues = (cv ?? [])
.map((v) => hexToHue(v.colorCode))
.filter((h) => h >= 0);
const pool = allProducts.filter(
(p) =>
p.id !== product.id &&
p.categoryId === product.categoryId &&
p.stockQuantity > 0,
);
if (productHues.length === 0) return pool.slice(0, 12);
return pool
.map((p) => {
const pCv = (p as any).colorVariants as ColorVariant[] | undefined;
const pHues = (pCv ?? [])
.map((v) => hexToHue(v.colorCode))
.filter((h) => h >= 0);
const minDist =
pHues.length > 0
? Math.min(
...productHues.flatMap((h1) =>
pHues.map((h2) => hueDist(h1, h2)),
),
)
: 180;
return { p, minDist };
})
.sort((a, b) => a.minDist - b.minDist)
.slice(0, 12)
.map(({ p }) => p);
}, [product, allProducts, isSoldOut]);

if (isLoading && !product)
return (
<div className="min-h-screen flex flex-col pt-navbar">
<Navbar />
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

/* Live stock check at the exact moment of Add to Cart. Returns real
   availability for the selected color/size, or null on network problems
   so the caller falls back to cached data (checkout still protects). */
const fetchFreshAvailable = async (): Promise<number | null> => {
try {
const res = await fetch(`/api/products/${product.id}`, { cache: "no-store" });
if (!res.ok) return null;
const fresh: any = unwrapApiResponse(await res.json());
if (!fresh) return null;
const freshVariants: any[] | null =
Array.isArray(fresh.colorVariants) && fresh.colorVariants.length > 0
? fresh.colorVariants
: null;
if (freshVariants && colorName) {
const cv = freshVariants.find((v: any) => v.name === colorName);
if (!cv) return 0;
const inv = cv.sizeInventory || {};
if (selectedSize) return Math.max(0, Number(inv[selectedSize] ?? 0));
return Object.values(inv).reduce((s: number, q: any) => s + (Number(q) || 0), 0);
}
const inv = fresh.sizeInventory || {};
if (selectedSize && inv[selectedSize] !== undefined)
return Math.max(0, Number(inv[selectedSize] ?? 0));
return Math.max(0, Number(fresh.stockQuantity ?? 0));
} catch {
return null;
}
};

const handleAddToCart = async () => {
if (hasSizes && !selectedSize) {
toast({ title: t.product.selectSize, variant: "destructive" });
return;
}
if (hasMultipleColors && !activeVariant) {
toast({ title: t.product.selectColor, variant: "destructive" });
return;
}

/* Live check against the server; fall back to cached number on failure. */
const freshAvailable = await fetchFreshAvailable();
const effectiveAvailable = freshAvailable !== null ? freshAvailable : availableStock;
const effectiveRemaining = Math.max(0, effectiveAvailable - cartQtyForThis);

if (freshAvailable !== null && freshAvailable < availableStock) {
// Stock dropped since page load (e.g. sold at the shop POS) — refresh UI.
qc2.invalidateQueries({ queryKey: ["/api/products"] });
qc2.invalidateQueries({ queryKey: ["/api/products/:id", product.id] });
}

if (effectiveRemaining <= 0) {
const msg =
language === "ar"
? cartQtyForThis > 0
? `لديك ${cartQtyForThis} من هذا المنتج في السلة، الكمية المتاحة ${effectiveAvailable} فقط`
: "نفد المخزون"
: cartQtyForThis > 0
? `You already have ${cartQtyForThis} in your cart. Only ${effectiveAvailable} available.`
: "Out of stock";
toast({
title: language === "ar" ? "لا يمكن إضافة المزيد" : "Cannot add more",
description: msg,
variant: "destructive",
});
return;
}
const qtyToAdd = Math.min(quantity, effectiveRemaining);
addToCart(product as any, qtyToAdd, selectedSize, colorName);
trackProductEvent(product.id, "cart_add", user?.id ?? null);
toast({
title: t.product.addedToCart,
description: t.product.tapToViewCart,
icon: "cart",
onClick: () => navigate(`/cart?highlight=${encodeURIComponent(`${product.id}::${selectedSize || ""}::${colorName || ""}`)}`),
} as any);
};

// Derive the video item and its poster once
const videoItem = allMedia.find((m) => m.type === "video");
const videoPoster = videoItem ? ((videoItem as any).poster || getVideoPosterUrl(videoItem.url)) : undefined;

const safeIdx = selectedImageIdx < allMedia.length ? selectedImageIdx : 0;
const currentMedia = allMedia[safeIdx];
const isVideoSelected = currentMedia?.type === "video";
const mainImgBlurSrc = blurCloudinaryUrl(
currentMedia?.url || product.mainImage,
);

return (
<div className="min-h-screen flex flex-col pt-navbar">
<Navbar />
<main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8">
<div className="max-w-6xl mx-auto">
<div className="grid grid-cols-1 lg:grid-cols-[48%_52%] gap-6 sm:gap-10 lg:gap-8">
{/* ── Images + Video ── */}
<div ref={galleryColRef} className="flex flex-col gap-4">
<div className="flex gap-2 sm:gap-3 h-[62vh] min-h-[480px] max-h-[560px] sm:h-[620px] sm:max-h-none lg:h-[720px]">
{/* Desktop thumbnail strip */}
{allMedia.length > 1 && (
<div className="hidden sm:block relative sm:w-[100px] lg:w-[120px] flex-none h-full group/thumbstrip">
<div
ref={thumbsRef}
className="flex flex-col gap-2 overflow-y-auto h-full py-1 px-1 scrollbar-hide"
style={{
scrollbarWidth: "none",
msOverflowStyle: "none",
touchAction: "pan-y",
overscrollBehavior: "contain",
WebkitOverflowScrolling: "touch",
}}
onScroll={checkThumbsScroll}
>
{allMedia.map((item, idx) => (
<button
key={idx}
onClick={() => {
setSelectedImageIdx(idx);
setZoomPos(null);
}}
className={`group/thumb w-full aspect-[3/4] bg-white overflow-hidden flex-shrink-0 snap-start transition-all duration-200 rounded-xl relative ${
selectedImageIdx === idx
? "ring-2 ring-offset-1 ring-foreground scale-[0.97]"
: "hover:scale-[0.97]"
}`}
data-testid={`button-gallery-item-${idx}`}
>
{item.type === "video" ? (
// ── Thumbnail: poster image with play icon, no video element ──
<VideoPlayer
url={item.url}
poster={(item as any).poster || getVideoPosterUrl(item.url)}
isActive={false}
isThumbnail
/>
) : (
<ThumbImage src={item.url} alt={`${product.name} ${idx + 1}`} size={300} />
)}
<ProductWatermark size="thumb" />
</button>
))}
</div>

<div
className={`absolute top-0 inset-x-0 h-16 flex items-start justify-center pt-1 transition-opacity duration-200 pointer-events-none z-30 ${thumbsCanUp ? "opacity-100" : "opacity-0"}`}
>
<div className="absolute inset-0 bg-gradient-to-b from-background/80 to-transparent" />
<button
onClick={() => scrollThumbs("up")}
aria-label="Scroll thumbnails up"
className={`relative z-10 flex items-center justify-center h-8 w-8 rounded-full bg-black text-white ring-2 ring-white/90 shadow-lg transition-colors duration-200 hover:bg-black/80 active:scale-95 ${thumbsCanUp ? "pointer-events-auto" : "pointer-events-none"}`}
data-testid="button-thumb-scroll-up"
>
<ChevronUp className="w-4 h-4" strokeWidth={3} />
</button>
</div>

<div
className={`absolute bottom-0 inset-x-0 h-16 flex items-end justify-center pb-1 transition-opacity duration-200 pointer-events-none z-30 ${thumbsCanDown ? "opacity-100" : "opacity-0"}`}
>
<div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
<button
onClick={() => scrollThumbs("down")}
aria-label="Scroll thumbnails down"
className={`relative z-10 flex items-center justify-center h-8 w-8 rounded-full bg-black text-white ring-2 ring-white/90 shadow-lg transition-colors duration-200 hover:bg-black/80 active:scale-95 ${thumbsCanDown ? "pointer-events-auto" : "pointer-events-none"}`}
data-testid="button-thumb-scroll-down"
>
<ChevronDown className="w-4 h-4" strokeWidth={3} />
</button>
</div>
</div>
)}

{/* ── Main viewer ── */}
<div
className="flex-1 w-0 relative overflow-hidden rounded-2xl"
onTouchStart={handleTouchStart}
onTouchEnd={handleTouchEnd}
>
{/* Video — always mounted and playing in background.
Shown as overlay when its slide is selected. */}
{videoItem && (
<div
className={`absolute inset-0 transition-opacity duration-300 ${
isVideoSelected ? "opacity-100 z-10" : "opacity-0 z-0"
}`}
>
<VideoPlayer
url={videoItem.url}
poster={videoPoster}
isActive={true}
/>
<ProductWatermark size="sm" />
</div>
)}

{/* Image layer */}
<div
ref={imageLayerRef}
className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
isVideoSelected
? "opacity-0 z-0 pointer-events-none"
: "opacity-100 z-10"
}`}
>
{!zoomPos && mainImgBlurSrc && (
<img
src={mainImgBlurSrc}
aria-hidden
className={`absolute left-1/2 top-1/2 z-20 h-auto w-auto -translate-x-1/2 -translate-y-1/2 object-cover rounded-2xl pointer-events-none shadow-sm ring-1 ring-black/[0.06] transition-opacity duration-700
max-w-[calc(100%-1rem)] max-h-[calc(100%-1rem)]
sm:max-w-[calc(100%-1.5rem)] sm:max-h-[calc(100%-1.5rem)]
lg:max-w-[calc(100%-0.5rem)] lg:max-h-[calc(100%-0.5rem)]
${mainImgReady ? "opacity-0" : "opacity-100"}`}
/>
)}

{/* The real image keeps the same perfect size. */}
<img
ref={mainImageRef}
key={currentMedia?.url || product.mainImage}
src={
optimizeCloudinaryUrl(
currentMedia?.url ||
allMedia[0]?.url ||
product.mainImage,
1200,
) || product.mainImage
}
alt={product.name}
fetchpriority="high"
decoding="async"
width={800}
height={1067}
className={`block h-auto w-auto object-contain rounded-2xl shadow-sm ring-1 ring-black/[0.06] transition-opacity duration-150
max-w-[calc(100%-1rem)] max-h-[calc(100%-1rem)]
sm:max-w-[calc(100%-1.5rem)] sm:max-h-[calc(100%-1.5rem)]
lg:max-w-[calc(100%-0.5rem)] lg:max-h-[calc(100%-0.5rem)]
${zoomPos ? "opacity-0" : "opacity-100"}`}
data-testid="img-product-main"
onLoad={() => {
setMainImgReady(true);
// Measure again after layout settles so the overlay is
// always exactly the same size as the visible photo.
requestAnimationFrame(() => {
measureMainImage();
requestAnimationFrame(measureMainImage);
});
}}
onError={() => setMainImgReady(true)}
/>

{/* This transparent frame is measured from the rendered
image, so it has exactly the same size and position. */}
{!isVideoSelected && mainImageBox && (
<div
className="absolute overflow-hidden rounded-2xl"
style={{
left: mainImageBox.left,
top: mainImageBox.top,
width: mainImageBox.width,
height: mainImageBox.height,
cursor: zoomPos ? "crosshair" : "zoom-in",
}}
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
{zoomPos && (
<div
className="absolute inset-0 z-20"
style={{
backgroundImage: `url(${optimizeCloudinaryUrl(
currentMedia?.url ||
allMedia[0]?.url ||
product.mainImage,
1200,
)})`,
backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
backgroundSize: "225%",
backgroundRepeat: "no-repeat",
}}
/>
)}

{!zoomPos && <ProductWatermark size="sm" />}

{!zoomPos && (
<span className="hidden lg:flex absolute bottom-4 left-4 z-30 items-center justify-center w-9 h-9 rounded-full bg-black/75 shadow-md pointer-events-none">
<Plus
className="w-[18px] h-[18px] text-white"
strokeWidth={2.5}
/>
</span>
)}
</div>
)}
</div>

{/* Mobile swipe indicator dots */}
{allMedia.length > 1 && (
<div className="sm:hidden absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-20 pointer-events-none">
{allMedia.map((_, idx) => (
<span
key={idx}
className={`block rounded-full transition-all duration-300 ${
idx === safeIdx
? "w-4 h-1.5 bg-white"
: "w-1.5 h-1.5 bg-white/50"
}`}
/>
))}
</div>
)}
</div>
</div>

{/* Mobile thumbnail strip — dot-style replaced by swipe;
keep strip for explicit tap navigation but make it compact */}
{allMedia.length > 1 && (
<div
className="sm:hidden flex gap-2 overflow-x-auto py-1 px-0.5 scrollbar-hide scroll-smooth snap-x snap-proximity"
style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
>
{allMedia.map((item, idx) => (
<button
key={idx}
onClick={() => {
setSelectedImageIdx(idx);
setZoomPos(null);
}}
className={`group/thumb w-[80px] aspect-[3/4] bg-white overflow-hidden flex-shrink-0 snap-start transition-all duration-200 rounded-xl relative ${
selectedImageIdx === idx
? "ring-2 ring-offset-1 ring-foreground"
: "opacity-70"
}`}
data-testid={`button-gallery-item-mobile-${idx}`}
>
{item.type === "video" ? (
// Mobile thumbnail: poster image, no live video element
<VideoPlayer
url={item.url}
poster={(item as any).poster || getVideoPosterUrl(item.url)}
isActive={false}
isThumbnail
/>
) : (
<ThumbImage src={item.url} alt={`${product.name} ${idx + 1}`} size={120} />
)}
</button>
))}
</div>
)}
</div>

{/* ── Mobile-only color strip ── */}
{hasMultipleColors && (
<div className="md:hidden px-4 pt-3 pb-1 border-t border-border">
<div className="flex items-center gap-2 mb-2">
<span className="text-xs font-semibold uppercase tracking-widest">
{t.product.color}:
</span>
<span className="text-xs text-muted-foreground">
{translateColorName(activeVariant.name, isAr ? "ar" : "en")}
</span>
</div>
<div className="flex flex-wrap gap-2.5 pb-1">
{variants.map((v, idx) => (
<button
key={idx}
onClick={() => setSelectedColorIdx(idx)}
className={`relative w-10 h-10 rounded-full border-2 transition-all duration-200 overflow-hidden flex-shrink-0 ${
selectedColorIdx === idx
? "border-primary scale-110 shadow-lg ring-2 ring-primary/20"
: "border-border hover:border-primary/60"
}`}
title={translateColorName(v.name, isAr ? "ar" : "en")}
data-testid={`button-color-swatch-mobile-${idx}`}
>
{v.mainImage ? (
<img
src={
optimizeCloudinaryUrl(v.mainImage, 80) ||
v.mainImage
}
alt={v.name}
width={40}
height={40}
loading="lazy"
decoding="async"
className="w-full h-full object-cover"
draggable={false}
/>
) : (
<span className="flex w-full h-full">
<span
className="h-full flex-1"
style={{ backgroundColor: v.colorCode }}
/>
</span>
)}
{selectedColorIdx === idx && (
<span className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-full">
<Check className="w-3.5 h-3.5 text-white drop-shadow-md" />
</span>
)}
</button>
))}
</div>
</div>
)}

{/* ── Info panel ── */}
<div
ref={infoPanelRef}
className="flex flex-col pt-4 sm:pt-8 lg:pt-0 lg:sticky lg:top-28 h-fit"
>
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
className="font-semibold"
style={{ color: "#9B1C1C" }}
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
<span
className="text-xs uppercase tracking-widest text-white px-2 py-1"
style={{ backgroundColor: "#9B1C1C" }}
>
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

{/* Colors — desktop */}
{hasMultipleColors && (
<div className="hidden md:block mb-8">
<span className="block text-sm font-semibold uppercase tracking-widest mb-3">
{t.product.color}:{" "}
<span className="text-muted-foreground font-normal ms-2">
{translateColorName(
activeVariant.name,
isAr ? "ar" : "en",
)}
</span>
</span>
<div className="flex flex-wrap gap-3">
{variants.map((v, idx) => (
<button
key={idx}
onClick={() => setSelectedColorIdx(idx)}
className={`relative w-14 h-14 rounded-full border-2 transition-all duration-200 overflow-hidden flex-shrink-0 ${
selectedColorIdx === idx
? "border-primary scale-110 shadow-lg ring-2 ring-primary/20"
: "border-border hover:border-primary/60 hover:scale-105"
}`}
title={translateColorName(v.name, isAr ? "ar" : "en")}
data-testid={`button-color-swatch-${idx}`}
>
{v.mainImage ? (
<img
src={
optimizeCloudinaryUrl(v.mainImage, 80) ||
v.mainImage
}
alt={v.name}
width={44}
height={44}
loading="lazy"
decoding="async"
className="w-full h-full object-cover"
draggable={false}
/>
) : (
<span className="flex w-full h-full">
<span
className="h-full flex-1"
style={{ backgroundColor: v.colorCode }}
/>
</span>
)}
{selectedColorIdx === idx && (
<span className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-full">
<Check className="w-4 h-4 text-white drop-shadow-md" />
</span>
)}
</button>
))}
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
className={`relative min-w-14 h-14 px-4 flex flex-col items-center justify-center border transition-all ${
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
<span className="text-base leading-none">{size}</span>
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
<div
className="flex items-center gap-2 text-xs text-muted-foreground mb-4 ps-0.5"
data-testid="text-select-size-prompt"
>
<span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
{t.product.selectSizePrompt}
</div>
)}

{selectedSize &&
sizeInv[selectedSize] !== undefined &&
sizeInv[selectedSize] >= 1 &&
sizeInv[selectedSize] <= 2 && (
<div
className="flex items-center gap-2 text-xs font-medium text-foreground/80 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-700/50 px-3 py-2 rounded-xl mb-4"
data-testid="text-low-stock-urgency"
>
<span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0 animate-pulse" />
{isAr
? `متبقي ${sizeInv[selectedSize]} ${sizeInv[selectedSize] === 1 ? "قطعة" : "قطع"} فقط بمقاس ${selectedSize} - ينفد بسرعة!`
: `Only ${sizeInv[selectedSize]} left in size ${selectedSize} — selling fast!`}
</div>
)}

{/* Qty + Add to cart — min 44px touch targets */}
<div className="flex items-center gap-2.5 mb-4">
<div className="flex items-center border border-border rounded-full overflow-hidden bg-background shrink-0">
<button
onClick={() => setQuantity(Math.max(1, quantity - 1))}
disabled={!canAdd}
className="w-12 h-14 flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
data-testid="button-qty-minus"
>
<Minus className="w-3.5 h-3.5" />
</button>
<span
className="w-8 text-center text-sm font-semibold select-none"
data-testid="text-quantity"
>
{quantity}
</span>
<button
onClick={() =>
setQuantity(Math.min(remainingStock, quantity + 1))
}
disabled={!canAdd || quantity >= remainingStock}
className="w-12 h-14 flex items-center justify-center hover:bg-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
data-testid="button-qty-plus"
>
<Plus className="w-3.5 h-3.5" />
</button>
</div>

<Button
onClick={handleAddToCart}
className="flex-1 h-14 rounded-full uppercase tracking-widest text-xs sm:text-sm font-semibold gap-2 shadow-sm"
disabled={!canAdd}
data-testid="button-add-to-cart"
>
{canAdd ? (
<>
<ShoppingBag className="w-4 h-4 shrink-0" />
{t.product.addToCart}
</>
) : hasSizes && !selectedSize ? (
t.product.selectSize
) : cartQtyForThis > 0 &&
availableStock > 0 &&
remainingStock === 0 ? (
language === "ar" ? (
`الحد الأقصى (${cartQtyForThis})`
) : (
`Max in cart (${cartQtyForThis})`
)
) : (
t.product.outOfStock
)}
</Button>
</div>

<div className="flex items-center gap-2">
{product && (
<button
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
className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-full border text-xs sm:text-sm font-medium uppercase tracking-widest transition-all duration-200 ${
isWishlisted(product.id)
? "border-rose-400 text-rose-500 bg-rose-50 dark:bg-rose-950/30"
: "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
}`}
data-testid="button-wishlist-product"
>
<Heart
className={`w-4 h-4 shrink-0 transition-all duration-200 ${isWishlisted(product.id) ? "fill-rose-500 stroke-rose-500" : "fill-transparent"}`}
strokeWidth={1.5}
/>
{isWishlisted(product.id)
? t.wishlist.removeFromWishlist
: t.wishlist.addToWishlist}
</button>
)}

<button
onClick={() => {
if (navigator.share) {
navigator
.share({
title: product?.name || "",
url: window.location.href,
})
.catch(() => {});
} else {
navigator.clipboard
.writeText(window.location.href)
.then(() => {
setShareCopied(true);
setTimeout(() => setShareCopied(false), 2500);
});
}
}}
className={`w-14 h-14 rounded-full border flex items-center justify-center transition-all shrink-0 ${
shareCopied
? "border-green-500 text-green-600 bg-green-50"
: "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
}`}
title={isAr ? "مشاركة" : "Share"}
data-testid="button-share"
>
{shareCopied ? (
<Check className="w-4 h-4" />
) : navigator.share ? (
<Share className="w-4 h-4" />
) : (
<Link2 className="w-4 h-4" />
)}
</button>
</div>

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
<span className="flex items-center gap-1.5 text-muted-foreground">
<Truck className="w-3.5 h-3.5 flex-shrink-0" />
{t.product.shipping}
</span>
<span>{t.product.freeDelivery}</span>
</div>
</div>
</div>
</div>

{isSoldOut && similarProducts.length > 0 && (
<RelatedProductsSlider
products={similarProducts}
title={isAr ? "منتجات مشابهة" : "Similar Products"}
accent={
isAr
? "متاحة الآن · نفس الفئة والألوان"
: "Available Now · Same Category & Style"
}
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

<FindMySizeDialog
open={showFindMySize}
onClose={() => setShowFindMySize(false)}
mode={findMySizeMode}
language={language}
productSizes={sizes}
onSizePicked={(size) => {
setSavedHighlight(size);
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
