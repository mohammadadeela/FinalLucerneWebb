import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductWatermark } from "@/components/ui/ProductWatermark";
import { AutoplayVideo } from "@/components/ui/AutoplayVideo";
import { HeroSlider, type HeroSlide } from "@/components/home/HeroSlider";
import { Rail } from "@/components/home/Rail";
import { CategoryGlyph } from "@/components/home/CategoryGlyph";
import { PromoSlider, type PromoSlide } from "@/components/home/PromoSlider";
import {
  useBestSellers,
  useFeaturedProducts,
  useMostOrderedProducts,
  useNewArrivalsProducts,
  useOnSaleProducts,
  useHomeCategoryProducts,
  useProducts,
} from "@/hooks/use-products";
import { Link } from "wouter";
import {
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLanguage } from "@/i18n";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import { useQuery } from "@tanstack/react-query";
import {
  optimizeCloudinaryUrl,
  optimizeCloudinaryVideoUrl,
  blurCloudinaryUrl,
} from "@/lib/utils";
import { categoryHref } from "@/lib/storefront";

/* ────────────────────────────── small building blocks ───────────────────────────── */

function BannerImage({
  src,
  alt,
  className,
  style,
  fetchPriority = "low",
  loading = "lazy",
  width,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fetchPriority?: "high" | "low" | "auto";
  loading?: "eager" | "lazy";
  width?: number;
}) {
  const [ready, setReady] = useState(false);
  const optimized = (optimizeCloudinaryUrl(src, width) || src) ?? undefined;
  const blurSrc = blurCloudinaryUrl(src);
  if (!src) return null;
  return (
    <>
      {blurSrc && (
        <img
          src={blurSrc}
          aria-hidden
          style={style}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-700 scale-110 ${ready ? "opacity-0" : "opacity-100"}`}
        />
      )}
      <img
        src={optimized}
        alt={alt}
        className={className}
        style={style}
        fetchPriority={fetchPriority}
        loading={loading}
        decoding="async"
        onLoad={() => setReady(true)}
        onError={() => setReady(true)}
      />
    </>
  );
}

/** Left-aligned editorial heading with a short berry rule and a "view all" link. */
function SectionHeader({
  title,
  eyebrow,
  href,
  linkLabel,
  tone = "default",
  testId,
}: {
  title: string;
  eyebrow?: string;
  href?: string;
  linkLabel?: string;
  tone?: "default" | "sale";
  testId?: string;
}) {
  const { language } = useLanguage();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  const sale = tone === "sale";
  return (
    <div className="mb-2.5 flex items-end justify-between gap-4 sm:mb-3">
      <div className="min-w-0">
        {eyebrow && (
          <p
            className={`mb-1.5 text-[10px] font-medium uppercase tracking-[0.26em] sm:text-[11px] ${sale ? "text-[#9B1C1C]" : "text-berry"}`}
          >
            {eyebrow}
          </p>
        )}
        <h2
          className="text-2xl font-medium leading-none sm:text-[2rem] rtl:leading-snug"
          data-testid={testId || "section-title"}
        >
          {title}
        </h2>
        <span
          className={`mt-2 block h-[2px] w-10 rounded-full ${sale ? "bg-[#9B1C1C]/70" : "bg-berry/70"}`}
        />
      </div>
      {href && (
        <Link
          href={href}
          className={`group inline-flex shrink-0 items-center gap-2 pb-1 text-[13px] transition-colors sm:text-sm ${sale ? "text-[#9B1C1C]" : "text-foreground hover:text-berry"}`}
          data-testid={`link-view-all-${href}`}
        >
          <span className="underline-offset-4 group-hover:underline">{linkLabel}</span>
          <Arrow className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
        </Link>
      )}
    </div>
  );
}

const RAIL_ITEM =
  "flex-none snap-start w-[44%] sm:w-[calc((100%-1.5rem)/3)] md:w-[calc((100%-2.25rem)/4)] lg:w-[calc((100%-3rem)/5)] xl:w-[calc((100%-3.75rem)/6)] 2xl:w-[calc((100%-4.5rem)/7)]";

/**
 * A row of product cards.
 * - `more` adds a closing "see everything" tile that stretches to fill whatever width is left,
 *   so a short row never ends in a blank gap.
 * - `mobileGrid` shows the first four products as a 2×2 grid on phones (with a button to see
 *   the rest) instead of another sideways slider.
 */
function ProductRail({
  products,
  testId,
  lead,
  more,
  compact,
  mobileGrid,
}: {
  products: any[];
  testId?: string;
  compact?: boolean;
  mobileGrid?: boolean;
  lead?: ReactNode;
  more?: { href: string; label: string; tone?: "default" | "sale" };
}) {
  const { language } = useLanguage();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  const sale = more?.tone === "sale";
  return (
    <>
      {mobileGrid && (
        <div className="sm:hidden">
          <div className="grid grid-cols-2 gap-2.5">
            {products.slice(0, 4).map((product, index) => (
              <ProductCard key={product.id} product={product} priority={index < 2} compact={compact} />
            ))}
          </div>
          {more && products.length > 4 && (
            <Link
              href={more.href}
              className={`mt-3 flex h-10 items-center justify-center gap-2 rounded-full border text-[13px] font-medium ${sale ? "border-[#9B1C1C]/40 text-[#9B1C1C]" : "border-foreground/15 text-foreground"}`}
            >
              {more.label}
              <Arrow className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
      <Rail
        className={mobileGrid ? "hidden sm:block" : ""}
        scrollClassName="gap-2.5 sm:gap-3 pb-1"
        testId={testId}
      >
        {lead && (
          <div role="listitem" className={RAIL_ITEM}>
            {lead}
          </div>
        )}
        {products.map((product, index) => (
          <div key={product.id} role="listitem" className={RAIL_ITEM}>
            <ProductCard product={product} priority={index < 2} compact={compact} />
          </div>
        ))}
        {more && (
          <div role="listitem" className={`${RAIL_ITEM} !flex-auto`}>
            <Link
              href={more.href}
              className={`group flex h-full min-h-[12rem] flex-col items-center justify-center gap-3 rounded-[1.15rem] border border-dashed p-4 text-center transition-colors duration-300 ${
                sale
                  ? "border-[#9B1C1C]/35 bg-white/60 text-[#9B1C1C] hover:bg-white"
                  : "border-berry/35 bg-[hsl(var(--blush)/0.35)] text-foreground hover:bg-[hsl(var(--blush)/0.6)]"
              }`}
              data-testid={testId ? `${testId}-more` : undefined}
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition-transform duration-300 group-hover:scale-110 ${sale ? "bg-[#9B1C1C]" : "bg-berry"}`}
              >
                <Arrow className="h-5 w-5" />
              </span>
              <span className="font-heading text-base font-medium leading-tight sm:text-lg">
                {more.label}
              </span>
            </Link>
          </div>
        )}
      </Rail>
    </>
  );
}

function RailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden sm:gap-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className={`${RAIL_ITEM} animate-pulse`}>
          <div className="mb-3 aspect-[3/4] rounded-2xl bg-muted" />
          <div className="mb-2 h-3.5 w-2/3 rounded bg-muted" />
          <div className="h-3.5 w-1/4 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function Section({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`w-full px-3 pt-3 pb-0 sm:px-6 sm:pt-4 lg:px-10 ${className}`}>
      <div className="mx-auto w-full max-w-[1560px]">{children}</div>
    </section>
  );
}

/* Pastel backdrops that rotate across category tiles (blush / sage / sand). */
const TILE_TINTS = [
  "hsl(var(--blush))",
  "hsl(var(--blush) / 0.75)",
  "hsl(var(--sage))",
  "hsl(var(--blush) / 0.95)",
  "hsl(var(--sand))",
  "hsl(var(--sage) / 0.7)",
];

/* ──────────────────────────────────── page ──────────────────────────────────────── */

export default function Home() {
  const { data: bestSellersData, isLoading: isBestSellersLoading } =
    useBestSellers(20);
  // Needed so an admin-pinned best seller (Content page) still shows up even
  // if that product isn't already among the auto-computed top best sellers.
  const { data: allProductsData } = useProducts();
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const { data: siteSettings } = useSiteSettings();
  const { data: allSubcategories } = useQuery<any[]>({
    queryKey: ["/api/subcategories"],
  });
  const { data: categoriesList } = useQuery<any[]>({
    queryKey: ["/api/categories"],
  });

  const newArrivalsDays = parseInt(
    getSetting(siteSettings, "new_arrivals_days") || "14",
  );
  const { data: featuredProducts, isLoading: isFeaturedLoading } =
    useFeaturedProducts(10);
  const { data: newArrivalsData } = useNewArrivalsProducts(10, newArrivalsDays);
  const { data: onSaleData } = useOnSaleProducts(10);
  const showOnHomeCats = useMemo(
    () => (categoriesList || []).filter((c: any) => c.showOnHome),
    [categoriesList],
  );
  const showOnHomeCatIds: number[] = showOnHomeCats.map((c: any) => c.id);
  const categoryProductsQueries = useHomeCategoryProducts(showOnHomeCatIds, 10);
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const g = (key: string) => getSetting(siteSettings, key) || "";
  const pick = (ar: string, en: string) => (isAr ? ar : en);
  const catName = (c: any) => (isAr ? c?.nameAr || c?.name : c?.name) || "";

  const featured = featuredProducts || [];
  const { data: mostOrderedData } = useMostOrderedProducts(10, 30);
  const mostOrdered = mostOrderedData || [];
  const newArrivals = newArrivalsData || [];
  const bestSellers = bestSellersData || [];
  const onSale = onSaleData || [];
  const allProducts = allProductsData || [];

  /* ── Hero slides ─────────────────────────────────────────────────────────
     Slide 1 is the home hero the admin edits in Content. The following
     slides are assembled automatically from content the admin already
     manages (category banners, their subtitles, the sale banner), so the
     slider stays fresh without a separate "slides" screen to maintain. */
  const heroImage = g("home_hero_image");
  const heroVideo = g("home_hero_video");
  const homeCats = showOnHomeCats.length > 0 ? showOnHomeCats : categoriesList || [];

  const slides: HeroSlide[] = useMemo(() => {
    const list: HeroSlide[] = [];
    const firstCat = homeCats[0];
    list.push({
      key: "home",
      image: heroImage,
      imagePosition: g("home_hero_image_position") || "center",
      video: heroVideo || undefined,
      videoPosition: g("home_hero_video_position") || "50% 50%",
      tag: pick(g("home_hero_tag_ar"), g("home_hero_tag_en")),
      title: pick(g("home_hero_title_ar"), g("home_hero_title_en")),
      subtitle: pick(g("home_hero_subtitle_ar"), g("home_hero_subtitle_en")),
      primary: { label: pick("تسوقي الآن", "Shop Now"), href: "/shop" },
      secondary: firstCat
        ? {
            label: pick(`اكتشفي ${catName(firstCat)}`, `Explore ${catName(firstCat)}`),
            href: categoryHref(firstCat),
          }
        : undefined,
    });

    homeCats.slice(0, 2).forEach((c: any) => {
      const image = g(`${c.slug}_hero_image`) || c.image || "";
      const video = g(`${c.slug}_hero_video`);
      if (!image && !video) return;
      list.push({
        key: `cat-${c.id}`,
        image,
        imagePosition: g(`${c.slug}_hero_image_position`) || "center",
        video: video || undefined,
        videoPosition: g(`${c.slug}_hero_video_position`) || "50% 50%",
        tag: pick("تسوقي حسب القسم", "Shop by category"),
        title: catName(c),
        subtitle: pick(g(`${c.slug}_hero_subtitle_ar`), g(`${c.slug}_hero_subtitle_en`)),
        primary: {
          label: pick(`تسوقي ${catName(c)}`, `Shop ${catName(c)}`),
          href: categoryHref(c),
        },
        secondary: { label: pick("كل المنتجات", "View everything"), href: "/shop" },
      });
    });

    if (onSale.length > 0 && (g("sales_hero_image") || g("sales_hero_video"))) {
      list.push({
        key: "sale",
        image: g("sales_hero_image"),
        imagePosition: g("sales_hero_image_position") || "center",
        video: g("sales_hero_video") || undefined,
        videoPosition: g("sales_hero_video_position") || "50% 50%",
        tag: pick("لفترة محدودة", "Limited time"),
        title:
          pick(g("section_on_sale_title_ar"), g("section_on_sale_title_en")) ||
          t.home.sales,
        subtitle: pick(g("sales_hero_subtitle_ar"), g("sales_hero_subtitle_en")),
        primary: { label: pick("تسوقي التخفيضات", "Shop the Sale"), href: "/sales" },
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteSettings, homeCats, newArrivals.length, onSale.length, language]);

  // Preload the first hero image as soon as its URL is known.
  useEffect(() => {
    const preloadUrl = optimizeCloudinaryUrl(heroImage, 1440) || heroImage;
    if (!preloadUrl) return;
    document.head
      .querySelectorAll("link[data-hero-preload]")
      .forEach((el) => el.remove());
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = preloadUrl;
    link.dataset.heroPreload = "1";
    document.head.appendChild(link);
    return () => {
      document.head
        .querySelectorAll("link[data-hero-preload]")
        .forEach((el) => el.remove());
    };
  }, [heroImage, heroVideo]);

  /* ── Section headings (admin-configurable, fallback to translations) ── */
  const secNewArrivalsTitle =
    pick(g("section_new_arrivals_title_ar"), g("section_new_arrivals_title_en")) ||
    t.home.newArrivals;
  const secFeaturedTitle =
    pick(g("section_featured_title_ar"), g("section_featured_title_en")) ||
    pick("الأكثر طلباً", "Most Wanted");
  const secBestSellersTitle =
    pick(g("section_best_sellers_title_ar"), g("section_best_sellers_title_en")) ||
    t.home.bestSellers;
  const secOnSaleTitle =
    pick(g("section_on_sale_title_ar"), g("section_on_sale_title_en")) ||
    t.home.sales;

  /* ── Pinned best sellers podium (admin override) ── */
  const findPinned = (id: string) =>
    id
      ? allProducts.find((p: any) => String(p.id) === id) ||
        bestSellers.find((p: any) => String(p.id) === id)
      : null;
  const podiumProducts: [any, any, any] = [
    findPinned(g("best_sellers_pinned_1")) ?? bestSellers[0],
    findPinned(g("best_sellers_pinned_2")) ?? bestSellers[1],
    findPinned(g("best_sellers_pinned_3")) ?? bestSellers[2],
  ];
  const hasPodium = !isBestSellersLoading && podiumProducts.every(Boolean);

  /* ── Category tiles: categories the admin marked "show on home" + featured subcategories ── */
  const categoryMap = useMemo(
    () =>
      (categoriesList || []).reduce((m: Record<number, any>, c: any) => {
        m[c.id] = c;
        return m;
      }, {} as Record<number, any>),
    [categoriesList],
  );
  const catTiles = homeCats.map((c: any) => ({
    key: `c-${c.id}`,
    href: categoryHref(c),
    label: catName(c),
    category: c,
    img: c.image || "",
    testId: `link-category-home-${c.id}`,
  }));

  // Photo slider: the admin's own slides; until some are set, the categories' photos fill in.
  const adminSlides = [1, 2, 3, 4]
    .map((n) => ({
      key: `promo-${n}`,
      image: g(`promo_slide_${n}_image`),
      title: pick(g(`promo_slide_${n}_title_ar`), g(`promo_slide_${n}_title_en`)),
      href: g(`promo_slide_${n}_link`) || "/shop",
    }))
    .filter((slide) => slide.image);
  const promoSlides: PromoSlide[] =
    adminSlides.length > 0
      ? adminSlides
      : (categoriesList || [])
          .filter((c: any) => c.image)
          .slice(0, 4)
          .map((c: any) => ({
            key: `promo-cat-${c.id}`,
            image: c.image,
            title: catName(c),
            href: categoryHref(c),
          }));

  // Names the restored category circles + editorial grid expect.
  const products = allProducts;
  const homeSubcategories = (allSubcategories || []).filter(
    (sub: any) => sub.showOnHome && sub.isActive,
  );

  /* ── Per-category rails ── */
  const categorySections = showOnHomeCats.map((c: any, idx: number) => ({
    category: c,
    products: categoryProductsQueries[idx]?.data || [],
    href: categoryHref(c),
  }));

  // "الأكثر طلباً" is driven by real orders from the last 30 days (the server tops the list up
  // with the all-time ranking and the admin's featured picks when recent orders are few).
  // The older lists are only a safety net if that request fails.
  const trending =
    mostOrdered.length > 0 ? mostOrdered : featured.length > 0 ? featured : bestSellers.slice(0, 10);
  const podiumIds = new Set(hasPodium ? podiumProducts.map((p: any) => p.id) : []);
  // The rest of the list, without repeating the three podium pieces (or the trending row when it is a fallback).
  const bestSellerRest = bestSellers.filter(
    (p: any) => !podiumIds.has(p.id),
  );

  // The original category circles (categories + featured subcategories).
  const categoryCircles = (
    <>
        <section className="pt-3 sm:pt-4 pb-0 w-full px-3 sm:px-6 lg:px-8 bg-background">
          <div className="text-center mb-4 sm:mb-6">
            <p className="text-xs sm:text-sm text-foreground/50 mb-2">
              {language === "ar" ? "تسوق حسب الفئة" : "Shop by Category"}
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold">
              {language === "ar" ? "أصنافنا" : "Explore Collections"}
            </h2>
          </div>

          {(() => {
            const showOnHomeCats = (categoriesList || []).filter(
              (c: any) => c.showOnHome,
            );
            const homeCatsRaw =
              showOnHomeCats.length > 0 ? showOnHomeCats : categoriesList || [];
            const homeCats = homeCatsRaw.map((c: any) => ({
              href: ["dresses", "shoes", "clothes"].includes(c.slug)
                ? `/${c.slug}`
                : `/category/${c.slug}`,
              labelAr: c.nameAr || c.name,
              labelEn: c.name,
              img: c.image || "",
              testId: `link-category-home-${c.id}`,
              isSubcategory: false,
              slug: c.slug,
              categoryId: c.id,
            }));
            const DEDICATED: Record<string, string> = {
              dresses: "/dresses",
              shoes: "/shoes",
              clothes: "/clothes",
            };
            const subItems = homeSubcategories.map((sub: any) => {
              const parentCat = categoryMap[sub.categoryId];
              const parentSlug = parentCat?.slug || "";
              const base = DEDICATED[parentSlug] ?? `/category/${parentSlug}`;
              return {
                href: `${base}?sub=${sub.id}`,
                labelAr: sub.nameAr || sub.name,
                labelEn: sub.name,
                img: sub.image || "",
                testId: `link-subcategory-home-${sub.id}`,
                isSubcategory: true,
                slug: "",
                subcategoryId: sub.id,
              };
            });
            const allItems = [...homeCats, ...subItems];
            return (
              <div className="flex flex-wrap justify-center gap-x-2 gap-y-4 sm:gap-x-4 sm:gap-y-6 md:gap-x-5 md:gap-y-8 max-w-7xl mx-auto px-2 [&>*]:basis-[calc((100%-4*0.5rem)/5)] sm:[&>*]:basis-[calc((100%-8*1rem)/9)] md:[&>*]:basis-[calc((100%-8*1.25rem)/9)]">
                {allItems.map((item) => {
                  const count = !item.isSubcategory
                    ? (products || []).filter(
                        (p: any) => p.categoryId === (item as any).categoryId,
                      ).length
                    : (products || []).filter((p: any) => {
                        const ids: number[] = Array.isArray(p.subcategoryIds)
                          ? p.subcategoryIds
                          : [];
                        const target = (item as any).subcategoryId;
                        return (
                          ids.includes(target) || p.subcategoryId === target
                        );
                      }).length;
                  return (
                    <Link key={item.href} href={item.href}>
                      <motion.div
                        whileHover={{
                          rotateY: 12,
                          rotateX: -8,
                          scale: 1.06,
                          y: -8,
                        }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        style={{
                          perspective: "700px",
                          transformStyle: "preserve-3d",
                        }}
                        className="group flex flex-col items-center gap-1.5 sm:gap-3 cursor-pointer"
                        data-testid={item.testId}
                      >
                        <motion.div
                          className="relative mx-auto w-[56px] h-[56px] sm:w-[90px] sm:h-[90px] md:w-[110px] md:h-[110px]"
                          style={{ transformStyle: "preserve-3d" }}
                          animate={{ y: [0, -6, 0] }}
                          transition={{
                            duration:
                              4 +
                              (((item as any).categoryId ??
                                (item as any).subcategoryId ??
                                0) %
                                3) *
                                0.5,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay:
                              (((item as any).categoryId ??
                                (item as any).subcategoryId ??
                                0) %
                                5) *
                              0.3,
                          }}
                        >
                          {count > 0 && (
                            <span className="absolute top-0 start-0 z-20 min-w-[16px] h-[16px] sm:min-w-[22px] sm:h-[22px] px-1 sm:px-1.5 rounded-full bg-foreground text-background text-[9px] sm:text-[11px] font-bold flex items-center justify-center shadow">
                              {count}
                            </span>
                          )}

                          {/* Slow rotating conic-gradient ring (idle shimmer) */}
                          <motion.div
                            className="absolute -inset-[3px] rounded-full pointer-events-none opacity-70"
                            style={{
                              background:
                                "conic-gradient(from 0deg, rgba(0,0,0,0.0) 0deg, rgba(0,0,0,0.18) 80deg, rgba(0,0,0,0.0) 160deg, rgba(0,0,0,0.0) 360deg)",
                              filter: "blur(2px)",
                            }}
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 14,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          />
                          {/* Pulsing ambient glow (idle) */}
                          <motion.div
                            className="absolute inset-0 rounded-full pointer-events-none"
                            animate={{
                              boxShadow: [
                                "0 0 0px 0px rgba(0,0,0,0.00)",
                                "0 0 22px 2px rgba(0,0,0,0.10)",
                                "0 0 0px 0px rgba(0,0,0,0.00)",
                              ],
                            }}
                            transition={{
                              duration: 3.2,
                              repeat: Infinity,
                              ease: "easeInOut",
                            }}
                          />
                          {/* Hover shadow boost */}
                          <motion.div
                            className="absolute inset-0 rounded-full pointer-events-none"
                            style={{ boxShadow: "0 0 0 0px rgba(0,0,0,0)" }}
                            whileHover={{
                              boxShadow:
                                "0 20px 60px rgba(0,0,0,0.28), 0 8px 20px rgba(0,0,0,0.18)",
                            }}
                            transition={{ duration: 0.35 }}
                          />
                          <div
                            className="w-full h-full rounded-full overflow-hidden relative"
                            style={{
                              boxShadow:
                                "0 6px 24px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.10)",
                            }}
                          >
                            <BannerImage
                              src={item.img || "/placeholder-product.svg"}
                              alt={
                                language === "ar" ? item.labelAr : item.labelEn
                              }
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                              width={120}
                            />
                            {/* Diagonal sheen sweep (idle, slow) */}
                            <motion.div
                              className="absolute inset-0 pointer-events-none"
                              style={{
                                background:
                                  "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.35) 50%, transparent 65%)",
                                mixBlendMode: "overlay",
                              }}
                              animate={{ x: ["-120%", "120%"] }}
                              transition={{
                                duration: 5.5,
                                repeat: Infinity,
                                repeatDelay: 3,
                                ease: "easeInOut",
                                delay:
                                  (((item as any).categoryId ??
                                    (item as any).subcategoryId ??
                                    0) %
                                    7) *
                                  0.4,
                              }}
                            />
                          </div>
                        </motion.div>
                        <div className="text-center">
                          <p className="font-semibold text-[10px] sm:text-base tracking-wide group-hover:text-foreground/70 transition-colors duration-200 leading-tight">
                            {language === "ar" ? item.labelAr : item.labelEn}
                          </p>
                        </div>
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            );
          })()}
        </section>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 pb-6">
        <HeroSlider slides={slides} isAr={isAr} />

        {/* ── Shop by category: pills directly under the hero (desktop), as in the design ── */}
        {catTiles.length > 0 && (
          <Section>
            {/* Phones: every pill in one row, sized down to fit — no sliding */}
            <div
              className="grid gap-1.5 sm:hidden"
              style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(catTiles.length, 1), 5)}, minmax(0, 1fr))` }}
              data-testid="row-categories-mobile"
            >
              {catTiles.map((item, i) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex aspect-[1.9/1] min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-blush/80 via-blush/45 to-sand/70 ring-1 ring-berry/10"
                  data-testid={`pill-m-${item.testId}`}
                >
                  <span
                    className="relative block h-full w-[42%] shrink-0 overflow-hidden"
                    style={{ background: TILE_TINTS[i % TILE_TINTS.length] }}
                  >
                    <BannerImage
                      src={item.img || "/placeholder-product.svg"}
                      alt={item.label}
                      className="h-full w-full object-cover"
                      loading="eager"
                      width={160}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center justify-center px-1">
                    <span className="block max-w-full truncate text-[11px] font-medium leading-tight">
                      {item.label}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <Rail className="hidden sm:block" scrollClassName="gap-3 lg:gap-5 pb-2" testId="rail-categories">
              {catTiles.map((item, i) => (
                <Link
                  key={item.key}
                  href={item.href}
                  role="listitem"
                  className="group relative flex aspect-[2.44/1] w-[58%] flex-none snap-start overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-blush/80 via-blush/45 to-sand/70 ring-1 ring-berry/10 transition-all sm:rounded-[2.5rem] duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-22px_rgba(0,0,0,0.4)] sm:w-[calc((100%-1rem)/2)] md:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3.75rem)/4)]"
                  data-testid={`pill-${item.testId}`}
                >
                  <span
                    className="relative block h-full w-[56%] shrink-0 overflow-hidden"
                    style={{ background: TILE_TINTS[i % TILE_TINTS.length] }}
                  >
                    <BannerImage
                      src={item.img || "/placeholder-product.svg"}
                      alt={item.label}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                      width={400}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 sm:gap-2.5 sm:px-3">
                    <span className="font-heading block min-w-0 truncate text-[15px] font-medium leading-tight sm:text-lg lg:text-[1.35rem]">
                      {item.label}
                    </span>
                    <Arrow className="h-4 w-4 shrink-0 text-berry transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 sm:h-[18px] sm:w-[18px]" />
                  </span>
                </Link>
              ))}
            </Rail>
          </Section>
        )}

        {/* ── Most wanted: soft panel of white tiles — photo, price, name ── */}
        {trending.length > 0 && (
          <Section>
            <div className="overflow-hidden rounded-[1.5rem] bg-blush/50 p-3 sm:rounded-[1.75rem] sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
                <h2
                  className="truncate text-xl font-medium leading-none sm:text-[1.75rem] rtl:leading-snug"
                  data-testid="section-title-trending"
                >
                  {secFeaturedTitle}
                </h2>
                <Link
                  href="/shop"
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-foreground px-4 text-[12.5px] font-medium text-background transition-colors hover:bg-berry sm:h-10 sm:px-5 sm:text-[13px]"
                  data-testid="link-view-all-/shop"
                >
                  {pick("تسوقي الكل", "Shop all")}
                  <Arrow className="h-4 w-4" />
                </Link>
              </div>
              <div
                className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7"
                data-testid="rail-trending"
              >
                {trending.slice(0, 7).map((product: any, i: number) => {
                  const price = parseFloat(String(product.discountPrice ?? product.price));
                  return (
                    <Link
                      key={product.id}
                      href={`/product/${product.id}`}
                      className={`group flex-col items-center rounded-[1.25rem] bg-white p-2 text-center transition-shadow duration-300 hover:shadow-[0_18px_36px_-24px_rgba(0,0,0,0.45)] sm:rounded-[1.5rem] sm:p-2.5 ${i < 6 ? "flex" : "hidden"} ${i < 4 ? "sm:flex" : "sm:hidden"} ${i < 5 ? "md:flex" : "md:hidden"} ${i < 6 ? "lg:flex" : "lg:hidden"} ${i < 7 ? "xl:flex" : "xl:hidden"}`}
                      data-testid={`tile-trending-${product.id}`}
                    >
                      <span className="relative block aspect-square w-full overflow-hidden rounded-[0.9rem] bg-sand sm:rounded-[1.1rem]">
                        <BannerImage
                          src={product.mainImage}
                          alt={product.name}
                          width={400}
                          loading={i < 6 ? "eager" : "lazy"}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </span>
                      <span className="price-text ltr-num mt-2 text-[14px] leading-tight text-berry sm:text-base">
                        ₪{Number.isInteger(price) ? price : price.toFixed(2)}
                      </span>
                      <span className="mt-0.5 line-clamp-1 w-full text-[12px] text-foreground/75 sm:text-[13px]">
                        {product.name}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </Section>
        )}

        {/* ── New arrivals ── */}
        {newArrivals.length > 0 && (
          <Section>
            <SectionHeader
              title={secNewArrivalsTitle}
              eyebrow={pick("وصل للتو", "Just landed")}
              href="/shop"
              linkLabel={t.home.viewAll}
              testId="section-title-new-arrivals"
            />
            <ProductRail
              products={newArrivals}
              testId="rail-new-arrivals"
              mobileGrid
              more={{ href: "/shop", label: pick("كل المنتجات", "Shop everything") }}
            />
          </Section>
        )}

        {/* ── Photo slider — photos, titles and links are set by the admin (Content → Home) ── */}
        {promoSlides.length > 0 && (
          <Section>
            <PromoSlider slides={promoSlides} isAr={isAr} />
          </Section>
        )}

        {/* ── On sale ── */}
        {onSale.length > 0 && (
          <Section>
            <SectionHeader
              title={secOnSaleTitle}
              eyebrow={pick("أسعار مخفّضة", "Marked down")}
              href="/sales"
              linkLabel={t.home.viewAll}
              tone="sale"
              testId="text-sales-title"
            />
            <ProductRail
              products={onSale}
              testId="rail-on-sale"
              more={{ href: "/sales", label: pick("كل التخفيضات", "All sale pieces"), tone: "sale" }}
            />
          </Section>
        )}

        {/* Editorial Category Grid */}
        {(() => {
          const editorialCats = (categoriesList || [])
            .filter((c: any) => c.showOnHome)
            .slice(0, 4);
          const fallbackCats =
            editorialCats.length > 0
              ? editorialCats
              : (categoriesList || []).slice(0, 4);
          if (fallbackCats.length < 1) return null;
          const centerImage =
            getSetting(siteSettings, "editorial_center_image") ||
            "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=900&q=80";
          const headlineAr =
            getSetting(siteSettings, "editorial_headline_ar") ||
            "تشكيلة جديدة\nبأسلوب راقٍ";
          const headlineEn =
            getSetting(siteSettings, "editorial_headline_en") ||
            "New Collection\nRefined Style";
          const headline = language === "ar" ? headlineAr : headlineEn;
          const DEDICATED: Record<string, string> = {
            dresses: "/dresses",
            shoes: "/shoes",
            clothes: "/clothes",
          };
          const tileLink = (c: any, subId?: string) => {
            const base = DEDICATED[c.slug] ?? `/category/${c.slug}`;
            return subId ? `${base}?sub=${subId}` : base;
          };
          const allCats = categoriesList || [];
          const allSubs = allSubcategories || [];
          const tiles = [0, 1, 2, 3].map((i) => {
            const savedCatId = getSetting(
              siteSettings,
              `editorial_tile_${i + 1}_category_id`,
            );
            const savedSubId = getSetting(
              siteSettings,
              `editorial_tile_${i + 1}_subcategory_id`,
            );
            const cat = savedCatId
              ? allCats.find((c: any) => String(c.id) === savedCatId)
              : fallbackCats[i];
            const sub = savedSubId
              ? allSubs.find((s: any) => String(s.id) === savedSubId)
              : null;
            return {
              img:
                getSetting(siteSettings, `editorial_tile_${i + 1}_image`) ||
                sub?.image ||
                cat?.image ||
                "",
              video:
                getSetting(siteSettings, `editorial_tile_${i + 1}_video`) || "",
              labelAr:
                sub?.nameAr || sub?.name || cat?.nameAr || cat?.name || "",
              labelEn: sub?.name || cat?.name || "",
              href: cat
                ? tileLink(cat, sub ? String(sub.id) : undefined)
                : "/shop",
            };
          });
          const [tl, tr, bl, br] = tiles;
          return (
            <section className="w-full px-3 sm:px-6 lg:px-10 pt-3 sm:pt-4 pb-0 bg-background">
              <div className="mx-auto max-w-[1560px] grid grid-cols-[1fr_1.4fr_1fr] grid-rows-2 gap-1 sm:gap-1.5 h-[340px] sm:h-[440px] lg:h-[520px] rounded-2xl overflow-hidden">
                {/* Top-left tile */}
                <Link href={tl.href}>
                  <div className="relative overflow-hidden group cursor-pointer h-full bg-muted">
                    {tl.video ? (
                      <AutoplayVideo
                        src={optimizeCloudinaryVideoUrl(tl.video) || tl.video}
                        poster={
                          optimizeCloudinaryUrl(tl.img) || tl.img || undefined
                        }
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : tl.img ? (
                      <BannerImage
                        src={tl.img}
                        alt={language === "ar" ? tl.labelAr : tl.labelEn}
                        fetchPriority="high"
                        loading="eager"
                        width={400}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    <span className="absolute bottom-2 start-3 sm:bottom-4 sm:start-4 text-white text-xs sm:text-sm font-semibold tracking-wide drop-shadow">
                      {language === "ar" ? tl.labelAr : tl.labelEn}
                    </span>
                  </div>
                </Link>
                {/* Center panel — row-span-2 */}
                {(() => {
                  const centerVideo =
                    getSetting(siteSettings, "editorial_center_video") || "";
                  return (
                    <div className="relative row-span-2 overflow-hidden group">
                      {centerVideo ? (
                        <AutoplayVideo
                          src={
                            optimizeCloudinaryVideoUrl(centerVideo) ||
                            centerVideo
                          }
                          poster={
                            optimizeCloudinaryUrl(centerImage) ||
                            centerImage ||
                            undefined
                          }
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      ) : (
                        <BannerImage
                          src={centerImage}
                          alt="editorial"
                          fetchPriority="high"
                          loading="eager"
                          width={800}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/30" />
                      <div
                        className={`absolute top-4 sm:top-8 ${language === "ar" ? "right-4 sm:right-6 text-right" : "left-4 sm:left-6 text-left"} text-white`}
                      >
                        {headline.split("\n").map((line, i) => (
                          <p
                            key={i}
                            className={`font-display font-bold leading-tight ${i === 0 ? "text-lg sm:text-3xl md:text-4xl" : "text-base sm:text-2xl md:text-3xl opacity-90"}`}
                          >
                            {line}
                          </p>
                        ))}
                      </div>
                      <Link href="/shop">
                        <div className="absolute bottom-3 sm:bottom-5 inset-x-0 flex justify-center">
                          <span className="bg-white/90 text-foreground text-[10px] sm:text-xs uppercase tracking-[0.2em] font-semibold px-3 py-1.5 sm:px-5 sm:py-2 hover:bg-white transition-colors cursor-pointer">
                            {language === "ar" ? "تسوقي الآن" : "Shop Now"}
                          </span>
                        </div>
                      </Link>
                    </div>
                  );
                })()}
                {/* Top-right tile */}
                <Link href={tr.href}>
                  <div className="relative overflow-hidden group cursor-pointer h-full bg-muted">
                    {tr.video ? (
                      <AutoplayVideo
                        src={optimizeCloudinaryVideoUrl(tr.video) || tr.video}
                        poster={
                          optimizeCloudinaryUrl(tr.img) || tr.img || undefined
                        }
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : tr.img ? (
                      <BannerImage
                        src={tr.img}
                        alt={language === "ar" ? tr.labelAr : tr.labelEn}
                        fetchPriority="high"
                        loading="eager"
                        width={400}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    <span className="absolute bottom-2 start-3 sm:bottom-4 sm:start-4 text-white text-xs sm:text-sm font-semibold tracking-wide drop-shadow">
                      {language === "ar" ? tr.labelAr : tr.labelEn}
                    </span>
                  </div>
                </Link>
                {/* Bottom-left tile */}
                <Link href={bl.href}>
                  <div className="relative overflow-hidden group cursor-pointer h-full bg-muted">
                    {bl.video ? (
                      <AutoplayVideo
                        src={optimizeCloudinaryVideoUrl(bl.video) || bl.video}
                        poster={
                          optimizeCloudinaryUrl(bl.img) || bl.img || undefined
                        }
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : bl.img ? (
                      <BannerImage
                        src={bl.img}
                        alt={language === "ar" ? bl.labelAr : bl.labelEn}
                        loading="lazy"
                        width={400}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    <span className="absolute bottom-2 start-3 sm:bottom-4 sm:start-4 text-white text-xs sm:text-sm font-semibold tracking-wide drop-shadow">
                      {language === "ar" ? bl.labelAr : bl.labelEn}
                    </span>
                  </div>
                </Link>
                {/* Bottom-right tile */}
                <Link href={br.href}>
                  <div className="relative overflow-hidden group cursor-pointer h-full bg-muted">
                    {br.video ? (
                      <AutoplayVideo
                        src={optimizeCloudinaryVideoUrl(br.video) || br.video}
                        poster={
                          optimizeCloudinaryUrl(br.img) || br.img || undefined
                        }
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : br.img ? (
                      <BannerImage
                        src={br.img}
                        alt={language === "ar" ? br.labelAr : br.labelEn}
                        loading="lazy"
                        width={400}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                    <span className="absolute bottom-2 start-3 sm:bottom-4 sm:start-4 text-white text-xs sm:text-sm font-semibold tracking-wide drop-shadow">
                      {language === "ar" ? br.labelAr : br.labelEn}
                    </span>
                  </div>
                </Link>
              </div>
            </section>
          );
        })()}

        {/* Category circles */}
        {categoryCircles}

        {/* ── Best sellers ── */}
        {bestSellers.length > 0 && (
          <Section>
            <SectionHeader
              title={secBestSellersTitle}
              eyebrow={pick("اختيار عميلاتنا", "Customer favourites")}
              href="/shop"
              linkLabel={t.home.viewAll}
              testId="section-title-bestsellers"
            />

            {isBestSellersLoading ? (
              <RailSkeleton />
            ) : (
              <>
                <div
                  className={
                    hasPodium && bestSellerRest.length >= 4
                      ? "lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-10 xl:gap-14"
                      : "lg:mx-auto lg:max-w-4xl"
                  }
                >
                  {hasPodium && (
                  <div className="grid grid-cols-3 gap-2.5 sm:gap-4 lg:gap-5">
                    {[podiumProducts[1], podiumProducts[0], podiumProducts[2]].map(
                      (product, podiumIdx) => {
                        const rank = podiumIdx === 0 ? 2 : podiumIdx === 1 ? 1 : 3;
                        const isCenter = rank === 1;
                        return (
                          <Link key={`${rank}-${product.id}`} href={`/product/${product.id}`}>
                            <div
                              className={`group relative cursor-pointer overflow-hidden rounded-2xl sm:rounded-[1.75rem] ${isCenter ? "aspect-[2/3]" : "mt-4 aspect-[3/4] sm:mt-8"}`}
                            >
                              <BannerImage
                                src={product.mainImage}
                                alt={product.name}
                                loading="lazy"
                                width={600}
                                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
                              <ProductWatermark size="lg" className="hidden sm:flex" />
                              <div className="absolute start-2 top-2 z-30 flex h-6 w-6 items-center justify-center rounded-full bg-white/95 shadow sm:start-3 sm:top-3 sm:h-9 sm:w-9">
                                <span className="text-[11px] font-bold leading-none text-berry sm:text-sm">
                                  {rank}
                                </span>
                              </div>
                              <div className="absolute inset-x-0 bottom-0 p-2 text-white sm:p-4">
                                <h3 className="mb-1 line-clamp-2 text-[11px] font-semibold leading-tight sm:text-lg">
                                  {product.name}
                                </h3>
                                <div className="flex items-center gap-1.5">
                                  {product.discountPrice ? (
                                    <>
                                      <span className="text-xs font-bold text-[#fca5a5] sm:text-base">
                                        ₪{Number(product.discountPrice).toFixed(0)}
                                      </span>
                                      <span className="text-[10px] line-through opacity-60 sm:text-xs">
                                        ₪{Number(product.price).toFixed(0)}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-xs font-bold sm:text-base">
                                      ₪{Number(product.price).toFixed(0)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </Link>
                        );
                      },
                    )}
                  </div>
                  )}

                  {/* Desktop: ranks 4–9 as a compact chart beside the podium */}
                  {hasPodium && bestSellerRest.length >= 4 && (
                    <ol className="hidden grid-cols-2 gap-x-5 gap-y-3 lg:grid">
                      {bestSellerRest.slice(0, 6).map((product: any, i: number) => (
                        <li key={product.id}>
                          <Link
                            href={`/product/${product.id}`}
                            className="group flex items-center gap-3.5 rounded-2xl border border-transparent bg-card p-2 pe-4 ring-1 ring-black/[0.05] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-26px_rgba(74,24,43,0.5)]"
                            data-testid={`link-bestseller-rank-${i + 4}`}
                          >
                            <span className="relative block h-[5.5rem] w-[4.25rem] shrink-0 overflow-hidden rounded-xl bg-[hsl(var(--sand))]">
                              <BannerImage
                                src={product.mainImage}
                                alt={product.name}
                                width={200}
                                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 block text-[15px] font-medium leading-snug transition-colors group-hover:text-berry">
                                {product.name}
                              </span>
                              <span className="mt-1 flex items-baseline gap-2 text-sm">
                                {product.discountPrice ? (
                                  <>
                                    <span className="ltr-num font-semibold text-[#9B1C1C]">
                                      ₪ {Number(product.discountPrice).toFixed(0)}
                                    </span>
                                    <span className="ltr-num text-xs text-muted-foreground/70 line-through">
                                      ₪ {Number(product.price).toFixed(0)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="ltr-num font-semibold">
                                    ₪ {Number(product.price).toFixed(0)}
                                  </span>
                                )}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {/* Phones / tablets (and short lists): the rest as a swipeable rail */}
                {bestSellerRest.length > 0 && (
                  <div className={`mt-7 sm:mt-9 ${hasPodium && bestSellerRest.length >= 4 ? "lg:hidden" : ""}`}>
                    <ProductRail
                      products={bestSellerRest}
                      testId="rail-bestsellers"
                      more={{ href: "/shop", label: pick("كل المنتجات", "Shop everything") }}
                    />
                  </div>
                )}
              </>
            )}
          </Section>
        )}

        {/* ── One rail per category the admin shows on the home page ── */}
        {categorySections
          .filter((s) => s.products.length > 0)
          .map((section, idx) => (
            <Section
              key={section.category.id}
              className=""
            >
              <div className="relative mb-4 flex items-center justify-between gap-4 overflow-hidden rounded-[1.5rem] bg-white px-5 py-4 ring-1 ring-black/[0.05] sm:mb-5 sm:px-8 sm:py-5">
                <CategoryGlyph
                  category={section.category}
                  className="pointer-events-none absolute -bottom-5 start-3 h-24 w-24 -rotate-6 text-berry/[0.1] sm:start-6 sm:h-32 sm:w-32"
                />
                <div className="relative min-w-0 ps-12 sm:ps-24">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.26em] text-berry sm:text-[11px]">
                    {pick("من أقسامنا", "From our collections")}
                  </p>
                  <h2
                    className="truncate text-2xl font-medium leading-none sm:text-[2rem] rtl:leading-snug"
                    data-testid={`section-title-category-${section.category.id}`}
                  >
                    {catName(section.category)}
                  </h2>
                </div>
                <Link
                  href={section.href}
                  className="group relative inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-foreground px-4 text-[13px] font-medium text-background transition-colors duration-300 hover:bg-berry sm:h-11 sm:px-6 sm:text-sm"
                  data-testid={`link-view-all-${section.href}`}
                >
                  {t.home.viewAll}
                  <Arrow className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                </Link>
              </div>
              <ProductRail
                products={section.products}
                testId={`rail-category-${section.category.id}`}
                mobileGrid
                more={{
                  href: section.href,
                  label: pick(`كل ${catName(section.category)}`, `All ${catName(section.category)}`),
                }}
              />
            </Section>
          ))}

      </main>

      <Footer />
    </div>
  );
}
