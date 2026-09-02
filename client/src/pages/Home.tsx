import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductWatermark } from "@/components/ui/ProductWatermark";
import { AutoplayVideo } from "@/components/ui/AutoplayVideo";
import {
  useBestSellers,
  useFeaturedProducts,
  useNewArrivalsProducts,
  useOnSaleProducts,
  useHomeCategoryProducts,
  useProducts,
} from "@/hooks/use-products";
import { Link } from "wouter";
import {
  ArrowRight,
  ArrowLeft,
  Flame,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { GiButterfly } from "react-icons/gi";
import { useRef, useState, useCallback, useEffect } from "react";
import { useLanguage } from "@/i18n";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  optimizeCloudinaryUrl,
  optimizeCloudinaryVideoUrl,
  blurCloudinaryUrl,
} from "@/lib/utils";

function ProductGrid({ products }: { products: any[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5">
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={index < 4} />
      ))}
    </div>
  );
}

function ViewAllLink({
  href,
  label,
  Arrow,
}: {
  href: string;
  label: string;
  Arrow: React.ElementType;
}) {
  return (
    <Link href={href}>
      <span
        className="group relative inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-[0.2em] font-semibold border border-foreground overflow-hidden cursor-pointer rounded-full"
        data-testid={`link-view-all-${href}`}
      >
        <span className="absolute inset-0 bg-foreground translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
        <span className="relative z-10 text-foreground group-hover:text-background transition-colors duration-300">
          {label}
        </span>
        <Arrow className="relative z-10 w-3.5 h-3.5 text-foreground group-hover:text-background transition-all duration-300 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function BannerImage({
  src,
  alt,
  className,
  style,
  fetchpriority = "low",
  loading = "lazy",
  width,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fetchpriority?: "high" | "low" | "auto";
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
        fetchpriority={fetchpriority}
        loading={loading}
        decoding="async"
        onLoad={() => setReady(true)}
        onError={() => setReady(true)}
      />
    </>
  );
}

function SectionHeading({
  title,
  accent,
  accentColor = "dark",
  icon: Icon,
  testId,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  accentColor?: "dark" | "red";
  icon?: React.ComponentType<{ className?: string }>;
  testId?: string;
}) {
  const isRed = accentColor === "red";
  return (
    <div className="text-center">
      {accent && (
        <>
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] mb-2 ${isRed ? "text-red-700" : "text-foreground/70"}`}
          >
            {Icon && <Icon className="w-3 h-3" />}
            {accent}
          </span>
          <div className="flex justify-center mb-3">
            <span
              className={`block h-px w-8 ${isRed ? "bg-red-700" : "bg-foreground"}`}
            />
          </div>
        </>
      )}
      <h2
        className="font-display text-2xl sm:text-4xl font-semibold"
        data-testid={testId || "section-title"}
      >
        {title}
      </h2>
    </div>
  );
}

export default function Home() {
  const { data: bestSellersData, isLoading: isBestSellersLoading } =
    useBestSellers(20);
  // Needed so an admin-pinned best seller (Content page) still shows up even
  // if that product isn't already among the auto-computed top best sellers.
  const { data: allProductsData } = useProducts();
  const { t, language } = useLanguage();
  const { data: siteSettings } = useSiteSettings();
  const { data: allSubcategories } = useQuery<any[]>({
    queryKey: ["/api/subcategories"],
  });
  const { data: categoriesList } = useQuery<any[]>({
    queryKey: ["/api/categories"],
  });

  // Fetch all products for counts and filtering (same as doc 2 pattern)
  const { data: products, isLoading } = useQuery<any[]>({
    queryKey: ["/api/products"],
  });

  const homeSubcategories = (allSubcategories || []).filter(
    (s: any) => s.showOnHome && s.isActive,
  );
  const categoryMap = (categoriesList || []).reduce(
    (m: Record<number, any>, c: any) => {
      m[c.id] = c;
      return m;
    },
    {} as Record<number, any>,
  );
  const newArrivalsDays = parseInt(
    getSetting(siteSettings, "new_arrivals_days") || "14",
  );
  const { data: featuredProducts, isLoading: isFeaturedLoading } =
    useFeaturedProducts(8);
  const { data: newArrivalsData, isLoading: isNewArrivalsLoading } =
    useNewArrivalsProducts(8, newArrivalsDays);
  const { data: onSaleData } = useOnSaleProducts(8);
  const showOnHomeCatIds: number[] = (categoriesList || [])
    .filter((c: any) => c.showOnHome)
    .map((c: any) => c.id);
  const categoryProductsQueries = useHomeCategoryProducts(showOnHomeCatIds, 8);
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  const bsCarouselRef = useRef<HTMLDivElement>(null);
  const [bsAtStart, setBsAtStart] = useState(true);
  const [bsAtEnd, setBsAtEnd] = useState(false);
  const [heroImgReady, setHeroImgReady] = useState(false);
  const scrollBsCarousel = (dir: "prev" | "next") => {
    const el = bsCarouselRef.current;
    if (!el) return;
    const isRTL = window.getComputedStyle(el).direction === "rtl";
    const sign = isRTL ? -1 : 1;
    el.scrollBy({
      left: dir === "next" ? sign * el.clientWidth : -sign * el.clientWidth,
      behavior: "smooth",
    });
  };
  const onBsScroll = () => {
    const el = bsCarouselRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const scroll = Math.abs(el.scrollLeft);
    setBsAtStart(scroll <= 5);
    setBsAtEnd(scroll >= maxScroll - 5);
  };

  const heroImage = getSetting(siteSettings, "home_hero_image");
  const heroImagePosition =
    getSetting(siteSettings, "home_hero_image_position") || "center";
  const heroVideo = getSetting(siteSettings, "home_hero_video");
  const heroVideoPosition =
    getSetting(siteSettings, "home_hero_video_position") || "50% 50%";
  const heroTag =
    language === "ar"
      ? getSetting(siteSettings, "home_hero_tag_ar")
      : getSetting(siteSettings, "home_hero_tag_en");
  const heroTitle =
    language === "ar"
      ? getSetting(siteSettings, "home_hero_title_ar")
      : getSetting(siteSettings, "home_hero_title_en");
  const heroSubtitle =
    language === "ar"
      ? getSetting(siteSettings, "home_hero_subtitle_ar")
      : getSetting(siteSettings, "home_hero_subtitle_en");

  // Inject <link rel="preload"> for hero media as soon as URL is known so the
  // browser starts fetching it in parallel with JS execution — before React
  // even renders the <img> or <video> element.
  useEffect(() => {
    // Always preload the hero image (used directly for image banners, or as
    // video poster so something visible appears instantly while video buffers)
    const preloadUrl = optimizeCloudinaryUrl(heroImage, 1440) || heroImage;
    if (!preloadUrl) return;

    const existingLinks = document.head.querySelectorAll(
      "link[data-hero-preload]",
    );
    existingLinks.forEach((el) => el.remove());

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

  useEffect(() => {
    setHeroImgReady(false);
  }, [heroImage]);

  // 3D hero mouse tracking
  const heroMouseX = useMotionValue(0.5);
  const heroMouseY = useMotionValue(0.5);
  const heroSmoothX = useSpring(heroMouseX, { stiffness: 50, damping: 18 });
  const heroSmoothY = useSpring(heroMouseY, { stiffness: 50, damping: 18 });
  const heroImgX = useTransform(heroSmoothX, [0, 1], ["2%", "-2%"]);
  const heroImgY = useTransform(heroSmoothY, [0, 1], ["1.5%", "-1.5%"]);
  const heroTextX = useTransform(heroSmoothX, [0, 1], ["-8px", "8px"]);
  const heroTextY = useTransform(heroSmoothY, [0, 1], ["-5px", "5px"]);
  const heroGlareX = useTransform(heroSmoothX, [0, 1], ["15%", "85%"]);
  const heroGlareY = useTransform(heroSmoothY, [0, 1], ["15%", "85%"]);

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    heroMouseX.set((e.clientX - rect.left) / rect.width);
    heroMouseY.set((e.clientY - rect.top) / rect.height);
  };
  const handleHeroMouseLeave = () => {
    heroMouseX.set(0.5);
    heroMouseY.set(0.5);
  };

  // Section headings (admin-configurable, fallback to translations)
  const g = (key: string) => getSetting(siteSettings, key) || "";
  const secNewArrivalsTitle =
    (language === "ar"
      ? g("section_new_arrivals_title_ar")
      : g("section_new_arrivals_title_en")) || t.home.newArrivals;
  const secNewArrivalsSubtitle =
    (language === "ar"
      ? g("section_new_arrivals_subtitle_ar")
      : g("section_new_arrivals_subtitle_en")) || t.home.newArrivalsSubtitle;
  const secFeaturedTitle =
    (language === "ar"
      ? g("section_featured_title_ar")
      : g("section_featured_title_en")) || t.home.featured;
  const secFeaturedSubtitle =
    (language === "ar"
      ? g("section_featured_subtitle_ar")
      : g("section_featured_subtitle_en")) || t.home.featuredSubtitle;
  const secBestSellersTitle =
    (language === "ar"
      ? g("section_best_sellers_title_ar")
      : g("section_best_sellers_title_en")) || t.home.bestSellers;
  const secBestSellersSubtitle =
    (language === "ar"
      ? g("section_best_sellers_subtitle_ar")
      : g("section_best_sellers_subtitle_en")) || t.home.bestSellersSubtitle;
  const secOnSaleTitle =
    (language === "ar"
      ? g("section_on_sale_title_ar")
      : g("section_on_sale_title_en")) || t.home.sales;
  const secOnSaleSubtitle =
    (language === "ar"
      ? g("section_on_sale_subtitle_ar")
      : g("section_on_sale_subtitle_en")) || t.home.salesSubtitle;

  const featured = featuredProducts || [];
  const newArrivals = newArrivalsData || [];
  const bestSellers = bestSellersData || [];
  const onSale = onSaleData || [];

  // Pinned best sellers podium (admin override)
  const allProducts = allProductsData || [];
  const pinnedId1 = getSetting(siteSettings, "best_sellers_pinned_1");
  const pinnedId2 = getSetting(siteSettings, "best_sellers_pinned_2");
  const pinnedId3 = getSetting(siteSettings, "best_sellers_pinned_3");
  // Look up pinned picks across ALL products (not just the auto best-sellers
  // list) so an admin can pin any product from the Content page and have it
  // actually show up, even if it isn't already a top best seller.
  const pinnedProduct1 = pinnedId1
    ? allProducts.find((p: any) => String(p.id) === pinnedId1) ||
      bestSellers.find((p: any) => String(p.id) === pinnedId1)
    : null;
  const pinnedProduct2 = pinnedId2
    ? allProducts.find((p: any) => String(p.id) === pinnedId2) ||
      bestSellers.find((p: any) => String(p.id) === pinnedId2)
    : null;
  const pinnedProduct3 = pinnedId3
    ? allProducts.find((p: any) => String(p.id) === pinnedId3) ||
      bestSellers.find((p: any) => String(p.id) === pinnedId3)
    : null;
  const podiumProducts: [any, any, any] = [
    pinnedProduct1 ?? bestSellers[0],
    pinnedProduct2 ?? bestSellers[1],
    pinnedProduct3 ?? bestSellers[2],
  ];
  const hasPodium = !isBestSellersLoading && podiumProducts.every(Boolean);

  // Per-category sections — uses per-category targeted queries
  const categorySections = (categoriesList || [])
    .filter((c: any) => c.showOnHome)
    .map((c: any, idx: number) => ({
      category: c,
      products: categoryProductsQueries[idx]?.data || [],
      href: ["dresses", "shoes", "clothes"].includes(c.slug)
        ? `/${c.slug}`
        : `/category/${c.slug}`,
    }));

  const skeletonGrid = (
    <>
      <div className="grid grid-cols-2 gap-3 sm:hidden">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="bg-muted aspect-[3/4] mb-4" />
            <div className="h-4 bg-muted w-2/3 mb-2" />
            <div className="h-4 bg-muted w-1/4" />
          </div>
        ))}
      </div>
      <div className="hidden sm:flex gap-5 overflow-x-hidden -mx-6 lg:-mx-8 px-6 lg:px-8 pb-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex-none w-[calc(25%-15px)] animate-pulse">
            <div className="bg-muted aspect-[3/4] mb-4" />
            <div className="h-4 bg-muted w-2/3 mb-2" />
            <div className="h-4 bg-muted w-1/4" />
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero — 3D parallax */}
        <section
          className="relative h-[65vh] sm:h-[78vh] flex items-center justify-center overflow-hidden bg-black"
          onMouseMove={handleHeroMouseMove}
          onMouseLeave={handleHeroMouseLeave}
        >
          {/* Parallax + Ken Burns media (video takes priority) */}
          <motion.div
            className="absolute z-0 will-change-transform"
            style={{ inset: "-7%", x: heroImgX, y: heroImgY }}
            animate={
              heroVideo ? undefined : { scale: [1.0, 1.07, 1.03, 1.08, 1.0] }
            }
            transition={
              heroVideo
                ? undefined
                : { duration: 22, repeat: Infinity, ease: "easeInOut" }
            }
          >
            {heroVideo ? (
              <AutoplayVideo
                src={optimizeCloudinaryVideoUrl(heroVideo, 1440)}
                preload="auto"
                poster={optimizeCloudinaryUrl(heroImage, 1440) || undefined}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: heroVideoPosition,
                }}
              />
            ) : (
              <>
                {blurCloudinaryUrl(heroImage) && (
                  <img
                    src={blurCloudinaryUrl(heroImage) as string}
                    aria-hidden
                    className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-700 scale-110 ${heroImgReady ? "opacity-0" : "opacity-100"}`}
                    style={{ objectPosition: heroImagePosition }}
                  />
                )}
                <img
                  src={optimizeCloudinaryUrl(heroImage, 1440) || heroImage}
                  alt="Hero Fashion"
                  className="w-full h-full object-cover"
                  style={{ objectPosition: heroImagePosition }}
                  fetchpriority="high"
                  decoding="async"
                  onLoad={() => setHeroImgReady(true)}
                  onError={() => setHeroImgReady(true)}
                />
              </>
            )}
          </motion.div>

          {/* Layered depth gradients */}
          <div
            className="absolute inset-0 z-[1] pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 50% 60%, transparent 30%, rgba(0,0,0,0.25) 100%)",
            }}
          />
          <div
            className="absolute inset-0 z-[1] pointer-events-none"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.04) 50%, transparent 100%)",
            }}
          />
          <div
            className="absolute inset-0 z-[1] pointer-events-none"
            style={{
              background:
                "linear-gradient(to bottom, rgba(0,0,0,0.18) 0%, transparent 30%)",
            }}
          />

          {/* Moving glare */}
          <motion.div
            className="absolute z-[2] pointer-events-none"
            style={{
              width: 600,
              height: 600,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 68%)",
              left: heroGlareX,
              top: heroGlareY,
              translateX: "-50%",
              translateY: "-50%",
            }}
          />

          {/* Decorative rotating rings */}
          <div className="absolute inset-0 z-[2] overflow-hidden pointer-events-none">
            <motion.div
              className="absolute rounded-full"
              style={{
                width: 420,
                height: 420,
                border: "1px solid rgba(255,255,255,0.08)",
                right: -100,
                top: -120,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute rounded-full"
              style={{
                width: 240,
                height: 240,
                border: "1px solid rgba(255,255,255,0.06)",
                right: -20,
                top: -50,
              }}
              animate={{ rotate: -360 }}
              transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute rounded-full"
              style={{
                width: 280,
                height: 280,
                border: "1px solid rgba(255,255,255,0.05)",
                left: -70,
                bottom: -80,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
            />
            {/* Horizontal shimmer line */}
            <motion.div
              className="absolute h-px"
              style={{
                background:
                  "linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)",
                left: "8%",
                right: "8%",
                bottom: "22%",
              }}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{
                duration: 1.4,
                delay: 0.5,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          </div>

          {/* 3D floating text content */}
          <motion.div
            className="relative z-10 text-center text-white px-4"
            style={{ x: heroTextX, y: heroTextY }}
          >
            {heroTag && (
              <motion.span
                className="block text-[10px] sm:text-xs uppercase tracking-[0.4em] mb-4 font-light"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 0.8, y: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                style={{ textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}
              >
                {heroTag}
              </motion.span>
            )}
            <motion.h1
              className="font-display text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold mb-4 sm:mb-6 tracking-tight text-balance select-none"
              data-testid="text-hero-title"
              initial={{ opacity: 0, y: 40, rotateX: "20deg" }}
              animate={{ opacity: 1, y: 0, rotateX: "0deg" }}
              transition={{
                duration: 0.85,
                delay: 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{
                textShadow: [
                  "0 1px 0 rgba(255,255,255,0.15)",
                  "0 2px 6px rgba(0,0,0,0.5)",
                  "0 8px 24px rgba(0,0,0,0.35)",
                  "0 16px 48px rgba(0,0,0,0.2)",
                ].join(", "),
              }}
            >
              {heroTitle}
            </motion.h1>
            <motion.p
              className="text-lg md:text-xl font-light mb-10 tracking-wide max-w-2xl mx-auto opacity-90"
              data-testid="text-hero-subtitle"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 0.9, y: 0 }}
              transition={{
                duration: 0.8,
                delay: 0.2,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{ textShadow: "0 2px 10px rgba(0,0,0,0.55)" }}
            >
              {heroSubtitle}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.7,
                delay: 0.32,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <Link href="/shop">
                <span
                  className="group relative inline-flex min-h-12 items-center gap-3 px-6 sm:px-10 py-3.5 sm:py-4 text-xs sm:text-sm uppercase tracking-[0.2em] sm:tracking-widest border border-white overflow-hidden cursor-pointer rounded-full"
                  data-testid="button-shop-collection"
                >
                  <span className="absolute inset-0 bg-white translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
                  <span className="relative z-10 text-white group-hover:text-black transition-colors duration-300 font-semibold">
                    {language === "ar" ? "تسوقي الان" : t.home.shopCollection}
                  </span>
                  <Arrow className="relative z-10 w-4 h-4 text-white group-hover:text-black transition-all duration-300 group-hover:translate-x-1" />
                </span>
              </Link>
            </motion.div>
          </motion.div>
        </section>

        {/* Category Circles */}
        <section className="py-14 sm:py-20 w-full px-4 sm:px-6 lg:px-8 bg-background">
          <div className="text-center mb-10 sm:mb-14">
            <p className="text-xs sm:text-sm text-foreground/50 mb-2">
              {language === "ar" ? "تسوق حسب الفئة" : "Shop by Category"}
            </p>
            <h2 className="font-display text-2xl sm:text-4xl font-semibold">
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
            <section className="w-full overflow-hidden">
              <div className="grid grid-cols-[1fr_1.4fr_1fr] grid-rows-2 gap-1 sm:gap-1.5 h-[340px] sm:h-[440px] lg:h-[520px]">
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
                        fetchpriority="high"
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
                          fetchpriority="high"
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
                        fetchpriority="high"
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

        {/* New Arrivals */}
        {newArrivals.length > 0 && (
          <section className="py-12 sm:py-24 w-full px-4 sm:px-6 lg:px-8 bg-muted/30">
            <div className="relative mb-10 sm:mb-14 flex flex-col items-center">
              <SectionHeading
                title={secNewArrivalsTitle}
                accent="NEW ARRIVALS"
                icon={GiButterfly}
              />
              <div className="absolute end-0 top-1/2 -translate-y-1/2 hidden md:block">
                <ViewAllLink
                  href="/shop"
                  label={t.home.viewAll}
                  Arrow={Arrow}
                />
              </div>
            </div>

            <ProductGrid products={newArrivals} />

            <div className="mt-10 md:hidden flex justify-center">
              <ViewAllLink href="/shop" label={t.home.viewAll} Arrow={Arrow} />
            </div>
          </section>
        )}

        {/* On Sale */}
        {onSale.length > 0 && (
          <section className="bg-background py-12 sm:py-24">
            <div className="w-full px-4 sm:px-6 lg:px-8">
              <div className="relative mb-10 sm:mb-14 flex flex-col items-center">
                <SectionHeading
                  title={secOnSaleTitle}
                  accent="ON SALE"
                  accentColor="red"
                  testId="text-sales-title"
                />
                <div className="absolute end-0 top-1/2 -translate-y-1/2 hidden md:block">
                  <Link href="/sales">
                    <span className="group relative inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-[0.2em] font-semibold border border-red-700 overflow-hidden cursor-pointer rounded-full">
                      <span className="absolute inset-0 bg-red-700 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
                      <span className="relative z-10 text-red-700 group-hover:text-white transition-colors duration-300">
                        {t.home.viewAll}
                      </span>
                      <Arrow className="relative z-10 w-3.5 h-3.5 text-red-700 group-hover:text-white transition-all duration-300 group-hover:translate-x-0.5" />
                    </span>
                  </Link>
                </div>
              </div>
              <ProductGrid products={onSale} />
              <div className="mt-10 md:hidden flex justify-center">
                <Link href="/sales">
                  <span className="group relative inline-flex items-center gap-2 px-5 py-2.5 text-xs uppercase tracking-[0.2em] font-semibold border border-red-700 overflow-hidden cursor-pointer rounded-full">
                    <span className="absolute inset-0 bg-red-700 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out" />
                    <span className="relative z-10 text-red-700 group-hover:text-white transition-colors duration-300">
                      {t.home.viewAll}
                    </span>
                    <Arrow className="relative z-10 w-3.5 h-3.5 text-red-700 group-hover:text-white transition-all duration-300 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* Best Sellers */}
        {bestSellers.length > 0 && (
          <section className="relative py-14 sm:py-24 overflow-hidden bg-background">
            {/* Decorative background text */}
            <span
              aria-hidden
              className="pointer-events-none select-none absolute inset-x-0 top-2 text-center font-display font-bold uppercase text-[clamp(4rem,16vw,13rem)] text-foreground/[0.03] leading-none"
            >
              {language === "ar" ? "الأكثر" : "BEST"}
            </span>

            <div className="relative w-full px-4 sm:px-6 lg:px-8">
              {/* Header */}
              <div className="relative mb-10 sm:mb-14 flex flex-col items-center">
                <SectionHeading
                  title={secBestSellersTitle}
                  accent="BEST SELLERS"
                  testId="section-title-bestsellers"
                />
                <div className="absolute end-0 top-1/2 -translate-y-1/2 hidden md:block">
                  <ViewAllLink
                    href="/shop"
                    label={t.home.viewAll}
                    Arrow={Arrow}
                  />
                </div>
              </div>

              {/* Top 3 editorial showcase */}
              {hasPodium && (
                <div className="grid grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-10 sm:mb-14 lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl lg:mx-auto">
                  {[
                    podiumProducts[1],
                    podiumProducts[0],
                    podiumProducts[2],
                  ].map((product, podiumIdx) => {
                    const rank = podiumIdx === 0 ? 2 : podiumIdx === 1 ? 1 : 3;
                    const isCenter = rank === 1;
                    return (
                      <Link key={product.id} href={`/product/${product.id}`}>
                        <motion.div
                          initial={{ opacity: 0, y: 24 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: podiumIdx * 0.12,
                            duration: 0.5,
                          }}
                          className="relative overflow-hidden group cursor-pointer"
                        >
                          {/* Image */}
                          <div
                            className={`relative overflow-hidden ${isCenter ? "aspect-[2/3]" : "aspect-[3/4] mt-4 sm:mt-8"}`}
                          >
                            <BannerImage
                              src={product.mainImage}
                              alt={product.name}
                              loading="lazy"
                              width={600}
                              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            />
                            {/* Dark gradient overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

                            {/* Watermark: hidden on mobile */}
                            <ProductWatermark
                              size="lg"
                              className="hidden sm:flex"
                            />

                            {/* Rank badge */}
                            <div className="absolute top-2 start-2 z-30 w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white/90 flex items-center justify-center shadow">
                              <span className="font-bold text-[11px] sm:text-sm text-foreground leading-none">
                                {rank}
                              </span>
                            </div>

                            {/* Product info at bottom */}
                            <div className="absolute bottom-0 inset-x-0 p-2 sm:p-4 text-white">
                              {/* "Lucerne" label: hidden on mobile */}
                              <p className="hidden sm:block text-[9px] sm:text-[10px] uppercase tracking-[0.2em] opacity-60 mb-1">
                                Lucerne
                              </p>
                              <h3 className="font-display text-[11px] sm:text-lg font-semibold leading-tight line-clamp-2 mb-1">
                                {product.name}
                              </h3>
                              <div className="flex items-center gap-1.5">
                                {product.discountPrice ? (
                                  <>
                                    <span
                                      className="text-xs sm:text-base font-bold"
                                      style={{ color: "#f87171" }}
                                    >
                                      ₪
                                      {Number(product.discountPrice).toFixed(0)}
                                    </span>
                                    <span className="text-[10px] sm:text-xs opacity-60 line-through">
                                      ₪{Number(product.price).toFixed(0)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-xs sm:text-base font-bold">
                                    ₪{Number(product.price).toFixed(0)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Horizontal scroll carousel for all best sellers */}
              {isBestSellersLoading ? (
                skeletonGrid
              ) : (
                <div className="relative">
                  {/* Scroll buttons */}
                  {bestSellers.length > 3 && (
                    <>
                      <button
                        onClick={() => scrollBsCarousel("prev")}
                        disabled={bsAtStart}
                        className="flex absolute start-1 sm:-start-5 top-[40%] -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-foreground text-background shadow-md items-center justify-center hover:bg-foreground/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        data-testid="button-scroll-bestsellers-prev"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => scrollBsCarousel("next")}
                        disabled={bsAtEnd}
                        className="flex absolute end-1 sm:-end-5 top-[40%] -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-foreground text-background shadow-md items-center justify-center hover:bg-foreground/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        data-testid="button-scroll-bestsellers-next"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  <div
                    ref={bsCarouselRef}
                    onScroll={onBsScroll}
                    className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scroll-smooth scrollbar-hide snap-x snap-mandatory"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    {bestSellers.map((product, idx) => (
                      <motion.div
                        key={product.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04, duration: 0.35 }}
                        className="relative flex-none w-[46vw] sm:w-[220px] lg:w-[200px] snap-start"
                      >
                        <ProductCard product={product} />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-10 md:hidden flex justify-center">
                <ViewAllLink
                  href="/shop"
                  label={t.home.viewAll}
                  Arrow={Arrow}
                />
              </div>
            </div>
          </section>
        )}

        {/* Featured */}
        {featured.length > 0 && (
          <section className="py-12 sm:py-24 bg-muted/30">
            <div className="w-full px-4 sm:px-6 lg:px-8">
              <div className="relative mb-10 sm:mb-14 flex flex-col items-center">
                <SectionHeading
                  title={secFeaturedTitle}
                  accent="TRENDING NOW"
                  icon={Flame}
                />
                <div className="absolute end-0 top-1/2 -translate-y-1/2 hidden md:block">
                  <ViewAllLink
                    href="/shop"
                    label={t.home.viewAll}
                    Arrow={Arrow}
                  />
                </div>
              </div>
              <ProductGrid products={featured} />
              <div className="mt-10 md:hidden flex justify-center">
                <ViewAllLink
                  href="/shop"
                  label={t.home.viewAll}
                  Arrow={Arrow}
                />
              </div>
            </div>
          </section>
        )}

        {/* Per-Category Sections (Shoes, Clothes, etc.) */}
        {categorySections.map((section, idx) => (
          <section
            key={section.category.id}
            className={`py-12 sm:py-24 w-full px-4 sm:px-6 lg:px-8 ${idx % 2 === 0 ? "bg-secondary/30" : "bg-background"}`}
          >
            <div className="relative mb-10 sm:mb-14 flex flex-col items-center">
              <SectionHeading
                title={
                  language === "ar"
                    ? section.category.nameAr || section.category.name
                    : section.category.name
                }
                accent={section.category.name.toUpperCase()}
              />
              <div className="absolute end-0 top-1/2 -translate-y-1/2 hidden md:block">
                <ViewAllLink
                  href={section.href}
                  label={t.home.viewAll}
                  Arrow={Arrow}
                />
              </div>
            </div>
            {section.products.length > 0 ? (
              <>
                <ProductGrid products={section.products} />
                <div className="mt-10 md:hidden flex justify-center">
                  <ViewAllLink
                    href={section.href}
                    label={t.home.viewAll}
                    Arrow={Arrow}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center gap-3 border border-dashed border-border rounded-md">
                {section.category.image && (
                  <img
                    src={
                      optimizeCloudinaryUrl(section.category.image) ||
                      section.category.image
                    }
                    alt={
                      language === "ar"
                        ? section.category.nameAr
                        : section.category.name
                    }
                    loading="lazy"
                    className="w-16 h-16 rounded-full object-cover opacity-50 mb-2"
                  />
                )}
                <p className="text-muted-foreground text-sm">
                  {language === "ar"
                    ? `قريباً — منتجات ${section.category.nameAr || section.category.name} في الطريق`
                    : `Coming soon — ${section.category.name} products on the way`}
                </p>
                <ViewAllLink
                  href={section.href}
                  label={language === "ar" ? "استعرض القسم" : "Browse Category"}
                  Arrow={Arrow}
                />
              </div>
            )}
          </section>
        ))}
      </main>

      <Footer />
    </div>
  );
}
