import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import { useLocation } from "wouter";
import { ArrowLeftRight, Loader2 } from "lucide-react";
import type { Product, ColorVariant } from "@shared/schema";

export function ExchangeRequestDialog({
  open, onOpenChange, orderId, item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: number | null;
  item: { id: number; productId: number; productName?: string; size?: string | null; color?: string | null; image?: string | null } | null;
}) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [reason, setReason] = useState("");
  const [preferredSize, setPreferredSize] = useState("");
  const [preferredColor, setPreferredColor] = useState("");

  const { data: product, isLoading: productLoading } = useQuery<Product>({
    queryKey: ["/api/products", item?.productId],
    enabled: !!item?.productId && open,
  });

  // Reset selections whenever a new item opens
  useEffect(() => {
    if (open) {
      setReason("");
      setPreferredSize("");
      setPreferredColor("");
    }
  }, [open, item?.id]);

  // Build available sizes list (in-stock only), considering color variants when present
  const availableSizes = useMemo<string[]>(() => {
    if (!product) return [];
    const variants = (product.colorVariants ?? []) as ColorVariant[];
    if (variants.length > 0) {
      // If a color is chosen, restrict to that variant's stock
      if (preferredColor) {
        const v = variants.find(x => x.name === preferredColor);
        if (!v) return [];
        return (v.sizes ?? []).filter(s => (v.sizeInventory?.[s] ?? 0) > 0);
      }
      // Otherwise, union of in-stock sizes across variants
      const set = new Set<string>();
      for (const v of variants) {
        for (const s of v.sizes ?? []) {
          if ((v.sizeInventory?.[s] ?? 0) > 0) set.add(s);
        }
      }
      return Array.from(set);
    }
    const sizes = (product.sizes ?? []) as string[];
    const inv = (product.sizeInventory ?? {}) as Record<string, number>;
    return sizes.filter(s => (inv[s] ?? 0) > 0);
  }, [product, preferredColor]);

  const availableColors = useMemo<string[]>(() => {
    if (!product) return [];
    const variants = (product.colorVariants ?? []) as ColorVariant[];
    if (variants.length > 0) {
      // Only colors with at least one in-stock size
      return variants
        .filter(v => (v.sizes ?? []).some(s => (v.sizeInventory?.[s] ?? 0) > 0))
        .map(v => v.name);
    }
    return ((product.colors ?? []) as string[]).filter(Boolean);
  }, [product]);

  // When color changes, reset size only if it's genuinely gone from stock for the new color
  // (don't silently wipe — keep the value so the user sees it and gets a clear warning instead)
  const selectedSizeValid = !preferredSize || availableSizes.includes(preferredSize);

  const submit = useMutation({
    mutationFn: async () => {
      if (!orderId || !item) throw new Error("missing");
      const res = await apiRequest("POST", "/api/exchange-requests", {
        orderId,
        orderItemId: item.id,
        productId: item.productId,
        reason: reason.trim(),
        preferredSize: preferredSize || null,
        preferredColor: preferredColor || null,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/exchange-requests"] });
      toast({
        title: ar ? "تم إرسال طلب الاستبدال" : "Exchange request sent",
        description: ar ? "اضغطي لعرض طلباتك" : "Tap to view your orders",
        icon: "exchange",
        onClick: () => navigate("/profile?tab=exchanges&subtab=submitted"),
      } as any);
      setReason(""); setPreferredSize(""); setPreferredColor("");
      onOpenChange(false);
    },
    onError: (e: any) => {
      const msg = String(e.message || "");
      const known: Record<string, [string, string]> = {
        exchanges_disabled: ["خدمة الاستبدال غير متاحة حالياً", "Exchange service is currently disabled"],
        order_not_delivered: ["الطلب لم يُستلم بعد", "Order has not been delivered yet"],
        exchange_window_expired: ["انتهت مهلة الـ 3 أيام للاستبدال", "The 3-day exchange window has expired"],
        dresses_not_exchangeable: ["هذا التصنيف غير قابل للاستبدال", "This category is not exchangeable"],
        category_not_exchangeable: ["هذا التصنيف غير قابل للاستبدال", "This category is not exchangeable"],
        size_not_available: ["المقاس المطلوب غير متوفر حالياً", "The requested size is not currently in stock"],
        color_not_available: ["اللون المطلوب غير متوفر", "The requested color is not available"],
        exchange_already_requested: ["سبق تقديم طلب استبدال لهذا المنتج", "An exchange request was already submitted for this item"],
      };
      qc.invalidateQueries({ queryKey: ["/api/exchange-requests"] });
      const matched = Object.entries(known).find(([k]) => msg.includes(k));
      toast({
        title: ar ? "تعذّر إرسال الطلب" : "Could not submit",
        description: matched ? (ar ? matched[1][0] : matched[1][1]) : msg,
        variant: "destructive",
      });
    },
  });

  const noSizesAvailable = !productLoading && availableSizes.length === 0;
  const sizeRequired = availableSizes.length > 0;
  const sizeColorMismatch = !!preferredSize && !!preferredColor && !selectedSizeValid;
  const canSubmit =
    reason.trim().length >= 3 &&
    !!preferredSize &&
    selectedSizeValid &&
    (availableColors.length === 0 || !!preferredColor);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl max-h-[90vh] overflow-y-auto p-4 sm:p-6" data-testid="dialog-exchange-request">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5" />
            {ar ? "طلب استبدال" : "Request Exchange"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {ar
              ? "اختاري مقاساً متوفراً للاستبدال. يمكن الاستبدال خلال 3 أيام من الاستلام، وقد تستثني الإدارة بعض التصنيفات."
              : "Pick an available size to exchange for. Accepted within 3 days of delivery; some categories may be excluded by admin."}
          </DialogDescription>
        </DialogHeader>

        {item && (
          <div className="flex gap-3 items-center bg-muted/40 p-3 rounded-lg" data-testid="info-exchange-item">
            {item.image && <img src={item.image} alt="" className="w-12 h-16 object-cover rounded" />}
            <div className="text-sm">
              <p className="font-medium">{item.productName}</p>
              <p className="text-xs text-muted-foreground">
                {item.size && <>{ar ? "المقاس الحالي" : "Current size"}: {item.size} </>}
                {item.color && <>· {ar ? "اللون" : "Color"}: {item.color}</>}
              </p>
            </div>
          </div>
        )}

        {reason.trim().length < 3 && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            {ar
              ? "⚠ يجب كتابة سبب الاستبدال أولاً (3 أحرف على الأقل) حتى يتم تفعيل زر الإرسال."
              : "⚠ You must write a reason first (at least 3 characters) before the Submit button becomes active."}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor="ex-reason" className="text-xs font-semibold">{ar ? "سبب الاستبدال *" : "Reason for exchange *"}</Label>
            <Textarea
              id="ex-reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder={ar ? "مثلاً: المقاس صغير، اللون مختلف عن الصورة..." : "e.g. Wrong size, color differs from picture..."}
              className={`mt-1 ${reason.length > 0 && reason.trim().length < 3 ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
              data-testid="textarea-exchange-reason"
            />
            <div className="flex justify-between items-center mt-1">
              {reason.length > 0 && reason.trim().length < 3 ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  {ar ? "يرجى كتابة 3 أحرف على الأقل" : "Please write at least 3 characters"}
                </p>
              ) : (
                <span />
              )}
              <span className={`text-xs ms-auto ${reason.trim().length >= 3 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {reason.trim().length} {ar ? "/ 3 حد أدنى" : "/ 3 min"}
              </span>
            </div>
          </div>

          {productLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
              <Loader2 className="w-4 h-4 animate-spin" />
              {ar ? "جارٍ تحميل المقاسات المتوفرة..." : "Loading available sizes..."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {availableColors.length > 0 && (
                <div>
                  <Label className="text-xs">{ar ? "اللون البديل *" : "Preferred Color *"}</Label>
                  <Select value={preferredColor} onValueChange={setPreferredColor}>
                    <SelectTrigger className="mt-1" data-testid="select-preferred-color">
                      <SelectValue placeholder={ar ? "اختاري اللون" : "Choose color"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableColors.map(c => (
                        <SelectItem key={c} value={c} data-testid={`option-color-${c}`}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className={availableColors.length > 0 ? "" : "sm:col-span-2"}>
                <Label className="text-xs">{ar ? "المقاس البديل *" : "Preferred Size *"}</Label>
                <Select
                  value={preferredSize}
                  onValueChange={setPreferredSize}
                  disabled={!sizeRequired}
                >
                  <SelectTrigger className="mt-1" data-testid="select-preferred-size">
                    <SelectValue placeholder={
                      noSizesAvailable
                        ? (ar ? "لا توجد مقاسات متوفرة" : "No sizes available")
                        : (ar ? "اختاري المقاس" : "Choose size")
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSizes.map(s => (
                      <SelectItem key={s} value={s} data-testid={`option-size-${s}`}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {noSizesAvailable && (
            <p className="text-xs text-rose-600 dark:text-rose-400">
              {ar
                ? "عذراً، لا توجد مقاسات متوفرة حالياً لهذا المنتج للاستبدال."
                : "Sorry, no sizes are currently in stock for this product to exchange."}
            </p>
          )}
          {sizeColorMismatch && (
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              {ar
                ? `المقاس "${preferredSize}" غير متوفر باللون "${preferredColor}"، الرجاء اختيار مقاس متوفر.`
                : `Size "${preferredSize}" is not available in "${preferredColor}". Please pick an available size.`}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-exchange" className="w-full sm:w-auto">
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !canSubmit}
            data-testid="button-submit-exchange"
            className="w-full sm:w-auto"
          >
            {submit.isPending && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
            {ar ? "إرسال الطلب" : "Submit Request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
