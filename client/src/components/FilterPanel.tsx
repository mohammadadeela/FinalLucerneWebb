import { useState, useCallback } from "react";
import {
  PackagePlus,
  X,
  Plus,
  Minus,
  Tag,
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
  /** "sidebar" shows the groups in place (desktop list pages); the default is a slide-in drawer. */
  variant?: "drawer" | "sidebar";
  /** Shown on the drawer's button, e.g. how many products match. */
  resultCount?: number;
  /** How many products each brand has, shown beside its name. */
  brandCounts?: Record<string, number>;
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
  variant = "drawer",
  resultCount,
  brandCounts,
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

  const tr = (ar: string, en: string) => (language === "ar" ? ar : en);
  const title = "mb-3 font-display text-lg font-semibold text-foreground";
  const chip = (on: boolean) =>
    `inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium transition-colors ${
      on ? "border-foreground bg-foreground text-background" : "border-foreground/15 bg-card text-foreground/80 hover:border-primary hover:text-primary"
    }`;

  const swatches: { key: string; label: string; style: React.CSSProperties; light: boolean }[] =
    groupedColors && groupedColors.length > 0
      ? groupedColors.map((g) => ({
          key: g.familyKey,
          label: language === "ar" ? g.nameAr : g.nameEn,
          style: g.swatch ? { backgroundImage: g.swatch } : { backgroundColor: g.hex },
          light: g.hex.startsWith("#") ? isLightHex(g.hex) : true,
        }))
      : availableColors.map((opt) => {
          const hex = opt.colorCode || colorHex(opt.name);
          return {
            key: opt.name,
            label: translateColorName(opt.name, language === "ar" ? "ar" : "en"),
            style: { backgroundColor: hex },
            light: isLightHex(hex),
          };
        });

  const groups = (
    <div className="space-y-7" dir={isRtl ? "rtl" : "ltr"}>
      {availableBrands.length > 1 && (
        <div>
          <p className={title}>{t.filter.brand}</p>
          <div className="space-y-0.5">
            {availableBrands.map((brand) => {
              const on = filters.brands.includes(brand);
              return (
                <button
                  key={brand}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleBrand(brand)}
                  className={`flex w-full items-center justify-between rounded-full px-3.5 py-2 text-start text-[15px] transition-colors ${on ? "bg-foreground text-background" : "text-foreground/80 hover:bg-accent"}`}
                  data-testid={`button-brand-${brand}`}
                >
                  <span className="truncate">{brand}</span>
                  {brandCounts?.[brand] != null && <span className={`text-[12px] tabular-nums ${on ? "text-background/70" : "text-muted-foreground"}`}>{brandCounts[brand]}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {displaySizes.length > 0 && (
        <div>
          <p className={title}>{t.filter.body}</p>
          <div className="flex flex-wrap gap-2">
            {displaySizes.map((size) => (
              <button key={size} type="button" aria-pressed={filters.sizes.includes(size)} onClick={() => toggleSize(size)} className={chip(filters.sizes.includes(size)) + " min-w-[46px] justify-center px-3"} data-testid={`button-size-${size}`}>
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {swatches.length > 0 && (
        <div>
          <p className={title}>{t.filter.colour}</p>
          <div className="flex flex-wrap gap-x-2 gap-y-3">
            {swatches.map((c) => {
              const on = filters.colors.includes(c.key);
              return (
                <button key={c.key} type="button" aria-pressed={on} onClick={() => toggleColor(c.key)} className="flex w-[52px] flex-col items-center gap-1.5" data-testid={`button-color-${c.key}`}>
                  <span
                    className={`h-11 w-11 rounded-full border transition-shadow ${c.light ? "border-foreground/15" : "border-black/10"} ${on ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                    style={c.style}
                  />
                  <span className={`w-full truncate text-center text-[12px] capitalize ${on ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {maxPrice > minPrice && (
        <div>
          <p className={title}>{t.filter.price}</p>
          <div dir="ltr">
            <Slider
              min={minPrice}
              max={maxPrice}
              step={1}
              value={[filters.priceRange[0], filters.priceRange[1]]}
              onValueChange={(val) => set({ priceRange: [val[0], val[1]] })}
              className="w-full"
              data-testid="slider-price"
            />
            <div className="mt-2.5 flex justify-between text-[13px] tabular-nums text-foreground/80">
              <span>₪{filters.priceRange[0]}</span>
              <span>₪{filters.priceRange[1]}</span>
            </div>
          </div>
        </div>
      )}

      <div>
        <p className={title}>{tr("اعرضي فقط", "Show only")}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={filters.onSale} onClick={() => set({ onSale: !filters.onSale })} className={chip(filters.onSale)} data-testid="toggle-on-sale">{tr("تخفيضات", "On sale")}</button>
          <button type="button" aria-pressed={filters.newArrivals} onClick={() => set({ newArrivals: !filters.newArrivals })} className={chip(filters.newArrivals)} data-testid="toggle-new-arrivals">{tr("وصل حديثاً", "New in")}</button>
          <button type="button" aria-pressed={filters.inStockOnly} onClick={() => set({ inStockOnly: !filters.inStockOnly })} className={chip(filters.inStockOnly)} data-testid="toggle-in-stock">{tr("المتوفر فقط", "In stock")}</button>
        </div>
      </div>

      {activeCount > 0 && (
        <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline" data-testid="button-clear-all-filters">
          <X size={14} />
          {t.filter.clearAll}
        </button>
      )}
    </div>
  );

  if (variant === "sidebar") {
    return <div data-testid="filter-sidebar">{groups}</div>;
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-[999] bg-black/45 backdrop-blur-[2px]" onClick={onClose} />}
      <div
        className={`fixed top-0 ${panelSide} z-[1000] flex h-full w-[88vw] max-w-[380px] flex-col bg-background shadow-2xl transition-transform duration-300 ${open ? "translate-x-0" : slideOut}`}
        data-testid="filter-panel"
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <span className="font-display text-xl font-semibold text-foreground">{t.filter.title}</span>
          <button type="button" onClick={onClose} aria-label={tr("إغلاق", "Close")} className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent" data-testid="button-close-filter">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{groups}</div>
        <div className="border-t border-border p-4">
          <button type="button" onClick={onClose} className="h-12 w-full rounded-full bg-primary text-[15px] font-semibold text-primary-foreground shadow-lg shadow-primary/25" data-testid="button-apply-filters">
            {resultCount != null ? tr("عرض " + resultCount + " منتج", "Show " + resultCount + " products") : t.filter.apply}
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
