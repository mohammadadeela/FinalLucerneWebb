import { useState, useMemo, useEffect, type ElementType } from "react";
import { SlidersHorizontal, ImageIcon } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { ProductCard } from "@/components/ui/ProductCard";
import { PageHero } from "@/components/ui/PageHero";
import { useProducts } from "@/hooks/use-products";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/i18n";
import { useSearch, useLocation } from "wouter";
import type { ColorVariant, Subcategory } from "@shared/schema";
import { FilterPanel, type FilterState, type ColorOption } from "@/components/FilterPanel";
import { COLOR_FAMILIES, groupColorsByFamily, productMatchesColorFamily, normalizeArabic } from "@/lib/colorFamilies";

interface CategoryPageProps {
  title: string;
  subtitle: string;
  categoryIds: number[];
  heroImage: string;
  heroImagePosition?: string;
  heroVideo?: string;
  heroVideoPosition?: string;
  defaultSizes?: string[];
  icon?: ElementType;
}

export default function CategoryPage({ title, subtitle, categoryIds, heroImage, heroImagePosition = "center", heroVideo, heroVideoPosition = "50% 50%", defaultSizes, icon: CategoryIcon }: CategoryPageProps) {
  const { data: products, isLoading } = useProducts();
  const { data: allSubcategories } = useQuery<Subcategory[]>({ queryKey: ["/api/subcategories"] });
  const { t, language } = useLanguage();
  const searchString = useSearch();
  const [location, navigate] = useLocation();
  const urlSubId = new URLSearchParams(searchString).get("sub");
  const [activeSubId, setActiveSubId] = useState<number | null>(urlSubId ? Number(urlSubId) : null);

  useEffect(() => {
    const id = urlSubId ? Number(urlSubId) : null;
    setActiveSubId(id);
  }, [urlSubId]);

  const handleSubClick = (subId: number) => {
    if (activeSubId === subId) {
      // deselect → remove ?sub from URL
      navigate(location.split("?")[0], { replace: true });
    } else {
      navigate(`${location.split("?")[0]}?sub=${subId}`, { replace: true });
    }
  };
  const [search, setSearch] = useState("");
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

  const categoryProducts = useMemo(() => {
    if (!products) return [];
    return products.filter((p) => p.categoryId && categoryIds.includes(p.categoryId));
  }, [products, categoryIds]);

  const allColors = useMemo((): ColorOption[] => {
    const seen = new Map<string, { name: string; colorCode: string }>();
    categoryProducts.forEach((p) => {
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
  }, [categoryProducts]);

  const colorGroups = useMemo(() => groupColorsByFamily(allColors), [allColors]);

  const allSizes = useMemo(() => {
    const set = new Set<string>();
    categoryProducts.forEach((p) => {
      const cv = (p as any).colorVariants as ColorVariant[] | undefined;
      if (cv && cv.length > 0) cv.forEach((v) => (v.sizes || []).forEach((s: string) => set.add(s)));
      else (p.sizes || []).forEach((s) => set.add(s));
    });
    return Array.from(set);
  }, [categoryProducts]);

  const allBrands = useMemo(() => {
    const set = new Set<string>();
    categoryProducts.forEach((p) => { if (p.brand) set.add(p.brand); });
    return Array.from(set).sort();
  }, [categoryProducts]);

  const { minPrice, maxPrice } = useMemo(() => {
    if (categoryProducts.length === 0) return { minPrice: 0, maxPrice: 9999 };
    const prices = categoryProducts.map((p) => parseFloat(p.price.toString()));
    return { minPrice: Math.floor(Math.min(...prices)), maxPrice: Math.ceil(Math.max(...prices)) };
  }, [categoryProducts]);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, priceRange: [minPrice, maxPrice] }));
  }, [minPrice, maxPrice]);

  const filtered = useMemo(() => {
    let result = categoryProducts;
    if (activeSubId !== null) result = result.filter((p: any) => p.subcategoryId === activeSubId);
    if (search) result = result.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    if (filters.colors.length > 0) {
      result = result.filter((p) => {
        const cv = (p as any).colorVariants as ColorVariant[] | undefined;
        const cols = cv && cv.length > 0 ? cv.map((v) => v.name) : (p.colors || []);
        const allTags = cv && cv.length > 0 ? cv.flatMap((v) => v.colorTags || []) : [];
        return productMatchesColorFamily(cols, filters.colors, colorGroups, allTags);
      });
    }
    if (filters.sizes.length > 0) {
      result = result.filter((p) => {
        const cv = (p as any).colorVariants as ColorVariant[] | undefined;
        const szs: string[] = cv && cv.length > 0 ? cv.flatMap((v) => v.sizes || []) : (p.sizes || []);
        return szs.some((s) => filters.sizes.includes(s));
      });
    }
    if (filters.brands.length > 0) result = result.filter((p) => filters.brands.includes(p.brand || ""));
    result = result.filter((p) => {
      const price = parseFloat(p.price.toString());
      return price >= filters.priceRange[0] && price <= filters.priceRange[1];
    });
    if (filters.inStockOnly) result = result.filter((p) => (p.stockQuantity ?? 0) > 0);
    if (filters.newArrivals) result = result.filter((p) => p.isNewArrival);
    if (filters.onSale) result = result.filter((p) => !!p.discountPrice);
    if (filters.sort === "rising") result = [...result].sort((a, b) => parseFloat(a.price.toString()) - parseFloat(b.price.toString()));
    else if (filters.sort === "decreasing") result = [...result].sort((a, b) => parseFloat(b.price.toString()) - parseFloat(a.price.toString()));
    return result;
  }, [categoryProducts, search, filters, activeSubId]);

  const activeCount =
    (filters.sort ? 1 : 0) +
    filters.sizes.length + filters.colors.length + filters.brands.length +
    (filters.inStockOnly ? 1 : 0) + (filters.newArrivals ? 1 : 0) + (filters.onSale ? 1 : 0) +
    (filters.priceRange[0] > minPrice || filters.priceRange[1] < maxPrice ? 1 : 0);

  const clearAll = () => setFilters({ sort: null, sizes: [], colors: [], brands: [], priceRange: [minPrice, maxPrice], inStockOnly: false, newArrivals: false, onSale: false });

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {heroImage || heroVideo ? (
        <PageHero
          image={heroImage}
          imagePosition={heroImagePosition}
          video={heroVideo}
          videoPosition={heroVideoPosition}
          title={title}
          subtitle={subtitle}
          titleTestId="text-category-title"
          subtitleTestId="text-category-subtitle"
        />
      ) : (
        <section className="pt-navbar px-4 sm:px-6 lg:px-8 py-10 sm:py-14 border-b border-border">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-semibold" data-testid="text-category-title">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2" data-testid="text-category-subtitle">{subtitle}</p>}
        </section>
      )}

      {(() => {
        const subs = (allSubcategories || []).filter(s => categoryIds.some(cid => s.categoryId === cid) && s.isActive);
        if (subs.length === 0) return null;
        const ar = language === "ar";
        return (
          <section className="w-full bg-background border-b border-border/40">
            <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              {/* Scroll container: horizontal scroll on mobile, centered wrap on desktop */}
              <div className="relative">
                {/* Edge fade hint – mobile only, accounts for RTL */}
                <div className={`absolute inset-y-0 ${ar ? 'left-0 bg-gradient-to-r' : 'right-0 bg-gradient-to-l'} from-background to-transparent w-10 z-10 pointer-events-none sm:hidden`} />
                <div
                  className="flex gap-3 sm:gap-5 md:gap-7 overflow-x-auto sm:overflow-visible sm:flex-wrap sm:justify-center py-2 px-1 scrollbar-hide snap-x snap-mandatory"
                  data-testid="subcategory-circles"
                >
                  {subs.map(sub => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => handleSubClick(sub.id)}
                      className="snap-start flex flex-col items-center gap-2 flex-shrink-0 group"
                      data-testid={`subcategory-circle-${sub.id}`}
                    >
                      <div className={`w-[72px] h-[72px] sm:w-[90px] sm:h-[90px] md:w-[104px] md:h-[104px] rounded-full overflow-hidden border-2 transition-all duration-200 ${activeSubId === sub.id ? 'border-primary ring-2 ring-primary/40 ring-offset-2 shadow-md' : 'border-border group-hover:border-primary/50 group-hover:shadow-sm'}`}>
                        {sub.image ? (
                          <img
                            src={sub.image}
                            alt={ar ? (sub.nameAr || sub.name) : sub.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted/30 flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 sm:w-7 sm:h-7 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <span className={`text-[11px] sm:text-xs font-medium text-center leading-tight max-w-[76px] sm:max-w-[94px] transition-colors duration-200 ${activeSubId === sub.id ? 'text-primary font-semibold' : 'text-foreground group-hover:text-primary'}`}>
                        {ar ? (sub.nameAr || sub.name) : sub.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-10">
          <div className="flex items-center gap-3">
            <p className="text-sm flex items-center gap-1.5" data-testid="text-product-count">
              {CategoryIcon && <CategoryIcon size={14} className="text-muted-foreground" />}
              <span className="font-semibold text-foreground tabular-nums">{filtered.length}</span>
              <span className="text-muted-foreground">{t.shop.itemsCount}</span>
            </p>
            {activeCount > 0 && (
              <button onClick={clearAll} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors" data-testid="button-clear-filters-top">
                {t.shop.clearFilters}
              </button>
            )}
          </div>
          <div className="flex flex-row gap-2 w-full sm:w-auto items-center">
            <input
              type="text"
              placeholder={t.shop.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 sm:h-12 flex-1 sm:flex-none sm:w-52 rounded-2xl border border-border bg-background/80 px-4 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/70 focus:outline-none focus:border-primary"
              data-testid="input-category-search"
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

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-5">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="bg-muted aspect-[3/4] mb-4"></div>
                <div className="h-4 bg-muted w-2/3 mb-2"></div>
                <div className="h-4 bg-muted w-1/4"></div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 sm:py-24 text-muted-foreground">
            <p data-testid="text-no-products">{t.shop.noProducts}</p>
            <button onClick={clearAll} className="mt-4 text-primary uppercase tracking-widest text-sm font-semibold underline" data-testid="button-clear-filters">
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
        onChange={setFilters}
        defaultSizes={defaultSizes}
      />
    </div>
  );
}
