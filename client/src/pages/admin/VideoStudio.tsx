import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Download, Loader2, Trash2, Upload } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import { useProducts } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
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
import {
  Choice,
  Field,
  JobList,
  Panel,
  ProductPicker,
  productVariants,
  selectionCount,
  selectionItems,
  type Selection,
} from "@/components/admin/studio/StudioParts";

const LIBRARY_KEY = ["/api/admin/ai-studio/media", "product"];

export default function VideoStudio() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const tr = (ar: string, en: string) => (isAr ? ar : en);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: products } = useProducts();
  const { data: categories } = useCategories();
  const productList = (products as any[]) || [];

  const [tab, setTab] = useState("generate");
  const [selection, setSelection] = useState<Selection>({});
  const [source, setSource] = useState<"main" | "original">("main");
  const [motion, setMotion] = useState<"pushIn" | "drift" | "light">("pushIn");
  const [seconds, setSeconds] = useState(6);
  const [quality, setQuality] = useState<"high" | "standard">("high");
  const [autoPublish, setAutoPublish] = useState(false);
  const [replace, setReplace] = useState(false);
  const [starting, setStarting] = useState(false);

  // Products ticked on the Products page arrive as ?ids=1,2,3.
  useEffect(() => {
    if (!productList.length) return;
    const ids = new URLSearchParams(window.location.search).get("ids");
    if (!ids) return;
    const next: Selection = {};
    for (const id of ids.split(",").map(Number)) {
      if (productList.some((p) => p.id === id)) next[id] = [0];
    }
    if (Object.keys(next).length) setSelection(next);
    window.history.replaceState(null, "", window.location.pathname);
  }, [productList.length]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: LIBRARY_KEY });
    queryClient.invalidateQueries({ queryKey: [api.products.list.path] });
  };
  const { jobs, add, clearFinished } = useStudioJobs("lucerne-video-studio-jobs", refreshAll);

  const { data: library = [], isLoading: libraryLoading } = useQuery<StudioMedia[]>({
    queryKey: LIBRARY_KEY,
    queryFn: () => fetchStudioMedia("product"),
  });

  const count = selectionCount(selection);

  const start = async () => {
    if (!count) return;
    const ok = window.confirm(
      tr(
        `سيتم توليد ${count} فيديو. كل فيديو يُحسب على حساب Gemini الخاص بك. متابعة؟`,
        `${count} video(s) will be generated. Each one is billed to your Gemini account. Continue?`,
      ),
    );
    if (!ok) return;
    setStarting(true);
    try {
      const data = await studioPost("/api/admin/ai-studio/product-videos", {
        items: selectionItems(selection),
        source,
        motion,
        seconds,
        quality,
        autoPublish,
        replace: autoPublish && replace,
      });
      add(data.jobs || []);
      setSelection({});
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
        ? tr("إزالة من المكتبة؟ الفيديو سيبقى على المنتج.", "Remove from the library? The video stays on the product.")
        : tr("حذف هذا الفيديو من المكتبة؟", "Remove this video from the library?"),
    );
    if (!ok) return;
    setBusy(item.id, true);
    try {
      await deleteStudioMedia(item.id);
      queryClient.invalidateQueries({ queryKey: LIBRARY_KEY });
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

  /* ── Download the videos that are on the products ── */
  const [exportSelection, setExportSelection] = useState<Selection>({});
  const withVideo = useMemo(() => productList.filter((p) => productVariants(p).some((v) => v.video)), [productList]);
  const exportRequests = useMemo(() => {
    const requests: DownloadRequest[] = [];
    for (const [productId, indexes] of Object.entries(exportSelection)) {
      const product = productList.find((p) => p.id === Number(productId));
      if (!product) continue;
      const seen = new Set<string>();
      for (const variant of productVariants(product)) {
        if (!indexes.includes(variant.index) || !variant.video || seen.has(variant.video)) continue;
        seen.add(variant.video);
        requests.push({ productId: product.id, url: variant.video });
      }
    }
    return requests;
  }, [exportSelection, productList]);

  const drafts = library.filter((m) => m.status !== "published").length;

  const watermarkSwitch = (
    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
      <Switch checked={watermark} onCheckedChange={setWatermark} data-testid="switch-studio-watermark" />
      {tr("مع العلامة المائية", "With watermark")}
    </label>
  );

  return (
    <AdminLayout>
      <AdminPageHeader
        title={tr("فيديوهات المنتجات", "Product Videos")}
        description={tr(
          "توليد فيديو لكل منتج من صورته نفسها، مراجعته، نشره على صفحة المنتج، وتنزيله",
          "Generate a video of each product from its own photo, review it, publish it on the product page, and download it",
        )}
        icon={Clapperboard}
        iconGradient="from-slate-700 to-slate-900"
        testId="text-video-studio-title"
      />

      <Tabs value={tab} onValueChange={setTab} dir={isAr ? "rtl" : "ltr"}>
        <TabsList className="mb-4 h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="generate" data-testid="tab-studio-generate">{tr("توليد", "Generate")}</TabsTrigger>
          <TabsTrigger value="review" data-testid="tab-studio-review">
            {tr("المراجعة والنشر", "Review & publish")}
            {drafts > 0 && <span className="ms-1.5 rounded-full bg-foreground px-1.5 text-[10px] font-bold text-background tabular-nums">{drafts}</span>}
          </TabsTrigger>
          <TabsTrigger value="download" data-testid="tab-studio-download">{tr("تنزيل فيديوهات المنتجات", "Download product videos")}</TabsTrigger>
        </TabsList>

        {/* ── Generate ── */}
        <TabsContent value="generate" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <Panel title={tr("المنتجات والألوان", "Products and colours")} step={1}>
              <ProductPicker
                products={productList}
                categories={(categories as any[]) || []}
                selection={selection}
                onChange={setSelection}
                isAr={isAr}
                maxItems={60}
                showVideoFilter
              />
            </Panel>

            <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              <Panel title={tr("إعدادات الفيديو", "Video settings")} step={2}>
                <Field
                  label={tr("الصورة التي يبدأ منها الفيديو", "Photo the video starts from")}
                  hint={tr(
                    "الفيديو يبدأ من الصورة نفسها والمنتج لا يتغير فيه. صورة الموقع تعطي نفس شكل صفحة المنتج، والصورة الأصلية هي تصويرك الحقيقي للقطعة.",
                    "The video starts on the photo itself and the product never changes. The site photo matches the product page; the original is your own real photo of the item.",
                  )}
                >
                  <Choice
                    value={source}
                    onChange={setSource}
                    testId="choice-video-source"
                    options={[
                      { value: "main", label: tr("صورة الموقع الرئيسية", "Main site photo") },
                      { value: "original", label: tr("الصورة الأصلية", "Original photo") },
                    ]}
                  />
                </Field>
                <Field label={tr("الحركة", "Motion")} hint={tr("الكاميرا والإضاءة فقط تتحركان. المنتج ثابت ولا يدور حتى لا يخترع الذكاء الاصطناعي تفاصيل غير موجودة.", "Only the camera and the light move. The product stays still and never turns, so the AI cannot invent details.")}>
                  <Choice
                    value={motion}
                    onChange={setMotion}
                    testId="choice-video-motion"
                    options={[
                      { value: "pushIn", label: tr("اقتراب هادئ", "Slow push-in") },
                      { value: "drift", label: tr("حركة جانبية ناعمة", "Gentle side slide") },
                      { value: "light", label: tr("إضاءة متحركة", "Moving light") },
                    ]}
                  />
                </Field>
                <Field label={tr("المدة", "Length")} hint={tr("6 ثوانٍ مناسبة لصفحة المنتج: تتكرر بسلاسة وتُحمَّل بسرعة.", "6 seconds suits the product page: it loops smoothly and loads fast.")}>
                  <Choice
                    value={seconds}
                    onChange={setSeconds}
                    testId="choice-video-seconds"
                    options={[5, 6, 8].map((value) => ({ value, label: tr(`${value} ثوانٍ`, `${value}s`) }))}
                  />
                </Field>
                <Field label={tr("الجودة", "Quality")} hint={tr("المقاس 3:4 مثل معرض صور المنتج بالضبط، فلا يُقص شيء من المنتج.", "The size is 3:4, exactly like the product gallery, so nothing of the product is cut off.")}>
                  <Choice
                    value={quality}
                    onChange={setQuality}
                    testId="choice-video-quality"
                    options={[
                      { value: "high", label: tr("عالية 1080×1440", "High 1080×1440") },
                      { value: "standard", label: tr("عادية 720×960", "Standard 720×960") },
                    ]}
                  />
                </Field>
                <div className="space-y-2.5 rounded-lg border border-border bg-muted/40 p-3">
                  <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-medium">
                    {tr("نشر تلقائي على المنتج بعد التوليد", "Publish on the product automatically")}
                    <Switch checked={autoPublish} onCheckedChange={setAutoPublish} data-testid="switch-video-autopublish" />
                  </label>
                  {autoPublish ? (
                    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-medium">
                      {tr("استبدال الفيديو الحالي إن وُجد", "Replace the current video if there is one")}
                      <Switch checked={replace} onCheckedChange={setReplace} data-testid="switch-video-replace" />
                    </label>
                  ) : (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      {tr("الفيديوهات تُحفظ كمسودات: تراجعها أولاً ثم تنشر ما يعجبك.", "Videos are kept as drafts: you review them first, then publish the ones you like.")}
                    </p>
                  )}
                </div>
                <Button type="button" className="h-11 w-full gap-2" disabled={!count || starting} onClick={start} data-testid="button-video-generate">
                  {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
                  {count ? tr(`توليد ${count} فيديو`, `Generate ${count} video(s)`) : tr("اختر منتجاً أولاً", "Choose a product first")}
                </Button>
              </Panel>
            </div>
          </div>
          <JobList jobs={jobs} isAr={isAr} onClear={clearFinished} />
        </TabsContent>

        {/* ── Review and publish ── */}
        <TabsContent value="review" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <span className="text-sm font-medium" data-testid="text-review-picked">
              {picked.size ? tr(`المحدد: ${picked.size}`, `Selected: ${picked.size}`) : tr(`${library.length} فيديو في المكتبة`, `${library.length} video(s) in the library`)}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              {library.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium underline underline-offset-2"
                  onClick={() => setPicked(picked.size === library.length ? new Set() : new Set(library.map((m) => m.id)))}
                  data-testid="button-review-select-all"
                >
                  {picked.size === library.length ? tr("إلغاء التحديد", "Clear") : tr("تحديد الكل", "Select all")}
                </button>
              )}
              {watermarkSwitch}
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!picked.size || !!downloading}
                onClick={() => runDownload(library.filter((m) => picked.has(m.id)).map((m) => ({ mediaId: m.id })))} data-testid="button-review-download">
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading || tr("تنزيل المحدد", "Download selected")}
              </Button>
              <Button type="button" size="sm" className="gap-1.5" disabled={!library.some((m) => picked.has(m.id) && m.status !== "published")} onClick={publishPicked} data-testid="button-review-publish">
                <Upload className="h-4 w-4" />
                {tr("نشر المحدد", "Publish selected")}
              </Button>
            </div>
          </div>

          {libraryLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : library.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
              {tr("لا توجد فيديوهات بعد. ولّد أول فيديو من تبويب التوليد.", "No videos yet. Generate the first one in the Generate tab.")}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
                        <Button type="button" size="sm" className="h-8 flex-1 gap-1 px-2 text-xs" disabled={busy || item.status === "published"} onClick={() => publishOne(item)} data-testid={`button-publish-${item.id}`}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {item.status === "published" ? tr("على المنتج", "On product") : tr("نشر", "Publish")}
                        </Button>
                        <Button type="button" size="icon" variant="outline" className="h-8 w-8" disabled={!!downloading} onClick={() => runDownload([{ mediaId: item.id }])} title={tr("تنزيل", "Download")} data-testid={`button-download-${item.id}`}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" size="icon" variant="outline" className="h-8 w-8" disabled={busy} onClick={() => removeOne(item)} title={tr("حذف من المكتبة", "Remove from library")} data-testid={`button-remove-${item.id}`}>
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

        {/* ── Download product videos ── */}
        <TabsContent value="download" className="space-y-4">
          <Panel
            title={tr("الفيديوهات الموجودة على المنتجات", "Videos that are on the products")}
            aside={
              <div className="flex flex-wrap items-center gap-3">
                {watermarkSwitch}
                <Button type="button" size="sm" className="gap-1.5" disabled={!exportRequests.length || !!downloading} onClick={() => runDownload(exportRequests)} data-testid="button-export-videos">
                  {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {downloading || tr(`تنزيل ${exportRequests.length} فيديو`, `Download ${exportRequests.length} video(s)`)}
                </Button>
              </div>
            }
          >
            <p className="text-xs text-muted-foreground">
              {tr(
                "اختر المنتجات والألوان. الألوان التي لها فيديو عليها علامة الفيلم. أكثر من فيديو يُنزَّل كملف ZIP واحد.",
                "Choose products and colours. Colours that have a video carry the film mark. Several videos are saved as one ZIP.",
              )}
            </p>
            <ProductPicker
              products={withVideo}
              categories={(categories as any[]) || []}
              selection={exportSelection}
              onChange={setExportSelection}
              isAr={isAr}
              defaultColours="all"
            />
          </Panel>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
