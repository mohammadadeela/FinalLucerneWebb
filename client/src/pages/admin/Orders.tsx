import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useOrders, useUpdateOrderStatus, useOrder } from "@/hooks/use-orders";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Eye,
  Search,
  X,
  Check,
  ListChecks,
  ChevronDown,
  CreditCard,
  ShoppingCart,
  Calendar,
  ExternalLink,
  ZoomIn,
  Printer,
  Barcode,
  ChevronLeft,
  ChevronRight,
  FileText,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

const STATUSES = [
  "All",
  "Pending",
  "OnTheWay",
  "Delivered",
  "Cancelled",
] as const;
type StatusFilter = (typeof STATUSES)[number];
const ACTION_STATUSES = ["Pending", "OnTheWay", "Delivered", "Cancelled"];

function SelectBox({
  checked,
  onChange,
  indeterminate = false,
  testId,
}: {
  checked: boolean;
  onChange: (e: React.MouseEvent) => void;
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
        onChange(e);
      }}
      data-testid={testId}
      className={`w-6 h-6 flex-shrink-0 flex items-center justify-center border-2 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary ${
        checked || indeterminate
          ? "bg-primary border-primary text-primary-foreground"
          : "bg-background border-border hover:border-primary/60"
      }`}
    >
      {indeterminate ? (
        <span className="block w-3 h-0.5 bg-current" />
      ) : checked ? (
        <Check className="w-3.5 h-3.5 stroke-[3]" />
      ) : null}
    </button>
  );
}

// ── Lightbox component ───────────────────────────────────────────────────────
function Lightbox({
  images,
  startIndex,
  onClose,
  isAr,
}: {
  images: string[];
  startIndex: number;
  onClose: () => void;
  isAr: boolean;
}) {
  const [idx, setIdx] = useState(startIndex);
  const prev = () => setIdx((i) => (i - 1 + images.length) % images.length);
  const next = () => setIdx((i) => (i + 1) % images.length);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="fixed inset-0 z-[200]">
      {/* Backdrop — clicking it closes the lightbox only */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Close button — always top-right, above backdrop */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 active:bg-white/60 flex items-center justify-center text-white transition-colors"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Centred image — stops clicks so backdrop doesn't fire */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <img
          src={images[idx]}
          alt=""
          className="pointer-events-auto max-h-[88vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
          style={{ background: "transparent" }}
        />
      </div>

      {/* Prev / Next arrows — only when multiple images */}
      {images.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 active:bg-white/60 flex items-center justify-center text-white transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-14 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 active:bg-white/60 flex items-center justify-center text-white transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          {/* Dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className={`w-2 h-2 rounded-full transition-all ${i === idx ? "bg-white scale-125" : "bg-white/40 hover:bg-white/70"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Orders() {
  const { data: orders, isLoading } = useOrders();
  const updateStatus = useUpdateOrderStatus();
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const { data: orderDetails } = useOrder(selectedOrderId || 0);
  const { toast } = useToast();
  const [showDetails, setShowDetails] = useState(false);
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [dateFilter, setDateFilter] = useState("");
  const queryClient = useQueryClient();

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("Delivered");
  // Lightbox: holds array of image URLs + current index
  const [lightbox, setLightbox] = useState<{
    images: string[];
    idx: number;
  } | null>(null);
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const lastClickedIndexRef = useRef<number | null>(null);

  const handlePrint = async (scope: "today" | "filtered" | "all") => {
    setShowPrintMenu(false);
    setIsPrinting(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      let baseList = orders || [];
      if (scope === "today") {
        baseList = baseList.filter(
          (o) =>
            o.createdAt &&
            format(new Date(o.createdAt), "yyyy-MM-dd") === today,
        );
      } else if (scope === "filtered") {
        baseList = filteredOrders || [];
      }
      if (baseList.length === 0) {
        toast({ title: isAr ? "لا توجد طلبات للطباعة" : "No orders to print" });
        return;
      }
      const details = await Promise.all(
        baseList.map((o) =>
          fetch(`/api/orders/${o.id}`, { credentials: "include" })
            .then((r) => r.json())
            .catch(() => null),
        ),
      );

      const statusMap: Record<string, string> = {
        Pending: isAr ? "قيد الانتظار" : "Pending",
        OnTheWay: isAr ? "في الطريق" : "On The Way",
        Delivered: isAr ? "تم التسليم" : "Delivered",
        Cancelled: isAr ? "ملغي" : "Cancelled",
      };

      const statusColors: Record<string, string> = {
        Pending: "#d97706",
        OnTheWay: "#2563eb",
        Delivered: "#16a34a",
        Cancelled: "#dc2626",
      };

      const scopeLabel =
        scope === "today"
          ? isAr
            ? `طلبات اليوم — ${format(new Date(), "yyyy-MM-dd")}`
            : `Today's Orders — ${format(new Date(), "yyyy-MM-dd")}`
          : scope === "filtered"
            ? isAr
              ? "النتائج المعروضة"
              : "Filtered Orders"
            : isAr
              ? "جميع الطلبات"
              : "All Orders";

      const ordersHtml = details
        .filter(Boolean)
        .map((d: any) => {
          const o = d.order;
          const items = d.items || [];

          const itemsHtml = items
            .map((item: any) => {
              const unitPrice = parseFloat(item.price);
              const lineTotal = unitPrice * item.quantity;
              const isExchange = o.paymentMethod === "Exchange";
              return `
              <tr>
                <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;vertical-align:top;">
                  <div style="display:flex;align-items:flex-start;gap:10px;">
                    ${
                      item.product?.mainImage
                        ? `<img src="${item.product.mainImage}" style="width:52px;height:64px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;flex-shrink:0;" />`
                        : `<div style="width:52px;height:64px;background:#f3f4f6;border-radius:6px;border:1px solid #e5e7eb;flex-shrink:0;"></div>`
                    }
                    <div>
                      <div style="font-weight:700;font-size:13px;color:#111;line-height:1.3;">${item.product?.name || "—"}</div>
                      ${item.product?.barcode ? `<div style="font-family:monospace;font-size:10px;color:#888;margin-top:3px;">⬛ ${item.product.barcode}</div>` : ""}
                      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:5px;">
                        ${item.size ? `<span style="font-size:11px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:1px 6px;">${isAr ? "مقاس" : "Size"}: <strong>${item.size}</strong></span>` : ""}
                        ${item.color ? `<span style="font-size:11px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:1px 6px;">${isAr ? "لون" : "Color"}: <strong>${item.color}</strong></span>` : ""}
                      </div>
                    </div>
                  </div>
                </td>
                <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;vertical-align:middle;">
                  <span style="font-weight:700;font-size:14px;">${item.quantity}</span>
                </td>
                <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:middle;">
                  ${item.quantity > 1 ? `<div style="font-size:11px;color:#888;margin-bottom:2px;">₪${unitPrice.toFixed(2)} × ${item.quantity}</div>` : ""}
                  ${
                    isExchange
                      ? `<div><span style="text-decoration:line-through;color:#aaa;font-size:12px;">₪${lineTotal.toFixed(2)}</span> <strong style="color:#16a34a;">₪0.00</strong></div>`
                      : `<strong style="font-size:13px;">₪${lineTotal.toFixed(2)}</strong>`
                  }
                </td>
              </tr>`;
            })
            .join("");

          const subtotal = items.reduce(
            (s: number, i: any) => s + parseFloat(i.price) * i.quantity,
            0,
          );
          const shipping = parseFloat(o.shippingCost || "0");
          const total = parseFloat(o.totalAmount);
          const discount =
            o.discountCode === "EXCHANGE" && o.discountAmount
              ? parseFloat(o.discountAmount)
              : 0;

          const statusColor = statusColors[o.status] || "#374151";
          const statusLabel = statusMap[o.status] || o.status;

          return `
          <div style="page-break-inside:avoid;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;overflow:hidden;font-family:Arial,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,0.06);">

            <!-- Order header bar -->
            <div style="background:#111;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
              <div>
                <div style="font-size:17px;font-weight:800;font-family:monospace;">
                  ${isAr ? "طلب" : "Order"} #${String(o.id).padStart(6, "0")}
                </div>
                <div style="font-size:11px;color:#aaa;margin-top:3px;">
                  ${o.createdAt ? format(new Date(o.createdAt), "yyyy-MM-dd HH:mm") : ""}
                </div>
              </div>
              <div style="text-align:${isAr ? "left" : "right"};">
                <div style="display:inline-block;background:${statusColor};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:0.5px;">
                  ${statusLabel}
                </div>
                ${o.paymentMethod ? `<div style="font-size:11px;color:#ccc;margin-top:4px;">${o.paymentMethod === "Exchange" ? (isAr ? "🔄 استبدال" : "🔄 Exchange") : o.paymentMethod}</div>` : ""}
              </div>
            </div>

            <!-- Customer info -->
            <div style="padding:14px 18px;background:#fafafa;border-bottom:1px solid #f0f0f0;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;">
              <div><span style="color:#888;display:block;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">${isAr ? "الاسم" : "Name"}</span><strong>${o.fullName || ""}</strong></div>
              <div><span style="color:#888;display:block;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">${isAr ? "الهاتف" : "Phone"}</span><strong>${o.phone || ""}${o.phone2 ? " / " + o.phone2 : ""}</strong></div>
              <div style="grid-column:1/-1;"><span style="color:#888;display:block;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">${isAr ? "العنوان" : "Address"}</span><strong>${o.address || ""}, ${o.city || ""}</strong></div>
              ${o.notes ? `<div style="grid-column:1/-1;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;"><span style="color:#92400e;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:2px;">${isAr ? "ملاحظات" : "Notes"}</span><span style="font-size:12px;color:#78350f;">${o.notes}</span></div>` : ""}
            </div>

            <!-- Items table -->
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb;">
                  <th style="padding:8px 12px;text-align:${isAr ? "right" : "left"};font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.5px;">${isAr ? "المنتج" : "Product"}</th>
                  <th style="padding:8px 12px;text-align:center;font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.5px;width:60px;">${isAr ? "الكمية" : "Qty"}</th>
                  <th style="padding:8px 12px;text-align:right;font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:0.5px;width:100px;">${isAr ? "المبلغ" : "Total"}</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>

            <!-- Totals -->
            <div style="padding:12px 18px;border-top:2px solid #e5e7eb;background:#fafafa;">
              <div style="max-width:260px;margin-inline-start:auto;font-size:13px;">
                ${subtotal !== total - shipping + discount ? `<div style="display:flex;justify-content:space-between;color:#666;margin-bottom:4px;"><span>${isAr ? "المجموع الفرعي" : "Subtotal"}</span><span>₪${subtotal.toFixed(2)}</span></div>` : ""}
                ${shipping > 0 ? `<div style="display:flex;justify-content:space-between;color:#666;margin-bottom:4px;"><span>${isAr ? "الشحن" : "Shipping"}</span><span>₪${shipping.toFixed(2)}</span></div>` : ""}
                ${discount > 0 ? `<div style="display:flex;justify-content:space-between;color:#16a34a;margin-bottom:4px;"><span>${isAr ? "خصم الاستبدال" : "Exchange discount"}</span><span>−₪${discount.toFixed(2)}</span></div>` : ""}
                <div style="display:flex;justify-content:space-between;font-weight:800;font-size:15px;padding-top:8px;border-top:2px solid #111;margin-top:4px;">
                  <span>${isAr ? "الإجمالي" : "Total"}</span>
                  <span style="color:${o.paymentMethod === "Exchange" ? "#16a34a" : "#111"};">₪${total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>`;
        })
        .join("");

      const win = window.open("", "_blank");
      if (!win) {
        toast({
          title: isAr
            ? "تم حجب النافذة الجديدة من المتصفح"
            : "Popup blocked by browser",
          variant: "destructive",
        });
        return;
      }
      win.document.write(`<!DOCTYPE html>
<html dir="${isAr ? "rtl" : "ltr"}" lang="${isAr ? "ar" : "en"}">
<head>
  <meta charset="utf-8"/>
  <title>${scopeLabel} — Lucerne Boutique</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #111; padding: 24px; background: #fff; }
    .top-bar { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 18px; border-bottom: 2px solid #111; }
    .brand { font-size: 24px; font-weight: 900; letter-spacing: -0.5px; }
    .brand-sub { font-size: 12px; color: #666; margin-top: 4px; }
    .stats { display: flex; gap: 16px; text-align: center; }
    .stat-box { background: #f3f4f6; border-radius: 8px; padding: 10px 16px; }
    .stat-num { font-size: 20px; font-weight: 800; }
    .stat-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
    .print-btn { background: #111; color: #fff; border: none; padding: 10px 28px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; margin-top: 4px; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 10px; }
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <div>
      <div class="brand">Lucerne Boutique</div>
      <div class="brand-sub">${scopeLabel}</div>
    </div>
    <div class="stats no-print">
      <div class="stat-box">
        <div class="stat-num">${baseList.length}</div>
        <div class="stat-label">${isAr ? "طلب" : "Orders"}</div>
      </div>
      <div class="stat-box">
        <div class="stat-num">₪${details
          .filter(Boolean)
          .reduce((s: number, d: any) => s + parseFloat(d.order.totalAmount), 0)
          .toFixed(0)}</div>
        <div class="stat-label">${isAr ? "الإجمالي" : "Total"}</div>
      </div>
    </div>
    <button class="print-btn no-print" onclick="window.print()">🖨️ ${isAr ? "طباعة" : "Print"}</button>
  </div>
  ${ordersHtml}
</body>
</html>`);
      win.document.close();
    } catch (e: any) {
      toast({
        title: isAr ? "فشل في إنشاء الطباعة" : "Print failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleViewDetails = (orderId: number) => {
    setSelectedOrderId(orderId);
    setShowDetails(true);
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast({
        title: `${t.profile.orderNumber} #${id} ${t.admin.orderMarkedAs} ${status}`,
      });
    } catch (err: any) {
      toast({
        title: t.admin.failedToUpdate,
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: number[]; status: string }) => {
      const res = await fetch("/api/orders/bulk-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids, status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: ({ updated }) => {
      queryClient.invalidateQueries({ queryKey: [api.orders.list.path] });
      toast({
        title: isAr
          ? `تم تحديث ${updated} طلب بنجاح`
          : `${updated} order(s) updated successfully`,
      });
      setSelectedIds(new Set());
    },
    onError: (err: any) => {
      toast({
        title: t.admin.failedToUpdate,
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleBulkUpdate = () => {
    if (selectedIds.size === 0) return;
    bulkUpdateMutation.mutate({
      ids: Array.from(selectedIds),
      status: bulkStatus,
    });
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: orders?.length || 0 };
    ACTION_STATUSES.forEach((s) => {
      counts[s] = orders?.filter((o) => o.status === s).length || 0;
    });
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders?.filter((o) => {
      if (statusFilter !== "All" && o.status !== statusFilter) return false;
      if (dateFilter) {
        const orderDate = o.createdAt
          ? format(new Date(o.createdAt), "yyyy-MM-dd")
          : "";
        if (!orderDate.includes(dateFilter)) return false;
      }
      const q = search.toLowerCase().replace(/^#/, "").trim();
      if (!q) return true;
      const isNumericQuery = /^\d+$/.test(q);
      const orderNumPadded = o.id.toString().padStart(6, "0");
      const orderIdRaw = o.id.toString();
      if (isNumericQuery) {
        return (
          orderNumPadded === q.padStart(6, "0") ||
          orderIdRaw === q ||
          (q.length >= 5 && (o.phone || "").startsWith(q))
        );
      }
      return (
        (o.fullName || "").toLowerCase().includes(q) ||
        (o.city || "").toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter, dateFilter]);

  const filteredIds = filteredOrders?.map((o) => o.id) || [];
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someSelected = filteredIds.some((id) => selectedIds.has(id));

  const selectedTotal = useMemo(() => {
    if (!orders || selectedIds.size === 0) return 0;
    return orders
      .filter((o) => selectedIds.has(o.id))
      .reduce((sum, o) => sum + parseFloat(o.totalAmount), 0);
  }, [orders, selectedIds]);

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
    lastClickedIndexRef.current = null;
  }

  const toggleSelect = useCallback(
    (id: number, index: number, shiftKey: boolean) => {
      if (shiftKey && lastClickedIndexRef.current !== null && filteredOrders) {
        const from = Math.min(lastClickedIndexRef.current, index);
        const to = Math.max(lastClickedIndexRef.current, index);
        const rangeIds = filteredOrders.slice(from, to + 1).map((o) => o.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((rid) => next.add(rid));
          return next;
        });
      } else {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
        lastClickedIndexRef.current = index;
      }
    },
    [filteredOrders],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedIds.size > 0) setSelectedIds(new Set());
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIds]);

  const getStatusBadge = (status: string) => {
    const cls =
      status === "Delivered"
        ? "bg-green-100 text-green-800"
        : status === "Cancelled"
          ? "bg-red-100 text-red-800"
          : status === "OnTheWay"
            ? "bg-blue-100 text-blue-800"
            : "bg-amber-100 text-amber-800";
    return (
      <span
        className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${cls}`}
      >
        {(t.orderStatus as any)?.[status] || status}
      </span>
    );
  };

  const statusTabColor = (s: StatusFilter) => {
    if (s === "Delivered")
      return statusFilter === s
        ? "bg-green-600 text-white border-green-600"
        : "border-border text-muted-foreground hover:border-green-400 hover:text-green-700";
    if (s === "Cancelled")
      return statusFilter === s
        ? "bg-red-600 text-white border-red-600"
        : "border-border text-muted-foreground hover:border-red-400 hover:text-red-700";
    if (s === "OnTheWay")
      return statusFilter === s
        ? "bg-blue-600 text-white border-blue-600"
        : "border-border text-muted-foreground hover:border-blue-400 hover:text-blue-700";
    if (s === "Pending")
      return statusFilter === s
        ? "bg-amber-500 text-white border-amber-500"
        : "border-border text-muted-foreground hover:border-amber-400 hover:text-amber-600";
    return statusFilter === s
      ? "bg-foreground text-background border-foreground"
      : "border-border text-muted-foreground hover:border-foreground";
  };

  const statusLabelAr: Record<string, string> = {
    Pending: "قيد الانتظار",
    OnTheWay: "في الطريق",
    Delivered: "تم التسليم",
    Cancelled: "ملغي",
  };

  // Collect all product images in current order for lightbox navigation
  const orderImages = useMemo(() => {
    if (!orderDetails) return [];
    return orderDetails.items
      .map((item) => item.product?.mainImage)
      .filter((url): url is string => Boolean(url));
  }, [orderDetails]);

  return (
    <AdminLayout>
      <AdminPageHeader
        title={t.admin.orders}
        description={t.admin.manageOrders}
        icon={ShoppingCart}
        iconGradient="from-blue-500 to-indigo-600"
        testId="text-orders-title"
      />

      {/* Status tabs */}
      <div className="flex overflow-x-auto scrollbar-hide gap-2 mb-5 pb-1 -mx-1 px-1">
        {STATUSES.map((s) => {
          const dotColor =
            s === "Pending"
              ? "bg-amber-400"
              : s === "OnTheWay"
                ? "bg-blue-500"
                : s === "Delivered"
                  ? "bg-emerald-500"
                  : s === "Cancelled"
                    ? "bg-rose-400"
                    : "";
          const isActive = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setSelectedIds(new Set());
                lastClickedIndexRef.current = null;
              }}
              className={`inline-flex flex-shrink-0 items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border transition-all rounded-full whitespace-nowrap ${statusTabColor(s)}`}
              data-testid={`filter-status-${s}`}
            >
              {dotColor && (
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isActive ? "bg-current opacity-60" : dotColor}`}
                />
              )}
              {s === "All"
                ? t.admin.allOrders || "الكل"
                : (t.orderStatus as any)?.[s] || s}
              <span
                className={`text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center ${isActive ? "bg-white/20" : "bg-secondary"}`}
              >
                {statusCounts[s] || 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + Date filters + Print */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.admin.searchOrders}
            className="border border-border bg-background ps-9 pe-8 py-2.5 text-sm rounded-lg outline-none focus:border-primary transition-colors w-full"
            data-testid="input-admin-search-orders"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="relative">
          <Calendar className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            onClick={(e) => {
              const el = e.currentTarget as HTMLInputElement & {
                showPicker?: () => void;
              };
              try {
                el.showPicker?.();
              } catch {}
            }}
            className="h-10 cursor-pointer border border-input bg-background ps-9 pe-8 text-sm rounded-md shadow-sm outline-none transition-colors hover:border-foreground/40 focus:border-foreground/60 focus:ring-2 focus:ring-foreground/10 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:end-0 [&::-webkit-calendar-picker-indicator]:top-0 [&::-webkit-calendar-picker-indicator]:bottom-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
            data-testid="input-admin-date-filter"
          />
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground z-10"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Print dropdown */}
        <div className="relative">
          {showPrintMenu && (
            <div className="fixed inset-0 z-40" onClick={() => setShowPrintMenu(false)} />
          )}
          <button
            onClick={() => setShowPrintMenu((v) => !v)}
            disabled={isPrinting}
            className={`inline-flex items-center gap-2 h-10 px-4 border rounded-lg text-sm font-semibold transition-all disabled:opacity-60 shadow-sm ${
              showPrintMenu
                ? "bg-foreground text-background border-foreground"
                : "bg-background border-input hover:border-foreground/40 hover:bg-muted/40"
            }`}
            data-testid="button-print-orders"
          >
            {isPrinting
              ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <Printer className="w-4 h-4" />
            }
            <span className="text-xs sm:text-sm">{isAr ? "طباعة" : "Print"}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showPrintMenu ? "rotate-180" : ""}`} />
          </button>

          {showPrintMenu && (
            <div className="absolute end-0 top-full mt-2 z-50 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden w-[min(16rem,calc(100vw-2rem))] animate-in fade-in-0 zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-4 pt-3 pb-2 border-b border-border">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                  {isAr ? "خيارات الطباعة" : "Print Options"}
                </p>
              </div>

              {/* Today */}
              <button
                onClick={() => handlePrint("today")}
                className="group flex items-center gap-3 w-full px-4 py-3 text-start hover:bg-muted/60 transition-colors"
                data-testid="print-today"
              >
                <span className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-950/50 border border-blue-100 dark:border-blue-900 flex items-center justify-center shrink-0 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/60 transition-colors">
                  <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{isAr ? "طلبات اليوم" : "Today's Orders"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{format(new Date(), "yyyy-MM-dd")}</p>
                </div>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-900 shrink-0">
                  {(orders || []).filter(o => o.createdAt && format(new Date(o.createdAt), "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")).length}
                </span>
              </button>

              {/* Filtered / current view */}
              <button
                onClick={() => handlePrint("filtered")}
                className="group flex items-center gap-3 w-full px-4 py-3 text-start hover:bg-muted/60 transition-colors border-t border-border/50"
                data-testid="print-filtered"
              >
                <span className="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-100 dark:border-amber-900 flex items-center justify-center shrink-0 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/60 transition-colors">
                  <Search className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{isAr ? "النتائج المعروضة" : "Current View"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{isAr ? "حسب الفلتر الحالي" : "Based on active filters"}</p>
                </div>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 rounded-full border border-amber-100 dark:border-amber-900 shrink-0">
                  {filteredOrders?.length ?? 0}
                </span>
              </button>

              {/* All orders */}
              <button
                onClick={() => handlePrint("all")}
                className="group flex items-center gap-3 w-full px-4 py-3 text-start hover:bg-muted/60 transition-colors border-t border-border/50"
                data-testid="print-all"
              >
                <span className="w-9 h-9 rounded-lg bg-secondary border border-border flex items-center justify-center shrink-0 group-hover:bg-muted transition-colors">
                  <FileText className="w-4 h-4 text-foreground/70" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{isAr ? "جميع الطلبات" : "All Orders"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{isAr ? "كل السجلات" : "Complete record"}</p>
                </div>
                <span className="text-[10px] font-bold text-foreground/60 bg-secondary px-1.5 py-0.5 rounded-full border border-border shrink-0">
                  {orders?.length ?? 0}
                </span>
              </button>

              {/* Footer hint */}
              <div className="px-4 py-2.5 bg-muted/30 border-t border-border">
                <p className="text-[10px] text-muted-foreground text-center">
                  {isAr ? "يفتح نافذة طباعة منفصلة" : "Opens a separate print window"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 bg-foreground text-background px-4 py-3 animate-in slide-in-from-top-2 duration-200"
          data-testid="bulk-action-bar"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 font-bold text-sm">
              <ListChecks className="w-4 h-4 shrink-0" />
              <span>
                {isAr
                  ? `${selectedIds.size} طلب محدد`
                  : `${selectedIds.size} selected`}
              </span>
            </div>
            <span className="h-4 w-px bg-background/20 shrink-0" />
            <span className="text-sm font-semibold text-background/80">
              ₪{selectedTotal.toFixed(2)}
            </span>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs text-background/60 whitespace-nowrap hidden sm:block">
              {isAr ? "تغيير إلى:" : "Set to:"}
            </label>
            <div className="relative">
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="appearance-none bg-background/15 border border-background/25 text-background text-xs px-3 py-1.5 rounded focus:outline-none focus:border-background/60 pe-6 cursor-pointer"
                data-testid="select-bulk-status"
              >
                {ACTION_STATUSES.map((s) => (
                  <option
                    key={s}
                    value={s}
                    className="text-foreground bg-background"
                  >
                    {isAr ? statusLabelAr[s] : s}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3 h-3 absolute end-1.5 top-1/2 -translate-y-1/2 text-background/50 pointer-events-none" />
            </div>
            <Button
              size="sm"
              onClick={handleBulkUpdate}
              disabled={bulkUpdateMutation.isPending}
              className="bg-background text-foreground hover:bg-background/90 text-xs h-7 px-4 font-bold"
              data-testid="button-bulk-update"
            >
              {bulkUpdateMutation.isPending
                ? isAr
                  ? "جاري..."
                  : "Updating…"
                : isAr
                  ? "تطبيق"
                  : "Apply"}
            </Button>
            <button
              onClick={() => {
                setSelectedIds(new Set());
                lastClickedIndexRef.current = null;
              }}
              className="flex items-center gap-1 text-xs text-background/60 hover:text-background transition-colors border border-background/20 hover:border-background/50 px-2.5 py-1.5 rounded"
              data-testid="button-clear-selection"
            >
              <X className="w-3 h-3" />
              {isAr ? "إلغاء" : "Clear"}
            </button>
          </div>
        </div>
      )}

      {selectedIds.size > 0 && (
        <p className="text-[11px] text-muted-foreground mb-3 -mt-2">
          {isAr
            ? "اضغط Shift + نقرة لتحديد نطاق · Esc للإلغاء"
            : "Shift+click to select a range · Esc to clear"}
        </p>
      )}

      {/* Desktop table */}
      <div className="hidden md:block bg-card border border-border overflow-hidden">
        <Table>
          <TableHeader className="bg-secondary/50">
            <TableRow>
              <TableHead className="w-12 ps-4">
                <SelectBox
                  checked={allFilteredSelected}
                  indeterminate={someSelected && !allFilteredSelected}
                  onChange={toggleSelectAll}
                  testId="button-select-all"
                />
              </TableHead>
              <TableHead>{t.admin.orderId}</TableHead>
              <TableHead>{t.admin.date}</TableHead>
              <TableHead>{t.admin.customer}</TableHead>
              <TableHead>{t.admin.amount}</TableHead>
              <TableHead>{t.admin.status}</TableHead>
              <TableHead>{t.admin.action}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8">
                  <div className="flex justify-center">
                    <div className="w-7 h-7 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredOrders?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center py-12 text-muted-foreground"
                >
                  {t.admin.noOrders || "لا توجد طلبات"}
                </TableCell>
              </TableRow>
            ) : (
              filteredOrders?.map((o, index) => {
                const isSelected = selectedIds.has(o.id);
                return (
                  <TableRow
                    key={o.id}
                    data-testid={`row-order-${o.id}`}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (
                        target.closest("select") ||
                        target.closest("button[data-detail]")
                      )
                        return;
                      toggleSelect(o.id, index, e.shiftKey);
                    }}
                    className={`cursor-pointer select-none transition-colors ${
                      isSelected
                        ? "bg-primary/8 border-s-[3px] border-s-primary"
                        : "hover:bg-muted/40 border-s-[3px] border-s-transparent"
                    }`}
                  >
                    <TableCell className="ps-4">
                      <SelectBox
                        checked={isSelected}
                        onChange={(e) => toggleSelect(o.id, index, e.shiftKey)}
                        testId={`checkbox-order-${o.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono font-medium text-sm">
                      #{o.id.toString().padStart(6, "0")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="block text-sm">
                        {o.createdAt
                          ? format(new Date(o.createdAt), "yyyy-MM-dd")
                          : "—"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {o.createdAt
                          ? format(new Date(o.createdAt), "h:mm aa")
                          : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{o.fullName}</p>
                      <p className="text-xs text-muted-foreground">{o.city}</p>
                    </TableCell>
                    <TableCell className="font-semibold">
                      ₪{parseFloat(o.totalAmount).toFixed(2)}
                    </TableCell>
                    <TableCell>{getStatusBadge(o.status)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={o.status}
                        onValueChange={(v) => handleStatusChange(o.id, v)}
                        disabled={updateStatus.isPending}
                      >
                        <SelectTrigger
                          className="h-8 w-[140px] text-xs"
                          data-testid={`select-order-status-${o.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACTION_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {(t.orderStatus as any)?.[s] || s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewDetails(o.id)}
                        data-detail="true"
                        data-testid={`button-view-order-${o.id}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile select-all bar */}
      {filteredOrders && filteredOrders.length > 0 && (
        <div className="md:hidden flex items-center gap-3 bg-secondary/50 border border-border px-3 py-2.5 mb-2">
          <SelectBox
            checked={allFilteredSelected}
            indeterminate={someSelected && !allFilteredSelected}
            onChange={toggleSelectAll}
            testId="button-select-all-mobile"
          />
          <span className="text-sm text-muted-foreground">
            {isAr ? "تحديد الكل" : "Select All"}
          </span>
          {someSelected && (
            <span className="ms-auto text-xs font-semibold text-primary">
              {selectedIds.size} {isAr ? "محدد" : "selected"}
            </span>
          )}
        </div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          <div className="py-8 flex justify-center">
            <div className="w-7 h-7 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
          </div>
        ) : filteredOrders?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t.admin.noOrders || "لا توجد طلبات"}
          </div>
        ) : (
          filteredOrders?.map((o, index) => {
            const isSelected = selectedIds.has(o.id);
            return (
              <div
                key={o.id}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (
                    target.closest("select") ||
                    target.closest("button[data-detail]")
                  )
                    return;
                  toggleSelect(o.id, index, e.shiftKey);
                }}
                className={`bg-card border p-4 space-y-3 transition-colors cursor-pointer select-none border-s-[3px] ${
                  isSelected
                    ? "border-s-primary bg-primary/5 border-border"
                    : "border-s-transparent border-border hover:bg-muted/30"
                }`}
                data-testid={`card-order-${o.id}`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <SelectBox
                      checked={isSelected}
                      onChange={(e) => toggleSelect(o.id, index, e.shiftKey)}
                      testId={`checkbox-order-mobile-${o.id}`}
                    />
                    <div>
                      <p className="font-mono font-semibold text-sm">
                        #{o.id.toString().padStart(6, "0")}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {o.createdAt
                          ? `${format(new Date(o.createdAt), "yyyy-MM-dd")} · ${format(new Date(o.createdAt), "h:mm aa")}`
                          : "—"}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(o.status)}
                </div>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">{o.fullName}</p>
                    <p className="text-xs text-muted-foreground">{o.city}</p>
                  </div>
                  <p className="font-bold text-base">
                    ₪{parseFloat(o.totalAmount).toFixed(2)}
                  </p>
                </div>
                <div
                  className="flex items-center gap-2 pt-2 border-t border-border"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Select
                    value={o.status}
                    onValueChange={(v) => handleStatusChange(o.id, v)}
                    disabled={updateStatus.isPending}
                  >
                    <SelectTrigger
                      className="h-9 flex-1 text-xs"
                      data-testid={`select-order-status-mobile-${o.id}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_STATUSES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {(t.orderStatus as any)?.[s] || s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleViewDetails(o.id)}
                    data-detail="true"
                    className="h-9 px-4 text-xs gap-1.5 rounded-lg font-medium"
                    data-testid={`button-view-order-mobile-${o.id}`}
                  >
                    <Eye className="w-3.5 h-3.5" /> {t.admin.action}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Order detail dialog */}
      <Dialog open={showDetails} onOpenChange={(open) => { setShowDetails(open); if (!open) setLightbox(null); }}>
        <DialogContent className="w-[calc(100%-1rem)] sm:max-w-2xl rounded-none max-h-[85svh] sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl sm:text-2xl font-mono">
              {t.profile.orderNumber} #
              {selectedOrderId?.toString().padStart(6, "0")}
            </DialogTitle>
          </DialogHeader>
          {orderDetails && (
            <div className="space-y-6 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t.admin.customerName}
                  </p>
                  <p className="font-medium">{orderDetails.order.fullName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {t.admin.phoneLabel}
                  </p>
                  <p className="font-medium">{orderDetails.order.phone}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">
                    {t.admin.deliveryAddress}
                  </p>
                  <p className="font-medium">
                    {orderDetails.order.address}, {orderDetails.order.city}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CreditCard className="w-3 h-3" />{" "}
                    {isAr ? "طريقة الدفع" : "Payment"}
                  </p>
                  <p className="font-medium">
                    {orderDetails.order.paymentMethod === "Exchange" ? (
                      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-semibold px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-700">
                        🔄 {isAr ? "استبدال" : "Exchange"}
                      </span>
                    ) : (
                      orderDetails.order.paymentMethod
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {isAr ? "تاريخ الطلب" : "Order date"}
                  </p>
                  <p className="font-medium">
                    {orderDetails.order.createdAt
                      ? format(
                          new Date(orderDetails.order.createdAt),
                          "yyyy-MM-dd · h:mm aa",
                        )
                      : "—"}
                  </p>
                </div>
                {orderDetails.order.notes && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      {t.admin.notesLabel}
                    </p>
                    <p className="font-medium">{orderDetails.order.notes}</p>
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">{t.admin.items}</h3>
                <div className="space-y-3">
                  {orderDetails.items.map((item, itemIdx) => (
                    <div
                      key={item.id}
                      className="flex gap-3 border border-border rounded-lg p-3 bg-muted/20"
                    >
                      {/* Clickable product image — clean lightbox, no dark overlay on thumbnail */}
                      <div className="flex-shrink-0">
                        {item.product?.mainImage ? (
                          <button
                            type="button"
                            onClick={() =>
                              setLightbox({
                                images: orderImages,
                                idx: orderImages.indexOf(
                                  item.product!.mainImage!,
                                ),
                              })
                            }
                            className="block w-20 h-24 overflow-hidden rounded-md border border-border focus:outline-none focus:ring-2 focus:ring-primary group relative"
                            title={isAr ? "عرض الصورة" : "View photo"}
                          >
                            <img
                              src={item.product.mainImage}
                              alt=""
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                            {/* Subtle zoom icon — light overlay only, no full black */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200 rounded-md flex items-end justify-end p-1.5">
                              <div className="bg-white/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <ZoomIn className="w-3 h-3 text-gray-800" />
                              </div>
                            </div>
                          </button>
                        ) : (
                          <div className="w-20 h-24 rounded-md border border-border bg-muted flex items-center justify-center">
                            <ShoppingCart className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Product details */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-sm leading-snug">
                                {item.product?.name || "—"}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-2 mt-1">
                                {item.product?.id && (
                                  <span className="font-mono text-[10px] text-muted-foreground">
                                    #{String(item.product.id).padStart(4, "0")}
                                  </span>
                                )}
                                {(item.product as any)?.barcode && (
                                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                                    <Barcode className="w-2.5 h-2.5 shrink-0" />
                                    {(item.product as any).barcode}
                                  </span>
                                )}
                              </div>
                            </div>
                            {item.product?.id && (
                              <a
                                href={`/product/${item.product.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                title={
                                  isAr ? "فتح صفحة المنتج" : "Open product page"
                                }
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="inline-flex items-center text-xs bg-secondary rounded px-2 py-0.5 font-medium">
                              {t.admin.qty}: {item.quantity}
                            </span>
                            {item.size && (
                              <span className="inline-flex items-center text-xs bg-secondary rounded px-2 py-0.5 font-medium">
                                {t.product.size}: {item.size}
                              </span>
                            )}
                            {item.color && (
                              <span className="inline-flex items-center text-xs bg-secondary rounded px-2 py-0.5 font-medium">
                                {t.product.color}: {item.color}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 text-sm">
                          {item.quantity > 1 && (
                            <p className="text-xs text-muted-foreground">
                              {isAr ? "سعر الوحدة" : "Unit price"}: ₪
                              {parseFloat(item.price).toFixed(2)}
                            </p>
                          )}
                          {orderDetails.order.paymentMethod === "Exchange" ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs line-through text-muted-foreground">
                                ₪
                                {(
                                  parseFloat(item.price) * item.quantity
                                ).toFixed(2)}
                              </span>
                              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                ₪0.00
                              </span>
                            </div>
                          ) : (
                            <p className="font-semibold">
                              ₪
                              {(parseFloat(item.price) * item.quantity).toFixed(
                                2,
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t pt-4 space-y-1.5 text-sm">
                {parseFloat(orderDetails.order.shippingCost || "0") > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{isAr ? "الشحن" : "Shipping"}</span>
                    <span>
                      ₪
                      {parseFloat(
                        orderDetails.order.shippingCost || "0",
                      ).toFixed(2)}
                    </span>
                  </div>
                )}
                {orderDetails.order.discountCode === "EXCHANGE" &&
                  orderDetails.order.discountAmount && (
                    <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                      <span>
                        {isAr ? "خصم الاستبدال" : "Exchange discount"}
                      </span>
                      <span>
                        −₪
                        {parseFloat(orderDetails.order.discountAmount).toFixed(
                          2,
                        )}
                      </span>
                    </div>
                  )}
                <div className="flex justify-between font-bold text-base">
                  <span>{t.admin.totalLabel}</span>
                  <span
                    className={
                      orderDetails.order.paymentMethod === "Exchange"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : ""
                    }
                  >
                    ₪{parseFloat(orderDetails.order.totalAmount).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="border-t pt-4">
                <label className="text-sm font-medium">
                  {t.admin.changeStatus}
                </label>
                <Select
                  value={orderDetails.order.status}
                  onValueChange={(v) =>
                    handleStatusChange(orderDetails.order.id, v)
                  }
                >
                  <SelectTrigger
                    className="w-full mt-2"
                    data-testid="select-order-status-detail"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {(t.orderStatus as any)?.[s] || s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Lightbox lives inside DialogContent so Radix doesn't block its events */}
          {lightbox && (
            <Lightbox
              images={lightbox.images}
              startIndex={Math.max(0, lightbox.idx)}
              onClose={() => setLightbox(null)}
              isAr={isAr}
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
