// Shared building blocks of the two AI Studio pages: the product and colour picker, the
// settings controls, the job list and the library cards.
import { useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Check, Clock, Film, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { optimizeCloudinaryUrl } from "@/lib/utils";
import type { StudioItem, StudioJob } from "@/lib/aiStudio";

export type Selection = Record<number, number[]>;

export interface PickerVariant {
  index: number;
  name: string;
  colorCode: string;
  image?: string;
  video?: string;
}

/** The colours of a product as the studio needs them; a product without colours is one entry. */
export function productVariants(product: any): PickerVariant[] {
  const variants = Array.isArray(product?.colorVariants) ? product.colorVariants : [];
  if (!variants.length) {
    return [{ index: 0, name: "", colorCode: "", image: product?.mainImage || undefined, video: product?.videoUrl || undefined }];
  }
  return variants.map((variant: any, index: number) => {
    const media = Array.isArray(variant?.media) ? variant.media : [];
    const images = media.filter((m: any) => m?.type === "image" && m.url);
    return {
      index,
      name: String(variant?.name || ""),
      colorCode: String(variant?.colorCode || ""),
      image: variant?.mainImage || images.find((m: any) => m.isPrimary)?.url || images[0]?.url || variant?.images?.[0] || (index === 0 ? product?.mainImage : undefined),
      video: media.find((m: any) => m?.type === "video" && m.url)?.url || (index === 0 ? product?.videoUrl || undefined : undefined),
    };
  });
}

export function selectionItems(selection: Selection): StudioItem[] {
  return Object.entries(selection).flatMap(([productId, indexes]) =>
    indexes.map((variantIndex) => ({ productId: Number(productId), variantIndex })),
  );
}

export function selectionCount(selection: Selection): number {
  return Object.values(selection).reduce((sum, indexes) => sum + indexes.length, 0);
}

/* ───────────────────────────── Settings controls ───────────────────────────── */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold text-foreground">{label}</div>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Choice<T extends string | number>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  testId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" data-testid={testId}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-foreground hover:border-foreground/40"
            }`}
            data-testid={testId ? `${testId}-${option.value}` : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Panel({ title, step, children, aside }: { title: string; step?: number; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
          {step !== undefined && (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background tabular-nums">
              {step}
            </span>
          )}
          {title}
        </h2>
        {aside}
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

/* ───────────────────────────── Product and colour picker ───────────────────────────── */

export function ProductPicker({
  products,
  categories,
  selection,
  onChange,
  isAr,
  maxItems,
  singleProduct = false,
  defaultColours = "first",
  showVideoFilter = false,
}: {
  products: any[];
  categories: any[];
  selection: Selection;
  onChange: (next: Selection) => void;
  isAr: boolean;
  /** The most product colours that may be chosen in total. */
  maxItems?: number;
  /** Only one product may be chosen (its colours can still be several). */
  singleProduct?: boolean;
  /** Which colours are ticked when a product is ticked. */
  defaultColours?: "first" | "all";
  showVideoFilter?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [videoFilter, setVideoFilter] = useState<"all" | "without" | "with">("all");
  const [shown, setShown] = useState(40);
  const tr = (ar: string, en: string) => (isAr ? ar : en);

  const rows = useMemo(
    () => products.map((product) => ({ product, variants: productVariants(product) })),
    [products],
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter(({ product, variants }) => {
      if (categoryId !== "all" && Number(product.categoryId) !== categoryId) return false;
      if (videoFilter === "without" && variants.every((v) => v.video)) return false;
      if (videoFilter === "with" && !variants.some((v) => v.video)) return false;
      if (!needle) return true;
      return (
        String(product.name || "").toLowerCase().includes(needle) ||
        String(product.barcode || "").toLowerCase().includes(needle) ||
        String(product.id) === needle
      );
    });
  }, [rows, search, categoryId, videoFilter]);

  const total = selectionCount(selection);
  const room = (extra: number) => (maxItems === undefined ? extra : Math.max(0, Math.min(extra, maxItems - total)));

  const toggleProduct = (product: any, variants: PickerVariant[]) => {
    const next: Selection = singleProduct ? {} : { ...selection };
    if (selection[product.id]) {
      delete next[product.id];
      if (singleProduct) return onChange({});
      return onChange(next);
    }
    const wanted = (defaultColours === "all" ? variants : variants.slice(0, 1)).map((v) => v.index);
    const base = singleProduct ? 0 : total;
    const allowed = maxItems === undefined ? wanted : wanted.slice(0, Math.max(0, maxItems - base));
    if (!allowed.length) return;
    next[product.id] = allowed;
    onChange(next);
  };

  const toggleColour = (product: any, index: number) => {
    const current = selection[product.id] || [];
    const next: Selection = singleProduct ? {} : { ...selection };
    if (current.includes(index)) {
      const rest = current.filter((i) => i !== index);
      if (rest.length) next[product.id] = rest;
      else delete next[product.id];
      return onChange(next);
    }
    // With room for only one, choosing another colour moves the choice to it.
    if (maxItems === 1) return onChange({ [product.id]: [index] });
    const base = singleProduct ? current.length : total;
    if (maxItems !== undefined && base >= maxItems) return;
    next[product.id] = [...current, index].sort((a, b) => a - b);
    onChange(next);
  };

  const selectAllShown = () => {
    const next: Selection = { ...selection };
    let left = maxItems === undefined ? Infinity : maxItems - total;
    for (const { product, variants } of filtered) {
      if (next[product.id]) continue;
      const wanted = (defaultColours === "all" ? variants : variants.slice(0, 1)).map((v) => v.index).slice(0, left);
      if (!wanted.length) break;
      next[product.id] = wanted;
      left -= wanted.length;
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShown(40); }}
            placeholder={tr("بحث بالاسم أو الباركود", "Search by name or barcode")}
            className="h-10 ps-9"
            data-testid="input-studio-search"
          />
        </div>
        <select
          value={String(categoryId)}
          onChange={(e) => { setCategoryId(e.target.value === "all" ? "all" : Number(e.target.value)); setShown(40); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          data-testid="select-studio-category"
        >
          <option value="all">{tr("كل الفئات", "All categories")}</option>
          {categories.map((category: any) => (
            <option key={category.id} value={category.id}>
              {isAr ? category.nameAr || category.name : category.name}
            </option>
          ))}
        </select>
        {showVideoFilter && (
          <select
            value={videoFilter}
            onChange={(e) => { setVideoFilter(e.target.value as any); setShown(40); }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            data-testid="select-studio-video-filter"
          >
            <option value="all">{tr("كل المنتجات", "All products")}</option>
            <option value="without">{tr("بدون فيديو", "Without a video")}</option>
            <option value="with">{tr("لها فيديو", "With a video")}</option>
          </select>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span data-testid="text-studio-selected">
          {tr(`المحدد: ${total}`, `Selected: ${total}`)}
          {maxItems !== undefined && ` / ${maxItems}`}
        </span>
        <span className="flex items-center gap-3">
          {!singleProduct && room(1) > 0 && filtered.length > 0 && (
            <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={selectAllShown} data-testid="button-studio-select-all">
              {tr("تحديد كل النتائج", "Select all results")}
            </button>
          )}
          {total > 0 && (
            <button type="button" className="font-medium text-foreground underline underline-offset-2" onClick={() => onChange({})} data-testid="button-studio-clear">
              {tr("إلغاء التحديد", "Clear")}
            </button>
          )}
        </span>
      </div>

      <ul className="max-h-[30rem] space-y-1.5 overflow-y-auto pe-1" data-testid="list-studio-products">
        {filtered.slice(0, shown).map(({ product, variants }) => {
          const chosen = selection[product.id] || [];
          const picked = chosen.length > 0;
          const thumb = variants.find((v) => chosen.includes(v.index))?.image || variants[0]?.image || product.mainImage;
          return (
            <li
              key={product.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                picked ? "border-foreground/50 bg-muted/50" : "border-border bg-background hover:border-foreground/25"
              }`}
              data-testid={`row-studio-product-${product.id}`}
            >
              <Checkbox checked={picked} onCheckedChange={() => toggleProduct(product, variants)} data-testid={`check-studio-product-${product.id}`} />
              <button type="button" onClick={() => toggleProduct(product, variants)} className="h-14 w-[42px] shrink-0 overflow-hidden rounded-md bg-muted">
                {thumb && <img src={optimizeCloudinaryUrl(thumb, 200) || thumb} alt="" loading="lazy" className="h-full w-full object-cover" />}
              </button>
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => toggleProduct(product, variants)} className="block max-w-full truncate text-start text-sm font-medium text-foreground">
                  {product.name}
                </button>
                <div className="mt-1 flex flex-wrap gap-1">
                  {variants.map((variant) => {
                    const on = chosen.includes(variant.index);
                    return (
                      <button
                        key={variant.index}
                        type="button"
                        onClick={() => toggleColour(product, variant.index)}
                        className={`flex h-7 items-center gap-1.5 rounded-full border px-2 text-[11px] transition-colors ${
                          on ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground hover:border-foreground/40"
                        }`}
                        title={variant.video ? tr("لهذا اللون فيديو", "This colour has a video") : undefined}
                        data-testid={`chip-studio-colour-${product.id}-${variant.index}`}
                      >
                        {variant.colorCode && <span className="h-3 w-3 rounded-full border border-black/15" style={{ backgroundColor: variant.colorCode }} />}
                        <span className="max-w-[7rem] truncate">{variant.name || tr("اللون الأساسي", "Default")}</span>
                        {variant.video && <Film className="h-3 w-3 opacity-70" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            {tr("لا توجد منتجات مطابقة", "No matching products")}
          </li>
        )}
      </ul>
      {filtered.length > shown && (
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setShown((n) => n + 60)} data-testid="button-studio-more">
          {tr(`عرض المزيد (${filtered.length - shown})`, `Show more (${filtered.length - shown})`)}
        </Button>
      )}
    </div>
  );
}

/* ───────────────────────────── Job list ───────────────────────────── */

export function JobList({ jobs, isAr, onClear }: { jobs: StudioJob[]; isAr: boolean; onClear: () => void }) {
  const tr = (ar: string, en: string) => (isAr ? ar : en);
  if (!jobs.length) return null;
  const done = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "error").length;
  const pending = jobs.length - done - failed;
  return (
    <section className="rounded-xl border border-border bg-card" data-testid="panel-studio-jobs">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <h2 className="text-sm font-semibold">
          {pending > 0 ? tr(`جاري التوليد: ${done + failed} من ${jobs.length}`, `Generating: ${done + failed} of ${jobs.length}`) : tr("انتهى التوليد", "Generation finished")}
          {failed > 0 && <span className="ms-2 text-xs font-medium text-destructive">{tr(`فشل ${failed}`, `${failed} failed`)}</span>}
        </h2>
        {pending < jobs.length && (
          <button type="button" className="text-xs font-medium underline underline-offset-2" onClick={onClear} data-testid="button-studio-clear-jobs">
            {tr("إخفاء المنتهي", "Hide finished")}
          </button>
        )}
      </header>
      <div className="h-1 w-full bg-muted">
        <div className="h-full bg-foreground transition-all" style={{ width: `${((done + failed) / jobs.length) * 100}%` }} />
      </div>
      <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto">
        {jobs.map((job) => (
          <li key={job.id} className="flex items-center gap-3 px-4 py-2 text-sm" data-testid={`row-studio-job-${job.id}`}>
            {job.status === "done" && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
            {job.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />}
            {job.status === "running" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-foreground" />}
            {job.status === "queued" && <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate">{job.label}</span>
            <span className="max-w-[55%] truncate text-xs text-muted-foreground" dir="auto" title={job.message}>
              {job.status === "queued" && tr("في الانتظار", "Waiting")}
              {job.status === "running" && tr("جاري التوليد", "Generating")}
              {job.status === "done" &&
                (job.result?.publishSkipped === "low_fidelity"
                  ? tr("جاهز كمسودة — التفاصيل قد لا تطابق القطعة، راجعه قبل النشر", "Saved as a draft — details may not match the product, review before publishing")
                  : job.result?.publishSkipped
                  ? tr("جاهز — لم يُنشر لأن اللون له فيديو", "Ready — not published: the colour has a video")
                  : job.result?.media?.status === "published"
                    ? tr("جاهز ومنشور", "Ready and published")
                    : tr("جاهز", "Ready"))}
              {job.status === "error" &&
                (job.noKey
                  ? tr("مفتاح GEMINI_API_KEY غير موجود على السيرفر", "GEMINI_API_KEY is missing on the server")
                  : job.noCredit
                    ? tr("رصيد Gemini خلص. اشحنه من Google AI Studio ثم حاول. تم إيقاف الباقي.", "Gemini balance is empty. Top it up in Google AI Studio, then retry. The rest was stopped.")
                    : job.stopped
                      ? tr("لم يبدأ: تم إيقاف الباقي بعد تكرار الأخطاء حتى لا يُخصم شيء.", "Not started: the rest was stopped after repeated errors so nothing is charged.")
                      : job.message)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
