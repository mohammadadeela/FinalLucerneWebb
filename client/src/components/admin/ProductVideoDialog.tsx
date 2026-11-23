import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Download, Film, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { api } from "@shared/routes";
import {
  deleteStudioMedia,
  downloadStudioFiles,
  fetchStudioMedia,
  studioPost,
  useStudioJobs,
  type DownloadRequest,
  type StudioMedia,
} from "@/lib/aiStudio";
import { Choice, Field, JobList, productVariants, selectionCount, selectionItems, type Selection } from "@/components/admin/studio/StudioParts";

const LIBRARY_KEY = ["/api/admin/ai-studio/media", "product"];

/**
 * AI product videos, started from the products ticked on the Products page.
 *
 *   1. "Generate": the ticked products, which of their colours get a video, and the settings.
 *   2. "Review": every generated video. Nothing reaches the storefront until it is published
 *      here (unless the admin switched on automatic publishing).
 */
export function ProductVideoDialog({
  open,
  onOpenChange,
  products,
  productIds,
  isAr,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: any[];
  productIds: number[];
  isAr: boolean;
}) {
  const tr = (ar: string, en: string) => (isAr ? ar : en);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState("generate");
  const [selection, setSelection] = useState<Selection>({});
  const [style, setStyle] = useState<"model" | "tryOn" | "hands" | "unbox" | "photo">("model");
  const [seconds, setSeconds] = useState(10);
  const [combine, setCombine] = useState(true);
  const [starting, setStarting] = useState(false);

  const chosen = useMemo(() => productIds.map((id) => products.find((p) => p.id === id)).filter(Boolean) as any[], [productIds, products]);

  // Each time the dialog opens: the main colour of every ticked product is chosen.
  const idsKey = productIds.join(",");
  useEffect(() => {
    if (!open) return;
    const next: Selection = {};
    for (const product of chosen) next[product.id] = productVariants(product).map((v) => v.index);
    setSelection(next);
    setTab(chosen.length ? "generate" : "review");
    // Old finished lines are not shown again; anything still running stays.
    clearFinished();
  }, [open, idsKey]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: LIBRARY_KEY });
    queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
  };
  const { jobs, add, clearFinished, running } = useStudioJobs("lucerne-video-studio-jobs", refreshAll);

  const { data: library = [], isLoading: libraryLoading } = useQuery<StudioMedia[]>({
    queryKey: LIBRARY_KEY,
    queryFn: () => fetchStudioMedia("product"),
    enabled: open,
    // Always the real list from the server: never a remembered, older one.
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: open && running ? 5000 : false,
  });

  const hasSeveralColours = chosen.some((p) => productVariants(p).length > 1);
  // Together: one video per product (a product with more than 6 colours is split). Apart: one per colour.
  const count = combine
    ? chosen.reduce((sum, p) => sum + Math.ceil((selection[p.id] || []).length / 6), 0)
    : selectionCount(selection);
  const toggleColour = (productId: number, index: number) =>
    setSelection((prev) => {
      const current = prev[productId] || [];
      const nextList = current.includes(index) ? current.filter((i) => i !== index) : [...current, index].sort((a, b) => a - b);
      return { ...prev, [productId]: nextList };
    });
  const start = async () => {
    if (!count) return;
    // A new batch starts with a clean list: results of earlier batches are not mixed in.
    clearFinished();
    setStarting(true);
    try {
      const data = await studioPost("/api/admin/ai-studio/product-videos", {
        items: selectionItems(selection),
        source: "original",
        motion: "pushIn",
        style,
        seconds,
        quality: "high",
        combineColours: combine,
        autoPublish: true,
        replace: true,
      });
      add(data.jobs || []);
      setTab("review");
      toast({ title: tr(`بدأ توليد ${data.jobs?.length || 0} فيديو`, `Started ${data.jobs?.length || 0} video(s)`) });
    } catch (err: any) {
      toast({
        title: tr("تعذر بدء التوليد", "Could not start"),
        description: err?.noKey ? tr("مفتاح GEMINI_API_KEY غير موجود على السيرفر", "GEMINI_API_KEY is missing on the server") : err?.message,
        variant: "destructive",
      });
    } finally {
      setStarting(false);
    }
  };

  /* ── Review and publish ── */
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [watermark, setWatermark] = useState(false);
  const [downloading, setDownloading] = useState("");
  const setBusy = (id: number, on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const publishOne = async (item: StudioMedia, quiet = false): Promise<boolean> => {
    setBusy(item.id, true);
    try {
      try {
        await studioPost(`/api/admin/ai-studio/media/${item.id}/publish`, { replace: false });
      } catch (err: any) {
        if (err?.status !== 409) throw err;
        const ok = window.confirm(
          tr(`"${item.label}" له فيديو حالياً. استبداله بالفيديو الجديد؟`, `"${item.label}" already has a video. Replace it with the new one?`),
        );
        if (!ok) return false;
        await studioPost(`/api/admin/ai-studio/media/${item.id}/publish`, { replace: true });
      }
      if (!quiet) toast({ title: tr("تم نشر الفيديو على المنتج", "Video published on the product") });
      return true;
    } catch (err: any) {
      toast({ title: tr("تعذر النشر", "Could not publish"), description: err?.message, variant: "destructive" });
      return false;
    } finally {
      setBusy(item.id, false);
      if (!quiet) refreshAll();
    }
  };

  const publishPicked = async () => {
    let published = 0;
    for (const item of library.filter((m) => picked.has(m.id) && m.status !== "published")) {
      if (await publishOne(item, true)) published++;
    }
    refreshAll();
    setPicked(new Set());
    toast({ title: tr(`تم نشر ${published} فيديو`, `${published} video(s) published`) });
  };

  const removeOne = async (item: StudioMedia) => {
    const ok = window.confirm(
      item.status === "published"
        ? tr("حذف هذا الفيديو؟ سيُزال من المنتج على الموقع أيضاً.", "Delete this video? It will also be removed from the product on the site.")
        : tr("حذف هذا الفيديو؟", "Delete this video?"),
    );
    if (!ok) return;
    setBusy(item.id, true);
    try {
      await deleteStudioMedia(item.id);
      refreshAll();
    } catch (err: any) {
      toast({ title: tr("تعذر الحذف", "Could not remove"), description: err?.message, variant: "destructive" });
    } finally {
      setBusy(item.id, false);
    }
  };

  const runDownload = async (requests: DownloadRequest[]) => {
    if (!requests.length || downloading) return;
    try {
      const saved = await downloadStudioFiles(requests, watermark, (done, total) =>
        setDownloading(tr(`جاري التجهيز ${done}/${total}`, `Preparing ${done}/${total}`)),
      );
      toast({ title: tr(`تم تنزيل ${saved} فيديو`, `${saved} video(s) downloaded`) });
    } catch (err: any) {
      toast({ title: tr("تعذر التنزيل", "Download failed"), description: err?.message, variant: "destructive" });
    } finally {
      setDownloading("");
    }
  };

  const drafts = library.filter((m) => m.status !== "published").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0" dir={isAr ? "rtl" : "ltr"} data-testid="dialog-product-videos">
        <DialogHeader className="border-b border-border px-5 py-4 text-start">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Clapperboard className="h-5 w-5" />
            {tr("فيديوهات AI للمنتجات", "AI product videos")}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "الفيديو يُصنع من صور المنتج الحقيقية وينزل على المنتج في الموقع.",
              "Each video is made from the product's real photos and goes onto the product on the site.",
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} dir={isAr ? "rtl" : "ltr"} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-3 h-auto w-fit flex-wrap justify-start gap-1">
            <TabsTrigger value="generate" data-testid="tab-video-generate">{tr("توليد", "Generate")}</TabsTrigger>
            <TabsTrigger value="review" data-testid="tab-video-review">
              {tr("الفيديوهات", "Videos")}
              {drafts > 0 && <span className="ms-1.5 rounded-full bg-foreground px-1.5 text-[10px] font-bold text-background tabular-nums">{drafts}</span>}
            </TabsTrigger>
          </TabsList>

          {/* ── Generate ── */}
          <TabsContent value="generate" className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {chosen.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
                {tr("حدّد منتجات من الجدول أولاً ثم اضغط «فيديو AI».", "Tick products in the table first, then press “AI Videos”.")}
              </p>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <section className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">{tr(`المنتجات المحددة (${chosen.length})`, `Selected products (${chosen.length})`)}</h3>
                  </div>
                  <ul className="divide-y divide-border/60 rounded-xl border border-border">
                    {chosen.map((product) => {
                      const variants = productVariants(product);
                      const on = selection[product.id] || [];
                      return (
                        <li key={product.id} className="flex items-center gap-3 p-2.5" data-testid={`row-video-product-${product.id}`}>
                          <img src={variants[on[0] ?? 0]?.image || product.mainImage} alt="" className="h-14 w-11 shrink-0 rounded-md bg-muted object-cover" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{isAr ? product.nameAr || product.name : product.name}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {variants.map((variant) => {
                                const active = on.includes(variant.index);
                                return (
                                  <button
                                    key={variant.index}
                                    type="button"
                                    onClick={() => toggleColour(product.id, variant.index)}
                                    aria-pressed={active}
                                    className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors ${active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-muted-foreground line-through decoration-muted-foreground/50 hover:border-foreground/50"}`}
                                    data-testid={`chip-video-colour-${product.id}-${variant.index}`}
                                  >
                                    {variant.colorCode && <span className="h-3 w-3 rounded-full border border-black/15" style={{ background: variant.colorCode }} />}
                                    {variant.name || tr("المنتج", "Product")}
                                    {variant.video && <Film className="h-3 w-3" aria-label={tr("له فيديو", "Has a video")} />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {hasSeveralColours && (
                    <p className="text-[11px] text-muted-foreground">
                      {tr("اضغط على اللون لإلغائه أو اختياره. الألوان الغامقة هي التي سيُعمل لها فيديو.", "Tap a colour to leave it out or put it back. The dark ones get a video.")}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Film className="h-3 w-3" />
                    {tr("اللون الذي عليه هذه العلامة له فيديو حالياً، والجديد سيأخذ مكانه.", "A colour with this mark already has a video; the new one will take its place.")}
                  </p>
                </section>

                <section className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                  <Field
                    label={tr("نوع الفيديو", "Video style")}
                    hint={
                      style === "model" ? tr("موديل تعرض القطعة كأنه تصوير أزياء: خطوات، وقفة، ولفتة للكاميرا.", "A model presents the piece like a fashion shoot: a few steps, a pose, a turn to the camera.")
                      : style === "tryOn" ? tr("لقطة أقرب وأهدى: القطعة ملبوسة مع حركة بسيطة تبيّن تفاصيلها.", "A closer, calmer shot: the piece worn, with small movement that shows its details.")
                      : style === "hands" ? tr("يدان تعرضان القطعة عن قرب.", "Hands show the piece up close.")
                      : style === "unbox" ? tr("القطعة تخرج من علبة عليها شعار لوسيرن بوتيك.", "The piece comes out of a box with the Lucerne Boutique logo.")
                      : tr("صورتك نفسها مع حركة كاميرا هادئة. الأدق لتفاصيل القطعة.", "Your own photo with a slow camera move. The most exact for product details.")
                    }
                  >
                    <Choice value={style} onChange={setStyle} testId="choice-video-style"
                      options={[
                        { value: "model", label: tr("عرض موديل", "Model showcase") },
                        { value: "tryOn", label: tr("تجربة لبس", "Try-on") },
                        { value: "hands", label: tr("عرض باليد", "In hand") },
                        { value: "unbox", label: tr("فتح العلبة", "Unboxing") },
                        { value: "photo", label: tr("الصورة نفسها", "The photo itself") },
                      ]} />
                  </Field>
                  <Field
                    label={tr("المدة", "Length")}
                    hint={seconds > 10
                      ? tr(`${seconds / 10} مقاطع متصلة كل واحد 10 ثوانٍ: التكلفة والوقت حوالي ${seconds / 10} أضعاف، واحتمال تغيّر التفاصيل أعلى.`, `${seconds / 10} joined 10-second parts: about ${seconds / 10}× the cost and time, and details are more likely to drift.`)
                      : undefined}
                  >
                    <Choice value={seconds} onChange={setSeconds} testId="choice-video-seconds" options={[10, 30, 40].map((value) => ({ value, label: tr(`${value} ث`, `${value}s`) }))} />
                  </Field>
                  {hasSeveralColours && (
                    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3">
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">{tr("كل الألوان في فيديو واحد", "All colours in one video")}</span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                          {combine
                            ? tr("شغّال: فيديو واحد للمنتج تظهر فيه الألوان المختارة كلها بوضوح، وينزل عليها كلها.", "On: one video per product showing all the chosen colours clearly, placed on each of them.")
                            : tr("مطفي: فيديو منفصل لكل لون مختار، من صورته.", "Off: a separate video for each chosen colour, from its own photo.")}
                        </span>
                      </span>
                      <Switch className="mt-0.5 shrink-0" checked={combine} onCheckedChange={setCombine} data-testid="switch-video-combine" />
                    </label>
                  )}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {tr("الفيديو ينزل على المنتج في الموقع تلقائياً. ما عجبك؟ احذفه من تبويب الفيديوهات.", "The video goes onto the product automatically. Don't like one? Delete it in the Videos tab.")}
                  </p>
                  <Button type="button" className="h-11 w-full gap-2" disabled={!count || starting} onClick={start} data-testid="button-video-generate">
                    {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                    {count ? tr(`توليد ${count} فيديو`, `Generate ${count} video(s)`) : tr("اختر لوناً واحداً على الأقل", "Choose at least one colour")}
                  </Button>
                </section>
              </div>
            )}
          </TabsContent>

          {/* ── Review and publish ── */}
          <TabsContent value="review" className="mt-0 min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <JobList jobs={jobs} isAr={isAr} onClear={clearFinished} />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <span className="text-sm font-medium" data-testid="text-review-picked">
                {picked.size ? tr(`المحدد: ${picked.size}`, `Selected: ${picked.size}`) : tr(`${library.length} فيديو`, `${library.length} video(s)`)}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {library.length > 0 && (
                  <button type="button" className="text-xs font-medium underline underline-offset-2"
                    onClick={() => setPicked(picked.size === library.length ? new Set() : new Set(library.map((m) => m.id)))} data-testid="button-review-select-all">
                    {picked.size === library.length ? tr("إلغاء التحديد", "Clear") : tr("تحديد الكل", "Select all")}
                  </button>
                )}
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                  <Switch checked={watermark} onCheckedChange={setWatermark} data-testid="switch-studio-watermark" />
                  {tr("مع العلامة المائية", "With watermark")}
                </label>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!picked.size || !!downloading}
                  onClick={() => runDownload(library.filter((m) => picked.has(m.id)).map((m) => ({ mediaId: m.id })))} data-testid="button-review-download">
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {downloading || tr("تنزيل المحدد", "Download selected")}
                </Button>
                {drafts > 0 && <Button type="button" size="sm" className="gap-1.5" disabled={!library.some((m) => picked.has(m.id) && m.status !== "published")} onClick={publishPicked} data-testid="button-review-publish">
                  <Upload className="h-4 w-4" />
                  {tr("نشر المحدد", "Publish selected")}
                </Button>}
              </div>
            </div>

            {libraryLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : library.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-14 text-center text-sm text-muted-foreground">
                {tr("لا توجد فيديوهات بعد. كل فيديو تولّده يظهر هنا.", "No videos yet. Every video you generate shows up here.")}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {library.map((item) => {
                  const busy = busyIds.has(item.id);
                  return (
                    <article key={item.id} className={`overflow-hidden rounded-xl border bg-card ${picked.has(item.id) ? "border-foreground" : "border-border"}`} data-testid={`card-studio-video-${item.id}`}>
                      <div className="relative aspect-[3/4] bg-muted">
                        <video src={item.url} poster={item.poster || undefined} muted loop playsInline controls preload="none" className="h-full w-full object-cover" />
                        <span className="absolute start-2 top-2 rounded-md bg-background/95 p-1 shadow-sm">
                          <Checkbox
                            checked={picked.has(item.id)}
                            onCheckedChange={(on) =>
                              setPicked((prev) => {
                                const next = new Set(prev);
                                if (on) next.add(item.id);
                                else next.delete(item.id);
                                return next;
                              })
                            }
                            data-testid={`check-studio-video-${item.id}`}
                          />
                        </span>
                        <span className={`absolute end-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.status === "published" ? "bg-emerald-600 text-white" : "bg-background/95 text-foreground"}`}>
                          {item.status === "published" ? tr("منشور", "Published") : tr("مسودة", "Draft")}
                        </span>
                      </div>
                      <div className="space-y-2 p-2.5">
                        <p className="truncate text-xs font-medium" title={item.label || ""}>{item.label}</p>
                        <div className="flex items-center gap-1.5">
                          <Button type="button" size="sm" className="h-8 flex-1 gap-1 px-2 text-xs" disabled={busy || item.status === "published"} onClick={() => publishOne(item)} data-testid={`button-publish-video-${item.id}`}>
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            {item.status === "published" ? tr("على المنتج", "On product") : tr("نشر", "Publish")}
                          </Button>
                          <Button type="button" size="icon" variant="outline" className="h-8 w-8" disabled={!!downloading} onClick={() => runDownload([{ mediaId: item.id }])} title={tr("تنزيل", "Download")} data-testid={`button-download-video-${item.id}`}>
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" size="icon" variant="outline" className="h-8 w-8" disabled={busy} onClick={() => removeOne(item)} title={tr("حذف", "Delete")} data-testid={`button-delete-video-${item.id}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
