import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { SeasonalHeroOverlay } from "@/components/seasonal/SeasonalDecor";
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
    <div className="lucerne-product-grid grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-5">
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
    <div className="lucerne-section-heading text-start">
      {accent && (
        <>
          <span
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.25em] mb-2 ${isRed ? "text-red-700" : "text-foreground/70"}`}
          >
            {Icon && <Icon className="w-3 h-3" />}
            {accent}
          </span>
          <div className="flex justify-start mb-3">
            <span
              className={`block h-px w-8 ${isRed ? "bg-red-700" : "bg-foreground"}`}
            />
          </div>
        </>
      )}
      <h2
        className="font-display text-3xl sm:text-5xl font-semibold"
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
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
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


  // The existing admin-controlled home hero remains the first slide.
  // Subsequent slides are built only from media already configured for the store.
  const editorialImage = getSetting(siteSettings, "editorial_center_image");
  const editorialVideo = getSetting(siteSettings, "editorial_center_video");
  const shoesCategory = (categoriesList || []).find((c: any) => c.slug === "shoes" && c.image);
  const heroSlides = [
    {
      image: heroImage || "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=1600&q=85",
      video: heroVideo,
      position: heroImagePosition,
      videoPosition: heroVideoPosition,
      tag: heroTag || (language === "ar" ? "لوسيرن بوتيك" : "LUCERNE BOUTIQUE"),
      title: heroTitle || (language === "ar" ? "ستايلك، قصتك" : "Your style, your story."),
      subtitle: heroSubtitle || (language === "ar" ? "اكتشفي التشكيلة الجديدة" : "Discover the new collection"),
      href: "/shop",
      button: language === "ar" ? "تسوقي الجديد" : "Shop New In",
    },
    ...(editorialImage || editorialVideo ? [{
      image: editorialImage || heroImage,
      video: editorialVideo,
      position: "center",
      videoPosition: "center",
      tag: language === "ar" ? "مختارة لإطلالتك" : "THE NEW SEASON",
      title: getSetting(siteSettings, language === "ar" ? "editorial_headline_ar" : "editorial_headline_en") || (language === "ar" ? "تشكيلة الموسم الجديد" : "The New Season Collection"),
      subtitle: language === "ar" ? "قطع مميزة لكل يوم" : "Effortless pieces for every day",
      href: "/shop",
      button: language === "ar" ? "اكتشفي التشكيلة" : "Discover Collection",
    }] : []),
    ...(shoesCategory ? [{
      image: shoesCategory.image,
      video: "",
      position: "center",
      videoPosition: "center",
      tag: language === "ar" ? "إطلالتك تبدأ من هنا" : "STEP INTO STYLE",
      title: language === "ar" ? "أحذية لكل إطلالة" : "Your perfect pair.",
      subtitle: language === "ar" ? "اكتشفي أحدث الأحذية" : "Find the shoes you'll love",
      href: "/shoes",
      button: language === "ar" ? "تسوقي الأحذية" : "Shop Shoes",
    }] : []),
  ];
  const currentHero = heroSlides[heroSlideIndex % heroSlides.length];
  useEffect(() => {
    if (heroPaused || heroSlides.length < 2) return;
    const timer = window.setInterval(() => setHeroSlideIndex((i) => (i + 1) % heroSlides.length), 6500);
    return () => window.clearInterval(timer);
  }, [heroPaused, heroSlides.length]);
  const changeHero = (direction: number) => {
    setHeroSlideIndex((i) => (i + direction + heroSlides.length) % heroSlides.length);
  };

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

  const featured = featuredProducts?.length ? featuredProducts : (newArrivalsData?.length ? newArrivalsData : (allProductsData || []).slice(0, 8));
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
    <div className="lucerne-store lucerne-home min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">

        {/* Editorial split hero with real admin media and accessible slide controls */}
        <section
          className="lucerne-editorial-hero"
          aria-roledescription="carousel"
          aria-label={language === "ar" ? "تشكيلات لوسيرن" : "Lucerne collections"}
          onMouseEnter={() => setHeroPaused(true)}
          onMouseLeave={() => setHeroPaused(false)}
          onFocus={() => setHeroPaused(true)}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHeroPaused(false); }}
        >
          <div className="lucerne-hero-stage" key={heroSlideIndex}>
            <div className="lucerne-hero-media">
              {currentHero.video ? (
                <AutoplayVideo
                  src={optimizeCloudinaryVideoUrl(currentHero.video, 1440) || currentHero.video}
                  preload="auto"
                  poster={optimizeCloudinaryUrl(currentHero.image, 1440) || currentHero.image || undefined}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: currentHero.videoPosition }}
                />
              ) : (
                <BannerImage
                  src={currentHero.image}
                  alt={currentHero.title}
                  className="w-full h-full object-cover"
                  style={{ objectPosition: currentHero.position }}
                  width={1440}
                  fetchPriority={heroSlideIndex === 0 ? "high" : "auto"}
                  loading="eager"
                />
              )}
            </div>
            <div className="lucerne-hero-copy">
              <span className="lucerne-hero-eyebrow">{currentHero.tag}</span>
              <h1 className="lucerne-hero-title" data-testid="text-hero-title">
                {currentHero.title.split(/[,،]/).length > 1 ? (
                  <>
                    {currentHero.title.split(/[,،]/)[0]}{language === "ar" ? "،" : ","}
                    <br />
                    <em>{currentHero.title.split(/[,،]/).slice(1).join(language === "ar" ? "،" : ",").trim()}</em>
                  </>
                ) : currentHero.title}
              </h1>
              <p className="lucerne-hero-description" data-testid="text-hero-subtitle">{currentHero.subtitle}</p>
              <div className="lucerne-hero-actions">
                <Link href={currentHero.href} className="lucerne-hero-primary" data-testid="button-shop-collection">
                  {currentHero.button}<Arrow className="w-4 h-4" aria-hidden="true" />
                </Link>
                <Link href="/shoes" className="lucerne-hero-secondary">
                  {language === "ar" ? "اكتشفي الأحذية" : "Explore Shoes"}
                </Link>
              </div>
            </div>
          </div>
          {heroSlides.length > 1 && (
            <>
              <button type="button" className="lucerne-hero-arrow lucerne-hero-prev" onClick={() => changeHero(-1)} aria-label={language === "ar" ? "السابق" : "Previous slide"}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button type="button" className="lucerne-hero-arrow lucerne-hero-next" onClick={() => changeHero(1)} aria-label={language === "ar" ? "التالي" : "Next slide"}>
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="lucerne-hero-dots" aria-label={language === "ar" ? "اختر شريحة" : "Choose slide"}>
                {heroSlides.map((slide, index) => (
                  <button
                    type="button"
                    key={slide.href + index}
                    onClick={() => setHeroSlideIndex(index)}
                    className={index === heroSlideIndex % heroSlides.length ? "is-active" : ""}
                    aria-label={language === "ar" ? `الشريحة ${index + 1}` : `Slide ${index + 1}`}
                    aria-current={index === heroSlideIndex % heroSlides.length ? "true" : undefined}
                  />
                ))}
              </div>
            </>
          )}
        </section>


        {/* Shop-by-category: horizontal editorial cards on desktop, round shortcuts on mobile */}
        <section className="lucerne-categories" aria-label={language === "ar" ? "التسوق حسب الفئة" : "Shop by category"}>
          {(() => {
            const visibleCategories = (categoriesList || []).filter((c: any) => c.showOnHome);
            const primaryCategories = visibleCategories.length ? visibleCategories : categoriesList || [];
            const categoryHref = (c: any) => ["dresses", "shoes", "clothes"].includes(c.slug) ? `/${c.slug}` : `/category/${c.slug}`;
            const categories = primaryCategories.map((c: any) => ({
              href: categoryHref(c), title: language === "ar" ? c.nameAr || c.name : c.name,
              image: c.image || "", id: `category-${c.id}`,
            }));
            const subcategories = homeSubcategories.map((s: any) => {
              const parent = categoryMap[s.categoryId];
              return { href: parent ? `${categoryHref(parent)}?sub=${s.id}` : "/shop",
                title: language === "ar" ? s.nameAr || s.name : s.name,
                image: s.image || "", id: `sub-${s.id}` };
            });
            return (
              <div className="lucerne-category-track">
                {[...categories, ...subcategories].map((item) => (
                  <Link href={item.href} className="lucerne-category-card" key={item.id}>
                    <div className="lucerne-category-image">
                      <BannerImage src={item.image || "/placeholder-product.svg"} alt={item.title} className="w-full h-full object-cover" width={320}/>
                    </div>
                    <span className="lucerne-category-name">{item.title}</span>
                    <Arrow className="lucerne-category-arrow w-4 h-4" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            );
          })()}
        </section>

        {/* Featured */}
        {featured.length > 0 && (
          <section className="lucerne-featured py-12 sm:py-24 bg-muted/30">
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
            <section className="lucerne-editorial-mosaic w-full overflow-hidden">
              <div className="lucerne-mosaic-grid grid grid-cols-[1fr_1.4fr_1fr] grid-rows-2 gap-1 sm:gap-1.5 h-[340px] sm:h-[440px] lg:h-[520px]">
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
