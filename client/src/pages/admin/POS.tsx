import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Flame,
  Eye,
  Clock,
  CalendarDays,
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
import type { Product, Category, ColorVariant } from "@shared/schema";

/* ── Interfaces ────────────────────────────────────────────────────────── */
interface PosCartItem {
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
function escHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

let heldIdCounter = 1;

/* ═══════════════════════════════════════════════════════════════════════ */
export default function POS() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const ar = language === "ar";

  /* Tab */
  const [activeTab, setActiveTab] = useState<"pos" | "dashboard">("pos");

  /* Product grid */
  const [categoryFilter, setCategoryFilter] = useState<number | "all" | "best">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [barcodeInput, setBarcodeInput] = useState("");

  /* Cart */
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [note, setNote] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">(
    "percent",
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

  /* Product picker modal */
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);
  const [pickerSize, setPickerSize] = useState("");
  const [pickerColor, setPickerColor] = useState("");
  const [pickerQty, setPickerQty] = useState(1);

  /* Dashboard */
  const [expandedOrder, setExpandedOrder] = useState<any | null>(null);
  const [dateFilter, setDateFilter] = useState<
    "today" | "week" | "month" | "all"
  >("all");
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

  /* Exchange — replacement product */
  const [exchangeNewSearch, setExchangeNewSearch] = useState("");
  const [exchangeNewProduct, setExchangeNewProduct] = useState<Product | null>(null);
  const [exchangeNewSize, setExchangeNewSize] = useState("");
  const [exchangeNewColor, setExchangeNewColor] = useState("");
  const [exchangeNewQty, setExchangeNewQty] = useState(1);

  /* Refs */
  const barcodeRef = useRef<HTMLInputElement>(null);
  const cashRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);

  /* Queries */
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const { data: posOrders = [], refetch: refetchOrders } = useQuery<any[]>({
    queryKey: ["/api/pos/orders"],
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (activeTab === "pos") barcodeRef.current?.focus();
  }, [activeTab]);

  /* ── BroadcastChannel ref ──────────────────────────────────────────── */
  const posChannel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    try { posChannel.current = new BroadcastChannel("lucerne-pos"); } catch {}
    return () => { try { posChannel.current?.close(); } catch {} };
  }, []);

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

  /* ── Check if product has any stock at all (size-inventory aware) ─── */
  const isProductInStock = useCallback((product: Product): boolean => {
    const sizes = (product.sizes as string[]) || [];
    const colorVariants =
      (product.colorVariants as ColorVariant[] | undefined) || [];
    if (colorVariants.length > 0) {
      return colorVariants.some((cv) => {
        const inv = cv.sizeInventory as Record<string, number> | undefined;
        if (inv && sizes.length > 0)
          return sizes.some((s) => (inv[s] ?? 0) > 0);
        return product.stockQuantity > 0;
      });
    }
    const sizeInv = product.sizeInventory as Record<string, number> | undefined;
    if (sizeInv && sizes.length > 0)
      return sizes.some((s) => (sizeInv[s] ?? 0) > 0);
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

  /* ── Broadcast cart to customer screen ─────────────────────────────── */
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
    try {
      posChannel.current?.postMessage({ type: "CART_UPDATE", payload });
      localStorage.setItem("lucerne_pos_cart", JSON.stringify(payload));
    } catch {}
  }, [cart, discountAmount, cartTotal, paymentMethod, cartSubtotal]);

  /* ── Product filter ────────────────────────────────────────────────── */
  const filteredProducts = useMemo(() => {
    let list = [...products].filter((p) => isProductInStock(p));
    if (categoryFilter === "best")
      list = list.filter((p) => (p as any).isBestSeller);
    else if (categoryFilter !== "all")
      list = list.filter((p) => p.categoryId === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p as any).nameAr?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, categoryFilter, search, isProductInStock]);

  /* ── addToCart with stock limit ────────────────────────────────────── */
  const addToCart = useCallback(
    (product: Product, size?: string, color?: string, qty = 1) => {
      const price = product.discountPrice
        ? parseFloat(product.discountPrice as string)
        : parseFloat(product.price as string);
      const avail = getAvailableStock(product, size, color);
      if (avail <= 0) {
        toast({
          title: ar ? "المخزون نفد لهذا المنتج" : "Out of stock",
          variant: "destructive",
        });
        return;
      }
      const actualQty = Math.min(qty, avail);
      if (actualQty < qty)
        toast({
          title: ar
            ? `تم الإضافة بالكمية المتاحة (${actualQty})`
            : `Added ${actualQty} (max available)`,
          duration: 2000,
        });
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
          },
        ]);
      }
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

  /* ── Picker ──────────────────────────────────────────────────────── */
  const openPicker = (product: Product) => {
    const colors = (product.colorVariants as ColorVariant[] | undefined) || [];
    const sizes = (product.sizes as string[]) || [];
    const firstColor = colors.length > 0 ? colors[0].name : "";
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
    );
    setPickerProduct(null);
    barcodeRef.current?.focus();
  };

  /* ── Barcode scanner ─────────────────────────────────────────────── */
  const handleBarcodeEnter = async (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || !barcodeInput.trim()) return;
    e.preventDefault();
    const code = barcodeInput.trim();
    setBarcodeInput("");
    try {
      const res = await fetch(
        `/api/pos/search-barcode/${encodeURIComponent(code)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        toast({
          title: ar ? "لم يُعثر على المنتج" : "Product not found",
          description: code,
          variant: "destructive",
        });
        return;
      }
      const product: Product = await res.json();
      openPicker(product);
    } catch {
      toast({
        title: ar ? "خطأ في البحث" : "Search error",
        variant: "destructive",
      });
    }
  };

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

  /* ── Print invoice ───────────────────────────────────────────────── */
  const triggerPrint = (order: CompletedOrder) => {
    const w = window.open("", "_blank", "width=440,height=780");
    if (!w) return;
    const dateStr = format(order.date, "yyyy-MM-dd");
    const timeStr = format(order.date, "HH:mm");
    const itemsHtml = order.items
      .map(
        (item) => `
      <tr>
        <td class="td-name">${escHtml(item.product.name)}${item.size || item.color ? `<span class="variant">${[item.size, item.color].filter(Boolean).join(" · ")}</span>` : ""}</td>
        <td class="td-qty">${item.quantity}</td>
        <td class="td-price">₪${(item.unitPrice * item.quantity).toFixed(2)}</td>
      </tr>`,
      )
      .join("");
    const noteHtml = order.note
      ? `<div class="order-note">${escHtml(order.note)}</div>`
      : "";
    const splitHtml =
      order.paymentMethod === "split"
        ? `
      <div class="cash-row"><span>نقدي</span><span>₪${order.cashReceived.toFixed(2)}</span></div>
      <div class="cash-row"><span>بطاقة</span><span>₪${order.cardReceived.toFixed(2)}</span></div>`
        : "";
    w.document
      .write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>فاتورة #${order.id}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#fff;color:#1a1a1a;max-width:360px;margin:0 auto;padding:28px 24px 24px;font-size:13px}
  .hdr{text-align:center;padding-bottom:18px}.hdr-bar{height:3px;background:linear-gradient(90deg,#e8d5b7,#1a1a1a 40%,#e8d5b7);margin-bottom:14px;border-radius:2px}
  .hdr-logo{font-size:26px;font-weight:800;letter-spacing:8px;text-transform:uppercase;color:#111;line-height:1}
  .hdr-sub{font-size:10px;letter-spacing:5px;text-transform:uppercase;color:#888;margin-top:4px}
  .hdr-city{font-size:11px;color:#aaa;margin-top:6px;letter-spacing:1px}
  .hdr-bar-bottom{height:1px;background:linear-gradient(90deg,transparent,#ccc,transparent);margin-top:14px}
  .meta{display:flex;justify-content:space-between;align-items:center;margin:14px 0;padding:10px 12px;background:#f7f5f2;border-radius:6px}
  .meta-inv{font-size:13px;font-weight:700;color:#111}.meta-date{font-size:11px;color:#666}.meta-time{font-size:10px;color:#aaa}
  .order-note{background:#fffbe6;border:1px solid #ffe58f;border-radius:5px;padding:7px 10px;margin-bottom:12px;font-size:11px;color:#7a6000}
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
  @media print{body{padding:0}@page{margin:6mm}}
</style></head><body>
<div class="hdr"><div class="hdr-bar"></div><svg style="width:58px;height:44px;margin:8px auto 2px;display:block;" version="1.0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 393 297"><g transform="translate(0,297) scale(0.1,-0.1)" fill="#111" stroke="none"><path d="M2685 2594 c-179 -27 -296 -59 -490 -136 -259 -103 -609 -284 -965 -501 -126 -77 -160 -104 -160 -124 0 -26 34 -12 158 65 434 269 823 464 1138 571 167 57 252 73 379 75 100 1 115 -1 160 -25 105 -53 147 -157 126 -310 -15 -115 -53 -252 -108 -389 -114 -287 -230 -468 -408 -638 -133 -127 -246 -199 -407 -257 -76 -27 -77 -27 -101 -9 -113 89 -164 123 -242 160 -128 61 -190 76 -342 81 -115 5 -141 3 -201 -16 -114 -34 -167 -103 -125 -159 11 -15 37 -37 59 -49 52 -30 240 -89 334 -105 102 -17 356 -17 449 1 l74 15 49 -55 c67 -75 133 -175 176 -267 33 -70 37 -85 37 -163 0 -78 -2 -89 -27 -122 -16 -20 -53 -48 -85 -64 -55 -27 -64 -28 -198 -28 -145 0 -184 8 -345 66 -194 71 -407 241 -518 414 -151 234 -171 410 -152 1340 4 223 3 256 -13 301 -37 107 -122 196 -225 235 -71 26 -176 37 -187 19 -12 -19 23 -40 64 -40 69 0 161 -41 217 -96 57 -57 104 -160 104 -227 0 -39 -17 -49 -39 -24 -6 8 -35 19 -64 26 -103 23 -199 -28 -248 -133 -59 -124 -18 -252 87 -274 60 -13 151 6 196 40 18 14 37 26 42 27 6 0 10 -131 11 -337 2 -555 40 -725 211 -949 208 -272 589 -458 899 -440 163 10 250 52 298 146 64 128 4 322 -165 534 -32 39 -58 75 -58 80 0 4 10 12 23 17 12 5 56 23 99 40 222 90 465 318 620 583 130 221 234 512 257 716 20 186 -46 322 -179 366 -48 16 -166 26 -215 19z m-1854 -495 c30 -12 55 -50 64 -99 9 -50 -36 -135 -92 -174 -34 -23 -53 -29 -102 -30 -53 -1 -64 2 -87 26 -38 37 -44 107 -14 175 45 104 128 141 231 102z m759 -1010 c92 -23 220 -84 294 -139 100 -73 76 -85 -169 -85 -189 1 -281 15 -424 66 -113 39 -145 59 -149 91 -5 38 38 61 173 92 38 9 200 -6 275 -25z"/></g></svg><div class="hdr-logo">LUCERNE</div><div class="hdr-sub">B O U T I Q U E</div><div class="hdr-city">رام الله</div><div class="hdr-bar-bottom"></div></div>
<div class="meta"><div class="meta-inv">فاتورة &nbsp;#${order.id}</div><div style="text-align:left;"><div class="meta-date">${dateStr}</div><div class="meta-time">${timeStr}</div></div></div>
${noteHtml}
<table><thead><tr><th>المنتج</th><th>الكمية</th><th>المجموع</th></tr></thead><tbody>${itemsHtml}</tbody></table>
<div class="totals">
  ${order.discountAmount > 0 ? `<div class="totals-divider"></div><div class="totals-row"><span>المجموع الفرعي</span><span>₪${order.subtotal.toFixed(2)}</span></div><div class="totals-row discount"><span>خصم</span><span>- ₪${order.discountAmount.toFixed(2)}</span></div>` : ""}
  <div class="totals-final"><span class="label">الإجمالي</span><span class="amount">₪${order.total.toFixed(2)}</span></div>
  ${splitHtml}
  ${order.paymentMethod === "cash" && order.cashReceived > 0 ? `<div class="cash-row"><span>المبلغ المدفوع</span><span>₪${order.cashReceived.toFixed(2)}</span></div><div class="change-row"><span class="label">الباقي للزبون</span><span class="amount">₪${order.change.toFixed(2)}</span></div>` : ""}
</div>
<div class="ftr"><div class="ftr-dots">· · · · · · · · · · · ·</div><div class="ftr-thanks">شكراً لتسوقكم</div><div class="ftr-brand">LUCERNE BOUTIQUE</div><div class="ftr-policy">مدة التبديل: يومان (٤٨ ساعة) من تاريخ الشراء فقط</div><div class="ftr-policy">القطع الرسمية لا تبدل &nbsp;·&nbsp; العبايات لا تبدل &nbsp;·&nbsp; لا يوجد ترجيع لجميع القطع</div></div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};}</script>
</body></html>`);
    w.document.close();
  };

  /* ── Shift summary print ─────────────────────────────────────────── */
  const printShiftSummary = () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrders = posOrders.filter(
      (o: any) => (o.created_at || o.createdAt || "").slice(0, 10) === todayStr,
    );
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
      (s: number, o: any) => s + parseFloat(o.total_amount || 0),
      0,
    );
    const cashRev = cashOrders.reduce(
      (s: number, o: any) => s + parseFloat(o.total_amount || 0),
      0,
    );
    const cardRev = cardOrders.reduce(
      (s: number, o: any) => s + parseFloat(o.total_amount || 0),
      0,
    );
    const totalItems = todayOrders
      .flatMap((o: any) => o.items || [])
      .reduce((s: number, i: any) => s + (i.quantity || 1), 0);
    const dateStr = format(new Date(), "yyyy-MM-dd");
    const w = window.open("", "_blank", "width=400,height=500");
    if (!w) return;
    w.document
      .write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>ملخص الشفت</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;padding:24px;max-width:320px;margin:0 auto}
h1{text-align:center;font-size:18px;letter-spacing:3px;margin-bottom:4px}p.sub{text-align:center;font-size:11px;color:#888;margin-bottom:16px}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #ddd;font-size:13px}
.total-row{display:flex;justify-content:space-between;padding:12px 0;font-size:16px;font-weight:bold;border-top:2px solid #333;margin-top:4px}
@media print{body{padding:0}@page{margin:6mm}}</style></head><body>
<h1>LUCERNE BOUTIQUE</h1><p class="sub">ملخص الشفت · ${dateStr}</p>
<div class="row"><span>عدد الفواتير</span><span>${todayOrders.length}</span></div>
<div class="row"><span>قطع مباعة</span><span>${totalItems}</span></div>
<div class="row"><span>مبيعات نقدية</span><span>₪${cashRev.toFixed(2)} (${cashOrders.length})</span></div>
<div class="row"><span>مبيعات بطاقة</span><span>₪${cardRev.toFixed(2)} (${cardOrders.length})</span></div>
${splitOrders.length ? `<div class="row"><span>مختلط</span><span>${splitOrders.length} فاتورة</span></div>` : ""}
<div class="total-row"><span>الإجمالي</span><span>₪${totalRev.toFixed(2)}</span></div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};}</script>
</body></html>`);
    w.document.close();
  };

  /* ── Export to Excel ─────────────────────────────────────────────── */
  const exportToExcel = async () => {
    const rows = posOrders.map((o: any) => ({
      "رقم الفاتورة": o.id,
      التاريخ: o.created_at || o.createdAt ? format(new Date(o.created_at || o.createdAt), "yyyy-MM-dd HH:mm") : "",
      "طريقة الدفع": o.payment_method || o.paymentMethod || "",
      الإجمالي: parseFloat(o.total_amount || o.totalAmount || 0).toFixed(2),
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
        if (stockError) qc.invalidateQueries({ queryKey: ["/api/products"] });
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
  const searchReturn = async () => {
    if (!returnSearch.trim()) return;
    try {
      const res = await fetch(`/api/pos/orders/${returnSearch.trim()}`, {
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
  };

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

  const searchExchange = async () => {
    if (!exchangeSearch.trim()) return;
    try {
      const res = await fetch(`/api/pos/orders/${exchangeSearch.trim()}`, {
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
    } catch {
      toast({
        title: ar ? "خطأ في البحث" : "Search error",
        variant: "destructive",
      });
    }
  };

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
    setProcessingExchange(true);
    try {
      const res = await fetch("/api/pos/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: exchangeOrder.id,
          items: itemsToExchange.map((item: any) => ({
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

      /* Add replacement product to cart automatically */
      if (exchangeNewProduct) {
        const unitPrice = parseFloat(
          (exchangeNewProduct.discountPrice as string | null) || exchangeNewProduct.price,
        );
        const newCartItem: PosCartItem = {
          product: exchangeNewProduct,
          quantity: exchangeNewQty,
          size: exchangeNewSize || undefined,
          color: exchangeNewColor || undefined,
          unitPrice,
        };
        setCart((prev) => [...prev, newCartItem]);
        const credit = (exchangeOrder?.items || []).reduce((s: number, it: any, idx: number) => {
          return s + parseFloat(it.price || 0) * (exchangeQtys[idx] || 0);
        }, 0);
        const newCost = unitPrice * exchangeNewQty;
        const diff = newCost - credit;
        toast({
          title: ar ? "✓ تم التبديل" : "✓ Exchange complete",
          description: ar
            ? diff > 0
              ? `القطعة الجديدة أغلى بـ ₪${diff.toFixed(2)} — الزبون يدفع الفرق`
              : diff < 0
              ? `القطعة الجديدة أرخص بـ ₪${Math.abs(diff).toFixed(2)} — المتجر يرجع الفرق`
              : "السعر متماثل — لا يوجد فرق"
            : diff > 0
            ? `New item is ₪${diff.toFixed(2)} more — collect from customer`
            : diff < 0
            ? `New item is ₪${Math.abs(diff).toFixed(2)} less — return to customer`
            : "Same price — no difference",
        });
      } else {
        toast({
          title: ar
            ? "✓ تم التبديل — أضف القطعة الجديدة للسلة"
            : "✓ Exchange done — add replacement to cart",
        });
      }

      setExchangeMode(false);
      setExchangeOrder(null);
      setExchangeSearch("");
      setExchangeQtys({});
      setExchangeOverride(false);
      setDressOverrideItems(new Set());
      setExchangeNewSearch("");
      setExchangeNewProduct(null);
      setExchangeNewSize("");
      setExchangeNewColor("");
      setExchangeNewQty(1);
    } catch {
      toast({
        title: ar ? "فشل في معالجة التبديل" : "Exchange failed",
        variant: "destructive",
      });
    } finally {
      setProcessingExchange(false);
    }
  };

  /* ── Dashboard computed ──────────────────────────────────────────── */
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = posOrders.filter(
    (o: any) => (o.created_at || o.createdAt || "").slice(0, 10) === todayStr,
  );
  const todayRevenue = todayOrders.reduce(
    (s: number, o: any) => s + parseFloat(o.total_amount || 0),
    0,
  );
  const totalRevenue = posOrders.reduce(
    (s: number, o: any) => s + parseFloat(o.total_amount || 0),
    0,
  );

  const allItems = posOrders.flatMap((o: any) => o.items || []);
  const itemCountMap: Record<string, { name: string; count: number }> = {};
  allItems.forEach((item: any) => {
    const key = item.name || "";
    if (!itemCountMap[key]) itemCountMap[key] = { name: key, count: 0 };
    itemCountMap[key].count += item.quantity || 1;
  });
  const topItems = Object.values(itemCountMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const filteredOrders = useMemo(() => {
    const now = new Date();
    return posOrders.filter((o: any) => {
      const d = new Date(o.created_at || o.createdAt || "");
      if (dateFilter === "today")
        return d.toISOString().slice(0, 10) === todayStr;
      if (dateFilter === "week")
        return now.getTime() - d.getTime() < 7 * 86400000;
      if (dateFilter === "month")
        return (
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      return true;
    });
  }, [posOrders, dateFilter, todayStr]);

  const chartData = useMemo(() => {
    if (chartView === "today") {
      const hours = Array.from({ length: 24 }, (_, h) => ({
        label: `${h}:00`,
        revenue: 0,
      }));
      todayOrders.forEach((o: any) => {
        const h = new Date(o.created_at || o.createdAt || "").getHours();
        hours[h].revenue += parseFloat(o.total_amount || 0);
      });
      return hours
        .filter((h) => h.revenue > 0 || true)
        .map((h) => ({ ...h, revenue: parseFloat(h.revenue.toFixed(2)) }));
    } else {
      const days: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days[d.toISOString().slice(0, 10)] = 0;
      }
      posOrders.forEach((o: any) => {
        const ds = (o.created_at || o.createdAt || "").slice(0, 10);
        if (ds in days) days[ds] += parseFloat(o.total_amount || 0);
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
  const pickerSizes = pickerVariant
    ? pickerVariant.sizes
    : (pickerProduct?.sizes as string[]) || [];
  const pickerSizeInv = pickerVariant
    ? pickerVariant.sizeInventory
    : (pickerProduct?.sizeInventory as Record<string, number>) || {};
  const pickerAvail = pickerProduct
    ? pickerSize
      ? getAvailableStock(pickerProduct, pickerSize, pickerColor || undefined)
      : pickerSizes.length === 0
        ? getAvailableStock(pickerProduct, undefined, pickerColor || undefined)
        : 0
    : 0;

  /* ══════════════════════════════════════════════════════════════════ */
  return (
    <AdminLayout>
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
            onClick={() => window.open("/admin/pos-customer", "_blank", "width=1280,height=800,menubar=no,toolbar=no,location=no")}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950/20 dark:border-purple-800 dark:hover:bg-purple-950/40 transition-colors font-medium"
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
        </div>
      </div>

      {/* ── Completed order banner ─────────────────────────────────── */}
      {completedOrder && (
        <div className="mb-4 border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <span className="font-semibold text-green-800 dark:text-green-200 text-sm">
              {ar
                ? `✓ تم البيع — فاتورة #${completedOrder.id}`
                : `✓ Sale done — Invoice #${completedOrder.id}`}
            </span>
            <span className="text-green-700 dark:text-green-300 text-sm ms-3">
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
              onClick={() => {
                refetchOrders();
                printShiftSummary();
              }}
              className="flex items-center gap-2 px-4 py-2 border border-border hover:bg-muted text-sm font-medium transition-colors"
              data-testid="button-shift-summary"
            >
              <Printer className="w-4 h-4" />
              {ar ? "ملخص الشفت" : "Shift Summary"}
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

          {/* Best sellers + Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Best sellers */}
            <div className="border border-border rounded-xl p-4">
              <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
                <Flame className="w-4 h-4 text-amber-500" />
                {ar ? "الأكثر مبيعاً" : "Best Selling Items"}
              </h3>
              {topItems.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-8">
                  {ar ? "لا توجد بيانات بعد" : "No data yet"}
                </p>
              ) : (
                <div className="space-y-2">
                  {topItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i === 0 ? "bg-amber-400 text-white" : i === 1 ? "bg-slate-300 dark:bg-slate-600 text-foreground" : i === 2 ? "bg-orange-300 text-white" : "bg-muted text-muted-foreground"}`}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm flex-1 truncate">
                        {item.name}
                      </span>
                      <span className="text-sm font-semibold text-muted-foreground">
                        {item.count} {ar ? "قطعة" : "pcs"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Transactions */}
            <div className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 flex-wrap gap-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  {ar ? "الفواتير" : "Transactions"}
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {filteredOrders.length}
                  </span>
                </h3>
                <div className="flex gap-1">
                  {(["today", "week", "month", "all"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setDateFilter(f)}
                      className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${dateFilter === f ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}
                    >
                      {f === "today"
                        ? ar
                          ? "اليوم"
                          : "Today"
                        : f === "week"
                          ? ar
                            ? "أسبوع"
                            : "Week"
                          : f === "month"
                            ? ar
                              ? "شهر"
                              : "Month"
                            : ar
                              ? "الكل"
                              : "All"}
                    </button>
                  ))}
                </div>
              </div>
              {filteredOrders.length === 0 ? (
                <div className="text-muted-foreground text-sm text-center py-10">
                  {ar ? "لا توجد فواتير" : "No transactions"}
                </div>
              ) : (
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
                  {[...filteredOrders]
                    .reverse()
                    .map((order: any, i: number) => {
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
                      return (
                        <div
                          key={order.id ?? i}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                        >
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
                              <span className="text-xs font-bold">
                                #{order.id}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                ·{" "}
                                {format(date, "yyyy-MM-dd · HH:mm")}
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
                            <span className="text-sm font-bold">
                              ₪
                              {parseFloat(
                                order.total_amount || order.totalAmount || 0,
                              ).toFixed(2)}
                            </span>
                            <button
                              onClick={() => setExpandedOrder(order)}
                              className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted hover:border-foreground/30 transition-colors"
                              data-testid={`button-view-order-${order.id}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
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
              <div className="flex items-stretch rounded-xl border border-border bg-muted/30 overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 focus-within:bg-background transition-all shadow-sm w-44 flex-shrink-0">
                <span className="flex items-center ps-3 text-muted-foreground">
                  <Barcode className="w-4 h-4" />
                </span>
                <input
                  ref={barcodeRef}
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeEnter}
                  placeholder={ar ? "باركود..." : "Barcode..."}
                  className="bg-transparent px-2 py-2.5 text-sm font-mono outline-none w-full placeholder:text-muted-foreground/60"
                  data-testid="input-barcode-pos"
                />
              </div>
              {/* Text search */}
              <div className="flex items-stretch rounded-xl border border-border bg-muted/30 overflow-hidden focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 focus-within:bg-background transition-all shadow-sm flex-1">
                <span className="flex items-center ps-3 text-muted-foreground">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={ar ? "ابحث عن منتج..." : "Search products..."}
                  className="bg-transparent px-2 py-2.5 text-sm outline-none w-full placeholder:text-muted-foreground/60"
                  data-testid="input-search-pos"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="flex items-center pe-3 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Category pills */}
            <div
              className="flex gap-2 mb-3 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "none" }}
            >
              <button
                onClick={() => setCategoryFilter("all")}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 border ${categoryFilter === "all" ? "bg-foreground text-background border-foreground shadow-md scale-105" : "bg-background border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}
                data-testid="button-cat-all"
              >
                {ar ? "✦ الكل" : "✦ All"}
              </button>
              <button
                onClick={() => setCategoryFilter("best")}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 border ${categoryFilter === "best" ? "bg-amber-500 text-white border-amber-500 shadow-md scale-105" : "bg-background border-border text-amber-600 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"}`}
                data-testid="button-cat-best"
              >
                <Star className="w-3 h-3 fill-current" />
                {ar ? "الأكثر مبيعاً" : "Best Sellers"}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 border ${categoryFilter === cat.id ? "bg-foreground text-background border-foreground shadow-md scale-105" : "bg-background border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"}`}
                  data-testid={`button-cat-${cat.id}`}
                >
                  {ar ? cat.nameAr || cat.name : cat.name}
                </button>
              ))}
            </div>

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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                  {filteredProducts.map((product) => {
                    const price = product.discountPrice
                      ? parseFloat(product.discountPrice as string)
                      : parseFloat(product.price as string);
                    const hasDiscount = !!product.discountPrice;
                    const cartAvail = getProductCartAvail(product);
                    const isSoldOut = cartAvail <= 0;
                    const lowStock = !isSoldOut && cartAvail <= 3;
                    return (
                      <button
                        key={product.id}
                        onClick={() => !isSoldOut && openPicker(product)}
                        disabled={isSoldOut}
                        className={`rounded-xl overflow-hidden border transition-all text-start group focus:outline-none focus:ring-2 focus:ring-foreground/40 bg-card shadow-sm ${isSoldOut ? "border-border opacity-50 cursor-not-allowed" : "border-border hover:border-foreground/40 hover:shadow-md hover:-translate-y-0.5"}`}
                        data-testid={`button-product-${product.id}`}
                      >
                        <div className="aspect-[3/4] overflow-hidden bg-muted relative">
                          {product.mainImage ? (
                            <img
                              src={product.mainImage}
                              alt={product.name}
                              className={`w-full h-full object-cover transition-transform duration-300 ${isSoldOut ? "grayscale" : "group-hover:scale-105"}`}
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
                        <div className="p-2.5">
                          <p className="text-xs font-semibold line-clamp-2 leading-tight mb-1.5">
                            {ar
                              ? (product as any).nameAr || product.name
                              : product.name}
                          </p>
                          <div className="flex items-baseline gap-1.5 flex-wrap">
                            <span
                              className={`text-sm font-bold ${hasDiscount && !isSoldOut ? "text-red-600" : "text-foreground"}`}
                            >
                              ₪{price.toFixed(2)}
                            </span>
                            {hasDiscount && !isSoldOut && (
                              <span className="text-[10px] line-through text-muted-foreground">
                                ₪
                                {parseFloat(product.price as string).toFixed(2)}
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
                              ? ar
                                ? "نفد المخزون"
                                : "Out of stock"
                              : ar
                                ? `متاح: ${cartAvail}`
                                : `${cartAvail} left`}
                          </div>
                        </div>
                      </button>
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
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-foreground text-background flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-sm">
                  {ar ? "الفاتورة" : "Invoice"}
                </span>
                {cart.length > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                    {cart.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    onClick={holdCart}
                    className="flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800 px-2.5 py-1.5 rounded-lg hover:bg-amber-100 transition-colors font-medium"
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
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors"
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
                        className="flex gap-3 p-3 items-start hover:bg-muted/20 transition-colors"
                      >
                        <div className="w-11 h-13 bg-muted overflow-hidden flex-shrink-0 rounded-lg">
                          <img
                            src={getProductImage(item.product, item.color)}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {item.product.name}
                          </p>
                          {(item.size || item.color) && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {[item.size, item.color]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ₪{item.unitPrice.toFixed(2)} × {item.quantity} ={" "}
                            <span className="font-bold text-foreground">
                              ₪{(item.unitPrice * item.quantity).toFixed(2)}
                            </span>
                          </p>
                          <div className="flex items-center gap-1 mt-2">
                            <button
                              onClick={() => updateQty(idx, -1)}
                              className="w-6 h-6 flex items-center justify-center border border-border hover:bg-muted rounded-lg text-xs transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-7 text-center text-xs font-bold">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQty(idx, 1)}
                              disabled={availMore <= 0}
                              className={`w-6 h-6 flex items-center justify-center border rounded-lg text-xs transition-colors ${availMore <= 0 ? "opacity-30 cursor-not-allowed border-border" : "border-border hover:bg-muted"}`}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => updateQty(idx, 5)}
                              disabled={availMore <= 0}
                              className={`px-2 h-6 flex items-center border rounded-lg text-[10px] text-muted-foreground transition-colors ${availMore <= 0 ? "opacity-30 cursor-not-allowed border-border" : "border-border hover:bg-muted"}`}
                            >
                              +5
                            </button>
                            {availMore === 0 && (
                              <span className="text-[9px] text-orange-500 font-semibold ms-1">
                                {ar ? "الحد الأقصى" : "Max"}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => removeItem(idx)}
                          className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-md transition-colors flex-shrink-0 mt-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Discount + Note + Totals + Checkout */}
            {cart.length > 0 && (
              <div className="border-t border-border p-4 space-y-3 bg-muted/5">
                {/* Note */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                    <span className="text-base leading-none">📝</span>
                    {ar ? "ملاحظة" : "Note"}
                    <span className="text-[10px] italic text-muted-foreground/50 font-normal">
                      {ar ? "(اختياري)" : "(optional)"}
                    </span>
                  </label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={
                      ar ? "مثال: هدية، استبدال..." : "e.g. gift, exchange..."
                    }
                    className="w-full text-xs border border-border bg-background rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    data-testid="input-sale-note"
                  />
                </div>

                {/* Discount */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Tag className="w-3.5 h-3.5" />
                      {ar ? "خصم" : "Discount"}
                    </label>
                    <span className="text-[10px] text-muted-foreground/50 italic font-normal">
                      {ar ? "اختياري" : "optional"}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Input
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder="0"
                      className="h-9 text-sm flex-1 rounded-lg"
                      type="number"
                      min="0"
                      data-testid="input-discount"
                    />
                    <button
                      onClick={() =>
                        setDiscountType((t) =>
                          t === "percent" ? "fixed" : "percent",
                        )
                      }
                      className="flex items-center gap-1 px-3 h-9 border border-border hover:bg-muted text-sm font-bold transition-colors flex-shrink-0 min-w-[48px] justify-center rounded-lg"
                      data-testid="button-discount-type"
                    >
                      {discountType === "percent" ? "%" : "₪"}
                    </button>
                    {discountValue && (
                      <button
                        onClick={() => setDiscountValue("")}
                        className="w-8 h-9 flex items-center justify-center text-muted-foreground hover:text-destructive flex-shrink-0 rounded-lg border border-transparent hover:border-destructive/20 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Totals */}
                <div className="rounded-xl bg-muted/40 border border-border p-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{ar ? "المجموع الفرعي" : "Subtotal"}</span>
                    <span>₪{cartSubtotal.toFixed(2)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-xs text-red-500 font-medium">
                      <span>{ar ? "الخصم" : "Discount"}</span>
                      <span>-₪{discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg pt-1.5 border-t border-border/60 mt-1.5">
                    <span>{ar ? "الإجمالي" : "Total"}</span>
                    <span className="text-primary">
                      ₪{cartTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Cash input */}
                {paymentMethod === "cash" && (
                  <div className="space-y-2 rounded-xl border border-border p-3 bg-background">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {ar ? "المبلغ المستلم" : "Cash Received"}
                    </label>
                    <div className="flex gap-1.5 flex-wrap">
                      {[20, 50, 100, 200].map((v) => (
                        <button
                          key={v}
                          onClick={() => setCashReceived(String(v))}
                          className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${cashReceived === String(v) ? "bg-foreground text-background border-foreground shadow-sm" : "border-border hover:bg-muted"}`}
                        >
                          ₪{v}
                        </button>
                      ))}
                    </div>
                    <Input
                      ref={cashRef}
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      type="number"
                      min="0"
                      placeholder={ar ? "أدخل المبلغ..." : "Enter amount..."}
                      className="h-10 text-sm font-mono rounded-lg"
                      data-testid="input-cash-received"
                    />
                    {cashAmt > 0 && cashAmt < cartTotal && (
                      <div className="flex justify-between items-center bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-3 py-2.5 rounded-lg">
                        <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                          {ar ? "المبلغ غير كافٍ" : "Insufficient"}
                        </span>
                        <span className="text-sm font-bold text-red-600 dark:text-red-400">
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
                        <span className="text-lg font-bold text-green-600 dark:text-green-400">
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
                        className="flex items-center justify-center gap-2 h-12 bg-foreground text-background hover:bg-foreground/90 transition-all font-bold text-sm rounded-xl shadow-sm active:scale-95"
                        data-testid="button-pay-cash"
                      >
                        <Banknote className="w-5 h-5" />
                        {ar ? "نقدي" : "Cash"}
                      </button>
                      <button
                        onClick={() => setPaymentMethod("card")}
                        className="flex items-center justify-center gap-2 h-12 border-2 border-foreground hover:bg-muted transition-all font-bold text-sm rounded-xl active:scale-95"
                        data-testid="button-pay-card"
                      >
                        <CreditCard className="w-5 h-5" />
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
                      className="w-full flex items-center justify-center gap-2 h-10 border border-border hover:bg-muted text-sm text-muted-foreground transition-colors rounded-xl"
                      data-testid="button-pay-split"
                    >
                      <Split className="w-4 h-4" />
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
                      className="w-full h-12 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-base flex items-center justify-center gap-2 transition-all rounded-xl shadow-sm active:scale-95"
                      data-testid="button-confirm-sale"
                    >
                      {completing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-5 h-5" />
                      )}
                      {ar ? "تأكيد البيع" : "Confirm Sale"}
                    </button>
                    <button
                      onClick={() => {
                        setPaymentMethod(null);
                        setCashReceived("");
                        setCardReceived("");
                      }}
                      className="w-full h-9 border border-border hover:bg-muted text-sm text-muted-foreground transition-colors flex items-center justify-center gap-2 rounded-xl"
                      data-testid="button-cancel-payment"
                    >
                      <X className="w-4 h-4" />
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setPickerProduct(null);
            barcodeRef.current?.focus();
          }}
        >
          <div
            className="bg-background border border-border w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            data-testid="pos-product-picker"
          >
            <div className="flex items-start gap-4 p-4 border-b border-border">
              <div className="w-20 h-24 bg-muted overflow-hidden flex-shrink-0 rounded">
                <img
                  src={getProductImage(pickerProduct, pickerColor)}
                  alt={pickerProduct.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold leading-tight">
                  {pickerProduct.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {pickerProduct.discountPrice ? (
                    <>
                      <span className="text-red-600 font-bold">
                        ₪
                        {parseFloat(
                          pickerProduct.discountPrice as string,
                        ).toFixed(2)}
                      </span>{" "}
                      <span className="line-through text-xs">
                        ₪{parseFloat(pickerProduct.price as string).toFixed(2)}
                      </span>
                    </>
                  ) : (
                    <span className="font-bold">
                      ₪{parseFloat(pickerProduct.price as string).toFixed(2)}
                    </span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {ar
                    ? `مخزون: ${pickerProduct.stockQuantity}`
                    : `Stock: ${pickerProduct.stockQuantity}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setPickerProduct(null);
                  barcodeRef.current?.focus();
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Color */}
              {(
                (pickerProduct.colorVariants as ColorVariant[] | undefined) ||
                []
              ).length > 1 && (
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
                    {ar ? "اللون" : "Color"}
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {(
                      (pickerProduct.colorVariants as ColorVariant[]) || []
                    ).map((cv) => (
                      <button
                        key={cv.name}
                        onClick={() => {
                          const sizes = (pickerProduct.sizes as string[]) || [];
                          const inv = cv.sizeInventory as
                            | Record<string, number>
                            | undefined;
                          const firstAvail =
                            sizes.find((sz) =>
                              inv
                                ? (inv[sz] ?? 0) > 0
                                : pickerProduct.stockQuantity > 0,
                            ) ?? "";
                          setPickerColor(cv.name);
                          setPickerSize(firstAvail);
                          setPickerQty(1);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border transition-colors ${pickerColor === cv.name ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}
                      >
                        <span
                          className="w-3 h-3 rounded-full border border-white/30"
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
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
                    {ar ? "المقاس" : "Size"}
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {pickerSizes.map((s) => {
                      const avail = getAvailableStock(
                        pickerProduct,
                        s,
                        pickerColor || undefined,
                      );
                      return (
                        <button
                          key={s}
                          onClick={() => {
                            if (avail > 0) {
                              setPickerSize(s);
                              setPickerQty((q) => Math.min(q, avail));
                            }
                          }}
                          disabled={avail <= 0}
                          className={`px-3 py-1.5 text-xs border transition-colors ${pickerSize === s ? "bg-foreground text-background border-foreground" : avail <= 0 ? "border-border opacity-30 cursor-not-allowed line-through" : "border-border hover:bg-muted"}`}
                        >
                          {s}
                          {avail > 0 ? ` (${avail})` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Quantity */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {ar ? "الكمية" : "Quantity"}
                  </label>
                  {pickerAvail > 0 && (
                    <span
                      className={`text-[10px] font-semibold ${pickerAvail <= 3 ? "text-orange-500" : "text-muted-foreground"}`}
                    >
                      {ar ? `متاح: ${pickerAvail}` : `Avail: ${pickerAvail}`}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPickerQty((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 flex items-center justify-center border border-border hover:bg-muted"
                    data-testid="picker-qty-minus"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-12 text-center font-bold text-lg">
                    {pickerQty}
                  </span>
                  <button
                    onClick={() =>
                      setPickerQty((q) =>
                        pickerAvail > 0 ? Math.min(q + 1, pickerAvail) : q,
                      )
                    }
                    disabled={pickerAvail > 0 && pickerQty >= pickerAvail}
                    className="w-9 h-9 flex items-center justify-center border border-border hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                    data-testid="picker-qty-plus"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      setPickerQty((q) =>
                        pickerAvail > 0 ? Math.min(q + 5, pickerAvail) : q,
                      )
                    }
                    disabled={pickerAvail > 0 && pickerQty >= pickerAvail}
                    className="px-3 h-9 border border-border hover:bg-muted text-sm text-muted-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    +5
                  </button>
                  {pickerAvail > 0 && pickerQty < pickerAvail && (
                    <button
                      onClick={() => setPickerQty(pickerAvail)}
                      className="px-3 h-9 border border-border hover:bg-muted text-xs text-muted-foreground"
                    >
                      {ar ? "الكل" : "Max"}
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={confirmPicker}
                disabled={
                  pickerAvail <= 0 || (pickerSizes.length > 0 && !pickerSize)
                }
                className="w-full h-11 bg-foreground text-background hover:bg-foreground/90 font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="button-picker-confirm"
              >
                <Plus className="w-4 h-4" />
                {pickerAvail <= 0
                  ? ar
                    ? "نفد المخزون"
                    : "Out of Stock"
                  : ar
                    ? `إضافة ${pickerQty} للفاتورة`
                    : `Add ${pickerQty} to invoice`}
              </button>
            </div>
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
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {format(new Date(expandedOrder.created_at || expandedOrder.createdAt || Date.now()), "yyyy-MM-dd · HH:mm")}
                  <span className="mx-1">·</span>
                  {(expandedOrder.payment_method ||
                    expandedOrder.paymentMethod) === "card" ? (
                    <>
                      <CreditCard className="w-3 h-3 text-blue-500" />
                      {ar ? "بطاقة" : "Card"}
                    </>
                  ) : (expandedOrder.payment_method ||
                      expandedOrder.paymentMethod) === "split" ? (
                    <>
                      <Split className="w-3 h-3 text-purple-500" />
                      {ar ? "مختلط" : "Split"}
                    </>
                  ) : (
                    <>
                      <Banknote className="w-3 h-3 text-green-500" />
                      {ar ? "نقدي" : "Cash"}
                    </>
                  )}
                </p>
                {expandedOrder.note && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    📝 {expandedOrder.note}
                  </p>
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
                          <p className="text-[11px] text-muted-foreground mt-1">
                            ₪{parseFloat(item.price || 0).toFixed(2)} ×{" "}
                            {item.quantity || 1}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-end">
                          <p className="text-base font-bold">
                            ₪
                            {(
                              parseFloat(item.price || 0) * (item.quantity || 1)
                            ).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-border px-5 py-4 bg-muted/20 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {ar ? "إجمالي الفاتورة" : "Invoice Total"}
              </span>
              <span className="text-xl font-bold">
                ₪
                {parseFloat(
                  expandedOrder.total_amount || expandedOrder.totalAmount || 0,
                ).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Exchange modal ──────────────────────────────────────────── */}
      {exchangeMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            setExchangeMode(false);
            setExchangeOrder(null);
            setExchangeSearch("");
            setExchangeOverride(false);
            setDressOverrideItems(new Set());
            setExchangeNewSearch("");
            setExchangeNewProduct(null);
            setExchangeNewSize("");
            setExchangeNewColor("");
            setExchangeNewQty(1);
          }}
        >
          <div
            className="bg-background border border-border w-full max-w-lg shadow-2xl rounded-xl overflow-hidden max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            data-testid="pos-exchange-modal"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-blue-50 dark:bg-blue-950/20 sticky top-0 z-10">
              <h3 className="font-bold flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <ArrowLeftRight className="w-5 h-5" />
                {ar ? "تبديل منتج" : "Exchange Product"}
              </h3>
              <button
                onClick={() => {
                  setExchangeMode(false);
                  setExchangeOrder(null);
                  setExchangeSearch("");
                  setExchangeOverride(false);
                  setDressOverrideItems(new Set());
                  setExchangeNewSearch("");
                  setExchangeNewProduct(null);
                  setExchangeNewSize("");
                  setExchangeNewColor("");
                  setExchangeNewQty(1);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
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
                  value={exchangeSearch}
                  onChange={(e) => setExchangeSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchExchange()}
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
                const orderDate = new Date(exchangeOrder.created_at || exchangeOrder.createdAt || "");
                const daysPassed = Math.floor((Date.now() - orderDate.getTime()) / 86400000);

                return (
                  <>
                    {/* Invoice meta */}
                    <div className="text-sm font-semibold text-muted-foreground border-b border-border pb-2 flex items-center justify-between">
                      <span>
                        {ar ? `فاتورة #${exchangeOrder.id}` : `Invoice #${exchangeOrder.id}`}
                        {" · "}₪{parseFloat(exchangeOrder.total_amount || exchangeOrder.totalAmount || 0).toFixed(2)}
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

                    {/* Big expired warning */}
                    {expired && !exchangeOverride && (
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
                          <button
                            onClick={() => setExchangeOverride(true)}
                            className="px-5 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg font-bold flex items-center gap-2 shadow-md"
                            data-testid="button-exchange-override"
                          >
                            <ShieldAlert className="w-4 h-4" />
                            {ar ? "تجاوز وتابع (استثنائي)" : "Override & Continue (Admin Only)"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Override confirmation banner */}
                    {expired && exchangeOverride && (
                      <div className="flex items-center gap-2 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded-lg px-3 py-2 text-xs text-red-700 dark:text-red-300 font-semibold" data-testid="exchange-override-banner">
                        <ShieldAlert className="w-4 h-4 shrink-0 text-red-500" />
                        {ar
                          ? "⚠️ تم التجاوز استثنائياً — تأكد من موافقة المدير"
                          : "⚠️ Admin override active — ensure manager approval"}
                      </div>
                    )}

                    {/* Items list — only show when not blocked by expired warning */}
                    {(!expired || exchangeOverride) && (
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
                          const dressUnlocked = isDress && dressOverrideItems.has(i);
                          return (
                            <div
                              key={i}
                              className={`flex items-center gap-3 border p-3 rounded-lg ${isDress ? (dressUnlocked ? "border-red-400 bg-red-50/80 dark:bg-red-950/30 ring-2 ring-red-400/40" : "border-red-200 bg-red-50 dark:bg-red-950/20") : "border-border"}`}
                              data-testid={`exchange-item-${i}`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate flex items-center gap-1.5">
                                  {item.name}
                                  {isDress && (
                                    <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded font-semibold border border-red-200 dark:border-red-700">
                                      <Ban className="w-2.5 h-2.5" />
                                      {ar ? "لا يبدل" : "No Exchange"}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {[item.size, item.color].filter(Boolean).join(" · ")}
                                  {" · "}
                                  {ar ? `${item.quantity} قطعة` : `${item.quantity} pcs`}
                                </p>
                              </div>
                              {isDress && !dressOverrideItems.has(i) ? (
                                <button
                                  onClick={() => {
                                    setDressOverrideItems((prev) => {
                                      const next = new Set(prev);
                                      next.add(i);
                                      return next;
                                    });
                                  }}
                                  className="text-xs px-2.5 py-1.5 border-2 border-red-400 text-red-600 dark:text-red-400 hover:bg-red-600 hover:text-white dark:hover:bg-red-700 rounded-lg font-bold flex items-center gap-1.5 shrink-0 transition-colors"
                                  data-testid={`button-dress-override-${i}`}
                                >
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  {ar ? "تبديل استثنائي" : "Override"}
                                </button>
                              ) : (
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => setExchangeQtys((prev) => ({ ...prev, [i]: Math.max(0, (prev[i] || 0) - 1) }))}
                                    className="w-7 h-7 border border-border rounded flex items-center justify-center hover:bg-muted"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-8 text-center text-sm font-semibold">
                                    {exchangeQtys[i] || 0}
                                  </span>
                                  <button
                                    onClick={() => setExchangeQtys((prev) => ({ ...prev, [i]: Math.min(item.quantity, (prev[i] || 0) + 1) }))}
                                    className="w-7 h-7 border border-border rounded flex items-center justify-center hover:bg-muted"
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

                    {/* ── Replacement product picker ── */}
                    {(!expired || exchangeOverride) && (() => {
                      const returnCredit = (exchangeOrder.items || []).reduce(
                        (s: number, it: any, idx: number) =>
                          s + parseFloat(it.price || 0) * (exchangeQtys[idx] || 0),
                        0,
                      );
                      const newResults = exchangeNewSearch.trim()
                        ? (products as Product[])
                            .filter(
                              (p) =>
                                p.name.toLowerCase().includes(exchangeNewSearch.toLowerCase()) ||
                                (p.barcode || "").includes(exchangeNewSearch),
                            )
                            .slice(0, 5)
                        : [];
                      const newUnitPrice = exchangeNewProduct
                        ? parseFloat(
                            (exchangeNewProduct.discountPrice as string | null) ||
                              exchangeNewProduct.price,
                          )
                        : 0;
                      const newCost = newUnitPrice * exchangeNewQty;
                      const diff = newCost - returnCredit;
                      const newVariants =
                        (exchangeNewProduct?.colorVariants as ColorVariant[] | undefined) || [];
                      const newSizes = exchangeNewProduct?.sizes as string[] | undefined;
                      const selectedVariant = newVariants.find(
                        (cv) => cv.name === exchangeNewColor,
                      );
                      const availableSizes =
                        newVariants.length > 0
                          ? selectedVariant
                            ? (selectedVariant.sizes as string[]) || []
                            : []
                          : newSizes || [];
                      return (
                        <div className="border-t border-border pt-4 space-y-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {ar ? "القطعة البديلة (اختياري)" : "Replacement Product (optional)"}
                          </p>

                          {/* Credit summary */}
                          {returnCredit > 0 && (
                            <div className="flex items-center justify-between text-xs bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                              <span className="text-green-700 dark:text-green-300 font-medium">
                                {ar ? "رصيد الإرجاع" : "Return credit"}
                              </span>
                              <span className="text-green-700 dark:text-green-300 font-bold text-sm">
                                ₪{returnCredit.toFixed(2)}
                              </span>
                            </div>
                          )}

                          {/* Search input */}
                          {!exchangeNewProduct && (
                            <div className="relative">
                              <Input
                                value={exchangeNewSearch}
                                onChange={(e) => setExchangeNewSearch(e.target.value)}
                                placeholder={ar ? "ابحث عن منتج بديل..." : "Search replacement product..."}
                                className="text-sm"
                                data-testid="input-exchange-new-search"
                              />
                              {newResults.length > 0 && (
                                <div className="absolute z-20 top-full left-0 right-0 bg-background border border-border shadow-xl rounded-md mt-1 overflow-hidden">
                                  {newResults.map((p) => (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => {
                                        setExchangeNewProduct(p);
                                        setExchangeNewSearch("");
                                        setExchangeNewSize("");
                                        setExchangeNewColor("");
                                        setExchangeNewQty(1);
                                      }}
                                      className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted text-start border-b border-border/40 last:border-0"
                                      data-testid={`exchange-new-product-${p.id}`}
                                    >
                                      {p.mainImage && (
                                        <img src={p.mainImage} alt="" className="w-8 h-8 object-cover rounded shrink-0" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium truncate">{p.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                          ₪{parseFloat((p.discountPrice as string | null) || p.price).toFixed(2)}
                                        </p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Selected product details */}
                          {exchangeNewProduct && (
                            <div className="space-y-3 border border-border rounded-lg p-3">
                              <div className="flex items-center gap-2">
                                {exchangeNewProduct.mainImage && (
                                  <img src={exchangeNewProduct.mainImage} alt="" className="w-10 h-10 object-cover rounded shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold truncate">{exchangeNewProduct.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    ₪{newUnitPrice.toFixed(2)}
                                  </p>
                                </div>
                                <button
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

                              {/* Color selector */}
                              {newVariants.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {newVariants.map((cv) => (
                                    <button
                                      key={cv.name}
                                      onClick={() => {
                                        setExchangeNewColor(cv.name);
                                        setExchangeNewSize("");
                                      }}
                                      className={`text-xs px-2 py-1 rounded border transition-all ${exchangeNewColor === cv.name ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
                                      data-testid={`exchange-new-color-${cv.name}`}
                                    >
                                      <span
                                        className="inline-block w-3 h-3 rounded-full mr-1 border border-white/30"
                                        style={{ backgroundColor: cv.colorCode || "#ccc" }}
                                      />
                                      {cv.name}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Size selector */}
                              {availableSizes.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {availableSizes.map((sz) => (
                                    <button
                                      key={sz}
                                      onClick={() => setExchangeNewSize(sz)}
                                      className={`text-xs px-2.5 py-1 rounded border transition-all ${exchangeNewSize === sz ? "border-foreground bg-foreground text-background" : "border-border hover:bg-muted"}`}
                                      data-testid={`exchange-new-size-${sz}`}
                                    >
                                      {sz}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {/* Qty */}
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{ar ? "الكمية:" : "Qty:"}</span>
                                <div className="flex items-center gap-1">
                                  <button onClick={() => setExchangeNewQty((q) => Math.max(1, q - 1))} className="w-6 h-6 border border-border rounded flex items-center justify-center hover:bg-muted">
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-7 text-center text-sm font-semibold">{exchangeNewQty}</span>
                                  <button onClick={() => setExchangeNewQty((q) => q + 1)} className="w-6 h-6 border border-border rounded flex items-center justify-center hover:bg-muted">
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Price difference */}
                              <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 font-bold ${
                                diff > 0
                                  ? "bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800"
                                  : diff < 0
                                  ? "bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800"
                                  : "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800"
                              }`} data-testid="exchange-price-diff">
                                <span className="text-xs">
                                  {ar
                                    ? diff > 0
                                      ? "الزبون يدفع فرق"
                                      : diff < 0
                                      ? "المتجر يرجع للزبون"
                                      : "السعر متماثل"
                                    : diff > 0
                                    ? "Customer pays difference"
                                    : diff < 0
                                    ? "Store returns to customer"
                                    : "Same price — no difference"}
                                </span>
                                <span className={`text-base ${
                                  diff > 0
                                    ? "text-orange-600 dark:text-orange-400"
                                    : diff < 0
                                    ? "text-blue-600 dark:text-blue-400"
                                    : "text-green-600 dark:text-green-400"
                                }`}>
                                  {diff !== 0 ? `₪${Math.abs(diff).toFixed(2)}` : "✓"}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Process button */}
                    {(!expired || exchangeOverride) && (
                      <button
                        onClick={processExchange}
                        disabled={processingExchange}
                        className="w-full h-11 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-semibold flex items-center justify-center gap-2 transition-colors rounded"
                        data-testid="button-process-exchange"
                      >
                        {processingExchange ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <ArrowLeftRight className="w-4 h-4" />
                        )}
                        {ar
                          ? exchangeNewProduct
                            ? "تأكيد التبديل وإضافة القطعة الجديدة للسلة"
                            : "تأكيد التبديل وإرجاع المخزون"
                          : exchangeNewProduct
                          ? "Confirm Exchange & Add Replacement to Cart"
                          : "Confirm Exchange & Restore Stock"}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {returnMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => {
            setReturnMode(false);
            setReturnOrder(null);
            setReturnSearch("");
          }}
        >
          <div
            className="bg-background border border-border w-full max-w-md shadow-2xl rounded-xl overflow-hidden"
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
                  value={returnSearch}
                  onChange={(e) => setReturnSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchReturn()}
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
    </AdminLayout>
  );
}
