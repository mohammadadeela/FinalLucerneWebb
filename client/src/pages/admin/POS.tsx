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

type ParsedExchangeNoteItem = {
  name: string;
  productId?: number;
  quantity: number;
  size?: string;
  color?: string;
  lineTotal?: number;
};

type ParsedExchangeNote = {
  originalInvoiceId?: number;
  returnedItems: ParsedExchangeNoteItem[];
  replacementItems: ParsedExchangeNoteItem[];
  returnCredit?: number;
  replacementTotal?: number;
  priceDifference?: number;
  priceDifferenceDirection: "customer_pays" | "refund" | "none";
};

function parseExchangeMoneyValue(note: string, labelPattern: RegExp): number | undefined {
  const match = note.match(labelPattern);
  const value = match?.[1] ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

function parseExchangeNoteItemLine(line: string): ParsedExchangeNoteItem | null {
  const lineMatch = line.match(/^\s*[•\-]\s*(.*?)\s+×\s+(\d+)\s+—\s*₪?([\d.]+)/);
  if (!lineMatch) return null;

  let descriptor = String(lineMatch[1] || "").trim();
  const quantity = Math.max(0, Number(lineMatch[2]) || 0);
  const lineTotal = Number(lineMatch[3]);
  if (!descriptor || quantity <= 0) return null;

  const idMatch = descriptor.match(/\[(?:\s*(?:ID|id|Product ID|رقم المنتج)\s*[:#]?\s*(\d+)\s*)\]/i);
  const productId = idMatch?.[1] ? Number(idMatch[1]) : undefined;
  if (idMatch) {
    descriptor = descriptor.replace(idMatch[0], "").trim();
  }

  const descriptorMatch = descriptor.match(/^(.*?)(?:\s+\((.*?)\))?$/);
  const name = String(descriptorMatch?.[1] || descriptor).trim();
  const variantParts = String(descriptorMatch?.[2] || "")
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    name,
    productId,
    quantity,
    size: variantParts[0] || undefined,
    color: variantParts[1] || undefined,
    lineTotal: Number.isFinite(lineTotal) ? lineTotal : undefined,
  };
}

function parseExchangeInvoiceNote(note: string | null | undefined): ParsedExchangeNote | null {
  if (!isExchangeOrder(note)) return null;
  const safeNote = String(note || "");
  const originalInvoiceId = Number(
    safeNote.match(/(?:الفاتورة الأصلية|Original invoice)\s*:\s*#?(\d+)/i)?.[1] || 0,
  ) || undefined;

  const getSectionItems = (sectionPattern: RegExp): ParsedExchangeNoteItem[] => {
    const sectionText = safeNote.match(sectionPattern)?.[1] || "";
    return sectionText
      .split(/\r?\n/)
      .map((line) => parseExchangeNoteItemLine(line))
      .filter((item): item is ParsedExchangeNoteItem => !!item);
  };

  const returnedItems = getSectionItems(
    /(?:القطع المرتجعة|Returned items)\s*:\s*\n([\s\S]*?)(?=\n(?:رصيد المرتجع|Return credit)\s*:|$)/i,
  );
  const replacementItems = getSectionItems(
    /(?:القطع البديلة|Replacement items)\s*:\s*\n([\s\S]*?)(?=\n(?:إجمالي القطع البديلة|Replacement total)\s*:|$)/i,
  );

  const returnCredit = parseExchangeMoneyValue(
    safeNote,
    /(?:رصيد المرتجع|Return credit)\s*:\s*₪?([\d.]+)/i,
  );
  const replacementTotal = parseExchangeMoneyValue(
    safeNote,
    /(?:إجمالي القطع البديلة|Replacement total)\s*:\s*₪?([\d.]+)/i,
  );
  const customerPays = parseExchangeMoneyValue(
    safeNote,
    /(?:فرق السعر \(يدفعه الزبون\)|Price difference \(customer pays\))\s*:\s*₪?([\d.]+)/i,
  );
  const refundValue = parseExchangeMoneyValue(
    safeNote,
    /(?:فرق السعر \(يُرد للزبون\)|Price difference \(refund to customer\))\s*:\s*₪?([\d.]+)/i,
  );

  let priceDifferenceDirection: ParsedExchangeNote["priceDifferenceDirection"] = "none";
  let priceDifference: number | undefined;
  if (Number.isFinite(customerPays)) {
    priceDifferenceDirection = "customer_pays";
    priceDifference = customerPays;
  } else if (Number.isFinite(refundValue)) {
    priceDifferenceDirection = "refund";
    priceDifference = refundValue;
  }

  return {
    originalInvoiceId,
    returnedItems,
    replacementItems,
    returnCredit,
    replacementTotal,
    priceDifference,
    priceDifferenceDirection,
  };
}

function getHistoryItemKey(item: any): string {
  return [
    Number(item?.productId ?? item?.product_id ?? 0),
    String(item?.name || "").trim(),
    String(item?.size || ""),
    String(item?.color || ""),
    Math.max(0, Number(item?.quantity) || 0),
  ].join("|");
}

function getHistoryItemsSignature(items: any[]): string {
  return (Array.isArray(items) ? items : [])
    .map((item) => getHistoryItemKey(item))
    .sort()
    .join("||");
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
    const to = parsedTo && isValid(parsedTo) ? parsedTo : parsedFrom;
    const from = parsedFrom <= to ? parsedFrom : to;
    const end = parsedFrom <= to ? to : parsedFrom;
    onApply("custom", { from, to: end });
    setOpen(false);
  };

  const customLabel =
    dateFilter === "custom"
      ? formatPosCustomRangeLabel(customDateRange, locale)
      : "";

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {(["today", "week", "month", "all"] as const).map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => onApply(preset)}
          className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${dateFilter === preset ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}
          data-testid={`button-date-filter-${preset}`}
        >
          {preset === "today"
            ? ar
              ? "اليوم"
              : "Today"
            : preset === "week"
              ? ar
                ? "أسبوع"
                : "Week"
              : preset === "month"
                ? ar
                  ? "شهر"
                  : "Month"
                : ar
                  ? "الكل"
                  : "All"}
        </button>
      ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border transition-colors ${dateFilter === "custom" ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}
            data-testid="button-date-filter-custom"
          >
            <CalendarIcon className="w-2.5 h-2.5" />
            {dateFilter === "custom" && customLabel
              ? customLabel
              : ar
                ? "تاريخ"
                : "Date"}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[min(20rem,calc(100vw-2rem))] p-0 overflow-hidden"
          data-testid="popover-pos-date-filter"
        >
          <div className="p-3 border-b border-border">
            <p className="text-[11px] font-semibold text-muted-foreground mb-2">
              {ar
                ? "اضغط على اسم الشهر لتصفية الشهر بالكامل"
                : "Click the month name to filter the whole month"}
            </p>
            <Calendar
              mode="range"
              selected={pendingRange}
              onSelect={(range) => {
                syncInputsFromRange(range);
                if (range?.from && range?.to) {
                  onApply("custom", { from: range.from, to: range.to });
                  setOpen(false);
                }
              }}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              locale={locale}
              numberOfMonths={1}
              className="p-0 pointer-events-auto"
              components={{
                CaptionLabel: ({ displayMonth }) => (
                  <button
                    type="button"
                    onClick={() => applyMonth(displayMonth)}
                    className="text-sm font-semibold hover:underline underline-offset-2"
                    title={
                      ar ? "تصفية الشهر بالكامل" : "Filter the entire month"
                    }
                    data-testid="button-calendar-month-caption"
                  >
                    {format(displayMonth, "MMMM yyyy", { locale })}
                  </button>
                ),
              }}
            />
          </div>

          <div className="p-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground">
              {ar ? "تاريخ يدوي" : "Manual dates"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">
                  {ar ? "من" : "From"}
                </span>
                <input
                  type="date"
                  value={fromInput}
                  onChange={(e) => {
                    setFromInput(e.target.value);
                    const parsed = parse(
                      e.target.value,
                      "yyyy-MM-dd",
                      new Date(),
                    );
                    if (isValid(parsed)) {
                      const toParsed = toInput
                        ? parse(toInput, "yyyy-MM-dd", new Date())
                        : parsed;
                      syncInputsFromRange({
                        from: parsed,
                        to: isValid(toParsed) ? toParsed : parsed,
                      });
                    }
                  }}
                  className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                  data-testid="input-pos-date-from"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-muted-foreground">
                  {ar ? "إلى" : "To"}
                </span>
                <input
                  type="date"
                  value={toInput}
                  onChange={(e) => {
                    setToInput(e.target.value);
                    const parsedTo = parse(
                      e.target.value,
                      "yyyy-MM-dd",
                      new Date(),
                    );
                    const parsedFrom = fromInput
                      ? parse(fromInput, "yyyy-MM-dd", new Date())
                      : parsedTo;
                    if (isValid(parsedFrom) && isValid(parsedTo)) {
                      syncInputsFromRange({ from: parsedFrom, to: parsedTo });
                    }
                  }}
                  className="w-full h-8 rounded-md border border-border bg-background px-2 text-xs"
                  data-testid="input-pos-date-to"
                />
              </label>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={applyManualRange}
                className="flex-1 h-8 rounded-md bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 transition-colors"
                data-testid="button-apply-pos-date-filter"
              >
                {ar ? "تطبيق" : "Apply"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onApply("all");
                  setOpen(false);
                }}
                className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted transition-colors"
                data-testid="button-clear-pos-date-filter"
              >
                {ar ? "مسح" : "Clear"}
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {dateFilter === "custom" && customLabel && (
        <button
          type="button"
          onClick={() => onApply("all")}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300"
          data-testid="badge-active-custom-date-filter"
        >
          {customLabel}
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

/* ── Invoices column (shoes / everything-else) ────────────────────────────
   The shop runs two separate cash registers — one for shoes, one for every
   other category — so the reports invoices list is split into two matching
   columns instead of one combined list. Both columns share the same date
   filter (applied by the caller before splitting), but each gets its own
   cash/card payment filter, select-all, and delete-selected. */
interface PosInvoicesColumnProps {
  ar: boolean;
  title: string;
  icon: React.ReactNode;
  orders: any[];
  testIdPrefix: string;
  paymentFilter: "all" | "cash" | "card" | "split";
  onPaymentFilterChange: (v: "all" | "cash" | "card" | "split") => void;
  selectedOrderIds: Set<number>;
  toggleOrderSelected: (id: number) => void;
  setSelectedOrderIds: (updater: (prev: Set<number>) => Set<number>) => void;
  onDeleteSelected: () => void;
  reprintOrder: (order: any) => void;
  onView: (order: any) => void;
  onDelete: (order: any) => void;
  allowTransferStatus?: boolean;
  onSetTransferStatus?: (ids: number[], transferred: boolean) => void;
  revenueScope?: "shoes" | "other";
  shoeCategoryIds?: Set<number>;
  productCategoryById?: Map<number, number>;
}

function PosInvoicesColumn({
  ar,
  title,
  icon,
  orders,
  testIdPrefix,
  paymentFilter,
  onPaymentFilterChange,
  selectedOrderIds,
  toggleOrderSelected,
  setSelectedOrderIds,
  onDeleteSelected,
  reprintOrder,
  onView,
  onDelete,
  allowTransferStatus = false,
  onSetTransferStatus,
  revenueScope,
  shoeCategoryIds,
  productCategoryById,
}: PosInvoicesColumnProps) {
  const getColumnAmount = (order: any): number => {
    if (revenueScope && shoeCategoryIds && productCategoryById) {
      return getPosOrderScopedRevenue(
        order,
        revenueScope,
        shoeCategoryIds,
        productCategoryById,
      );
    }
    return getPosOrderTotal(order);
  };
  const getColumnDiscount = (order: any): number => {
    if (revenueScope && shoeCategoryIds && productCategoryById) {
      return getPosOrderScopedDiscount(
        order,
        revenueScope,
        shoeCategoryIds,
        productCategoryById,
      );
    }
    return getPosOrderDiscount(order);
  };
  // Cash/card breakdown for this order, scaled down to match whatever share
  // of the order belongs to this column (shoes vs. everything else) — a
  // split invoice with items from both registers only contributes its
  // proportional slice of its cash/card amounts to each column.
  const getColumnSplit = (order: any): { cash: number; card: number } => {
    const full = getPosOrderPaymentSplit(order);
    if (revenueScope && shoeCategoryIds && productCategoryById) {
      const scopedRevenue = getColumnAmount(order);
      const fullTotal = Math.max(getPosOrderTotal(order), 0.01);
      const share = scopedRevenue / fullTotal;
      return { cash: full.cash * share, card: full.card * share };
    }
    return full;
  };
  const visibleOrders = orders.filter((o: any) => {
    if (paymentFilter === "all") return true;
    const method = o.payment_method || o.paymentMethod || "cash";
    return method === paymentFilter;
  });
  const visibleTotal = visibleOrders.reduce(
    (s: number, o: any) => s + getColumnAmount(o),
    0,
  );
  // Cash/card actually collected across the currently visible invoices —
  // this is what tells the admin how much is really in the cash drawer vs.
  // how much went through the card machine, including each split
  // invoice's own cash/card portions (previously split invoices' card
  // amounts were invisible here, which under-counted the card total).
  const visibleCash = visibleOrders.reduce(
    (s: number, o: any) => s + getColumnSplit(o).cash,
    0,
  );
  const visibleCard = visibleOrders.reduce(
    (s: number, o: any) => s + getColumnSplit(o).card,
    0,
  );
  // In the Split filter, show how much of the card portion has already
  // been marked as transferred. Only transferred, card-eligible invoices
  // contribute to this figure; the cash portion is never counted.
  const visibleTransferredCard = visibleOrders.reduce((s: number, o: any) => {
    const transferred = o.transferred === true || o.transferred === "true";
    if (!transferred || !canMarkPosOrderTransferred(o)) return s;
    return s + getColumnSplit(o).card;
  }, 0);
  const selectedInColumn = visibleOrders.filter((o: any) =>
    selectedOrderIds.has(o.id),
  ).length;
  const selectedTransferIds = allowTransferStatus
    ? visibleOrders
        .filter((o: any) => selectedOrderIds.has(o.id) && canMarkPosOrderTransferred(o))
        .map((o: any) => o.id)
        .filter((id: any) => typeof id === "number")
    : [];
  const allSelected =
    visibleOrders.length > 0 &&
    visibleOrders.every((o: any) => selectedOrderIds.has(o.id));

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 flex-wrap gap-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          {icon}
          {title}
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {visibleOrders.length}
          </span>
        </h3>
        <div className="flex items-center gap-1 flex-wrap">
          {selectedInColumn > 0 && (
            <>
              {allowTransferStatus && onSetTransferStatus && (
                <>
                  {selectedTransferIds.length > 0 && (
                    <button
                      onClick={() => onSetTransferStatus(selectedTransferIds, true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold rounded-full border border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30 transition-colors"
                      data-testid={`button-mark-transferred-${testIdPrefix}`}
                    >
                      <Check className="w-3 h-3" />
                      {ar ? `تم التحويل (${selectedTransferIds.length})` : `Mark transferred (${selectedTransferIds.length})`}
                    </button>
                  )}
                  {selectedTransferIds.length > 0 && (
                    <button
                      onClick={() => onSetTransferStatus(selectedTransferIds, false)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold rounded-full border border-border text-muted-foreground hover:bg-muted transition-colors"
                      data-testid={`button-unmark-transferred-${testIdPrefix}`}
                    >
                      <X className="w-3 h-3" />
                      {ar ? "إلغاء التحويل" : "Remove transferred"}
                    </button>
                  )}
                </>
              )}
              <button
                onClick={onDeleteSelected}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold rounded-full border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30 transition-colors"
                data-testid={`button-delete-selected-${testIdPrefix}`}
              >
                <Trash2 className="w-3 h-3" />
                {ar
                  ? `حذف المحدد (${selectedInColumn})`
                  : `Delete selected (${selectedInColumn})`}
              </button>
            </>
          )}
          {(["all", "cash", "card", "split"] as const).map((f) => (
            <button
              key={f}
              onClick={() => onPaymentFilterChange(f)}
              className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full border transition-colors ${paymentFilter === f ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}
              data-testid={`button-payment-filter-${testIdPrefix}-${f}`}
            >
              {f === "cash" ? (
                <Banknote className="w-2.5 h-2.5" />
              ) : f === "card" ? (
                <CreditCard className="w-2.5 h-2.5" />
              ) : f === "split" ? (
                <Split className="w-2.5 h-2.5" />
              ) : (
                <Filter className="w-2.5 h-2.5" />
              )}
              {f === "all"
                ? ar
                  ? "الكل"
                  : "All"
                : f === "cash"
                  ? ar
                    ? "نقدي"
                    : "Cash"
                  : f === "card"
                    ? ar
                      ? "بطاقة"
                      : "Card"
                    : ar
                      ? "مختلط"
                      : "Split"}
            </button>
          ))}
        </div>
      </div>
      {visibleOrders.length > 0 && (
        <button
          onClick={() => {
            const allIds = visibleOrders
              .map((o: any) => o.id)
              .filter((id: any) => typeof id === "number");
            setSelectedOrderIds((prev) => {
              const next = new Set(prev);
              if (allSelected) {
                allIds.forEach((id: number) => next.delete(id));
              } else {
                allIds.forEach((id: number) => next.add(id));
              }
              return next;
            });
          }}
          className="flex items-center gap-2 w-full px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 border-b border-border transition-colors"
          data-testid={`button-select-all-${testIdPrefix}`}
        >
          <span
            className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${allSelected ? "bg-foreground border-foreground" : "border-border"}`}
          >
            {allSelected && <Check className="w-2.5 h-2.5 text-background" />}
          </span>
          {ar ? "تحديد الكل" : "Select all"}
        </button>
      )}
      {visibleOrders.length === 0 ? (
        <div className="text-muted-foreground text-sm text-center py-10">
          {ar ? "لا توجد فواتير" : "No transactions"}
        </div>
      ) : (
        <div className="divide-y divide-border max-h-72 overflow-y-auto">
          {visibleOrders.map((order: any, i: number) => {
            const date = new Date(
              order.created_at || order.createdAt || Date.now(),
            );
            const items = order.items || [];
            const totalQty = items.reduce(
              (s: number, it: any) => s + (it.quantity || 1),
              0,
            );
            const method =
              order.payment_method || order.paymentMethod || "cash";
            const isSelected = selectedOrderIds.has(order.id);
            const isTransferred =
              canMarkPosOrderTransferred(order) &&
              (order.transferred === true || order.transferred === "true");
            return (
              <div
                key={order.id ?? i}
                onDoubleClick={() => onView(order)}
                title={ar ? "دبل كلك للفتح" : "Double-click to open"}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer ${isSelected ? "bg-muted/40" : ""}`}
                data-testid={`row-order-${testIdPrefix}-${order.id}`}
              >
                <button
                  onClick={() => toggleOrderSelected(order.id)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-foreground border-foreground" : "border-border hover:border-foreground/50"}`}
                  data-testid={`checkbox-select-order-${testIdPrefix}-${order.id}`}
                >
                  {isSelected && (
                    <Check className="w-3 h-3 text-background" />
                  )}
                </button>
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${method === "card" ? "bg-blue-100 dark:bg-blue-950 text-blue-600" : method === "split" ? "bg-purple-100 dark:bg-purple-950 text-purple-600" : "bg-green-100 dark:bg-green-950 text-green-600"}`}
                >
                  {method === "card" ? (
                    <CreditCard className="w-3.5 h-3.5" />
                  ) : method === "split" ? (
                    <Split className="w-3.5 h-3.5" />
                  ) : (
                    <Banknote className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold ltr-num">
                      #{order.id}
                    </span>
                    {isExchangeOrder(order.note) && (
                      <span
                        className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                        data-testid={`badge-exchange-${testIdPrefix}-${order.id}`}
                      >
                        <ArrowLeftRight className="w-2.5 h-2.5" />
                        {ar ? "تبديل" : "Exchange"}
                      </span>
                    )}
                    {Array.isArray(order.exchangeHistory) && order.exchangeHistory.length > 0 && (
                      <span
                        className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                        data-testid={`badge-exchanged-before-${testIdPrefix}-${order.id}`}
                        title={ar ? "تم التبديل من هذه الفاتورة سابقاً" : "This invoice was exchanged before"}
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        {ar ? "تم التبديل منها" : "Exchanged before"}
                      </span>
                    )}
                    {isTransferred && (
                      <span
                        className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                        data-testid={`badge-transferred-${testIdPrefix}-${order.id}`}
                      >
                        <Check className="w-2.5 h-2.5" />
                        {ar ? "تم التحويل" : "Transferred"}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground ltr-num">
                      · {format(date, "yyyy-MM-dd · hh:mm a")}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {totalQty} {ar ? "قطعة" : "items"}
                    {items.length > 0 &&
                      ` · ${items
                        .slice(0, 2)
                        .map((it: any) => it.name)
                        .join("، ")}${items.length > 2 ? "..." : ""}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-end">
                    {getColumnDiscount(order) > 0 && (
                      <p className="text-[9px] text-muted-foreground line-through ltr-num">
                        ₪
                        {(
                          getColumnAmount(order) + getColumnDiscount(order)
                        ).toFixed(2)}
                      </p>
                    )}
                    <span className="text-sm font-bold ltr-num">
                      ₪{getColumnAmount(order).toFixed(2)}
                    </span>
                    {method === "split" && (() => {
                      const { cash, card } = getColumnSplit(order);
                      return (
                        <p className="text-[9px] text-muted-foreground ltr-num flex items-center gap-1 justify-end mt-0.5">
                          <Banknote className="w-2.5 h-2.5" /> ₪{cash.toFixed(2)}
                          <span className="mx-0.5">·</span>
                          <CreditCard className="w-2.5 h-2.5" /> ₪{card.toFixed(2)}
                        </p>
                      );
                    })()}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      reprintOrder(order);
                    }}
                    className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted hover:border-foreground/30 transition-colors"
                    title={ar ? "إعادة طباعة" : "Reprint"}
                    data-testid={`button-reprint-order-${testIdPrefix}-${order.id}`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onView(order);
                    }}
                    className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted hover:border-foreground/30 transition-colors"
                    data-testid={`button-view-order-${testIdPrefix}-${order.id}`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(order);
                    }}
                    className="w-7 h-7 rounded-full border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-50 hover:border-red-300 dark:border-red-800 dark:hover:bg-red-950/30 transition-colors"
                    title={ar ? "حذف" : "Delete"}
                    data-testid={`button-delete-order-${testIdPrefix}-${order.id}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {visibleOrders.length > 0 && (
        <div className="border-t border-border bg-muted/40">
          <div className="flex items-center justify-between px-4 py-3 text-sm font-semibold">
            <span className="text-muted-foreground">
              {ar ? "إجمالي الفواتير المعروضة" : "Filtered invoices total"}
            </span>
            <span className="text-base font-bold ltr-num">₪{visibleTotal.toFixed(2)}</span>
          </div>
          {/* Cash vs. card actually collected — includes each split
              invoice's own cash/card share, so the card figure here is
              what should go toward the card machine's total. */}
          <div className="flex items-center justify-between px-4 pb-2.5 text-[11px] text-muted-foreground flex-wrap gap-2">
            <span className="flex items-center gap-1">
              <Banknote className="w-3 h-3 text-green-600" />
              {ar ? "نقدي" : "Cash"}: <span className="font-semibold text-foreground ltr-num">₪{visibleCash.toFixed(2)}</span>
            </span>
            <span className="flex items-center gap-1">
              <CreditCard className="w-3 h-3 text-blue-600" />
              {ar ? "بطاقة" : "Card"}: <span className="font-semibold text-foreground ltr-num">₪{visibleCard.toFixed(2)}</span>
            </span>
            {paymentFilter === "split" && allowTransferStatus && (
              <span
                className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300"
                data-testid={`summary-transferred-card-${testIdPrefix}`}
              >
                <Check className="w-3 h-3" />
                {ar ? "تم التحويل من البطاقة" : "Transferred card"}:
                <span className="ltr-num">₪{visibleTransferredCard.toFixed(2)}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function POS() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const ar = language === "ar";
  const { data: siteSettings } = useSiteSettings();
  const { data: currentUser } = useAuth();
  const isEmployee = currentUser?.role === "employee";
  const isAdmin = currentUser?.role === "admin";
  const reportsPageEnabled =
    siteSettings?.reports_page_enabled !== "false" && !isEmployee;

  /* Tab */
  const [activeTab, setActiveTab] = useState<"pos" | "dashboard">("pos");

  /* Product grid */
  const [categoryFilter, setCategoryFilter] = useState<number | "all">("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState<number | "all">(
    "all",
  );
  // Category id whose subcategory drawer is currently open — opened by a
  // double-click (desktop) or double-tap (touch) on that category's pill.
  const [openSubcategoryFor, setOpenSubcategoryFor] = useState<number | null>(
    null,
  );
  const lastCatTapRef = useRef<{ id: number | "all"; time: number }>({
    id: "all",
    time: 0,
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");

  // Debounce search so filtering only runs 150ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 150);
    return () => clearTimeout(t);
  }, [search]);

  /* Cart */
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [colorEditIdx, setColorEditIdx] = useState<number | null>(null);
  const [sizeEditIdx, setSizeEditIdx] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">(
    "fixed",
  );
  const [discountValue, setDiscountValue] = useState("");

  /* Held carts */
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([]);

  /* Payment */
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card" | "split" | null
  >(null);
  const [cashReceived, setCashReceived] = useState("");
  const [cardReceived, setCardReceived] = useState("");
  const [completing, setCompleting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(
    null,
  );
  const [autoPrint, setAutoPrint] = useState(true);

  /* On-screen touch keyboard */
  const [oskEnabled, setOskEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem("pos_osk_enabled");
      return stored === null ? true : stored === "1";
    } catch {
      return true;
    }
  });
  const [oskTarget, setOskTarget] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const oskContainerRef = useRef<HTMLDivElement | null>(null);

  /* Product picker modal */
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);
  const [cartImageView, setCartImageView] = useState<{ src: string; name: string } | null>(null);
  const [pickerSize, setPickerSize] = useState("");
  const [pickerColor, setPickerColor] = useState("");
  const [pickerQty, setPickerQty] = useState(1);
  const [pickerIsHintSize, setPickerIsHintSize] = useState(false);

  /* Dashboard */
  const [expandedOrder, setExpandedOrder] = useState<any | null>(null);
  // Invoice id currently showing the cash/card split entry form in the
  // reports detail view (switching an invoice to مختلط needs two amounts,
  // unlike the one-click cash/card switch, so it opens an inline editor).
  const [editingSplitFor, setEditingSplitFor] = useState<number | null>(null);
  const [splitCashInput, setSplitCashInput] = useState("");
  const [splitCardInput, setSplitCardInput] = useState("");
  const [dateFilter, setDateFilter] = useState<PosDateFilterPreset>("all");
  const [customDateRange, setCustomDateRange] = useState<{
    from?: Date;
    to?: Date;
  }>({});
  const handleDateFilterApply = useCallback(
    (filter: PosDateFilterPreset, range?: { from?: Date; to?: Date }) => {
      setDateFilter(filter);
      if (filter === "custom" && range?.from) {
        setCustomDateRange({ from: range.from, to: range.to ?? range.from });
      } else {
        setCustomDateRange({});
      }
    },
    [],
  );
  const [chartView, setChartView] = useState<"today" | "week">("today");

  /* Return / refund */
  const [returnMode, setReturnMode] = useState(false);
  const [returnSearch, setReturnSearch] = useState("");
  const [returnOrder, setReturnOrder] = useState<any | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [processingReturn, setProcessingReturn] = useState(false);

  /* Exchange */
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeSearch, setExchangeSearch] = useState("");
  const [exchangeOrder, setExchangeOrder] = useState<any | null>(null);
  const [exchangeQtys, setExchangeQtys] = useState<Record<number, number>>({});
  const [processingExchange, setProcessingExchange] = useState(false);
  const [exchangeOverride, setExchangeOverride] = useState(false);
  const [dressOverrideItems, setDressOverrideItems] = useState<Set<number>>(new Set());

  /* Exchange — replacement products (one exchange can contain many new items) */
  const [exchangeNewSearch, setExchangeNewSearch] = useState("");
  const [exchangeReplacementResultsOpen, setExchangeReplacementResultsOpen] = useState(false);
  const [exchangeNewProduct, setExchangeNewProduct] = useState<Product | null>(null);
  const [exchangeNewSize, setExchangeNewSize] = useState("");
  const [exchangeNewColor, setExchangeNewColor] = useState("");
  const [exchangeNewQty, setExchangeNewQty] = useState(1);
  const [exchangeReplacementItems, setExchangeReplacementItems] = useState<ExchangeReplacementItem[]>([]);
  const [exchangeCategoryFilter, setExchangeCategoryFilter] = useState<number | "all">("all");
  const [exchangeSubcategoryFilter, setExchangeSubcategoryFilter] = useState<number | "all">("all");
  const [exchangeOpenSubcategoryFor, setExchangeOpenSubcategoryFor] = useState<number | null>(null);
  const exchangeLastCatTapRef = useRef<{ id: number | "all"; time: number }>({ id: "all", time: 0 });

  /* Collapsible cart extras */
  const [showNote, setShowNote] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);

  /* Refs */
  const barcodeRef = useRef<HTMLInputElement>(null);
  const exchangeSearchRef = useRef<HTMLInputElement>(null);
  const exchangeReplacementSearchRef = useRef<HTMLDivElement>(null);
  const returnSearchRef = useRef<HTMLInputElement>(null);
  // Scan-speed detection for the exchange/return invoice fields — see the
  // onChange handlers on those inputs below for how these are used.
  const exchangeLastChangeTime = useRef(0);
  const exchangeScanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnLastChangeTime = useRef(0);
  const returnScanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const cashRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);
  const cartEndRef = useRef<HTMLDivElement>(null);

  // Replacement search behaves like a normal dropdown: clicking anywhere
  // outside the search/results area closes only the result panel while keeping
  // the chosen category/subcategory filter in place.
  useEffect(() => {
    if (!exchangeMode || !exchangeReplacementResultsOpen) return;
    const closeReplacementSearch = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (target && exchangeReplacementSearchRef.current?.contains(target)) return;
      setExchangeReplacementResultsOpen(false);
    };
    document.addEventListener("mousedown", closeReplacementSearch);
    document.addEventListener("touchstart", closeReplacementSearch, { passive: true });
    return () => {
      document.removeEventListener("mousedown", closeReplacementSearch);
      document.removeEventListener("touchstart", closeReplacementSearch);
    };
  }, [exchangeMode, exchangeReplacementResultsOpen]);

  /* Queries */
  const { data: products = [] } = useProducts();
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const { data: subcategories = [] } = useQuery<Subcategory[]>({
    queryKey: ["/api/subcategories"],
  });
  const { data: posOrders = [], refetch: refetchOrders } = useQuery<any[]>({
    queryKey: ["/api/pos/orders"],
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const parsedExchangeInvoices = useMemo(
    () =>
      posOrders
        .filter((order: any) => isExchangeOrder(order?.note))
        .map((order: any) => ({
          order,
          parsed: parseExchangeInvoiceNote(order?.note),
        }))
        .filter((entry) => !!entry.parsed),
    [posOrders],
  );

  const getLinkedExchangeInvoiceForEvent = useCallback(
    (originalOrderId: number, event: any) => {
      if (event?.sourceOrderId) {
        return posOrders.find((order: any) => Number(order.id) === Number(event.sourceOrderId)) || null;
      }

      const candidates = parsedExchangeInvoices.filter(
        (entry) => Number(entry.parsed?.originalInvoiceId || 0) === Number(originalOrderId),
      );
      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0].order;

      const eventSignature = getHistoryItemsSignature(event?.returnedItems || []);
      const signatureMatches = candidates.filter(
        (entry) => getHistoryItemsSignature(entry.parsed?.returnedItems || []) === eventSignature,
      );
      const pool = signatureMatches.length > 0 ? signatureMatches : candidates;

      const targetTime = new Date(event?.exchangedAt || "").getTime();
      if (Number.isFinite(targetTime) && targetTime > 0) {
        return (
          pool
            .map((entry) => ({
              order: entry.order,
              diff: Math.abs(
                new Date(entry.order?.createdAt || entry.order?.created_at || 0).getTime() - targetTime,
              ),
            }))
            .sort((a, b) => a.diff - b.diff)[0]?.order || null
        );
      }

      return pool[0]?.order || null;
    },
    [parsedExchangeInvoices, posOrders],
  );

  const getItemExchangeLinks = useCallback(
    (order: any, item: any) => {
      const events = Array.isArray(order?.exchangeHistory) ? order.exchangeHistory : [];
      const baseProductId = Number(item?.productId ?? item?.product_id ?? 0);
      const baseSize = String(item?.size || "");
      const baseColor = String(item?.color || "");

      return events
        .map((event: any, eventIndex: number) => {
          const matchedReturned = (Array.isArray(event?.returnedItems) ? event.returnedItems : []).find(
            (histItem: any) =>
              Number(histItem?.productId ?? histItem?.product_id ?? 0) === baseProductId &&
              String(histItem?.size || "") === baseSize &&
              String(histItem?.color || "") === baseColor,
          );
          if (!matchedReturned) return null;

          const linkedInvoice = getLinkedExchangeInvoiceForEvent(Number(order?.id || 0), event);
          const replacementProductIds = Array.from(
            new Set(
              (Array.isArray(event?.replacementItems) ? event.replacementItems : [])
                .map((replacement: any) => Number(replacement?.productId ?? replacement?.product_id ?? 0))
                .filter((id: number) => Number.isInteger(id) && id > 0),
            ),
          );

          return {
            eventIndex,
            quantity: Math.max(0, Number(matchedReturned?.quantity) || 0),
            invoiceId: linkedInvoice ? Number(linkedInvoice.id) : undefined,
            replacementProductIds,
          };
        })
        .filter(Boolean) as Array<{
        eventIndex: number;
        quantity: number;
        invoiceId?: number;
        replacementProductIds: number[];
      }>;
    },
    [getLinkedExchangeInvoiceForEvent],
  );

  const expandedOrderExchangeSummary = useMemo(
    () => parseExchangeInvoiceNote(expandedOrder?.note),
    [expandedOrder?.note],
  );

  const [deleteAllOrdersConfirmOpen, setDeleteAllOrdersConfirmOpen] = useState(false);
  const deleteAllOrdersMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/pos/orders", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: ({ deleted }) => {
      qc.invalidateQueries({ queryKey: ["/api/pos/orders"] });
      toast({
        title: ar
          ? `تم حذف ${deleted} فاتورة/معاملة بنجاح`
          : `${deleted} invoice(s)/transaction(s) deleted successfully`,
      });
      setDeleteAllOrdersConfirmOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: ar ? "فشل الحذف" : "Failed to delete",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Autofocus helper: skips stealing focus from a field the cashier is
  // actively typing in, but otherwise wins the race against the browser's
  // default "keep focus on the button I just clicked" behavior (e.g. the
  // persistent sidebar nav button that opened this page never unmounts,
  // so a single focus() call on mount can lose to it — hence the second
  // attempt a couple of frames later).
  const focusField = useCallback((ref: React.RefObject<HTMLInputElement>) => {
    const run = () => {
      const el = ref.current;
      if (!el) return;
      const active = document.activeElement as HTMLElement | null;
      const activeIsOtherField =
        active &&
        active !== el &&
        active !== document.body &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      if (!activeIsOtherField) el.focus();
    };
    run();
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, []);

  useEffect(() => {
    if (activeTab === "pos") focusField(barcodeRef);
  }, [activeTab, focusField]);

  // Exchange/Return open with the invoice number field ready to type or
  // scan into immediately — no extra click needed before a cashier can
  // start the lookup.
  useEffect(() => {
    if (exchangeMode) {
      focusField(exchangeSearchRef);
    } else if (exchangeScanTimer.current) {
      clearTimeout(exchangeScanTimer.current);
      exchangeScanTimer.current = null;
    }
  }, [exchangeMode, focusField]);

  useEffect(() => {
    if (returnMode) {
      focusField(returnSearchRef);
    } else if (returnScanTimer.current) {
      clearTimeout(returnScanTimer.current);
      returnScanTimer.current = null;
    }
  }, [returnMode, focusField]);

  // Coming back to this browser tab/window (alt-tab, or the OS-level POS
  // window regaining focus) should also drop the cursor back into the
  // barcode field, same as first opening the page.
  useEffect(() => {
    const onWindowFocus = () => {
      if (activeTab === "pos" && !exchangeMode && !returnMode) {
        focusField(barcodeRef);
      }
    };
    window.addEventListener("focus", onWindowFocus);
    return () => window.removeEventListener("focus", onWindowFocus);
  }, [activeTab, exchangeMode, returnMode, focusField]);

  /* Report page — select invoices to delete */
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<number>>(new Set());
  const [deleteSelectedConfirmOpen, setDeleteSelectedConfirmOpen] = useState(false);
  const toggleOrderSelected = (id: number) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const deleteSelectedOrdersMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/pos/orders", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: ({ deleted }) => {
      qc.invalidateQueries({ queryKey: ["/api/pos/orders"] });
      toast({
        title: ar
          ? `تم حذف ${deleted} فاتورة/معاملة بنجاح`
          : `${deleted} invoice(s)/transaction(s) deleted successfully`,
      });
      setSelectedOrderIds(new Set());
      setDeleteSelectedConfirmOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: ar ? "فشل الحذف" : "Failed to delete",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const updateTransferStatusMutation = useMutation({
    mutationFn: async ({ ids, transferred }: { ids: number[]; transferred: boolean }) => {
      const res = await fetch("/api/pos/orders/transfer-status", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, transferred }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || "Failed to update transfer status");
      return { ...body, ids, transferred };
    },
    onSuccess: ({ updated, ids, transferred }) => {
      qc.invalidateQueries({ queryKey: ["/api/pos/orders"] });
      setSelectedOrderIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id: number) => next.delete(id));
        return next;
      });
      toast({
        title: transferred
          ? (ar ? `تم تحويل ${updated} فاتورة أحذية` : `${updated} shoe invoice(s) marked transferred`)
          : (ar ? `تم إلغاء التحويل عن ${updated} فاتورة أحذية` : `Transferred status removed from ${updated} shoe invoice(s)`),
      });
    },
    onError: (err: any) => {
      toast({
        title: ar ? "فشل تحديث حالة التحويل" : "Failed to update transfer status",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  /* ── Reprint an existing invoice from the reports list ─────────────
     Converts the raw POS-order row (as returned by /api/pos/orders) back
     into the CompletedOrder shape triggerPrint expects. */
  const reprintOrder = (order: any) => {
    const rawItems = order.items || [];
    const items: PosCartItem[] = rawItems.map((it: any) => {
      const matched = products.find(
        (p) => p.id === (it.productId ?? it.product_id),
      );
      return {
        product: (matched || ({ name: it.name } as Product)) as Product,
        quantity: it.quantity || 1,
        size: it.size || undefined,
        color: it.color || undefined,
        unitPrice: parseFloat(it.price || 0),
      };
    });
    const subtotal = getPosOrderStoredSubtotal(order);
    const discountAmount = getPosOrderDiscount(order);
    const total = getPosOrderTotal(order);
    const paymentMethod = (order.payment_method || order.paymentMethod || "cash") as
      | "cash"
      | "card"
      | "split";
    const cashReceived = parseFloat(order.cash_amount ?? order.cashAmount ?? 0) || 0;
    const cardReceived = parseFloat(order.card_amount ?? order.cardAmount ?? 0) || 0;
    triggerPrint({
      id: order.id,
      items,
      subtotal,
      discountAmount,
      total,
      date: new Date(order.created_at || order.createdAt || Date.now()),
      cashReceived,
      cardReceived,
      change:
        paymentMethod === "cash" && cashReceived > total
          ? cashReceived - total
          : 0,
      paymentMethod,
      note: order.note || "",
    });
  };

  /* ── Delete a single invoice from the reports list ──────────────── */
  const [deleteOrderConfirm, setDeleteOrderConfirm] = useState<any | null>(null);
  const deleteSingleOrderMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch("/api/pos/orders", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["/api/pos/orders"] });
      toast({
        title: ar ? "تم حذف الفاتورة بنجاح" : "Invoice deleted successfully",
      });
      setSelectedOrderIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setExpandedOrder((prev: any) => (prev && prev.id === id ? null : prev));
      setDeleteOrderConfirm(null);
    },
    onError: (err: any) => {
      toast({
        title: ar ? "فشل الحذف" : "Failed to delete",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  /* ── Switch an invoice between cash/card/split from the reports detail view ── */
  const updateOrderPaymentMethodMutation = useMutation({
    mutationFn: async ({
      id,
      paymentMethod,
      cashAmount,
      cardAmount,
    }: {
      id: number;
      paymentMethod: "cash" | "card" | "split";
      cashAmount?: number;
      cardAmount?: number;
    }) => {
      const res = await fetch(`/api/pos/orders/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod, cashAmount, cardAmount }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || "Failed to update payment method");
      }
      return res.json();
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["/api/pos/orders"] });
      setExpandedOrder((prev: any) =>
        prev && prev.id === updated.id
          ? {
              ...prev,
              payment_method: updated.paymentMethod,
              paymentMethod: updated.paymentMethod,
              cash_amount: updated.cashAmount,
              cashAmount: updated.cashAmount,
              card_amount: updated.cardAmount,
              cardAmount: updated.cardAmount,
            }
          : prev,
      );
      setEditingSplitFor(null);
      toast({
        title: ar ? "تم تغيير طريقة الدفع" : "Payment method changed",
      });
    },
    onError: (err: any) => {
      toast({
        title: ar ? "فشل تغيير طريقة الدفع" : "Failed to change payment method",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!reportsPageEnabled && activeTab === "dashboard") setActiveTab("pos");
  }, [reportsPageEnabled, activeTab]);

  // Closing the invoice modal or opening a different invoice should always
  // drop any in-progress مختلط split entry rather than leaving it stale.
  useEffect(() => {
    setEditingSplitFor(null);
    setSplitCashInput("");
    setSplitCardInput("");
  }, [expandedOrder?.id]);

  /* ── BroadcastChannel ref ──────────────────────────────────────────── */
  const posChannel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    try { posChannel.current = new BroadcastChannel("lucerne-pos"); } catch {}
    return () => { try { posChannel.current?.close(); } catch {} };
  }, []);

  /* ── Customer-facing display window ───────────────────────────────────
     Opens automatically as its own full-size window whenever the POS page
     loads, so the cashier never has to remember to click it. Reuses the
     same named window on repeat opens/clicks instead of stacking new ones.
     Defaults to the SAME screen as the cashier (fully visible) — it only
     moves to a second monitor if the browser can actually confirm one
     exists (Window Management API), so it never gets pushed off-screen
     and out of sight on a single-monitor setup.
     Browsers may block a popup that isn't triggered by a direct click, so
     we fall back to a one-click banner if the auto-open gets blocked. */
  const customerWindowRef = useRef<Window | null>(null);
  const [customerScreenBlocked, setCustomerScreenBlocked] = useState(false);

  const openCustomerDisplay = useCallback(async () => {
    if (customerWindowRef.current && !customerWindowRef.current.closed) {
      customerWindowRef.current.focus();
      return customerWindowRef.current;
    }

    // Default: same screen as the cashier, filling it completely.
    let left = 0;
    let top = 0;
    let w = window.screen.availWidth || 1280;
    let h = window.screen.availHeight || 800;

    try {
      const getScreenDetails = (window as any).getScreenDetails;
      if (typeof getScreenDetails === "function") {
        const details = await getScreenDetails.call(window);
        const other = details.screens.find((s: any) => s !== details.currentScreen);
        // Only move off this screen if a second monitor is confirmed to exist.
        if (other) {
          left = other.availLeft;
          top = other.availTop;
          w = other.availWidth;
          h = other.availHeight;
        }
      }
    } catch {
      /* Window Management API unavailable/denied — stay on the same screen */
    }

    const win = window.open(
      "/admin/pos-customer",
      "lucerne-pos-customer-display",
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,scrollbars=no`,
    );
    if (win) {
      customerWindowRef.current = win;
      setCustomerScreenBlocked(false);
      try {
        win.moveTo(left, top);
        win.resizeTo(w, h);
      } catch {}
    } else {
      setCustomerScreenBlocked(true);
    }
    return win;
  }, []);

  // Must run inside a real click — the browser requires a genuine user
  // gesture before it will even ask permission to see connected monitors.
  const moveCustomerDisplayToSecondScreen = useCallback(async () => {
    try {
      const getScreenDetails = (window as any).getScreenDetails;
      if (typeof getScreenDetails !== "function") return; // Not Chrome/Edge
      const details = await getScreenDetails.call(window);
      const other = details.screens.find((s: any) => s !== details.currentScreen);
      if (!other) return; // No second monitor connected

      const { availLeft: left, availTop: top, availWidth: w, availHeight: h } = other;
      if (customerWindowRef.current && !customerWindowRef.current.closed) {
        try {
          customerWindowRef.current.moveTo(left, top);
          customerWindowRef.current.resizeTo(w, h);
          customerWindowRef.current.focus();
          return;
        } catch {}
      }
      const win = window.open(
        "/admin/pos-customer",
        "lucerne-pos-customer-display",
        `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,scrollbars=no`,
      );
      if (win) {
        customerWindowRef.current = win;
        setCustomerScreenBlocked(false);
      }
    } catch {
      /* Permission denied or API unavailable — leave the display where it is */
    }
  }, []);

  useEffect(() => {
    // Auto-open the customer display only inside the Electron POS app
    // (preload.js exposes window.electronPOS there). In a normal browser
    // the cashier opens it manually with the customer-screen button, so
    // visiting the POS page on the website no longer pops up a window.
    const isElectronPOS = typeof (window as any).electronPOS !== "undefined"
      || /electron/i.test(navigator.userAgent);
    if (!isElectronPOS) return;
    (async () => {
      const win = await openCustomerDisplay();
      if (!win) setCustomerScreenBlocked(true);
    })();
    // Only auto-open once when the POS page first mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Fullscreen / kiosk mode ──────────────────────────────────────────
     POS is used to sell products in-store, so it opens straight into the
     clean, professional checkout look by default (admin sidebar/top bar
     hidden) — no need to click the toggle first. The admin can still
     shrink it back down with the button whenever they want; that choice
     is remembered across visits. */
  const [posFullscreen, setPosFullscreen] = useState(() => {
    try {
      const stored = localStorage.getItem("pos_fullscreen");
      return stored === null ? true : stored === "1";
    } catch {
      return true;
    }
  });

  const toggleFullscreen = useCallback(() => {
    setPosFullscreen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("pos_fullscreen", next ? "1" : "0");
      } catch {}
      // Best-effort real browser fullscreen — silently ignored if the
      // browser/embedding context blocks it (e.g. some iframes).
      if (next) {
        document.documentElement.requestFullscreen?.().catch(() => {});
        moveCustomerDisplayToSecondScreen();
      } else if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      return next;
    });
  }, [moveCustomerDisplayToSecondScreen]);

  // Try to engage real browser fullscreen as soon as the page loads (when
  // defaulting into kiosk mode). Browsers often block this without a user
  // gesture, so if the immediate attempt is blocked we quietly retry on
  // the cashier's very first click/keypress anywhere on the page.
  useEffect(() => {
    if (!posFullscreen) return;
    const tryFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };
    tryFullscreen();
    document.addEventListener("click", tryFullscreen, { once: true });
    document.addEventListener("keydown", tryFullscreen, { once: true });
    return () => {
      document.removeEventListener("click", tryFullscreen);
      document.removeEventListener("keydown", tryFullscreen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the toggle in sync if the admin exits native fullscreen with Esc
  // (or the browser UI) without using our button.
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement && posFullscreen) {
        setPosFullscreen(false);
        try {
          localStorage.setItem("pos_fullscreen", "0");
        } catch {}
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [posFullscreen]);

  /* ── On-screen keyboard: appears the instant any real text field gets
     focus — no separate click to a keyboard icon first. Turning it off
     (toolbar toggle) or navigating away from every field hides it again.
     Does not touch fullscreen/kiosk sizing in any way. */
  const setOskEnabledPersist = useCallback((v: boolean) => {
    setOskEnabled(v);
    try {
      localStorage.setItem("pos_osk_enabled", v ? "1" : "0");
    } catch {}
  }, []);

  useEffect(() => {
    if (!oskEnabled) {
      setOskTarget(null);
      return;
    }
    const isEditable = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag !== "INPUT" && tag !== "TEXTAREA") return false;
      const field = el as HTMLInputElement;
      if (field.readOnly || field.disabled) return false;
      const type = (field.type || "text").toLowerCase();
      const excluded = [
        "button", "checkbox", "radio", "range", "color",
        "file", "submit", "reset", "hidden", "date", "month", "week", "time",
      ];
      return !excluded.includes(type);
    };
    // The barcode field is driven by a physical scanner and is kept
    // focused almost constantly by the app itself (after every add-to-cart,
    // every checkout, tab switches, etc.) — none of that is the cashier
    // asking to type, so the keyboard must never auto-open for it.
    const isBarcodeField = (el: Element | null) => !!el && el === barcodeRef.current;

    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as Element;
      if (isBarcodeField(t)) return;
      if (isEditable(t)) {
        setOskTarget(t);
        // Let the keyboard finish rendering first, then bring the field
        // (and whatever modal/section it's in — exchange, return, etc.)
        // up above it instead of leaving it hidden behind the keyboard.
        requestAnimationFrame(() => {
          setTimeout(() => {
            t.scrollIntoView({ behavior: "smooth", block: "center" });
          }, 80);
        });
      }
    };
    const onFocusOut = () => {
      // Give focus a tick to land on whatever's next — another field
      // keeps the keyboard open, nothing editable closes it. Keyboard
      // buttons never actually take focus (tabIndex=-1 + preventDefault
      // on mousedown), so this never fires just from tapping a key.
      setTimeout(() => {
        const active = document.activeElement;
        if (isBarcodeField(active) || !isEditable(active)) setOskTarget(null);
      }, 0);
    };
    // Belt-and-braces: clicking anything that isn't a text field and isn't
    // the keyboard itself (product cards, buttons, empty space — none of
    // which necessarily steal DOM focus the way a real field does) closes
    // the keyboard immediately, so it never lingers over the screen.
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      if (oskContainerRef.current?.contains(target)) return;
      if (isBarcodeField(target)) return;
      if (isEditable(target)) return;
      setOskTarget(null);
    };
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [oskEnabled]);

  /* ── Stock helpers ─────────────────────────────────────────────────── */
  const getAvailableStock = useCallback(
    (product: Product, size?: string, color?: string): number => {
      const colorVariants =
        (product.colorVariants as ColorVariant[] | undefined) || [];
      let rawStock: number;
      if (colorVariants.length > 0 && color) {
        const cv = colorVariants.find((c) => c.name === color);
        if (cv && size && cv.sizeInventory)
          rawStock =
            (cv.sizeInventory as Record<string, number>)[size] ??
            product.stockQuantity;
        else rawStock = product.stockQuantity;
      } else if (
        size &&
        (product.sizeInventory as Record<string, number>)?.[size] !== undefined
      ) {
        rawStock = (product.sizeInventory as Record<string, number>)[size];
      } else {
        rawStock = product.stockQuantity;
      }
      const inCart = cart
        .filter(
          (i) =>
            i.product.id === product.id && i.size === size && i.color === color,
        )
        .reduce((s, i) => s + i.quantity, 0);
      return Math.max(0, rawStock - inCart);
    },
    [cart],
  );

  // During an exchange, the selected returned quantity is put back into
  // stock before the replacement sale is completed. Include that incoming
  // stock when showing/capping replacement quantities, while getAvailableStock
  // already subtracts anything reserved in the current POS cart.
  const getExchangeProjectedAvailableStock = useCallback(
    (product: Product, size?: string, color?: string): number => {
      const returningQty = exchangeOrder
        ? ((exchangeOrder.items || []) as any[]).reduce((sum: number, item: any, idx: number) => {
            const sameVariant =
              Number(item.productId ?? item.product_id) === product.id &&
              String(item.size || "") === String(size || "") &&
              String(item.color || "") === String(color || "");
            return sameVariant ? sum + Math.max(0, exchangeQtys[idx] || 0) : sum;
          }, 0)
        : 0;
      return Math.max(0, getAvailableStock(product, size, color) + returningQty);
    },
    [exchangeOrder, exchangeQtys, getAvailableStock],
  );

  /* ── Check if product has any stock at all (size-inventory aware) ───
   * Reads the actual per-size/per-color inventory numbers directly instead
   * of cross-referencing them against the product's top-level `sizes` list.
   * That cross-reference used to silently drop a product from the POS grid
   * whenever `sizes` didn't exactly match the inventory's own keys (stale
   * data, a size added to a color variant but not to the product-level
   * list, etc.) even though the product actually had stock. */
  const isProductInStock = useCallback((product: Product): boolean => {
    const colorVariants =
      (product.colorVariants as ColorVariant[] | undefined) || [];
    if (colorVariants.length > 0) {
      return colorVariants.some((cv) => {
        const inv = cv.sizeInventory as Record<string, number> | undefined;
        if (inv && Object.keys(inv).length > 0) {
          return Object.values(inv).some((q) => (q ?? 0) > 0);
        }
        // This variant has no per-size breakdown recorded — fall back to
        // the product's overall stock count so it isn't hidden by default.
        return product.stockQuantity > 0;
      });
    }
    const sizeInv = product.sizeInventory as Record<string, number> | undefined;
    if (sizeInv && Object.keys(sizeInv).length > 0) {
      return Object.values(sizeInv).some((q) => (q ?? 0) > 0);
    }
    return product.stockQuantity > 0;
  }, []);

  /* ── Total available for a product considering cart ─────────────── */
  const getProductCartAvail = useCallback(
    (product: Product): number => {
      const sizes = (product.sizes as string[]) || [];
      const colorVariants =
        (product.colorVariants as ColorVariant[] | undefined) || [];
      if (colorVariants.length > 0) {
        return colorVariants.reduce((total, cv) => {
          const inv = cv.sizeInventory as Record<string, number> | undefined;
          if (inv && sizes.length > 0)
            return (
              total +
              sizes.reduce(
                (s, sz) => s + getAvailableStock(product, sz, cv.name),
                0,
              )
            );
          return total + getAvailableStock(product, undefined, cv.name);
        }, 0);
      }
      const sizeInv = product.sizeInventory as
        | Record<string, number>
        | undefined;
      if (sizeInv && sizes.length > 0)
        return sizes.reduce(
          (s, sz) => s + getAvailableStock(product, sz, undefined),
          0,
        );
      return getAvailableStock(product, undefined, undefined);
    },
    [getAvailableStock],
  );

  /* ── Cart computed ─────────────────────────────────────────────────── */
  const cartSubtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const discountAmount = useMemo(() => {
    const v = parseFloat(discountValue) || 0;
    if (discountType === "percent")
      return Math.min(cartSubtotal * (v / 100), cartSubtotal);
    return Math.min(v, cartSubtotal);
  }, [cartSubtotal, discountType, discountValue]);
  const cartTotal = Math.max(0, cartSubtotal - discountAmount);
  const cashAmt = parseFloat(cashReceived) || 0;
  const cardAmt = parseFloat(cardReceived) || 0;
  const splitTotal = cashAmt + cardAmt;
  const changeAmount =
    paymentMethod === "split"
      ? Math.max(0, splitTotal - cartTotal)
      : Math.max(0, cashAmt - cartTotal);

  /* ── Broadcast cart to customer screen (deferred so UI stays snappy) ── */
  useEffect(() => {
    const payload = {
      items: cart.map((i) => ({
        productName: i.product.name,
        productNameAr: (i.product as any).nameAr || i.product.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        size: i.size,
        color: i.color,
        image: getProductImage(i.product, i.color),
      })),
      subtotal: cartSubtotal,
      discountAmount,
      total: cartTotal,
      paymentMethod,
      completed: false,
      currency: "₪",
    };
    // Defer to next idle frame — cart UI renders first, broadcast happens after
    const id = requestAnimationFrame(() => {
      try {
        posChannel.current?.postMessage({ type: "CART_UPDATE", payload });
        localStorage.setItem("lucerne_pos_cart", JSON.stringify(payload));
      } catch {}
    });
    return () => cancelAnimationFrame(id);
  }, [cart, discountAmount, cartTotal, paymentMethod, cartSubtotal]);

  /* ── Product filter (uses debounced search to avoid per-keystroke re-renders) */
  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => isProductInStock(p));
    if (categoryFilter !== "all")
      list = list.filter((p) => p.categoryId === categoryFilter);
    if (subcategoryFilter !== "all")
      list = list.filter((p) => {
        const ids = (p as any).subcategoryIds as number[] | undefined;
        if (Array.isArray(ids) && ids.length) return ids.includes(subcategoryFilter);
        return (p as any).subcategoryId === subcategoryFilter;
      });
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p as any).nameAr?.toLowerCase().includes(q) ||
          ((p as any).barcode ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, categoryFilter, subcategoryFilter, debouncedSearch, isProductInStock]);

  /* ── Pre-compute cart availability for every product once per cart change ── */
  const cartAvailMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of products) map.set(p.id, getProductCartAvail(p));
    return map;
  }, [products, cart, getProductCartAvail]);

  /* ── addToCart with stock limit ────────────────────────────────────── */
  const addToCart = useCallback(
    (
      product: Product,
      size?: string,
      color?: string,
      qty = 1,
      opts?: { forceNewSize?: boolean },
    ): number => {
      const price = product.discountPrice
        ? parseFloat(product.discountPrice as string)
        : parseFloat(product.price as string);
      const forceNewSize = !!opts?.forceNewSize;
      let actualQty: number;
      if (forceNewSize) {
        // Selling a size that isn't tracked in inventory yet — there's no
        // real "available" number to check against, so just cap it at a
        // sane safety ceiling instead of blocking the sale entirely.
        actualQty = Math.min(qty, POS_NEW_SIZE_MAX_QTY);
      } else {
        const avail = getAvailableStock(product, size, color);
        if (avail <= 0) {
          toast({
            title: ar ? "المخزون نفد لهذا المنتج" : "Out of stock",
            variant: "destructive",
          });
          return 0;
        }
        actualQty = Math.min(qty, avail);
        if (actualQty < qty)
          toast({
            title: ar
              ? `تم الإضافة بالكمية المتاحة (${actualQty})`
              : `Added ${actualQty} (max available)`,
            duration: 2000,
          });
      }
      const existingIdx = cart.findIndex(
        (i) =>
          i.product.id === product.id &&
          i.size === (size || undefined) &&
          i.color === (color || undefined),
      );
      if (existingIdx >= 0) {
        setCart((prev) =>
          prev.map((item, idx) =>
            idx === existingIdx
              ? { ...item, quantity: item.quantity + actualQty }
              : item,
          ),
        );
      } else {
        setCart((prev) => [
          ...prev,
          {
            product,
            quantity: actualQty,
            size: size || undefined,
            color: color || undefined,
            unitPrice: price,
            isNewSize: forceNewSize || undefined,
          },
        ]);
      }
      playAddToCartSound();
      return actualQty;
    },
    [cart, getAvailableStock, toast, ar],
  );

  /* ── updateQty with stock limit ────────────────────────────────────── */
  const updateQty = (idx: number, delta: number) => {
    setCart((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const nq = item.quantity + delta;
        if (nq <= 0) return item;
        if (delta > 0) {
          if (item.isNewSize) {
            if (item.quantity >= POS_NEW_SIZE_MAX_QTY) {
              toast({
                title: ar
                  ? `الحد الأقصى لمقاس غير مضاف هو ${POS_NEW_SIZE_MAX_QTY}`
                  : `Max ${POS_NEW_SIZE_MAX_QTY} for an untracked size`,
                variant: "destructive",
              });
              return item;
            }
            return { ...item, quantity: Math.min(nq, POS_NEW_SIZE_MAX_QTY) };
          }
          const avail = getAvailableStock(item.product, item.size, item.color);
          if (avail <= 0) {
            toast({
              title: ar ? "لا يوجد مخزون إضافي" : "No more stock",
              variant: "destructive",
            });
            return item;
          }
          return { ...item, quantity: Math.min(nq, item.quantity + avail) };
        }
        return { ...item, quantity: nq };
      }),
    );
  };

  const removeItem = (idx: number) =>
    setCart((prev) => prev.filter((_, i) => i !== idx));

  /* ── Change the color of an item already sitting in the cart ────────
     Keeps the current size when the new color still has stock in it;
     otherwise falls back to the first size that does. Caps quantity to
     whatever's available in the new color, and merges into an existing
     identical cart line (same product/size/new color) if one exists,
     the same way adding a duplicate item does. */
  const changeCartItemColor = (idx: number, newColorName: string) => {
    setCart((prev) => {
      const item = prev[idx];
      if (!item || item.color === newColorName) return prev;
      const colorVariants =
        (item.product.colorVariants as ColorVariant[] | undefined) || [];
      const cv = colorVariants.find((c) => c.name === newColorName);
      let newSize = item.size;
      if (cv) {
        const inv = cv.sizeInventory as Record<string, number> | undefined;
        const sizes = (item.product.sizes as string[]) || [];
        if (item.size && inv && (inv[item.size] ?? 0) <= 0) {
          newSize = sizes.find((sz) => (inv?.[sz] ?? 0) > 0) || undefined;
        }
      }
      const avail = getAvailableStock(item.product, newSize, newColorName);
      if (avail <= 0) {
        toast({
          title: ar ? "المخزون نفد لهذا اللون" : "Out of stock for this color",
          variant: "destructive",
        });
        return prev;
      }
      const newQty = Math.min(item.quantity, avail);
      const mergeIdx = prev.findIndex(
        (it, i) =>
          i !== idx &&
          it.product.id === item.product.id &&
          it.size === newSize &&
          it.color === newColorName,
      );
      if (mergeIdx >= 0) {
        const merged = [...prev];
        merged[mergeIdx] = {
          ...merged[mergeIdx],
          quantity: merged[mergeIdx].quantity + newQty,
        };
        merged.splice(idx, 1);
        return merged;
      }
      const updated = [...prev];
      updated[idx] = { ...item, color: newColorName, size: newSize, quantity: newQty };
      return updated;
    });
    setColorEditIdx(null);
  };

  useEffect(() => {
    if (colorEditIdx === null) return;
    const close = () => setColorEditIdx(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [colorEditIdx]);

  /* ── Change the size of an item already sitting in the cart ─────────
     Mirrors changeCartItemColor: keeps the current color, caps quantity
     to whatever's available in the new size, and merges into an
     existing identical cart line if one already exists for that
     product/new-size/color combo. */
  const changeCartItemSize = (idx: number, newSize: string) => {
    setCart((prev) => {
      const item = prev[idx];
      if (!item || item.size === newSize) return prev;
      const avail = getAvailableStock(item.product, newSize, item.color);
      if (avail <= 0) {
        toast({
          title: ar ? "المخزون نفد لهذا المقاس" : "Out of stock for this size",
          variant: "destructive",
        });
        return prev;
      }
      const newQty = Math.min(item.quantity, avail);
      const mergeIdx = prev.findIndex(
        (it, i) =>
          i !== idx &&
          it.product.id === item.product.id &&
          it.size === newSize &&
          it.color === item.color,
      );
      if (mergeIdx >= 0) {
        const merged = [...prev];
        merged[mergeIdx] = {
          ...merged[mergeIdx],
          quantity: merged[mergeIdx].quantity + newQty,
        };
        merged.splice(idx, 1);
        return merged;
      }
      const updated = [...prev];
      updated[idx] = { ...item, size: newSize, quantity: newQty };
      return updated;
    });
    setSizeEditIdx(null);
  };

  useEffect(() => {
    if (sizeEditIdx === null) return;
    const close = () => setSizeEditIdx(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [sizeEditIdx]);

  /* ── Picker ──────────────────────────────────────────────────────── */
  const openPicker = (product: Product, matchedColorName?: string) => {
    setPickerIsHintSize(false);
    const colors = (product.colorVariants as ColorVariant[] | undefined) || [];
    const sizes = (product.sizes as string[]) || [];
    // If the scan matched a color-specific barcode, jump straight to that
    // color instead of defaulting to the first one in the list.
    const firstColor =
      matchedColorName && colors.some((c) => c.name === matchedColorName)
        ? matchedColorName
        : colors.length > 0
          ? colors[0].name
          : "";
    const firstSize = sizes.length > 0 ? sizes[0] : "";
    if (colors.length <= 1 && sizes.length <= 1) {
      addToCart(product, firstSize || undefined, firstColor || undefined);
      toast({
        title: ar ? `تمت الإضافة: ${product.name}` : `Added: ${product.name}`,
        duration: 1200,
      });
      barcodeRef.current?.focus();
      return;
    }
    // Auto-select the first size that actually has stock for the chosen color
    const getStockForSize = (sz: string, color: string) => {
      const cv = (
        (product.colorVariants as ColorVariant[] | undefined) || []
      ).find((c) => c.name === color);
      if (cv && cv.sizeInventory)
        return (cv.sizeInventory as Record<string, number>)[sz] ?? 0;
      const sizeInv = product.sizeInventory as
        | Record<string, number>
        | undefined;
      if (sizeInv && sz in sizeInv) return sizeInv[sz] ?? 0;
      return product.stockQuantity;
    };
    const firstAvailSize =
      sizes.find((sz) => getStockForSize(sz, firstColor) > 0) ?? "";
    setPickerProduct(product);
    setPickerColor(firstColor);
    setPickerSize(firstAvailSize);
    setPickerQty(1);
  };

  const confirmPicker = () => {
    if (!pickerProduct) return;
    const sizes = (pickerProduct.sizes as string[]) || [];
    if (sizes.length > 0 && !pickerSize) {
      toast({
        title: ar ? "اختر المقاس" : "Select a size",
        variant: "destructive",
      });
      return;
    }
    addToCart(
      pickerProduct,
      pickerSize || undefined,
      pickerColor || undefined,
      pickerQty,
      { forceNewSize: pickerIsHintSize },
    );
    setPickerProduct(null);
    barcodeRef.current?.focus();
  };

  /* ── Barcode lookup — shared by manual field entry & global scanner capture ── */
  const processBarcode = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim().toLowerCase();
      if (!code) return;
      // Search cached products list by barcode — instant, no network round-trip.
      // Checks the product's main barcode first, then falls back to each
      // color's own barcode, so scanning a color-specific tag opens that
      // exact color on POS instead of defaulting to the first one.
      let matchedColor: string | undefined;
      const found = products.find((p) => {
        if (((p as any).barcode ?? "").toLowerCase() === code) return true;
        const cv = ((p as any).colorVariants as ColorVariant[] | undefined)?.find(
          (c) => (c.barcode ?? "").toLowerCase() === code,
        );
        if (cv) {
          matchedColor = cv.name;
          return true;
        }
        return false;
      });
      if (!found) {
        toast({
          title: ar ? "لم يُعثر على المنتج" : "Product not found",
          description: rawCode.trim(),
          variant: "destructive",
        });
        return;
      }
      openPicker(found, matchedColor);
    },
    [products, ar, toast, openPicker],
  );

  /* ── Barcode lookup for exchange replacement product ──────────────── */
  const processExchangeNewBarcode = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim().toLowerCase();
      if (!code) return;
      let matchedColor = "";
      const found = products.find((p) => {
        if (((p as any).barcode ?? "").toLowerCase() === code) return true;
        const variants = (p.colorVariants as ColorVariant[] | undefined) || [];
        const colorMatch = variants.find(
          (cv) => (cv.barcode ?? "").toLowerCase() === code,
        );
        if (colorMatch) {
          matchedColor = colorMatch.name;
          return true;
        }
        return false;
      });
      if (!found) {
        toast({
          title: ar ? "لم يُعثر على المنتج" : "Product not found",
          description: rawCode.trim(),
          variant: "destructive",
        });
        return;
      }
      const variants = (found.colorVariants as ColorVariant[] | undefined) || [];
      const selectedColor = matchedColor || (variants.length > 0 ? variants[0].name : "");
      const selectedVariant = variants.find((cv) => cv.name === selectedColor);
      const sizes = sortSizes(
        variants.length > 0
          ? ((selectedVariant?.sizes as string[] | undefined) || [])
          : ((found.sizes as string[]) || []),
      );
      const firstAvailableSize = sizes.find((size) => {
        const alreadySelected = exchangeReplacementItems
          .filter((item) =>
            item.product.id === found.id &&
            item.size === size &&
            item.color === (selectedColor || undefined),
          )
          .reduce((sum, item) => sum + item.quantity, 0);
        return getExchangeProjectedAvailableStock(found, size, selectedColor || undefined) - alreadySelected > 0;
      }) || "";
      setExchangeNewProduct(found);
      setExchangeNewSearch("");
      setExchangeReplacementResultsOpen(false);
      setExchangeNewSize(firstAvailableSize);
      setExchangeNewColor(selectedColor);
      setExchangeNewQty(1);
    },
    [products, ar, toast, exchangeReplacementItems, getExchangeProjectedAvailableStock],
  );

  const addExchangeReplacementDraft = useCallback(() => {
    if (!exchangeNewProduct) return;

    const variants =
      (exchangeNewProduct.colorVariants as ColorVariant[] | undefined) || [];
    if (variants.length > 0 && !exchangeNewColor) {
      toast({
        title: ar ? "اختر لون القطعة البديلة" : "Select a replacement color",
        variant: "destructive",
      });
      return;
    }

    const selectedVariant = variants.find((cv) => cv.name === exchangeNewColor);
    const availableSizes = sortSizes(
      variants.length > 0
        ? selectedVariant
          ? (selectedVariant.sizes as string[]) || []
          : []
        : ((exchangeNewProduct.sizes as string[]) || []),
    );
    if (availableSizes.length > 0 && !exchangeNewSize) {
      toast({
        title: ar ? "اختر مقاس القطعة البديلة" : "Select a replacement size",
        variant: "destructive",
      });
      return;
    }

    const sameAlreadySelected = exchangeReplacementItems
      .filter(
        (item) =>
          item.product.id === exchangeNewProduct.id &&
          item.size === (exchangeNewSize || undefined) &&
          item.color === (exchangeNewColor || undefined),
      )
      .reduce((sum, item) => sum + item.quantity, 0);
    const available = getExchangeProjectedAvailableStock(
      exchangeNewProduct,
      exchangeNewSize || undefined,
      exchangeNewColor || undefined,
    );
    const remaining = Math.max(0, available - sameAlreadySelected);
    if (remaining <= 0) {
      toast({
        title: ar ? "لا يوجد مخزون إضافي لهذه القطعة" : "No more stock for this item",
        variant: "destructive",
      });
      return;
    }
    if (exchangeNewQty > remaining) {
      toast({
        title: ar
          ? `الكمية المتوفرة للإضافة فقط ${remaining}`
          : `Only ${remaining} more available`,
        variant: "destructive",
      });
      return;
    }

    const unitPrice = parseFloat(
      (exchangeNewProduct.discountPrice as string | null) || exchangeNewProduct.price,
    );
    setExchangeReplacementItems((prev) => {
      const idx = prev.findIndex(
        (item) =>
          item.product.id === exchangeNewProduct.id &&
          item.size === (exchangeNewSize || undefined) &&
          item.color === (exchangeNewColor || undefined),
      );
      if (idx >= 0) {
        return prev.map((item, i) =>
          i === idx
            ? { ...item, quantity: item.quantity + exchangeNewQty }
            : item,
        );
      }
      return [
        ...prev,
        {
          product: exchangeNewProduct,
          quantity: exchangeNewQty,
          size: exchangeNewSize || undefined,
          color: exchangeNewColor || undefined,
          unitPrice,
        },
      ];
    });
    setExchangeNewProduct(null);
    setExchangeNewSearch("");
    setExchangeReplacementResultsOpen(false);
    setExchangeNewSize("");
    setExchangeNewColor("");
    setExchangeNewQty(1);
  }, [
    exchangeNewProduct,
    exchangeNewColor,
    exchangeNewSize,
    exchangeNewQty,
    exchangeReplacementItems,
    getExchangeProjectedAvailableStock,
    toast,
    ar,
  ]);

  const handleBarcodeEnter = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" || !barcodeInput.trim()) return;
      e.preventDefault();
      const value = barcodeInput;
      setBarcodeInput("");
      processBarcode(value);
    },
    [barcodeInput, processBarcode],
  );

  /* ── Hold & Recall ───────────────────────────────────────────────── */
  const holdCart = () => {
    if (cart.length === 0) return;
    setHeldCarts((prev) => [
      ...prev,
      {
        id: heldIdCounter++,
        cart: [...cart],
        discountType,
        discountValue,
        note,
        time: new Date(),
      },
    ]);
    setCart([]);
    setDiscountValue("");
    setNote("");
    setPaymentMethod(null);
    setCashReceived("");
    setCardReceived("");
    toast({ title: ar ? "تم تعليق الفاتورة" : "Cart held" });
  };
  const recallCart = (id: number) => {
    const held = heldCarts.find((h) => h.id === id);
    if (!held) return;
    if (
      cart.length > 0 &&
      !confirm(ar ? "استبدال الفاتورة الحالية؟" : "Replace current cart?")
    )
      return;
    setCart(held.cart);
    setDiscountType(held.discountType);
    setDiscountValue(held.discountValue);
    setNote(held.note);
    setPaymentMethod(null);
    setCashReceived("");
    setCardReceived("");
    setHeldCarts((prev) => prev.filter((h) => h.id !== id));
    toast({ title: ar ? "تم استرجاع الفاتورة" : "Cart recalled" });
  };

  /* ── Auto-scroll cart to bottom when new item added ─────────────── */
  useEffect(() => {
    cartEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cart.length]);

  /* ── Print barcode for a product ────────────────────────────────── */
  // Renders the barcode locally via renderBarcodeSvg (bundled JsBarcode,
  // no CDN script) so the name/price/barcode are all embedded as plain
  // markup in the popup from the start — nothing depends on an external
  // script loading in time before window.print() fires, which was why
  // the product name and price sometimes never made it onto the page.
  const printProductBarcode = (product: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    const priceValue = (product as any).discountPrice
      ? parseFloat((product as any).discountPrice).toFixed(2)
      : parseFloat(product.price as string).toFixed(2);
    // Some products have an extra barcode per color (a different physical
    // tag than the main one) — print a label for each of those too, right
    // alongside the main label, instead of only ever printing the main one.
    const colorVariants = ((product as any).colorVariants as ColorVariant[] | undefined) || [];
    const colorLabels = colorVariants.filter((c) => c.barcode && c.barcode.trim());
    const labels: { title: string; value: string }[] = [
      { title: product.name, value: (product as any).barcode || String(product.id) },
      ...colorLabels.map((c) => ({ title: `${product.name} — ${c.name}`, value: c.barcode! })),
    ];
    const labelsHtml = labels
      .map((l, i) => {
        const svg = renderBarcodeSvg(l.value, { height: 65, width: 2.6, fontSize: 15 });
        return `<div class="wrap${i < labels.length - 1 ? " page-break" : ""}">
<div class="name">${escHtml(l.title)}</div>
<div class="barcode-wrapper">${svg}</div>
<div class="price" style="direction:ltr;unicode-bidi:isolate;">&#8362;${priceValue}</div>
</div>`;
      })
      .join("");
    const w = window.open("", "_blank", "width=360,height=260");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Barcode</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%}
body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;min-height:100vh;background:#fff;color:#000}
.wrap{text-align:center;padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;max-width:100%}
.wrap.page-break{page-break-after:always}
.name{font-size:14px;font-weight:800;margin-bottom:8px;max-width:100%;overflow-wrap:break-word;text-align:center;width:100%;color:#000}
.price{font-size:18px;font-weight:800;margin-top:8px;text-align:center;width:100%;color:#000}
.barcode-wrapper{display:flex;justify-content:center;width:100%}
.barcode-wrapper svg{max-width:100%;height:auto}
@media print{
  html,body{width:auto;height:auto;min-height:unset}
  @page{margin:4mm}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  .name,.price{color:#000 !important;}
}
</style></head>
<body>${labelsHtml}</body></html>`);
    w.document.close();
    // Give the popup a moment to lay out the embedded SVG/fonts before
    // invoking the browser's print dialog.
    setTimeout(() => {
      w.focus();
      w.print();
    }, 250);
  };

  /* ── Print invoice ───────────────────────────────────────────────── */
  const triggerPrint = (order: CompletedOrder) => {
    const dateStr = format(order.date, "yyyy-MM-dd");
    const timeStr = format(order.date, "hh:mm a");
    const itemsHtml = order.items
      .map(
        (item) => `
      <tr>
        <td class="td-name">${escHtml(item.product.name)}${item.size || item.color ? `<span class="variant">${[item.size, item.color].filter(Boolean).join(" · ")}</span>` : ""}</td>
        <td class="td-qty" style="direction:ltr;unicode-bidi:isolate;">${item.quantity}</td>
        <td class="td-price" style="direction:ltr;unicode-bidi:isolate;">₪${(item.unitPrice * item.quantity).toFixed(2)}</td>
      </tr>`,
      )
      .join("");
    const isExchangeInvoice = isExchangeOrder(order.note);
    const noteHtml = order.note
      ? `<div class="${isExchangeInvoice ? "order-note exchange-note" : "order-note"}">${escHtml(order.note).replace(/\n/g, "<br>")}</div>`
      : "";
    const splitHtml =
      order.paymentMethod === "split"
        ? `
      <div class="cash-row"><span>نقدي</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${order.cashReceived.toFixed(2)}</span></div>
      <div class="cash-row"><span>بطاقة</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${order.cardReceived.toFixed(2)}</span></div>`
        : "";
    const receiptHtml = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${isExchangeInvoice ? "فاتورة تبديل" : "فاتورة"} #${order.id}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#fff;color:#1a1a1a;max-width:360px;margin:0 auto;padding:0 20px 20px;font-size:13px}
  .hdr{text-align:center;padding-bottom:18px}.hdr-bar{height:3px;background:linear-gradient(90deg,#e8d5b7,#1a1a1a 40%,#e8d5b7);margin-bottom:6px;border-radius:2px}
  .hdr-logo{font-size:26px;font-weight:800;letter-spacing:8px;text-transform:uppercase;color:#111;line-height:1}
  .hdr-sub{font-size:10px;letter-spacing:5px;text-transform:uppercase;color:#888;margin-top:4px}
  .hdr-city{font-size:11px;color:#aaa;margin-top:6px;letter-spacing:1px}
  .hdr-bar-bottom{height:1px;background:linear-gradient(90deg,transparent,#ccc,transparent);margin-top:14px}
  .meta{display:flex;justify-content:space-between;align-items:center;margin:14px 0;padding:10px 12px;background:#f7f5f2;border-radius:6px}
  .meta-inv{font-size:13px;font-weight:700;color:#111}.meta-date{font-size:11px;color:#666}.meta-time{font-size:10px;color:#aaa}
  .exchange-badge{display:flex;align-items:center;justify-content:center;gap:6px;background:#1c3d7a;color:#fff;font-size:12px;font-weight:800;letter-spacing:1px;padding:8px 10px;border-radius:6px;margin-top:12px;text-transform:uppercase}
  .order-note{background:#fffbe6;border:1px solid #ffe58f;border-radius:5px;padding:7px 10px;margin-bottom:12px;font-size:11px;color:#7a6000;white-space:pre-wrap;line-height:1.6}
  .order-note.exchange-note{background:#eef4ff;border:1.5px solid #b6cdfb;color:#1c3d7a;font-size:11px;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-top:4px}thead tr{border-bottom:2px solid #1a1a1a}
  th{padding:7px 6px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#555}
  th:first-child{text-align:right}th:nth-child(2){text-align:center}th:last-child{text-align:left}
  td{padding:9px 6px;vertical-align:top;border-bottom:1px dashed #e0dcd6}
  .td-name{text-align:right;font-size:12px;font-weight:500;line-height:1.4}.td-qty{text-align:center;font-size:12px;color:#555}
  .td-price{text-align:left;font-size:12px;font-weight:600;white-space:nowrap}
  .variant{display:block;font-size:10px;color:#999;margin-top:2px;font-weight:400}
  .totals{margin-top:6px}.totals-row{display:flex;justify-content:space-between;align-items:center;padding:5px 6px;font-size:12px;color:#555}
  .totals-row.discount{color:#cc3333}.totals-divider{height:1px;background:#e0dcd6;margin:4px 0}
  .totals-final{display:flex;justify-content:space-between;align-items:center;padding:12px 6px 10px;border-top:2px solid #1a1a1a;margin-top:2px}
  .totals-final .label{font-size:14px;font-weight:700}.totals-final .amount{font-size:20px;font-weight:800;letter-spacing:-0.5px}
  .cash-row{display:flex;justify-content:space-between;padding:6px 8px;font-size:12px;color:#555;background:#fafaf8;border-radius:4px;margin-top:4px}
  .change-row{display:flex;justify-content:space-between;padding:10px 8px;background:#f0faf0;border:1px solid #c3e6c3;border-radius:6px;margin-top:6px}
  .change-row .label{font-size:13px;font-weight:700;color:#1a6b1a}.change-row .amount{font-size:15px;font-weight:800;color:#1a6b1a}
  .ftr{text-align:center;margin-top:22px;padding-top:16px}.ftr-dots{letter-spacing:3px;color:#ccc;font-size:14px;margin-bottom:10px}
  .ftr-thanks{font-size:14px;font-weight:600;color:#333;margin-bottom:4px}.ftr-brand{font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#bbb}
  .ftr-policy{font-size:10px;color:#888;margin-top:6px;line-height:1.5;border-top:1px dashed #e0dcd6;padding-top:8px}
  .ftr-policy:first-of-type{margin-top:10px}
  .ftr-policy.strong{color:#555;font-weight:700}
  .ftr-policy.exchange-lock{color:#111;font-weight:800;border:1.5px solid #111;border-radius:5px;padding:8px 6px;margin-top:8px}
  .inv-barcode{display:flex;justify-content:center;width:100%;margin-top:16px}
  .inv-barcode svg{max-width:100%;height:auto}
  @media print{
    body{min-height:unset}
    @page{size:80mm auto;margin:0 4mm 4mm 4mm}
    /* Force full black ink + bold weight so receipt/thermal printers render everything crisply */
    *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
    body,.hdr-logo,.hdr-sub,.hdr-city,.meta-inv,.meta-date,.meta-time,.order-note,
    th,.td-name,.td-qty,.td-price,.variant,
    .totals-row,.totals-row.discount,.totals-final .label,.totals-final .amount,
    .cash-row,.change-row .label,.change-row .amount,
    .ftr-thanks,.ftr-brand,.ftr-policy,.ftr-dots{
      color:#000 !important;
      font-weight:700 !important;
      -webkit-text-stroke:0.2px #000;
    }
    .hdr-bar,.hdr-bar-bottom,thead tr,table,.totals-final,td,.change-row,.order-note{
      border-color:#000 !important;
      background:#fff !important;
    }
    .exchange-badge{
      background:#000 !important;
      color:#fff !important;
      border:1.5px solid #000 !important;
    }
    svg path{fill:#000 !important;}
    .inv-barcode svg text{fill:#000 !important;}
  }
</style></head><body>
<div class="hdr"><div class="hdr-bar"></div><svg style="width:60px;height:46px;margin:0 auto 2px;display:block;" version="1.0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 393 297"><g transform="translate(0,297) scale(0.1,-0.1)" fill="#000" stroke="#000" stroke-width="6"><path d="M2685 2594 c-179 -27 -296 -59 -490 -136 -259 -103 -609 -284 -965 -501 -126 -77 -160 -104 -160 -124 0 -26 34 -12 158 65 434 269 823 464 1138 571 167 57 252 73 379 75 100 1 115 -1 160 -25 105 -53 147 -157 126 -310 -15 -115 -53 -252 -108 -389 -114 -287 -230 -468 -408 -638 -133 -127 -246 -199 -407 -257 -76 -27 -77 -27 -101 -9 -113 89 -164 123 -242 160 -128 61 -190 76 -342 81 -115 5 -141 3 -201 -16 -114 -34 -167 -103 -125 -159 11 -15 37 -37 59 -49 52 -30 240 -89 334 -105 102 -17 356 -17 449 1 l74 15 49 -55 c67 -75 133 -175 176 -267 33 -70 37 -85 37 -163 0 -78 -2 -89 -27 -122 -16 -20 -53 -48 -85 -64 -55 -27 -64 -28 -198 -28 -145 0 -184 8 -345 66 -194 71 -407 241 -518 414 -151 234 -171 410 -152 1340 4 223 3 256 -13 301 -37 107 -122 196 -225 235 -71 26 -176 37 -187 19 -12 -19 23 -40 64 -40 69 0 161 -41 217 -96 57 -57 104 -160 104 -227 0 -39 -17 -49 -39 -24 -6 8 -35 19 -64 26 -103 23 -199 -28 -248 -133 -59 -124 -18 -252 87 -274 60 -13 151 6 196 40 18 14 37 26 42 27 6 0 10 -131 11 -337 2 -555 40 -725 211 -949 208 -272 589 -458 899 -440 163 10 250 52 298 146 64 128 4 322 -165 534 -32 39 -58 75 -58 80 0 4 10 12 23 17 12 5 56 23 99 40 222 90 465 318 620 583 130 221 234 512 257 716 20 186 -46 322 -179 366 -48 16 -166 26 -215 19z m-1854 -495 c30 -12 55 -50 64 -99 9 -50 -36 -135 -92 -174 -34 -23 -53 -29 -102 -30 -53 -1 -64 2 -87 26 -38 37 -44 107 -14 175 45 104 128 141 231 102z m759 -1010 c92 -23 220 -84 294 -139 100 -73 76 -85 -169 -85 -189 1 -281 15 -424 66 -113 39 -145 59 -149 91 -5 38 38 61 173 92 38 9 200 -6 275 -25z"/></g></svg><div class="hdr-logo">LUCERNE</div><div class="hdr-sub">B O U T I Q U E</div><div class="hdr-city">رام الله</div><div class="hdr-bar-bottom"></div>${isExchangeInvoice ? `<div class="exchange-badge">🔄 فاتورة تبديل &nbsp;·&nbsp; EXCHANGE INVOICE</div>` : ""}</div>
<div class="meta"><div class="meta-inv">${isExchangeInvoice ? "فاتورة تبديل" : "فاتورة"} &nbsp;<span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">#${order.id}</span></div><div style="text-align:left;"><div class="meta-date" style="direction:ltr;unicode-bidi:isolate;">${dateStr}</div><div class="meta-time" style="direction:ltr;unicode-bidi:isolate;">${timeStr}</div></div></div>
${noteHtml}
<table><thead><tr><th>المنتج</th><th>الكمية</th><th>المجموع</th></tr></thead><tbody>${itemsHtml}</tbody></table>
<div class="totals">
  ${order.discountAmount > 0 ? `<div class="totals-divider"></div><div class="totals-row"><span>المجموع الفرعي</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${order.subtotal.toFixed(2)}</span></div><div class="totals-row discount"><span>خصم</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">- ₪${order.discountAmount.toFixed(2)}</span></div>` : ""}
  <div class="totals-final"><span class="label">الإجمالي</span><span class="amount" style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${order.total.toFixed(2)}</span></div>
  ${splitHtml}
  ${order.paymentMethod === "cash" && order.cashReceived > 0 ? `<div class="cash-row"><span>المبلغ المدفوع</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${order.cashReceived.toFixed(2)}</span></div><div class="change-row"><span class="label">الباقي للزبون</span><span class="amount" style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${order.change.toFixed(2)}</span></div>` : ""}
</div>
<div class="inv-barcode">${renderBarcodeSvg(String(order.id), { height: 40, width: 1.8, fontSize: 12 })}</div>
<div class="ftr"><div class="ftr-dots">· · · · · · · · · · · ·</div><div class="ftr-thanks">شكراً لتسوقكم</div><div class="ftr-brand">LUCERNE BOUTIQUE</div>${isExchangeInvoice ? `<div class="ftr-policy exchange-lock">أي منتج في فاتورة التبديل هذه لا يمكن تبديله مرة أخرى</div>` : `<div class="ftr-policy strong">يجب إحضار هذه الفاتورة لإتمام أي عملية تبديل</div><div class="ftr-policy">مدة التبديل: يومان (٤٨ ساعة) من تاريخ الشراء فقط</div>`}<div class="ftr-policy">القطع الرسمية لا تبدل &nbsp;·&nbsp; الفساتين لا تبدل &nbsp;·&nbsp; العبايات لا تبدل &nbsp;·&nbsp; لا يوجد ترجيع لجميع القطع</div></div>
</body></html>`;

    // Running inside the Lucerne POS desktop app (Electron)? Print truly
    // silently — straight to the configured/default printer, with NO
    // system print dialog and NO click required at all.
    const electronPOS = (window as any).electronPOS;
    if (electronPOS?.printReceipt) {
      electronPOS
        .printReceipt(receiptHtml)
        .then((res: any) => {
          if (res && res.ok === false) {
            toast({
              title: ar ? "تعذّرت الطباعة" : "Print failed",
              description: res.error,
              variant: "destructive",
            });
          }
        })
        .catch((err: any) => {
          toast({
            title: ar ? "تعذّرت الطباعة" : "Print failed",
            description: err?.message || String(err),
            variant: "destructive",
          });
        });
      return;
    }

    // Fallback for plain browser tabs (no Electron bridge available): use
    // the hidden iframe + window.print(). Browsers always show their own
    // native print dialog here — that click can only be skipped by running
    // the desktop app above, or by launching Chrome with the
    // --kiosk-printing flag.
    const iframe = printFrameRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(receiptHtml);
    doc.close();
    const win = iframe.contentWindow;
    if (win) {
      setTimeout(() => {
        win.focus();
        win.print();
      }, 150);
    }
  };

  /* ── Shift summary print ─────────────────────────────────────────── */
  const printShiftSummary = (
    scope: "all" | "shoes" | "other" = "all",
    ordersOverride?: any[],
  ) => {
    // Bug fix: comparing new Date().toISOString() (always UTC) against each
    // order's raw created_at string mismatched the actual local business
    // day by several hours depending on the server's timezone — orders
    // placed late at night could vanish from, or get pulled into, the
    // wrong day's summary. Comparing local calendar dates (via date-fns
    // format(), which reads local time) instead fixes that.
    const todayStr = format(new Date(), "yyyy-MM-dd");
    // Bug fix: callers do `await refetchOrders(); printShiftSummary()`.
    // refetchOrders() resolving does NOT mean this component has
    // re-rendered yet, so the `posOrders` this closure captured could
    // still be the array from before the refetch — printing a summary
    // that's missing the latest invoice(s) of the day. Callers now pass
    // the freshly-resolved orders straight from refetch's result so the
    // summary always reflects what's actually in the database right now.
    const sourceOrders = ordersOverride ?? posOrders;
    const todayOrders = sourceOrders.filter((o: any) => {
      const raw = o.created_at || o.createdAt;
      if (!raw) return false;
      if (format(new Date(raw), "yyyy-MM-dd") !== todayStr) return false;
      return orderMatchesShiftScope(
        o,
        scope,
        shoeCategoryIds,
        productCategoryById,
      );
    });
    const cashOrders = todayOrders.filter(
      (o: any) => (o.payment_method || o.paymentMethod) === "cash",
    );
    const cardOrders = todayOrders.filter(
      (o: any) => (o.payment_method || o.paymentMethod) === "card",
    );
    const splitOrders = todayOrders.filter(
      (o: any) => (o.payment_method || o.paymentMethod) === "split",
    );
    const totalRev = todayOrders.reduce(
      (s: number, o: any) =>
        s + getPosOrderScopedRevenue(o, scope, shoeCategoryIds, productCategoryById),
      0,
    );
    // Pure cash/card orders only — kept separate from the split share so
    // the invoice counts shown next to each amount stay accurate.
    const pureCashRev = cashOrders.reduce(
      (s: number, o: any) =>
        s + getPosOrderScopedRevenue(o, scope, shoeCategoryIds, productCategoryById),
      0,
    );
    const pureCardRev = cardOrders.reduce(
      (s: number, o: any) =>
        s + getPosOrderScopedRevenue(o, scope, shoeCategoryIds, productCategoryById),
      0,
    );
    // Each split invoice's own cash/card portions, scaled to this scope.
    const splitCashRev = splitOrders.reduce((s: number, o: any) => {
      const share =
        getPosOrderScopedRevenue(o, scope, shoeCategoryIds, productCategoryById) /
        Math.max(getPosOrderTotal(o), 0.01);
      return s + getPosOrderPaymentSplit(o).cash * share;
    }, 0);
    const splitCardRev = splitOrders.reduce((s: number, o: any) => {
      const share =
        getPosOrderScopedRevenue(o, scope, shoeCategoryIds, productCategoryById) /
        Math.max(getPosOrderTotal(o), 0.01);
      return s + getPosOrderPaymentSplit(o).card * share;
    }, 0);
    // What should actually be in the cash drawer / went through the card
    // machine today — pure cash/card invoices PLUS each split invoice's
    // matching share. This is the number that must reconcile against the
    // register and the card machine, so it's shown as its own bold total.
    const cashRev = pureCashRev + splitCashRev;
    const cardRev = pureCardRev + splitCardRev;
    const totalDiscount = todayOrders.reduce(
      (s: number, o: any) =>
        s +
        getPosOrderScopedDiscount(
          o,
          scope,
          shoeCategoryIds,
          productCategoryById,
        ),
      0,
    );
    const totalItems = todayOrders.reduce(
      (s: number, o: any) =>
        s + countPosOrderScopedItems(o, scope, shoeCategoryIds, productCategoryById),
      0,
    );
    const dateStr = todayStr;
    const scopeLabel =
      scope === "shoes"
        ? " · قسم الأحذية"
        : scope === "other"
          ? " · باقي الأقسام"
          : "";
    const pageTitle = scope === "all" ? "ملخص اليوم" : `ملخص اليوم${scopeLabel}`;
    const summaryHtml = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${pageTitle}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:6px 20px 20px;max-width:340px;margin:0 auto;color:#000}
h1{text-align:center;font-size:24px;font-weight:800;letter-spacing:3px;margin-bottom:6px}
p.sub{text-align:center;font-size:14px;font-weight:600;color:#444;margin-bottom:18px}
.row{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1.5px dashed #999;font-size:17px;font-weight:600}
.row span:last-child{font-weight:800;font-size:18px}
.subrow{display:flex;justify-content:space-between;align-items:center;padding:5px 0 5px 14px;border-bottom:1px dashed #ccc;font-size:13px;font-weight:500;color:#555}
.subrow span:last-child{font-weight:700;font-size:13px;color:#333}
.section-label{font-size:11px;font-weight:700;letter-spacing:1px;color:#888;text-transform:uppercase;margin:14px 0 2px}
.total-row{display:flex;justify-content:space-between;align-items:center;padding:16px 0 6px;font-size:24px;font-weight:800;border-top:3px solid #000;margin-top:8px}
@media print{
  @page{size:80mm auto;margin:0 4mm 4mm 4mm}
  *{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;color-adjust:exact !important;}
  body,h1,p.sub,.row,.row span,.subrow,.subrow span,.section-label,.total-row{color:#000 !important;font-weight:700 !important;-webkit-text-stroke:0.2px #000;}
  .row{border-color:#000 !important;}
  .subrow{border-color:#000 !important;}
  .total-row{border-color:#000 !important;}
}
</style></head><body>
<h1>LUCERNE BOUTIQUE</h1><p class="sub">ملخص اليوم${scopeLabel} · ${dateStr}</p>
<div class="row"><span>عدد الفواتير</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">${todayOrders.length}</span></div>
<div class="row"><span>قطع مباعة</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">${totalItems}</span></div>
<div class="row"><span>نقدي فقط</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${pureCashRev.toFixed(2)} (${cashOrders.length})</span></div>
<div class="row"><span>بطاقة فقط</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${pureCardRev.toFixed(2)} (${cardOrders.length})</span></div>
${splitOrders.length ? `<div class="row"><span>مختلط</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">${splitOrders.length} فاتورة</span></div>
<div class="subrow"><span>↳ نقدي</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${splitCashRev.toFixed(2)}</span></div>
<div class="subrow"><span>↳ بطاقة</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${splitCardRev.toFixed(2)}</span></div>` : ""}
<div class="section-label">الإجمالي حسب طريقة الدفع</div>
<div class="row"><span>إجمالي النقدي</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${cashRev.toFixed(2)}</span></div>
<div class="row"><span>إجمالي البطاقة</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${cardRev.toFixed(2)}</span></div>
${totalDiscount > 0 ? `<div class="row"><span>إجمالي الخصومات</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">- ₪${totalDiscount.toFixed(2)}</span></div>` : ""}
<div class="total-row"><span>الإجمالي</span><span style="direction:ltr;unicode-bidi:isolate;display:inline-block;">₪${totalRev.toFixed(2)}</span></div>
</body></html>`;

    // Same silent, no-dialog path as receipts when running in the desktop
    // app — more reliable than a popup window, which can be blocked.
    const electronPOS = (window as any).electronPOS;
    if (electronPOS?.printReceipt) {
      electronPOS
        .printReceipt(summaryHtml)
        .then((res: any) => {
          if (res && res.ok === false) {
            toast({
              title: ar ? "تعذّرت الطباعة" : "Print failed",
              description: res.error,
              variant: "destructive",
            });
          }
        })
        .catch((err: any) => {
          toast({
            title: ar ? "تعذّرت الطباعة" : "Print failed",
            description: err?.message || String(err),
            variant: "destructive",
          });
        });
      return;
    }

    const w = window.open("", "_blank", "width=400,height=500");
    if (!w) {
      toast({
        title: ar ? "تم حظر النافذة المنبثقة" : "Popup blocked",
        description: ar
          ? "اسمح بالنوافذ المنبثقة لهذا الموقع لطباعة الملخص"
          : "Allow popups for this site to print the summary",
        variant: "destructive",
      });
      return;
    }
    w.document.write(
      summaryHtml.replace(
        "</body></html>",
        `<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};}</script></body></html>`,
      ),
    );
    w.document.close();
  };

  /* ── Export to Excel ─────────────────────────────────────────────── */
  const exportToExcel = async () => {
    const rows = posOrders.map((o: any) => ({
      "رقم الفاتورة": o.id,
      التاريخ: o.created_at || o.createdAt ? format(new Date(o.created_at || o.createdAt), "yyyy-MM-dd hh:mm a") : "",
      "طريقة الدفع": o.payment_method || o.paymentMethod || "",
      "المجموع الفرعي": getPosOrderStoredSubtotal(o).toFixed(2),
      الخصم: getPosOrderDiscount(o).toFixed(2),
      الإجمالي: getPosOrderTotal(o).toFixed(2),
      ملاحظة: o.note || "",
      المنتجات: (o.items || [])
        .map((i: any) => `${i.name}×${i.quantity}`)
        .join(", "),
    }));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("المبيعات");
    if (rows.length > 0) {
      ws.addRow(Object.keys(rows[0]));
      rows.forEach((row) => ws.addRow(Object.values(row)));
    }
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lucerne-pos-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ── Complete sale ───────────────────────────────────────────────── */
  const completeSale = async () => {
    if (cart.length === 0 || !paymentMethod) return;
    if (paymentMethod === "cash" && cashAmt < cartTotal) {
      toast({
        title: ar ? "المبلغ المدفوع أقل من الإجمالي" : "Insufficient amount",
        variant: "destructive",
      });
      return;
    }
    if (paymentMethod === "split" && Math.abs(splitTotal - cartTotal) > 0.01) {
      toast({
        title: ar
          ? `مجموع الدفع لا يتطابق مع الإجمالي (₪${cartTotal.toFixed(2)})`
          : `Split amounts must equal ₪${cartTotal.toFixed(2)}`,
        variant: "destructive",
      });
      return;
    }
    setCompleting(true);
    try {
      const res = await fetch("/api/pos/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          totalAmount: cartTotal.toFixed(2),
          subtotalAmount: cartSubtotal.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          paymentMethod,
          note: note || null,
          cashAmount:
            paymentMethod === "cash"
              ? cashAmt
              : paymentMethod === "split"
                ? cashAmt
                : null,
          cardAmount:
            paymentMethod === "card"
              ? cartTotal
              : paymentMethod === "split"
                ? cardAmt
                : null,
          items: cart.map((i) => ({
            productId: i.product.id,
            name: i.product.name,
            barcode: (i.product as any).barcode || null,
            quantity: i.quantity,
            price: i.unitPrice.toFixed(2),
            size: i.size,
            color: i.color,
            newSize: i.isNewSize || undefined,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const stockError = res.status === 409;
        toast({
          title: stockError
            ? (ar ? "مخزون غير كافٍ" : "Out of Stock")
            : (ar ? "فشل في إتمام البيع" : "Sale failed"),
          description: body.message || undefined,
          variant: "destructive",
        });
        if (stockError) {
          qc.invalidateQueries({ queryKey: ["/api/products"] });
          /* Reconcile the cart against real, fresh stock so the cashier can
             immediately press Complete Sale again with what's available
             (e.g. a website customer bought the piece a second ago). */
          try {
            const fres = await fetch("/api/products", { cache: "no-store", credentials: "include" });
            if (fres.ok) {
              const fdata = await fres.json();
              const list: any[] = Array.isArray(fdata) ? fdata : (fdata?.data ?? []);
              const byId = new Map(list.map((pr: any) => [pr.id, pr]));
              const availFor = (pr: any, size?: string, color?: string): number => {
                if (!pr) return 0;
                const cvs: any[] = pr.colorVariants || [];
                if (cvs.length > 0 && color) {
                  const cv = cvs.find((c: any) => c.name === color);
                  if (!cv) return 0;
                  const inv = cv.sizeInventory || {};
                  if (size) return Math.max(0, Number(inv[size] ?? 0));
                  return Object.values(inv).reduce((t: number, q: any) => t + (Number(q) || 0), 0);
                }
                const inv = pr.sizeInventory || {};
                if (size && inv[size] !== undefined) return Math.max(0, Number(inv[size] ?? 0));
                return Math.max(0, Number(pr.stockQuantity ?? 0));
              };
              const removed: string[] = [];
              const reduced: string[] = [];
              setCart((prev) => {
                const next: typeof prev = [];
                const used = new Map<string, number>();
                for (const item of prev) {
                  const key = `${item.product.id}|${item.size || ""}|${item.color || ""}`;
                  const already = used.get(key) || 0;
                  const avail = availFor(byId.get(item.product.id), item.size, item.color) - already;
                  if (avail <= 0) {
                    removed.push(item.product.name);
                    continue;
                  }
                  const q = Math.min(item.quantity, avail);
                  if (q < item.quantity) reduced.push(`${item.product.name} ×${q}`);
                  used.set(key, already + q);
                  next.push({ ...item, quantity: q });
                }
                return next;
              });
              if (removed.length > 0 || reduced.length > 0) {
                toast({
                  title: ar ? "تم تحديث السلة حسب المخزون الفعلي" : "Cart updated to real stock",
                  description: [
                    removed.length > 0 ? (ar ? `أزيل: ${removed.join("، ")}` : `Removed: ${removed.join(", ")}`) : "",
                    reduced.length > 0 ? (ar ? `عُدّل: ${reduced.join("، ")}` : `Adjusted: ${reduced.join(", ")}`) : "",
                  ].filter(Boolean).join(" — "),
                });
              }
            }
          } catch {}
        }
        return;
      }
      const order = await res.json();
      const finished: CompletedOrder = {
        id: order.id,
        items: [...cart],
        subtotal: cartSubtotal,
        discountAmount,
        total: cartTotal,
        date: new Date(),
        cashReceived: cashAmt,
        cardReceived: cardAmt,
        change: changeAmount,
        paymentMethod,
        note,
      };
      setCompletedOrder(finished);
      /* Broadcast completion to customer screen */
      try {
        const completedPayload = {
          items: finished.items.map((i) => ({
            productName: i.product.name,
            productNameAr: (i.product as any).nameAr || i.product.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            size: i.size,
            color: i.color,
            image: getProductImage(i.product, i.color),
          })),
          subtotal: finished.subtotal,
          discountAmount: finished.discountAmount,
          total: finished.total,
          paymentMethod: finished.paymentMethod,
          completed: true,
          currency: "₪",
        };
        posChannel.current?.postMessage({ type: "CART_UPDATE", payload: completedPayload });
        localStorage.setItem("lucerne_pos_cart", JSON.stringify(completedPayload));
      } catch {}
      setCart([]);
      setDiscountValue("");
      setNote("");
      setPaymentMethod(null);
      setCashReceived("");
      setCardReceived("");
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/pos/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/low-stock"] });
      toast({
        title: ar
          ? `✓ تم البيع — فاتورة #${order.id}`
          : `✓ Sale done — Invoice #${order.id}`,
      });
      if (autoPrint) triggerPrint(finished);
      barcodeRef.current?.focus();
    } catch (err: any) {
      toast({
        title: ar ? "خطأ في الاتصال" : "Connection error",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setCompleting(false);
    }
  };

  /* ── Return/Refund ───────────────────────────────────────────────── */
  const searchReturn = useCallback(async (codeOverride?: string) => {
    const code = (codeOverride ?? returnSearch).trim();
    if (!code) return;
    try {
      const res = await fetch(`/api/pos/orders/${code}`, {
        credentials: "include",
      });
      if (!res.ok) {
        toast({
          title: ar ? "الفاتورة غير موجودة" : "Invoice not found",
          variant: "destructive",
        });
        return;
      }
      const order = await res.json();
      setReturnOrder(order);
      const qtys: Record<number, number> = {};
      (order.items || []).forEach((item: any, i: number) => {
        qtys[i] = 0;
      });
      setReturnQtys(qtys);
    } catch {
      toast({
        title: ar ? "خطأ في البحث" : "Search error",
        variant: "destructive",
      });
    }
  }, [returnSearch, ar, toast]);

  const processReturn = async () => {
    if (!returnOrder) return;
    const itemsToReturn = (returnOrder.items || [])
      .map((item: any, i: number) => ({
        ...item,
        returnQty: returnQtys[i] || 0,
      }))
      .filter((item: any) => item.returnQty > 0);
    if (itemsToReturn.length === 0) {
      toast({
        title: ar ? "اختر كميات للإرجاع" : "Select return quantities",
        variant: "destructive",
      });
      return;
    }
    setProcessingReturn(true);
    try {
      const res = await fetch("/api/pos/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: returnOrder.id,
          items: itemsToReturn.map((item: any) => ({
            productId: item.productId,
            quantity: item.returnQty,
            size: item.size,
            color: item.color,
          })),
        }),
      });
      if (!res.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/pos/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/low-stock"] });
      toast({
        title: ar
          ? "✓ تم المرتجع وتحديث المخزون"
          : "✓ Return processed, stock updated",
      });
      setReturnMode(false);
      setReturnOrder(null);
      setReturnSearch("");
      setReturnQtys({});
    } catch {
      toast({
        title: ar ? "فشل في معالجة المرتجع" : "Return failed",
        variant: "destructive",
      });
    } finally {
      setProcessingReturn(false);
    }
  };

  /* ── Exchange ────────────────────────────────────────────────────── */
  const EXCHANGE_DAYS_LIMIT = 2;
  const DRESSES_CATEGORY_ID = 1;

  const isExchangeExpired = (order: any): boolean => {
    const orderDate = new Date(order.created_at || order.createdAt || "");
    const diffMs = Date.now() - orderDate.getTime();
    return diffMs > EXCHANGE_DAYS_LIMIT * 86400000;
  };

  const getItemCategoryId = (item: any): number | null => {
    const p = (products as Product[]).find((pr) => pr.id === item.productId);
    return p ? p.categoryId : null;
  };

  const searchExchange = useCallback(async (codeOverride?: string) => {
    const code = (codeOverride ?? exchangeSearch).trim();
    if (!code) return;
    try {
      const res = await fetch(`/api/pos/orders/${code}`, {
        credentials: "include",
      });
      if (!res.ok) {
        toast({
          title: ar ? "الفاتورة غير موجودة" : "Invoice not found",
          variant: "destructive",
        });
        return;
      }
      const order = await res.json();
      setExchangeOrder(order);
      setExchangeOverride(false);
      setDressOverrideItems(new Set());
      const qtys: Record<number, number> = {};
      (order.items || []).forEach((_: any, i: number) => {
        qtys[i] = 0;
      });
      setExchangeQtys(qtys);
      setExchangeReplacementItems([]);
      setExchangeNewSearch("");
      setExchangeReplacementResultsOpen(false);
      setExchangeNewProduct(null);
      setExchangeNewSize("");
      setExchangeNewColor("");
      setExchangeNewQty(1);
      setExchangeCategoryFilter("all");
      setExchangeSubcategoryFilter("all");
      setExchangeOpenSubcategoryFor(null);
    } catch {
      toast({
        title: ar ? "خطأ في البحث" : "Search error",
        variant: "destructive",
      });
    }
  }, [exchangeSearch, ar, toast]);

  /* ── Global barcode-scanner capture ──────────────────────────────────
     A barcode scanner behaves like a very fast keyboard: every character
     of the code arrives just a few milliseconds apart, followed by Enter.
     This listens on the whole page (capture phase) whenever the POS tab
     is active, so a scan always works — even if the cursor is sitting in
     the product search box, the notes field, or anywhere else — without
     ever interfering with normal, much slower human typing. */
  useEffect(() => {
    if (activeTab !== "pos") return;
    const SCAN_GAP_MS = 45; // max ms between keystrokes to still count as a scanner
    const MIN_SCAN_LENGTH = 3;
    let buffer = "";
    let lastTime = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      // Leave real keyboard shortcuts (Ctrl/Cmd/Alt combos) alone.
      if (e.ctrlKey || e.metaKey || e.altKey) {
        buffer = "";
        return;
      }
      // OS key-repeat (holding a key down) fires the same key over and
      // over just a few ms apart — that can look exactly like a barcode
      // scan to the timing check below. A real scanner never repeats a
      // key like this, so treat any repeat event as ordinary human typing
      // and reset the buffer, instead of letting it silently build up and
      // hijack the next Enter press in whatever field is focused.
      if (e.repeat) {
        buffer = "";
        return;
      }
      const now = Date.now();
      const gap = now - lastTime;
      lastTime = now;

      if (e.key === "Enter") {
        if (buffer.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          e.stopPropagation();
          const scanned = buffer;
          buffer = "";
          // Route the scan based on what's currently open:
          //  - Exchange/Return mode with no invoice loaded yet → the scan is
          //    the printed invoice's barcode, so look that invoice up.
          //  - Exchange mode with an invoice loaded → the scan is another
          //    replacement product to add to this exchange.
          //  - Otherwise → the scan is a product being added to the cart.
          if (exchangeMode && !exchangeOrder) {
            setExchangeSearch(scanned);
            searchExchange(scanned);
          } else if (returnMode && !returnOrder) {
            setReturnSearch(scanned);
            searchReturn(scanned);
          } else if (exchangeMode && exchangeOrder) {
            processExchangeNewBarcode(scanned);
          } else {
            processBarcode(scanned);
          }
        } else {
          buffer = "";
        }
        return;
      }

      // Only accumulate single printable characters (letters/digits/symbols).
      if (e.key.length !== 1) return;
      buffer = gap <= SCAN_GAP_MS ? buffer + e.key : e.key;
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [activeTab, processBarcode, exchangeMode, exchangeOrder, processExchangeNewBarcode, searchExchange, returnMode, returnOrder, searchReturn]);

  const processExchange = async () => {
    if (!exchangeOrder) return;
    const itemsToExchange = (exchangeOrder.items || [])
      .map((item: any, i: number) => ({
        ...item,
        returnQty: exchangeQtys[i] || 0,
      }))
      .filter((item: any) => item.returnQty > 0);
    if (itemsToExchange.length === 0) {
      toast({
        title: ar ? "اختر قطعاً للتبديل" : "Select items to exchange",
        variant: "destructive",
      });
      return;
    }

    // Ownership rule: anything already returned in an earlier exchange is
    // back in the store and cannot be selected again, even with an admin
    // exception. If the invoice originally had multiple units, only the
    // still-unreturned quantity remains eligible.
    const exchangeHistory = Array.isArray(exchangeOrder.exchangeHistory)
      ? exchangeOrder.exchangeHistory
      : [];
    const historyQtyFor = (item: any) =>
      exchangeHistory.reduce(
        (eventSum: number, event: any) =>
          eventSum +
          (Array.isArray(event?.returnedItems) ? event.returnedItems : []).reduce(
            (sum: number, oldItem: any) => {
              const sameVariant =
                Number(oldItem.productId ?? oldItem.product_id) ===
                  Number(item.productId ?? item.product_id) &&
                String(oldItem.size || "") === String(item.size || "") &&
                String(oldItem.color || "") === String(item.color || "");
              return sameVariant
                ? sum + Math.max(0, Number(oldItem.quantity) || 0)
                : sum;
            },
            0,
          ),
        0,
      );

    for (const item of itemsToExchange) {
      const alreadyReturned = historyQtyFor(item);
      const remainingWithCustomer = Math.max(
        0,
        (Number(item.quantity) || 0) - alreadyReturned,
      );
      if (item.returnQty > remainingWithCustomer) {
        toast({
          title: ar
            ? "هذه القطعة تم تبديلها سابقاً"
            : "This item was already exchanged",
          description: ar
            ? "الكمية التي أُعيدت للمحل لم تعد مع الزبون، لذلك لا يمكن تبديلها مرة أخرى."
            : "The quantity returned to the store is no longer with the customer, so it cannot be exchanged again.",
          variant: "destructive",
        });
        return;
      }
    }

    if (exchangeReplacementItems.length === 0) {
      toast({
        title: ar ? "أضف قطعة بديلة واحدة على الأقل" : "Add at least one replacement item",
        description: ar
          ? "يمكن إضافة عدة منتجات وكميات مختلفة لنفس عملية التبديل"
          : "You can add multiple products and quantities to the same exchange.",
        variant: "destructive",
      });
      return;
    }

    // Validate every replacement and aggregate repeated product/variant lines
    // before returning any old stock. This handles one-to-many, many-to-one,
    // many-to-many and multi-quantity exchanges without overselling stock.
    const requiredByVariant = new Map<
      string,
      { item: ExchangeReplacementItem; quantity: number }
    >();
    for (const item of exchangeReplacementItems) {
      const variants =
        (item.product.colorVariants as ColorVariant[] | undefined) || [];
      if (variants.length > 0 && !item.color) {
        toast({
          title: ar ? `اختر لون ${item.product.name}` : `Select a color for ${item.product.name}`,
          variant: "destructive",
        });
        return;
      }
      const selectedVariant = variants.find((cv) => cv.name === item.color);
      const sizes = sortSizes(
        variants.length > 0
          ? selectedVariant
            ? (selectedVariant.sizes as string[]) || []
            : []
          : ((item.product.sizes as string[]) || []),
      );
      if (sizes.length > 0 && !item.size) {
        toast({
          title: ar ? `اختر مقاس ${item.product.name}` : `Select a size for ${item.product.name}`,
          variant: "destructive",
        });
        return;
      }
      const key = `${item.product.id}|${item.color || ""}|${item.size || ""}`;
      const current = requiredByVariant.get(key);
      requiredByVariant.set(key, {
        item,
        quantity: (current?.quantity || 0) + item.quantity,
      });
    }

    for (const { item, quantity } of requiredByVariant.values()) {
      const available = getExchangeProjectedAvailableStock(item.product, item.size, item.color);
      if (available < quantity) {
        toast({
          title: ar
            ? `المتوفر من ${item.product.name} فقط ${available}`
            : `Only ${available} of ${item.product.name} available`,
          description: ar
            ? "عدّل كمية المنتجات البديلة قبل تأكيد التبديل"
            : "Adjust the replacement quantities before confirming the exchange.",
          variant: "destructive",
        });
        return;
      }
    }

    setProcessingExchange(true);
    try {
      const res = await fetch("/api/pos/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: exchangeOrder.id,
          mode: "exchange",
          override: exchangeOverride,
          items: itemsToExchange.map((item: any) => ({
            productId: item.productId,
            quantity: item.returnQty,
            size: item.size,
            color: item.color,
          })),
          replacementItems: exchangeReplacementItems.map((item) => ({
            productId: item.product.id,
            name: item.product.name,
            quantity: item.quantity,
            size: item.size,
            color: item.color,
            price: item.unitPrice.toFixed(2),
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code = data?.message || "exchange_failed";
        const messages: Record<string, string> = {
          exchange_invoice_not_exchangeable: ar ? "هذه فاتورة تبديل ولا يمكن تبديل منتجاتها إلا باستثناء إداري" : "Products on an exchange invoice cannot be exchanged again without an admin exception",
          exchange_window_expired: ar ? "انتهت مدة التبديل لهذه الفاتورة" : "The exchange window for this invoice has expired",
          item_already_exchanged: ar ? "تم تبديل هذه القطعة سابقاً ولا توجد كمية متاحة للتبديل" : "This item was already exchanged and no eligible quantity remains",
          exchange_quantity_exceeds_invoice: ar ? "الكمية المختارة أكبر من الكمية الموجودة في الفاتورة" : "Selected quantity exceeds the quantity on the invoice",
          category_not_exchangeable: ar ? "هذا المنتج غير قابل للتبديل بدون استثناء إداري" : "This product is not exchangeable without an admin exception",
        };
        throw new Error(messages[code] || code);
      }

      const credit = itemsToExchange.reduce(
        (sum: number, item: any) =>
          sum + parseFloat(item.price || 0) * item.returnQty,
        0,
      );
      const replacementTotal = exchangeReplacementItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
      const diff = replacementTotal - credit;

      const returnedLines = itemsToExchange
        .map((item: any) => {
          const variant = [item.size, item.color].filter(Boolean).join(" · ");
          const lineTotal = (parseFloat(item.price || 0) * item.returnQty).toFixed(2);
          return `  • ${item.name} [ID:${item.productId}]${variant ? ` (${variant})` : ""} × ${item.returnQty} — ₪${lineTotal}`;
        })
        .join("\n");
      const replacementLines = exchangeReplacementItems
        .map((item) => {
          const variant = [item.size, item.color].filter(Boolean).join(" · ");
          const lineTotal = (item.unitPrice * item.quantity).toFixed(2);
          return `  • ${item.product.name} [ID:${item.product.id}]${variant ? ` (${variant})` : ""} × ${item.quantity} — ₪${lineTotal}`;
        })
        .join("\n");

      let exchangeNote =
        `── ${ar ? "فاتورة تبديل" : "EXCHANGE INVOICE"} ──\n` +
        `${ar ? "الفاتورة الأصلية" : "Original invoice"}: #${exchangeOrder.id}\n` +
        `${ar ? "القطع المرتجعة" : "Returned items"}:\n${returnedLines}\n` +
        `${ar ? "رصيد المرتجع" : "Return credit"}: ₪${credit.toFixed(2)}\n` +
        `${ar ? "القطع البديلة" : "Replacement items"}:\n${replacementLines}\n` +
        `${ar ? "إجمالي القطع البديلة" : "Replacement total"}: ₪${replacementTotal.toFixed(2)}\n`;
      exchangeNote +=
        diff > 0
          ? `${ar ? "فرق السعر (يدفعه الزبون)" : "Price difference (customer pays)"}: ₪${diff.toFixed(2)}`
          : diff < 0
            ? `${ar ? "فرق السعر (يُرد للزبون)" : "Price difference (refund to customer)"}: ₪${Math.abs(diff).toFixed(2)}`
            : `${ar ? "لا يوجد فرق سعر" : "No price difference"}`;

      // Put every replacement into the POS cart in one state update. Exact
      // product/size/color matches merge with an existing cart line.
      setCart((prev) => {
        const next = [...prev];
        for (const replacement of exchangeReplacementItems) {
          const idx = next.findIndex(
            (cartItem) =>
              cartItem.product.id === replacement.product.id &&
              cartItem.size === replacement.size &&
              cartItem.color === replacement.color,
          );
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              quantity: next[idx].quantity + replacement.quantity,
            };
          } else {
            next.push({
              product: replacement.product,
              quantity: replacement.quantity,
              size: replacement.size,
              color: replacement.color,
              unitPrice: replacement.unitPrice,
            });
          }
        }
        return next;
      });
      playAddToCartSound();

      // Preserve any discount that was already on the cart, then add only the
      // exchange credit actually usable against the replacement products. If
      // replacements are cheaper, the unused part is shown as cash owed back
      // instead of discounting unrelated products already in the cart.
      const previousDiscountAmount = discountAmount;
      const exchangeCreditUsed = Math.min(credit, replacementTotal);
      setDiscountType("fixed");
      setDiscountValue((previousDiscountAmount + exchangeCreditUsed).toFixed(2));
      setShowDiscount(true);

      toast({
        title: ar
          ? `✓ تم تجهيز التبديل — ${exchangeReplacementItems.reduce((s, item) => s + item.quantity, 0)} قطعة بديلة`
          : `✓ Exchange ready — ${exchangeReplacementItems.reduce((s, item) => s + item.quantity, 0)} replacement item(s)`,
        description:
          diff > 0
            ? ar
              ? `الزبون يدفع فرق ₪${diff.toFixed(2)} عند إتمام البيع`
              : `Customer pays ₪${diff.toFixed(2)} difference at checkout`
            : diff < 0
              ? ar
                ? `أعد للزبون ₪${Math.abs(diff).toFixed(2)} نقداً`
                : `Hand back ₪${Math.abs(diff).toFixed(2)} cash to the customer`
              : ar
                ? "الأسعار متساوية — لا فرق"
                : "Same total — nothing owed",
      });

      setNote((prev) => (prev ? `${prev}\n\n${exchangeNote}` : exchangeNote));
      setShowNote(true);

      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/pos/orders"] });
      qc.invalidateQueries({ queryKey: ["/api/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/low-stock"] });

      setExchangeMode(false);
      setExchangeOrder(null);
      setExchangeSearch("");
      setExchangeQtys({});
      setExchangeOverride(false);
      setDressOverrideItems(new Set());
      setExchangeNewSearch("");
      setExchangeReplacementResultsOpen(false);
      setExchangeNewProduct(null);
      setExchangeNewSize("");
      setExchangeNewColor("");
      setExchangeNewQty(1);
      setExchangeReplacementItems([]);
      setExchangeCategoryFilter("all");
      setExchangeSubcategoryFilter("all");
      setExchangeOpenSubcategoryFor(null);
    } catch (error: any) {
      toast({
        title: ar ? "فشل في معالجة التبديل" : "Exchange failed",
        description: error?.message || undefined,
        variant: "destructive",
      });
    } finally {
      setProcessingExchange(false);
    }
  };

  /* ── Dashboard computed ──────────────────────────────────────────── */
  // Local calendar date, not UTC (toISOString()) — see printShiftSummary
  // for why: UTC-based day boundaries can misattribute orders placed near
  // local midnight to the wrong day depending on server timezone.
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayOrders = posOrders.filter((o: any) => {
    const raw = o.created_at || o.createdAt;
    return !!raw && format(new Date(raw), "yyyy-MM-dd") === todayStr;
  });
  const todayRevenue = todayOrders.reduce(
    (s: number, o: any) => s + getPosOrderTotal(o),
    0,
  );
  const totalRevenue = posOrders.reduce(
    (s: number, o: any) => s + getPosOrderTotal(o),
    0,
  );

  const filteredOrders = useMemo(() => {
    return posOrders.filter((o: any) =>
      orderMatchesPosDateFilter(o, dateFilter, todayStr, customDateRange),
    );
  }, [posOrders, dateFilter, todayStr, customDateRange]);

  /* ── Shoes vs. everything-else classification ────────────────────────
     The shop runs two separate cash registers — one for shoes, one for
     every other category — so invoices need to be split the same way.
     Orders only store productId per line item (no categoryId snapshot),
     so classification is done by looking each line item's product up in
     the already-loaded product list and checking its category. */
  const shoeCategoryIds = useMemo(() => {
    const ids = new Set<number>();
    (categories || []).forEach((c: any) => {
      const name = (c.name || "").toLowerCase();
      const nameAr = c.nameAr || "";
      if (
        name.includes("shoe") ||
        nameAr.includes("حذاء") ||
        nameAr.includes("أحذية") ||
        nameAr.includes("شوز")
      ) {
        ids.add(c.id);
      }
    });
    if (ids.size === 0) ids.add(4); // conventional fallback: Shoes = category id 4
    return ids;
  }, [categories]);

  const productCategoryById = useMemo(() => {
    const m = new Map<number, number>();
    (products || []).forEach((p: any) => {
      if (p.id != null) m.set(p.id, p.categoryId);
    });
    return m;
  }, [products]);

  const isShoesOrder = useCallback(
    (order: any): boolean =>
      orderHasShoeItems(order, shoeCategoryIds, productCategoryById),
    [productCategoryById, shoeCategoryIds],
  );
  const isOtherCategoriesOrder = useCallback(
    (order: any): boolean =>
      orderHasNonShoeItems(order, shoeCategoryIds, productCategoryById),
    [productCategoryById, shoeCategoryIds],
  );

  const shoesOrders = useMemo(
    () => filteredOrders.filter((o: any) => isShoesOrder(o)),
    [filteredOrders, isShoesOrder],
  );
  const otherOrders = useMemo(
    () => filteredOrders.filter((o: any) => isOtherCategoriesOrder(o)),
    [filteredOrders, isOtherCategoriesOrder],
  );

  const [allPaymentFilter, setAllPaymentFilter] = useState<
    "all" | "cash" | "card" | "split"
  >("all");
  const [shoesPaymentFilter, setShoesPaymentFilter] = useState<
    "all" | "cash" | "card" | "split"
  >("all");
  const [otherPaymentFilter, setOtherPaymentFilter] = useState<
    "all" | "cash" | "card" | "split"
  >("all");
  // Which per-register invoices the admin is currently looking at — the
  // shoes and "everything else" registers now share one list, switched
  // via the two icon tabs instead of always showing both stacked.
  const [invoiceCategoryTab, setInvoiceCategoryTab] = useState<
    "shoes" | "other"
  >("shoes");

  const chartData = useMemo(() => {
    if (chartView === "today") {
      const hours = Array.from({ length: 24 }, (_, h) => ({
        label: `${h}:00`,
        revenue: 0,
      }));
      todayOrders.forEach((o: any) => {
        const h = new Date(o.created_at || o.createdAt || "").getHours();
        if (!Number.isInteger(h) || h < 0 || h > 23) return; // guard NaN
        hours[h].revenue += getPosOrderTotal(o);
      });
      return hours
        .filter((h) => h.revenue > 0 || true)
        .map((h) => ({ ...h, revenue: parseFloat(h.revenue.toFixed(2)) }));
    } else {
      const days: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days[format(d, "yyyy-MM-dd")] = 0;
      }
      posOrders.forEach((o: any) => {
        const raw = o.created_at || o.createdAt;
        if (!raw) return;
        const ds = format(new Date(raw), "yyyy-MM-dd");
        if (ds in days) days[ds] += getPosOrderTotal(o);
      });
      return Object.entries(days).map(([date, revenue]) => ({
        label: format(new Date(date), "MM-dd"),
        revenue: parseFloat(revenue.toFixed(2)),
      }));
    }
  }, [chartView, todayOrders, posOrders, ar]);

  /* ── Picker state ──────────────────────────────────────────────── */
  const pickerVariant = pickerProduct
    ? ((pickerProduct.colorVariants as ColorVariant[] | undefined) || []).find(
        (c) => c.name === pickerColor,
      )
    : null;
  const pickerSizes = sortSizes(
    pickerVariant ? pickerVariant.sizes : (pickerProduct?.sizes as string[]) || []
  );
  // Sizes the product doesn't have configured for this color yet — shown
  // as a distinct "not in inventory" hint row so the cashier can still
  // sell one if a customer asks for it.
  const pickerHintSizes = getPosSizeHints(pickerSizes);
  const pickerSizeInv = pickerVariant
    ? pickerVariant.sizeInventory
    : (pickerProduct?.sizeInventory as Record<string, number>) || {};
  const pickerAvail = pickerProduct
    ? pickerIsHintSize
      ? POS_NEW_SIZE_MAX_QTY
      : pickerSize
        ? getAvailableStock(pickerProduct, pickerSize, pickerColor || undefined)
        : pickerSizes.length === 0
          ? getAvailableStock(pickerProduct, undefined, pickerColor || undefined)
          : 0
    : 0;

  /* ══════════════════════════════════════════════════════════════════ */
  return (
    <AdminLayout fullscreen={posFullscreen}>
      {customerScreenBlocked && (
        <div
          role="button"
          onClick={openCustomerDisplay}
          className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm text-purple-800 cursor-pointer hover:bg-purple-100 dark:bg-purple-950/20 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950/40 transition-colors"
          data-testid="banner-customer-screen-blocked"
        >
          <span className="flex items-center gap-2">
            <Monitor className="w-4 h-4 shrink-0" />
            {ar
              ? "المتصفح منع فتح شاشة العميل تلقائياً — اضغط هنا لفتحها بملء الشاشة"
              : "Your browser blocked the customer display from opening automatically — click here to open it full-size"}
          </span>
          <span className="text-xs font-semibold underline shrink-0">
            {ar ? "فتح الآن" : "Open now"}
          </span>
        </div>
      )}
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-foreground text-background flex items-center justify-center shadow-sm">
            <Receipt className="w-4.5 h-4.5" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold leading-tight">
              {ar ? "نقطة البيع" : "Point of Sale"}
            </h1>
            <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
              {ar ? "إدارة المبيعات والفواتير" : "Manage sales & invoices"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={toggleFullscreen}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors font-medium ${
              posFullscreen
                ? "bg-foreground text-background border-foreground shadow-sm"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
            data-testid="button-pos-fullscreen-toggle"
            title={
              posFullscreen
                ? ar
                  ? "تصغير الشاشة"
                  : "Exit fullscreen"
                : ar
                  ? "فتح بملء الشاشة"
                  : "Open fullscreen"
            }
          >
            {posFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                {ar ? "تصغير" : "Minimize"}
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                {ar ? "ملء الشاشة" : "Fullscreen"}
              </>
            )}
          </button>
          <button
            onClick={openCustomerDisplay}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-medium transition-colors ${
              customerScreenBlocked
                ? "border-purple-400 bg-purple-100 text-purple-800 animate-pulse dark:bg-purple-950/50 dark:border-purple-600"
                : "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/20 dark:border-purple-800 dark:hover:bg-purple-950/40"
            }`}
            data-testid="button-customer-screen"
            title={ar ? "فتح شاشة العميل في نافذة جديدة" : "Open customer display"}
          >
            <Monitor className="w-3.5 h-3.5" />
            {ar ? "شاشة العميل" : "Customer Screen"}
          </button>
          <button
            onClick={() => setReturnMode(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 dark:bg-orange-950/20 dark:border-orange-800 dark:hover:bg-orange-950/40 transition-colors font-medium"
            data-testid="button-return-mode"
          >
            <Undo2 className="w-3.5 h-3.5" />
            {ar ? "مرتجعات" : "Returns"}
          </button>
          <button
            onClick={() => setExchangeMode(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/20 dark:border-blue-800 dark:hover:bg-blue-950/40 transition-colors font-medium"
            data-testid="button-exchange-mode"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {ar ? "تبديل" : "Exchange"}
          </button>
          <button
            onClick={() => setAutoPrint((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors font-medium ${autoPrint ? "bg-foreground text-background border-foreground shadow-sm" : "border-border text-muted-foreground hover:bg-muted"}`}
            data-testid="button-auto-print-toggle"
          >
            <Printer className="w-3.5 h-3.5" />
            {ar
              ? autoPrint
                ? "طباعة تلقائية ✓"
                : "طباعة يدوية"
              : autoPrint
                ? "Auto-print ✓"
                : "Manual print"}
          </button>
          <button
            onClick={() => setOskEnabledPersist(!oskEnabled)}
            className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors font-medium ${oskEnabled ? "bg-foreground text-background border-foreground shadow-sm" : "border-border text-muted-foreground hover:bg-muted"}`}
            data-testid="button-osk-toggle"
            title={ar ? "لوحة مفاتيح على الشاشة عند لمس أي حقل" : "On-screen keyboard on any field tap"}
          >
            <Keyboard className="w-3.5 h-3.5" />
            {ar
              ? oskEnabled
                ? "لوحة مفاتيح ✓"
                : "لوحة مفاتيح ✕"
              : oskEnabled
                ? "Keyboard ✓"
                : "Keyboard off"}
          </button>
          {reportsPageEnabled && (
            <button
              onClick={() =>
                setActiveTab((t) => (t === "pos" ? "dashboard" : "pos"))
              }
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors font-medium ${activeTab === "dashboard" ? "bg-foreground text-background border-foreground shadow-sm" : "border-border text-muted-foreground hover:bg-muted"}`}
              data-testid="button-toggle-dashboard"
            >
              {activeTab === "dashboard" ? (
                <>
                  <ShoppingCart className="w-3.5 h-3.5" />
                  {ar ? "← نقطة البيع" : "← POS"}
                </>
              ) : (
                <>
                  <BarChart3 className="w-3.5 h-3.5" />
                  {ar ? "الإحصائيات" : "Dashboard"}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Completed order banner ─────────────────────────────────── */}
      {completedOrder && (
        <div className="mb-4 border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <span className="font-semibold text-green-800 dark:text-green-200 text-sm">
              {ar
                ? <><span>✓ تم البيع — فاتورة </span><span className="ltr-num">#{completedOrder.id}</span></>
                : <><span>✓ Sale done — Invoice </span><span className="ltr-num">#{completedOrder.id}</span></>}
            </span>
            <span className="text-green-700 dark:text-green-300 text-sm ms-3 ltr-num">
              ₪{completedOrder.total.toFixed(2)}
              {completedOrder.paymentMethod === "cash" &&
                completedOrder.cashReceived > 0 &&
                ` · ${ar ? "الباقي" : "Change"}: ₪${completedOrder.change.toFixed(2)}`}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => triggerPrint(completedOrder)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-green-400 text-green-700 hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />{" "}
              {ar ? "إعادة طباعة" : "Reprint"}
            </button>
            <button
              onClick={() => setCompletedOrder(null)}
              className="text-green-600 hover:text-green-900 px-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Held carts banner ─────────────────────────────────────── */}
      {heldCarts.length > 0 && activeTab === "pos" && (
        <div className="mb-3 border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20 px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <PauseCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            {ar
              ? `${heldCarts.length} فاتورة معلقة:`
              : `${heldCarts.length} held cart(s):`}
          </span>
          <div className="flex gap-2 flex-wrap">
            {heldCarts.map((h) => (
              <button
                key={h.id}
                onClick={() => recallCart(h.id)}
                className="flex items-center gap-1 text-xs px-2.5 py-1 border border-amber-400 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900 rounded transition-colors"
                data-testid={`button-recall-cart-${h.id}`}
              >
                <PlayCircle className="w-3 h-3" />
                {ar
                  ? `فاتورة (${h.cart.length})`
                  : `Cart (${h.cart.length})`} ·{" "}
                {h.time.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── DASHBOARD TAB ─────────────────────────────────────────── */}
      {activeTab === "dashboard" && (
        <div className="space-y-5">
          {/* Back button */}
          <button
            onClick={() => setActiveTab("pos")}
            className="flex items-center gap-3 w-full sm:w-auto px-6 py-3 bg-foreground text-background rounded-xl font-semibold text-sm hover:bg-foreground/85 active:scale-95 transition-all shadow-md"
            data-testid="button-back-to-pos"
          >
            <ShoppingCart className="w-5 h-5" />
            {ar ? "← العودة إلى نقطة البيع" : "← Back to POS"}
          </button>

          {/* Action buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 px-4 py-2 border border-border hover:bg-muted text-sm font-medium transition-colors"
              data-testid="button-export-excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-green-600" />
              {ar ? "تصدير Excel" : "Export Excel"}
            </button>
            <button
              onClick={async () => {
                // Bug fix: printShiftSummary() used to run right after this
                // await with no arguments, which meant it read `posOrders`
                // from this render's closure — still the pre-refetch data,
                // since the component hadn't re-rendered with the fresh
                // query result yet. Passing the resolved data straight in
                // guarantees the printed summary reflects what refetch()
                // just pulled from the server.
                let fresh: any[] | undefined;
                try {
                  const result = await refetchOrders();
                  fresh = result.data;
                } catch {
                  // Even if refreshing fails, still print with whatever
                  // orders are already cached rather than doing nothing.
                }
                printShiftSummary("all", fresh);
              }}
              className="flex items-center gap-2 px-4 py-2 border border-border hover:bg-muted text-sm font-medium transition-colors"
              data-testid="button-shift-summary"
            >
              <Printer className="w-4 h-4" />
              {ar ? "ملخص اليوم" : "Today's Summary"}
            </button>
            <button
              onClick={async () => {
                let fresh: any[] | undefined;
                try {
                  const result = await refetchOrders();
                  fresh = result.data;
                } catch {
                  // Even if refreshing fails, still print with whatever
                  // orders are already cached rather than doing nothing.
                }
                printShiftSummary("shoes", fresh);
              }}
              className="flex items-center justify-center w-10 h-10 border border-border hover:bg-muted text-lg transition-colors"
              title={ar ? "ملخص اليوم — الأحذية" : "Today's Summary — Shoes"}
              data-testid="button-shift-summary-shoes"
            >
              👟
            </button>
            <button
              onClick={async () => {
                let fresh: any[] | undefined;
                try {
                  const result = await refetchOrders();
                  fresh = result.data;
                } catch {
                  // Even if refreshing fails, still print with whatever
                  // orders are already cached rather than doing nothing.
                }
                printShiftSummary("other", fresh);
              }}
              className="flex items-center justify-center w-10 h-10 border border-border hover:bg-muted text-lg transition-colors"
              title={ar ? "ملخص اليوم — باقي الأقسام" : "Today's Summary — Other Sections"}
              data-testid="button-shift-summary-other"
            >
              👗
            </button>
            <button
              onClick={() => setDeleteAllOrdersConfirmOpen(true)}
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30 text-sm font-medium transition-colors"
              data-testid="button-delete-all-pos-orders"
            >
              <Trash2 className="w-4 h-4" />
              {ar ? "حذف نهائي لكل الفواتير" : "Delete all invoices"}
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: ar ? "مبيعات اليوم" : "Today's Sales",
                value: `₪${todayRevenue.toFixed(2)}`,
                icon: <Banknote className="w-5 h-5" />,
                bg: "bg-green-50 dark:bg-green-950/30",
                border: "border-green-200 dark:border-green-800",
                color: "text-green-700 dark:text-green-300",
              },
              {
                label: ar ? "فواتير اليوم" : "Today's Orders",
                value: todayOrders.length,
                icon: <Receipt className="w-5 h-5" />,
                bg: "bg-blue-50 dark:bg-blue-950/30",
                border: "border-blue-200 dark:border-blue-800",
                color: "text-blue-700 dark:text-blue-300",
              },
              {
                label: ar ? "إجمالي المبيعات" : "Total Revenue",
                value: `₪${totalRevenue.toFixed(2)}`,
                icon: <BarChart3 className="w-5 h-5" />,
                bg: "bg-purple-50 dark:bg-purple-950/30",
                border: "border-purple-200 dark:border-purple-800",
                color: "text-purple-700 dark:text-purple-300",
              },
              {
                label: ar ? "إجمالي الفواتير" : "All Invoices",
                value: posOrders.length,
                icon: <ShoppingCart className="w-5 h-5" />,
                bg: "bg-amber-50 dark:bg-amber-950/30",
                border: "border-amber-200 dark:border-amber-800",
                color: "text-amber-700 dark:text-amber-300",
              },
            ].map((stat, i) => (
              <div
                key={i}
                className={`${stat.bg} border ${stat.border} p-4 rounded-xl`}
              >
                <div className={`mb-2 ${stat.color}`}>{stat.icon}</div>
                <p className="text-xs text-muted-foreground font-medium">
                  {stat.label}
                </p>
                <p className={`text-2xl font-bold mt-1 ${stat.color}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Revenue chart */}
          <div className="border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                {ar ? "تقرير المبيعات" : "Revenue Chart"}
              </h3>
              <div className="flex gap-1">
                {(["today", "week"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setChartView(v)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors ${chartView === v ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}
                  >
                    {v === "today"
                      ? ar
                        ? "اليوم"
                        : "Today"
                      : ar
                        ? "الأسبوع"
                        : "Week"}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={chartData}
                margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `₪${v}`} />
                <Tooltip
                  formatter={(v: any) => [`₪${v}`, ar ? "المبيعات" : "Revenue"]}
                />
                <Bar
                  dataKey="revenue"
                  fill="hsl(var(--foreground))"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Invoices — the original combined "all invoices" list is back
              on the right (exactly what was there before), and the two
              cash-register-specific lists (shoes / everything else) are
              stacked one under the other on the left, since the shop runs
              those as two separate physical registers. */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                {ar ? "الفواتير" : "Invoices"}
              </h3>
              <PosReportDateFilter
                ar={ar}
                dateFilter={dateFilter}
                customDateRange={customDateRange}
                onApply={handleDateFilterApply}
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* First in DOM → right side in this RTL layout: one
                  per-register list, switched between shoes/other via the
                  icon tabs instead of always showing both stacked. */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setInvoiceCategoryTab("shoes")}
                    className={`w-9 h-9 flex items-center justify-center rounded-full border-2 text-base transition-colors ${invoiceCategoryTab === "shoes" ? "bg-foreground text-background border-foreground shadow-sm" : "border-border hover:bg-muted"}`}
                    title={ar ? "فواتير الأحذية" : "Shoes Invoices"}
                    data-testid="button-invoice-tab-shoes"
                  >
                    👟
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceCategoryTab("other")}
                    className={`w-9 h-9 flex items-center justify-center rounded-full border-2 text-base transition-colors ${invoiceCategoryTab === "other" ? "bg-foreground text-background border-foreground shadow-sm" : "border-border hover:bg-muted"}`}
                    title={ar ? "فواتير الأقسام الأخرى" : "Other Sections Invoices"}
                    data-testid="button-invoice-tab-other"
                  >
                    👗
                  </button>
                </div>
                {invoiceCategoryTab === "shoes" ? (
                  <PosInvoicesColumn
                    ar={ar}
                    title={ar ? "فواتير الأحذية" : "Shoes Invoices"}
                    icon={<Footprints className="w-4 h-4" />}
                    orders={shoesOrders}
                    testIdPrefix="shoes"
                    revenueScope="shoes"
                    shoeCategoryIds={shoeCategoryIds}
                    productCategoryById={productCategoryById}
                    paymentFilter={shoesPaymentFilter}
                    onPaymentFilterChange={setShoesPaymentFilter}
                    selectedOrderIds={selectedOrderIds}
                    toggleOrderSelected={toggleOrderSelected}
                    setSelectedOrderIds={setSelectedOrderIds}
                    onDeleteSelected={() => setDeleteSelectedConfirmOpen(true)}
                    reprintOrder={reprintOrder}
                    onView={setExpandedOrder}
                    onDelete={setDeleteOrderConfirm}
                    allowTransferStatus
                    onSetTransferStatus={(ids, transferred) =>
                      updateTransferStatusMutation.mutate({ ids, transferred })
                    }
                  />
                ) : (
                  <PosInvoicesColumn
                    ar={ar}
                    title={ar ? "فواتير الأقسام الأخرى" : "Other Sections Invoices"}
                    icon={<Layers className="w-4 h-4" />}
                    orders={otherOrders}
                    testIdPrefix="other"
                    revenueScope="other"
                    shoeCategoryIds={shoeCategoryIds}
                    productCategoryById={productCategoryById}
                    paymentFilter={otherPaymentFilter}
                    onPaymentFilterChange={setOtherPaymentFilter}
                    selectedOrderIds={selectedOrderIds}
                    toggleOrderSelected={toggleOrderSelected}
                    setSelectedOrderIds={setSelectedOrderIds}
                    onDeleteSelected={() => setDeleteSelectedConfirmOpen(true)}
                    reprintOrder={reprintOrder}
                    onView={setExpandedOrder}
                    onDelete={setDeleteOrderConfirm}
                  />
                )}
              </div>
              {/* Second in DOM → left side in this RTL layout: the
                  original combined list, restored exactly as it was */}
              <PosInvoicesColumn
                ar={ar}
                title={ar ? "كل الفواتير" : "All Invoices"}
                icon={<CalendarDays className="w-4 h-4" />}
                orders={filteredOrders}
                testIdPrefix="all"
                paymentFilter={allPaymentFilter}
                onPaymentFilterChange={setAllPaymentFilter}
                selectedOrderIds={selectedOrderIds}
                toggleOrderSelected={toggleOrderSelected}
                setSelectedOrderIds={setSelectedOrderIds}
                onDeleteSelected={() => setDeleteSelectedConfirmOpen(true)}
                reprintOrder={reprintOrder}
                onView={setExpandedOrder}
                onDelete={setDeleteOrderConfirm}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── POS TAB ────────────────────────────────────────────────── */}
      {activeTab === "pos" && (
        <div className="flex gap-4 h-[calc(100vh-160px)] min-h-[600px]">
          {/* ── LEFT: Products ──────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Search + Barcode */}
            <div className="flex gap-2 mb-3">
              {/* Barcode input */}
              <div className="flex items-stretch rounded-xl border-2 border-border bg-muted/30 overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 focus-within:bg-background transition-all shadow-sm w-48 flex-shrink-0">
                <span className="flex items-center ps-3.5 text-muted-foreground">
                  <Barcode className="w-5 h-5" />
                </span>
                <input
                  ref={barcodeRef}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeEnter}
                  placeholder={ar ? "باركود..." : "Barcode..."}
                  className="bg-transparent px-2 py-3.5 text-base font-mono outline-none w-full placeholder:text-muted-foreground/60"
                  data-testid="input-barcode-pos"
                />
              </div>
              {/* Text search */}
              <div className="flex items-stretch rounded-xl border-2 border-border bg-muted/30 overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 focus-within:bg-background transition-all shadow-sm flex-1">
                <span className="flex items-center ps-3.5 text-muted-foreground">
                  <Search className="w-5 h-5" />
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={ar ? "ابحث عن منتج..." : "Search products..."}
                  className="bg-transparent px-2 py-3.5 text-base outline-none w-full placeholder:text-muted-foreground/60"
                  data-testid="input-search-pos"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="flex items-center pe-3.5 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category pills — single tap filters, double tap/double-click
                opens a simple bottom sheet with that category's subcategories.
                A bottom sheet is used instead of an anchored dropdown because
                it never has to fight the row's own horizontal scrolling for
                position — it just always shows up in the same easy spot. */}
            <div
              className="flex gap-2 mb-3 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "none" }}
            >
              <button
                onClick={() => {
                  setCategoryFilter("all");
                  setSubcategoryFilter("all");
                  setOpenSubcategoryFor(null);
                }}
                className={`flex-shrink-0 px-5 py-3 rounded-full text-sm font-semibold transition-all duration-200 border-2 ${categoryFilter === "all" ? "bg-foreground text-background border-foreground shadow-md scale-105" : "bg-background border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}
                data-testid="button-cat-all"
              >
                {ar ? "✦ الكل" : "✦ All"}
              </button>
              {categories.map((cat) => {
                const catSubs = subcategories.filter(
                  (s) => s.categoryId === cat.id && s.isActive !== false,
                );
                const isActive = categoryFilter === cat.id;
                const hasActiveSub = isActive && subcategoryFilter !== "all";
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      const now = Date.now();
                      const isDoubleTap =
                        lastCatTapRef.current.id === cat.id &&
                        now - lastCatTapRef.current.time < 380;
                      lastCatTapRef.current = { id: cat.id, time: now };

                      if (isDoubleTap && catSubs.length > 0) {
                        setCategoryFilter(cat.id);
                        setOpenSubcategoryFor(cat.id);
                        return;
                      }
                      setCategoryFilter(cat.id);
                      setSubcategoryFilter("all");
                      setOpenSubcategoryFor(null);
                    }}
                    onDoubleClick={(e) => {
                      // Desktop mouse users get the native dblclick too,
                      // in addition to the tap-timing detection above.
                      e.preventDefault();
                      if (catSubs.length > 0) {
                        setCategoryFilter(cat.id);
                        setOpenSubcategoryFor(cat.id);
                      }
                    }}
                    className={`group relative flex-shrink-0 flex items-center gap-1.5 px-5 py-3 rounded-full text-sm font-semibold transition-all duration-200 border-2 ${isActive ? "bg-foreground text-background border-foreground shadow-md scale-105" : "bg-background border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}
                    data-testid={`button-cat-${cat.id}`}
                    title={
                      catSubs.length > 0
                        ? ar
                          ? "اضغط مرتين لعرض التصنيفات الفرعية"
                          : "Double-tap to browse subcategories"
                        : undefined
                    }
                  >
                    {ar ? cat.nameAr || cat.name : cat.name}
                    {catSubs.length > 0 && (
                      <Layers
                        className={`w-3 h-3 shrink-0 transition-opacity ${isActive ? "opacity-60" : "opacity-35 group-hover:opacity-60"}`}
                        strokeWidth={2.25}
                      />
                    )}
                    {hasActiveSub && (
                      <span className="absolute top-1.5 end-1.5 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-500 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-500 ring-2 ring-background" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Subcategory bottom sheet — one single instance, driven by
                openSubcategoryFor, instead of a popover per pill. Simplest
                and most reliable way to show this on a touchscreen POS. */}
            {(() => {
              const openCat = categories.find(
                (c) => c.id === openSubcategoryFor,
              );
              const openCatSubs = openCat
                ? subcategories.filter(
                    (s) => s.categoryId === openCat.id && s.isActive !== false,
                  )
                : [];
              if (!openCat || openCatSubs.length === 0) return null;
              return (
                <div
                  className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center"
                  onClick={() => setOpenSubcategoryFor(null)}
                  data-testid="subcategory-sheet-backdrop"
                >
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="relative w-full sm:w-[420px] sm:max-w-[92vw] max-h-[70vh] sm:max-h-[75vh] bg-background rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
                  >
                    {/* Grab handle (mobile) */}
                    <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
                      <span className="w-10 h-1 rounded-full bg-border" />
                    </div>

                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                        <span className="text-sm font-bold text-foreground truncate">
                          {ar
                            ? `${openCat.nameAr || openCat.name} — التصنيفات الفرعية`
                            : `${openCat.name} — subcategories`}
                        </span>
                      </div>
                      <button
                        onClick={() => setOpenSubcategoryFor(null)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                        data-testid="button-close-subcategory-sheet"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2 p-4 overflow-y-auto">
                      <button
                        onClick={() => {
                          setSubcategoryFilter("all");
                          setOpenSubcategoryFor(null);
                        }}
                        className={`px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 border-2 ${subcategoryFilter === "all" ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-muted/50 border-border/80 text-foreground hover:border-primary/50"}`}
                        data-testid="button-subcat-all"
                      >
                        {ar ? "الكل" : "All"}
                      </button>
                      {openCatSubs.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSubcategoryFilter(s.id);
                            setOpenSubcategoryFor(null);
                          }}
                          className={`px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 border-2 ${subcategoryFilter === s.id ? "bg-primary text-primary-foreground border-primary shadow-sm scale-105" : "bg-muted/50 border-border/80 text-foreground hover:border-primary/50"}`}
                          data-testid={`button-subcat-${s.id}`}
                        >
                          {ar ? s.nameAr || s.name : s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto">
              {filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                    <Package className="w-8 h-8 opacity-30" />
                  </div>
                  <p className="text-sm font-medium">
                    {ar ? "لا توجد منتجات" : "No products found"}
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {ar ? "جرب كلمة بحث مختلفة" : "Try a different search"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredProducts.map((product, productIdx) => {
                    const price = product.discountPrice
                      ? parseFloat(product.discountPrice as string)
                      : parseFloat(product.price as string);
                    const hasDiscount = !!product.discountPrice;
                    const cartAvail = cartAvailMap.get(product.id) ?? 0;
                    const isSoldOut = cartAvail <= 0;
                    const lowStock = !isSoldOut && cartAvail <= 3;
                    return (
                      <div
                        key={product.id}
                        className={`rounded-xl overflow-hidden border transition-all text-start group bg-card shadow-sm ${isSoldOut ? "border-border opacity-50" : "border-border hover:border-foreground/40 hover:shadow-md hover:-translate-y-0.5"}`}
                        data-testid={`button-product-${product.id}`}
                      >
                        {/* Clickable image + info area */}
                        <button
                          onClick={() => !isSoldOut && openPicker(product)}
                          disabled={isSoldOut}
                          className={`w-full text-start focus:outline-none focus:ring-2 focus:ring-foreground/40 ${isSoldOut ? "cursor-not-allowed" : ""}`}
                        >
                          <div className="aspect-[3/4] overflow-hidden bg-muted relative">
                            {product.mainImage ? (
                              <PosProductImage
                                src={product.mainImage}
                                alt={product.name}
                                isSoldOut={isSoldOut}
                                priority={productIdx < 10}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-8 h-8 opacity-20" />
                              </div>
                            )}
                            {hasDiscount && !isSoldOut && (
                              <div className="absolute top-2 start-2 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow">
                                SALE
                              </div>
                            )}
                            {(product as any).isBestSeller && !isSoldOut && (
                              <div className="absolute top-2 end-2 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center shadow">
                                <Star className="w-3 h-3 fill-white text-white" />
                              </div>
                            )}
                            {isSoldOut && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-[1px]">
                                <span className="bg-background/95 text-foreground text-[10px] font-bold px-3 py-1.5 rounded-full shadow">
                                  {ar ? "نفد المخزون" : "Sold Out"}
                                </span>
                              </div>
                            )}
                            {lowStock && (
                              <div className="absolute bottom-2 start-2 flex items-center gap-1 bg-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                {cartAvail}
                              </div>
                            )}
                          </div>
                          <div className="p-2.5 pb-1.5">
                            <p className="text-xs font-semibold line-clamp-2 leading-tight mb-1.5">
                              {ar
                                ? (product as any).nameAr || product.name
                                : product.name}
                            </p>
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span
                                className={`text-sm font-bold ltr-num ${hasDiscount && !isSoldOut ? "text-red-600" : "text-foreground"}`}
                              >
                                ₪{price.toFixed(2)}
                              </span>
                              {hasDiscount && !isSoldOut && (
                                <span className="text-[10px] line-through text-muted-foreground ltr-num">
                                  ₪{parseFloat(product.price as string).toFixed(2)}
                                </span>
                              )}
                            </div>
                            <div
                              className={`mt-1 inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                isSoldOut
                                  ? "bg-red-50 text-red-500 dark:bg-red-950/30"
                                  : lowStock
                                    ? "bg-orange-50 text-orange-500 dark:bg-orange-950/30"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {isSoldOut
                                ? ar ? "نفد المخزون" : "Out of stock"
                                : ar ? `متاح: ${cartAvail}` : `${cartAvail} left`}
                            </div>
                          </div>
                        </button>
                        {/* Barcode print button */}
                        <div className="px-2.5 pb-2">
                          <button
                            onClick={(e) => printProductBarcode(product, e)}
                            className="w-full flex items-center justify-center gap-1 py-1 rounded-lg border border-border text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted hover:border-foreground/30 transition-colors"
                            title={ar ? "طباعة الباركود" : "Print barcode"}
                          >
                            <Barcode className="w-3 h-3" />
                            {ar ? "باركود" : "Barcode"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Cart ─────────────────────────────────────────── */}
          <div
            className="w-80 xl:w-96 flex flex-col rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
            data-testid="pos-cart-panel"
          >
            {/* Cart header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-black text-white">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white text-black flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-sm text-white">
                  {ar ? "الفاتورة" : "Invoice"}
                </span>
                {cart.length > 0 && (
                  <span className="bg-white text-black text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                    {cart.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={holdCart}
                    className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 bg-white/10 border border-white/20 px-2.5 py-1.5 rounded-lg hover:bg-white/20 transition-colors font-medium"
                    data-testid="button-hold-cart"
                  >
                    <PauseCircle className="w-3 h-3" />
                    {ar ? "تعليق" : "Hold"}
                  </button>
                )}
                {cart.length > 0 && (
                  <button
                    onClick={() => {
                      setCart([]);
                      setDiscountValue("");
                      setNote("");
                      setPaymentMethod(null);
                      setCashReceived("");
                      setCardReceived("");
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-white/20 text-white/70 hover:text-red-400 hover:border-red-400/40 hover:bg-red-500/10 transition-colors"
                    data-testid="button-clear-cart"
                    title={ar ? "مسح الفاتورة" : "Clear cart"}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12 px-6">
                  <div className="w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
                    <ShoppingCart className="w-7 h-7 opacity-30" />
                  </div>
                  <p className="text-sm font-semibold">
                    {ar ? "الفاتورة فارغة" : "Cart is empty"}
                  </p>
                  <p className="text-xs mt-1.5 text-center text-muted-foreground/70 leading-relaxed">
                    {ar
                      ? "انقر على منتج أو امسح الباركود"
                      : "Click a product or scan a barcode"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {cart.map((item, idx) => {
                    const availMore = getAvailableStock(
                      item.product,
                      item.size,
                      item.color,
                    );
                    return (
                      <div
                        key={idx}
                        className="flex gap-3 p-3.5 items-start hover:bg-muted/20 transition-colors"
                      >
                        <button
                          onClick={() => setCartImageView({
                            src: getProductImage(item.product, item.color),
                            name: item.product.name,
                          })}
                          className="w-14 h-16 bg-muted overflow-hidden flex-shrink-0 rounded-xl relative group cursor-zoom-in"
                        >
                          <img
                            src={getProductImage(item.product, item.color)}
                            alt={item.product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                            <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16zm3-8H8m3-3v6" />
                            </svg>
                          </div>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {item.product.name}
                          </p>
                          {(item.size || item.color) && (
                            <div className="flex items-center gap-1.5 mt-0.5 relative">
                              {item.size &&
                                (() => {
                                  const sizes =
                                    (item.product.sizes as string[] | undefined) || [];
                                  // New-size items aren't in the product's
                                  // real size list yet, and the size-swap
                                  // dropdown relies on real stock lookups —
                                  // so it's disabled for these until the
                                  // sale is saved and stock catches up.
                                  const canChangeSize =
                                    sizes.length > 1 && !item.isNewSize;
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!canChangeSize) return;
                                        setColorEditIdx(null);
                                        setSizeEditIdx((v) =>
                                          v === idx ? null : idx,
                                        );
                                      }}
                                      className={`flex items-center gap-1 text-xs text-muted-foreground ${canChangeSize ? "hover:text-foreground cursor-pointer" : "cursor-default"}`}
                                      data-testid={`button-change-cart-size-${idx}`}
                                    >
                                      <span>{item.size}</span>
                                      {item.isNewSize && (
                                        <span
                                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-400"
                                          data-testid={`badge-new-size-${idx}`}
                                        >
                                          {ar ? "مقاس غير مضاف" : "untracked"}
                                        </span>
                                      )}
                                      {canChangeSize && (
                                        <ChevronDown className="w-3 h-3" />
                                      )}
                                    </button>
                                  );
                                })()}
                              {sizeEditIdx === idx && (
                                <div
                                  className="absolute top-full start-0 mt-1 z-20 bg-background border-2 border-border rounded-xl shadow-lg p-2 flex flex-col gap-1 min-w-[140px]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {(
                                    (item.product.sizes as string[] | undefined) || []
                                  ).map((sz) => {
                                    const avail = getAvailableStock(
                                      item.product,
                                      sz,
                                      item.color,
                                    );
                                    const isCurrent = sz === item.size;
                                    const isOut = !isCurrent && avail <= 0;
                                    return (
                                      <button
                                        key={sz}
                                        type="button"
                                        disabled={isOut}
                                        onClick={() => changeCartItemSize(idx, sz)}
                                        className={`flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${isCurrent ? "bg-muted" : isOut ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/60"}`}
                                        data-testid={`option-cart-size-${idx}-${sz}`}
                                      >
                                        <span>{sz}</span>
                                        <span className="text-muted-foreground ltr-num">
                                          {isCurrent ? item.quantity + avail : avail}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                              {item.color &&
                                (() => {
                                  const colorVariants =
                                    (item.product.colorVariants as
                                      | ColorVariant[]
                                      | undefined) || [];
                                  const currentCv = colorVariants.find(
                                    (c) => c.name === item.color,
                                  );
                                  const canChangeColor = colorVariants.length > 1;
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!canChangeColor) return;
                                        setSizeEditIdx(null);
                                        setColorEditIdx((v) =>
                                          v === idx ? null : idx,
                                        );
                                      }}
                                      className={`flex items-center gap-1 text-xs text-muted-foreground ${canChangeColor ? "hover:text-foreground cursor-pointer" : "cursor-default"}`}
                                      data-testid={`button-change-cart-color-${idx}`}
                                    >
                                      {item.size && <span>·</span>}
                                      {currentCv?.colorCode && (
                                        <span
                                          className="w-3 h-3 rounded-full border border-border shadow-sm flex-shrink-0"
                                          style={{ backgroundColor: currentCv.colorCode }}
                                        />
                                      )}
                                      <span>{item.color}</span>
                                      {canChangeColor && (
                                        <ChevronDown className="w-3 h-3" />
                                      )}
                                    </button>
                                  );
                                })()}
                              {colorEditIdx === idx && (
                                <div
                                  className="absolute top-full start-0 mt-1 z-20 bg-background border-2 border-border rounded-xl shadow-lg p-2 flex flex-col gap-1 min-w-[140px]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {(
                                    (item.product.colorVariants as
                                      | ColorVariant[]
                                      | undefined) || []
                                  ).map((cv) => (
                                    <button
                                      key={cv.name}
                                      type="button"
                                      onClick={() =>
                                        changeCartItemColor(idx, cv.name)
                                      }
                                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${cv.name === item.color ? "bg-muted" : "hover:bg-muted/60"}`}
                                      data-testid={`option-cart-color-${idx}-${cv.name}`}
                                    >
                                      <span
                                        className="w-3.5 h-3.5 rounded-full border border-border shadow-sm flex-shrink-0"
                                        style={{ backgroundColor: cv.colorCode }}
                                      />
                                      {cv.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          <p className="text-xs text-foreground mt-0.5 ltr-num">
                            ₪{item.unitPrice.toFixed(2)} × {item.quantity} ={" "}
                            <span className="font-bold text-foreground">
                              ₪{(item.unitPrice * item.quantity).toFixed(2)}
                            </span>
                          </p>
                          <div className="flex items-center gap-1.5 mt-2.5">
                            <button
                              onClick={() => updateQty(idx, -1)}
                              className="w-10 h-10 flex items-center justify-center border-2 border-border hover:bg-muted rounded-xl transition-colors active:scale-95"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-9 text-center text-sm font-bold">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQty(idx, 1)}
                              disabled={availMore <= 0}
                              className={`w-10 h-10 flex items-center justify-center border-2 rounded-xl transition-colors active:scale-95 ${availMore <= 0 ? "opacity-30 cursor-not-allowed border-border" : "border-border hover:bg-muted"}`}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => updateQty(idx, 5)}
                              disabled={availMore <= 0}
                              className={`px-3 h-10 flex items-center border-2 rounded-xl text-xs font-semibold text-muted-foreground transition-colors active:scale-95 ${availMore <= 0 ? "opacity-30 cursor-not-allowed border-border" : "border-border hover:bg-muted"}`}
                            >
                              +5
                            </button>
                            {availMore === 0 && (
                              <span className="text-[10px] text-orange-500 font-semibold ms-1">
                                {ar ? "الحد الأقصى" : "Max"}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeItem(idx)}
                          className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl transition-colors flex-shrink-0 border-2 border-transparent hover:border-destructive/20 active:scale-95"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  <div ref={cartEndRef} />
                </div>
              )}
            </div>

            {/* Discount + Note + Totals + Checkout */}
            {cart.length > 0 && (
              <div className="border-t border-border p-4 space-y-3 bg-muted/5">
                {/* Note + Discount toggles row */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowNote((v) => !v)}
                    className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold h-11 rounded-xl border-2 transition-colors active:scale-95 ${showNote ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}
                  >
                    <span className="text-base leading-none">📝</span>
                    {ar ? "ملاحظة" : "Note"}
                    {note && <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />}
                  </button>
                  <button
                    onClick={() => setShowDiscount((v) => !v)}
                    className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold h-11 rounded-xl border-2 transition-colors active:scale-95 ${showDiscount ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}
                    data-testid="button-discount-type"
                  >
                    <Tag className="w-4 h-4" />
                    {ar ? "خصم" : "Discount"}
                    {discountValue && <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />}
                  </button>
                </div>

                {/* Note expanded */}
                {showNote && (
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={ar ? "مثال: هدية، استبدال..." : "e.g. gift, exchange..."}
                    className="w-full text-sm border-2 border-border bg-background rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    data-testid="input-sale-note"
                    autoFocus
                  />
                )}

                {/* Discount expanded */}
                {showDiscount && (
                  <div className="flex gap-2 items-center">
                    <Input
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder="0"
                      className="h-12 text-base flex-1 rounded-xl border-2"
                      type="number"
                      min="0"
                      data-testid="input-discount"
                      autoFocus
                    />
                    <button
                      onClick={() =>
                        setDiscountType((t) =>
                          t === "percent" ? "fixed" : "percent",
                        )
                      }
                      className="flex items-center gap-1 px-4 h-12 border-2 border-border hover:bg-muted text-base font-bold transition-colors flex-shrink-0 min-w-[56px] justify-center rounded-xl active:scale-95"
                    >
                      {discountType === "percent" ? "%" : "₪"}
                    </button>
                    {discountValue && (
                      <button
                        onClick={() => setDiscountValue("")}
                        className="w-12 h-12 flex items-center justify-center text-muted-foreground hover:text-destructive flex-shrink-0 rounded-xl border-2 border-transparent hover:border-destructive/20 transition-colors active:scale-95"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Totals */}
                <div className="rounded-xl bg-muted/40 border border-border p-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-foreground">
                    <span>{ar ? "المجموع الفرعي" : "Subtotal"}</span>
                    <span className="ltr-num">₪{cartSubtotal.toFixed(2)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-xs text-red-500 font-medium">
                      <span>{ar ? "الخصم" : "Discount"}</span>
                      <span className="ltr-num">-₪{discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-1.5 border-t border-border/60 mt-1.5">
                    <span>{ar ? "الإجمالي" : "Total"}</span>
                    <span className="text-primary ltr-num">
                      ₪{cartTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Cash input */}
                {paymentMethod === "cash" && (
                  <div className="space-y-3 rounded-xl border-2 border-border p-3 bg-background">
                    <label className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      {ar ? "المبلغ المستلم" : "Cash Received"}
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[20, 50, 100, 200].map((v) => (
                        <button
                          key={v}
                          onClick={() =>
                            setCashReceived((prev) => {
                              const current = parseFloat(prev) || 0;
                              return String(
                                Math.round((current + v) * 100) / 100,
                              );
                            })
                          }
                          className="h-12 text-sm font-bold border-2 rounded-xl transition-colors active:scale-95 border-border hover:bg-muted"
                        >
                          <span className="ltr-num">₪{v}</span>
                        </button>
                      ))}
                    </div>
                    <Input
                      ref={cashRef}
                      value={cashReceived}
                      onChange={(e) =>
                        setCashReceived(
                          e.target.value.replace(/[^0-9.]/g, ""),
                        )
                      }
                      onFocus={(e) => e.target.select()}
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      min="0"
                      placeholder={ar ? "أدخل المبلغ..." : "Enter amount..."}
                      className="h-13 text-lg font-mono rounded-xl border-2"
                      data-testid="input-cash-received"
                    />
                    {cashAmt > 0 && cashAmt < cartTotal && (
                      <div className="flex justify-between items-center bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2.5 rounded-lg">
                        <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                          {ar ? "المبلغ غير كافٍ" : "Insufficient"}
                        </span>
                        <span className="text-sm font-bold text-red-600 dark:text-red-400 ltr-num">
                          {ar
                            ? `ينقص ₪${(cartTotal - cashAmt).toFixed(2)}`
                            : `-₪${(cartTotal - cashAmt).toFixed(2)}`}
                        </span>
                      </div>
                    )}
                    {cashAmt >= cartTotal && cashAmt > 0 && (
                      <div className="flex justify-between items-center bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-3 py-2.5 rounded-lg">
                        <span className="text-xs font-semibold text-green-700 dark:text-green-300">
                          {ar ? "الباقي للزبون" : "Change"}
                        </span>
                        <span className="text-lg font-bold text-green-600 dark:text-green-400 ltr-num">
                          ₪{changeAmount.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Split payment input */}
                {paymentMethod === "split" && (
                  <div className="space-y-2.5 rounded-xl border border-border p-3 bg-background">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {ar ? "تقسيم الدفع" : "Split Payment"}
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1.5 font-medium">
                          <Banknote className="w-3 h-3" />
                          {ar ? "نقدي" : "Cash"}
                        </label>
                        <Input
                          ref={cashRef}
                          value={cashReceived}
                          onChange={(e) => {
                            setCashReceived(e.target.value);
                            setCardReceived(
                              (
                                cartTotal - (parseFloat(e.target.value) || 0)
                              ).toFixed(2),
                            );
                          }}
                          type="number"
                          min="0"
                          placeholder="₪0"
                          className="h-9 text-sm rounded-lg"
                          data-testid="input-split-cash"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1.5 font-medium">
                          <CreditCard className="w-3 h-3" />
                          {ar ? "بطاقة" : "Card"}
                        </label>
                        <Input
                          ref={cardRef}
                          value={cardReceived}
                          onChange={(e) => setCardReceived(e.target.value)}
                          type="number"
                          min="0"
                          placeholder="₪0"
                          className="h-9 text-sm rounded-lg"
                          data-testid="input-split-card"
                        />
                      </div>
                    </div>
                    {Math.abs(splitTotal - cartTotal) < 0.01 &&
                    splitTotal > 0 ? (
                      <div className="text-xs text-green-600 font-semibold text-center bg-green-50 dark:bg-green-950/20 rounded-lg py-1.5">
                        ✓ {ar ? "مجموع الدفع صحيح" : "Amounts match"}
                      </div>
                    ) : splitTotal > 0 ? (
                      <div className="text-xs text-orange-500 font-semibold text-center bg-orange-50 dark:bg-orange-950/20 rounded-lg py-1.5">
                        {ar
                          ? `الفرق: ₪${Math.abs(splitTotal - cartTotal).toFixed(2)}`
                          : `Difference: ₪${Math.abs(splitTotal - cartTotal).toFixed(2)}`}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Payment buttons */}
                {paymentMethod === null ? (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setPaymentMethod("cash");
                          setTimeout(() => cashRef.current?.focus(), 100);
                        }}
                        className="flex items-center justify-center gap-2 h-16 bg-foreground text-background hover:bg-foreground/90 transition-all font-bold text-base rounded-2xl shadow-sm active:scale-95"
                        data-testid="button-pay-cash"
                      >
                        <Banknote className="w-6 h-6" />
                        {ar ? "نقدي" : "Cash"}
                      </button>
                      <button
                        onClick={() => setPaymentMethod("card")}
                        className="flex items-center justify-center gap-2 h-16 border-2 border-foreground hover:bg-muted transition-all font-bold text-base rounded-2xl active:scale-95"
                        data-testid="button-pay-card"
                      >
                        <CreditCard className="w-6 h-6" />
                        {ar ? "بطاقة" : "Card"}
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setPaymentMethod("split");
                        setCashReceived("");
                        setCardReceived("");
                        setTimeout(() => cashRef.current?.focus(), 100);
                      }}
                      className="w-full flex items-center justify-center gap-2 h-12 border-2 border-border hover:bg-muted text-sm font-semibold text-muted-foreground transition-colors rounded-2xl active:scale-95"
                      data-testid="button-pay-split"
                    >
                      <Split className="w-5 h-5" />
                      {ar ? "دفع مختلط (نقدي + بطاقة)" : "Split (Cash + Card)"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 pt-1">
                    <button
                      onClick={completeSale}
                      disabled={
                        completing ||
                        (paymentMethod === "cash" && cashAmt < cartTotal) ||
                        (paymentMethod === "split" &&
                          Math.abs(splitTotal - cartTotal) > 0.01)
                      }
                      className="w-full h-16 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-lg flex items-center justify-center gap-3 transition-all rounded-2xl shadow-sm active:scale-95"
                      data-testid="button-confirm-sale"
                    >
                      {completing ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <Check className="w-6 h-6" />
                      )}
                      {ar ? "تأكيد البيع" : "Confirm Sale"}
                    </button>
                    <button
                      onClick={() => {
                        setPaymentMethod(null);
                        setCashReceived("");
                        setCardReceived("");
                      }}
                      className="w-full h-12 border-2 border-border hover:bg-muted text-sm font-semibold text-muted-foreground transition-colors flex items-center justify-center gap-2 rounded-2xl active:scale-95"
                      data-testid="button-cancel-payment"
                    >
                      <X className="w-5 h-5" />
                      {ar ? "إلغاء" : "Cancel"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Product Picker Modal ─────────────────────────────────────── */}
      {pickerProduct && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
          onClick={() => {
            setPickerProduct(null);
            barcodeRef.current?.focus();
          }}
        >
          <div
            className="bg-background w-full sm:max-w-lg shadow-2xl rounded-t-3xl sm:rounded-3xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            data-testid="pos-product-picker"
          >
            {/* Header */}
            <div className="flex items-start gap-4 p-5 border-b border-border">
              <div className="w-24 h-28 bg-muted overflow-hidden flex-shrink-0 rounded-2xl shadow-sm">
                <img
                  src={getProductImage(pickerProduct, pickerColor)}
                  alt={pickerProduct.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <h3 className="font-bold text-lg leading-tight">
                  {ar ? (pickerProduct as any).nameAr || pickerProduct.name : pickerProduct.name}
                </h3>
                <p className="text-base mt-1.5">
                  {pickerProduct.discountPrice ? (
                    <span className="flex items-baseline gap-2">
                      <span className="text-red-600 font-bold text-xl ltr-num">
                        ₪{parseFloat(pickerProduct.discountPrice as string).toFixed(2)}
                      </span>
                      <span className="line-through text-sm text-muted-foreground ltr-num">
                        ₪{parseFloat(pickerProduct.price as string).toFixed(2)}
                      </span>
                    </span>
                  ) : (
                    <span className="font-bold text-xl ltr-num">
                      ₪{parseFloat(pickerProduct.price as string).toFixed(2)}
                    </span>
                  )}
                </p>
                <p className={`text-sm font-semibold mt-1 ${pickerAvail <= 3 && pickerAvail > 0 ? "text-orange-500" : "text-muted-foreground"}`}>
                  {ar ? `مخزون: ${pickerProduct.stockQuantity}` : `Stock: ${pickerProduct.stockQuantity}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setPickerProduct(null);
                  barcodeRef.current?.focus();
                }}
                className="w-11 h-11 flex items-center justify-center rounded-2xl border-2 border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors flex-shrink-0 active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Color */}
              {((pickerProduct.colorVariants as ColorVariant[] | undefined) || []).length > 1 && (
                <div>
                  <label className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3 block">
                    {ar ? "اللون" : "Color"}
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {((pickerProduct.colorVariants as ColorVariant[]) || []).map((cv) => (
                      <button
                        key={cv.name}
                        onClick={() => {
                          const sizes = (pickerProduct.sizes as string[]) || [];
                          const inv = cv.sizeInventory as Record<string, number> | undefined;
                          const firstAvail = sizes.find((sz) => inv ? (inv[sz] ?? 0) > 0 : pickerProduct.stockQuantity > 0) ?? "";
                          setPickerColor(cv.name);
                          setPickerSize(firstAvail);
                          setPickerQty(1);
                          setPickerIsHintSize(false);
                        }}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-2 rounded-2xl transition-colors active:scale-95 ${pickerColor === cv.name ? "bg-foreground text-background border-foreground shadow-md" : "border-border hover:bg-muted"}`}
                      >
                        <span
                          className="w-4 h-4 rounded-full border border-white/30 shadow-sm flex-shrink-0"
                          style={{ backgroundColor: cv.colorCode }}
                        />
                        {cv.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Size */}
              {pickerSizes.length > 0 && (
                <div>
                  <label className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-3 block">
                    {ar ? "المقاس" : "Size"}
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {pickerSizes.map((s) => {
                      const avail = getAvailableStock(pickerProduct, s, pickerColor || undefined);
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => {
                            if (avail > 0) {
                              setPickerSize(s);
                              setPickerIsHintSize(false);
                              setPickerQty((q) => Math.min(q, avail));
                            }
                          }}
                          disabled={avail <= 0}
                          className={`min-w-[64px] h-14 px-4 text-sm font-bold border-2 rounded-2xl transition-colors active:scale-95 ${
                            pickerSize === s && !pickerIsHintSize
                              ? "bg-foreground text-background border-foreground shadow-md"
                              : avail <= 0
                                ? "border-border opacity-30 cursor-not-allowed line-through"
                                : "border-border hover:bg-muted"
                          }`}
                        >
                          <span className="block">{s}</span>
                          {avail > 0 && (
                            <span className={`block text-[11px] font-normal mt-0.5 ${pickerSize === s && !pickerIsHintSize ? "text-background/70" : "text-muted-foreground"}`}>
                              ({avail})
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* One unified "sell anyway" row for anything not
                      currently purchasable — sizes that are sold out
                      (already tracked, 0 left) and sizes that were never
                      added at all. Lighter pill style on purpose so it
                      reads as a secondary/optional action, not a second
                      set of primary size buttons. Selling one creates
                      (or keeps) the size on the product with its stock
                      netted to 0, so it shows out-of-stock on the site
                      right after — and stays reachable here to sell
                      again anytime, it's never removed from this row. */}
                  {(() => {
                    const depletedSizes = pickerSizes.filter(
                      (s) => getAvailableStock(pickerProduct, s, pickerColor || undefined) <= 0,
                    );
                    const overrideSizes = [
                      ...depletedSizes.map((s) => ({ size: s, isNew: false })),
                      ...pickerHintSizes.map((s) => ({ size: s, isNew: true })),
                    ];
                    if (overrideSizes.length === 0) return null;
                    return (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-[11px] text-muted-foreground mb-2">
                          {ar ? "مقاسات أخرى:" : "Other sizes:"}
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                          {overrideSizes.map(({ size: s, isNew }) => {
                            const isSelected = pickerSize === s && pickerIsHintSize;
                            return (
                              <button
                                key={`override-${s}`}
                                type="button"
                                onClick={() => {
                                  setPickerSize(s);
                                  setPickerIsHintSize(true);
                                  setPickerQty(1);
                                }}
                                className={`h-9 px-3 text-xs font-semibold rounded-full transition-colors active:scale-95 flex items-center gap-1.5 ${
                                  isSelected
                                    ? "bg-violet-600 text-white"
                                    : "bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-950/50"
                                }`}
                                data-testid={`button-picker-override-size-${s}`}
                              >
                                {s}
                                <span className={isSelected ? "text-white/70" : "text-violet-500/70 dark:text-violet-400/60"}>
                                  {isNew ? (ar ? "غير مضاف" : "new") : (ar ? "نفد" : "sold out")}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Quantity */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    {ar ? "الكمية" : "Quantity"}
                  </label>
                  {pickerAvail > 0 && (
                    <span className={`text-sm font-bold ${pickerAvail <= 3 ? "text-orange-500" : "text-muted-foreground"}`}>
                      {ar ? `متاح: ${pickerAvail}` : `Avail: ${pickerAvail}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPickerQty((q) => Math.max(1, q - 1))}
                    className="w-14 h-14 flex items-center justify-center border-2 border-border hover:bg-muted rounded-2xl transition-colors active:scale-95 flex-shrink-0"
                    data-testid="picker-qty-minus"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className="flex-1 text-center font-bold text-3xl tabular-nums">
                    {pickerQty}
                  </span>
                  <button
                    onClick={() => setPickerQty((q) => pickerAvail > 0 ? Math.min(q + 1, pickerAvail) : q)}
                    disabled={pickerAvail > 0 && pickerQty >= pickerAvail}
                    className="w-14 h-14 flex items-center justify-center border-2 border-border hover:bg-muted rounded-2xl transition-colors active:scale-95 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    data-testid="picker-qty-plus"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setPickerQty((q) => pickerAvail > 0 ? Math.min(q + 5, pickerAvail) : q)}
                    disabled={pickerAvail > 0 && pickerQty >= pickerAvail}
                    className="h-14 px-5 border-2 border-border hover:bg-muted text-sm font-bold text-muted-foreground rounded-2xl transition-colors active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    +5
                  </button>
                  {pickerAvail > 0 && pickerQty < pickerAvail && (
                    <button
                      onClick={() => setPickerQty(pickerAvail)}
                      className="h-14 px-4 border-2 border-border hover:bg-muted text-sm font-semibold text-muted-foreground rounded-2xl transition-colors active:scale-95 flex-shrink-0"
                    >
                      {ar ? "الكل" : "Max"}
                    </button>
                  )}
                </div>
              </div>

              {/* Heads-up when about to sell an untracked size */}
              {pickerIsHintSize && (
                <div className="px-3.5 py-3 rounded-2xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400 text-xs">
                  {ar
                    ? `سيتم إضافة المقاس "${pickerSize}" للمنتج، وسيظهر بعدها "نفد المخزون" في الموقع.`
                    : `Size "${pickerSize}" will be added to the product and show as out-of-stock on the site.`}
                </div>
              )}

              {/* Confirm button */}
              <button
                onClick={confirmPicker}
                disabled={pickerAvail <= 0 || (pickerSizes.length > 0 && !pickerSize)}
                className={`w-full h-16 font-bold text-lg flex items-center justify-center gap-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl shadow-sm active:scale-95 ${pickerIsHintSize ? "bg-violet-600 text-white hover:bg-violet-700" : "bg-foreground text-background hover:bg-foreground/90"}`}
                data-testid="button-picker-confirm"
              >
                <Plus className="w-6 h-6" />
                {pickerAvail <= 0
                  ? ar ? "نفد المخزون" : "Out of Stock"
                  : pickerIsHintSize
                    ? ar
                      ? `بيع مقاس غير مضاف (${pickerQty})`
                      : `Sell untracked size (${pickerQty})`
                    : ar
                      ? `إضافة ${pickerQty} للفاتورة`
                      : `Add ${pickerQty} to invoice`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cart Image Lightbox ──────────────────────────────────────── */}
      {cartImageView && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setCartImageView(null)}
        >
          <div className="relative max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={cartImageView.src}
              alt={cartImageView.name}
              className="w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl"
            />
            <p className="text-center text-white text-sm font-semibold mt-3 drop-shadow">
              {cartImageView.name}
            </p>
            <button
              onClick={() => setCartImageView(null)}
              className="absolute -top-3 -right-3 w-10 h-10 bg-background rounded-full flex items-center justify-center shadow-lg hover:bg-muted transition-colors border border-border"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Transaction Detail Modal ─────────────────────────────────── */}
      {expandedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setExpandedOrder(null)}
        >
          <div
            className="bg-background border border-border w-full max-w-md shadow-2xl rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            data-testid="pos-order-detail-modal"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  {ar
                    ? `فاتورة #${expandedOrder.id}`
                    : `Invoice #${expandedOrder.id}`}
                  {isExchangeOrder(expandedOrder.note) && (
                    <span
                      className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                      data-testid="badge-exchange-detail"
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      {ar ? "فاتورة تبديل" : "Exchange invoice"}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {format(new Date(expandedOrder.created_at || expandedOrder.createdAt || Date.now()), "yyyy-MM-dd · hh:mm a")}
                  <span className="mx-1">·</span>
                  {(() => {
                    const method =
                      expandedOrder.payment_method || expandedOrder.paymentMethod || "cash";
                    const isUpdating =
                      updateOrderPaymentMethodMutation.isPending &&
                      (updateOrderPaymentMethodMutation.variables as any)?.id === expandedOrder.id;
                    const isEditingSplit = editingSplitFor === expandedOrder.id;
                    const invoiceTotal =
                      parseFloat(expandedOrder.total_amount ?? expandedOrder.totalAmount ?? 0) || 0;
                    const splitCashVal = parseFloat(splitCashInput) || 0;
                    const splitCardVal = parseFloat(splitCardInput) || 0;
                    const splitEditSum = splitCashVal + splitCardVal;
                    const splitEditDiff = Math.abs(splitEditSum - invoiceTotal);
                    const splitEditValid = splitEditDiff <= 0.01;
                    // Reports sometimes need the method corrected after the
                    // fact (wrong button tapped at checkout) — this lets the
                    // admin flip it here instead of deleting and re-ringing
                    // the whole invoice. Split invoices can be switched too —
                    // doing so moves the full total onto whichever method is
                    // picked (the split is discarded).
                    const doSwitch = (target: "cash" | "card") => {
                      if (method === target) return;
                      if (
                        method === "split" &&
                        !window.confirm(
                          ar
                            ? "هذه فاتورة مختلطة (نقدي + بطاقة). تحويلها سيجعل كامل المبلغ ضمن الطريقة الجديدة ويلغي التقسيم. متابعة؟"
                            : "This is a split (cash + card) invoice. Switching will move the full amount onto the new method and discard the split. Continue?",
                        )
                      ) {
                        return;
                      }
                      updateOrderPaymentMethodMutation.mutate({
                        id: expandedOrder.id,
                        paymentMethod: target,
                      });
                    };
                    // Switching TO مختلط needs a cash/card breakdown instead
                    // of a single click, so it opens an inline entry form —
                    // prefilled with the invoice's current split if it
                    // already has one, blank otherwise (same as checkout).
                    const openSplitEditor = () => {
                      const existingCash =
                        parseFloat(expandedOrder.cash_amount ?? expandedOrder.cashAmount ?? 0) || 0;
                      const existingCard =
                        parseFloat(expandedOrder.card_amount ?? expandedOrder.cardAmount ?? 0) || 0;
                      if (method === "split" && existingCash + existingCard > 0) {
                        setSplitCashInput(existingCash.toFixed(2));
                        setSplitCardInput(existingCard.toFixed(2));
                      } else {
                        setSplitCashInput("");
                        setSplitCardInput("");
                      }
                      setEditingSplitFor(expandedOrder.id);
                    };
                    const confirmSplit = () => {
                      if (!splitEditValid) return;
                      updateOrderPaymentMethodMutation.mutate({
                        id: expandedOrder.id,
                        paymentMethod: "split",
                        cashAmount: splitCashVal,
                        cardAmount: splitCardVal,
                      });
                    };
                    return (
                      <span className="flex items-center gap-1.5 flex-wrap">
                        {method === "split" && !isEditingSplit && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                            <Split className="w-3 h-3" />
                            {ar ? "مختلط" : "Split"}
                            {" · "}
                            <Banknote className="w-3 h-3" />
                            ₪{(parseFloat(expandedOrder.cash_amount ?? expandedOrder.cashAmount ?? 0) || 0).toFixed(2)}
                            {" · "}
                            <CreditCard className="w-3 h-3" />
                            ₪{(parseFloat(expandedOrder.card_amount ?? expandedOrder.cardAmount ?? 0) || 0).toFixed(2)}
                          </span>
                        )}
                        {!isEditingSplit && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-background p-0.5"
                            data-testid="invoice-payment-method-switcher"
                          >
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => doSwitch("cash")}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                                method === "cash"
                                  ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300"
                                  : "text-muted-foreground hover:bg-muted"
                              }`}
                              title={ar ? "تحويل إلى نقدي" : "Switch to cash"}
                              data-testid="button-invoice-set-cash"
                            >
                              <Banknote className="w-3 h-3" />
                              {ar ? "نقدي" : "Cash"}
                            </button>
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => doSwitch("card")}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                                method === "card"
                                  ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                                  : "text-muted-foreground hover:bg-muted"
                              }`}
                              title={ar ? "تحويل إلى بطاقة" : "Switch to card"}
                              data-testid="button-invoice-set-card"
                            >
                              <CreditCard className="w-3 h-3" />
                              {ar ? "بطاقة" : "Card"}
                            </button>
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={openSplitEditor}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-60 ${
                                method === "split"
                                  ? "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300"
                                  : "text-muted-foreground hover:bg-muted"
                              }`}
                              title={ar ? "تحويل إلى مختلط" : "Switch to split"}
                              data-testid="button-invoice-set-split"
                            >
                              <Split className="w-3 h-3" />
                              {ar ? "مختلط" : "Split"}
                            </button>
                            {isUpdating && (
                              <Loader2 className="w-3 h-3 animate-spin text-muted-foreground me-1" />
                            )}
                          </span>
                        )}
                        {isEditingSplit && (
                          <span
                            className="flex items-center gap-2 flex-wrap rounded-xl border border-border bg-muted/40 px-2 py-1.5"
                            data-testid="invoice-split-editor"
                          >
                            <span className="flex items-center gap-1">
                              <Banknote className="w-3 h-3 text-muted-foreground shrink-0" />
                              <Input
                                autoFocus
                                disabled={isUpdating}
                                value={splitCashInput}
                                onChange={(e) => {
                                  setSplitCashInput(e.target.value);
                                  setSplitCardInput(
                                    (invoiceTotal - (parseFloat(e.target.value) || 0)).toFixed(2),
                                  );
                                }}
                                type="number"
                                min="0"
                                placeholder="₪0"
                                className="h-6 w-16 text-[11px] px-1.5 rounded-md"
                                data-testid="input-invoice-split-cash"
                              />
                            </span>
                            <span className="flex items-center gap-1">
                              <CreditCard className="w-3 h-3 text-muted-foreground shrink-0" />
                              <Input
                                disabled={isUpdating}
                                value={splitCardInput}
                                onChange={(e) => setSplitCardInput(e.target.value)}
                                type="number"
                                min="0"
                                placeholder="₪0"
                                className="h-6 w-16 text-[11px] px-1.5 rounded-md"
                                data-testid="input-invoice-split-card"
                              />
                            </span>
                            <button
                              type="button"
                              disabled={isUpdating || !splitEditValid}
                              onClick={confirmSplit}
                              className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title={ar ? "تأكيد" : "Confirm"}
                              data-testid="button-invoice-split-confirm"
                            >
                              {isUpdating ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={isUpdating}
                              onClick={() => setEditingSplitFor(null)}
                              className="flex items-center justify-center w-6 h-6 rounded-full text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
                              title={ar ? "إلغاء" : "Cancel"}
                              data-testid="button-invoice-split-cancel"
                            >
                              <X className="w-3 h-3" />
                            </button>
                            {splitEditSum > 0 && (
                              <span
                                className={`text-[10px] font-semibold w-full ${
                                  splitEditValid ? "text-green-600" : "text-orange-500"
                                }`}
                              >
                                {splitEditValid
                                  ? ar
                                    ? "✓ مجموع الدفع صحيح"
                                    : "✓ Amounts match"
                                  : ar
                                    ? `الفرق: ₪${splitEditDiff.toFixed(2)}`
                                    : `Difference: ₪${splitEditDiff.toFixed(2)}`}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    );
                  })()}
                </p>
                {expandedOrder.note && (
                  isExchangeOrder(expandedOrder.note) && expandedOrderExchangeSummary ? (
                    <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/80 dark:bg-blue-950/20 p-3 space-y-3" data-testid="exchange-note-summary">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-xs font-bold text-blue-800 dark:text-blue-200">
                            {ar ? "ملخص فاتورة التبديل" : "Exchange invoice summary"}
                          </p>
                          <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                            {ar ? "مرتب وواضح لسهولة قراءة تفاصيل التبديل" : "A clean summary of the exchange details."}
                          </p>
                        </div>
                        {expandedOrderExchangeSummary.originalInvoiceId && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-background px-2 py-1 text-[10px] font-bold text-blue-700 dark:text-blue-300 ltr-num">
                            <Receipt className="w-3 h-3" />
                            {ar ? `الفاتورة الأصلية #${expandedOrderExchangeSummary.originalInvoiceId}` : `Original invoice #${expandedOrderExchangeSummary.originalInvoiceId}`}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="rounded-lg border border-blue-200 bg-background px-2.5 py-2">
                          <p className="text-[10px] text-muted-foreground">{ar ? "رصيد المرتجع" : "Return credit"}</p>
                          <p className="text-sm font-bold ltr-num">₪{(expandedOrderExchangeSummary.returnCredit || 0).toFixed(2)}</p>
                        </div>
                        <div className="rounded-lg border border-blue-200 bg-background px-2.5 py-2">
                          <p className="text-[10px] text-muted-foreground">{ar ? "إجمالي البديل" : "Replacement total"}</p>
                          <p className="text-sm font-bold ltr-num">₪{(expandedOrderExchangeSummary.replacementTotal || 0).toFixed(2)}</p>
                        </div>
                        <div className="rounded-lg border border-blue-200 bg-background px-2.5 py-2">
                          <p className="text-[10px] text-muted-foreground">{ar ? "فرق السعر" : "Price difference"}</p>
                          <p className="text-sm font-bold ltr-num">
                            {expandedOrderExchangeSummary.priceDifferenceDirection === "customer_pays"
                              ? (ar ? "يدفع الزبون" : "Customer pays")
                              : expandedOrderExchangeSummary.priceDifferenceDirection === "refund"
                                ? (ar ? "يُرد للزبون" : "Refund to customer")
                                : (ar ? "لا يوجد" : "No difference")}
                            {expandedOrderExchangeSummary.priceDifferenceDirection !== "none" && ` · ₪${(expandedOrderExchangeSummary.priceDifference || 0).toFixed(2)}`}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-amber-200 bg-background px-2.5 py-2">
                          <p className="text-[10px] font-bold text-amber-800 dark:text-amber-200 mb-2">
                            {ar ? "القطع المرتجعة" : "Returned items"}
                          </p>
                          <div className="space-y-2">
                            {expandedOrderExchangeSummary.returnedItems.map((noteItem, idx) => (
                              <div key={idx} className="rounded-md border border-amber-100 bg-amber-50/70 px-2 py-1.5 text-[11px]">
                                <p className="font-semibold leading-snug">{noteItem.name}</p>
                                <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-amber-800 dark:text-amber-200">
                                  {noteItem.productId ? <span className="px-1.5 py-0.5 rounded bg-background border border-amber-200 ltr-num">ID #{noteItem.productId}</span> : null}
                                  {noteItem.size ? <span className="px-1.5 py-0.5 rounded bg-background border border-amber-200">{noteItem.size}</span> : null}
                                  {noteItem.color ? <span className="px-1.5 py-0.5 rounded bg-background border border-amber-200">{noteItem.color}</span> : null}
                                  <span className="font-bold ltr-num">× {noteItem.quantity}</span>
                                  {typeof noteItem.lineTotal === "number" ? <span className="ltr-num">₪{noteItem.lineTotal.toFixed(2)}</span> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-lg border border-blue-200 bg-background px-2.5 py-2">
                          <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 mb-2">
                            {ar ? "القطع البديلة" : "Replacement items"}
                          </p>
                          <div className="space-y-2">
                            {expandedOrderExchangeSummary.replacementItems.map((noteItem, idx) => (
                              <div key={idx} className="rounded-md border border-blue-100 bg-blue-50/70 px-2 py-1.5 text-[11px]">
                                <p className="font-semibold leading-snug">{noteItem.name}</p>
                                <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-blue-800 dark:text-blue-200">
                                  {noteItem.productId ? <span className="px-1.5 py-0.5 rounded bg-background border border-blue-200 ltr-num">ID #{noteItem.productId}</span> : null}
                                  {noteItem.size ? <span className="px-1.5 py-0.5 rounded bg-background border border-blue-200">{noteItem.size}</span> : null}
                                  {noteItem.color ? <span className="px-1.5 py-0.5 rounded bg-background border border-blue-200">{noteItem.color}</span> : null}
                                  <span className="font-bold ltr-num">× {noteItem.quantity}</span>
                                  {typeof noteItem.lineTotal === "number" ? <span className="ltr-num">₪{noteItem.lineTotal.toFixed(2)}</span> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-600 mt-1 whitespace-pre-line leading-relaxed">
                      📝 {expandedOrder.note}
                    </p>
                  )
                )}
              </div>
              <button
                onClick={() => setExpandedOrder(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              {Array.isArray(expandedOrder.exchangeHistory) && expandedOrder.exchangeHistory.length > 0 && (
                <div className="m-4 mb-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3" data-testid="invoice-exchange-history-detail">
                  <div className="flex items-center gap-2 mb-2 text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <p className="text-xs font-bold">
                      {ar
                        ? `تم التبديل من هذه الفاتورة سابقاً (${expandedOrder.exchangeHistory.length})`
                        : `This invoice was exchanged before (${expandedOrder.exchangeHistory.length})`}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {expandedOrder.exchangeHistory.map((event: any, eventIndex: number) => {
                      const linkedInvoice = getLinkedExchangeInvoiceForEvent(Number(expandedOrder.id), event);
                      const exchangedQty = (Array.isArray(event?.returnedItems) ? event.returnedItems : []).reduce(
                        (sum: number, histItem: any) => sum + Math.max(0, Number(histItem?.quantity) || 0),
                        0,
                      );

                      return (
                        <div key={eventIndex} className="rounded-xl border border-amber-200 dark:border-amber-800 bg-background/80 px-3 py-3 space-y-3">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-bold">{ar ? `تبديل ${eventIndex + 1}` : `Exchange ${eventIndex + 1}`}</span>
                                {linkedInvoice && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300 ltr-num">
                                    <ArrowLeftRight className="w-3 h-3" />
                                    {ar ? `فاتورة التبديل #${linkedInvoice.id}` : `Exchange invoice #${linkedInvoice.id}`}
                                  </span>
                                )}
                                {event?.override && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-300">
                                    <ShieldAlert className="w-3 h-3" />
                                    {ar ? "استثناء إداري" : "Admin override"}
                                  </span>
                                )}
                              </div>
                              {event?.exchangedAt && (
                                <p className="text-[10px] text-muted-foreground ltr-num mt-1">
                                  {format(new Date(event.exchangedAt), "yyyy-MM-dd · HH:mm")}
                                </p>
                              )}
                            </div>
                            <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                              {ar ? `${exchangedQty} قطعة تم تبديلها` : `${exchangedQty} item(s) exchanged`}
                            </span>
                          </div>

                          <div className="space-y-2">
                            <div>
                              <p className="text-[10px] font-bold text-amber-800 dark:text-amber-200 mb-1.5">
                                {ar ? "القطع التي تم تبديلها" : "Returned / exchanged items"}
                              </p>
                              <div className="space-y-1.5">
                                {(event.returnedItems || []).map((histItem: any, histIndex: number) => (
                                  <div key={histIndex} className="rounded-lg border border-amber-100 bg-amber-50/70 px-2.5 py-2 text-[11px]">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="font-semibold leading-snug truncate">
                                          {histItem.name || (ar ? `منتج #${histItem.productId}` : `Product #${histItem.productId}`)}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-amber-800 dark:text-amber-200">
                                          {histItem.productId ? <span className="px-1.5 py-0.5 rounded bg-background border border-amber-200 ltr-num">ID #{histItem.productId}</span> : null}
                                          {histItem.size ? <span className="px-1.5 py-0.5 rounded bg-background border border-amber-200">{histItem.size}</span> : null}
                                          {histItem.color ? <span className="px-1.5 py-0.5 rounded bg-background border border-amber-200">{histItem.color}</span> : null}
                                          {linkedInvoice ? <span className="px-1.5 py-0.5 rounded bg-background border border-blue-200 text-blue-700 dark:text-blue-300 ltr-num">#{linkedInvoice.id}</span> : null}
                                        </div>
                                      </div>
                                      <span className="font-bold shrink-0 ltr-num">× {histItem.quantity}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {Array.isArray(event.replacementItems) && event.replacementItems.length > 0 && (
                              <div className="pt-2 border-t border-amber-200 dark:border-amber-800">
                                <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 mb-1.5">
                                  {ar ? "القطع البديلة" : "Replacement items"}
                                </p>
                                <div className="space-y-1.5">
                                  {event.replacementItems.map((histItem: any, histIndex: number) => (
                                    <div key={histIndex} className="rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-[11px]">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <p className="font-semibold leading-snug truncate">
                                            {histItem.name || (ar ? `منتج #${histItem.productId}` : `Product #${histItem.productId}`)}
                                          </p>
                                          <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-blue-800 dark:text-blue-200">
                                            {histItem.productId ? <span className="px-1.5 py-0.5 rounded bg-background border border-blue-200 ltr-num">ID #{histItem.productId}</span> : null}
                                            {histItem.size ? <span className="px-1.5 py-0.5 rounded bg-background border border-blue-200">{histItem.size}</span> : null}
                                            {histItem.color ? <span className="px-1.5 py-0.5 rounded bg-background border border-blue-200">{histItem.color}</span> : null}
                                          </div>
                                        </div>
                                        <span className="font-bold shrink-0 ltr-num">× {histItem.quantity}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {(expandedOrder.items || []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  {ar ? "لا توجد تفاصيل" : "No details available"}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {(expandedOrder.items || []).map((item: any, i: number) => {
                    const matchedProduct = products.find(
                      (p: Product) =>
                        p.id === (item.productId || item.product_id),
                    );
                    const imgSrc = matchedProduct
                      ? item.color
                        ? (
                            (matchedProduct.colorVariants as
                              | ColorVariant[]
                              | undefined) || []
                          ).find((cv) => cv.name === item.color)?.mainImage ||
                          matchedProduct.mainImage
                        : matchedProduct.mainImage
                      : null;
                    const itemExchangeLinks = getItemExchangeLinks(expandedOrder, item);
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors"
                      >
                        <div className="relative flex-shrink-0">
                          <div className="w-14 h-16 rounded-lg overflow-hidden bg-muted border border-border">
                            {imgSrc ? (
                              <img
                                src={imgSrc}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Package className="w-5 h-5 opacity-20" />
                              </div>
                            )}
                          </div>
                          <div className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-foreground text-background text-[10px] font-bold flex items-center justify-center shadow">
                            {item.quantity || 1}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-tight truncate">
                            {item.name}
                          </p>
                          {(item.size || item.color) && (
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {item.size && (
                                <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded">
                                  {item.size}
                                </span>
                              )}
                              {item.color && (
                                <span className="text-[10px] text-muted-foreground">
                                  {item.color}
                                </span>
                              )}
                            </div>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-1 ltr-num">
                            ₪{parseFloat(item.price || 0).toFixed(2)} ×{" "}
                            {item.quantity || 1}
                          </p>
                          {itemExchangeLinks.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {itemExchangeLinks.map((link, linkIndex) => (
                                <div key={linkIndex} className="rounded-lg border border-amber-200 bg-amber-50/80 px-2 py-1.5 text-[10px]">
                                  <div className="flex flex-wrap items-center gap-1 text-amber-800 dark:text-amber-200">
                                    <span className="font-bold">
                                      {ar ? `تم تبديل ${link.quantity} من هذه القطعة` : `Exchanged ${link.quantity} from this item`}
                                    </span>
                                    {link.invoiceId ? (
                                      <span className="px-1.5 py-0.5 rounded bg-background border border-blue-200 text-blue-700 dark:text-blue-300 ltr-num">
                                        {ar ? `فاتورة #${link.invoiceId}` : `Invoice #${link.invoiceId}`}
                                      </span>
                                    ) : null}
                                  </div>
                                  {link.replacementProductIds.length > 0 && (
                                    <p className="mt-1 text-amber-700 dark:text-amber-300">
                                      {ar ? "مع المنتجات البديلة IDs:" : "With replacement product IDs:"}{" "}
                                      <span className="font-bold ltr-num">{link.replacementProductIds.join(", ")}</span>
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-end">
                          <p className="text-base font-bold ltr-num">
                            ₪{(parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-border px-5 py-4 bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
              <div>
                {getPosOrderDiscount(expandedOrder) > 0 && (
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mb-1">
                    <span>
                      {ar ? "المجموع الفرعي" : "Subtotal"}:{" "}
                      <span className="font-semibold ltr-num">
                        ₪{getPosOrderStoredSubtotal(expandedOrder).toFixed(2)}
                      </span>
                    </span>
                    <span className="text-amber-700 dark:text-amber-300">
                      {ar ? "خصم" : "Discount"}:{" "}
                      <span className="font-semibold ltr-num">
                        - ₪{getPosOrderDiscount(expandedOrder).toFixed(2)}
                      </span>
                    </span>
                  </div>
                )}
                <span className="text-sm text-muted-foreground">
                  {ar ? "إجمالي الفاتورة" : "Invoice Total"}
                </span>
                <div className="text-xl font-bold ltr-num">
                  ₪{getPosOrderTotal(expandedOrder).toFixed(2)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => reprintOrder(expandedOrder)}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors font-medium"
                  data-testid="button-reprint-order-detail"
                >
                  <Printer className="w-3.5 h-3.5" />
                  {ar ? "إعادة طباعة" : "Reprint"}
                </button>
                <button
                  onClick={() => setDeleteOrderConfirm(expandedOrder)}
                  className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/30 transition-colors font-medium"
                  data-testid="button-delete-order-detail"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {ar ? "حذف" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Exchange modal ──────────────────────────────────────────── */}
      {exchangeMode && (
        <div
          className={`fixed inset-0 z-50 flex ${oskTarget ? "items-start pt-4" : "items-center"} justify-center bg-black/60 p-4 transition-[padding-top] duration-200`}
          onClick={() => {
            setExchangeMode(false);
            setExchangeOrder(null);
            setExchangeSearch("");
            setExchangeOverride(false);
            setDressOverrideItems(new Set());
            setExchangeNewSearch("");
            setExchangeReplacementResultsOpen(false);
            setExchangeNewProduct(null);
            setExchangeNewSize("");
            setExchangeNewColor("");
            setExchangeNewQty(1);
            setExchangeReplacementItems([]);
            setExchangeCategoryFilter("all");
            setExchangeSubcategoryFilter("all");
            setExchangeOpenSubcategoryFor(null);
          }}
        >
          <div
            className={`bg-background border border-border w-full max-w-3xl shadow-2xl rounded-xl overflow-hidden ${oskTarget ? "max-h-[52vh]" : "max-h-[92vh]"} flex flex-col transition-[max-height] duration-200`}
            onClick={(e) => e.stopPropagation()}
            data-testid="pos-exchange-modal"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-blue-50 dark:bg-blue-950/20 sticky top-0 z-10">
              <h3 className="font-bold flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <ArrowLeftRight className="w-5 h-5" />
                {ar ? "تبديل المنتجات" : "Exchange Products"}
              </h3>
              <button
                onClick={() => {
                  setExchangeMode(false);
                  setExchangeOrder(null);
                  setExchangeSearch("");
                  setExchangeOverride(false);
                  setDressOverrideItems(new Set());
                  setExchangeNewSearch("");
                  setExchangeReplacementResultsOpen(false);
                  setExchangeNewProduct(null);
                  setExchangeNewSize("");
                  setExchangeNewColor("");
                  setExchangeNewQty(1);
                  setExchangeReplacementItems([]);
                  setExchangeCategoryFilter("all");
                  setExchangeSubcategoryFilter("all");
                  setExchangeOpenSubcategoryFor(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              {/* Policy reminder */}
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
                <div className="space-y-0.5">
                  <p className="font-semibold">{ar ? "سياسة التبديل" : "Exchange Policy"}</p>
                  <p>{ar ? "مدة التبديل: يومان (٤٨ ساعة) من تاريخ الشراء فقط" : "Exchange window: 2 days (48 h) from purchase date only"}</p>
                  <p>{ar ? "القطع الرسمية (فساتين) لا تبدل · لا يوجد ترجيع لجميع القطع" : "Formal dresses cannot be exchanged · No refunds on any items"}</p>
                </div>
              </div>

              {/* Search */}
              <div className="flex gap-2">
                <Input
                  ref={exchangeSearchRef}
                  value={exchangeSearch}
                  onChange={(e) => {
                    const value = e.target.value;
                    setExchangeSearch(value);
                    const now = Date.now();
                    const gap = now - exchangeLastChangeTime.current;
                    exchangeLastChangeTime.current = now;
                    if (exchangeScanTimer.current) clearTimeout(exchangeScanTimer.current);
                    if (value.trim()) {
                      // Scanner keystrokes land only a few ms apart. A fast
                      // run of them (or any short pause right after typing)
                      // means input is done — search automatically instead
                      // of waiting for an Enter/CR the scanner may not send,
                      // or for a manual click on Search.
                      const isLikelyScan = gap > 0 && gap <= 60;
                      exchangeScanTimer.current = setTimeout(
                        () => searchExchange(value),
                        isLikelyScan ? 60 : 260,
                      );
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (exchangeScanTimer.current) {
                      clearTimeout(exchangeScanTimer.current);
                      exchangeScanTimer.current = null;
                    }
                    searchExchange();
                  }}
                  placeholder={ar ? "رقم الفاتورة..." : "Invoice number..."}
                  className="flex-1"
                  type="number"
                  min="1"
                  data-testid="input-exchange-search"
                />
                <button
                  onClick={searchExchange}
                  className="px-4 py-2 bg-foreground text-background hover:bg-foreground/90 font-medium text-sm transition-colors rounded"
                  data-testid="button-exchange-search"
                >
                  {ar ? "بحث" : "Search"}
                </button>
              </div>

              {exchangeOrder && (() => {
                const expired = isExchangeExpired(exchangeOrder);
                const exchangeInvoice = isExchangeOrder(exchangeOrder.note);
                const exchangeHistory = Array.isArray(exchangeOrder.exchangeHistory) ? exchangeOrder.exchangeHistory : [];
                const hasPreviousExchanges = exchangeHistory.length > 0;
                const exchangeBlocked = (expired || exchangeInvoice) && !exchangeOverride;
                const orderDate = new Date(exchangeOrder.created_at || exchangeOrder.createdAt || "");
                const daysPassed = Math.floor((Date.now() - orderDate.getTime()) / 86400000);
                const exchangedQtyForItem = (item: any) =>
                  exchangeHistory.reduce((eventSum: number, event: any) =>
                    eventSum + (Array.isArray(event?.returnedItems) ? event.returnedItems : []).reduce((sum: number, oldItem: any) => {
                      const sameVariant =
                        Number(oldItem.productId ?? oldItem.product_id) === Number(item.productId ?? item.product_id) &&
                        String(oldItem.size || "") === String(item.size || "") &&
                        String(oldItem.color || "") === String(item.color || "");
                      return sameVariant ? sum + Math.max(0, Number(oldItem.quantity) || 0) : sum;
                    }, 0), 0);

                return (
                  <>
                    {/* Invoice meta */}
                    <div className="text-sm font-semibold text-muted-foreground border-b border-border pb-2 flex items-center justify-between">
                      <span>
                        {ar ? "فاتورة " : "Invoice "}<span className="ltr-num">#{exchangeOrder.id}</span>
                        {" · "}<span className="ltr-num">₪{parseFloat(exchangeOrder.total_amount || exchangeOrder.totalAmount || 0).toFixed(2)}</span>
                      </span>
                      <span className="text-xs font-normal">
                        {format(orderDate, "yyyy-MM-dd")}
                        {" · "}
                        <span className={expired ? "text-red-600 font-semibold" : "text-green-600"}>
                          {ar
                            ? expired
                              ? `منذ ${daysPassed} يوم — خارج مدة التبديل`
                              : `منذ ${daysPassed} يوم — ضمن المدة`
                            : expired
                              ? `${daysPassed}d ago — outside window`
                              : `${daysPassed}d ago — within window`}
                        </span>
                      </span>
                    </div>

                    {/* Exchange invoices are locked from another exchange by policy. */}
                    {exchangeInvoice && !exchangeOverride && (
                      <div className="rounded-xl border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-4 space-y-3" data-testid="exchange-invoice-locked-alert">
                        <div className="flex items-start gap-3">
                          <Ban className="w-7 h-7 text-red-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-red-700 dark:text-red-300">
                              {ar ? "هذه فاتورة تبديل — منتجاتها لا تبدل مرة أخرى" : "This is an exchange invoice — its products cannot be exchanged again"}
                            </p>
                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                              {ar ? "يمكن للمدير فقط عمل استثناء ومتابعة التبديل." : "Only an admin can make an exception and continue."}
                            </p>
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setExchangeOverride(true)}
                            className="w-full h-9 rounded-lg bg-red-600 text-white hover:bg-red-700 text-xs font-bold flex items-center justify-center gap-2"
                            data-testid="button-exchange-invoice-override"
                          >
                            <ShieldAlert className="w-4 h-4" />
                            {ar ? "استثناء إداري ومتابعة" : "Admin exception & continue"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Any previous exchange is always visible, including the exact products/quantities. */}
                    {hasPreviousExchanges && (
                      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3" data-testid="exchange-history-alert">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                              {ar ? `تنبيه: تم التبديل من هذه الفاتورة سابقاً (${exchangeHistory.length})` : `Alert: this invoice was exchanged before (${exchangeHistory.length})`}
                            </p>
                            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                              {ar ? "الكميات التي تم تبديلها سابقاً لا يمكن اختيارها مرة ثانية لأنها أُعيدت للمحل ولم تعد مع الزبون." : "Previously exchanged quantities cannot be selected again because they were returned to the store and are no longer with the customer."}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-2 max-h-44 overflow-y-auto">
                          {exchangeHistory.map((event: any, eventIndex: number) => {
                            const linkedInvoice = getLinkedExchangeInvoiceForEvent(Number(exchangeOrder.id), event);
                            return (
                              <div key={eventIndex} className="rounded-xl border border-amber-200 dark:border-amber-800 bg-background/70 p-3 space-y-2.5">
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[11px] font-bold">{ar ? `عملية تبديل ${eventIndex + 1}` : `Exchange ${eventIndex + 1}`}</span>
                                      {linkedInvoice && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300 ltr-num">
                                          {ar ? `فاتورة التبديل #${linkedInvoice.id}` : `Exchange invoice #${linkedInvoice.id}`}
                                        </span>
                                      )}
                                    </div>
                                    {event?.exchangedAt && <p className="text-[10px] text-muted-foreground ltr-num mt-1">{format(new Date(event.exchangedAt), "yyyy-MM-dd · HH:mm")}</p>}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <div>
                                    <p className="text-[10px] font-bold text-amber-800 dark:text-amber-200 mb-1">{ar ? "القطع التي تم تبديلها" : "Returned / exchanged items"}</p>
                                    <div className="space-y-1.5">
                                      {(event.returnedItems || []).map((histItem: any, histIndex: number) => (
                                        <div key={histIndex} className="rounded-lg border border-amber-100 bg-amber-50/70 px-2.5 py-2 text-[11px]">
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                              <p className="font-semibold truncate">{histItem.name || (ar ? `منتج #${histItem.productId}` : `Product #${histItem.productId}`)}</p>
                                              <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-amber-800 dark:text-amber-200">
                                                {histItem.productId ? <span className="px-1.5 py-0.5 rounded bg-background border border-amber-200 ltr-num">ID #{histItem.productId}</span> : null}
                                                {histItem.size ? <span className="px-1.5 py-0.5 rounded bg-background border border-amber-200">{histItem.size}</span> : null}
                                                {histItem.color ? <span className="px-1.5 py-0.5 rounded bg-background border border-amber-200">{histItem.color}</span> : null}
                                              </div>
                                            </div>
                                            <span className="font-bold shrink-0 ltr-num">× {histItem.quantity}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  {Array.isArray(event.replacementItems) && event.replacementItems.length > 0 && (
                                    <div className="pt-1.5 border-t border-amber-200 dark:border-amber-800">
                                      <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 mb-1">{ar ? "القطع البديلة" : "Replacement items"}</p>
                                      <div className="space-y-1.5">
                                        {event.replacementItems.map((histItem: any, histIndex: number) => (
                                          <div key={histIndex} className="rounded-lg border border-blue-100 bg-blue-50/70 px-2.5 py-2 text-[11px]">
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="min-w-0">
                                                <p className="font-semibold truncate">{histItem.name || (ar ? `منتج #${histItem.productId}` : `Product #${histItem.productId}`)}</p>
                                                <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-blue-800 dark:text-blue-200">
                                                  {histItem.productId ? <span className="px-1.5 py-0.5 rounded bg-background border border-blue-200 ltr-num">ID #{histItem.productId}</span> : null}
                                                  {histItem.size ? <span className="px-1.5 py-0.5 rounded bg-background border border-blue-200">{histItem.size}</span> : null}
                                                  {histItem.color ? <span className="px-1.5 py-0.5 rounded bg-background border border-blue-200">{histItem.color}</span> : null}
                                                </div>
                                              </div>
                                              <span className="font-bold shrink-0 ltr-num">× {histItem.quantity}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Big expired warning */}
                    {expired && !exchangeOverride && !exchangeInvoice && (
                      <div className="rounded-xl border-2 border-red-400 bg-red-50 dark:bg-red-950/30 p-5 text-center space-y-3" data-testid="exchange-expired-alert">
                        <ShieldAlert className="w-12 h-12 text-red-500 mx-auto" />
                        <p className="text-red-700 dark:text-red-300 font-bold text-base leading-snug">
                          {ar
                            ? "⚠️ تجاوزت هذه الفاتورة مدة التبديل المسموح بها (٢ يوم)"
                            : "⚠️ This invoice has passed the 2-day exchange window"}
                        </p>
                        <p className="text-red-600 dark:text-red-400 text-sm">
                          {ar
                            ? `مضى ${daysPassed} يوم على الشراء. التبديل غير مسموح به عادةً.`
                            : `${daysPassed} days have passed since purchase. Exchange is normally not permitted.`}
                        </p>
                        <div className="flex gap-2 justify-center pt-1">
                          <button
                            onClick={() => {
                              setExchangeMode(false);
                              setExchangeOrder(null);
                              setExchangeSearch("");
                            }}
                            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted font-medium"
                            data-testid="button-exchange-cancel"
                          >
                            {ar ? "إلغاء" : "Cancel"}
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => setExchangeOverride(true)}
                              className="px-5 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg font-bold flex items-center gap-2 shadow-md"
                              data-testid="button-exchange-override"
                            >
                              <ShieldAlert className="w-4 h-4" />
                              {ar ? "استثناء إداري ومتابعة" : "Admin exception & continue"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Override confirmation banner */}
                    {exchangeOverride && (
                      <div className="flex items-center gap-2 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300 font-semibold" data-testid="exchange-override-banner">
                        <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
                        {ar
                          ? "⚠️ الاستثناء الإداري فعال لهذه العملية — يمكن تجاوز قيود المدة/فاتورة التبديل/التصنيف فقط"
                          : "⚠️ Admin exception is active for this exchange"}
                      </div>
                    )}

                    {/* Items list — only show when not blocked by expired warning */}
                    {!exchangeBlocked && (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {/* Global dress-override warning banner */}
                        {dressOverrideItems.size > 0 && (
                          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border-2 border-red-400 dark:border-red-600 rounded-xl p-4" data-testid="dress-override-banner">
                            <ShieldAlert className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-bold text-red-700 dark:text-red-300">
                                {ar ? "⚠️ تنبيه: أنت تحاول تبديل فساتين!" : "⚠️ Warning: You are exchanging dresses!"}
                              </p>
                              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5 leading-relaxed">
                                {ar
                                  ? "الفساتين لا تبدل حسب سياسة المتجر. هذا التبديل استثنائي ويجب أن يتم بموافقة المدير."
                                  : "Dresses are non-exchangeable per store policy. This is an admin exception and requires manager approval."}
                              </p>
                            </div>
                          </div>
                        )}
                        {(exchangeOrder.items || []).map((item: any, i: number) => {
                          const catId = getItemCategoryId(item);
                          const isDress = catId === DRESSES_CATEGORY_ID;
                          const alreadyExchanged = exchangedQtyForItem(item);
                          // A quantity already returned in a previous exchange is physically back
                          // in the store, so it is no longer with the customer and can never be
                          // selected again. Admin exception only bypasses policy restrictions
                          // (date/category/exchange-invoice), never ownership/history quantity.
                          const maxEligibleQty = Math.max(
                            0,
                            (Number(item.quantity) || 0) - alreadyExchanged,
                          );
                          const productInfo = (products as Product[]).find(
                            (product) => product.id === Number(item.productId ?? item.product_id),
                          );
                          const dressUnlocked = exchangeOverride || (isDress && dressOverrideItems.has(i));
                          const dressBlocked = isDress && !dressUnlocked;
                          const previouslyFullyExchanged = alreadyExchanged > 0 && maxEligibleQty <= 0;
                          return (
                            <div
                              key={i}
                              className={`flex items-center gap-3 border p-3 rounded-xl ${
                                previouslyFullyExchanged
                                  ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/20"
                                  : isDress
                                    ? dressUnlocked
                                      ? "border-red-400 bg-red-50/80 dark:bg-red-950/30 ring-2 ring-red-400/40"
                                      : "border-red-200 bg-red-50 dark:bg-red-950/20"
                                    : "border-border"
                              }`}
                              data-testid={`exchange-item-${i}`}
                            >
                              <img
                                src={productInfo ? getProductImage(productInfo, item.color) : "/placeholder-product.svg"}
                                alt={item.name || productInfo?.name || ""}
                                className="w-14 h-14 rounded-lg object-cover border border-border bg-muted shrink-0"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).src = "/placeholder-product.svg";
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate flex items-center gap-1.5 flex-wrap">
                                  {item.name}
                                  {isDress && (
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-semibold border border-red-200 dark:border-red-700">
                                      <Ban className="w-2.5 h-2.5" />
                                      {ar ? "لا يبدل" : "No Exchange"}
                                    </span>
                                  )}
                                  {alreadyExchanged > 0 && (
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-semibold border border-amber-200 dark:border-amber-700">
                                      <ArrowLeftRight className="w-2.5 h-2.5" />
                                      {ar ? `تم تبديل ${alreadyExchanged}` : `${alreadyExchanged} already exchanged`}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {[item.size, item.color].filter(Boolean).join(" · ")}
                                  {[item.size, item.color].filter(Boolean).length > 0 ? " · " : ""}
                                  {ar ? `في الفاتورة ${item.quantity} قطعة` : `${item.quantity} pcs on invoice`}
                                </p>
                                {alreadyExchanged > 0 && !exchangeOverride && (
                                  <p className={`text-[11px] font-semibold mt-1 ${maxEligibleQty > 0 ? "text-amber-700 dark:text-amber-300" : "text-red-600 dark:text-red-400"}`}>
                                    {ar
                                      ? maxEligibleQty > 0
                                        ? `المتبقي المسموح للتبديل: ${maxEligibleQty}`
                                        : "لا توجد كمية متبقية للتبديل"
                                      : maxEligibleQty > 0
                                        ? `Remaining eligible quantity: ${maxEligibleQty}`
                                        : "No eligible quantity remains"}
                                  </p>
                                )}
                              </div>

                              {previouslyFullyExchanged ? (
                                <span
                                  className="text-[10px] font-bold text-red-600 dark:text-red-400 shrink-0 text-center leading-tight"
                                  title={ar ? "هذه القطعة أُعيدت للمحل ولم تعد مع الزبون" : "This item was returned to the store and is no longer with the customer"}
                                  data-testid={`label-already-exchanged-${i}`}
                                >
                                  {ar ? "تم تبديله\nغير متاح" : "Already exchanged\nUnavailable"}
                                </span>
                              ) : dressBlocked ? (
                                isAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDressOverrideItems((prev) => new Set(prev).add(i));
                                      setExchangeOverride(true);
                                    }}
                                    className="text-xs px-2.5 py-1.5 border-2 border-red-400 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white dark:hover:bg-red-700 rounded-lg font-bold flex items-center gap-1.5 shrink-0 transition-colors"
                                    data-testid={`button-dress-override-${i}`}
                                  >
                                    <ShieldAlert className="w-3.5 h-3.5" />
                                    {ar ? "استثناء" : "Exception"}
                                  </button>
                                ) : (
                                  <span className="text-[10px] font-bold text-red-600 dark:text-red-400 shrink-0">
                                    {ar ? "غير قابل للتبديل" : "Not exchangeable"}
                                  </span>
                                )
                              ) : (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => setExchangeQtys((prev) => ({ ...prev, [i]: Math.max(0, (prev[i] || 0) - 1) }))}
                                    disabled={(exchangeQtys[i] || 0) <= 0}
                                    className="w-7 h-7 border border-border rounded flex items-center justify-center hover:bg-muted disabled:opacity-35"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-8 text-center text-sm font-semibold">
                                    {exchangeQtys[i] || 0}
                                  </span>
                                  <button
                                    onClick={() => setExchangeQtys((prev) => ({ ...prev, [i]: Math.min(maxEligibleQty, (prev[i] || 0) + 1) }))}
                                    disabled={(exchangeQtys[i] || 0) >= maxEligibleQty}
                                    className="w-7 h-7 border border-border rounded flex items-center justify-center hover:bg-muted disabled:opacity-35"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ── Replacement products picker ── */}
                    {!exchangeBlocked && (() => {
                      const returnCredit = (exchangeOrder.items || []).reduce(
                        (sum: number, item: any, idx: number) =>
                          sum + parseFloat(item.price || 0) * (exchangeQtys[idx] || 0),
                        0,
                      );
                      const replacementTotal = exchangeReplacementItems.reduce(
                        (sum, item) => sum + item.unitPrice * item.quantity,
                        0,
                      );
                      const diff = replacementTotal - returnCredit;
                      const query = exchangeNewSearch.trim().toLowerCase();
                      const hasReplacementFilter =
                        query.length > 0 || exchangeCategoryFilter !== "all" || exchangeSubcategoryFilter !== "all";
                      const hasProjectedExchangeStock = (product: Product) => {
                        const variants = (product.colorVariants as ColorVariant[] | undefined) || [];
                        if (variants.length > 0) {
                          return variants.some((cv) => {
                            const sizes = sortSizes((cv.sizes as string[] | undefined) || []);
                            if (sizes.length === 0) {
                              return getExchangeProjectedAvailableStock(product, undefined, cv.name) > 0;
                            }
                            return sizes.some((size) =>
                              getExchangeProjectedAvailableStock(product, size, cv.name) > 0,
                            );
                          });
                        }
                        const sizes = sortSizes((product.sizes as string[] | undefined) || []);
                        if (sizes.length === 0) {
                          return getExchangeProjectedAvailableStock(product) > 0;
                        }
                        return sizes.some((size) =>
                          getExchangeProjectedAvailableStock(product, size, undefined) > 0,
                        );
                      };
                      const newResults = hasReplacementFilter || exchangeReplacementResultsOpen
                        ? (products as Product[])
                            .filter(hasProjectedExchangeStock)
                            .filter((p) =>
                              exchangeCategoryFilter === "all"
                                ? true
                                : p.categoryId === exchangeCategoryFilter,
                            )
                            .filter((p) => {
                              if (exchangeSubcategoryFilter === "all") return true;
                              const ids = (p as any).subcategoryIds as number[] | undefined;
                              if (Array.isArray(ids) && ids.length > 0) {
                                return ids.includes(exchangeSubcategoryFilter);
                              }
                              return (p as any).subcategoryId === exchangeSubcategoryFilter;
                            })
                            .filter((p) => {
                              if (!query) return true;
                              if (p.name.toLowerCase().includes(query)) return true;
                              if (((p as any).nameAr || "").toLowerCase().includes(query)) return true;
                              if (((p as any).barcode || "").toLowerCase().includes(query)) return true;
                              const variants = (p.colorVariants as ColorVariant[] | undefined) || [];
                              return variants.some((cv) =>
                                (cv.barcode || "").toLowerCase().includes(query),
                              );
                            })
                        : [];
                      const newUnitPrice = exchangeNewProduct
                        ? parseFloat(
                            (exchangeNewProduct.discountPrice as string | null) ||
                              exchangeNewProduct.price,
                          )
                        : 0;
                      const newVariants =
                        (exchangeNewProduct?.colorVariants as ColorVariant[] | undefined) || [];
                      const selectedVariant = newVariants.find(
                        (cv) => cv.name === exchangeNewColor,
                      );
                      const availableSizes = sortSizes(
                        newVariants.length > 0
                          ? selectedVariant
                            ? (selectedVariant.sizes as string[]) || []
                            : []
                          : ((exchangeNewProduct?.sizes as string[] | undefined) || []),
                      );
                      const alreadySelectedSameVariant = exchangeNewProduct
                        ? exchangeReplacementItems
                            .filter(
                              (item) =>
                                item.product.id === exchangeNewProduct.id &&
                                item.size === (exchangeNewSize || undefined) &&
                                item.color === (exchangeNewColor || undefined),
                            )
                            .reduce((sum, item) => sum + item.quantity, 0)
                        : 0;
                      const replacementOptionsReady =
                        !!exchangeNewProduct &&
                        (newVariants.length === 0 || !!exchangeNewColor) &&
                        (availableSizes.length === 0 || !!exchangeNewSize);
                      const draftAvailable = exchangeNewProduct && replacementOptionsReady
                        ? Math.max(
                            0,
                            getExchangeProjectedAvailableStock(
                              exchangeNewProduct,
                              exchangeNewSize || undefined,
                              exchangeNewColor || undefined,
                            ) - alreadySelectedSameVariant,
                          )
                        : 0;

                      return (
                        <div className="border-t border-border pt-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide">
                                {ar ? "المنتجات البديلة" : "Replacement products"}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {ar
                                  ? "يمكن تبديل قطعة واحدة أو عدة قطع مقابل منتج واحد أو عدة منتجات"
                                  : "Exchange one or many returned items for one or many replacement products."}
                              </p>
                            </div>
                            {exchangeReplacementItems.length > 0 && (
                              <span className="shrink-0 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 px-2.5 py-1 text-xs font-bold">
                                {exchangeReplacementItems.reduce((sum, item) => sum + item.quantity, 0)} {ar ? "قطعة" : "items"}
                              </span>
                            )}
                          </div>

                          {/* Running exchange totals */}
                          <div className="grid grid-cols-3 gap-2" data-testid="exchange-multi-summary">
                            <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20 px-2.5 py-2">
                              <p className="text-[10px] text-green-700 dark:text-green-300">{ar ? "رصيد المرتجع" : "Return credit"}</p>
                              <p className="text-sm font-bold text-green-700 dark:text-green-300 ltr-num">₪{returnCredit.toFixed(2)}</p>
                            </div>
                            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20 px-2.5 py-2">
                              <p className="text-[10px] text-blue-700 dark:text-blue-300">{ar ? "إجمالي البدائل" : "Replacements"}</p>
                              <p className="text-sm font-bold text-blue-700 dark:text-blue-300 ltr-num">₪{replacementTotal.toFixed(2)}</p>
                            </div>
                            <div className={`rounded-lg border px-2.5 py-2 ${
                              exchangeReplacementItems.length === 0
                                ? "border-border bg-muted/30"
                                : diff > 0
                                  ? "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20"
                                  : diff < 0
                                    ? "border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-950/20"
                                    : "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20"
                            }`}>
                              <p className="text-[10px] text-muted-foreground">{ar ? "فرق السعر" : "Difference"}</p>
                              <p className="text-sm font-bold ltr-num">
                                {exchangeReplacementItems.length === 0
                                  ? "—"
                                  : diff === 0
                                    ? "₪0.00"
                                    : `${diff > 0 ? "+" : "-"}₪${Math.abs(diff).toFixed(2)}`}
                              </p>
                            </div>
                          </div>
                          {exchangeReplacementItems.length > 0 && (
                            <p className={`text-[11px] font-semibold ${diff > 0 ? "text-orange-600" : diff < 0 ? "text-violet-600" : "text-emerald-600"}`}>
                              {ar
                                ? diff > 0
                                  ? `الزبون يدفع ₪${diff.toFixed(2)}`
                                  : diff < 0
                                    ? `يُرد للزبون ₪${Math.abs(diff).toFixed(2)}`
                                    : "لا يوجد فرق سعر"
                                : diff > 0
                                  ? `Customer pays ₪${diff.toFixed(2)}`
                                  : diff < 0
                                    ? `Refund customer ₪${Math.abs(diff).toFixed(2)}`
                                    : "No price difference"}
                            </p>
                          )}

                          {/* Added replacement lines */}
                          {exchangeReplacementItems.length > 0 && (
                            <div className="space-y-2" data-testid="exchange-replacement-list">
                              {exchangeReplacementItems.map((item, idx) => {
                                const maxQty = getExchangeProjectedAvailableStock(item.product, item.size, item.color);
                                return (
                                  <div key={`${item.product.id}-${item.color || ""}-${item.size || ""}`} className="flex items-center gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10 p-2.5">
                                    {item.product.mainImage && (
                                      <img src={item.product.mainImage} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold truncate">{item.product.name}</p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {[item.size, item.color].filter(Boolean).join(" · ") || (ar ? "بدون خيارات" : "No options")}
                                        {" · "}
                                        <span className="ltr-num">₪{(item.unitPrice * item.quantity).toFixed(2)}</span>
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExchangeReplacementItems((prev) =>
                                            prev
                                              .map((line, i) =>
                                                i === idx
                                                  ? { ...line, quantity: Math.max(0, line.quantity - 1) }
                                                  : line,
                                              )
                                              .filter((line) => line.quantity > 0),
                                          )
                                        }
                                        className="w-7 h-7 rounded border border-border bg-background hover:bg-muted flex items-center justify-center"
                                      >
                                        <Minus className="w-3 h-3" />
                                      </button>
                                      <span className="w-7 text-center text-xs font-bold">{item.quantity}</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExchangeReplacementItems((prev) =>
                                            prev.map((line, i) =>
                                              i === idx
                                                ? { ...line, quantity: Math.min(maxQty, line.quantity + 1) }
                                                : line,
                                            ),
                                          )
                                        }
                                        disabled={item.quantity >= maxQty}
                                        className="w-7 h-7 rounded border border-border bg-background hover:bg-muted disabled:opacity-40 flex items-center justify-center"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setExchangeReplacementItems((prev) => prev.filter((_, i) => i !== idx))}
                                        className="w-7 h-7 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 flex items-center justify-center"
                                        title={ar ? "حذف" : "Remove"}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Compact category filters. Double-tap / double-click opens subcategories. */}
                          <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                            <button
                              type="button"
                              onClick={() => {
                                setExchangeCategoryFilter("all");
                                setExchangeSubcategoryFilter("all");
                                setExchangeOpenSubcategoryFor(null);
                                setExchangeReplacementResultsOpen(true);
                              }}
                              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${exchangeCategoryFilter === "all" ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}
                              data-testid="button-exchange-cat-all"
                            >
                              {ar ? "الكل" : "All"}
                            </button>
                            {categories.map((cat) => {
                              const catSubs = subcategories.filter(
                                (sub) => sub.categoryId === cat.id && sub.isActive !== false,
                              );
                              const active = exchangeCategoryFilter === cat.id;
                              const activeSub = active && exchangeSubcategoryFilter !== "all";
                              return (
                                <button
                                  key={cat.id}
                                  type="button"
                                  onClick={() => {
                                    const now = Date.now();
                                    const isDoubleTap =
                                      exchangeLastCatTapRef.current.id === cat.id &&
                                      now - exchangeLastCatTapRef.current.time < 380;
                                    exchangeLastCatTapRef.current = { id: cat.id, time: now };
                                    if (isDoubleTap && catSubs.length > 0) {
                                      setExchangeCategoryFilter(cat.id);
                                      setExchangeOpenSubcategoryFor(cat.id);
                                      return;
                                    }
                                    setExchangeCategoryFilter(cat.id);
                                    setExchangeSubcategoryFilter("all");
                                    setExchangeOpenSubcategoryFor(null);
                                    setExchangeReplacementResultsOpen(true);
                                  }}
                                  onDoubleClick={(event) => {
                                    event.preventDefault();
                                    if (catSubs.length > 0) {
                                      setExchangeCategoryFilter(cat.id);
                                      setExchangeOpenSubcategoryFor(cat.id);
                                    }
                                  }}
                                  className={`relative shrink-0 flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${active ? "bg-foreground text-background border-foreground" : "bg-background border-border text-muted-foreground hover:text-foreground"}`}
                                  data-testid={`button-exchange-cat-${cat.id}`}
                                  title={catSubs.length > 0 ? (ar ? "اضغط مرتين للتصنيفات الفرعية" : "Double-tap for subcategories") : undefined}
                                >
                                  {ar ? cat.nameAr || cat.name : cat.name}
                                  {catSubs.length > 0 && <Layers className="w-3 h-3 opacity-60" />}
                                  {activeSub && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
                                </button>
                              );
                            })}
                          </div>

                          {/* Search / select the next replacement item */}
                          {!exchangeNewProduct && (
                            <div className="relative" ref={exchangeReplacementSearchRef}>
                              <div className="relative">
                                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                  value={exchangeNewSearch}
                                  onFocus={() => setExchangeReplacementResultsOpen(true)}
                                  onChange={(e) => {
                                    setExchangeNewSearch(e.target.value);
                                    setExchangeReplacementResultsOpen(true);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && exchangeNewSearch.trim()) {
                                      e.preventDefault();
                                      processExchangeNewBarcode(exchangeNewSearch);
                                    }
                                  }}
                                  placeholder={ar ? "ابحث بالاسم أو الباركود..." : "Search by name or barcode..."}
                                  className="text-sm ps-9 h-10"
                                  data-testid="input-exchange-new-search"
                                />
                              </div>
                              {exchangeReplacementResultsOpen && newResults.length > 0 && (
                                <div className="absolute z-20 top-full left-0 right-0 bg-background border border-border shadow-xl rounded-lg mt-1 overflow-hidden max-h-60 overflow-y-auto">
                                  {newResults.map((product) => (
                                    <button
                                      key={product.id}
                                      type="button"
                                      onClick={() => {
                                        const variants = (product.colorVariants as ColorVariant[] | undefined) || [];
                                        const selectedColor = variants.length > 0 ? variants[0].name : "";
                                        const selectedVariant = variants.find((cv) => cv.name === selectedColor);
                                        const sizes = sortSizes(
                                          variants.length > 0
                                            ? ((selectedVariant?.sizes as string[] | undefined) || [])
                                            : ((product.sizes as string[]) || []),
                                        );
                                        const firstAvailableSize = sizes.find((size) => {
                                          const alreadySelected = exchangeReplacementItems
                                            .filter((item) =>
                                              item.product.id === product.id &&
                                              item.size === size &&
                                              item.color === (selectedColor || undefined),
                                            )
                                            .reduce((sum, item) => sum + item.quantity, 0);
                                          return getExchangeProjectedAvailableStock(product, size, selectedColor || undefined) - alreadySelected > 0;
                                        }) || "";
                                        setExchangeNewProduct(product);
                                        setExchangeNewSearch("");
                                        setExchangeReplacementResultsOpen(false);
                                        setExchangeNewSize(firstAvailableSize);
                                        setExchangeNewColor(selectedColor);
                                        setExchangeNewQty(1);
                                      }}
                                      className="flex items-center gap-2 w-full px-3 py-2.5 hover:bg-muted text-start border-b border-border/40 last:border-0"
                                      data-testid={`exchange-new-product-${product.id}`}
                                    >
                                      {product.mainImage && (
                                        <img src={product.mainImage} alt="" className="w-9 h-9 object-cover rounded shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold truncate">{product.name}</p>
                                        <p className="text-[11px] text-muted-foreground ltr-num">
                                          ₪{parseFloat((product.discountPrice as string | null) || product.price).toFixed(2)}
                                        </p>
                                      </div>
                                      <Plus className="w-4 h-4 text-blue-600 shrink-0" />
                                    </button>
                                  ))}
                                </div>
                              )}
                              {exchangeReplacementResultsOpen && newResults.length === 0 && (
                                <div className="mt-1 rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground text-center">
                                  {ar ? "لا توجد منتجات مطابقة ومتوفرة" : "No matching in-stock products"}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Draft replacement options before adding it to the exchange list */}
                          {exchangeNewProduct && (
                            <div className="space-y-3 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-3 bg-blue-50/30 dark:bg-blue-950/10">
                              <div className="flex items-center gap-2">
                                {exchangeNewProduct.mainImage && (
                                  <img src={exchangeNewProduct.mainImage} alt="" className="w-11 h-11 object-cover rounded shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold truncate">{exchangeNewProduct.name}</p>
                                  <p className="text-xs text-muted-foreground ltr-num">₪{newUnitPrice.toFixed(2)}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExchangeNewProduct(null);
                                    setExchangeNewSize("");
                                    setExchangeNewColor("");
                                    setExchangeNewQty(1);
                                  }}
                                  className="text-muted-foreground hover:text-red-500 p-1"
                                  data-testid="button-clear-new-product"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>

                              {newVariants.length > 0 && (
                                <div>
                                  <p className="text-[10px] text-muted-foreground mb-1.5">{ar ? "اللون" : "Color"}</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {newVariants.map((cv) => (
                                      <button
                                        key={cv.name}
                                        type="button"
                                        onClick={() => {
                                          const colorSizes = sortSizes((cv.sizes as string[]) || []);
                                          const firstAvailableSize = colorSizes.find((size) => {
                                            const alreadySelected = exchangeReplacementItems
                                              .filter((item) =>
                                                item.product.id === exchangeNewProduct.id &&
                                                item.size === size &&
                                                item.color === cv.name,
                                              )
                                              .reduce((sum, item) => sum + item.quantity, 0);
                                            return getExchangeProjectedAvailableStock(exchangeNewProduct, size, cv.name) - alreadySelected > 0;
                                          }) || "";
                                          setExchangeNewColor(cv.name);
                                          setExchangeNewSize(firstAvailableSize);
                                          setExchangeNewQty(1);
                                        }}
                                        className={`text-xs px-2 py-1 rounded border transition-all ${exchangeNewColor === cv.name ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted"}`}
                                        data-testid={`exchange-new-color-${cv.name}`}
                                      >
                                        <span className="inline-block w-3 h-3 rounded-full me-1 border border-white/30" style={{ backgroundColor: cv.colorCode || "#ccc" }} />
                                        {cv.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {availableSizes.length > 0 && (
                                <div>
                                  <p className="text-[10px] text-muted-foreground mb-1.5">{ar ? "المقاس" : "Size"}</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {availableSizes.map((size) => {
                                      const alreadySelectedForSize = exchangeNewProduct
                                        ? exchangeReplacementItems
                                            .filter((item) =>
                                              item.product.id === exchangeNewProduct.id &&
                                              item.size === size &&
                                              item.color === (exchangeNewColor || undefined),
                                            )
                                            .reduce((sum, item) => sum + item.quantity, 0)
                                        : 0;
                                      const sizeAvailable = exchangeNewProduct
                                        ? Math.max(0, getExchangeProjectedAvailableStock(
                                            exchangeNewProduct,
                                            size,
                                            exchangeNewColor || undefined,
                                          ) - alreadySelectedForSize)
                                        : 0;
                                      const selected = exchangeNewSize === size;
                                      return (
                                        <button
                                          key={size}
                                          type="button"
                                          onClick={() => {
                                            if (sizeAvailable <= 0) return;
                                            setExchangeNewSize(size);
                                            setExchangeNewQty((qty) => Math.max(1, Math.min(qty, sizeAvailable)));
                                          }}
                                          disabled={sizeAvailable <= 0}
                                          className={`min-w-[58px] px-2.5 py-1.5 rounded border text-xs font-semibold transition-all ${
                                            selected
                                              ? "border-foreground bg-foreground text-background"
                                              : sizeAvailable <= 0
                                                ? "border-border bg-muted/30 text-muted-foreground opacity-45 cursor-not-allowed line-through"
                                                : "border-border bg-background hover:bg-muted"
                                          }`}
                                          data-testid={`exchange-new-size-${size}`}
                                        >
                                          <span className="block">{size}</span>
                                          {sizeAvailable > 0 && (
                                            <span className={`block text-[9px] mt-0.5 ${selected ? "text-background/70" : "text-muted-foreground"}`}>
                                              ({sizeAvailable})
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{ar ? "الكمية" : "Qty"}</span>
                                  <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => setExchangeNewQty((q) => Math.max(1, q - 1))} className="w-7 h-7 border border-border bg-background rounded flex items-center justify-center hover:bg-muted">
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <span className="w-8 text-center text-sm font-semibold">{exchangeNewQty}</span>
                                    <button type="button" onClick={() => setExchangeNewQty((q) => Math.min(Math.max(1, draftAvailable), q + 1))} disabled={draftAvailable <= exchangeNewQty} className="w-7 h-7 border border-border bg-background rounded flex items-center justify-center hover:bg-muted disabled:opacity-40">
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">
                                    {ar ? `متوفر ${draftAvailable}` : `${draftAvailable} available`}
                                  </span>
                                </div>
                                <span className="text-sm font-bold ltr-num">₪{(newUnitPrice * exchangeNewQty).toFixed(2)}</span>
                              </div>

                              <button
                                type="button"
                                onClick={addExchangeReplacementDraft}
                                disabled={
                                  draftAvailable < exchangeNewQty ||
                                  (newVariants.length > 0 && !exchangeNewColor) ||
                                  (availableSizes.length > 0 && !exchangeNewSize)
                                }
                                className="w-full h-9 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-45 font-semibold text-xs flex items-center justify-center gap-1.5"
                                data-testid="button-add-exchange-replacement"
                              >
                                <Plus className="w-4 h-4" />
                                {ar ? "إضافة للمنتجات البديلة" : "Add to replacement items"}
                              </button>
                            </div>
                          )}

                          {/* Exchange subcategory sheet */}
                          {(() => {
                            const openCat = categories.find((cat) => cat.id === exchangeOpenSubcategoryFor);
                            const openSubs = openCat
                              ? subcategories.filter((sub) => sub.categoryId === openCat.id && sub.isActive !== false)
                              : [];
                            if (!openCat || openSubs.length === 0) return null;
                            return (
                              <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center" onClick={() => setExchangeOpenSubcategoryFor(null)} data-testid="exchange-subcategory-sheet-backdrop">
                                <div className="absolute inset-0 bg-black/45 backdrop-blur-[1px]" />
                                <div onClick={(e) => e.stopPropagation()} className="relative w-full sm:w-[380px] sm:max-w-[92vw] max-h-[65vh] bg-background rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
                                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                                    <p className="text-sm font-bold truncate">
                                      {ar ? `${openCat.nameAr || openCat.name} — التصنيفات الفرعية` : `${openCat.name} — subcategories`}
                                    </p>
                                    <button type="button" onClick={() => setExchangeOpenSubcategoryFor(null)} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center">
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                  <div className="flex flex-wrap gap-2 p-4 overflow-y-auto">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setExchangeSubcategoryFilter("all");
                                        setExchangeOpenSubcategoryFor(null);
                                        setExchangeReplacementResultsOpen(true);
                                      }}
                                      className={`px-3 py-2 rounded-full text-xs font-semibold border ${exchangeSubcategoryFilter === "all" ? "bg-foreground text-background border-foreground" : "border-border bg-muted/40"}`}
                                    >
                                      {ar ? "الكل" : "All"}
                                    </button>
                                    {openSubs.map((sub) => (
                                      <button
                                        key={sub.id}
                                        type="button"
                                        onClick={() => {
                                          setExchangeSubcategoryFilter(sub.id);
                                          setExchangeOpenSubcategoryFor(null);
                                          setExchangeReplacementResultsOpen(true);
                                        }}
                                        className={`px-3 py-2 rounded-full text-xs font-semibold border ${exchangeSubcategoryFilter === sub.id ? "bg-foreground text-background border-foreground" : "border-border bg-muted/40"}`}
                                        data-testid={`button-exchange-subcat-${sub.id}`}
                                      >
                                        {ar ? sub.nameAr || sub.name : sub.name}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}

                  </>
                );
              })()}
            </div>

            {/* Always-visible exchange action footer. Search/filter results scroll above it. */}
            {exchangeOrder && !((isExchangeExpired(exchangeOrder) || isExchangeOrder(exchangeOrder.note)) && !exchangeOverride) && (
              <div className="shrink-0 border-t border-border bg-background/95 backdrop-blur px-5 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.06)] z-30" data-testid="exchange-sticky-footer">
                <button
                  onClick={processExchange}
                  disabled={
                    processingExchange ||
                    exchangeReplacementItems.length === 0 ||
                    Object.values(exchangeQtys).every((qty) => qty <= 0)
                  }
                  className="w-full h-12 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2 transition-colors rounded-lg"
                  data-testid="button-process-exchange"
                >
                  {processingExchange ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowLeftRight className="w-4 h-4" />
                  )}
                  {exchangeReplacementItems.length > 0
                    ? ar
                      ? `تأكيد التبديل (${exchangeReplacementItems.reduce((sum, item) => sum + item.quantity, 0)} قطعة بديلة)`
                      : `Confirm exchange (${exchangeReplacementItems.reduce((sum, item) => sum + item.quantity, 0)} replacement item(s))`
                    : ar
                      ? "أضف المنتجات البديلة أولاً"
                      : "Add replacement items first"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {returnMode && (
        <div
          className={`fixed inset-0 z-50 flex ${oskTarget ? "items-start pt-4" : "items-center"} justify-center bg-black/50 p-4 transition-[padding-top] duration-200`}
          onClick={() => {
            setReturnMode(false);
            setReturnOrder(null);
            setReturnSearch("");
          }}
        >
          <div
            className={`bg-background border border-border w-full max-w-md shadow-2xl rounded-xl overflow-hidden ${oskTarget ? "max-h-[52vh] overflow-y-auto" : ""} transition-[max-height] duration-200`}
            onClick={(e) => e.stopPropagation()}
            data-testid="pos-return-modal"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-orange-50 dark:bg-orange-950/20">
              <h3 className="font-bold flex items-center gap-2 text-orange-700 dark:text-orange-300">
                <Undo2 className="w-5 h-5" />
                {ar ? "معالجة المرتجع" : "Process Return"}
              </h3>
              <button
                onClick={() => {
                  setReturnMode(false);
                  setReturnOrder(null);
                  setReturnSearch("");
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <Input
                  ref={returnSearchRef}
                  value={returnSearch}
                  onChange={(e) => {
                    const value = e.target.value;
                    setReturnSearch(value);
                    const now = Date.now();
                    const gap = now - returnLastChangeTime.current;
                    returnLastChangeTime.current = now;
                    if (returnScanTimer.current) clearTimeout(returnScanTimer.current);
                    if (value.trim()) {
                      const isLikelyScan = gap > 0 && gap <= 60;
                      returnScanTimer.current = setTimeout(
                        () => searchReturn(value),
                        isLikelyScan ? 60 : 260,
                      );
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    if (returnScanTimer.current) {
                      clearTimeout(returnScanTimer.current);
                      returnScanTimer.current = null;
                    }
                    searchReturn();
                  }}
                  placeholder={ar ? "رقم الفاتورة..." : "Invoice number..."}
                  className="flex-1"
                  type="number"
                  min="1"
                  data-testid="input-return-search"
                />
                <button
                  onClick={searchReturn}
                  className="px-4 py-2 bg-foreground text-background hover:bg-foreground/90 font-medium text-sm transition-colors rounded"
                >
                  {ar ? "بحث" : "Search"}
                </button>
              </div>
              {returnOrder && (
                <>
                  <div className="text-sm font-semibold text-muted-foreground border-b border-border pb-2">
                    {ar
                      ? `فاتورة #${returnOrder.id}`
                      : `Invoice #${returnOrder.id}`}{" "}
                    · ₪
                    {parseFloat(
                      returnOrder.total_amount || returnOrder.totalAmount || 0,
                    ).toFixed(2)}
                  </div>
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {(returnOrder.items || []).map((item: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 border border-border p-3 rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {[item.size, item.color]
                              .filter(Boolean)
                              .join(" · ")}{" "}
                            ·{" "}
                            {ar
                              ? `${item.quantity} قطعة`
                              : `${item.quantity} pcs`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() =>
                              setReturnQtys((prev) => ({
                                ...prev,
                                [i]: Math.max(0, (prev[i] || 0) - 1),
                              }))
                            }
                            className="w-7 h-7 border border-border rounded flex items-center justify-center hover:bg-muted"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-8 text-center text-sm font-semibold">
                            {returnQtys[i] || 0}
                          </span>
                          <button
                            onClick={() =>
                              setReturnQtys((prev) => ({
                                ...prev,
                                [i]: Math.min(
                                  item.quantity,
                                  (prev[i] || 0) + 1,
                                ),
                              }))
                            }
                            className="w-7 h-7 border border-border rounded flex items-center justify-center hover:bg-muted"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={processReturn}
                    disabled={processingReturn}
                    className="w-full h-11 bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 font-semibold flex items-center justify-center gap-2 transition-colors rounded"
                    data-testid="button-process-return"
                  >
                    {processingReturn ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Undo2 className="w-4 h-4" />
                    )}
                    {ar
                      ? "تأكيد المرتجع وإرجاع المخزون"
                      : "Confirm Return & Restore Stock"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={deleteAllOrdersConfirmOpen} onOpenChange={setDeleteAllOrdersConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ar ? "حذف جميع الفواتير والمعاملات نهائياً؟" : "Permanently delete all invoices & transactions?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ar
                ? `سيتم حذف ${posOrders.length} فاتورة/معاملة نهائياً من نقطة البيع ولا يمكن التراجع عن هذا الإجراء.`
                : `${posOrders.length} POS invoice(s)/transaction(s) will be permanently deleted. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-all-pos-orders">
              {ar ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllOrdersMutation.mutate()}
              disabled={deleteAllOrdersMutation.isPending}
              className="bg-red-600 text-white hover:bg-red-700"
              data-testid="button-confirm-delete-all-pos-orders"
            >
              {deleteAllOrdersMutation.isPending
                ? ar ? "جاري الحذف..." : "Deleting…"
                : ar ? "حذف نهائي" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteSelectedConfirmOpen} onOpenChange={setDeleteSelectedConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ar ? "حذف الفواتير المحددة نهائياً؟" : "Permanently delete selected invoices?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ar
                ? `سيتم حذف ${selectedOrderIds.size} فاتورة/معاملة نهائياً من نقطة البيع ولا يمكن التراجع عن هذا الإجراء.`
                : `${selectedOrderIds.size} POS invoice(s)/transaction(s) will be permanently deleted. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-selected-pos-orders">
              {ar ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSelectedOrdersMutation.mutate(Array.from(selectedOrderIds))}
              disabled={deleteSelectedOrdersMutation.isPending || selectedOrderIds.size === 0}
              className="bg-red-600 text-white hover:bg-red-700"
              data-testid="button-confirm-delete-selected-pos-orders"
            >
              {deleteSelectedOrdersMutation.isPending
                ? ar ? "جاري الحذف..." : "Deleting…"
                : ar ? "حذف نهائي" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteOrderConfirm} onOpenChange={(open) => !open && setDeleteOrderConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ar
                ? `حذف الفاتورة #${deleteOrderConfirm?.id} نهائياً؟`
                : `Permanently delete invoice #${deleteOrderConfirm?.id}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ar
                ? "لا يمكن التراجع عن هذا الإجراء."
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-order">
              {ar ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteOrderConfirm && deleteSingleOrderMutation.mutate(deleteOrderConfirm.id)
              }
              disabled={deleteSingleOrderMutation.isPending}
              className="bg-red-600 text-white hover:bg-red-700"
              data-testid="button-confirm-delete-order"
            >
              {deleteSingleOrderMutation.isPending
                ? ar ? "جاري الحذف..." : "Deleting…"
                : ar ? "حذف نهائي" : "Delete permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden, persistent iframe used to print invoices instantly on sale —
          keeping it always mounted (instead of window.open) avoids popup
          blockers so the receipt prints the moment the sale completes. */}
      <iframe
        ref={printFrameRef}
        title="pos-print-frame"
        style={{
          position: "fixed",
          top: "-10000px",
          left: "-10000px",
          width: "380px",
          height: "600px",
          border: "0",
        }}
      />

      {oskEnabled && oskTarget && (
        <OnScreenKeyboard
          targetEl={oskTarget}
          ar={ar}
          containerRef={oskContainerRef}
          onClose={() => {
            oskTarget.blur();
            setOskTarget(null);
          }}
        />
      )}
    </AdminLayout>
  );
}
