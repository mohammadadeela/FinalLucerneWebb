import { useState, useMemo, useEffect } from "react";
import { SlidersHorizontal, ShoppingBag } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/ui/ProductCard";
import { useProducts } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import { useLanguage } from "@/i18n";
import { useSearch, useLocation } from "wouter";
import { FilterPanel, type FilterState, type ColorOption } from "@/components/FilterPanel";
import type { ColorVariant } from "@shared/schema";
import { COLOR_FAMILIES, groupColorsByFamily, productMatchesColorFamily, getColorFamily, normalizeArabic, type GroupedColor } from "@/lib/colorFamilies";

export default function Shop() {
  const { data: products, isLoading } = useProducts();
  const { data: categories } = useCategories();
  const { t, language } = useLanguage();
  const searchParams = useSearch();
  const [, setLocation] = useLocation();

  const urlColor = new URLSearchParams(searchParams).get("color") || "";
  const urlSize  = new URLSearchParams(searchParams).get("size")  || "";

  const normalizedUrlColor = useMemo(() => {
    if (!urlColor) return "";
    const family = getColorFamily(urlColor);
    return family ? family.key : urlColor;
  }, [urlColor]);

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    sort: null,
    sizes: urlSize ? [urlSize] : [],
    colors: normalizedUrlColor ? [normalizedUrlColor] : [],
    brands: [],
    priceRange: [0, 99999],
    inStockOnly: false,
    newArrivals: false,
    onSale: false,
  });

  useEffect(() => {
    if (urlColor) setFilters((prev) => ({ ...prev, colors: [urlColor] }));
  }, [urlColor]);

  useEffect(() => {
    if (urlSize) setFilters((prev) => ({ ...prev, sizes: [urlSize] }));
  }, [urlSize]);

  const allColors = useMemo((): ColorOption[] => {
    if (!products) return [];
    const seen = new Map<string, { name: string; colorCode: string }>();
    products.forEach((p) => {
      const cv = (p as any).colorVariants as ColorVariant[] | undefined;
      if (cv && cv.length > 0) {
        cv.forEach((v) => {
          const key = normalizeArabic(v.name.trim().toLowerCase());
          if (!seen.has(key)) seen.set(key, { name: v.name.trim(), colorCode: v.colorCode || "#d1d5db" });
          (v.colorTags || []).forEach((tag) => {
            const family = COLOR_FAMILIES.find((f) => f.key === tag);
            if (family && !seen.has(family.key)) seen.set(family.key, { name: family.nameEn, colorCode: family.hex });
          });
        });
      } else {
        (p.colors || []).forEach((c) => {
          const key = normalizeArabic(c.trim().toLowerCase());
          if (!seen.has(key)) seen.set(key, { name: c.trim(), colorCode: "#d1d5db" });
        });
      }
    });
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [products]);

  const colorGroups = useMemo(() => groupColorsByFamily(allColors), [allColors]);

  const allSizes = useMemo(() => {
    if (!products) return [];
    const set = new Set<string>();
    products.forEach((p) => {
      const cv = (p as any).colorVariants as ColorVariant[] | undefined;
      if (cv && cv.length > 0) cv.forEach((v) => (v.sizes || []).forEach((s: string) => set.add(s)));
      else (p.sizes || []).forEach((s) => set.add(s));
    });
    return Array.from(set);
  }, [products]);

  const allBrands = useMemo(() => {
    if (!products) return [];
    const set = new Set<string>();
    products.forEach((p) => { if (p.brand) set.add(p.brand); });
    return Array.from(set).sort();
  }, [products]);

  const { minPrice, maxPrice } = useMemo(() => {
    if (!products || products.length === 0) return { minPrice: 0, maxPrice: 9999 };
    const prices = products.map((p) => parseFloat(p.price.toString()));
    return { minPrice: Math.floor(Math.min(...prices)), maxPrice: Math.ceil(Math.max(...prices)) };
  }, [products]);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, priceRange: [minPrice, maxPrice] }));
  }, [minPrice, maxPrice]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let result = products.filter((p) => {
      if (selectedCategory && p.categoryId !== selectedCategory) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filters.colors.length > 0) {
        const cv = (p as any).colorVariants as ColorVariant[] | undefined;
        const cols = cv && cv.length > 0 ? cv.map((v) => v.name) : (p.colors || []);
        const allTags = cv && cv.length > 0 ? cv.flatMap((v) => v.colorTags || []) : [];
        if (!productMatchesColorFamily(cols, filters.colors, colorGroups, allTags)) return false;
      }
      if (filters.sizes.length > 0) {
        const cv = (p as any).colorVariants as ColorVariant[] | undefined;
        const szs: string[] = cv && cv.length > 0 ? cv.flatMap((v) => v.sizes || []) : (p.sizes || []);
        if (!szs.some((s) => filters.sizes.includes(s))) return false;
      }
      if (filters.brands.length > 0 && !filters.brands.includes(p.brand || "")) return false;
      const price = parseFloat(p.price.toString());
      if (price < filters.priceRange[0] || price > filters.priceRange[1]) return false;
      if (filters.inStockOnly && (p.stockQuantity ?? 0) <= 0) return false;
      if (filters.newArrivals && !p.isNewArrival) return false;
      if (filters.onSale && !p.discountPrice) return false;
      return true;
    });
    if (filters.sort === "rising") result = [...result].sort((a, b) => parseFloat(a.price.toString()) - parseFloat(b.price.toString()));
    else if (filters.sort === "decreasing") result = [...result].sort((a, b) => parseFloat(b.price.toString()) - parseFloat(a.price.toString()));
    return result;
  }, [products, selectedCategory, search, filters]);

  const activeCount =
    (filters.sort ? 1 : 0) +
    filters.sizes.length + filters.colors.length + filters.brands.length +
    (filters.inStockOnly ? 1 : 0) + (filters.newArrivals ? 1 : 0) + (filters.onSale ? 1 : 0) +
    (filters.priceRange[0] > minPrice || filters.priceRange[1] < maxPrice ? 1 : 0);

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex flex-col md:flex-row items-baseline justify-between gap-4 mb-8 sm:mb-12">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold" data-testid="text-collection-title">
            {t.shop.collection}
          </h1>
          <div className="mt-1 md:mt-0 w-full md:w-auto flex flex-row gap-2 items-center">
            <input
              type="text"
              placeholder={t.shop.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 sm:h-12 flex-1 sm:flex-none sm:w-64 rounded-2xl border border-border bg-background/80 px-4 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
              data-testid="input-search"
            />
            <button
              onClick={() => setFilterOpen(true)}
              className={`flex h-10 sm:h-12 items-center justify-center gap-1.5 sm:gap-2 rounded-2xl border px-3 sm:px-4 text-sm font-semibold transition-colors whitespace-nowrap flex-shrink-0 ${activeCount > 0 ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-background hover:border-foreground"}`}
              data-testid="button-open-filter"
            >
              <SlidersHorizontal size={15} />
              {t.filter.title}
              {activeCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] font-bold text-primary">
                  {activeCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile: horizontal scroll category tabs */}
        <div className="lg:hidden mb-5 -mx-4 px-4">
          <div
            className="flex gap-2.5 overflow-x-auto pb-2 snap-x snap-mandatory"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
          >
            <button
              onClick={() => setSelectedCategory(null)}
              className={`snap-start flex-shrink-0 rounded-2xl px-4 py-3 text-sm border transition-colors whitespace-nowrap shadow-sm ${selectedCategory === null ? "border-foreground bg-foreground text-background font-semibold" : "border-border bg-background text-foreground hover:border-foreground"}`}
              data-testid="button-all-products-mobile"
            >
              {t.shop.allProducts}
            </button>
            {categories?.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`snap-start flex-shrink-0 rounded-2xl px-4 py-3 text-sm border transition-colors whitespace-nowrap shadow-sm ${selectedCategory === cat.id ? "border-foreground bg-foreground text-background font-semibold" : "border-border bg-background text-foreground hover:border-foreground"}`}
                data-testid={`button-category-mobile-${cat.id}`}
              >
                {language === "ar" ? (cat.nameAr || cat.name) : cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-28 space-y-8">
              <div>
                <h3 className="font-semibold uppercase tracking-widest text-xs mb-4 text-muted-foreground">{t.shop.categories}</h3>
                <ul className="space-y-3">
                  <li>
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className={`text-sm hover:text-foreground transition-colors ${selectedCategory === null ? "text-foreground font-medium" : "text-muted-foreground"}`}
                      data-testid="button-all-products"
                    >
                      {t.shop.allProducts}
                    </button>
                  </li>
                  {categories?.map((cat) => (
                    <li key={cat.id}>
                      <button
                        onClick={() => setSelectedCategory(cat.id)}
                        className={`text-sm hover:text-foreground transition-colors ${selectedCategory === cat.id ? "text-foreground font-medium" : "text-muted-foreground"}`}
                        data-testid={`button-category-${cat.id}`}
                      >
                        {language === "ar" ? (cat.nameAr || cat.name) : cat.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </aside>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm flex items-center gap-1.5" data-testid="text-results-count">
                {isLoading ? (
                  <span className="text-muted-foreground">...</span>
                ) : (
                  <>
                    <ShoppingBag size={14} className="text-muted-foreground" />
                    <span className="font-semibold text-foreground tabular-nums">{filteredProducts.length}</span>
                    <span className="text-muted-foreground">{t.shop.itemsCount}</span>
                  </>
                )}
              </p>
              {activeCount > 0 && (
                <button
                  onClick={() => {
                    setSearch("");
                    setSelectedCategory(null);
                    setFilters({ sort: null, sizes: [], colors: [], brands: [], priceRange: [minPrice, maxPrice], inStockOnly: false, newArrivals: false, onSale: false });
                    setLocation("/shop", { replace: true });
                  }}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                  data-testid="button-clear-filters-top"
                >
                  {t.shop.clearFilters}
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="bg-muted aspect-[3/4] mb-4"></div>
                    <div className="h-4 bg-muted w-2/3 mb-2"></div>
                    <div className="h-4 bg-muted w-1/4"></div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-16 sm:py-24 text-muted-foreground">
                <p data-testid="text-no-products">{t.shop.noProducts}</p>
                <button
                  onClick={() => {
                    setSearch("");
                    setSelectedCategory(null);
                    setFilters({ sort: null, sizes: [], colors: [], brands: [], priceRange: [minPrice, maxPrice], inStockOnly: false, newArrivals: false, onSale: false });
                    setLocation("/shop", { replace: true });
                  }}
                  className="mt-4 text-primary uppercase tracking-widest text-sm font-semibold underline"
                  data-testid="button-clear-filters"
                >
                  {t.shop.clearFilters}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
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
        onChange={setFilters}
      />
    </div>
  );
}
