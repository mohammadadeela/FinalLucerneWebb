import { useState, useCallback } from "react";
import {
  X,
  Plus,
  Minus,
  Tag,
  Sparkles,
  Percent,
  Package,
  ChevronDown,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useLanguage } from "@/i18n";
import { translateColorName, type GroupedColor } from "@/lib/colorFamilies";

const COLOR_MAP: Record<string, string> = {
  black: "#1a1a1a",
  أسود: "#1a1a1a",
  white: "#ffffff",
  أبيض: "#ffffff",
  gray: "#9ca3af",
  grey: "#9ca3af",
  رمادي: "#9ca3af",
  blue: "#3b82f6",
  أزرق: "#3b82f6",
  red: "#ef4444",
  أحمر: "#ef4444",
  green: "#16a34a",
  أخضر: "#16a34a",
  yellow: "#eab308",
  أصفر: "#eab308",
  orange: "#f97316",
  برتقالي: "#f97316",
  pink: "#ec4899",
  وردي: "#ec4899",
  purple: "#a855f7",
  بنفسجي: "#a855f7",
  brown: "#92400e",
  بني: "#92400e",
  navy: "#1e3a5f",
  كحلي: "#1e3a5f",
  beige: "#d4b483",
  بيج: "#d4b483",
  cream: "#fffdd0",
  كريمي: "#fffdd0",
  gold: "#d4af37",
  ذهبي: "#d4af37",
  silver: "#c0c0c0",
  فضي: "#c0c0c0",
  khaki: "#c3b091",
  كاكي: "#c3b091",
  coral: "#ff7f7f",
  مرجاني: "#ff7f7f",
  teal: "#0d9488",
  زيتي: "#0d9488",
  lavender: "#e6e6fa",
  لافندر: "#e6e6fa",
  maroon: "#800000",
  كستنائي: "#800000",
  olive: "#6b7c11",
  زيتون: "#6b7c11",
  mint: "#98ff98",
  نعناعي: "#98ff98",
  ivory: "#fffff0",
  عاجي: "#fffff0",
  champagne: "#f7e7ce",
  شمبانيا: "#f7e7ce",
  camel: "#c19a6b",
  كاميل: "#c19a6b",
  burgundy: "#800020",
  عنابي: "#800020",
  rose: "#ff007f",
  وردة: "#ff007f",
  nude: "#e8c9a0",
  nude_ar: "#e8c9a0",
  turquoise: "#40e0d0",
  تركواز: "#40e0d0",
};

const SIZES = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "2XL",
  "3XL",
  "30",
  "32",
  "34",
  "36",
  "37",
  "38",
  "39",
  "40",
  "41",
  "42",
];

export interface ColorOption {
  name: string;
  colorCode: string;
}

export interface FilterState {
  sort: "rising" | "decreasing" | null;
  sizes: string[];
  colors: string[];
  brands: string[];
  priceRange: [number, number];
  inStockOnly: boolean;
  newArrivals: boolean;
  onSale: boolean;
}

interface FilterPanelProps {
  open: boolean;
  onClose: () => void;
  availableColors: ColorOption[];
  groupedColors?: GroupedColor[];
  availableSizes: string[];
  availableBrands: string[];
  minPrice: number;
  maxPrice: number;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  defaultSizes?: string[];
}

export function FilterPanel({
  open,
  onClose,
  availableColors,
  groupedColors,
  availableSizes,
  availableBrands,
  minPrice,
  maxPrice,
  filters,
  onChange,
  defaultSizes,
}: FilterPanelProps) {
  const { t, language } = useLanguage();
  const isRtl = language === "ar";

  const [sortOpen, setSortOpen] = useState(true);
  const [sizesOpen, setSizesOpen] = useState(true);
  const [colorsOpen, setColorsOpen] = useState(true);
  const [brandsOpen, setBrandsOpen] = useState(true);
  const [priceOpen, setPriceOpen] = useState(true);

  const activeCount =
    (filters.sort ? 1 : 0) +
    filters.sizes.length +
    filters.colors.length +
    filters.brands.length +
    (filters.inStockOnly ? 1 : 0) +
    (filters.newArrivals ? 1 : 0) +
    (filters.onSale ? 1 : 0) +
    (filters.priceRange[0] > minPrice || filters.priceRange[1] < maxPrice
      ? 1
      : 0);

  const set = useCallback(
    (patch: Partial<FilterState>) => onChange({ ...filters, ...patch }),
    [filters, onChange],
  );

  const toggleSize = useCallback(
    (size: string) =>
      set({
        sizes: filters.sizes.includes(size)
          ? filters.sizes.filter((s) => s !== size)
          : [...filters.sizes, size],
      }),
    [filters, set],
  );

  const toggleColor = useCallback(
    (name: string) =>
      set({
        colors: filters.colors.includes(name)
          ? filters.colors.filter((c) => c !== name)
          : [...filters.colors, name],
      }),
    [filters, set],
  );

  const toggleBrand = useCallback(
    (brand: string) =>
      set({
        brands: filters.brands.includes(brand)
          ? filters.brands.filter((b) => b !== brand)
          : [...filters.brands, brand],
      }),
    [filters, set],
  );

  const displaySizes =
    availableSizes.length > 0
      ? SIZES.filter((s) => availableSizes.includes(s))
      : defaultSizes
        ? defaultSizes
        : SIZES.slice(0, 9);

  const colorHex = (name: string) =>
    COLOR_MAP[name.toLowerCase()] ?? COLOR_MAP[name] ?? "#d1d5db";

  const clearAll = () =>
    onChange({
      sort: null,
      sizes: [],
      colors: [],
      brands: [],
      priceRange: [minPrice, maxPrice],
      inStockOnly: false,
      newArrivals: false,
      onSale: false,
    });

  const panelSide = isRtl ? "left-0" : "right-0";
  const slideOut = isRtl ? "-translate-x-full" : "translate-x-full";

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      )}

      <div
        className={`fixed top-0 ${panelSide} h-full w-[85vw] max-w-[320px] bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : slideOut}`}
        data-testid="filter-panel"
        dir="ltr"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-base text-gray-900">
              {t.filter.title}
            </span>
            {activeCount > 0 && (
              <span className="bg-gray-900 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {activeCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-foreground hover:text-foreground/70 transition-colors"
            data-testid="button-close-filter"
          >
            <X size={20} strokeWidth={2.5} className="animate-shake-hint" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 border-b border-gray-100">
            <button
              onClick={() => setSortOpen((v) => !v)}
              className="flex items-center justify-between w-full"
              data-testid="button-toggle-sort"
            >
              <p className="font-semibold text-sm text-gray-900">
                {t.filter.sort}
              </p>
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform duration-200 ${sortOpen ? "rotate-180" : ""}`}
              />
            </button>
            {sortOpen && (
              <div className="grid grid-cols-2 gap-2.5 mt-4">
                <button
                  onClick={() =>
                    set({
                      sort: filters.sort === "decreasing" ? null : "decreasing",
                    })
                  }
                  className={`rounded-xl border text-sm py-3 px-3 text-center transition-all ${filters.sort === "decreasing" ? "border-gray-900 bg-gray-900 font-semibold text-white shadow-sm" : "border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50"}`}
                  data-testid="button-sort-decreasing"
                >
                  {t.filter.decreasingPrice}
                </button>
                <button
                  onClick={() =>
                    set({ sort: filters.sort === "rising" ? null : "rising" })
                  }
                  className={`rounded-xl border text-sm py-3 px-3 text-center transition-all ${filters.sort === "rising" ? "border-gray-900 bg-gray-900 font-semibold text-white shadow-sm" : "border-gray-200 text-gray-600 hover:border-gray-400 hover:bg-gray-50"}`}
                  data-testid="button-sort-rising"
                >
                  {t.filter.risingPrice}
                </button>
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-b border-gray-100">
            <p className="font-semibold text-xs text-gray-500 uppercase tracking-wider mb-3">
              {t.filter.quickFilters}
            </p>
            <div className="flex flex-col gap-2.5">
              <div
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => set({ inStockOnly: !filters.inStockOnly })}
                data-testid="toggle-in-stock"
              >
                <div className="flex items-center gap-2 text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                  <Package size={14} className="text-gray-400" />
                  {t.filter.inStockOnly}
                </div>
                <div
                  className={`relative w-9 h-5 rounded-full transition-colors pointer-events-none ${filters.inStockOnly ? "bg-gray-900" : "bg-gray-200"}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${filters.inStockOnly ? "translate-x-4" : ""}`}
                  />
                </div>
              </div>
              <div
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => set({ newArrivals: !filters.newArrivals })}
                data-testid="toggle-new-arrivals"
              >
                <div className="flex items-center gap-2 text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                  <Sparkles size={14} className="text-gray-400" />
                  {t.filter.newArrivals}
                </div>
                <div
                  className={`relative w-9 h-5 rounded-full transition-colors pointer-events-none ${filters.newArrivals ? "bg-gray-900" : "bg-gray-200"}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${filters.newArrivals ? "translate-x-4" : ""}`}
                  />
                </div>
              </div>
              <div
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => set({ onSale: !filters.onSale })}
                data-testid="toggle-on-sale"
              >
                <div className="flex items-center gap-2 text-sm text-gray-700 group-hover:text-gray-900 transition-colors">
                  <Percent size={14} className="text-gray-400" />
                  {t.filter.onSale}
                </div>
                <div
                  className={`relative w-9 h-5 rounded-full transition-colors pointer-events-none ${filters.onSale ? "bg-gray-900" : "bg-gray-200"}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${filters.onSale ? "translate-x-4" : ""}`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 border-b border-gray-100">
            <button
              onClick={() => setSizesOpen((v) => !v)}
              className="flex items-center justify-between w-full"
              data-testid="button-toggle-sizes"
            >
              <p className="font-semibold text-sm text-gray-900">
                {t.filter.body}
              </p>
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform duration-200 ${sizesOpen ? "rotate-180" : ""}`}
              />
            </button>
            {filters.sizes.length > 0 && !sizesOpen && (
              <p className="text-xs text-gray-400 mt-1">
                {filters.sizes.length} {language === "ar" ? "محدد" : "selected"}
              </p>
            )}
            {sizesOpen && (
              <div className="flex flex-wrap gap-2 mt-4">
                {displaySizes.map((size) => (
                  <button
                    key={size}
                    onClick={() => toggleSize(size)}
                    className={`min-w-[40px] h-9 px-3 text-sm border transition-all ${filters.sizes.includes(size) ? "border-gray-900 bg-gray-900 text-white font-semibold" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                    data-testid={`button-size-${size}`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            )}
            {filters.sizes.length > 0 && (
              <button
                onClick={() => set({ sizes: [] })}
                className="mt-3 text-xs text-gray-400 hover:text-gray-700 underline"
              >
                {t.filter.clearSizes}
              </button>
            )}
          </div>

          <div className="px-6 py-5 border-b border-gray-100">
            <button
              onClick={() => setColorsOpen((v) => !v)}
              className="flex items-center justify-between w-full"
              data-testid="button-toggle-colors"
            >
              <p className="font-semibold text-sm text-gray-900">
                {t.filter.colour}
              </p>
              <ChevronDown
                size={16}
                className={`text-gray-400 transition-transform duration-200 ${colorsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {filters.colors.length > 0 && !colorsOpen && (
              <p className="text-xs text-gray-400 mt-1">
                {filters.colors.length}{" "}
                {language === "ar" ? "محدد" : "selected"}
              </p>
            )}
            {colorsOpen && groupedColors && groupedColors.length > 0 && (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-3 mt-4">
                  {groupedColors.map((g) => {
                    const hex = g.hex;
                    const isLight = isLightHex(hex);
                    const isSelected = filters.colors.includes(g.familyKey);
                    const displayName = language === "ar" ? g.nameAr : g.nameEn;
                    return (
                      <button
                        key={g.familyKey}
                        onClick={() => toggleColor(g.familyKey)}
                        className={`flex items-center gap-2 text-sm transition-colors ${isSelected ? "text-gray-900 font-semibold" : "text-gray-600 hover:text-gray-900"}`}
                        data-testid={`button-color-${g.familyKey}`}
                      >
                        <span
                          className={`w-7 h-7 rounded-full flex-shrink-0 border-2 ${isLight ? "border-gray-300" : "border-transparent"} ${isSelected ? "ring-2 ring-offset-1 ring-gray-700" : ""}`}
                          style={{ backgroundColor: hex }}
                        />
                        <span>{displayName}</span>
                      </button>
                    );
                  })}
                </div>
                {filters.colors.length > 0 && (
                  <button
                    onClick={() => set({ colors: [] })}
                    className="mt-3 text-xs text-gray-400 hover:text-gray-700 underline"
                  >
                    {t.filter.clearColours}
                  </button>
                )}
              </>
            )}
            {colorsOpen &&
              (!groupedColors || groupedColors.length === 0) &&
              availableColors.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-x-4 gap-y-3 mt-4">
                    {availableColors.map((opt) => {
                      const hex = opt.colorCode || colorHex(opt.name);
                      const isLight = isLightHex(hex);
                      const isSelected = filters.colors.includes(opt.name);
                      return (
                        <button
                          key={opt.name}
                          onClick={() => toggleColor(opt.name)}
                          className={`flex items-center gap-2 text-sm transition-colors ${isSelected ? "text-gray-900 font-semibold" : "text-gray-600 hover:text-gray-900"}`}
                          data-testid={`button-color-${opt.name}`}
                        >
                          <span
                            className={`w-7 h-7 rounded-full flex-shrink-0 border-2 ${isLight ? "border-gray-300" : "border-transparent"} ${isSelected ? "ring-2 ring-offset-1 ring-gray-700" : ""}`}
                            style={{ backgroundColor: hex }}
                          />
                          <span className="capitalize">
                            {translateColorName(
                              opt.name,
                              language === "ar" ? "ar" : "en",
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {filters.colors.length > 0 && (
                    <button
                      onClick={() => set({ colors: [] })}
                      className="mt-3 text-xs text-gray-400 hover:text-gray-700 underline"
                    >
                      {t.filter.clearColours}
                    </button>
                  )}
                </>
              )}
          </div>

          {availableBrands.length > 1 && (
            <div className="px-6 py-5 border-b border-gray-100">
              <button
                onClick={() => setBrandsOpen((v) => !v)}
                className="flex items-center justify-between w-full"
                data-testid="button-toggle-brands"
              >
                <p className="font-semibold text-sm text-gray-900">
                  {t.filter.brand}
                </p>
                <ChevronDown
                  size={16}
                  className={`text-gray-400 transition-transform duration-200 ${brandsOpen ? "rotate-180" : ""}`}
                />
              </button>
              {filters.brands.length > 0 && !brandsOpen && (
                <p className="text-xs text-gray-400 mt-1">
                  {filters.brands.length}{" "}
                  {language === "ar" ? "محدد" : "selected"}
                </p>
              )}
              {brandsOpen && (
                <>
                  <div className="flex flex-col gap-2.5 mt-4">
                    {availableBrands.map((brand) => (
                      <button
                        key={brand}
                        onClick={() => toggleBrand(brand)}
                        className={`flex items-center gap-2 text-sm transition-colors text-left ${filters.brands.includes(brand) ? "text-gray-900 font-semibold" : "text-gray-500 hover:text-gray-900"}`}
                        data-testid={`button-brand-${brand}`}
                      >
                        <span
                          className={`w-3.5 h-3.5 border rounded-sm flex-shrink-0 flex items-center justify-center transition-colors ${filters.brands.includes(brand) ? "border-gray-900 bg-gray-900" : "border-gray-300"}`}
                        >
                          {filters.brands.includes(brand) && (
                            <svg
                              className="w-2.5 h-2.5 text-white"
                              fill="none"
                              viewBox="0 0 12 12"
                            >
                              <path
                                d="M2 6l3 3 5-5"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        {brand}
                      </button>
                    ))}
                  </div>
                  {filters.brands.length > 0 && (
                    <button
                      onClick={() => set({ brands: [] })}
                      className="mt-3 text-xs text-gray-400 hover:text-gray-700 underline"
                    >
                      {t.filter.clearBrands}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {maxPrice > 0 && (
            <div className="px-6 py-5">
              <button
                onClick={() => setPriceOpen((v) => !v)}
                className="flex items-center justify-between w-full"
                data-testid="button-toggle-price"
              >
                <p className="font-semibold text-sm text-gray-900">
                  {t.filter.price}
                </p>
                <ChevronDown
                  size={16}
                  className={`text-gray-400 transition-transform duration-200 ${priceOpen ? "rotate-180" : ""}`}
                />
              </button>
              {(filters.priceRange[0] > minPrice ||
                filters.priceRange[1] < maxPrice) &&
                !priceOpen && (
                  <p className="text-xs text-gray-400 mt-1">
                    ₪{filters.priceRange[0]} – ₪{filters.priceRange[1]}
                  </p>
                )}
              {priceOpen && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-500 tabular-nums">
                      ₪{filters.priceRange[0]}
                    </span>
                    <span className="text-sm text-gray-500 tabular-nums">
                      ₪{filters.priceRange[1]}
                    </span>
                  </div>
                  <Slider
                    min={minPrice}
                    max={maxPrice}
                    step={1}
                    value={[filters.priceRange[0], filters.priceRange[1]]}
                    onValueChange={(val) =>
                      set({ priceRange: [val[0], val[1]] })
                    }
                    className="w-full"
                    data-testid="slider-price"
                  />
                  <div className="flex justify-between mt-2 text-xs text-gray-400">
                    <span>₪{minPrice}</span>
                    <span>₪{maxPrice}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between gap-3">
          <button
            onClick={clearAll}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors font-medium underline underline-offset-4 decoration-gray-300 hover:decoration-gray-700"
            data-testid="button-clear-all-filters"
          >
            {t.filter.clearAll}
          </button>
          <button
            onClick={onClose}
            className="bg-gray-900 text-white text-sm px-6 py-2.5 rounded-full hover:bg-gray-700 transition-colors font-semibold tracking-wide shadow-sm"
            data-testid="button-apply-filters"
          >
            {t.filter.apply} ({activeCount})
          </button>
        </div>
      </div>
    </>
  );
}

function isLightHex(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return true;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7;
}
