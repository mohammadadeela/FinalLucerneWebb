import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { Link, useLocation } from "wouter";
import { Heart, ShoppingBag } from "lucide-react";
import { type Product, type ColorVariant } from "@shared/schema";
import { useLanguage } from "@/i18n";
import { COLOR_FAMILIES, translateColorName } from "@/lib/colorFamilies";
import { optimizeCloudinaryUrl, blurCloudinaryUrl } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useWishlist } from "@/hooks/use-wishlist";
import { useToast } from "@/hooks/use-toast";
import { usePrefetchProduct } from "@/hooks/use-products";
import { useNearViewport } from "@/hooks/use-near-viewport";
import { ProductWatermark } from "@/components/ui/ProductWatermark";

// Maximum color swatches shown on a product card before collapsing the rest
// into a "+N" link. Capping this keeps every card the same height — products
// with many colors (10+) previously stretched their card taller than the rest
// of the row and looked oversized in sliders.
const MAX_VISIBLE_SWATCHES = 4;

/** "299" for whole prices, "299.50" otherwise — keeps cards calm and easy to scan. */
function formatPrice(value: unknown): string {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export const ProductCard = memo(function ProductCard({ product, initialColorName, priority = false }: { product: Product; initialColorName?: string | null; priority?: boolean }) {
  const { t, language } = useLanguage();
  const { data: user } = useAuth();
  const { isWishlisted, toggle } = useWishlist();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const prefetchProduct = usePrefetchProduct();
  const wishlisted = isWishlisted(product.id);

  const [imageReady, setImageReady] = useState(false);

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast({ title: t.wishlist.loginRequired, variant: "destructive" });
      setLocation("/auth");
      return;
    }
    const activeColor = cv && effectiveColorIdx !== null ? cv[effectiveColorIdx]?.name : undefined;
    toggle(product.id, activeColor ?? undefined);
  };

  const price = formatPrice(product.price);
  const discountPrice = product.discountPrice
    ? formatPrice(product.discountPrice)
    : null;
  const discountPercent = product.discountPrice
    ? Math.round(
        (1 - parseFloat(product.discountPrice.toString()) / parseFloat(product.price.toString())) * 100,
      )
    : 0;
  const isSoldOut = product.stockQuantity <= 0;

  const cv = (product as any).colorVariants as ColorVariant[] | undefined;
  const hasVariants = cv && cv.length > 0;

  const initialIdx = useMemo(() => {
    if (!initialColorName || !cv) return null;
    const idx = cv.findIndex(v => v.name === initialColorName);
    return idx >= 0 ? idx : null;
  }, [initialColorName, cv]);

  const [activeColorIdx, setActiveColorIdx] = useState<number | null>(initialIdx);
  const [hoveredColorIdx, setHoveredColorIdx] = useState<number | null>(null);
  const [isCardHovered, setIsCardHovered] = useState(false);

  const effectiveColorIdx =
    hoveredColorIdx !== null ? hoveredColorIdx : activeColorIdx;

  const { allImages, imageColorMap } = useMemo(() => {
    if (hasVariants && effectiveColorIdx !== null && cv[effectiveColorIdx]) {
      const v = cv[effectiveColorIdx];
      const imgs = [v.mainImage, ...(v.images || [])].filter(
        Boolean,
      ) as string[];
      return {
        allImages: imgs,
        imageColorMap: imgs.map(() => effectiveColorIdx),
      };
    }
    const imgs: string[] = [];
    const colorMap: number[] = [];
    if (hasVariants) {
      cv.forEach((v, colorIdx) => {
        if (v.mainImage) {
          imgs.push(v.mainImage);
          colorMap.push(colorIdx);
        }
      });
    } else {
      if (product.mainImage) {
        imgs.push(product.mainImage);
        colorMap.push(-1);
      }
      (product.images || []).forEach((img) => {
        if (img) {
          imgs.push(img);
          colorMap.push(-1);
        }
      });
    }
    return { allImages: imgs, imageColorMap: colorMap };
  }, [product, cv, hasVariants, effectiveColorIdx]);

  const displayImage = useMemo(() => {
    if (hasVariants && effectiveColorIdx !== null && cv[effectiveColorIdx]) {
      return cv[effectiveColorIdx].mainImage;
    }
    return product.mainImage;
  }, [product, cv, hasVariants, effectiveColorIdx]);

  const blurSrc = useMemo(() => blurCloudinaryUrl(displayImage), [displayImage]);

  // Warms the browser's cache for the product-detail page BEFORE the
  // customer taps through. Two things are prefetched:
  //  1. The product JSON (so the detail page renders instantly from cache).
  //  2. The full-size (1200w) main photo at the exact resolution the detail
  //     page requests — the card only ever loads a 600w thumbnail, so
  //     without this the detail page's hero photo was ALWAYS a fresh,
  //     never-before-fetched image no matter how well the card itself
  //     loaded. This is what actually removes the felt "1 second delay"
  //     when opening a product.
  const handlePrefetchIntent = useCallback(() => {
    prefetchProduct(product.id);
    const fullSizeUrl = optimizeCloudinaryUrl(displayImage, 1200);
    if (fullSizeUrl) {
      const img = new Image();
      img.src = fullSizeUrl;
    }
  }, [prefetchProduct, product.id, displayImage]);

  // Start fetching the real photo ~1200px before it scrolls into view
  // instead of waiting on the browser's native (and connection-dependent)
  // lazy-load distance. `priority` cards (first row) always load immediately.
  const { ref: nearViewportRef, isNear } = useNearViewport<HTMLDivElement>();
  const shouldLoadImage = priority || isNear;

  const [currentIdx, setCurrentIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoColorIdx =
    effectiveColorIdx === null ? (imageColorMap[currentIdx] ?? -1) : null;

  const stopCycle = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startCycle = useCallback(() => {
    if (allImages.length <= 1) return;
    stopCycle();
    intervalRef.current = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % allImages.length);
    }, 2500);
  }, [allImages.length, stopCycle]);

  useEffect(() => {
    if (effectiveColorIdx !== null) {
      stopCycle();
      setCurrentIdx(0);
      return stopCycle;
    }
    setCurrentIdx(0);
    startCycle();
    return stopCycle;
  }, [effectiveColorIdx, allImages.length]);

  // Reset shimmer whenever the active image changes.
  // We also pre-fetch the *optimized* URL so the browser cache warms the
  // same resource that the <img> element will request.
  useEffect(() => {
    if (!displayImage) {
      setImageReady(true);
      return;
    }
    setImageReady(false);
    const optimized = optimizeCloudinaryUrl(displayImage, 600) || displayImage;
    const img = new Image();
    img.onload = () => setImageReady(true);
    img.onerror = () => setImageReady(true);
    img.src = optimized;
  }, [displayImage]);

  const handleSwatchClick = (e: React.MouseEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    stopCycle();
    if (activeColorIdx === idx) {
      setActiveColorIdx(null);
      startCycle();
    } else {
      setActiveColorIdx(idx);
      setCurrentIdx(0);
    }
  };

  const handleSwatchHover = (e: React.MouseEvent, idx: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    setHoveredColorIdx(idx);
    if (idx !== null) {
      stopCycle();
      setCurrentIdx(0);
    } else if (activeColorIdx === null) {
      startCycle();
    }
  };

  const getSwatchColors = (variant: ColorVariant) => {
    const tagged = (variant.colorTags || [])
      .map((tag) => COLOR_FAMILIES.find((family) => family.key === tag)?.hex)
      .filter((hex): hex is string => Boolean(hex));
    return tagged.length > 0 ? tagged : [variant.colorCode];
  };

  return (
    <div
      className="group flex h-full cursor-pointer flex-col rounded-[1.15rem] bg-card p-1.5 ring-1 ring-black/[0.05] transition-shadow duration-300 hover:shadow-[0_22px_44px_-26px_rgba(74,24,43,0.5)] sm:p-2"
      data-testid={`card-product-${product.id}`}
      onMouseEnter={() => { setIsCardHovered(true); handlePrefetchIntent(); }}
      onMouseLeave={() => setIsCardHovered(false)}
      onTouchStart={handlePrefetchIntent}
    >
      {/* Image container */}
      <Link href={`/product/${product.id}`} className="block">
        <div ref={nearViewportRef} className="relative aspect-[3/4] overflow-hidden bg-[hsl(var(--sand))] rounded-[0.85rem]">
          {/* Blur-up placeholder — shows a tiny blurred preview while the real image loads.
              For R2 images: a pre-generated tiny blur.webp fades out when the photo arrives.
              Legacy Cloudinary remains supported for rollback; other images use the shimmer. */}
          {blurSrc ? (
            <img
              src={blurSrc}
              aria-hidden="true"
              width={600}
              height={800}
              className={`absolute inset-0 z-30 w-full h-full object-cover rounded-[0.85rem] pointer-events-none transition-opacity duration-700 ${imageReady ? "opacity-0" : "opacity-100"}`}
            />
          ) : (
            <div
              className={`absolute inset-0 z-30 rounded-[0.85rem] bg-muted transition-opacity duration-500 pointer-events-none ${imageReady ? "opacity-0" : "animate-pulse opacity-100"}`}
            />
          )}
          {/* Stock status takes priority over promotional badges. Keep the photo and link visible. */}
          {isSoldOut && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-muted/25 backdrop-brightness-90 px-4 pointer-events-none">
              <span
                className="rounded-full border border-white/20 bg-black px-3 py-1.5 text-center text-xs font-medium leading-none tracking-wide text-white"
                data-testid={`badge-sold-out-${product.id}`}
              >
                Sold out
              </span>
            </div>
          )}

          {/* Badges — soft pills stacked at the top start */}
          {!isSoldOut && (product.isNewArrival || discountPrice || (product as any).isBestSeller) && (
            <div className="absolute top-2 start-2 z-20 flex flex-col items-start gap-1.5 sm:top-2.5 sm:start-2.5">
              {product.isNewArrival && (
                <span
                  className="rounded-full bg-[hsl(var(--sage))] px-2.5 py-1 text-[10px] font-medium leading-none text-foreground sm:text-[11px]"
                  data-testid={`badge-new-${product.id}`}
                >
                  {t.product.new}
                </span>
              )}
              {!product.isNewArrival && (product as any).isBestSeller && (
                <span
                  className="rounded-full bg-[hsl(var(--sand))] px-2.5 py-1 text-[10px] font-medium leading-none text-foreground sm:text-[11px]"
                  data-testid={`badge-bestseller-${product.id}`}
                >
                  {language === "ar" ? "الأكثر مبيعاً" : "Bestseller"}
                </span>
              )}
              {discountPrice && (
                <span
                  className="rounded-full px-2.5 py-1 text-[10px] font-semibold leading-none text-white sm:text-[11px]"
                  style={{ backgroundColor: "#9B1C1C" }}
                  data-testid={`badge-sale-${product.id}`}
                >
                  {discountPercent > 0 ? <span className="ltr-num">-{discountPercent}%</span> : t.product.sale}
                </span>
              )}
            </div>
          )}

          {/* Images */}
          {effectiveColorIdx !== null ? (
            shouldLoadImage && (
              <img
                src={optimizeCloudinaryUrl(displayImage, 600) || "/placeholder-product.svg"}
                srcSet={displayImage && (displayImage.includes("media.lucerne-boutique.com") || displayImage.includes("res.cloudinary.com"))
                  ? `${optimizeCloudinaryUrl(displayImage, 400)} 400w, ${optimizeCloudinaryUrl(displayImage, 800)} 800w`
                  : undefined}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 33vw"
                alt={product.name}
                width={600}
                height={800}
                fetchPriority={priority ? "high" : "low"}
                loading={priority ? "eager" : "lazy"}
                decoding={priority ? "sync" : "async"}
                className="absolute inset-0 object-cover w-full h-full transition-opacity duration-300 group-hover:opacity-90"
                onLoad={() => setImageReady(true)}
                onError={(e) => { e.currentTarget.src = "/placeholder-product.svg"; setImageReady(true); }}
              />
            )
          ) : allImages.length === 0 ? (
            <img
              src="/placeholder-product.svg"
              alt={product.name}
              width={600}
              height={800}
              className="absolute inset-0 object-cover w-full h-full"
            />
          ) : (
            shouldLoadImage && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: "100%",
                  width: `${allImages.length * 100}%`,
                  display: "flex",
                  transform: `translateX(-${(currentIdx / allImages.length) * 100}%)`,
                  transition: "transform 700ms ease-in-out",
                }}
              >
                {allImages.map((img, idx) => (
                  <div
                    key={idx}
                    style={{
                      width: `${100 / allImages.length}%`,
                      height: "100%",
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={optimizeCloudinaryUrl(img, 600) || "/placeholder-product.svg"}
                      alt={product.name}
                      width={600}
                      height={800}
                      fetchPriority={priority && idx === 0 ? "high" : "low"}
                      loading={priority && idx === 0 ? "eager" : "lazy"}
                      decoding={priority && idx === 0 ? "sync" : "async"}
                      onLoad={() => { if (idx === 0) setImageReady(true); }}
                      onError={(e) => { e.currentTarget.src = "/placeholder-product.svg"; if (idx === 0) setImageReady(true); }}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                        opacity: isCardHovered ? 0.9 : 1,
                        transition: "opacity 300ms ease-in-out",
                      }}
                    />
                  </div>
                ))}
              </div>
            )
          )}

          {/* Keep the product photo clean when the sold-out pill is shown. */}
          {!isSoldOut && <ProductWatermark size="sm" />}

          {/* Hover dark overlay */}
          {!isSoldOut && <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-400 z-10" />}

          {/* View product bar — slides up on hover for available products only */}
          {!isSoldOut && <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLocation(`/product/${product.id}`);
            }}
            className="absolute bottom-0 inset-x-0 z-30 hidden items-center justify-center gap-2 bg-primary/95 text-primary-foreground text-xs font-medium py-2.5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out sm:flex"
            data-testid={`button-view-product-${product.id}`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            {t.product.view}
          </button>}

          {/* Wishlist heart button */}
          {!isSoldOut && <button
            onClick={handleWishlistClick}
            aria-label={
              wishlisted
                ? t.wishlist.removeFromWishlist
                : t.wishlist.addToWishlist
            }
            data-testid={`button-wishlist-${product.id}`}
            className="absolute top-2 end-2 z-30 flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/95 shadow-sm transition-transform duration-200 hover:scale-110 active:scale-95 sm:top-2.5 sm:end-2.5"
          >
            <Heart
              className={`w-4 h-4 transition-all duration-200 ${wishlisted ? "fill-rose-500 stroke-rose-500" : "stroke-foreground fill-transparent"}`}
              strokeWidth={1.5}
            />
          </button>}

          {/* Carousel dots */}
          {allImages.length > 1 && effectiveColorIdx === null && (
            <div className="absolute bottom-3 sm:group-hover:bottom-12 inset-x-0 flex justify-center gap-1.5 z-20 transition-all duration-300">
              {allImages.map((_, idx) => (
                <span
                  key={idx}
                  className={`rounded-full transition-all duration-300 ${
                    idx === currentIdx
                      ? "w-4 h-1.5 bg-white"
                      : "w-1.5 h-1.5 bg-white/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1.5 px-1.5 pb-1.5 pt-2.5 sm:px-2 sm:pb-2 sm:pt-3">
        {product.brand && (
          <p className="text-[10px] text-muted-foreground/80 uppercase tracking-[0.18em] font-medium">
            {product.brand}
          </p>
        )}

        <Link href={`/product/${product.id}`}>
          <h3 className={`font-semibold text-[15px] sm:text-[17px] leading-tight rtl:text-[13px] rtl:sm:text-[15px] rtl:leading-snug line-clamp-2 transition-colors duration-200 ${isSoldOut ? "text-muted-foreground" : "text-foreground group-hover:text-primary"}`}>
            {product.name}
          </h3>
        </Link>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 pt-0.5">
        <div className="flex items-baseline gap-2">
          {discountPrice ? (
            <>
              <span
                className={`font-semibold text-sm sm:text-base ${isSoldOut ? "text-muted-foreground/70" : ""}`}
                style={isSoldOut ? undefined : { color: "#9B1C1C" }}
                data-testid={`text-discount-price-${product.id}`}
              >
                <span className="ltr-num">₪ {discountPrice}</span>
              </span>
              <span
                className="text-xs text-muted-foreground/70 line-through"
                data-testid={`text-original-price-${product.id}`}
              >
                <span className="ltr-num">₪ {price}</span>
              </span>
            </>
          ) : (
            <span
              className={`font-semibold text-sm sm:text-base ${isSoldOut ? "text-muted-foreground/70" : ""}`}
              data-testid={`text-price-${product.id}`}
            >
              <span className="ltr-num">₪ {price}</span>
            </span>
          )}
        </div>

        {hasVariants && cv.length > 1 && (
          <div
            className="flex gap-1 sm:gap-1.5 flex-nowrap items-center h-6 px-0.5"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            data-testid={`swatches-${product.id}`}
          >
            {cv.slice(0, MAX_VISIBLE_SWATCHES).map((v, idx) => {
              const swatchColors = getSwatchColors(v);
              return (
                <button
                  key={idx}
                  disabled={isSoldOut}
                  onClick={(e) => handleSwatchClick(e, idx)}
                  onMouseEnter={(e) => !isSoldOut && handleSwatchHover(e, idx)}
                  onMouseLeave={(e) => !isSoldOut && handleSwatchHover(e, null)}
                  className={`w-4 h-4 sm:w-[1.15rem] sm:h-[1.15rem] rounded-full border transition-all duration-200 overflow-hidden flex-shrink-0 ${
                    activeColorIdx === idx || hoveredColorIdx === idx
                      ? "border-foreground scale-125 shadow-md"
                      : autoColorIdx === idx
                        ? "border-foreground/60 scale-110"
                        : "border-transparent hover:border-foreground/50 hover:scale-110"
                  }`}
                  style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }}
                  title={translateColorName(v.name, language === "ar" ? "ar" : "en")}
                  data-testid={`swatch-${product.id}-${idx}`}
                >
                  {v.mainImage && !swatchColors[0] ? (
                    <img
                      src={optimizeCloudinaryUrl(v.mainImage, 100) || v.mainImage}
                      alt={v.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <span className="flex w-full h-full">
                      {swatchColors.slice(0, 4).map((hex, colorIdx) => (
                        <span key={`${hex}-${colorIdx}`} className="h-full flex-1" style={{ backgroundColor: hex }} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
            {cv.length > MAX_VISIBLE_SWATCHES && (
              <Link
                href={`/product/${product.id}`}
                onClick={(e) => e.stopPropagation()}
                className="h-4 sm:h-[1.15rem] min-w-4 px-1 rounded-full flex-shrink-0 flex items-center justify-center bg-muted text-[8px] sm:text-[9px] font-semibold text-muted-foreground hover:bg-muted-foreground/20 transition-colors"
                style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.15)" }}
                title={translateColorName("", language === "ar" ? "ar" : "en")}
                data-testid={`swatch-more-${product.id}`}
              >
                +{cv.length - MAX_VISIBLE_SWATCHES}
              </Link>
            )}
          </div>
        )}

        </div>
      </div>
    </div>
  );
});
