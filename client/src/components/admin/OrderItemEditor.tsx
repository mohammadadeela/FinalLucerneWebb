import { useEffect, useMemo, useState } from "react";
import { useProducts } from "@/hooks/use-products";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Minus, Plus, ArrowLeft, ArrowRight, Loader2, Package, Check } from "lucide-react";
import { optimizeCloudinaryUrl, sortSizes } from "@/lib/utils";
import type { Product, ColorVariant } from "@shared/schema";

export interface OrderItemSelection {
  productId: number;
  quantity: number;
  size: string | null;
  color: string | null;
}

interface OrderItemEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "add" appends a new line item; "replace" swaps an existing one's product/color/size/qty. */
  mode: "add" | "replace";
  /** Pre-fills the picker when replacing an existing item. */
  initial?: { productId?: number; color?: string | null; size?: string | null; quantity?: number };
  onConfirm: (selection: OrderItemSelection) => void | Promise<void>;
  isSubmitting?: boolean;
  language: "ar" | "en";
}

/**
 * Admin-only picker used from the order detail modal to either add a new
 * product to an order or replace an existing line item's product/color/
 * size/quantity. Two steps: search & pick a product, then choose its color
 * and size (only the options that product actually has) and a quantity.
 */
export function OrderItemEditor({
  open,
  onOpenChange,
  mode,
  initial,
  onConfirm,
  isSubmitting,
  language,
}: OrderItemEditorProps) {
  const ar = language === "ar";
  const { data: products = [], isLoading: productsLoading } = useProducts();

  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  // Reset / pre-fill whenever the dialog is (re)opened.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedColor(initial?.color ?? null);
    setSelectedSize(initial?.size ?? null);
    setQuantity(initial?.quantity ?? 1);
    if (initial?.productId && products.length > 0) {
      const found = products.find((p: any) => p.id === initial.productId) || null;
      setSelectedProduct(found as Product | null);
    } else {
      setSelectedProduct(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.productId, products.length]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products as any[];
    return (products as any[]).filter((p) => {
      const name = (p.name || "").toLowerCase();
      const barcode = (p.barcode || "").toLowerCase();
      const id = String(p.id ?? "");
      return name.includes(q) || barcode.includes(q) || id.includes(q);
    });
  }, [products, search]);

  const colorVariants = ((selectedProduct as any)?.colorVariants || []) as ColorVariant[];
  const hasColors = colorVariants.length > 0;
  const activeVariant = hasColors ? colorVariants.find((v) => v.name === selectedColor) : undefined;

  const availableSizes = useMemo(() => {
    if (!selectedProduct) return [];
    if (hasColors) {
      const inv = activeVariant?.sizeInventory || {};
      return sortSizes(Object.keys(inv));
    }
    const inv = ((selectedProduct as any).sizeInventory || {}) as Record<string, number>;
    if (Object.keys(inv).length > 0) return sortSizes(Object.keys(inv));
    return sortSizes(((selectedProduct as any).sizes || []) as string[]);
  }, [selectedProduct, hasColors, activeVariant]);

  const stockForSelection = useMemo(() => {
    if (!selectedProduct) return null;
    if (hasColors) {
      if (!activeVariant) return null;
      if (selectedSize) return activeVariant.sizeInventory?.[selectedSize] ?? 0;
      return Object.values(activeVariant.sizeInventory || {}).reduce((s, q) => s + (q as number), 0);
    }
    const inv = ((selectedProduct as any).sizeInventory || {}) as Record<string, number>;
    if (selectedSize && inv[selectedSize] !== undefined) return inv[selectedSize];
    return (selectedProduct as any).stockQuantity ?? null;
  }, [selectedProduct, hasColors, activeVariant, selectedSize]);

  const canConfirm =
    !!selectedProduct &&
    (!hasColors || !!selectedColor) &&
    (availableSizes.length === 0 || !!selectedSize);

  const handlePickProduct = (p: Product) => {
    setSelectedProduct(p);
    const cv = ((p as any).colorVariants || []) as ColorVariant[];
    setSelectedColor(cv.length > 0 ? cv[0].name : null);
    setSelectedSize(null);
  };

  const handleConfirm = () => {
    if (!selectedProduct || !canConfirm) return;
    onConfirm({
      productId: selectedProduct.id,
      quantity,
      size: selectedSize,
      color: hasColors ? selectedColor : null,
    });
  };

  const title =
    mode === "add"
      ? ar ? "إضافة منتج للطلب" : "Add product to order"
      : ar ? "استبدال المنتج" : "Replace product";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 gap-0" data-testid="dialog-order-item-editor">
        <DialogHeader className="p-4 border-b border-border">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {!selectedProduct ? (
          <>
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={ar ? "ابحث بالاسم أو الباركود..." : "Search by name or barcode..."}
                  className="ps-9"
                  data-testid="input-order-item-search"
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-2">
              {productsLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : filteredProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">
                  {ar ? "لا توجد نتائج" : "No results"}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredProducts.map((p: any) => {
                    const price = p.discountPrice ? parseFloat(p.discountPrice) : parseFloat(p.price);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePickProduct(p)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors text-start"
                        data-testid={`button-pick-product-${p.id}`}
                      >
                        {p.mainImage ? (
                          <img
                            src={optimizeCloudinaryUrl(p.mainImage, 80)}
                            alt=""
                            className="w-10 h-12 object-cover rounded-md border border-border flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-12 rounded-md border border-border bg-muted flex items-center justify-center flex-shrink-0">
                            <Package className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground ltr-num">₪{price.toFixed(2)}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="overflow-y-auto flex-1 p-4 space-y-5">
            {/* Selected product header */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                title={ar ? "تغيير المنتج" : "Change product"}
                data-testid="button-change-product"
              >
                {ar ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
              </button>
              {selectedProduct.mainImage ? (
                <img
                  src={optimizeCloudinaryUrl(
                    hasColors && activeVariant?.mainImage ? activeVariant.mainImage : selectedProduct.mainImage,
                    80,
                  )}
                  alt=""
                  className="w-12 h-14 object-cover rounded-md border border-border flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-14 rounded-md border border-border bg-muted flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{selectedProduct.name}</p>
                <p className="text-xs text-muted-foreground ltr-num">
                  ₪{(selectedProduct.discountPrice ? parseFloat(selectedProduct.discountPrice) : parseFloat(selectedProduct.price)).toFixed(2)}
                </p>
              </div>
            </div>

            {/* Colors */}
            {hasColors && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  {ar ? "اللون" : "Color"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {colorVariants.map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => { setSelectedColor(v.name); setSelectedSize(null); }}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                        selectedColor === v.name
                          ? "border-foreground bg-foreground text-background"
                          : "border-border hover:border-foreground/40"
                      }`}
                      data-testid={`button-color-${v.name}`}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-border/50 flex-shrink-0"
                        style={{ backgroundColor: v.colorCode || "#ccc" }}
                      />
                      {v.name}
                      {selectedColor === v.name && <Check className="w-3 h-3" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sizes */}
            {availableSizes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  {ar ? "المقاس" : "Size"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableSizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSelectedSize(s)}
                      className={`min-w-[2.5rem] px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                        selectedSize === s
                          ? "border-foreground bg-foreground text-background"
                          : "border-border hover:border-foreground/40"
                      }`}
                      data-testid={`button-size-${s}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                {ar ? "الكمية" : "Quantity"}
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors"
                  data-testid="button-quantity-decrease"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center text-sm font-semibold ltr-num" data-testid="text-quantity">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => (stockForSelection !== null ? Math.min(stockForSelection, q + 1) : q + 1))}
                  className="w-8 h-8 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
                  disabled={stockForSelection !== null && quantity >= stockForSelection}
                  data-testid="button-quantity-increase"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                {stockForSelection !== null && (
                  <span className="text-xs text-muted-foreground ltr-num">
                    {ar ? `المتوفر: ${stockForSelection}` : `In stock: ${stockForSelection}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedProduct && (
          <div className="p-3 border-t border-border flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-order-item"
            >
              {ar ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              className="flex-1"
              disabled={!canConfirm || isSubmitting}
              onClick={handleConfirm}
              data-testid="button-confirm-order-item"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : mode === "add" ? (
                ar ? "إضافة" : "Add"
              ) : ar ? "استبدال" : "Replace"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
