import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useCart, type CartItem } from "@/store/use-cart";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ArrowRight, ArrowLeft, ShoppingBag } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckoutSteps } from "@/components/checkout/CheckoutSteps";
import { LucerneCoin } from "@/components/ui/lucerne-coin";
import { useLanguage } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import type { ColorVariant } from "@shared/schema";
import { translateColorName } from "@/lib/colorFamilies";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { optimizeCloudinaryUrl, blurCloudinaryUrl } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

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

function CartItemImage({ item, soldOut, sizeClass, labelSize, language }: {
  item: CartItem;
  soldOut: boolean;
  sizeClass: string;
  labelSize: string;
  language: string;
}) {
  const [imageReady, setImageReady] = useState(false);
  const imgUrl = getItemImage(item);
  const optimizedSrc = optimizeCloudinaryUrl(imgUrl, 300) || imgUrl;
  const blurSrc = blurCloudinaryUrl(imgUrl);

  return (
    <div className={`relative ${sizeClass} aspect-[3/4] bg-blush/40 overflow-hidden rounded-xl group`}>
      {blurSrc ? (
        <img
          src={blurSrc}
          aria-hidden
          className={`absolute inset-0 z-30 w-full h-full object-cover pointer-events-none transition-opacity duration-700 scale-110 ${imageReady ? "opacity-0" : "opacity-100"}`}
        />
      ) : (
        <div className={`absolute inset-0 z-30 bg-muted transition-opacity duration-500 pointer-events-none ${imageReady ? "opacity-0" : "animate-pulse opacity-100"}`} />
      )}
      <img
        src={optimizedSrc}
        alt={item.product.name}
        className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 ${soldOut ? "grayscale" : ""}`}
        onLoad={() => setImageReady(true)}
        onError={() => setImageReady(true)}
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-400 z-10 pointer-events-none" />
      {soldOut && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
          <span className={`rounded-full text-white font-bold uppercase bg-red-600 px-2 py-0.5 ${labelSize}`}>
            {language === "ar" ? "نفذ" : "Sold Out"}
          </span>
        </div>
      )}
    </div>
  );
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

  // Scroll to the item the user tapped on in the "added to cart" notification
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrolledToHighlightRef = useRef(false);

  useEffect(() => {
    if (scrolledToHighlightRef.current || items.length === 0) return;
    const highlight = new URLSearchParams(window.location.search).get("highlight");
    if (!highlight) return;
    const el = itemRefs.current[highlight];
    if (!el) return;
    scrolledToHighlightRef.current = true;
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, [items.length]);

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

  const isAr = language === "ar";
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  const points = Math.floor(availableTotal / 2);

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col pt-navbar">
        <Navbar />
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-14 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-blush"
          >
            <ShoppingBag className="h-11 w-11 text-berry" strokeWidth={1.4} />
          </motion.div>
          <h1 className="mb-2 text-2xl font-bold text-berry-deep sm:text-3xl" data-testid="text-cart-empty">{t.cart.empty}</h1>
          <p className="mb-7 max-w-xs text-sm text-muted-foreground">{t.cart.emptyDesc}</p>
          <Link href="/shop">
            <Button className="h-12 !rounded-full px-8 text-sm font-semibold" data-testid="button-continue-shopping">
              {t.cart.continueShopping} <Arrow className="ms-2 h-4 w-4" />
            </Button>
          </Link>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-12 pt-5 sm:px-6 sm:pt-8 lg:px-8">
        <CheckoutSteps current={1} />

        <div className="mb-4 mt-5 flex items-end justify-between gap-3 sm:mb-6 sm:mt-7">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-berry-deep sm:text-3xl" data-testid="text-cart-title">{t.cart.title}</h1>
            <span className="price-text rounded-full bg-blush px-3 py-1 text-xs font-semibold text-berry-deep" data-testid="text-cart-count">
              {isAr ? `${itemCount} ${itemCount === 1 ? "قطعة" : itemCount === 2 ? "قطعتان" : itemCount <= 10 ? "قطع" : "قطعة"}` : `${itemCount} ${itemCount === 1 ? "item" : "items"}`}
            </span>
          </div>
          <Link href="/shop" className="text-xs font-semibold text-berry hover:underline sm:text-sm" data-testid="link-continue-shopping">
            {t.cart.continueShopping}
          </Link>
        </div>

        {hasSoldOut && (
          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-red-50 p-3.5 dark:bg-red-950/20" data-testid="cart-sold-out-banner">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-sm text-red-700 dark:text-red-300">
              {language === "ar" ? "بعض المنتجات في سلتك نفدت من المخزون. يُرجى إزالتها للمتابعة." : "Some items in your cart are sold out. Please remove them to proceed."}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
          <div className="space-y-2.5 sm:space-y-3">
            <AnimatePresence initial={false}>
              {items.map((item, idx) => {
                const price = parseFloat(item.product.discountPrice?.toString() || item.product.price.toString());
                const original = item.product.discountPrice ? parseFloat(item.product.price.toString()) : null;
                const maxStock = getItemMaxStock(item);
                const atMax = item.quantity >= maxStock;
                const soldOut = isItemSoldOut(item);
                const key = makeKey(item.product.id, item.size, item.color);
                return (
                  <motion.div
                    key={key}
                    layout
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: isAr ? 60 : -60, transition: { duration: 0.25 } }}
                    transition={{ duration: 0.4, ease: EASE }}
                    ref={(el) => { itemRefs.current[key] = el; }}
                    className={`relative flex gap-3 rounded-2xl bg-white p-3 sm:gap-5 sm:p-4 ${soldOut ? "opacity-70" : ""}`}
                    data-testid={`cart-item-${idx}`}
                  >
                    <Link href={`/product/${item.product.id}`} className="flex-shrink-0">
                      <CartItemImage item={item} soldOut={soldOut} sizeClass="w-[5.5rem] sm:w-28" labelSize="text-[9px] sm:text-[10px] tracking-wider" language={language} />
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start gap-2">
                        <h3 className={`min-w-0 flex-1 text-sm font-semibold leading-snug line-clamp-2 sm:text-base ${soldOut ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          <Link href={`/product/${item.product.id}`} className="hover:text-berry-deep">{item.product.name}</Link>
                        </h3>
                        <button
                          onClick={() => removeFromCart(item.product.id, item.size, item.color)}
                          aria-label={isAr ? "حذف من السلة" : "Remove from cart"}
                          className={`relative z-20 -me-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${soldOut ? "bg-red-50 text-red-600" : "text-muted-foreground hover:bg-red-50 hover:text-red-600"}`}
                          data-testid={`button-remove-item-${idx}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {(item.size || item.color) && (
                        <div className={`mt-1.5 flex flex-wrap gap-1.5 ${soldOut ? "opacity-60" : ""}`}>
                          {item.size && (
                            <span className="rounded-full bg-blush/70 px-2.5 py-0.5 text-[11px] font-medium text-berry-deep">{t.cart.sizeLabel}: <span className="price-text">{item.size}</span></span>
                          )}
                          {item.color && (
                            <span className="rounded-full bg-blush/70 px-2.5 py-0.5 text-[11px] font-medium text-berry-deep">{translateColorName(item.color, language === "ar" ? "ar" : "en")}</span>
                          )}
                        </div>
                      )}

                      <p className={`price-text mt-1.5 text-xs ${soldOut ? "text-muted-foreground/60 line-through" : "text-muted-foreground"}`}>
                        ₪{price.toFixed(2)}
                        {original && original > price && <span className="ms-1.5 line-through opacity-60">₪{original.toFixed(2)}</span>}
                      </p>

                      <div className="mt-auto flex items-end justify-between gap-2 pt-2">
                        {soldOut ? (
                          <p className="text-xs font-semibold text-red-600 dark:text-red-400" data-testid={`text-sold-out-${idx}`}>
                            {language === "ar" ? "هذا المنتج نفد من المخزون" : "This product is sold out"}
                          </p>
                        ) : (
                          <div>
                            <div className="flex h-9 items-center rounded-full bg-background p-0.5">
                              <button
                                onClick={() => updateQuantity(item.product.id, item.quantity - 1, item.size, item.color)}
                                aria-label={isAr ? "إنقاص الكمية" : "Decrease quantity"}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-foreground transition-colors hover:bg-blush hover:text-berry-deep"
                                data-testid={`button-qty-minus-${idx}`}
                              ><Minus className="h-3 w-3" /></button>
                              <motion.span
                                key={item.quantity}
                                initial={{ scale: 1.35, opacity: 0.4 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ duration: 0.25 }}
                                className="price-text w-8 text-center text-sm font-semibold"
                                data-testid={`text-qty-${idx}`}
                              >{item.quantity}</motion.span>
                              <button
                                onClick={() => updateQuantity(item.product.id, Math.min(item.quantity + 1, maxStock), item.size, item.color)}
                                disabled={atMax}
                                aria-label={isAr ? "زيادة الكمية" : "Increase quantity"}
                                className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-foreground transition-colors hover:bg-blush hover:text-berry-deep disabled:cursor-not-allowed disabled:opacity-30"
                                data-testid={`button-qty-plus-${idx}`}
                              ><Plus className="h-3 w-3" /></button>
                            </div>
                            {atMax && (
                              <p className="mt-1 text-[10px] text-muted-foreground">{isAr ? "أقصى كمية متوفرة" : "Maximum available"}</p>
                            )}
                          </div>
                        )}
                        <span className={`price-text text-base font-bold sm:text-lg ${soldOut ? "line-through text-muted-foreground/60" : "text-foreground"}`}>
                          ₪{(price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <motion.aside
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1, ease: EASE }}
            className="rounded-[1.5rem] bg-white p-5 sm:p-6 lg:sticky lg:top-28"
          >
            <h2 className="mb-4 text-lg font-bold text-foreground" data-testid="text-order-summary">{t.cart.orderSummary}</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.cart.subtotal}</span>
                <span className="price-text font-medium">₪{availableTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t.product.shipping}</span>
                <span className="text-xs text-muted-foreground">{t.cart.shippingCalc}</span>
              </div>
            </div>

            <div className="my-4 border-t border-dashed border-border" />

            <div className="mb-4 flex items-center justify-between">
              <span className="text-base font-semibold">{t.cart.total}</span>
              <motion.span
                key={availableTotal}
                initial={{ scale: 1.12, color: "hsl(342 49% 42%)" }}
                animate={{ scale: 1, color: "hsl(342 52% 33%)" }}
                transition={{ duration: 0.35 }}
                className="price-text text-2xl font-bold"
                data-testid="text-cart-total"
              >₪{availableTotal.toFixed(2)}</motion.span>
            </div>

            {loyaltyPointsEnabled && availableTotal > 0 && points > 0 && (
              <div className="mb-4 flex items-center gap-3 rounded-2xl bg-blush p-3" data-testid="text-cart-points-preview">
                <LucerneCoin className="h-10 w-10 shrink-0 drop-shadow-sm" />
                <p className="flex-1 text-[13px] font-semibold leading-snug text-berry-deep">
                  {language === "ar"
                    ? `ستحصلين على ${points} نقطة إضافية عند تسليم طلبك!`
                    : `You'll earn ${points} extra points when your order is delivered!`}
                </p>
              </div>
            )}

            {hasSoldOut && (
              <p className="mb-3 text-center text-xs text-red-600 dark:text-red-400">
                {language === "ar" ? "أزيلي المنتجات النافدة للمتابعة" : "Remove sold out items to proceed"}
              </p>
            )}

            <Button
              onClick={() => setLocation("/checkout")}
              className="h-12 w-full !rounded-full text-sm font-semibold"
              disabled={hasSoldOut || availableItems.length === 0}
              data-testid="button-proceed-checkout"
            >
              {t.cart.proceedToCheckout} <Arrow className="w-4 h-4 ms-2" />
            </Button>
          </motion.aside>
        </div>
      </main>
      <Footer />

    </div>
  );
}
