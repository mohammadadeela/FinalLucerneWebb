import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useCart, type CartItem } from "@/store/use-cart";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ArrowRight, ArrowLeft } from "lucide-react";
import { useLanguage } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import type { ColorVariant } from "@shared/schema";
import { translateColorName } from "@/lib/colorFamilies";
import { useSiteSettings } from "@/hooks/use-site-settings";

function getItemImage(item: CartItem): string {
  const { product, color } = item;
  const cv = (product.colorVariants as ColorVariant[] | undefined) || [];
  if (cv.length > 0 && color) {
    const variant = cv.find((v) => v.name === color);
    if (variant?.mainImage) return variant.mainImage;
  }
  return product.mainImage;
}

function getItemMaxStock(item: CartItem): number {
  const { product, color, size } = item;
  const cv = (product.colorVariants as ColorVariant[] | undefined) || [];
  if (cv.length > 0 && color) {
    const variant = cv.find((v) => v.name === color);
    if (variant && size && variant.sizeInventory && variant.sizeInventory[size] !== undefined) {
      return variant.sizeInventory[size];
    }
  }
  if (size && product.sizeInventory && (product.sizeInventory as Record<string, number>)[size] !== undefined) {
    return (product.sizeInventory as Record<string, number>)[size];
  }
  return product.stockQuantity ?? 0;
}

export default function Cart() {
  const { items, updateQuantity, removeFromCart, cartTotal } = useCart();
  const { data: siteSettings } = useSiteSettings();
  const loyaltyPointsEnabled = siteSettings?.loyalty_points_enabled !== "false";
  const [, setLocation] = useLocation();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  const [soldOutKeys, setSoldOutKeys] = useState<Set<string>>(new Set());
  const adjustedRef = useRef(false);

  const makeKey = (productId: number, size?: string | null, color?: string | null) =>
    `${productId}::${size || ""}::${color || ""}`;

  useEffect(() => {
    if (items.length === 0) return;
    if (adjustedRef.current) {
      adjustedRef.current = false;
      return;
    }
    const validateStock = async () => {
      try {
        const res = await fetch("/api/cart/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map(i => ({
              productId: i.product.id,
              quantity: i.quantity,
              size: i.size || null,
              color: i.color || null,
            })),
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.outOfStock && data.outOfStock.length > 0) {
          const keys = new Set<string>();
          const adjusted: any[] = [];
          for (const oos of data.outOfStock) {
            if (oos.reason === "insufficient_stock" && oos.available > 0) {
              updateQuantity(oos.productId, oos.available, oos.size || undefined, oos.color || undefined);
              adjusted.push(oos);
            } else {
              keys.add(makeKey(oos.productId, oos.size, oos.color));
            }
          }
          setSoldOutKeys(keys);
          if (adjusted.length > 0) {
            adjustedRef.current = true;
            const ar = language === "ar";
            toast({
              title: ar ? "تم تعديل الكمية" : "Quantity adjusted",
              description: adjusted.map((oos: any) =>
                ar
                  ? `${oos.name}${oos.size ? ` (${oos.size})` : ""}: متوفر ${oos.available} فقط`
                  : `${oos.name}${oos.size ? ` (${oos.size})` : ""}: only ${oos.available} available`
              ).join("\n"),
            });
          }
        } else {
          setSoldOutKeys(new Set());
        }
      } catch {}
    };
    validateStock();
  }, [items.map(i => `${i.product.id}:${i.size}:${i.color}:${i.quantity}`).join(",")]);

  const isItemSoldOut = (item: CartItem) => soldOutKeys.has(makeKey(item.product.id, item.size, item.color));
  const availableItems = items.filter(i => !isItemSoldOut(i));
  const availableTotal = availableItems.reduce((total, item) => {
    const price = item.product.discountPrice ? parseFloat(item.product.discountPrice) : parseFloat(item.product.price);
    return total + price * item.quantity;
  }, 0);
  const hasSoldOut = items.some(i => isItemSoldOut(i));

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col pt-navbar">
        <Navbar />
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <h1 className="font-display text-4xl mb-6" data-testid="text-cart-empty">{t.cart.empty}</h1>
          <p className="text-muted-foreground mb-8">{t.cart.emptyDesc}</p>
          <Link href="/shop">
            <Button className="rounded-md uppercase tracking-widest px-8 py-6" data-testid="button-continue-shopping">{t.cart.continueShopping}</Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="font-display text-3xl sm:text-4xl mb-8 sm:mb-12" data-testid="text-cart-title">{t.cart.title}</h1>

        {hasSoldOut && (
          <div className="border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-3 mb-6 flex items-center gap-2" data-testid="cart-sold-out-banner">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm text-red-700 dark:text-red-300">
              {language === "ar" ? "بعض المنتجات في سلتك نفدت من المخزون. يُرجى إزالتها للمتابعة." : "Some items in your cart are sold out. Please remove them to proceed."}
            </p>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2 space-y-8">
            <div className="hidden md:grid grid-cols-6 gap-4 border-b border-border pb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              <div className="col-span-3">{t.cart.productCol}</div>
              <div className="col-span-1 text-center">{t.cart.quantityCol}</div>
              <div className="col-span-1 text-end">{t.cart.totalCol}</div>
              <div className="col-span-1"></div>
            </div>
            
            <div className="space-y-6">
              {items.map((item, idx) => {
                const price = parseFloat(item.product.discountPrice?.toString() || item.product.price.toString());
                const maxStock = getItemMaxStock(item);
                const atMax = item.quantity >= maxStock;
                const soldOut = isItemSoldOut(item);
                return (
                  <div key={idx} className={`relative border-b border-border pb-6 md:pb-0 md:border-0 ${soldOut ? "opacity-60" : ""}`} data-testid={`cart-item-${idx}`}>
                    {soldOut && (
                      <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                        <div className="absolute inset-0 bg-background/40" />
                      </div>
                    )}
                    <div className="hidden md:grid md:grid-cols-6 gap-4 items-center">
                      <div className="col-span-3 flex items-center gap-6">
                        <div className="relative w-24 aspect-[3/4] bg-secondary flex-shrink-0">
                          <img src={getItemImage(item)} alt={item.product.name} className={`w-full h-full object-cover ${soldOut ? "grayscale" : ""}`} />
                          {soldOut && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <span className="text-white text-[10px] font-bold uppercase tracking-wider bg-red-600 px-2 py-0.5">{language === "ar" ? "نفذ" : "Sold Out"}</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <h3 className={`font-medium text-lg mb-1 ${soldOut ? "line-through text-muted-foreground" : ""}`}>
                            <Link href={`/product/${item.product.id}`} className="hover:underline">{item.product.name}</Link>
                          </h3>
                          <div className={`text-sm space-y-1 ${soldOut ? "text-muted-foreground/60 line-through" : "text-muted-foreground"}`}>
                            <p>₪{price.toFixed(2)}</p>
                            {item.size && <p>{t.cart.sizeLabel}: {item.size}</p>}
                            {item.color && <p>{t.cart.colorLabel}: {translateColorName(item.color, language === "ar" ? "ar" : "en")}</p>}
                          </div>
                          {soldOut && (
                            <p className="text-xs text-red-600 dark:text-red-400 font-semibold mt-1" data-testid={`text-sold-out-${idx}`}>
                              {language === "ar" ? "هذا المنتج نفد من المخزون" : "This product is sold out"}
                            </p>
                          )}
                          {!soldOut && atMax && <p className="text-xs text-orange-500 mt-1" data-testid={`text-max-stock-${idx}`}>{t.product.maxStockReached || `Max: ${maxStock}`}</p>}
                        </div>
                      </div>
                      <div className="col-span-1 flex justify-center">
                        {soldOut ? (
                          <span className="text-xs text-muted-foreground line-through">{item.quantity}</span>
                        ) : (
                          <div className="flex items-center border border-border h-10">
                            <button onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.size, item.color)} className="px-3 hover:bg-secondary" data-testid={`button-qty-minus-${idx}`}><Minus className="w-3 h-3" /></button>
                            <span className="w-8 text-center text-sm" data-testid={`text-qty-${idx}`}>{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.product.id, Math.min(item.quantity + 1, maxStock), item.size, item.color)}
                              disabled={atMax}
                              className="px-3 hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                              data-testid={`button-qty-plus-${idx}`}
                            ><Plus className="w-3 h-3" /></button>
                          </div>
                        )}
                      </div>
                      <div className={`col-span-1 text-end font-medium ${soldOut ? "line-through text-muted-foreground/60" : ""}`}>₪{(price * item.quantity).toFixed(2)}</div>
                      <div className="col-span-1 flex justify-center relative z-20">
                        <button onClick={() => removeFromCart(item.product.id, item.size, item.color)} className={`transition-colors p-2 ${soldOut ? "text-red-500 hover:text-red-700" : "text-muted-foreground hover:text-destructive"}`} data-testid={`button-remove-item-${idx}`}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex md:hidden gap-3">
                      <div className="relative w-20 aspect-[3/4] bg-secondary flex-shrink-0">
                        <img src={getItemImage(item)} alt={item.product.name} className={`w-full h-full object-cover ${soldOut ? "grayscale" : ""}`} />
                        {soldOut && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <span className="text-white text-[8px] font-bold uppercase bg-red-600 px-1.5 py-0.5">{language === "ar" ? "نفذ" : "Sold Out"}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-medium text-sm mb-1 truncate ${soldOut ? "line-through text-muted-foreground" : ""}`}>
                          <Link href={`/product/${item.product.id}`} className="hover:underline">{item.product.name}</Link>
                        </h3>
                        <div className={`text-xs space-y-0.5 mb-2 ${soldOut ? "text-muted-foreground/60 line-through" : "text-muted-foreground"}`}>
                          <p>₪{price.toFixed(2)}</p>
                          {item.size && <p>{t.cart.sizeLabel}: {item.size}</p>}
                          {item.color && <p>{t.cart.colorLabel}: {translateColorName(item.color, language === "ar" ? "ar" : "en")}</p>}
                        </div>
                        {soldOut ? (
                          <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{language === "ar" ? "هذا المنتج نفد من المخزون" : "This product is sold out"}</p>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col items-start gap-0.5">
                              <div className="flex items-center border border-border h-8">
                                <button onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.size, item.color)} className="px-2 hover:bg-secondary" data-testid={`button-qty-minus-mobile-${idx}`}><Minus className="w-3 h-3" /></button>
                                <span className="w-6 text-center text-xs" data-testid={`text-qty-mobile-${idx}`}>{item.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(item.product.id, Math.min(item.quantity + 1, maxStock), item.size, item.color)}
                                  disabled={atMax}
                                  className="px-2 hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                                  data-testid={`button-qty-plus-mobile-${idx}`}
                                ><Plus className="w-3 h-3" /></button>
                              </div>
                              {atMax && <span className="text-xs text-orange-500" data-testid={`text-max-stock-mobile-${idx}`}>{t.product.maxStockReached || `Max: ${maxStock}`}</span>}
                            </div>
                            <span className="font-medium text-sm">₪{(price * item.quantity).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                      <button onClick={() => removeFromCart(item.product.id, item.size, item.color)} className={`transition-colors p-1 self-start relative z-20 ${soldOut ? "text-red-500 hover:text-red-700" : "text-muted-foreground hover:text-destructive"}`} data-testid={`button-remove-item-mobile-${idx}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="col-span-1">
            <div className="bg-secondary p-6 sm:p-8 sticky top-28">
              <h2 className="font-display text-2xl mb-6 border-b border-border pb-4" data-testid="text-order-summary">{t.cart.orderSummary}</h2>
              
              <div className="space-y-4 mb-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.cart.subtotal}</span>
                  <span>₪{availableTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t.product.shipping}</span>
                  <span>{t.cart.shippingCalc}</span>
                </div>
              </div>
              
              <div className="border-t border-border pt-4 mb-4 flex justify-between items-center text-lg font-medium">
                <span>{t.cart.total}</span>
                <span data-testid="text-cart-total">₪{availableTotal.toFixed(2)}</span>
              </div>

              {loyaltyPointsEnabled && availableTotal > 0 && Math.floor(availableTotal / 2) > 0 && (
                <div
                  className="mb-6 relative overflow-hidden rounded-xl p-3.5 bg-gradient-to-r from-amber-500 via-rose-500 to-pink-600 text-white shadow-md"
                  data-testid="text-cart-points-preview"
                >
                  <div className="absolute -top-6 -end-6 w-20 h-20 rounded-full bg-white/15 blur-xl pointer-events-none" />
                  <div className="relative flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                      <span className="text-base">✨</span>
                    </div>
                    <div className="flex-1 leading-snug">
                      <p className="text-sm font-bold">
                        {language === "ar"
                          ? `ستحصلين على ${Math.floor(availableTotal / 2)} نقطة إضافية عند تسليم طلبك!`
                          : `You'll earn ${Math.floor(availableTotal / 2)} extra points when your order is delivered!`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {hasSoldOut && (
                <p className="text-xs text-red-600 dark:text-red-400 mb-3 text-center">
                  {language === "ar" ? "أزيلي المنتجات النافدة للمتابعة" : "Remove sold out items to proceed"}
                </p>
              )}
              
              <Button 
                onClick={() => setLocation("/checkout")}
                className="w-full rounded-md py-6 uppercase tracking-widest text-sm font-semibold"
                disabled={hasSoldOut || availableItems.length === 0}
                data-testid="button-proceed-checkout"
              >
                {t.cart.proceedToCheckout} <Arrow className="w-4 h-4 ms-2" />
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />

    </div>
  );
}
