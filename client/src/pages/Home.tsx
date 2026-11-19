import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/ui/ProductCard";
import { ProductWatermark } from "@/components/ui/ProductWatermark";
import { AutoplayVideo } from "@/components/ui/AutoplayVideo";
import { HeroSlider, type HeroSlide } from "@/components/home/HeroSlider";
import { Rail } from "@/components/home/Rail";
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
  Truck,
  RefreshCw,
  CreditCard,
  MapPin,
} from "lucide-react";
import { GiButterfly } from "react-icons/gi";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLanguage } from "@/i18n";
import {
  useSiteSettings,
  getSetting,
  getShippingZones,
} from "@/hooks/use-site-settings";
import { useQuery } from "@tanstack/react-query";
import {
  optimizeCloudinaryUrl,
  optimizeCloudinaryVideoUrl,
  blurCloudinaryUrl,
} from "@/lib/utils";
import { categoryHref, subcategoryHref } from "@/lib/storefront";

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
    <div className="mb-5 flex items-end justify-between gap-4 sm:mb-7">
      <div className="min-w-0">
        {eyebrow && (
          <p
            className={`mb-1.5 text-[10px] font-medium uppercase tracking-[0.26em] sm:text-[11px] ${sale ? "text-[#9B1C1C]" : "text-primary"}`}
          >
            {eyebrow}
          </p>
        )}
        <h2
          className="text-[1.75rem] font-medium leading-none sm:text-[2.5rem] rtl:leading-snug"
          data-testid={testId || "section-title"}
        >
          {title}
        </h2>
        <span
          className={`mt-3 block h-[2px] w-12 rounded-full ${sale ? "bg-[#9B1C1C]/70" : "bg-primary/70"}`}
        />
      </div>
      {href && (
        <Link
          href={href}
          className={`group inline-flex shrink-0 items-center gap-2 pb-1 text-[13px] transition-colors sm:text-sm ${sale ? "text-[#9B1C1C]" : "text-foreground hover:text-primary"}`}
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
  "flex-none snap-start w-[46%] sm:w-[calc((100%-2rem)/3)] md:w-[calc((100%-3rem)/4)] lg:w-[calc((100%-(var(--cols)-1)*1rem)/var(--cols))]";

/**
 * A row of product cards. `lead` puts a cover tile first (used by category rows)
 * and `more` adds a closing "see everything" tile, so short rows still fill the
 * line instead of leaving a blank gap, and long rows end with a clear next step.
 */
function ProductRail({
  products,
  testId,
  lead,
  more,
}: {
  products: any[];
  testId?: string;
  lead?: ReactNode;
  more?: { href: string; label: string; tone?: "default" | "sale" };
}) {
  const { language } = useLanguage();
  const Arrow = language === "ar" ? ArrowLeft : ArrowRight;
  const total = products.length + (lead ? 1 : 0) + (more ? 1 : 0);
  const sale = more?.tone === "sale";
  return (
    <Rail
      scrollClassName={`gap-3 sm:gap-4 pb-3 ${total >= 5 ? "[--cols:5]" : "[--cols:4]"}`}
      testId={testId}
    >
      {lead && (
        <div role="listitem" className={RAIL_ITEM}>
          {lead}
        </div>
      )}
      {products.map((product, index) => (
        <div key={product.id} role="listitem" className={RAIL_ITEM}>
          <ProductCard product={product} priority={index < 2} />
        </div>
      ))}
      {more && (
        <div role="listitem" className={RAIL_ITEM}>
          <Link
            href={more.href}
            className={`group flex h-full min-h-[14rem] flex-col items-center justify-center gap-4 rounded-[1.15rem] border border-dashed p-4 text-center transition-colors duration-300 ${
              sale
                ? "border-[#9B1C1C]/35 bg-white/60 text-[#9B1C1C] hover:bg-white"
                : "border-primary/35 bg-[hsl(var(--blush)/0.35)] text-foreground hover:bg-[hsl(var(--blush)/0.6)]"
            }`}
            data-testid={testId ? `${testId}-more` : undefined}
          >
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform duration-300 group-hover:scale-110 ${sale ? "bg-[#9B1C1C]" : "bg-primary"}`}
            >
              <Arrow className="h-5 w-5" />
            </span>
            <span className="font-heading text-lg font-medium leading-tight sm:text-xl">
              {more.label}
            </span>
          </Link>
        </div>
      )}
    </Rail>
  );
}

function RailSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden sm:gap-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className={`${RAIL_ITEM} [--cols:5] animate-pulse`}>
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
    <section id={id} className={`w-full px-4 py-8 sm:px-6 sm:py-11 lg:px-10 ${className}`}>
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
    const hasNew = newArrivals.length > 0;
    list.push({
      key: "home",
      image: heroImage,
      imagePosition: g("home_hero_image_position") || "center",
      video: heroVideo || undefined,
      videoPosition: g("home_hero_video_position") || "50% 50%",
      tag: pick(g("home_hero_tag_ar"), g("home_hero_tag_en")),
      title: pick(g("home_hero_title_ar"), g("home_hero_title_en")),
      subtitle: pick(g("home_hero_subtitle_ar"), g("home_hero_subtitle_en")),
      primary: hasNew
        ? { label: pick("تسوقي الجديد", "Shop New In"), href: "/shop?new=1" }
        : { label: pick("تسوقي الآن", t.home.shopCollection), href: "/shop" },
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
    pick("الأكثر رواجاً", "Trending Now");
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
  const countFor = (item: { categoryId?: number; subcategoryId?: number }) =>
    allProducts.filter((p: any) => {
      if (item.subcategoryId != null) {
        const ids: number[] = Array.isArray(p.subcategoryIds) ? p.subcategoryIds : [];
        return ids.includes(item.subcategoryId) || p.subcategoryId === item.subcategoryId;
      }
      return p.categoryId === item.categoryId;
    }).length;

  const catTiles = homeCats.map((c: any) => ({
    key: `c-${c.id}`,
    href: categoryHref(c),
    label: catName(c),
    img: c.image || "",
    count: countFor({ categoryId: c.id }),
    testId: `link-category-home-${c.id}`,
  }));
  const subTiles = (allSubcategories || [])
    .filter((s: any) => s.showOnHome && s.isActive)
    .map((s: any) => ({
      key: `s-${s.id}`,
      href: subcategoryHref(categoryMap[s.categoryId], s.id),
      label: isAr ? s.nameAr || s.name : s.name,
      img: s.image || "",
      count: countFor({ subcategoryId: s.id }),
      testId: `link-subcategory-home-${s.id}`,
    }));
  const allTiles = [...catTiles, ...subTiles];

  /* ── "New season" banner + edit tiles — all admin-controlled (Content → Editorial) ── */
  const seasonImage =
    g("editorial_center_image") ||
    "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=900&q=80";
  const seasonVideo = g("editorial_center_video");
  const seasonHeadline = pick(
    g("editorial_headline_ar") || "تشكيلة جديدة\nبأسلوب راقٍ",
    g("editorial_headline_en") || "New Collection\nRefined Style",
  );
  const [seasonLine1, ...seasonRest] = seasonHeadline.split("\n");
  const seasonLine2 = seasonRest.join(" ").trim();

  const editTiles = [0, 1, 2, 3]
    .map((i) => {
      const savedCatId = g(`editorial_tile_${i + 1}_category_id`);
      const savedSubId = g(`editorial_tile_${i + 1}_subcategory_id`);
      const cat = savedCatId
        ? (categoriesList || []).find((c: any) => String(c.id) === savedCatId)
        : homeCats[i];
      const sub = savedSubId
        ? (allSubcategories || []).find((s: any) => String(s.id) === savedSubId)
        : null;
      return {
        key: `edit-${i}`,
        img: g(`editorial_tile_${i + 1}_image`) || sub?.image || cat?.image || "",
        video: g(`editorial_tile_${i + 1}_video`),
        label: isAr
          ? sub?.nameAr || sub?.name || cat?.nameAr || cat?.name || ""
          : sub?.name || cat?.name || "",
        href: cat ? (sub ? subcategoryHref(cat, sub.id) : categoryHref(cat)) : "/shop",
      };
    })
    .filter((tile) => tile.label && (tile.img || tile.video));

  /* ── Per-category rails ── */
  const categorySections = showOnHomeCats.map((c: any, idx: number) => ({
    category: c,
    products: categoryProductsQueries[idx]?.data || [],
    href: categoryHref(c),
  }));

  /* ── Service promises — derived from the shop's real settings ── */
  const zones = getShippingZones(siteSettings);
  const exchangesEnabled = g("exchanges_enabled") !== "false";
  const exchangeDays = g("exchange_window_days");
  const cardEnabled = g("card_payment_enabled") === "true";
  const services = [
    {
      icon: Truck,
      title: pick("توصيل لباب البيت", "Delivery to your door"),
      text: zones.map((z) => (isAr ? z.nameAr : z.nameEn)).join(" · "),
      href: "/shipping-returns",
    },
    exchangesEnabled && exchangeDays
      ? {
          icon: RefreshCw,
          title: pick("تبديل سهل", "Easy exchange"),
          text: pick(`خلال ${exchangeDays} أيام من الاستلام`, `Within ${exchangeDays} days of delivery`),
          href: "/shipping-returns",
        }
      : null,
    {
      icon: CreditCard,
      title: pick("دفع مريح", "Pay your way"),
      text: cardEnabled
        ? pick("بطاقة أو الدفع عند الاستلام", "Card or cash on delivery")
        : pick("الدفع عند الاستلام", "Cash on delivery"),
      href: "/faq",
    },
    {
      icon: MapPin,
      title: pick("زورينا في المتجر", "Visit the boutique"),
      text: pick(g("contact_address_ar"), g("contact_address_en")),
      href: "/our-location",
    },
  ].filter(Boolean) as { icon: any; title: string; text: string; href: string }[];

  // "Trending" shows the admin's featured picks; falls back to best sellers so the row is never empty.
  const trending = featured.length > 0 ? featured : bestSellers.slice(0, 10);
  const trendingIds = new Set(trending.map((p: any) => p.id));
  const podiumIds = new Set(hasPodium ? podiumProducts.map((p: any) => p.id) : []);
  // The rest of the list, without repeating the three podium pieces (or the trending row when it is a fallback).
  const bestSellerRest = bestSellers.filter(
    (p: any) => !podiumIds.has(p.id) && (featured.length > 0 || !trendingIds.has(p.id)),
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        <HeroSlider slides={slides} isAr={isAr} />

        {/* ── Shop by category ── */}
        {allTiles.length > 0 && (
          <Section className="!pb-4 sm:!pb-6">
            <h2 className="sr-only">{pick("تسوقي حسب القسم", "Shop by category")}</h2>

            {/* Phones: story-style circles */}
            <Rail className="sm:hidden" scrollClassName="gap-3.5 pb-1" testId="rail-categories-mobile">
              {allTiles.map((item, i) => (
                <Link
                  key={item.key}
                  href={item.href}
                  role="listitem"
                  className="group flex w-[4.75rem] flex-none snap-start flex-col items-center gap-2"
                  data-testid={item.testId}
                >
                  <span
                    className="relative block h-[4.75rem] w-[4.75rem] overflow-hidden rounded-full ring-1 ring-black/[0.05] transition-transform duration-300 group-active:scale-95"
                    style={{ background: TILE_TINTS[i % TILE_TINTS.length] }}
                  >
                    <BannerImage
                      src={item.img || "/placeholder-product.svg"}
                      alt={item.label}
                      className="h-full w-full object-cover"
                      loading={i < 5 ? "eager" : "lazy"}
                      width={160}
                    />
                  </span>
                  <span className="line-clamp-2 text-center text-[12px] leading-tight text-foreground">
                    {item.label}
                  </span>
                </Link>
              ))}
            </Rail>

            {/* Larger screens: soft pills — photo on one side, name on the other */}
            <Rail className="hidden sm:block" scrollClassName="gap-4 lg:gap-6 pb-2" testId="rail-categories">
              {catTiles.map((item, i) => (
                <Link
                  key={item.key}
                  href={item.href}
                  role="listitem"
                  className="group relative flex h-[6.5rem] flex-none snap-start overflow-hidden rounded-[2.25rem] bg-[hsl(var(--sand))] ring-1 ring-black/[0.04] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_-22px_rgba(74,24,43,0.45)] sm:w-[calc((100%-1rem)/2)] md:w-[calc((100%-2rem)/3)] lg:h-28 lg:w-[calc((100%-4.5rem)/4)]"
                  data-testid={item.testId}
                >
                  <span
                    className="relative block h-full w-[46%] shrink-0 overflow-hidden"
                    style={{ background: TILE_TINTS[i % TILE_TINTS.length] }}
                  >
                    <BannerImage
                      src={item.img || "/placeholder-product.svg"}
                      alt={item.label}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="eager"
                      width={400}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2 px-4 lg:px-5">
                    <span className="min-w-0">
                      <span className="font-heading block truncate text-lg font-medium leading-tight lg:text-xl">
                        {item.label}
                      </span>
                      {item.count > 0 && (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {item.count} {pick("قطعة", item.count === 1 ? "piece" : "pieces")}
                        </span>
                      )}
                    </span>
                    <Arrow className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                  </span>
                </Link>
              ))}
            </Rail>

            {/* Larger screens: featured subcategories as quick chips */}
            {subTiles.length > 0 && (
              <Rail className="mt-4 hidden sm:block" scrollClassName="gap-2.5 pb-1" testId="rail-subcategories">
                {subTiles.map((item, i) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    role="listitem"
                    className="group flex flex-none snap-start items-center gap-2.5 rounded-full border border-border/80 bg-card py-1.5 pe-4 ps-1.5 text-sm transition-colors duration-200 hover:border-primary/50 hover:text-primary"
                    data-testid={item.testId}
                  >
                    <span
                      className="relative block h-9 w-9 overflow-hidden rounded-full"
                      style={{ background: TILE_TINTS[i % TILE_TINTS.length] }}
                    >
                      <BannerImage
                        src={item.img || "/placeholder-product.svg"}
                        alt=""
                        className="h-full w-full object-cover"
                        width={100}
                      />
                    </span>
                    <span className="whitespace-nowrap">{item.label}</span>
                  </Link>
                ))}
              </Rail>
            )}
          </Section>
        )}

        {/* ── Trending now ── */}
        {(isFeaturedLoading || trending.length > 0) && (
          <Section>
            <SectionHeader
              title={secFeaturedTitle}
              href="/shop"
              linkLabel={t.home.viewAll}
              testId="section-title-trending"
            />
            {isFeaturedLoading && trending.length === 0 ? (
              <RailSkeleton />
            ) : (
              <ProductRail
                products={trending}
                testId="rail-trending"
                more={{ href: "/shop", label: pick("كل المنتجات", "Shop everything") }}
              />
            )}
          </Section>
        )}

        {/* ── New season banner ── */}
        <section className="relative isolate overflow-hidden bg-[hsl(var(--sage))]">
          <div className="mx-auto flex min-h-[11.5rem] w-full max-w-[1760px] items-stretch sm:min-h-[15rem] lg:min-h-[17rem]">
            <div className="relative z-10 flex w-[58%] items-center gap-6 px-4 py-7 sm:w-[56%] sm:px-8 lg:gap-10 lg:px-14">
              <GiButterfly
                aria-hidden
                className="soft-float hidden h-24 w-24 shrink-0 text-white/70 md:block lg:h-32 lg:w-32"
                style={{ ["--float-rot" as any]: "-8deg" }}
              />
              <div className="min-w-0">
                <p className="font-heading text-[1.6rem] font-medium leading-[1.05] text-foreground ltr:italic sm:text-4xl lg:text-5xl rtl:leading-snug">
                  {seasonLine1}
                </p>
                {seasonLine2 && (
                  <p className="font-heading mt-1.5 text-[15px] text-foreground/75 sm:mt-2.5 sm:text-xl lg:text-2xl">
                    {seasonLine2}
                  </p>
                )}
                <Link
                  href={newArrivals.length > 0 ? "/shop?new=1" : "/shop"}
                  className="group mt-4 inline-flex h-10 items-center gap-2.5 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground shadow-[0_14px_30px_-14px_hsl(var(--berry)/0.9)] transition-colors hover:bg-[hsl(var(--berry-deep))] sm:mt-6 sm:h-12 sm:px-7 sm:text-sm"
                  data-testid="button-season-banner"
                >
                  {pick("تسوقي المجموعة", "Shop the Collection")}
                  <Arrow className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                </Link>
              </div>
            </div>
            <div className="absolute inset-y-0 end-0 w-[46%] overflow-hidden rounded-s-[5rem] sm:w-[47%] sm:rounded-s-[11rem]">
              {seasonVideo ? (
                <AutoplayVideo
                  src={optimizeCloudinaryVideoUrl(seasonVideo) || seasonVideo}
                  poster={optimizeCloudinaryUrl(seasonImage) || seasonImage || undefined}
                  className="h-full w-full object-cover"
                />
              ) : (
                <BannerImage
                  src={seasonImage}
                  alt={seasonLine1}
                  width={1000}
                  className="h-full w-full object-cover"
                  style={{ objectPosition: g("editorial_center_image_position") || "center" }}
                />
              )}
            </div>
          </div>
        </section>

        {/* ── New arrivals ── */}
        {newArrivals.length > 0 && (
          <Section>
            <SectionHeader
              title={secNewArrivalsTitle}
              eyebrow={pick("وصل للتو", "Just landed")}
              href="/shop?new=1"
              linkLabel={t.home.viewAll}
              testId="section-title-new-arrivals"
            />
            <ProductRail
              products={newArrivals}
              testId="rail-new-arrivals"
              more={{ href: "/shop?new=1", label: pick("كل الجديد", "All new arrivals") }}
            />
          </Section>
        )}

        {/* ── The edit: four admin-picked tiles ── */}
        {editTiles.length >= 2 && (
          <Section className="!pt-2 sm:!pt-4 lg:!pb-16">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {editTiles.map((tile, i) => (
                <Link
                  key={tile.key}
                  href={tile.href}
                  className={`group relative block aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-muted lg:aspect-[6/7] ${
                    editTiles.length === 4 && (i === 1 || i === 2) ? "lg:translate-y-8" : ""
                  }`}
                  data-testid={`link-edit-tile-${i + 1}`}
                >
                  {tile.video ? (
                    <AutoplayVideo
                      src={optimizeCloudinaryVideoUrl(tile.video) || tile.video}
                      poster={optimizeCloudinaryUrl(tile.img) || tile.img || undefined}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <BannerImage
                      src={tile.img}
                      alt={tile.label}
                      width={600}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                  <span className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2 rounded-full bg-white/90 px-3.5 py-2 text-[13px] font-medium text-foreground backdrop-blur-sm sm:inset-x-4 sm:bottom-4 sm:px-5 sm:py-2.5 sm:text-sm">
                    <span className="truncate">{tile.label}</span>
                    <Arrow className="h-4 w-4 shrink-0 text-primary transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        )}

        {/* ── On sale ── */}
        {onSale.length > 0 && (
          <Section className="bg-[hsl(var(--blush)/0.45)]">
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
                                <span className="text-[11px] font-bold leading-none text-primary sm:text-sm">
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
                            <span className="font-heading w-7 shrink-0 text-center text-3xl font-medium leading-none text-primary/35 transition-colors group-hover:text-primary">
                              {i + 4}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 block text-[15px] font-medium leading-snug transition-colors group-hover:text-primary">
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
              className={idx % 2 === 0 ? "bg-[hsl(var(--sand)/0.55)]" : ""}
            >
              <SectionHeader
                title={catName(section.category)}
                href={section.href}
                linkLabel={t.home.viewAll}
                testId={`section-title-category-${section.category.id}`}
              />
              <ProductRail
                products={section.products}
                testId={`rail-category-${section.category.id}`}
                lead={
                  section.category.image ? (
                    <Link
                      href={section.href}
                      className="group relative block h-full min-h-[14rem] overflow-hidden rounded-[1.15rem] bg-[hsl(var(--blush))]"
                    >
                      <BannerImage
                        src={section.category.image}
                        alt={catName(section.category)}
                        width={600}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <span className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--berry-deep)/0.85)] via-[hsl(var(--berry-deep)/0.15)] to-transparent" />
                      <span className="absolute inset-x-3 bottom-3 text-white sm:inset-x-4 sm:bottom-4">
                        <span className="font-heading block text-2xl font-medium leading-none sm:text-3xl rtl:leading-snug">
                          {catName(section.category)}
                        </span>
                        <span className="mt-2 inline-flex items-center gap-2 text-[13px]">
                          {pick("تسوقي القسم", "Shop the edit")}
                          <Arrow className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                        </span>
                      </span>
                    </Link>
                  ) : undefined
                }
                more={{
                  href: section.href,
                  label: pick(`كل ${catName(section.category)}`, `All ${catName(section.category)}`),
                }}
              />
            </Section>
          ))}

        {/* ── Service promises ── */}
        <Section className="!py-7 sm:!py-9">
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
            {services.map((s) => (
              <Link
                key={s.title}
                href={s.href}
                className="group flex flex-col items-start gap-2.5 rounded-2xl border border-border/70 bg-card p-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_40px_-26px_rgba(74,24,43,0.5)] sm:flex-row sm:items-center sm:gap-4 sm:p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--blush)/0.7)] text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground sm:h-12 sm:w-12">
                  <s.icon className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight sm:text-[15px]">
                    {s.title}
                  </span>
                  {s.text && (
                    <span className="mt-1 line-clamp-2 block text-[11.5px] leading-snug text-muted-foreground sm:text-[13px]">
                      {s.text}
                    </span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </Section>
      </main>

      <Footer />
    </div>
  );
}
