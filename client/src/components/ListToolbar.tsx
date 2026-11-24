import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { FilterState } from "@/components/FilterPanel";
import { useLanguage } from "@/i18n";

/* The row above a product grid: on phones a button that opens the filters, the number of
   products that match, and the sort order. On desktop the filters sit in the sidebar. */
export function ListToolbar({
  filters,
  onChange,
  onOpenFilters,
  activeCount,
  count,
  hideSort,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  onOpenFilters: () => void;
  activeCount: number;
  count?: number;
  /** For pages that already have their own sort control. */
  hideSort?: boolean;
}) {
  const { language } = useLanguage();
  const tr = (ar: string, en: string) => (language === "ar" ? ar : en);
  return (
    <div className="mb-5 flex items-center justify-between gap-3" data-testid="row-list-toolbar">
      <button
        type="button"
        onClick={onOpenFilters}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-foreground/15 bg-card px-4 text-[13px] font-medium lg:hidden"
        data-testid="button-open-filter"
      >
        <SlidersHorizontal className="h-[15px] w-[15px]" />
        {tr("الفلاتر", "Filters")}
        {activeCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">{activeCount}</span>
        )}
      </button>
      <p className="hidden text-[14px] text-muted-foreground lg:block" data-testid="text-results-count">
        {count != null ? (language === "ar" ? count + " منتج" : count + (count === 1 ? " product" : " products")) : ""}
      </p>
      {!hideSort && (
        <span className="relative inline-flex items-center">
          <select
            value={filters.sort || ""}
            onChange={(e) => onChange({ ...filters, sort: (e.target.value || null) as FilterState["sort"] })}
            aria-label={tr("الترتيب", "Sort")}
            className="h-9 cursor-pointer appearance-none rounded-full border border-foreground/15 bg-card pe-9 ps-4 text-[13px] font-medium outline-none transition-colors focus:border-primary"
            data-testid="select-sort"
          >
            <option value="">{tr("الأحدث", "Newest")}</option>
            <option value="rising">{tr("السعر: من الأقل", "Price: low to high")}</option>
            <option value="decreasing">{tr("السعر: من الأعلى", "Price: high to low")}</option>
          </select>
          <ChevronDown className="pointer-events-none absolute end-3 h-4 w-4 text-foreground/60" />
        </span>
      )}
    </div>
  );
}
