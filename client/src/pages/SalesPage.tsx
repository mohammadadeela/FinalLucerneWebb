import { useState, useMemo, useEffect } from "react";
import { SlidersHorizontal, X, Tag } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/ui/ProductCard";
import { PageHero } from "@/components/ui/PageHero";
import { useProducts } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import { useLanguage } from "@/i18n";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import {
  FilterPanel,
  type FilterState,
  type ColorOption,
} from "@/components/FilterPanel";
import {
  groupColorsByFamily,
  productMatchesColorFamily,
  normalizeArabic,
  type GroupedColor,
} from "@/lib/colorFamilies";
import type { ColorVariant } from "@shared/schema";

const SORT_OPTIONS = [
  { value: "newest", arLabel: "الأحدث", enLabel: "Newest" },
  { value: "discount", arLabel: "الأكثر تخفيضاً", enLabel: "Highest Discount" },
  {
    value: "price-low",
    arLabel: "السعر: من الأقل",
    enLabel: "Price: Low to High",
  },
  {
    value: "price-high",
    arLabel: "السعر: من الأعلى",
    enLabel: "Price: High to Low",
  },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export default function SalesPage() {
  const { data: products, isLoading } = useProducts();
  const { data: categories } = useCategories();
  const { t, language } = useLanguage();
  const { data: siteSettings } = useSiteSettings();
  const ar = language === "ar";

  const salesHeroImage = getSetting(siteSettings, "sales_hero_image");
  const salesHeroImagePosition =
    getSetting(siteSettings, "sales_hero_image_position") || "center";
  const salesHeroVideo = getSetting(siteSettings, "sales_hero_video");
  const salesHeroVideoPosition =
    getSetting(siteSettings, "sales_hero_video_position") || "50% 50%";
  const salesSubtitle = ar
    ? getSetting(siteSettings, "sales_hero_subtitle_ar")
    : getSetting(siteSettings, "sales_hero_subtitle_en");

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortValue>("newest");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    sort: null,
    sizes: [],
    colors: [],
    brands: [],
    priceRange: [0, 99999],
    inStockOnly: false,
    newArrivals: false,
    onSale: false,
  });

  // All products that are on sale
  const saleProducts = useMemo(() => {
    if (!products) return [];
    return products.filter(
      (p) => p.discountPrice && parseFloat(p.discountPrice.toString()) > 0,
    );
  }, [products]);

  // Categories that have at least one sale product
  const saleCategories = useMemo(() => {
    if (!categories || !saleProducts.length) return [];
    const catIds = new Set(
      saleProducts.map((p) => p.categoryId).filter(Boolean),
    );
    return categories.filter((c) => catIds.has(c.id));
  }, [categories, saleProducts]);

  // Color options from sale products
  const allColors = useMemo((): ColorOption[] => {
    const seen = new Map<string, { name: string; colorCode: string }>();
    saleProducts.forEach((p) => {
      const cv = (p as any).colorVariants as ColorVariant[] | undefined;
      if (cv && cv.length > 0) {
        cv.forEach((v) => {
          const key = normalizeArabic(v.name.trim().toLowerCase());
          if (!seen.has(key))
            seen.set(key, {
              name: v.name.trim(),
              colorCode: v.colorCode || "#d1d5db",
            });
        });
      } else {
        (p.colors || []).forEach((c) => {
          const key = normalizeArabic(c.trim().toLowerCase());
          if (!seen.has(key))
            seen.set(key, { name: c.trim(), colorCode: "#d1d5db" });
        });
      }
    });
    return Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [saleProducts]);

  const colorGroups = useMemo(
    () => groupColorsByFamily(allColors),
    [allColors],
  );

  // Size options from sale products
  const allSizes = useMemo(() => {
    const set = new Set<string>();
    saleProducts.forEach((p) => {
      const cv = (p as any).colorVariants as ColorVariant[] | undefined;
      if (cv && cv.length > 0)
        cv.forEach((v) => (v.sizes || []).forEach((s: string) => set.add(s)));
      else (p.sizes || []).forEach((s) => set.add(s));
    });
    return Array.from(set);
  }, [saleProducts]);

  // Brand options from sale products
  const allBrands = useMemo(() => {
    const set = new Set<string>();
    saleProducts.forEach((p) => {
      if (p.brand) set.add(p.brand);
    });
    return Array.from(set).sort();
  }, [saleProducts]);

  const { minPrice, maxPrice } = useMemo(() => {
    if (!saleProducts.length) return { minPrice: 0, maxPrice: 9999 };
    const prices = saleProducts.map((p) =>
      parseFloat((p.discountPrice ?? p.price).toString()),
    );
    return {
      minPrice: Math.floor(Math.min(...prices)),
      maxPrice: Math.ceil(Math.max(...prices)),
    };
  }, [saleProducts]);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, priceRange: [minPrice, maxPrice] }));
  }, [minPrice, maxPrice]);

  // Discount % helper
  const discountPct = (p: (typeof saleProducts)[0]) => {
    const orig = parseFloat(p.price.toString());
    const sale = parseFloat(p.discountPrice!.toString());
    if (!orig) return 0;
    return Math.round((1 - sale / orig) * 100);
  };

  // Filtered + sorted products
  const filtered = useMemo(() => {
    let result = saleProducts;
    if (selectedCategory)
      result = result.filter((p) => p.categoryId === selectedCategory);
    if (search)
      result = result.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      );
    if (filters.colors.length > 0) {
      result = result.filter((p) => {
        const cv = (p as any).colorVariants as ColorVariant[] | undefined;
        const cols =
          cv && cv.length > 0 ? cv.map((v) => v.name) : p.colors || [];
        const allTags =
          cv && cv.length > 0 ? cv.flatMap((v) => v.colorTags || []) : [];
        return productMatchesColorFamily(
          cols,
          filters.colors,
          colorGroups,
          allTags,
        );
      });
    }
    if (filters.sizes.length > 0) {
      result = result.filter((p) => {
        const cv = (p as any).colorVariants as ColorVariant[] | undefined;
        const szs: string[] =
          cv && cv.length > 0
            ? cv.flatMap((v) => v.sizes || [])
            : p.sizes || [];
        return szs.some((s) => filters.sizes.includes(s));
      });
    }
    if (filters.brands.length > 0)
      result = result.filter((p) => filters.brands.includes(p.brand || ""));
    const price = (p: (typeof saleProducts)[0]) =>
      parseFloat((p.discountPrice ?? p.price).toString());
    if (filters.priceRange[0] > minPrice || filters.priceRange[1] < maxPrice) {
      result = result.filter((p) => {
        const pr = price(p);
        return pr >= filters.priceRange[0] && pr <= filters.priceRange[1];
      });
    }
    if (filters.inStockOnly)
      result = result.filter((p) => (p.stockQuantity ?? 0) > 0);

    // Sort
    const sort = filters.sort ?? sortBy;
    if (sort === "rising" || sort === "price-low")
      result = [...result].sort((a, b) => price(a) - price(b));
    else if (sort === "decreasing" || sort === "price-high")
      result = [...result].sort((a, b) => price(b) - price(a));
    else if (sort === "discount")
      result = [...result].sort((a, b) => discountPct(b) - discountPct(a));
    return result;
  }, [
    saleProducts,
    selectedCategory,
    search,
    filters,
    sortBy,
    minPrice,
    maxPrice,
    colorGroups,
  ]);

  const activeFilterCount =
    (filters.sort ? 1 : 0) +
    filters.sizes.length +
    filters.colors.length +
    filters.brands.length +
    (filters.inStockOnly ? 1 : 0) +
    (filters.priceRange[0] > minPrice || filters.priceRange[1] < maxPrice
      ? 1
      : 0);

  const hasActiveFilters =
    activeFilterCount > 0 ||
    !!selectedCategory ||
    !!search ||
    sortBy !== "newest";

  const clearAll = () => {
    setSearch("");
    setSortBy("newest");
    setSelectedCategory(null);
    setFilters({
      sort: null,
      sizes: [],
      colors: [],
      brands: [],
      priceRange: [minPrice, maxPrice],
      inStockOnly: false,
      newArrivals: false,
      onSale: false,
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <PageHero
        image={salesHeroImage}
        imagePosition={salesHeroImagePosition}
        video={salesHeroVideo}
        videoPosition={salesHeroVideoPosition}
        title={t.nav.sales}
        subtitle={salesSubtitle}
        titleTestId="text-sales-page-title"
        subtitleTestId="text-sales-page-subtitle"
      />

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* ── Top toolbar ── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
          {/* Search */}
          <div className="relative flex-1 sm:max-w-xs">
            <input
              type="text"
              placeholder={t.shop.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 w-full rounded-2xl border border-border bg-background/80 px-4 pe-9 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
              data-testid="input-sales-search"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                data-testid="button-clear-search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortValue);
              setFilters((f) => ({ ...f, sort: null }));
            }}
            className="h-11 rounded-2xl border border-border bg-background px-4 text-sm focus:outline-none focus:border-primary cursor-pointer sm:w-52"
            data-testid="select-sort"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {ar ? o.arLabel : o.enLabel}
              </option>
            ))}
          </select>

          {/* Filter button */}
          <button
            onClick={() => setFilterOpen(true)}
            className={`h-11 flex items-center justify-center gap-2 rounded-2xl border px-5 text-sm font-semibold transition-colors ${activeFilterCount > 0 ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background hover:border-foreground"}`}
            data-testid="button-open-filter"
          >
            <SlidersHorizontal size={16} />
            {ar ? "فلتر" : "Filter"}
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground px-1 text-[11px] font-bold text-primary">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Category pills ── */}
        {saleCategories.length > 0 && (
          <div
            className="flex gap-2 mb-6 overflow-x-auto pb-1"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            data-testid="category-filter-bar"
          >
            <button
              onClick={() => setSelectedCategory(null)}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-sm border transition-all font-medium ${selectedCategory === null ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground"}`}
              data-testid="button-category-all"
            >
              {ar ? "الكل" : "All"}
            </button>
            {saleCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() =>
                  setSelectedCategory(
                    selectedCategory === cat.id ? null : cat.id,
                  )
                }
                className={`flex-shrink-0 rounded-full px-4 py-2 text-sm border transition-all font-medium ${selectedCategory === cat.id ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground"}`}
                data-testid={`button-category-${cat.id}`}
              >
                {ar ? cat.nameAr || cat.name : cat.name}
              </button>
            ))}
          </div>
        )}

        {/* ── Results bar ── */}
        <div className="flex items-center justify-between mb-6">
          <p
            className="text-sm text-muted-foreground flex items-center gap-1.5"
            data-testid="text-product-count"
          >
            <Tag size={14} style={{ color: "#f50301" }} />
            <span className="font-semibold text-foreground">
              {filtered.length}
            </span>
            {ar ? "منتج" : "sale items"}
          </p>
          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              data-testid="button-clear-all-filters"
            >
              {ar ? "مسح الفلاتر" : "Clear all"}
            </button>
          )}
        </div>

        {/* ── Active filter chips ── */}
        {(filters.colors.length > 0 ||
          filters.sizes.length > 0 ||
          filters.brands.length > 0 ||
          filters.inStockOnly) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {filters.colors.map((c) => (
              <button
                key={c}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    colors: f.colors.filter((x) => x !== c),
                  }))
                }
                className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium hover:bg-muted/80 transition-colors"
                data-testid={`chip-color-${c}`}
              >
                {c} <X size={11} />
              </button>
            ))}
            {filters.sizes.map((s) => (
              <button
                key={s}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    sizes: f.sizes.filter((x) => x !== s),
                  }))
                }
                className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium hover:bg-muted/80 transition-colors"
                data-testid={`chip-size-${s}`}
              >
                {s} <X size={11} />
              </button>
            ))}
            {filters.brands.map((b) => (
              <button
                key={b}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    brands: f.brands.filter((x) => x !== b),
                  }))
                }
                className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium hover:bg-muted/80 transition-colors"
                data-testid={`chip-brand-${b}`}
              >
                {b} <X size={11} />
              </button>
            ))}
            {filters.inStockOnly && (
              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, inStockOnly: false }))
                }
                className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium hover:bg-muted/80 transition-colors"
                data-testid="chip-in-stock"
              >
                {ar ? "متوفر فقط" : "In stock"} <X size={11} />
              </button>
            )}
          </div>
        )}

        {/* ── Product grid ── */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-muted aspect-[3/4] mb-4" />
                <div className="h-4 bg-muted w-2/3 mb-2" />
                <div className="h-4 bg-muted w-1/4" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="mb-4 text-sm" data-testid="text-no-products">
              {t.shop.noProducts}
            </p>
            <button
              onClick={clearAll}
              className="text-sm font-semibold uppercase tracking-widest underline"
              data-testid="button-clear-filters"
            >
              {t.shop.clearFilters}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>

      <Footer />

      <FilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        availableColors={allColors}
        groupedColors={colorGroups}
        availableSizes={allSizes}
        availableBrands={allBrands}
        minPrice={minPrice}
        maxPrice={maxPrice}
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          if (f.sort) setSortBy("newest");
        }}
      />
    </div>
  );
}
