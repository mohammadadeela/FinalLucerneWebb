import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useCart, type CartItem } from "@/store/use-cart";
import { Minus, Plus, Trash2, ArrowRight, ArrowLeft, ShoppingBag } from "lucide-react";
import { LucerneCoin } from "@/components/ui/lucerne-coin";
import { useLanguage } from "@/i18n";
import { useToast } from "@/hooks/use-toast";
import type { ColorVariant } from "@shared/schema";
import { translateColorName } from "@/lib/colorFamilies";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { optimizeCloudinaryUrl, blurCloudinaryUrl } from "@/lib/utils";
import { quoteCartOffers, readCartOfferSettings } from "@shared/cartOffers";
import { CartOffers, useCartOfferChoice } from "@/components/cart/CartOffers";
import { useBestSellers } from "@/hooks/use-products";

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
    <div className={`relative ${sizeClass} aspect-[3/4] bg-secondary overflow-hidden rounded-2xl group`}>
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
          <span className={`text-white font-bold uppercase bg-red-600 px-2 py-0.5 ${labelSize}`}>
            {language === "ar" ? "نفذ" : "Sold Out"}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The cart itself: offers, the pieces, suggestions and the total. The same component fills
 * the slide-in drawer (opened from the bag icon) and the /cart page.
 */
export function CartContents({ mode, onNavigate }: { mode: "drawer" | "page"; onNavigate?: () => void }) {
  const { items, updateQuantity, removeFromCart } = useCart();
  const { data: siteSettings } = useSiteSettings();
  const loyaltyPointsEnabled = siteSettings?.loyalty_points_enabled !== "false";
  const [, setLocation] = useLocation();
  const { t, language } = useLanguage();
  const { toast } = useToast();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  const isAr = language === "ar";
  const go = (path: string) => {
    onNavigate?.();
    setLocation(path);
  };
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

  // Cart offers (one per order). Delivery is priced at checkout, so here it shows as a promise.
  const [offerChoice, setOfferChoice] = useCartOfferChoice();
  const offerSettings = readCartOfferSettings(siteSettings as any);
  const offerQuote = quoteCartOffers(offerSettings, {
    spend: availableTotal,
    itemCount: availableItems.reduce((n, item) => n + item.quantity, 0),
    shipping: 0,
    chosen: offerChoice,
  });
  const cartTotalAfterOffer = Math.max(0, availableTotal - offerQuote.bundleDiscount);

  // "Goes well with your cart": real best sellers that are not in the cart yet.
  const { data: bestSellersData } = useBestSellers(12);
  const inCart = new Set(items.map((i) => i.product.id));
  const suggestions = (bestSellersData || []).filter((p: any) => !inCart.has(p.id) && (p.stockQuantity ?? 0) > 0).slice(0, 4);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-blush">
          <ShoppingBag className="h-7 w-7" strokeWidth={1.5} />
        </span>
        <h2 className="font-display text-2xl" data-testid="text-cart-empty">{t.cart.empty}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t.cart.emptyDesc}</p>
        <button type="button" onClick={() => go("/shop")} className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-[1.02] active:scale-95" data-testid="button-continue-shopping">
          {t.cart.continueShopping}
        </button>
      </div>
    );
  }

  const itemCount = items.reduce((n, item) => n + item.quantity, 0);
  const points = Math.floor(cartTotalAfterOffer / 2);

  const lines = (
    <ul className="divide-y divide-border/70">
      {items.map((item, idx) => {
        const price = item.product.discountPrice ? parseFloat(item.product.discountPrice) : parseFloat(item.product.price);
        const fullPrice = parseFloat(item.product.price);
        const soldOut = isItemSoldOut(item);
        const maxStock = getItemMaxStock(item);
        const atMax = item.quantity >= maxStock;
        const key = makeKey(item.product.id, item.size, item.color);
        const variant = ((item.product.colorVariants as ColorVariant[] | undefined) || []).find((v) => v.name === item.color);
        return (
          <li
            key={`${key}-${idx}`}
            ref={(el) => { itemRefs.current[key] = el as any; }}
            className={`flex gap-3.5 py-4 ${soldOut ? "opacity-60" : ""}`}
            data-testid={`cart-item-${idx}`}
          >
            <button type="button" onClick={() => go(`/product/${item.product.id}`)} className="shrink-0" aria-label={item.product.name}>
              <CartItemImage item={item} soldOut={soldOut} sizeClass="w-[76px]" labelSize="text-[10px]" language={language} />
            </button>
            <div className="flex min-w-0 flex-1 flex-col">
              <button type="button" onClick={() => go(`/product/${item.product.id}`)} className="truncate text-start text-[14.5px] font-medium">
                {item.product.name}
              </button>
              {(item.color || item.size) && (
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  {variant?.colorCode && <span className="h-3 w-3 rounded-full border border-black/10" style={{ background: variant.colorCode }} />}
                  {[item.color ? translateColorName(item.color, language) : "", item.size].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between pt-2">
                {soldOut ? (
                  <span className="text-xs font-semibold text-red-600">{isAr ? "نفذ من المخزون" : "Sold out"}</span>
                ) : (
                  <div className="inline-flex h-8 items-center rounded-full border border-border bg-background px-0.5">
                    <button type="button" onClick={() => updateQuantity(item.product.id, Math.max(1, item.quantity - 1), item.size, item.color)} disabled={item.quantity <= 1} className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-blush disabled:opacity-30" aria-label={isAr ? "أقل" : "Less"} data-testid={`button-qty-minus-${idx}`}>
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-[13px] font-semibold">{item.quantity}</span>
                    <button type="button" onClick={() => updateQuantity(item.product.id, Math.min(item.quantity + 1, maxStock), item.size, item.color)} disabled={atMax} className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-blush disabled:opacity-30" aria-label={isAr ? "أكثر" : "More"} data-testid={`button-qty-plus-${idx}`}>
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <p className="text-[15px] font-semibold">
                  ₪{(price * item.quantity).toFixed(2)}
                  {price < fullPrice && <s className="ms-1.5 text-[12px] font-normal text-muted-foreground">₪{(fullPrice * item.quantity).toFixed(2)}</s>}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => removeFromCart(item.product.id, item.size, item.color)} className="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full text-muted-foreground transition-colors hover:bg-blush hover:text-foreground" aria-label={isAr ? "حذف" : "Remove"} data-testid={`button-remove-${idx}`}>
              <Trash2 className="h-[15px] w-[15px]" />
            </button>
          </li>
        );
      })}
    </ul>
  );

  const soldOutNote = hasSoldOut && (
    <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700 dark:bg-red-950/30 dark:text-red-300" data-testid="cart-sold-out-banner">
      {isAr ? "بعض القطع نفذت. احذفيها لتكملي الطلب." : "Some pieces sold out. Remove them to continue."}
    </p>
  );

  const suggested = suggestions.length > 0 && (
    <div className="mt-2" data-testid="section-cart-suggestions">
      <p className="mb-2 text-[13px] font-semibold text-muted-foreground">{isAr ? "يليق مع سلتك" : "Goes well with your cart"}</p>
      <div className={mode === "page" ? "grid gap-2 sm:grid-cols-2" : "grid gap-2"}>
        {suggestions.slice(0, mode === "page" ? 4 : 3).map((p: any) => {
          const sale = p.discountPrice && Number(p.discountPrice) > 0 && Number(p.discountPrice) < Number(p.price);
          return (
            <button key={p.id} type="button" onClick={() => go(`/product/${p.id}`)} className="flex items-center gap-3 rounded-2xl bg-background p-2 text-start shadow-sm transition-transform hover:-translate-y-0.5" data-testid={`card-cart-suggestion-${p.id}`}>
              <img src={optimizeCloudinaryUrl(p.mainImage, 200) || p.mainImage} alt="" loading="lazy" className="h-14 w-12 shrink-0 rounded-xl object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium">{p.name}</span>
                <span className="text-[13px] text-muted-foreground">
                  ₪{Number(sale ? p.discountPrice : p.price)}
                  {sale && <s className="ms-1.5 text-[11px]">₪{Number(p.price)}</s>}
                </span>
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                <Plus className="h-[17px] w-[17px]" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const totals = (
    <>
      {offerQuote.bundleDiscount > 0 && (
        <p className="mb-1 flex justify-between text-[14px] font-medium" data-testid="row-cart-bundle-discount">
          <span>{isAr ? `خصم الكمية (${offerSettings.bundlePercent}%)` : `Bundle discount (${offerSettings.bundlePercent}%)`}</span>
          <span>−₪{offerQuote.bundleDiscount.toFixed(2)}</span>
        </p>
      )}
      {offerQuote.gift && (
        <p className="mb-1 flex justify-between text-[14px] font-medium" data-testid="row-cart-gift">
          <span>{isAr ? offerSettings.giftTextAr : offerSettings.giftTextEn}</span>
          <span>{isAr ? "مجاناً" : "Free"}</span>
        </p>
      )}
      <p className="flex items-baseline justify-between">
        <span className="text-[15px] font-medium">{t.cart.subtotal}</span>
        <span className="text-xl font-semibold" data-testid="text-cart-total">₪{cartTotalAfterOffer.toFixed(2)}</span>
      </p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">{isAr ? "التوصيل يُحسب عند إتمام الطلب." : "Delivery is calculated at checkout."}</p>
      {loyaltyPointsEnabled && points > 0 && (
        <p className="mt-3 flex items-center gap-2.5 rounded-2xl bg-blush/70 px-3 py-2.5 text-[13px] font-semibold" data-testid="text-cart-points-preview">
          <LucerneCoin className="h-7 w-7 shrink-0" />
          {isAr ? `ستحصلين على ${points} نقطة عند استلام طلبك` : `You'll earn ${points} points when your order is delivered`}
        </p>
      )}
      <button
        type="button"
        onClick={() => go("/checkout")}
        disabled={hasSoldOut || availableItems.length === 0}
        className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary text-[15.5px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40"
        data-testid="button-proceed-checkout"
      >
        {t.cart.proceedToCheckout} <Arrow className="h-4 w-4" />
      </button>
    </>
  );

  const offers = <CartOffers quote={offerQuote} settings={offerSettings} isAr={isAr} onChoose={setOfferChoice} />;

  if (mode === "drawer") {
    return (
      <>
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <div className="pt-4">{offers}</div>
          {soldOutNote}
          {lines}
          {suggested}
        </div>
        <footer className="shrink-0 border-t border-border bg-background px-5 pb-5 pt-4">{totals}</footer>
      </>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1fr_400px] lg:gap-12">
      <div>
        <h1 className="font-display text-[2.4rem] leading-none sm:text-[3rem]" data-testid="text-cart-title">
          {t.cart.title} <span className="font-sans text-base font-medium text-muted-foreground">({itemCount})</span>
        </h1>
        {soldOutNote}
        <div className="mt-4">{lines}</div>
        {suggested}
      </div>
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="rounded-[1.75rem] bg-card p-5 shadow-[0_10px_40px_-18px_rgba(0,0,0,0.25)] sm:p-6">
          <h2 className="mb-4 font-display text-2xl" data-testid="text-order-summary">{t.cart.orderSummary}</h2>
          <div className="mb-5">{offers}</div>
          {totals}
        </div>
      </aside>
    </div>
  );
}

export default function Cart() {
  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex flex-1 flex-col px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <CartContents mode="page" />
      </main>
      <Footer />
    </div>
  );
}
