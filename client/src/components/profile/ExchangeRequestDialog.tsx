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
import { ArrowLeftRight, Check, Loader2 } from "lucide-react";
import type { Product, ColorVariant } from "@shared/schema";

export type ExchangeItemType = {
  id: number;
  productId: number;
  productName?: string;
  size?: string | null;
  color?: string | null;
  image?: string | null;
};

type ItemSelection = {
  size: string;
  color: string;
  valid: boolean;
};

// ── Per-item size/color picker ─────────────────────────────────────────────
function ItemSizePicker({
  productId,
  selection,
  onChange,
  ar,
}: {
  productId: number;
  selection: ItemSelection;
  onChange: (s: ItemSelection) => void;
  ar: boolean;
}) {
  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["/api/products", productId],
  });

  const availableSizes = useMemo<string[]>(() => {
    if (!product) return [];
    const variants = (product.colorVariants ?? []) as ColorVariant[];
    if (variants.length > 0) {
      if (selection.color) {
        const v = variants.find((x) => x.name === selection.color);
        if (!v) return [];
        return (v.sizes ?? []).filter((s) => (v.sizeInventory?.[s] ?? 0) > 0);
      }
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
    return sizes.filter((s) => (inv[s] ?? 0) > 0);
  }, [product, selection.color]);

  const availableColors = useMemo<string[]>(() => {
    if (!product) return [];
    const variants = (product.colorVariants ?? []) as ColorVariant[];
    if (variants.length > 0) {
      return variants
        .filter((v) => (v.sizes ?? []).some((s) => (v.sizeInventory?.[s] ?? 0) > 0))
        .map((v) => v.name);
    }
    return ((product.colors ?? []) as string[]).filter(Boolean);
  }, [product]);

  const noSizes = !isLoading && availableSizes.length === 0;
  const sizeValid = !!selection.size && availableSizes.includes(selection.size);
  const colorRequired = availableColors.length > 0;
  const isValid = !!selection.size && sizeValid && (!colorRequired || !!selection.color);

  // Notify parent whenever validity changes
  useEffect(() => {
    onChange({ ...selection, valid: isValid });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, selection.size, selection.color]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2 ps-1">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {ar ? "جارٍ تحميل المقاسات..." : "Loading sizes..."}
      </div>
    );
  }

  if (noSizes) {
    return (
      <p className="text-xs text-rose-600 dark:text-rose-400 ps-1 py-1">
        {ar ? "لا توجد مقاسات متوفرة حالياً لهذا المنتج." : "No sizes currently in stock for this item."}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 mt-2 ps-1">
      {colorRequired && (
        <div>
          <Label className="text-[11px] text-muted-foreground">{ar ? "اللون البديل *" : "Color *"}</Label>
          <Select
            value={selection.color}
            onValueChange={(v) => onChange({ ...selection, color: v, size: "", valid: false })}
          >
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue placeholder={ar ? "اختاري" : "Choose"} />
            </SelectTrigger>
            <SelectContent>
              {availableColors.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className={colorRequired ? "" : "col-span-2"}>
        <Label className="text-[11px] text-muted-foreground">{ar ? "المقاس البديل *" : "Size *"}</Label>
        <Select
          value={selection.size}
          onValueChange={(v) => onChange({ ...selection, size: v, valid: false })}
        >
          <SelectTrigger className="mt-1 h-8 text-xs">
            <SelectValue placeholder={ar ? "اختاري" : "Choose"} />
          </SelectTrigger>
          <SelectContent>
            {availableSizes.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selection.size && !sizeValid && (
        <p className="col-span-2 text-[11px] text-amber-600 dark:text-amber-400">
          {ar
            ? `المقاس "${selection.size}" غير متوفر باللون المختار.`
            : `Size "${selection.size}" is not available in the chosen color.`}
        </p>
      )}
    </div>
  );
}

// ── Main dialog ────────────────────────────────────────────────────────────
export function ExchangeRequestDialog({
  open,
  onOpenChange,
  orderId,
  items,
  initialItemId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: number | null;
  items: ExchangeItemType[];
  initialItemId?: number | null;
}) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const safeItems = items ?? [];
  const itemsKey = safeItems.map((i) => i.id).join(",");

  const [reason, setReason] = useState("");
  // null = not selected; ItemSelection = selected
  const [selections, setSelections] = useState<Record<number, ItemSelection | null>>({});

  // Reset whenever the dialog opens
  useEffect(() => {
    if (open) {
      setReason("");
      const init: Record<number, ItemSelection | null> = {};
      for (const item of safeItems) {
        init[item.id] = item.id === initialItemId ? { size: "", color: "", valid: false } : null;
      }
      setSelections(init);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialItemId, itemsKey]);

  const toggleItem = (id: number) => {
    setSelections((prev) => ({
      ...prev,
      [id]: prev[id] == null ? { size: "", color: "", valid: false } : null,
    }));
  };

  const updateSelection = (id: number, sel: ItemSelection) => {
    setSelections((prev) => ({ ...prev, [id]: sel }));
  };

  const selectedItems = safeItems.filter((i) => selections[i.id] != null);
  const reasonOk = reason.trim().length >= 3;
  const allSelectionsValid = selectedItems.every((i) => selections[i.id]?.valid);
  const canSubmit = reasonOk && selectedItems.length > 0 && allSelectionsValid;

  const submit = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error("missing");
      for (const item of selectedItems) {
        const sel = selections[item.id]!;
        const res = await apiRequest("POST", "/api/exchange-requests", {
          orderId,
          orderItemId: item.id,
          productId: item.productId,
          reason: reason.trim(),
          preferredSize: sel.size || null,
          preferredColor: sel.color || null,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.message || "error");
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/exchange-requests"] });
      const count = selectedItems.length;
      toast({
        title: ar
          ? count > 1 ? `تم إرسال ${count} طلبات استبدال` : "تم إرسال طلب الاستبدال"
          : count > 1 ? `${count} exchange requests sent` : "Exchange request sent",
      });
      onOpenChange(false);
      navigate("/profile?tab=exchanges&subtab=submitted");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] max-w-md rounded-xl max-h-[90vh] overflow-y-auto p-4 sm:p-6"
        data-testid="dialog-exchange-request"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5" />
            {ar ? "طلب استبدال" : "Request Exchange"}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {ar
              ? "اختاري المنتجات التي تريدين استبدالها وحددي المقاس المطلوب لكل منتج. يمكن الاستبدال خلال 3 أيام من الاستلام."
              : "Select the items you want to exchange and choose a preferred size for each. Exchange is accepted within 3 days of delivery."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Shared reason */}
          <div>
            <Label htmlFor="ex-reason" className="text-xs font-semibold">
              {ar ? "سبب الاستبدال *" : "Reason for exchange *"}
            </Label>
            <Textarea
              id="ex-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={ar
                ? "مثلاً: المقاس صغير، اللون مختلف عن الصورة..."
                : "e.g. Wrong size, color differs from picture..."}
              className={`mt-1 ${reason.length > 0 && !reasonOk ? "border-amber-400 focus-visible:ring-amber-400" : ""}`}
              data-testid="textarea-exchange-reason"
            />
            {reason.length > 0 && !reasonOk && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                {ar ? "يرجى كتابة 3 أحرف على الأقل" : "Please write at least 3 characters"}
              </p>
            )}
          </div>

          {/* Items list */}
          <div>
            <p className="text-xs font-semibold mb-2">
              {ar
                ? safeItems.length > 1
                  ? "اختاري المنتجات للاستبدال (يمكن اختيار أكثر من منتج):"
                  : "المنتج للاستبدال:"
                : safeItems.length > 1
                  ? "Select items to exchange (you can pick multiple):"
                  : "Item to exchange:"}
            </p>
            <div className="space-y-2">
              {safeItems.map((item) => {
                const isSelected = selections[item.id] != null;
                return (
                  <div
                    key={item.id}
                    className={`border rounded-xl transition-all ${
                      isSelected
                        ? "border-pink-400 dark:border-pink-600 bg-pink-50/60 dark:bg-pink-900/20"
                        : "border-border bg-muted/20"
                    }`}
                    data-testid={`exchange-item-row-${item.id}`}
                  >
                    {/* Item header row — clickable to toggle */}
                    <button
                      type="button"
                      onClick={() => toggleItem(item.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-start"
                      data-testid={`button-toggle-exchange-item-${item.id}`}
                    >
                      {/* Checkbox */}
                      <span
                        className={`w-5 h-5 flex-shrink-0 rounded border-2 flex items-center justify-center transition-all ${
                          isSelected
                            ? "bg-pink-500 border-pink-500 text-white"
                            : "border-border bg-background"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </span>
                      {/* Image */}
                      {item.image && (
                        <img src={item.image} alt="" className="w-10 h-12 object-cover rounded flex-shrink-0" />
                      )}
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {item.size && (
                            <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                              {ar ? "مقاس" : "Size"}: {item.size}
                            </span>
                          )}
                          {item.color && (
                            <span className="text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-medium">
                              {ar ? "لون" : "Color"}: {item.color}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Size/color picker — shown only when item is selected */}
                    {isSelected && (
                      <div className="px-3 pb-3">
                        <ItemSizePicker
                          productId={item.productId}
                          selection={selections[item.id]!}
                          onChange={(sel) => updateSelection(item.id, sel)}
                          ar={ar}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Helper hints */}
          {selectedItems.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center py-1">
              {ar ? "⚠ الرجاء اختيار منتج واحد على الأقل للاستبدال." : "⚠ Please select at least one item to exchange."}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-exchange"
            className="w-full sm:w-auto"
          >
            {ar ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || !canSubmit}
            data-testid="button-submit-exchange"
            className="w-full sm:w-auto"
          >
            {submit.isPending && <Loader2 className="w-4 h-4 me-2 animate-spin" />}
            {selectedItems.length > 1
              ? ar
                ? `إرسال ${selectedItems.length} طلبات`
                : `Submit ${selectedItems.length} Requests`
              : ar
                ? "إرسال الطلب"
                : "Submit Request"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
