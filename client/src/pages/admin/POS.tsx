import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import JsBarcode from "jsbarcode";
import { format, startOfMonth, endOfMonth, parse, isValid } from "date-fns";
import { ar as arLocale, enUS } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProducts } from "@/hooks/use-products";
import { useAuth } from "@/hooks/use-auth";
import {
  Barcode,
  Search,
  Plus,
  Minus,
  Printer,
  X,
  Receipt,
  Banknote,
  CreditCard,
  Star,
  Tag,
  BarChart3,
  ShoppingCart,
  Package,
  RefreshCw,
  Percent,
  Hash,
  Check,
  Eye,
  Clock,
  CalendarDays,
  Calendar as CalendarIcon,
  Undo2,
  PauseCircle,
  PlayCircle,
  Download,
  FileSpreadsheet,
  Split,
  Filter,
  AlertTriangle,
  ArrowLeftRight,
  ShieldAlert,
  Ban,
  Monitor,
  Maximize2,
  Minimize2,
  Trash2,
  Keyboard,
  ChevronDown,
  Delete,
  Footprints,
  Layers,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import ExcelJS from "exceljs";
import type { Product, Category, ColorVariant, Subcategory } from "@shared/schema";
import { optimizeCloudinaryUrl, sortSizes } from "@/lib/utils";
import { useSiteSettings } from "@/hooks/use-site-settings";

/* ── POS product image with blur-up placeholder (same pattern as home page) */
const PosProductImage = memo(function PosProductImage({
  src,
  alt,
  isSoldOut,
  priority,
}: {
  src: string;
  alt: string;
  isSoldOut: boolean;
  priority: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const optimized = optimizeCloudinaryUrl(src, 400) || src;

  return (
    <div className="relative w-full h-full">
      {/* Lightweight CSS shimmer placeholder — no extra image download.
          (Previously each card fetched its own tiny blurred image, which added
          one network request per product and slowed the POS grid.) Hidden once
          the real image is ready or has failed. */}
      {!failed && (
        <div
          className={`absolute inset-0 bg-muted pointer-events-none transition-opacity duration-300 ${ready ? "opacity-0" : "animate-pulse opacity-100"}`}
        />
      )}
      {/* Full optimized image — fades in once loaded (instant if preloaded) */}
      <img
        src={optimized}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchpriority={priority ? "high" : "low"}
        decoding="async"
        className={`w-full h-full object-cover transition-opacity duration-500 ${isSoldOut ? "grayscale" : ""} ${ready ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setReady(true)}
        onError={(e) => {
          // The real photo is missing or failed to load. Swap to a clean
          // placeholder and hide the shimmer so the card never sits blank.
          const img = e.currentTarget;
          if (img.src.indexOf("/placeholder-product.svg") === -1) {
            img.src = "/placeholder-product.svg";
          }
          setFailed(true);
          setReady(true);
        }}
      />
    </div>
  );
});

/* ── Interfaces ────────────────────────────────────────────────────────── */
interface PosCartItem {
  product: Product;
  quantity: number;
  size?: string;
  color?: string;
  unitPrice: number;
  // True when this size was picked from the POS "not in inventory yet"
  // hint instead of the product's real tracked sizes — lets the cart row
  // and the checkout payload flag it so the server creates the size and
  // nets its stock to 0 instead of rejecting the sale for insufficient stock.
  isNewSize?: boolean;
}
interface ExchangeReplacementItem {
  product: Product;
  quantity: number;
  size?: string;
  color?: string;
  unitPrice: number;
}

interface HeldCart {
  id: number;
  cart: PosCartItem[];
  discountType: "percent" | "fixed";
  discountValue: string;
  note: string;
  time: Date;
}
interface CompletedOrder {
  id: number;
  items: PosCartItem[];
  subtotal: number;
  discountAmount: number;
  total: number;
  date: Date;
  cashReceived: number;
  cardReceived: number;
  change: number;
  paymentMethod: "cash" | "card" | "split";
  note: string;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */
function getProductImage(product: Product, color?: string): string {
  const cv = (product.colorVariants as ColorVariant[] | undefined) || [];
  if (cv.length > 0 && color) {
    const v = cv.find((c) => c.name === color);
    if (v?.mainImage) return v.mainImage;
  }
  return product.mainImage || "";
}
// Suggests sizes the product doesn't have configured yet, so the cashier
// can still sell a size a walk-in customer wants even though it was never
// added in the admin panel — e.g. sizes S/M present suggests L, XL, XXL;
// numeric sizes 36-39 present suggests 40, 41, 42. Mirrors the same logic
// used for the "quick add size" hints in the Products admin page.
const POS_LETTER_SIZE_SEQUENCE = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];
function getPosSizeHints(existingSizes: string[]): string[] {
  const existing = new Set(existingSizes.map((s) => s.trim().toUpperCase()));
  const letterMatches = existingSizes
    .map((s) => s.trim().toUpperCase())
    .filter((s) => POS_LETTER_SIZE_SEQUENCE.includes(s));

  if (letterMatches.length > 0) {
    const maxIdx = Math.max(
      ...letterMatches.map((s) => POS_LETTER_SIZE_SEQUENCE.indexOf(s)),
    );
    const suggestions: string[] = [];
    for (
      let i = maxIdx + 1;
      i < POS_LETTER_SIZE_SEQUENCE.length && suggestions.length < 3;
      i++
    ) {
      if (!existing.has(POS_LETTER_SIZE_SEQUENCE[i]))
        suggestions.push(POS_LETTER_SIZE_SEQUENCE[i]);
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

// Safety ceiling on how many units a cashier can sell of a size that was
// never actually counted into inventory — keeps a fat-fingered quantity
// from silently creating an implausible "sold" count.
const POS_NEW_SIZE_MAX_QTY = 10;

function escHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Renders a barcode straight to a detached SVG element via the JsBarcode
// library already bundled with the app, then returns its markup as a
// string. Because this runs synchronously in the cashier's own browser
// (not inside the print window), it never depends on network access or a
// CDN script finishing in time — important for the Electron silent-print
// path, which can't wait around for an external script tag to load.
function renderBarcodeSvg(
  value: string,
  opts: { height?: number; width?: number; fontSize?: number } = {},
): string {
  try {
    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svgEl, value, {
      format: "CODE128",
      width: opts.width ?? 1.8,
      height: opts.height ?? 42,
      displayValue: true,
      fontSize: opts.fontSize ?? 12,
      fontOptions: "bold",
      textMargin: 4,
      margin: 2,
      background: "#ffffff",
      lineColor: "#000000",
    });
    return svgEl.outerHTML;
  } catch {
    return `<div style="font-size:16px;font-weight:800;letter-spacing:3px;">${escHtml(value)}</div>`;
  }
}

// Shared with the receipt printer below — an order is an exchange invoice
// when its note carries the exchange summary header written by processExchange().
function isExchangeOrder(note: string | null | undefined): boolean {
  return !!note && (note.includes("فاتورة تبديل") || note.includes("EXCHANGE INVOICE"));
}

function getPosOrderLineSubtotal(order: any): number {
  return (order.items || []).reduce(
    (s: number, it: any) => s + parseFloat(it.price || 0) * (it.quantity || 1),
    0,
  );
}

function getPosOrderStoredSubtotal(order: any): number {
  const stored = parseFloat(order.subtotal_amount ?? order.subtotalAmount ?? 0);
  if (stored > 0) return stored;
  return getPosOrderLineSubtotal(order);
}

function getPosOrderDiscount(order: any): number {
  const stored = parseFloat(order.discount_amount ?? order.discountAmount ?? 0);
  if (stored > 0) return stored;
  const lineSub = getPosOrderLineSubtotal(order);
  const total = parseFloat(order.total_amount ?? order.totalAmount ?? 0);
  const method = order.payment_method || order.paymentMethod || "cash";
  const cash = parseFloat(order.cash_amount ?? order.cashAmount ?? 0) || 0;
  const card = parseFloat(order.card_amount ?? order.cardAmount ?? 0) || 0;
  if (method === "card" && card > 0 && card < lineSub - 0.005) return lineSub - card;
  if (method === "split" && cash + card > 0 && cash + card < lineSub - 0.005) {
    return lineSub - (cash + card);
  }
  if (total < lineSub - 0.005) return lineSub - total;
  return 0;
}

function getPosOrderTotal(order: any): number {
  const lineSub = getPosOrderLineSubtotal(order);
  const discount = getPosOrderDiscount(order);
  const storedTotal = parseFloat(order.total_amount ?? order.totalAmount ?? 0);
  const method = order.payment_method || order.paymentMethod || "cash";
  const cash = parseFloat(order.cash_amount ?? order.cashAmount ?? 0) || 0;
  const card = parseFloat(order.card_amount ?? order.cardAmount ?? 0) || 0;

  if (discount > 0) {
    if (Math.abs(storedTotal - lineSub) < 0.01) {
      return Math.max(0, lineSub - discount);
    }
    return storedTotal;
  }
  if (method === "card" && card > 0) return card;
  if (method === "split" && cash + card > 0) return cash + card;
  return storedTotal;
}

function getPosOrderPaymentSplit(order: any): { cash: number; card: number } {
  const total = getPosOrderTotal(order);
  const method = order.payment_method || order.paymentMethod || "cash";
  const cash = parseFloat(order.cash_amount ?? order.cashAmount ?? 0) || 0;
  const card = parseFloat(order.card_amount ?? order.cardAmount ?? 0) || 0;
  if (method === "cash") return { cash: total, card: 0 };
  if (method === "card") return { cash: 0, card: total };
  if (method === "split" && cash + card > 0) return { cash, card };
  return { cash: total, card: 0 };
}

// Only invoices that actually include a card payment can be marked as
// "Transferred" in the admin POS report. Cash-only invoices are never
// eligible; split invoices remain eligible when they contain a card amount.
function canMarkPosOrderTransferred(order: any): boolean {
  const method = String(order.payment_method || order.paymentMethod || "cash").toLowerCase();
  if (method === "card") return true;
  if (method !== "split") return false;
  const card = parseFloat(order.card_amount ?? order.cardAmount ?? 0) || 0;
  return card > 0;
}

function getPosOrderScopedRevenue(
  order: any,
  scope: "all" | "shoes" | "other",
  shoeCategoryIds: Set<number>,
  productCategoryById: Map<number, number>,
): number {
  const total = getPosOrderTotal(order);
  if (scope === "all") return total;
  const items = order.items || [];
  let shoesSub = 0;
  let allSub = 0;
  for (const it of items) {
    const line = parseFloat(it.price || 0) * (it.quantity || 1);
    allSub += line;
    const catId = productCategoryById.get(it.productId);
    if (catId !== undefined && shoeCategoryIds.has(catId)) shoesSub += line;
  }
  if (allSub <= 0) {
    const isShoe = items.some((it: any) => {
      const catId = productCategoryById.get(it.productId);
      return catId !== undefined && shoeCategoryIds.has(catId);
    });
    if (scope === "shoes") return isShoe ? total : 0;
    return isShoe ? 0 : total;
  }
  const shoesShare = shoesSub / allSub;
  // "other" = all non-shoe categories combined (not just clothes)
  return scope === "shoes" ? total * shoesShare : total * (1 - shoesShare);
}

function isPosShoeLineItem(
  it: any,
  shoeCategoryIds: Set<number>,
  productCategoryById: Map<number, number>,
): boolean {
  const catId = productCategoryById.get(it.productId);
  return catId !== undefined && shoeCategoryIds.has(catId);
}

function orderHasShoeItems(
  order: any,
  shoeCategoryIds: Set<number>,
  productCategoryById: Map<number, number>,
): boolean {
  return (order.items || []).some((it: any) =>
    isPosShoeLineItem(it, shoeCategoryIds, productCategoryById),
  );
}

function orderHasNonShoeItems(
  order: any,
  shoeCategoryIds: Set<number>,
  productCategoryById: Map<number, number>,
): boolean {
  // Any line item that is not in the shoes category — dresses, bags, etc.
  return (order.items || []).some(
    (it: any) => !isPosShoeLineItem(it, shoeCategoryIds, productCategoryById),
  );
}

function orderMatchesShiftScope(
  order: any,
  scope: "all" | "shoes" | "other",
  shoeCategoryIds: Set<number>,
  productCategoryById: Map<number, number>,
): boolean {
  if (scope === "all") return true;
  if (scope === "shoes") {
    return orderHasShoeItems(order, shoeCategoryIds, productCategoryById);
  }
  // "other" = every category except shoes
  return orderHasNonShoeItems(order, shoeCategoryIds, productCategoryById);
}

function getPosOrderScopedDiscount(
  order: any,
  scope: "all" | "shoes" | "other",
  shoeCategoryIds: Set<number>,
  productCategoryById: Map<number, number>,
): number {
  const discount = getPosOrderDiscount(order);
  if (discount <= 0 || scope === "all") return discount;
  const total = getPosOrderTotal(order);
  if (total <= 0) return 0;
  const scoped = getPosOrderScopedRevenue(
    order,
    scope,
    shoeCategoryIds,
    productCategoryById,
  );
  return discount * (scoped / total);
}

function countPosOrderScopedItems(
  order: any,
  scope: "all" | "shoes" | "other",
  shoeCategoryIds: Set<number>,
  productCategoryById: Map<number, number>,
): number {
  const items = order.items || [];
  if (scope === "all") {
    return items.reduce((s: number, it: any) => s + (it.quantity || 1), 0);
  }
  return items.reduce((s: number, it: any) => {
    const catId = productCategoryById.get(it.productId);
    const isShoe = catId !== undefined && shoeCategoryIds.has(catId);
    if (scope === "shoes" && !isShoe) return s;
    if (scope === "other" && isShoe) return s;
    return s + (it.quantity || 1);
  }, 0);
}

type PosDateFilterPreset = "today" | "week" | "month" | "all" | "custom";

function orderMatchesPosDateFilter(
  order: any,
  filter: PosDateFilterPreset,
  todayStr: string,
  customRange: { from?: Date; to?: Date },
): boolean {
  const raw = order.created_at || order.createdAt;
  if (!raw) return filter === "all";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return false;
  const ds = format(d, "yyyy-MM-dd");
  const now = new Date();

  if (filter === "today") return ds === todayStr;
  if (filter === "week") return now.getTime() - d.getTime() < 7 * 86400000;
  if (filter === "month") {
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  }
  if (filter === "custom") {
    if (!customRange.from) return false;
    const from = format(customRange.from, "yyyy-MM-dd");
    const to = format(customRange.to ?? customRange.from, "yyyy-MM-dd");
    return ds >= from && ds <= to;
  }
  return true;
}

function formatPosCustomRangeLabel(
  range: { from?: Date; to?: Date },
  locale: typeof arLocale | typeof enUS,
): string {
  if (!range.from) return "";
  const from = range.from;
  const to = range.to ?? range.from;
  if (format(from, "yyyy-MM-dd") === format(to, "yyyy-MM-dd")) {
    return format(from, "d MMM yyyy", { locale });
  }
  const isWholeMonth =
    format(from, "d") === "1" &&
    format(from, "yyyy-MM") === format(to, "yyyy-MM") &&
    format(to, "d") === format(endOfMonth(from), "d");
  if (isWholeMonth) return format(from, "MMMM yyyy", { locale });
  return `${format(from, "d MMM yyyy", { locale })} – ${format(to, "d MMM yyyy", { locale })}`;
}

let heldIdCounter = 1;

/* ═══════════════════════════════════════════════════════════════════════ */
/* ── Add-to-cart sound (generated tone, no audio file needed) ─────────── */
// One shared context for the whole session — creating a brand-new
// AudioContext on every single add-to-cart click (and relying on cleanup
// to close it) is unreliable over a full shift of hundreds of scans;
// Chromium/Electron caps how many can exist at once, and any missed
// cleanup leaks one permanently. A single reused context has no such limit.
let sharedAudioCtx: AudioContext | null = null;
function getSharedAudioCtx(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return null;
      sharedAudioCtx = new Ctx();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}
function playAddToCartSound() {
  try {
    const ctx = getSharedAudioCtx();
    if (!ctx) return;
    // Browsers suspend audio contexts until a user gesture; a click that
    // adds to cart IS that gesture, so resume defensively every time.
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.09);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
    // Nodes disconnect/GC themselves after stop() — no per-call teardown needed.
  } catch {
    // Ignore audio failures (e.g. autoplay restrictions) — never block the cart action.
  }
}

/* ── On-screen touch keyboard ──────────────────────────────────────────
   Kiosk/touchscreen POS hardware often can't auto-invoke the Windows/OS
   on-screen keyboard for a packaged Electron app, so tapping a field does
   nothing. This renders our own keyboard the instant any text field gets
   focus — no separate keyboard icon to hunt for first. Fullscreen/kiosk
   sizing is completely untouched; this only adds a floating bottom panel. */
function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  // Dispatching a real "input" event is what makes React's onChange (and
  // therefore controlled state) pick up the programmatic change.
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const OSK_NUMBER_ROW = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const OSK_ROWS_EN = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];
const OSK_ROWS_AR = [
  ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج"],
  ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ة"],
  ["ء", "ظ", "ط", "ذ", "د", "ز", "ر", "و", "ى"],
];

function OnScreenKeyboard({
  targetEl,
  ar,
  onClose,
  containerRef,
}: {
  targetEl: HTMLInputElement | HTMLTextAreaElement;
  ar: boolean;
  onClose: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const [layout, setLayout] = useState<"en" | "ar">(ar ? "ar" : "en");
  const [shift, setShift] = useState(false);

  const typeText = (text: string) => {
    const el = targetEl;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    setNativeInputValue(el, next);
    const pos = start + text.length;
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(pos, pos);
      } catch {}
    });
    if (shift) setShift(false);
  };

  const backspace = () => {
    const el = targetEl;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    let next: string;
    let pos: number;
    if (start !== end) {
      next = el.value.slice(0, start) + el.value.slice(end);
      pos = start;
    } else if (start > 0) {
      next = el.value.slice(0, start - 1) + el.value.slice(start);
      pos = start - 1;
    } else {
      return;
    }
    setNativeInputValue(el, next);
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(pos, pos);
      } catch {}
    });
  };

  const pressEnter = () => {
    const el = targetEl;
    // Real KeyboardEvent so every existing onKeyDown={...Enter...} handler
    // (exchange search, etc.) fires exactly as if a physical Enter key had
    // been pressed.
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }),
    );
    el.dispatchEvent(
      new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }),
    );
    if (el.tagName === "TEXTAREA") {
      typeText("\n");
    } else {
      // Enter means "done" for a single-line field — close the keyboard
      // instead of leaving it sitting open over the screen.
      onClose();
    }
  };

  const rows = layout === "ar" ? OSK_ROWS_AR : OSK_ROWS_EN;
  const keyBtn =
    "h-12 min-w-[34px] flex-1 rounded-lg bg-white/70 dark:bg-neutral-700/60 backdrop-blur-sm border border-white/60 dark:border-white/10 shadow-sm text-base font-medium active:bg-white/90 dark:active:bg-neutral-700/90 flex items-center justify-center select-none";

  // Prevent every tap on the keyboard from stealing focus away from the
  // field being typed into — this is what keeps the cursor/selection alive.
  const holdFocus = (e: React.MouseEvent | React.TouchEvent) => e.preventDefault();

  return (
    // Outer layer only centers/positions the panel — it doesn't intercept
    // clicks itself, so tapping the cart/products peeking out around the
    // floating keyboard still works normally.
    <div className="fixed inset-x-0 bottom-6 z-[200] flex justify-center px-2 pointer-events-none">
      <div
        ref={containerRef}
        onMouseDown={holdFocus}
        data-testid="onscreen-keyboard"
        className="pointer-events-auto w-full max-w-xl rounded-2xl border border-white/40 dark:border-white/10 bg-white/25 dark:bg-neutral-900/35 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] px-2.5 pt-2 pb-2.5"
      >
        <div className="flex items-center justify-between mb-1 px-1">
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={holdFocus}
            onClick={() => setLayout((l) => (l === "ar" ? "en" : "ar"))}
            className="text-xs font-semibold px-2.5 py-1 rounded-md bg-white/70 dark:bg-neutral-700/60 backdrop-blur-sm border border-white/60 dark:border-white/10"
            data-testid="button-osk-lang"
          >
            {layout === "ar" ? "EN" : "ع"}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={holdFocus}
            onClick={onClose}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-white/70 dark:bg-neutral-700/60 backdrop-blur-sm border border-white/60 dark:border-white/10 text-muted-foreground"
            data-testid="button-osk-close"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            {ar ? "إخفاء" : "Hide"}
          </button>
        </div>

        {/* Numbers always stay Western digits (1 2 3…), never Arabic-Indic,
            regardless of which letter layout is active. */}
        <div className="flex gap-1 mb-1 justify-center" dir="ltr">
          {OSK_NUMBER_ROW.map((k) => (
            <button
              key={k}
              type="button"
              tabIndex={-1}
              onMouseDown={holdFocus}
              onClick={() => typeText(k)}
              className={keyBtn}
            >
              {k}
            </button>
          ))}
        </div>

        <div dir="ltr">
          {rows.map((row, ri) => (
            <div key={ri} className="flex gap-1 mb-1 justify-center">
              {row.map((k) => {
                const label = layout === "en" && shift ? k.toUpperCase() : k;
                return (
                  <button
                    key={k}
                    type="button"
                    tabIndex={-1}
                    onMouseDown={holdFocus}
                    onClick={() => typeText(label)}
                    className={keyBtn}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ))}

          <div className="flex gap-1 mb-1 justify-center">
            {[".", ",", "-", "@"].map((sym) => (
              <button
                key={sym}
                type="button"
                tabIndex={-1}
                onMouseDown={holdFocus}
                onClick={() => typeText(sym)}
                className={keyBtn}
              >
                {sym}
              </button>
            ))}
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={holdFocus}
              onClick={backspace}
              className={keyBtn}
              data-testid="button-osk-backspace"
            >
              <Delete className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-1">
            {layout === "en" && (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={holdFocus}
                onClick={() => setShift((s) => !s)}
                className={`${keyBtn} !flex-[1.4] ${shift ? "!bg-foreground/90 !text-background" : ""}`}
                data-testid="button-osk-shift"
              >
                ⇧
              </button>
            )}
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={holdFocus}
              onClick={() => typeText("/")}
              className={`${keyBtn} !flex-[1.4]`}
              data-testid="button-osk-slash"
            >
              /
            </button>
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={holdFocus}
              onClick={() => typeText(" ")}
              className={`${keyBtn} !flex-[4]`}
              data-testid="button-osk-space"
            >
              {ar ? "مسافة" : "space"}
            </button>
            {/* Bigger, taller, solid Enter key — the primary "done" action,
                so it should stand out clearly from the rest of the keys. */}
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={holdFocus}
              onClick={pressEnter}
              className="!h-14 flex-[2.4] rounded-lg bg-foreground text-background text-base font-bold shadow-md active:opacity-80 flex items-center justify-center select-none"
              data-testid="button-osk-enter"
            >
              {ar ? "إدخال" : "Enter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PosReportDateFilterProps {
  ar: boolean;
  dateFilter: PosDateFilterPreset;
  customDateRange: { from?: Date; to?: Date };
  onApply: (
    filter: PosDateFilterPreset,
    range?: { from?: Date; to?: Date },
  ) => void;
}

function PosReportDateFilter({
  ar,
  dateFilter,
  customDateRange,
  onApply,
}: PosReportDateFilterProps) {
  const locale = ar ? arLocale : enUS;
  const [open, setOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>();
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  useEffect(() => {
    if (!open) return;
    const from = customDateRange.from;
    const to = customDateRange.to ?? customDateRange.from;
    setPendingRange(from ? { from, to } : undefined);
    setFromInput(from ? format(from, "yyyy-MM-dd") : "");
    setToInput(to ? format(to, "yyyy-MM-dd") : "");
    setCalendarMonth(from ?? new Date());
  }, [open, customDateRange]);

  const applyMonth = (monthDate: Date) => {
    onApply("custom", {
      from: startOfMonth(monthDate),
      to: endOfMonth(monthDate),
    });
    setOpen(false);
  };

  const syncInputsFromRange = (range?: DateRange) => {
    setPendingRange(range);
    if (range?.from) setFromInput(format(range.from, "yyyy-MM-dd"));
    else setFromInput("");
    if (range?.to) setToInput(format(range.to, "yyyy-MM-dd"));
    else if (range?.from) setToInput(format(range.from, "yyyy-MM-dd"));
    else setToInput("");
  };

  const applyManualRange = () => {
    const parsedFrom = fromInput
      ? parse(fromInput, "yyyy-MM-dd", new Date())
      : undefined;
    const parsedTo = toInput
      ? parse(toInput, "yyyy-MM-dd", new Date())
      : parsedFrom;
    if (!parsedFrom || !isValid(parsedFrom)) return;
 
