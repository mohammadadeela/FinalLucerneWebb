import { SlidersHorizontal } from "lucide-react";
import { SortMenu } from "@/components/SortMenu";
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
        <SortMenu
          value={(filters.sort || "") as "" | "rising" | "decreasing"}
          onChange={(value) => onChange({ ...filters, sort: (value || null) as FilterState["sort"] })}
          options={[
            { value: "", label: tr("الأحدث", "Newest") },
            { value: "rising", label: tr("السعر: من الأقل", "Price: low to high") },
            { value: "decreasing", label: tr("السعر: من الأعلى", "Price: high to low") },
          ]}
        />
      )}
    </div>
  );
}
