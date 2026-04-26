import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Heart, ShoppingBag } from "lucide-react";
import { type Product, type ColorVariant } from "@shared/schema";
import { useLanguage } from "@/i18n";
import { COLOR_FAMILIES, translateColorName } from "@/lib/colorFamilies";
import { useAuth } from "@/hooks/use-auth";
import { useWishlist } from "@/hooks/use-wishlist";
import { useToast } from "@/hooks/use-toast";
import { usePrefetchProduct } from "@/hooks/use-products";
import { ProductWatermark } from "@/components/ui/ProductWatermark";

export function ProductCard({ product, initialColorName }: { product: Product; initialColorName?: string | null }) {
  const { t, language } = useLanguage();
  const { data: user } = useAuth();
  const { isWishlisted, toggle } = useWishlist();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const prefetchProduct = usePrefetchProduct();
  const wishlisted = isWishlisted(product.id);

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

  const price = parseFloat(product.price.toString()).toFixed(2);
  const discountPrice = product.discountPrice
    ? parseFloat(product.discountPrice.toString()).toFixed(2)
    : null;

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
      className="group block cursor-pointer"
      data-testid={`card-product-${product.id}`}
      onMouseEnter={() => { setIsCardHovered(true); prefetchProduct(product.id); }}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      {/* Image container */}
      <Link href={`/product/${product.id}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden bg-secondary mb-3 rounded-2xl">
          {/* NEW badge — top start */}
          {product.isNewArrival && (
            <div className="absolute top-3 start-3 z-20">
              <span
                className="bg-foreground text-background text-[10px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 leading-none"
                data-testid={`badge-new-${product.id}`}
              >
                {t.product.new}
              </span>
            </div>
          )}

          {/* SALE badge — circle, top end */}
          {discountPrice && (
            <div className="absolute top-3 end-3 z-20">
              <span
                className="w-10 h-10 rounded-full text-white text-[10px] font-bold uppercase tracking-wide flex items-center justify-center leading-none shadow"
                style={{ backgroundColor: "#f50301" }}
                data-testid={`badge-sale-${product.id}`}
              >
                {t.product.sale}
              </span>
            </div>
          )}

          {/* Images */}
          {effectiveColorIdx !== null ? (
            <img
              src={displayImage || "/placeholder-product.svg"}
              alt={product.name}
              className="absolute inset-0 object-cover w-full h-full transition-transform duration-700 group-hover:scale-105"
              onError={(e) => {
                e.currentTarget.src = "/placeholder-product.svg";
              }}
            />
          ) : allImages.length === 0 ? (
            <img
              src="/placeholder-product.svg"
              alt={product.name}
              className="absolute inset-0 object-cover w-full h-full"
            />
          ) : (
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
                    src={img}
                    alt={product.name}
                    onError={(e) => {
                      e.currentTarget.src = "/placeholder-product.svg";
                    }}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                      transform: isCardHovered ? "scale(1.05)" : "scale(1)",
                      transition: "transform 700ms ease-in-out",
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Watermark */}
          <ProductWatermark />

          {/* Hover dark overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-400 z-10" />

          {/* View product bar — slides up on hover */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLocation(`/product/${product.id}`);
            }}
            className="absolute bottom-0 inset-x-0 z-30 flex items-center justify-center gap-2 bg-foreground/90 text-background text-xs font-semibold uppercase tracking-widest py-2.5 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out"
            data-testid={`button-view-product-${product.id}`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            {t.product.view}
          </button>

          {/* Wishlist heart button */}
          <button
            onClick={handleWishlistClick}
            aria-label={
              wishlisted
                ? t.wishlist.removeFromWishlist
                : t.wishlist.addToWishlist
            }
            data-testid={`button-wishlist-${product.id}`}
            className={`absolute bottom-3 group-hover:bottom-12 end-3 z-30 w-8 h-8 flex items-center justify-center rounded-full backdrop-blur-sm shadow-sm hover:bg-white transition-all duration-300 focus:opacity-100 ${wishlisted ? "opacity-100 bg-white" : "opacity-0 group-hover:opacity-100 bg-white/80"}`}
          >
            <Heart
              className={`w-4 h-4 transition-all duration-200 ${wishlisted ? "fill-rose-500 stroke-rose-500" : "stroke-foreground fill-transparent"}`}
              strokeWidth={1.5}
            />
          </button>

          {/* Carousel dots */}
          {allImages.length > 1 && effectiveColorIdx === null && (
            <div className="absolute bottom-3 group-hover:bottom-12 inset-x-0 flex justify-center gap-1.5 z-20 transition-all duration-300">
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
      <div className="space-y-2 px-0.5">
        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-[0.2em] font-medium">
          {product.brand || "Lucerne Boutique"}
        </p>

        <Link href={`/product/${product.id}`}>
          <h3 className="font-semibold text-foreground text-sm sm:text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-200">
            {product.name}
          </h3>
        </Link>

        {hasVariants && cv.length > 1 && (
          <div className="flex gap-1.5" data-testid={`swatches-${product.id}`}>
            {cv.map((v, idx) => {
              const swatchColors = getSwatchColors(v);
              return (
                <button
                  key={idx}
                  onClick={(e) => handleSwatchClick(e, idx)}
                  onMouseEnter={(e) => handleSwatchHover(e, idx)}
                  onMouseLeave={(e) => handleSwatchHover(e, null)}
                  className={`w-6 h-6 rounded-full border-2 transition-all duration-200 overflow-hidden flex-shrink-0 ${
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
                  {v.mainImage ? (
                    <img
                      src={v.mainImage}
                      alt={v.name}
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
          </div>
        )}

        <div className="flex items-center gap-2">
          {discountPrice ? (
            <>
              <span
                className="font-bold text-destructive text-sm sm:text-base"
                data-testid={`text-discount-price-${product.id}`}
              >
                ₪{discountPrice}
              </span>
              <span
                className="text-xs text-muted-foreground/60 line-through"
                data-testid={`text-original-price-${product.id}`}
              >
                ₪{price}
              </span>
            </>
          ) : (
            <span
              className="font-bold text-sm sm:text-base"
              data-testid={`text-price-${product.id}`}
            >
              ₪{price}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
