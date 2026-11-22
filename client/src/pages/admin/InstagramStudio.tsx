import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Film, ImageIcon, Instagram, Loader2, Trash2 } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";
import { useProducts } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import {
  deleteStudioMedia,
  downloadStudioFiles,
  fetchStudioMedia,
  studioPost,
  useStudioJobs,
  type StudioMedia,
} from "@/lib/aiStudio";
import {
  Choice,
  Field,
  JobList,
  Panel,
  ProductPicker,
  selectionCount,
  selectionItems,
  type Selection,
} from "@/components/admin/studio/StudioParts";

const LIBRARY_KEY = ["/api/admin/ai-studio/media", "instagram"];
const MAX_TOGETHER = 6;

type Output = "image" | "video";
type Mode = "single" | "multi" | "colors";
type Format = "post" | "reel" | "square";
type Scene = "studio" | "boutique" | "asIs";

export default function InstagramStudio() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const tr = (ar: string, en: string) => (isAr ? ar : en);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: products } = useProducts();
  const { data: categories } = useCategories();
  const productList = (products as any[]) || [];

  const [output, setOutput] = useState<Output>("image");
  const [mode, setMode] = useState<Mode>("single");
  const [selection, setSelection] = useState<Selection>({});
  const [format, setFormat] = useState<Format>("post");
  const [scene, setScene] = useState<Scene>("studio");
  const [headline, setHeadline] = useState("");
  const [subline, setSubline] = useState("");
  const [position, setPosition] = useState<"top" | "bottom">("top");
  const [tone, setTone] = useState<"auto" | "light" | "dark">("auto");
  const [motion, setMotion] = useState<"pushIn" | "drift" | "light">("pushIn");
  const [seconds, setSeconds] = useState(7);
  const [copies, setCopies] = useState(1);
  const [starting, setStarting] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: LIBRARY_KEY });
  const { jobs, add, clearFinished } = useStudioJobs("lucerne-instagram-studio-jobs", refresh);
  const { data: library = [], isLoading } = useQuery<StudioMedia[]>({
    queryKey: LIBRARY_KEY,
    queryFn: () => fetchStudioMedia("instagram"),
  });

  const changeMode = (next: Mode) => {
    setMode(next);
    setSelection({});
    if (next !== "single" && scene === "asIs") setScene("studio");
  };
  const changeOutput = (next: Output) => {
    setOutput(next);
    // A reel is the natural shape of an Instagram video.
    if (next === "video") setFormat("reel");
    else if (format === "reel") setFormat("post");
  };

  const count = selectionCount(selection);
  const enough = mode === "single" ? count === 1 : count >= 2;

  const start = async () => {
    if (!enough) return;
    if (output === "video") {
      const ok = window.confirm(
        tr(
          `سيتم توليد ${copies} فيديو. كل فيديو يُحسب على حساب Gemini الخاص بك. متابعة؟`,
          `${copies} video(s) will be generated. Each one is billed to your Gemini account. Continue?`,
        ),
      );
      if (!ok) return;
    }
    setStarting(true);
    try {
      const data = await studioPost("/api/admin/ai-studio/instagram", {
        output,
        mode,
        items: selectionItems(selection),
        format,
        scene,
        text: { headline, subline, position, tone },
        motion,
        seconds,
        quality: "high",
        // The untouched product photo is the same every time: one copy is enough.
        copies: scene === "asIs" && output === "image" ? 1 : copies,
      });
      add(data.jobs || []);
      toast({ title: tr("بدأ التوليد", "Generation started") });
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

  /* ── Library ── */
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [watermark, setWatermark] = useState(false);
  const [downloading, setDownloading] = useState("");

  const runDownload = async (ids: number[]) => {
    if (!ids.length || downloading) return;
    try {
      const saved = await downloadStudioFiles(ids.map((mediaId) => ({ mediaId })), watermark, (done, total) =>
        setDownloading(tr(`جاري التجهيز ${done}/${total}`, `Preparing ${done}/${total}`)),
      );
      toast({ title: tr(`تم تنزيل ${saved} ملف`, `${saved} file(s) downloaded`) });
    } catch (err: any) {
      toast({ title: tr("تعذر التنزيل", "Download failed"), description: err?.message, variant: "destructive" });
    } finally {
      setDownloading("");
    }
  };

  const removeOne = async (item: StudioMedia) => {
    if (!window.confirm(tr("حذف من المكتبة؟", "Remove from the library?"))) return;
    try {
      await deleteStudioMedia(item.id);
      setPicked((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      refresh();
    } catch (err: any) {
      toast({ title: tr("تعذر الحذف", "Could not remove"), description: err?.message, variant: "destructive" });
    }
  };

  const pickerHint =
    mode === "single"
      ? tr("اختر منتجاً واحداً ولوناً واحداً.", "Choose one product and one colour.")
      : mode === "multi"
        ? tr(`اختر من 2 إلى ${MAX_TOGETHER} موديلات لتظهر معاً في صورة أو فيديو واحد.`, `Choose 2 to ${MAX_TOGETHER} models to appear together in one picture or video.`)
        : tr(`اختر منتجاً واحداً، وستُحدَّد كل ألوانه (حتى ${MAX_TOGETHER}). أزل أي لون لا تريده.`, `Choose one product; all its colours are ticked (up to ${MAX_TOGETHER}). Untick any you do not want.`);

  return (
    <AdminLayout>
      <AdminPageHeader
        title={tr("استوديو إنستغرام", "Instagram Studio")}
        description={tr(
          "صور وفيديوهات جاهزة للنشر: منتج واحد، عدة موديلات معاً، أو كل ألوان المنتج — مع نص تكتبه أنت",
          "Ready-to-post pictures and videos: one product, several models together, or every colour of a product — with your own text",
        )}
        icon={Instagram}
        iconGradient="from-slate-700 to-slate-900"
        testId="text-instagram-studio-title"
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-4">
          <Panel title={tr("ماذا تريد أن تصنع؟", "What do you want to make?")} step={1}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={tr("النوع", "Type")}>
                <Choice
                  value={output}
                  onChange={changeOutput}
                  testId="choice-ig-output"
                  options={[
                    { value: "image", label: tr("صورة", "Picture") },
                    { value: "video", label: tr("فيديو", "Video") },
                  ]}
                />
              </Field>
              <Field label={tr("المحتوى", "Content")}>
                <Choice
                  value={mode}
                  onChange={changeMode}
                  testId="choice-ig-mode"
                  options={[
                    { value: "single", label: tr("منتج واحد", "One product") },
                    { value: "multi", label: tr("عدة موديلات معاً", "Several models") },
                    { value: "colors", label: tr("كل ألوان المنتج", "All colours") },
                  ]}
                />
              </Field>
            </div>
          </Panel>

          <Panel title={tr("المنتجات", "Products")} step={2}>
            <p className="text-xs text-muted-foreground">{pickerHint}</p>
            <ProductPicker
              key={mode}
              products={productList}
              categories={(categories as any[]) || []}
              selection={selection}
              onChange={setSelection}
              isAr={isAr}
              maxItems={mode === "single" ? 1 : MAX_TOGETHER}
              singleProduct={mode !== "multi"}
              defaultColours={mode === "colors" ? "all" : "first"}
            />
          </Panel>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Panel title={tr("الشكل والنص", "Look and text")} step={3}>
            <Field label={tr("المقاس", "Size")}>
              <Choice
                value={format}
                onChange={setFormat}
                testId="choice-ig-format"
                options={[
                  { value: "post", label: tr("بوست 4:5", "Post 4:5") },
                  { value: "reel", label: tr("ريلز / ستوري 9:16", "Reel / Story 9:16") },
                  { value: "square", label: tr("مربع 1:1", "Square 1:1") },
                ]}
              />
            </Field>
            <Field
              label={tr("الخلفية", "Background")}
              hint={
                scene === "asIs"
                  ? tr("تُستخدم صورة المنتج من الموقع كما هي بدون أي تعديل بالذكاء الاصطناعي: أعلى دقة ممكنة.", "The site photo of the product is used as it is, with no AI change at all: the highest possible accuracy.")
                  : tr("الذكاء الاصطناعي يعيد تصوير القطعة نفسها من صورتها الأصلية بنفس قواعد صور المنتجات: الشكل واللون والتفاصيل لا تتغير.", "The AI re-photographs the same item from its original photo, under the same rules as the product photos: shape, colour and details do not change.")
              }
            >
              <Choice
                value={scene}
                onChange={setScene}
                testId="choice-ig-scene"
                options={[
                  { value: "studio", label: tr("استوديو نظيف", "Clean studio") },
                  { value: "boutique", label: tr("أرضية بوتيك", "Boutique floor") },
                  { value: "asIs", label: tr("صورة المنتج كما هي", "Product photo as is"), disabled: mode !== "single" },
                ]}
              />
            </Field>

            <Field
              label={tr("النص (اختياري)", "Text (optional)")}
              hint={tr("النص يُكتب على الصورة أو الفيديو بحروفك نفسها، فلا يخطئ في السعر أو الإملاء. اتركه فارغاً لمحتوى بدون نص.", "The text is written on the picture or video in your exact characters, so a price or a word is never misspelled. Leave it empty for no text.")}
            >
              <div className="space-y-2">
                <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} dir="auto" placeholder={tr("العنوان — مثال: تشكيلة الشتاء", "Headline — e.g. Winter collection")} data-testid="input-ig-headline" />
                <Input value={subline} onChange={(e) => setSubline(e.target.value)} maxLength={120} dir="auto" placeholder={tr("سطر صغير — مثال: 150₪ • توصيل لكل المناطق", "Small line — e.g. ₪150 • Delivery everywhere")} data-testid="input-ig-subline" />
              </div>
            </Field>
            {(headline.trim() || subline.trim()) && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <Field label={tr("مكان النص", "Text position")}>
                  <Choice
                    value={position}
                    onChange={setPosition}
                    testId="choice-ig-position"
                    options={[
                      { value: "top", label: tr("أعلى", "Top") },
                      { value: "bottom", label: tr("أسفل", "Bottom") },
                    ]}
                  />
                </Field>
                <Field label={tr("لون النص", "Text colour")}>
                  <Choice
                    value={tone}
                    onChange={setTone}
                    testId="choice-ig-tone"
                    options={[
                      { value: "auto", label: tr("تلقائي", "Auto") },
                      { value: "light", label: tr("أبيض", "White") },
                      { value: "dark", label: tr("غامق", "Dark") },
                    ]}
                  />
                </Field>
              </div>
            )}

            {output === "video" && (
              <>
                <Field label={tr("الحركة", "Motion")} hint={tr("الكاميرا والإضاءة فقط تتحركان، والمنتجات ثابتة.", "Only the camera and the light move; the products stay still.")}>
                  <Choice
                    value={motion}
                    onChange={setMotion}
                    testId="choice-ig-motion"
                    options={[
                      { value: "pushIn", label: tr("اقتراب هادئ", "Slow push-in") },
                      { value: "drift", label: tr("حركة جانبية ناعمة", "Gentle side slide") },
                      { value: "light", label: tr("إضاءة متحركة", "Moving light") },
                    ]}
                  />
                </Field>
                <Field label={tr("المدة", "Length")} hint={tr("7 ثوانٍ مناسبة للريلز: كافية ليُرى المنتج ولا يملّ المشاهد.", "7 seconds suits a reel: long enough to see the product, short enough to keep the viewer.")}>
                  <Choice
                    value={seconds}
                    onChange={setSeconds}
                    testId="choice-ig-seconds"
                    options={[5, 7, 10].map((value) => ({ value, label: tr(`${value} ثوانٍ`, `${value}s`) }))}
                  />
                </Field>
              </>
            )}

            <Field label={tr("عدد النسخ", "Versions")} hint={tr("كل نسخة تختلف قليلاً في الخلفية والترتيب، فتختار الأفضل.", "Each version differs a little in background and arrangement, so you can pick the best.")}>
              <Choice
                value={copies}
                onChange={setCopies}
                testId="choice-ig-copies"
                options={[1, 2, 3, 4].map((value) => ({ value, label: String(value), disabled: scene === "asIs" && output === "image" && value > 1 }))}
              />
            </Field>

            <Button type="button" className="h-11 w-full gap-2" disabled={!enough || starting} onClick={start} data-testid="button-ig-generate">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : output === "video" ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
              {enough
                ? output === "video"
                  ? tr("توليد الفيديو", "Generate video")
                  : tr("توليد الصورة", "Generate picture")
                : mode === "single"
                  ? tr("اختر منتجاً أولاً", "Choose a product first")
                  : tr("اختر عنصرين على الأقل", "Choose at least two")}
            </Button>
          </Panel>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <JobList jobs={jobs} isAr={isAr} onClear={clearFinished} />

        <section className="rounded-xl border border-border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
            <h2 className="text-sm font-semibold">
              {picked.size ? tr(`المحدد: ${picked.size}`, `Selected: ${picked.size}`) : tr("المكتبة", "Library")}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {library.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium underline underline-offset-2"
                  onClick={() => setPicked(picked.size === library.length ? new Set() : new Set(library.map((m) => m.id)))}
                  data-testid="button-ig-select-all"
                >
                  {picked.size === library.length ? tr("إلغاء التحديد", "Clear") : tr("تحديد الكل", "Select all")}
                </button>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                <Switch checked={watermark} onCheckedChange={setWatermark} data-testid="switch-ig-watermark" />
                {tr("مع العلامة المائية", "With watermark")}
              </label>
              <Button type="button" size="sm" className="gap-1.5" disabled={!picked.size || !!downloading} onClick={() => runDownload(Array.from(picked))} data-testid="button-ig-download">
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {downloading || tr("تنزيل المحدد", "Download selected")}
              </Button>
            </div>
          </header>
          <div className="p-4">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : library.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">{tr("ما تولّده يظهر هنا.", "What you generate appears here.")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {library.map((item) => {
                  const width = Number(item.meta?.width) || 4;
                  const height = Number(item.meta?.height) || 5;
                  return (
                    <article key={item.id} className={`overflow-hidden rounded-xl border bg-background ${picked.has(item.id) ? "border-foreground" : "border-border"}`} data-testid={`card-ig-media-${item.id}`}>
                      <div className="relative bg-muted" style={{ aspectRatio: `${width} / ${height}` }}>
                        {item.kind === "ig_video" ? (
                          <video src={item.url} poster={item.poster || undefined} muted loop playsInline controls preload="none" className="h-full w-full object-cover" />
                        ) : (
                          <img src={item.url} alt={item.label || ""} loading="lazy" className="h-full w-full object-cover" />
                        )}
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
                            data-testid={`check-ig-media-${item.id}`}
                          />
                        </span>
                        <span className="absolute end-2 top-2 rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-semibold">
                          {item.kind === "ig_video" ? tr("فيديو", "Video") : tr("صورة", "Picture")}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 p-2.5">
                        <p className="min-w-0 flex-1 truncate text-xs font-medium" title={item.label || ""}>{item.label}</p>
                        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" disabled={!!downloading} onClick={() => runDownload([item.id])} title={tr("تنزيل", "Download")} data-testid={`button-ig-download-${item.id}`}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button type="button" size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => removeOne(item)} title={tr("حذف", "Remove")} data-testid={`button-ig-remove-${item.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
