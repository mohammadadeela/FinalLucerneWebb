import { useEffect, useState, useRef, useCallback } from "react";
import BulkAIGenerate from "@/components/admin/BulkAIGenerate";
import ImageCropDialog from "@/components/admin/ImageCropDialog";
import AIGenerateImageButton from "@/components/admin/AIGenerateImageButton";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Save, Upload, Image, ChevronDown, ChevronUp, Move, Megaphone, Eye, EyeOff, Languages, Type, Truck, Plus, Trash2, CreditCard, Video, X, Search, Gift, ImageIcon, Repeat, BarChart2, Smartphone, UserRound, Store, LayoutDashboard, House, Shirt, Footprints, BadgePercent, CircleHelp, MessageSquareText, ListFilter, Crop, Bot } from "lucide-react";
 import { SEASONS, getActiveTheme } from "@/lib/seasonal";
import SeasonalThemeCard from "@/components/admin/SeasonalThemeCard";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { defaultSettings, getShippingZones, type ShippingZone } from "@/hooks/use-site-settings";

interface PageSection {
  id: string;
  labelAr: string;
  labelEn: string;
  hasTitle: boolean;
  hasTag: boolean;
  keys: string[];
}

const PAGE_SECTIONS: PageSection[] = [
  {
    id: "home",
    labelAr: "الصفحة الرئيسية",
    labelEn: "Home Page",
    hasTitle: true,
    hasTag: true,
    keys: [
      "home_hero_image",
      "home_hero_image_position",
      "home_hero_video",
      "home_hero_video_position",
      "home_hero_tag_ar",
      "home_hero_tag_en",
      "home_hero_title_ar",
      "home_hero_title_en",
      "home_hero_subtitle_ar",
      "home_hero_subtitle_en",
    ],
  },
  {
    id: "dresses",
    labelAr: "صفحة الفساتين",
    labelEn: "Dresses Page",
    hasTitle: false,
    hasTag: false,
    keys: ["dresses_hero_image", "dresses_hero_image_position", "dresses_hero_video", "dresses_hero_video_position", "dresses_hero_subtitle_ar", "dresses_hero_subtitle_en"],
  },
  {
    id: "clothes",
    labelAr: "صفحة الملابس",
    labelEn: "Clothes Page",
    hasTitle: false,
    hasTag: false,
    keys: ["clothes_hero_image", "clothes_hero_image_position", "clothes_hero_video", "clothes_hero_video_position", "clothes_hero_subtitle_ar", "clothes_hero_subtitle_en"],
  },
  {
    id: "shoes",
    labelAr: "صفحة الأحذية",
    labelEn: "Shoes Page",
    hasTitle: false,
    hasTag: false,
    keys: ["shoes_hero_image", "shoes_hero_image_position", "shoes_hero_video", "shoes_hero_video_position", "shoes_hero_subtitle_ar", "shoes_hero_subtitle_en"],
  },
  {
    id: "sales",
    labelAr: "صفحة التخفيضات",
    labelEn: "Sales Page",
    hasTitle: false,
    hasTag: false,
    keys: ["sales_hero_image", "sales_hero_image_position", "sales_hero_video", "sales_hero_video_position", "sales_hero_subtitle_ar", "sales_hero_subtitle_en"],
  },
];

const POSITION_PRESETS = [
  { value: "50% 0%", labelAr: "أعلى", labelEn: "Top" },
  { value: "50% 50%", labelAr: "وسط", labelEn: "Center" },
  { value: "50% 100%", labelAr: "أسفل", labelEn: "Bottom" },
  { value: "0% 50%", labelAr: "يسار", labelEn: "Left" },
  { value: "100% 50%", labelAr: "يمين", labelEn: "Right" },
];

const GRID_9_POSITIONS = [
  { value: "0% 0%",    labelAr: "أعلى يسار",   col: 0, row: 0 },
  { value: "50% 0%",   labelAr: "أعلى وسط",    col: 1, row: 0 },
  { value: "100% 0%",  labelAr: "أعلى يمين",   col: 2, row: 0 },
  { value: "0% 50%",   labelAr: "وسط يسار",    col: 0, row: 1 },
  { value: "50% 50%",  labelAr: "المركز",       col: 1, row: 1 },
  { value: "100% 50%", labelAr: "وسط يمين",    col: 2, row: 1 },
  { value: "0% 100%",  labelAr: "أسفل يسار",   col: 0, row: 2 },
  { value: "50% 100%", labelAr: "أسفل وسط",    col: 1, row: 2 },
  { value: "100% 100%",labelAr: "أسفل يمين",   col: 2, row: 2 },
];

function normalizePosition(pos: string): string {
  if (!pos) return "50% 50%";
  if (pos === "top") return "50% 0%";
  if (pos === "center") return "50% 50%";
  if (pos === "bottom") return "50% 100%";
  if (pos.includes("%")) return pos;
  return "50% 50%";
}

/** A photo slot's real shapes on the storefront (width / height), measured on the live layout.
 *  `crop` is the frame of the crop tool; `views` are previewed exactly as customers see them. */
type SlotShape = {
  crop: number;
  /** Name of the slot for the photo generator (it adds this slot's composition rule). */
  slot?: string;
  /** `photoShare`: the photo fills only this part of the frame's width (the rest is the name side). */
  views: { label: string; aspect: number; width: string; photoShare?: number }[];
};
const SLOT_SHAPES: Record<string, SlotShape> = {
  homeHero: { slot: "homeHero", crop: 2.3, views: [{ label: "كمبيوتر", aspect: 2.3, width: "100%" }, { label: "هاتف", aspect: 1.25, width: "42%" }] },
  pageHero: { slot: "pageHero", crop: 2.9, views: [{ label: "كمبيوتر", aspect: 2.9, width: "100%" }, { label: "هاتف", aspect: 1.8, width: "48%" }] },
  editorialCenter: { slot: "editorialCenter", crop: 1.23, views: [{ label: "كمبيوتر", aspect: 1.23, width: "62%" }, { label: "هاتف", aspect: 0.43, width: "20%" }] },
  editorialTile: { slot: "editorialTile", crop: 1.77, views: [{ label: "كمبيوتر", aspect: 1.77, width: "100%" }, { label: "هاتف", aspect: 0.63, width: "34%" }] },
  pill: { slot: "pill", crop: 1.37, views: [{ label: "كمبيوتر", aspect: 2.44, width: "62%", photoShare: 0.56 }, { label: "هاتف", aspect: 1.9, width: "30%", photoShare: 0.42 }] },
  promo: { slot: "promo", crop: 4, views: [{ label: "كمبيوتر", aspect: 4, width: "100%" }, { label: "هاتف", aspect: 1.78, width: "46%" }] },
  menu: { slot: "menu", crop: 1, views: [{ label: "بطاقة القائمة", aspect: 0.85, width: "44%" }, { label: "البطاقة العريضة (الأخيرة)", aspect: 1.8, width: "92%" }] },
  strip: { crop: 15, views: [{ label: "كمبيوتر", aspect: 15, width: "100%" }] },
  stripPhone: { crop: 4.6, views: [{ label: "هاتف", aspect: 4.6, width: "60%" }] },
};

/** Shows the photo cropped to each real shape of its slot, the same way the storefront crops it. */
function SlotPreviews({ src, position, shape }: { src: string; position?: string; shape: SlotShape }) {
  if (!src) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3" data-testid="slot-previews">
      <p className="text-[11px] font-semibold text-muted-foreground text-right">كيف تظهر للعميلة</p>
      <div className="flex flex-wrap items-end justify-end gap-3">
        {shape.views.map((v) => (
          <div key={v.label} style={{ width: v.width }} className="min-w-[64px]">
            {v.photoShare ? (
              /* The whole button as on the site: photo on one side, the name on the other */
              <div className="flex overflow-hidden rounded-2xl border border-border bg-blush" dir="rtl" style={{ aspectRatio: String(v.aspect) }}>
                <div className="h-full shrink-0 overflow-hidden" style={{ width: `${v.photoShare * 100}%` }}>
                  <img src={src} alt="" className="h-full w-full object-cover" style={{ objectPosition: position || "50% 50%" }} />
                </div>
                <div className="flex flex-1 items-center justify-center text-[10px] text-foreground/70">الاسم</div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-border bg-muted" style={{ aspectRatio: String(v.aspect) }}>
                <img src={src} alt="" className="h-full w-full object-cover" style={{ objectPosition: position || "50% 50%" }} />
              </div>
            )}
            <p className="mt-1 text-center text-[10px] text-muted-foreground">{v.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImageUploadField({
  value,
  position,
  onChangeImage,
  onChangePosition,
  withCrop = false,
  promptContext,
  cropAspect,
  originalValue,
  onChangeOriginal,
  shape,
}: {
  value: string;
  position: string;
  onChangeImage: (url: string) => void;
  onChangePosition: (pos: string) => void;
  withCrop?: boolean;
  /** Description used to build the AI-generation prompt, e.g. "Home page hero banner". */
  promptContext?: string;
  /** Fixed crop ratio (width / height) when the slot has its own shape; the preview uses it too. */
  cropAspect?: number;
  /** URL of the untouched photo, kept so it can be cropped again later. */
  originalValue?: string;
  onChangeOriginal?: (url: string) => void;
  /** The slot's real shapes: sets the crop frame and shows a preview per shape. */
  shape?: SlotShape;
}) {
  if (shape && !cropAspect) cropAspect = shape.crop;
  const [uploading, setUploading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<{ file: File; resolve: (f: File) => void } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const requestCrop = useCallback((file: File): Promise<File> => {
    if (!withCrop) return Promise.resolve(file);
    return new Promise((resolve) => setPendingCrop({ file, resolve }));
  }, [withCrop]);

  const [lastOriginal, setLastOriginal] = useState<File | null>(null);

  const uploadOne = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("images", file);
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();
    return data.urls?.[0] || "";
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLastOriginal(file);
    const cropped = await requestCrop(file);
    setUploading(true);
    try {
      // Keep the untouched photo too, so "re-crop" can start from it again later.
      if (withCrop && onChangeOriginal) {
        const originalUrl = await uploadOne(file);
        if (originalUrl) onChangeOriginal(originalUrl);
      }
      const url = await uploadOne(cropped);
      if (url) onChangeImage(url);
    } catch {
      toast({ title: "فشل رفع الصورة", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Re-open the crop tool on the photo already in place (the original when we still have it).
  const handleRecrop = async () => {
    try {
      let source = lastOriginal;
      if (!source) {
        const res = await fetch(originalValue || value);
        if (!res.ok) throw new Error("fetch failed");
        const blob = await res.blob();
        source = new File([blob], "banner." + (blob.type.split("/")[1] || "jpg"), { type: blob.type || "image/jpeg" });
      }
      const cropped = await requestCrop(source);
      setUploading(true);
      const url = await uploadOne(cropped);
      if (url) onChangeImage(url);
    } catch {
      toast({ title: "تعذّر فتح الصورة للقص — ارفعي الصورة من جديد", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const normalizedPos = normalizePosition(position);
  const [px, py] = normalizedPos.split(" ").map(v => parseFloat(v));

  const handleCropperClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    const clampedX = Math.max(0, Math.min(100, x));
    const clampedY = Math.max(0, Math.min(100, y));
    onChangePosition(`${clampedX}% ${clampedY}%`);
  };

  return (
    <div className="space-y-3">
      {value ? (
        <>
          <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30 group">
            <div className={`relative w-full overflow-hidden ${cropAspect ? "" : "h-40"}`} style={cropAspect ? { aspectRatio: String(cropAspect) } : undefined}>
              <img
                src={value}
                alt="hero preview"
                className="w-full h-full object-cover"
                style={{ objectPosition: normalizedPos }}
              />
              <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <p className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">معاينة كبانر</p>
              </div>
            </div>
          </div>
          {shape ? (
            <SlotPreviews src={value} position={normalizedPos} shape={shape} />
          ) : (
            <p className="text-[10px] text-muted-foreground">هذه هي الصورة الفعلية بدون تعديل — مرري الفأرة فوقها لرؤية تسمية المعاينة</p>
          )}

          <button
            type="button"
            onClick={() => setShowCropper(!showCropper)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
            data-testid="button-toggle-cropper"
          >
            <Move className="w-3.5 h-3.5" />
            {showCropper ? "إخفاء أداة التموضع" : "تعديل موضع الصورة (اضغط على الصورة)"}
          </button>

          {showCropper && (
            <div className="space-y-3">
              <div
                ref={cropperRef}
                className="relative rounded-lg overflow-hidden border-2 border-primary/30 cursor-crosshair select-none"
                onClick={handleCropperClick}
                data-testid="image-cropper"
              >
                <img
                  src={value}
                  alt="crop selector"
                  className="w-full object-contain pointer-events-none"
                  style={{ display: "block", maxHeight: "320px" }}
                  draggable={false}
                />
                <div
                  className="absolute w-5 h-5 border-2 border-white rounded-full shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{
                    left: `${px}%`,
                    top: `${py}%`,
                    background: "rgba(139, 92, 246, 0.8)",
                    boxShadow: "0 0 0 3px rgba(139, 92, 246, 0.3), 0 2px 8px rgba(0,0,0,0.3)",
                  }}
                />
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full pointer-events-none">
                  اضغطي لتحديد نقطة التركيز
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">اختصارات الموضع:</p>
                  <div className="inline-grid grid-cols-3 gap-1 p-2 bg-background rounded-xl border border-border shadow-sm">
                    {GRID_9_POSITIONS.map((pos) => {
                      const active = normalizedPos === pos.value;
                      return (
                        <button
                          key={pos.value}
                          type="button"
                          onClick={() => onChangePosition(pos.value)}
                          title={pos.labelAr}
                          data-testid={`button-position-${pos.value.replace(/\s|%/g, "")}`}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                            active
                              ? "bg-foreground shadow-sm scale-95"
                              : "hover:bg-muted border border-transparent hover:border-border"
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full transition-all ${active ? "bg-background scale-110" : "bg-muted-foreground/40"}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex-1 pt-5">
                  <code className="bg-muted text-[11px] px-2 py-1 rounded font-mono text-foreground block text-center border border-border">
                    {normalizedPos}
                  </code>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center w-full h-32 rounded-lg border-2 border-dashed border-border bg-muted/20 text-muted-foreground">
          <div className="text-center space-y-1">
            <Image className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-xs">لا توجد صورة</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChangeImage(e.target.value)}
          placeholder="https://... أو ارفع صورة"
          className="flex-1 text-sm h-9"
          data-testid="input-hero-image-url"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="shrink-0 h-9 px-3"
          data-testid="button-upload-image"
        >
          {uploading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
        </Button>
        {value && withCrop && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRecrop}
            disabled={uploading}
            className="shrink-0 h-9 px-3 gap-1.5"
            title="إعادة قص الصورة"
            data-testid="button-recrop-image"
          >
            <Crop className="w-4 h-4" />
            <span className="text-xs">إعادة القص</span>
          </Button>
        )}
        {value && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChangeImage("")}
            className="shrink-0 h-9 px-3 text-destructive hover:bg-destructive/10"
            title="حذف الصورة"
            data-testid="button-clear-image"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      {promptContext && (
        <AIGenerateImageButton
          getPrompt={() => promptContext}
          onGenerated={(url) => onChangeImage(url)}
          aspect="landscape"
          slot={shape?.slot}
          className="w-full h-9"
        />
      )}
      {withCrop && (
        <ImageCropDialog
          file={pendingCrop?.file ?? null}
          previewType={cropAspect ? "general" : "grid"}
          aspect={cropAspect}
          onConfirm={(croppedFile) => {
            const resolve = pendingCrop?.resolve;
            setPendingCrop(null);
            resolve?.(croppedFile);
          }}
          onCancel={() => {
            setPendingCrop(null);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
      )}
    </div>
  );
}

function VideoUploadField({
  value,
  onChange,
  position,
  onChangePosition,
  aiSubject,
  aiImage,
}: {
  value: string;
  onChange: (url: string) => void;
  position?: string;
  onChangePosition?: (pos: string) => void;
  /** Enables "generate video": what the clip is about. */
  aiSubject?: string;
  /** Unused: clips are always generated fresh, not from the slot's photo. */
  aiImage?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const handleGenerateVideo = async () => {
    setGenerating(true);
    try {
      const start = await fetch("/api/admin/ai-generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Always a brand-new clip made from the description — never built from the current photo.
        body: JSON.stringify({ prompt: aiSubject }),
      });
      const started = await start.json().catch(() => ({}));
      if (!start.ok || !started.jobId) {
        throw new Error(started?.noKey ? "ميزة الذكاء الاصطناعي غير مفعّلة على السيرفر (مفتاح API غير موجود)" : started?.message || "تعذّر بدء توليد الفيديو");
      }
      // The clip takes a minute or more: ask every few seconds until it is ready.
      const deadline = Date.now() + 8 * 60 * 1000;
      for (;;) {
        await new Promise((r) => setTimeout(r, 5000));
        const res = await fetch(`/api/admin/ai-generate-video/${started.jobId}`);
        const job = await res.json().catch(() => ({}));
        if (job.status === "done" && job.url) {
          onChange(job.url);
          toast({ title: "تم توليد الفيديو — راجعيه ثم احفظي" });
          break;
        }
        if (job.status === "error" || !res.ok) throw new Error(job?.message || "فشل توليد الفيديو");
        if (Date.now() > deadline) throw new Error("استغرق التوليد وقتاً طويلاً — حاولي مرة أخرى");
      }
    } catch (err: any) {
      toast({ title: "فشل توليد الفيديو", description: err?.message || "حاولي مرة أخرى", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };
  const [showPositionControls, setShowPositionControls] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("video", file);
      const res = await fetch("/api/upload-video", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        onChange(data.url);
        toast({ title: "تم رفع الفيديو بنجاح" });
      } else {
        toast({ title: data.message || "فشل رفع الفيديو", variant: "destructive" });
      }
    } catch {
      toast({ title: "فشل رفع الفيديو", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const normalizedPos = normalizePosition(position ?? "");

  return (
    <div className="space-y-3">
      {value ? (
        <>
          <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30 group">
            <video
              src={value}
              className="w-full h-40 object-cover"
              style={{ objectPosition: normalizedPos }}
              muted
              playsInline
              controls={false}
              loop
              autoPlay
            />
            <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              <p className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded flex items-center gap-1">
                <Video className="w-3.5 h-3.5" />
                معاينة الفيديو
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
              data-testid="button-remove-video"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">هذا تشغيل حقيقي للفيديو كما سيظهر — بدون صوت وبتكرار مستمر مثل الموقع الفعلي</p>

          {onChangePosition && (
            <>
              <button
                type="button"
                onClick={() => setShowPositionControls(!showPositionControls)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
                data-testid="button-toggle-video-position"
              >
                <Move className="w-3.5 h-3.5" />
                {showPositionControls ? "إخفاء أداة التموضع" : "تعديل موضع الفيديو"}
              </button>

              {showPositionControls && (
                <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-3">
                  <p className="text-xs text-muted-foreground">اضغط على الموضع المطلوب لضبط بؤرة الفيديو:</p>
                  <div className="flex items-start gap-4">
                    {/* 3×3 grid picker */}
                    <div className="inline-grid grid-cols-3 gap-1 p-2 bg-background rounded-xl border border-border shadow-sm shrink-0">
                      {GRID_9_POSITIONS.map((pos) => {
                        const active = normalizedPos === pos.value;
                        return (
                          <button
                            key={pos.value}
                            type="button"
                            onClick={() => onChangePosition(pos.value)}
                            title={pos.labelAr}
                            data-testid={`button-video-pos-${pos.value.replace(/\s|%/g, "")}`}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                              active
                                ? "bg-foreground shadow-sm scale-95"
                                : "hover:bg-muted border border-transparent hover:border-border"
                            }`}
                          >
                            <div className={`w-2 h-2 rounded-full transition-all ${active ? "bg-background scale-110" : "bg-muted-foreground/40"}`} />
                          </button>
                        );
                      })}
                    </div>
                    {/* Live mini-preview */}
                    <div className="flex-1 space-y-1.5">
                      <div className="relative rounded-lg overflow-hidden border border-border h-24 bg-muted/30">
                        <video
                          src={value}
                          className="w-full h-full object-cover"
                          style={{ objectPosition: normalizedPos }}
                          muted
                          playsInline
                          autoPlay
                          loop
                        />
                        <div className="absolute inset-0 bg-black/10 pointer-events-none" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-white text-[10px] bg-black/40 px-1.5 py-0.5 rounded font-mono">
                            {normalizedPos}
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground text-center">معاينة مباشرة</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center w-full h-32 rounded-lg border-2 border-dashed border-border bg-muted/20 text-muted-foreground">
          <div className="text-center space-y-1">
            <Video className="w-8 h-8 mx-auto opacity-40" />
            <p className="text-xs">لا يوجد فيديو</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://... أو ارفع فيديو (mp4, webm, mov)"
          className="flex-1 text-sm h-9"
          data-testid="input-hero-video-url"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="shrink-0 h-9 px-3"
          data-testid="button-upload-video"
        >
          {uploading ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.avi"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {aiSubject && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleGenerateVideo}
          disabled={generating || uploading}
          className="w-full h-9 gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
          data-testid="button-ai-generate-video"
        >
          {generating ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Bot className="w-4 h-4" />}
          <span className="text-xs">
            {generating
              ? "جاري توليد الفيديو… قد يستغرق دقيقة أو أكثر"
              : "توليد فيديو جديد بالذكاء الاصطناعي"}
          </span>
        </Button>
      )}

      <p className="text-[11px] text-muted-foreground">
        الفيديو يُشغَّل تلقائياً وبدون صوت. عند تعيين فيديو يُستخدم بدلاً من الصورة.
      </p>
    </div>
  );
}

function SectionCard({
  section,
  values,
  onChange,
}: {
  section: PageSection;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const prefix = section.id;

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid={`section-${section.id}`}>
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid={`toggle-section-${section.id}`}
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm">{section.labelAr}</p>
          <p className="text-xs text-muted-foreground">{section.labelEn}</p>
        </div>
      </button>

      {open && (
        <div className="p-5 space-y-6 bg-background">
          <div>
            <Label className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Image className="w-4 h-4" />
              صورة الخلفية
            </Label>
            <ImageUploadField
              value={values[`${prefix}_hero_image`] ?? ""}
              position={values[`${prefix}_hero_image_position`] ?? "center"}
              onChangeImage={(url) => onChange(`${prefix}_hero_image`, url)}
              onChangePosition={(pos) => onChange(`${prefix}_hero_image_position`, pos)}
              withCrop
              shape={prefix === "home" ? SLOT_SHAPES.homeHero : SLOT_SHAPES.pageHero}
              originalValue={values[`${prefix}_hero_image_original`] ?? ""}
              onChangeOriginal={(url) => onChange(`${prefix}_hero_image_original`, url)}
              promptContext={prefix === "home" ? "the new season collection: an elegant outfit with a handbag and heels" : prefix === "sales" ? "sale: a handbag, a pair of heels and a folded knit, with small satin ribbons" : `women's ${section.labelEn.replace(/ Page$/i, "").toLowerCase()}`}
            />
          </div>

          <div>
            <Label className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Video className="w-4 h-4" />
              فيديو الخلفية
              <span className="text-[10px] font-normal text-muted-foreground ml-1">(يُستخدم بدلاً من الصورة إذا تم تعيينه)</span>
            </Label>
            <VideoUploadField
              value={values[`${prefix}_hero_video`] ?? ""}
              onChange={(url) => onChange(`${prefix}_hero_video`, url)}
              position={values[`${prefix}_hero_video_position`] ?? ""}
              onChangePosition={(pos) => onChange(`${prefix}_hero_video_position`, pos)}
              aiSubject={prefix === "home" ? "the new season collection" : prefix === "sales" ? "sale pieces" : `women's ${section.labelEn.replace(/ Page$/i, "").toLowerCase()}`}
              aiImage={values[`${prefix}_hero_image`] ?? ""}
            />
          </div>

          {section.hasTag && (
            <div>
              <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">النص الصغير</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">عربي</p>
                  <Input
                    value={values[`${prefix}_hero_tag_ar`] ?? ""}
                    onChange={(e) => onChange(`${prefix}_hero_tag_ar`, e.target.value)}
                    className="h-9"
                    data-testid="input-hero-tag-ar"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">English</p>
                  <Input
                    value={values[`${prefix}_hero_tag_en`] ?? ""}
                    onChange={(e) => onChange(`${prefix}_hero_tag_en`, e.target.value)}
                    className="h-9"
                    data-testid="input-hero-tag-en"
                  />
                </div>
              </div>
            </div>
          )}

          {section.hasTitle && (
            <div>
              <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">العنوان الرئيسي</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">عربي</p>
                  <Input
                    value={values[`${prefix}_hero_title_ar`] ?? ""}
                    onChange={(e) => onChange(`${prefix}_hero_title_ar`, e.target.value)}
                    className="h-9"
                    data-testid="input-hero-title-ar"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">English</p>
                  <Input
                    value={values[`${prefix}_hero_title_en`] ?? ""}
                    onChange={(e) => onChange(`${prefix}_hero_title_en`, e.target.value)}
                    className="h-9"
                    data-testid="input-hero-title-en"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">النص التوضيحي</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">عربي</p>
                <Textarea
                  value={values[`${prefix}_hero_subtitle_ar`] ?? ""}
                  onChange={(e) => onChange(`${prefix}_hero_subtitle_ar`, e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                  data-testid="input-hero-subtitle-ar"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">English</p>
                <Textarea
                  value={values[`${prefix}_hero_subtitle_en`] ?? ""}
                  onChange={(e) => onChange(`${prefix}_hero_subtitle_en`, e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                  data-testid="input-hero-subtitle-en"
                />
              </div>
            </div>
          </div>

          {section.id === "shoes" && (
            <div className="pt-5 border-t border-border/50">
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() =>
                    onChange("reports_page_enabled", values["reports_page_enabled"] !== "false" ? "false" : "true")
                  }
                  className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    values["reports_page_enabled"] !== "false" ? "bg-foreground" : "bg-muted-foreground/25"
                  }`}
                  data-testid="checkbox-reports-page-enabled"
                >
                  <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-background shadow-sm transition-transform duration-200 ${
                    values["reports_page_enabled"] !== "false" ? "left-[3px] translate-x-[20px]" : "left-[3px] translate-x-0"
                  }`} />
                </button>
                <div className="text-right">
                  <p className="font-semibold text-sm flex items-center justify-end gap-1.5">
                    <BarChart2 className="w-3.5 h-3.5" />
                    صفحة التقارير
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {values["reports_page_enabled"] !== "false"
                      ? "إظهار صفحة \"تقرير المبيعات\" وتبويب \"الإحصائيات\" في نقطة البيع"
                      : "سيُخفى رابط \"تقرير المبيعات\" من القائمة الجانبية وتبويب \"الإحصائيات\" من نقطة البيع"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const CATEGORY_CIRCLES = [
  { key: "category_circle_dresses", labelAr: "فساتين", labelEn: "Dresses" },
  { key: "category_circle_clothes", labelAr: "ملابس", labelEn: "Clothes" },
  { key: "category_circle_shoes",   labelAr: "شوزات",  labelEn: "Shoes"   },
];

function CategoryCirclesCard({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const { toast } = useToast();

  const handleFile = async (key: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(key);
    try {
      const formData = new FormData();
      formData.append("images", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.urls?.[0]) onChange(key, data.urls[0]);
    } catch {
      toast({ title: "فشل رفع الصورة", variant: "destructive" });
    } finally {
      setUploading(null);
      const ref = fileRefs.current[key];
      if (ref) ref.value = "";
    }
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-category-circles">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid="toggle-section-category-circles"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm">صور الفئات الدائرية</p>
          <p className="text-xs text-muted-foreground">Category Circle Images (Home Page)</p>
        </div>
      </button>

      {open && (
        <div className="p-5 bg-background space-y-4">
          <p className="text-xs text-muted-foreground text-right">
            هذه الصور تظهر كدوائر في قسم الفئات في الصفحة الرئيسية.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {CATEGORY_CIRCLES.map((cat) => (
              <div key={cat.key} className="space-y-3">
                <p className="text-sm font-medium text-center">
                  {cat.labelAr} <span className="text-muted-foreground text-xs">/ {cat.labelEn}</span>
                </p>
                <div className="flex flex-col items-center gap-3">
                  {values[cat.key] ? (
                    <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-border shadow-sm">
                      <img src={values[cat.key]} alt={cat.labelEn} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-28 h-28 rounded-full border-2 border-dashed border-border bg-muted/20 flex items-center justify-center">
                      <Image className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="w-full flex gap-2">
                    <Input
                      value={values[cat.key] ?? ""}
                      onChange={(e) => onChange(cat.key, e.target.value)}
                      placeholder="رابط أو ارفع"
                      className="flex-1 text-xs h-8"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 shrink-0"
                      disabled={uploading === cat.key}
                      onClick={() => fileRefs.current[cat.key]?.click()}
                    >
                      {uploading === cat.key ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <input
                      ref={(el) => { fileRefs.current[cat.key] = el; }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFile(cat.key, e)}
                    />
                  </div>
                  <AIGenerateImageButton
                    getPrompt={() => `Circular category thumbnail photo representing "${cat.labelEn}" clothing category for a women's fashion boutique homepage`}
                    onGenerated={(url) => onChange(cat.key, url)}
                    aspect="square"
                    className="w-full h-8 text-[11px]"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleImageUpload({ value, onChange, label, withCrop = false, promptContext, shape }: { value: string; onChange: (url: string) => void; label?: string; withCrop?: boolean; promptContext?: string; shape?: SlotShape }) {
  const [uploading, setUploading] = useState(false);
  const [pendingCrop, setPendingCrop] = useState<{ file: File; resolve: (f: File) => void } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const requestCrop = useCallback((file: File): Promise<File> => {
    if (!withCrop) return Promise.resolve(file);
    return new Promise((resolve) => setPendingCrop({ file, resolve }));
  }, [withCrop]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const cropped = await requestCrop(file);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("images", cropped);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.urls?.[0]) onChange(data.urls[0]);
    } catch {
      toast({ title: "فشل رفع الصورة", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <div className="space-y-2">
        {label && <p className="text-xs text-muted-foreground font-medium">{label}</p>}
        <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30" style={{ aspectRatio: String(shape?.crop ?? 1) }}>
          {value ? (
            <img src={value} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Image className="w-8 h-8 text-muted-foreground/40" />
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
          >
            <span className="text-white text-xs font-semibold flex items-center gap-1">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? "جاري الرفع..." : "تغيير الصورة"}
            </span>
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-colors z-10"
              title="حذف الصورة"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://... أو ارفع صورة"
            className="flex-1 text-xs h-8"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="shrink-0 h-8 px-2.5"
          >
            {uploading ? (
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        {shape && <SlotPreviews src={value} shape={shape} />}
        {promptContext && (
          <AIGenerateImageButton
            getPrompt={() => promptContext}
            onGenerated={(url) => onChange(url)}
            aspect="square"
            slot={shape?.slot}
            className="w-full h-8 text-[11px]"
          />
        )}
      </div>
      {withCrop && (
        <ImageCropDialog
          file={pendingCrop?.file ?? null}
          previewType={shape ? "general" : "grid"}
          aspect={shape?.crop}
          onConfirm={(croppedFile) => {
            const resolve = pendingCrop?.resolve;
            setPendingCrop(null);
            resolve?.(croppedFile);
          }}
          onCancel={() => {
            setPendingCrop(null);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
      )}
    </>
  );
}

function BestSellersCard({ values, onChange }: { values: Record<string, string>; onChange: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: allProducts } = useQuery<any[]>({ queryKey: ["/api/products"] });
  const products = (allProducts || []).filter((p: any) => p.mainImage);

  const ranks = [
    { n: 1, label: "المركز الأول 🥇 (المنتج الأوسط)" },
    { n: 2, label: "المركز الثاني 🥈 (على اليسار)" },
    { n: 3, label: "المركز الثالث 🥉 (على اليمين)" },
  ];

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-best-sellers-admin">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen((o) => !o)}
        data-testid="toggle-section-best-sellers"
      >
        <span>{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
        <div className="text-right">
          <p className="font-semibold text-sm">أفضل 3 منتجات مبيعاً</p>
          <p className="text-xs text-muted-foreground">اختر يدوياً المنتجات التي تظهر في واجهة أفضل المبيعات</p>
        </div>
      </button>

      {open && (
        <div className="p-5 space-y-4 border-t border-border">
          {ranks.map(({ n, label }) => {
            const selectedId = values[`best_sellers_pinned_${n}`] ?? "";
            const selectedProduct = products.find((p: any) => String(p.id) === selectedId);
            return (
              <div key={n} className="border border-border rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-right">{label}</p>
                <select
                  value={selectedId}
                  onChange={(e) => onChange(`best_sellers_pinned_${n}`, e.target.value)}
                  className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  dir="rtl"
                  data-testid={`select-best-seller-${n}`}
                >
                  <option value="">— تلقائي (حسب المبيعات) —</option>
                  {products.map((p: any) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name} — ₪{Number(p.price).toFixed(0)}
                    </option>
                  ))}
                </select>
                {selectedProduct && (
                  <div className="flex items-center gap-3 mt-2 p-2 bg-muted/30 rounded-md">
                    <img src={selectedProduct.mainImage} alt={selectedProduct.name} className="w-12 h-12 object-cover rounded" />
                    <div className="text-right flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{selectedProduct.name}</p>
                      <p className="text-xs text-muted-foreground">₪{Number(selectedProduct.price).toFixed(0)}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground text-right">
            إذا تركت حقلاً فارغاً، سيتم استخدام المنتج الأكثر مبيعاً تلقائياً من البيانات.
          </p>
        </div>
      )}
    </div>
  );
}

function SectionHeadingsCard({ values, onChange }: { values: Record<string, string>; onChange: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);

  const sections = [
    { id: "new_arrivals", labelAr: "وصل حديثاً", labelEn: "New Arrivals", defaultTitleAr: "وصل حديثاً", defaultSubtitleAr: "أحدث الإضافات إلى مجموعتنا." },
    { id: "featured", labelAr: "المميزة", labelEn: "Featured", defaultTitleAr: "المميزة", defaultSubtitleAr: "قطعنا الأكثر حباً، منتقاة خصيصاً لكِ." },
    { id: "best_sellers", labelAr: "الأكثر مبيعاً", labelEn: "Best Sellers", defaultTitleAr: "الأكثر مبيعاً", defaultSubtitleAr: "القطع التي تحبها عميلاتنا أكثر." },
    { id: "on_sale", labelAr: "تخفيضات", labelEn: "On Sale", defaultTitleAr: "تخفيضات", defaultSubtitleAr: "وفري أكثر مع عروضنا الحصرية." },
  ];

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-headings-admin">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen((o) => !o)}
        data-testid="toggle-section-headings"
      >
        <span>{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
        <div className="text-right">
          <p className="font-semibold text-sm">عناوين أقسام الصفحة الرئيسية</p>
          <p className="text-xs text-muted-foreground">عدّل عناوين وأوصاف أقسام المنتجات</p>
        </div>
      </button>

      {open && (
        <div className="p-5 space-y-6 border-t border-border">
          {sections.map((sec) => (
            <div key={sec.id} className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground border-b border-border pb-1">
                {sec.labelAr} / {sec.labelEn}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">العنوان (عربي)</p>
                  <Input
                    value={values[`section_${sec.id}_title_ar`] ?? ""}
                    onChange={(e) => onChange(`section_${sec.id}_title_ar`, e.target.value)}
                    placeholder={sec.defaultTitleAr}
                    className="h-9 text-sm"
                    dir="rtl"
                    data-testid={`input-section-${sec.id}-title-ar`}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Title (English)</p>
                  <Input
                    value={values[`section_${sec.id}_title_en`] ?? ""}
                    onChange={(e) => onChange(`section_${sec.id}_title_en`, e.target.value)}
                    placeholder={sec.labelEn}
                    className="h-9 text-sm"
                    dir="ltr"
                    data-testid={`input-section-${sec.id}-title-en`}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">الوصف (عربي)</p>
                  <Input
                    value={values[`section_${sec.id}_subtitle_ar`] ?? ""}
                    onChange={(e) => onChange(`section_${sec.id}_subtitle_ar`, e.target.value)}
                    placeholder={sec.defaultSubtitleAr}
                    className="h-9 text-sm"
                    dir="rtl"
                    data-testid={`input-section-${sec.id}-subtitle-ar`}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">Subtitle (English)</p>
                  <Input
                    value={values[`section_${sec.id}_subtitle_en`] ?? ""}
                    onChange={(e) => onChange(`section_${sec.id}_subtitle_en`, e.target.value)}
                    placeholder="Subtitle..."
                    className="h-9 text-sm"
                    dir="ltr"
                    data-testid={`input-section-${sec.id}-subtitle-en`}
                  />
                </div>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground text-right">إذا تركت الحقل فارغاً، سيُعرض النص الافتراضي.</p>
        </div>
      )}
    </div>
  );
}

function EditorialGridCard({ values, onChange }: { values: Record<string, string>; onChange: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: allCategories } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  const { data: allSubcategories } = useQuery<any[]>({ queryKey: ["/api/subcategories"] });
  const categories = allCategories || [];
  const subcategories = allSubcategories || [];

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-editorial">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid="toggle-section-editorial"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm">قسم الشبكة التحريرية</p>
          <p className="text-xs text-muted-foreground">Editorial Grid Section</p>
        </div>
      </button>

      {open && (
        <div className="p-5 space-y-6 bg-background">
          <BulkAIGenerate
            label="توليد كل صور الشبكة بالذكاء الاصطناعي"
            note="بعد التوليد راجعي الصور ثم اضغطي حفظ."
            items={[
              {
                key: "editorial-center",
                label: "الصورة المركزية",
                prompt: "the new collection: a satin dress with a coat, a handbag and heels",
                slot: "editorialCenter",
                apply: (d) => onChange("editorial_center_image", d.url),
              },
              ...[1, 2, 3, 4].map((n) => {
                const cat = categories.find((c: any) => String(c.id) === (values[`editorial_tile_${n}_category_id`] ?? ""));
                const sub = subcategories.find((x: any) => String(x.id) === (values[`editorial_tile_${n}_subcategory_id`] ?? ""));
                const name = sub?.name || sub?.nameAr || cat?.name || cat?.nameAr || "";
                return {
                  key: `editorial-tile-${n}`,
                  label: `الخانة ${n}${name ? ` — ${sub?.nameAr || cat?.nameAr || name}` : ""}`,
                  prompt: name ? `women's ${name}` : "an elegant women's fashion piece",
                  slot: "editorialTile",
                  apply: (d: { url: string }) => onChange(`editorial_tile_${n}_image`, d.url),
                };
              }),
            ]}
          />
          {/* Headline text */}
          <div>
            <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">العنوان (سطر واحد أو سطرين بفاصل سطر جديد)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">عربي</p>
                <Textarea
                  value={values["editorial_headline_ar"] ?? "تشكيلة جديدة\nبأسلوب راقٍ"}
                  onChange={(e) => onChange("editorial_headline_ar", e.target.value)}
                  rows={2} className="resize-none text-sm"
                  data-testid="input-editorial-headline-ar"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">English</p>
                <Textarea
                  value={values["editorial_headline_en"] ?? "New Collection\nRefined Style"}
                  onChange={(e) => onChange("editorial_headline_en", e.target.value)}
                  rows={2} className="resize-none text-sm"
                  data-testid="input-editorial-headline-en"
                />
              </div>
            </div>
          </div>

          {/* Center image + video */}
          <div>
            <Label className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Image className="w-4 h-4" />
              الصورة المركزية
            </Label>
            <ImageUploadField
              value={values["editorial_center_image"] ?? ""}
              position={values["editorial_center_image_position"] ?? "center"}
              onChangeImage={(url) => onChange("editorial_center_image", url)}
              onChangePosition={(pos) => onChange("editorial_center_image_position", pos)}
              withCrop
              shape={SLOT_SHAPES.editorialCenter}
              originalValue={values["editorial_center_image_original"] ?? ""}
              onChangeOriginal={(url) => onChange("editorial_center_image_original", url)}
              promptContext="the new collection: a satin dress with a coat, a handbag and heels"
            />
            <div className="mt-3">
              <p className="text-xs text-muted-foreground mb-1.5">فيديو بديل (اختياري — يُعرض بدلاً من الصورة، والصورة تبقى كـ poster)</p>
              <VideoUploadField
                value={values["editorial_center_video"] ?? ""}
                onChange={(url) => onChange("editorial_center_video", url)}
                aiSubject="the new collection"
                aiImage={values["editorial_center_image"] ?? ""}
              />
            </div>
          </div>

          {/* 4 tiles: category + image */}
          <div>
            <Label className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <Image className="w-4 h-4" />
              الخانات الأربع
            </Label>
            <div className="grid grid-cols-2 gap-5">
              {[1, 2, 3, 4].map((n) => {
                const posLabel = n === 1 ? "العلوية اليسرى" : n === 2 ? "العلوية اليمنى" : n === 3 ? "السفلية اليسرى" : "السفلية اليمنى";
                const selectedCatId = values[`editorial_tile_${n}_category_id`] ?? "";
                const selectedSubId = values[`editorial_tile_${n}_subcategory_id`] ?? "";
                const tileSubs = selectedCatId
                  ? subcategories.filter((s: any) => String(s.categoryId) === selectedCatId)
                  : [];
                return (
                  <div key={n} className="space-y-2 border border-border rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground">الخانة {posLabel}</p>
                    {/* Category selector */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">الفئة</p>
                      <select
                        value={selectedCatId}
                        onChange={(e) => {
                          onChange(`editorial_tile_${n}_category_id`, e.target.value);
                          // reset subcategory when category changes
                          onChange(`editorial_tile_${n}_subcategory_id`, "");
                        }}
                        className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        data-testid={`select-editorial-tile-${n}-category`}
                      >
                        <option value="">— اختر فئة —</option>
                        {categories.map((c: any) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.nameAr || c.name} ({c.name})
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* Subcategory selector (optional, always shown when a category is picked) */}
                    {selectedCatId && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">التصنيف الفرعي (اختياري)</p>
                        <select
                          value={selectedSubId}
                          onChange={(e) => onChange(`editorial_tile_${n}_subcategory_id`, e.target.value)}
                          disabled={tileSubs.length === 0}
                          className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                          data-testid={`select-editorial-tile-${n}-subcategory`}
                        >
                          {tileSubs.length === 0 ? (
                            <option value="">— لا توجد تصنيفات فرعية لهذه الفئة —</option>
                          ) : (
                            <>
                              <option value="">— كل التصنيفات الفرعية —</option>
                              {tileSubs.map((s: any) => (
                                <option key={s.id} value={String(s.id)}>
                                  {s.nameAr || s.name} ({s.name})
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                        {tileSubs.length === 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            أضف تصنيفات فرعية من <a href="/admin/categories" className="underline">إدارة الفئات</a> أولاً.
                          </p>
                        )}
                      </div>
                    )}
                    {/* Custom image override */}
                    <SimpleImageUpload
                      value={values[`editorial_tile_${n}_image`] ?? ""}
                      onChange={(url) => onChange(`editorial_tile_${n}_image`, url)}
                      label="صورة مخصصة (اختياري — تتجاوز صورة الفئة)"
                      withCrop
                      shape={SLOT_SHAPES.editorialTile}
                      promptContext={(() => {
                        const selectedCat = categories.find((c: any) => String(c.id) === selectedCatId);
                        const selectedSub = subcategories.find((s: any) => String(s.id) === selectedSubId);
                        const label = selectedSub?.nameEn || selectedSub?.name || selectedCat?.nameEn || selectedCat?.name;
                        return label
                          ? `Square homepage collage tile photo representing "${label}" for a women's fashion boutique`
                          : "";
                      })()}
                    />
                    {/* Video override */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">فيديو (اختياري — يُعرض بدلاً من الصورة)</p>
                      <VideoUploadField
                        value={values[`editorial_tile_${n}_video`] ?? ""}
                        onChange={(url) => onChange(`editorial_tile_${n}_video`, url)}
                        aiSubject={(() => {
                          const cat = categories.find((c: any) => String(c.id) === selectedCatId);
                          const sub = subcategories.find((x: any) => String(x.id) === selectedSubId);
                          return `women's ${sub?.name || cat?.name || "fashion"}`;
                        })()}
                        aiImage={values[`editorial_tile_${n}_image`] ?? ""}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HomePillsCard({ values, onChange }: { values: Record<string, string>; onChange: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  const { data: subcategories = [] } = useQuery<any[]>({ queryKey: ["/api/subcategories"] });
  const field = "w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60";
  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-home-pills">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid="toggle-section-home-pills"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm">أزرار الأقسام تحت السلايدر الرئيسي</p>
          <p className="text-xs text-muted-foreground">Category buttons under the main slider</p>
        </div>
      </button>
      {open && (
        <div className="p-5 space-y-5 bg-background">
          <p className="text-xs text-muted-foreground text-right">
            حتى 5 أزرار. لكل زر اختاري الفئة، ويمكن اختيار تصنيف فرعي منها ليفتح الزر عليه مباشرة، ثم ضعي صورة الزر. إذا تُركت الصورة فارغة تُستخدم صورة التصنيف أو الفئة. الزر بدون فئة لا يظهر، وإذا تُركت كل الأزرار فارغة يعرض الموقع الفئات المفعّل لها «إظهار في الرئيسية» تلقائياً.
          </p>
          <BulkAIGenerate
            label="توليد صور كل الأزرار بالذكاء الاصطناعي"
            note="تظهر هنا الأزرار التي اخترتِ لها فئة فقط. بعد التوليد اضغطي حفظ."
            items={[1, 2, 3, 4, 5].flatMap((n) => {
              const cat = categories.find((c: any) => String(c.id) === (values[`home_pill_${n}_category_id`] ?? ""));
              if (!cat) return [];
              const sub = subcategories.find((x: any) => String(x.id) === (values[`home_pill_${n}_subcategory_id`] ?? ""));
              return [{
                key: `pill-${n}`,
                label: `الزر ${n} — ${sub?.nameAr || sub?.name || cat.nameAr || cat.name}`,
                prompt: `women's ${sub?.name || sub?.nameAr || cat.name || cat.nameAr}`,
                slot: "pill",
                apply: (d: { url: string }) => onChange(`home_pill_${n}_image`, d.url),
              }];
            })}
          />
          {[1, 2, 3, 4, 5].map((n) => {
            const catId = values[`home_pill_${n}_category_id`] ?? "";
            const subId = values[`home_pill_${n}_subcategory_id`] ?? "";
            const subs = catId ? subcategories.filter((s: any) => String(s.categoryId) === catId) : [];
            return (
              <div key={n} className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-sm font-semibold text-right">الزر {n}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    dir="rtl"
                    className={field}
                    value={catId}
                    onChange={(e) => {
                      onChange(`home_pill_${n}_category_id`, e.target.value);
                      onChange(`home_pill_${n}_subcategory_id`, "");
                    }}
                    data-testid={`select-home-pill-${n}-category`}
                  >
                    <option value="">— بدون (لا يظهر) —</option>
                    {categories.map((c: any) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.nameAr || c.name} ({c.name})
                      </option>
                    ))}
                  </select>
                  <select
                    dir="rtl"
                    className={field}
                    value={subId}
                    disabled={!catId || subs.length === 0}
                    onChange={(e) => onChange(`home_pill_${n}_subcategory_id`, e.target.value)}
                    data-testid={`select-home-pill-${n}-subcategory`}
                  >
                    <option value="">
                      {catId && subs.length === 0 ? "— لا توجد تصنيفات فرعية —" : "— الفئة كاملة —"}
                    </option>
                    {subs.map((s: any) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.nameAr || s.name} ({s.name})
                      </option>
                    ))}
                  </select>
                </div>
                <SimpleImageUpload
                  value={values[`home_pill_${n}_image`] ?? ""}
                  onChange={(url) => onChange(`home_pill_${n}_image`, url)}
                  label="صورة الزر"
                  withCrop
                  shape={SLOT_SHAPES.pill}
                  promptContext={(() => {
                    const cat = categories.find((c: any) => String(c.id) === catId);
                    const sub = subcategories.find((x: any) => String(x.id) === subId);
                    const name = sub?.name || sub?.nameAr || cat?.name || cat?.nameAr || "";
                    return name ? `women's ${name}` : "";
                  })()}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HomeBannersCard({ values, onChange }: { values: Record<string, string>; onChange: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);
  const field = "w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";
  const rows: { key: string; label: string; placeholder: string }[] = [
    { key: "home_banner_new_texts", label: "البانر فوق «وصل حديثاً»", placeholder: "NEW ARRIVALS | JUST LANDED | NEW IN | NEW SEASON" },
    { key: "home_banner_best_texts", label: "البانر فوق «الأكثر مبيعاً»", placeholder: "BEST SELLERS | MOST LOVED | TOP PICKS | FAVOURITES" },
  ];
  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-home-banners">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid="toggle-section-home-banners"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm">بانرات العناوين المتحركة في الصفحة الرئيسية</p>
          <p className="text-xs text-muted-foreground">Home animated heading banners</p>
        </div>
      </button>
      {open && (
        <div className="p-5 space-y-5 bg-background">
          <p className="text-xs text-muted-foreground text-right">
            شريطان ورديان بنص عنابي متحرك، فوق «وصل حديثاً» وفوق «الأكثر مبيعاً». اكتبي العبارات وافصلي بينها بـ | لتظهر واحدة تلو الأخرى. عبارة واحدة فقط تبقى ثابتة بدون حركة. إذا تُرك الحقل فارغاً تُستخدم العبارات الافتراضية الظاهرة فيه. يفضّل أن تكون العبارات قصيرة لتظهر كاملة على الهاتف.
          </p>
          {rows.map((r) => (
            <div key={r.key} className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-sm font-semibold text-right">{r.label}</p>
              <input
                dir="auto"
                className={field}
                placeholder={r.placeholder}
                value={values[r.key] ?? ""}
                onChange={(e) => onChange(r.key, e.target.value)}
                data-testid={`input-${r.key}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Finds the products in a photo taken on a flat background and returns just that area
 *  (with a little breathing room) plus the background colour, so the row can be fitted
 *  into the banner at full size with no empty space and no visible edges. */
async function trimRowPhoto(file: File): Promise<{ file: File; bg: string; ar: number }> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  const { data, width: W, height: H } = ctx.getImageData(0, 0, bmp.width, bmp.height);
  // Background = average of the four corners.
  let r = 0, g = 0, b = 0, n = 0;
  const k = Math.max(4, Math.round(Math.min(W, H) * 0.02));
  for (const [x0, y0] of [[0, 0], [W - k, 0], [0, H - k], [W - k, H - k]]) {
    for (let y = y0; y < y0 + k; y++) for (let x = x0; x < x0 + k; x++) {
      const i = (y * W + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  r /= n; g /= n; b /= n;
  let minX = W, minY = H, maxX = -1, maxY = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const d = Math.hypot(data[i] - r, data[i + 1] - g, data[i + 2] - b);
    if (d > 26) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const hex = "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  if (maxX < 0) return { file, bg: hex, ar: W / H };
  const padX = Math.round((maxX - minX) * 0.025);
  const padY = Math.round((maxY - minY) * 0.04);
  const x = Math.max(0, minX - padX), y = Math.max(0, minY - padY);
  const w = Math.min(W, maxX + padX) - x, h = Math.min(H, maxY + padY) - y;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  const blob: Blob = await new Promise((res, rej) => out.toBlob((bl) => (bl ? res(bl) : rej(new Error("empty"))), "image/png"));
  return { file: new File([blob], file.name.replace(/\.[^.]+$/, "") + "-row.png", { type: "image/png" }), bg: hex, ar: w / h };
}

/** What goes in each category's ready-made row, picked from the category's names. */
function rowProductsFor(c: { name?: string; nameAr?: string; slug?: string }): string {
  const t = `${c.name || ""} ${c.slug || ""} ${c.nameAr || ""}`.toLowerCase();
  if (/shoe|heel|boot|sneaker|sandal|حذ|شوز|كعب|جزم/.test(t))
    return "5 women's shoes: nude stiletto heel, white leather sneaker, burgundy block-heel pump, beige ballerina flat with a bow, tan ankle boot with a gold buckle.";
  if (/abaya|عباي|عباء/.test(t))
    return "8 abayas on slim gold hangers: beige embroidered, black with gold trim, burgundy, dusty mauve, brown, olive, navy, camel.";
  if (/belt|قشط|قشاط|حزام|أحزمة/.test(t))
    return "6 women's leather belts with gold buckles, each neatly coiled: black, burgundy, tan, navy, brown, cream.";
  if (/dress|فستان|فساتين/.test(t))
    return "8 dresses on slim gold hangers: black midi, beige satin slip, burgundy long evening, soft pink short, camel long-sleeved maxi, black polka-dot, olive wrap dress, navy shirt dress.";
  if (/bag|حقيب|شنط|حقائب/.test(t))
    return "6 women's handbags: camel structured tote, black top-handle bag, burgundy shoulder bag, cream crossbody, soft pink clutch, beige bucket bag.";
  if (/cloth|ملابس/.test(t))
    return "6 women's clothing pieces on slim gold hangers: cream blazer, beige wide trousers, white blouse, olive pleated skirt, light blue shirt, black blazer.";
  return `6 different women's fashion products from the category "${c.name || c.nameAr || ""}", each a different style and colour.`;
}

function RowPhotoUpload({ value, bg, ar, onChange, products, builtIn }: {
  value: string;
  bg: string;
  ar: number;
  onChange: (url: string, bg: string, ar: number) => void;
  products: string;
  /** The ready-made row the site shows for this category until a photo is set. */
  builtIn?: { src: string; bg: string; ar: number } | null;
}) {
  const shown = value ? { src: value, bg, ar: ar || 5.8 } : builtIn || null;
  const nearWhite = (hex: string) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((hex || "").trim());
    return !!m && Math.min(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)) >= 236;
  };
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/ai-generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: products, style: "row" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.noKey ? "ميزة الذكاء الاصطناعي غير مفعّلة على السيرفر (مفتاح API غير موجود)" : data?.message || "فشل توليد الصورة",
        );
      }
      if (!data.url) throw new Error("لم يتم إرجاع رابط الصورة");
      onChange(data.url, data.bg || "", Number(data.ar) || 0);
      toast({ title: "تم توليد صورة الصف — راجعي المعاينة ثم احفظي" });
    } catch (err: any) {
      toast({ title: "فشل التوليد", description: err?.message || "حاولي مرة أخرى", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const trimmed = await trimRowPhoto(file);
      const formData = new FormData();
      formData.append("images", trimmed.file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.urls?.[0]) onChange(data.urls[0], trimmed.bg, trimmed.ar);
    } catch {
      toast({ title: "فشل رفع الصورة", variant: "destructive" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <div className="space-y-3">
      {shown ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3" data-testid="row-previews">
          <p className="text-[11px] font-semibold text-muted-foreground text-right">
            كيف تظهر للعميلة{!value && builtIn ? " — هذا هو الصف الجاهز المعروض حالياً" : ""}
          </p>
          {(() => {
            const tall = shown.ar < 4;
            const blend = nearWhite(shown.bg);
            // The banner's real shapes: low strip for wide rows, taller banner for rows of tall pieces.
            const views = tall
              ? [{ label: "كمبيوتر", aspect: 7.7, width: "100%" }, { label: "هاتف", aspect: 2.86, width: "60%" }]
              : [{ label: "كمبيوتر", aspect: 15, width: "100%" }, { label: "هاتف", aspect: 4.6, width: "60%" }];
            return views.map((v) => (
              <div key={v.label} style={{ width: v.width }} className="ms-auto">
                <div
                  className={`relative overflow-hidden rounded-2xl ${blend || !shown.bg ? "bg-blush" : ""}`}
                  style={{ aspectRatio: String(v.aspect), ...(shown.bg && !blend ? { backgroundColor: shown.bg } : {}) }}
                >
                  <div className={`absolute inset-x-[2.5%] inset-y-[7%] flex flex-wrap content-start justify-evenly overflow-hidden ${blend ? "mix-blend-multiply" : ""}`}>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <img key={n} src={shown.src} alt="" className="h-full max-w-full shrink-0 object-contain" />
                    ))}
                  </div>
                </div>
                <p className="mt-1 text-center text-[10px] text-muted-foreground">{v.label}</p>
              </div>
            ));
          })()}
        </div>
      ) : (
        <div className="flex h-20 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 text-xs text-muted-foreground">لا توجد صورة</div>
      )}
      <div className="flex justify-end gap-2">
        {value && (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange("", "", 0)} className="h-9 px-3 text-destructive hover:bg-destructive/10" data-testid="button-clear-row">
            <X className="w-4 h-4" />
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={handleGenerate} disabled={generating || busy} className="h-9 gap-2 px-3 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary" data-testid="button-generate-row">
          {generating ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Bot className="w-4 h-4" />}
          <span className="text-xs">{generating ? "جاري التوليد…" : value ? "توليد صورة أخرى" : "توليد الصف تلقائياً"}</span>
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy} className="h-9 gap-2 px-3" data-testid="button-upload-row">
          {busy ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
          <span className="text-xs">{value ? "تغيير الصورة" : "رفع صورة الصف"}</span>
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
    </div>
  );
}

function CategoryStripBannersCard({ values, onChange }: { values: Record<string, string>; onChange: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-category-strip-banners">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid="toggle-section-category-strip-banners"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm">بانرات الفئات في الصفحة الرئيسية</p>
          <p className="text-xs text-muted-foreground">Home category banners</p>
        </div>
      </button>
      {open && (
        <div className="p-5 space-y-5 bg-background">
          <p className="text-xs text-muted-foreground text-right">
            الشريط فوق منتجات كل فئة: صف من صور المنتجات الحقيقية على خلفية بلون واحد. ارفعي الصورة كما هي (مثلاً 5 قطع في صف على خلفية وردية) — الموقع يقصّ الفراغ حول القطع تلقائياً، ويأخذ لون الخلفية للشريط، ويعرض الصف كاملاً وواضحاً على الكمبيوتر والهاتف بدون أي قص. كلما كانت القطع أكبر في الصورة كانت أوضح. فئة الأحذية لها صف جاهز يظهر تلقائياً إلى أن ترفعي غيره. زر «توليد الصف تلقائياً» يصنع صورة الصف للفئة بالذكاء الاصطناعي ويجهّزها مباشرة — راجعي المعاينة ثم اضغطي حفظ، وإن لم تعجبك اضغطي «توليد صورة أخرى».
          </p>
          <BulkAIGenerate
            label="توليد صفوف كل الفئات بالذكاء الاصطناعي"
            note="بعد التوليد راجعي المعاينات ثم اضغطي حفظ."
            items={categories.map((c: any) => ({
              key: `row-${c.id}`,
              label: c.nameAr || c.name,
              prompt: rowProductsFor(c),
              style: "row" as const,
              apply: (d: { url: string; bg?: string; ar?: number }) => {
                onChange(`home_cat_banner_${c.id}_row`, d.url);
                onChange(`home_cat_banner_${c.id}_row_bg`, d.bg || "");
                onChange(`home_cat_banner_${c.id}_row_ar`, d.ar ? String(d.ar) : "");
              },
            }))}
          />
          {categories.map((c: any) => (
            <div key={c.id} className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-sm font-semibold text-right">{c.nameAr || c.name}</p>
              <RowPhotoUpload
                value={values[`home_cat_banner_${c.id}_row`] ?? ""}
                bg={values[`home_cat_banner_${c.id}_row_bg`] ?? ""}
                ar={parseFloat(values[`home_cat_banner_${c.id}_row_ar`] ?? "") || 0}
                products={rowProductsFor(c)}
                builtIn={/shoe|heel|boot|sneaker|sandal|حذ|شوز|كعب|جزم/.test(`${c.name || ""} ${c.slug || ""} ${c.nameAr || ""}`.toLowerCase()) ? { src: "/banners/shoes-row.webp", bg: "#F7D5E6", ar: 5.8 } : null}
                onChange={(url, bg, ar) => {
                  onChange(`home_cat_banner_${c.id}_row`, url);
                  onChange(`home_cat_banner_${c.id}_row_bg`, bg);
                  onChange(`home_cat_banner_${c.id}_row_ar`, ar ? String(Number(ar.toFixed(3))) : "");
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MenuPhotosCard({ values, onChange }: { values: Record<string, string>; onChange: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-menu-photos">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid="toggle-section-menu-photos"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm">صور قائمة الهاتف</p>
          <p className="text-xs text-muted-foreground">Phone menu photos</p>
        </div>
      </button>
      {open && (
        <div className="p-5 space-y-5 bg-background">
          <p className="text-xs text-muted-foreground text-right">
            صورة كل فئة داخل قائمة الهاتف. إذا تُركت فارغة تُستخدم صورة الفئة نفسها.
          </p>
          <BulkAIGenerate
            label="توليد صور القائمة لكل الفئات بالذكاء الاصطناعي"
            note="بعد التوليد راجعي الصور ثم اضغطي حفظ."
            items={categories.map((c: any) => ({
              key: `menu-${c.id}`,
              label: c.nameAr || c.name,
              prompt: `women's ${c.name || c.nameAr || ""}`,
              slot: "menu",
              aspect: "square" as const,
              apply: (d: { url: string }) => onChange(`menu_photo_${c.id}`, d.url),
            }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {categories.map((c: any) => (
              <div key={c.id} className="rounded-xl border border-border p-4 space-y-3">
                <p className="text-sm font-semibold text-right">{c.nameAr || c.name}</p>
                <SimpleImageUpload
                  value={values[`menu_photo_${c.id}`] ?? ""}
                  onChange={(url) => onChange(`menu_photo_${c.id}`, url)}
                  label="صورة القائمة"
                  withCrop
                  shape={SLOT_SHAPES.menu}
                  promptContext={`women's ${c.name || c.nameAr || ""}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PromoSliderCard({ values, onChange }: { values: Record<string, string>; onChange: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: categories = [] } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  const { data: subcategories = [] } = useQuery<any[]>({ queryKey: ["/api/subcategories"] });
  const field = "w-full h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary disabled:opacity-60";
  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-promo-slider">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid="toggle-section-promo-slider"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm">سلايدر الصور في منتصف الصفحة الرئيسية</p>
          <p className="text-xs text-muted-foreground">Home page photo slider</p>
        </div>
      </button>
      {open && (
        <div className="p-5 space-y-5 bg-background">
          <p className="text-xs text-muted-foreground text-right">
            حتى 4 شرائح. لكل شريحة يمكن اختيار فئة أو تصنيف فرعي لتفتح الشريحة عليه، مع صورة عريضة وعنوان. إذا تُرك العنوان أو الصورة فارغاً يُستخدم اسم وصورة الفئة/التصنيف. بدون فئة يُستخدم الرابط المكتوب (مثال: /sales أو /shop). الشريحة بدون صورة لا تظهر. إذا تُركت كلها فارغة يعرض الموقع صور الأقسام تلقائياً.
          </p>
          <BulkAIGenerate
            label="توليد صور كل الشرائح بالذكاء الاصطناعي"
            note="بعد التوليد راجعي الصور ثم اضغطي حفظ."
            items={[1, 2, 3, 4].map((n) => {
              const cat = categories.find((c: any) => String(c.id) === (values[`promo_slide_${n}_category_id`] ?? ""));
              const sub = subcategories.find((x: any) => String(x.id) === (values[`promo_slide_${n}_subcategory_id`] ?? ""));
              const name = sub?.name || sub?.nameAr || cat?.name || cat?.nameAr || values[`promo_slide_${n}_title_en`] || "";
              return {
                key: `promo-${n}`,
                label: `الشريحة ${n}${name ? ` — ${sub?.nameAr || cat?.nameAr || name}` : ""}`,
                prompt: name ? `women's ${name}` : "women's fashion: dresses, shoes and bags",
                slot: "promo",
                apply: (d: { url: string }) => onChange(`promo_slide_${n}_image`, d.url),
              };
            })}
          />
          {[1, 2, 3, 4].map((n) => {
            const catId = values[`promo_slide_${n}_category_id`] ?? "";
            const subs = catId ? subcategories.filter((s: any) => String(s.categoryId) === catId) : [];
            return (
            <div key={n} className="rounded-xl border border-border p-4 space-y-3">
              <p className="text-sm font-semibold text-right">الشريحة {n}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  dir="rtl"
                  className={field}
                  value={catId}
                  onChange={(e) => {
                    onChange(`promo_slide_${n}_category_id`, e.target.value);
                    onChange(`promo_slide_${n}_subcategory_id`, "");
                  }}
                  data-testid={`select-promo-${n}-category`}
                >
                  <option value="">— بدون فئة (استخدام الرابط) —</option>
                  {categories.map((c: any) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.nameAr || c.name} ({c.name})
                    </option>
                  ))}
                </select>
                <select
                  dir="rtl"
                  className={field}
                  value={values[`promo_slide_${n}_subcategory_id`] ?? ""}
                  disabled={!catId || subs.length === 0}
                  onChange={(e) => onChange(`promo_slide_${n}_subcategory_id`, e.target.value)}
                  data-testid={`select-promo-${n}-subcategory`}
                >
                  <option value="">
                    {catId && subs.length === 0 ? "— لا توجد تصنيفات فرعية —" : "— الفئة كاملة —"}
                  </option>
                  {subs.map((s: any) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.nameAr || s.name} ({s.name})
                    </option>
                  ))}
                </select>
              </div>
              <SimpleImageUpload
                value={values[`promo_slide_${n}_image`] ?? ""}
                onChange={(url) => onChange(`promo_slide_${n}_image`, url)}
                label="الصورة"
                withCrop
                shape={SLOT_SHAPES.promo}
                promptContext={(() => {
                  const cat = categories.find((c: any) => String(c.id) === catId);
                  const sub = subcategories.find((x: any) => String(x.id) === (values[`promo_slide_${n}_subcategory_id`] ?? ""));
                  const name = sub?.name || sub?.nameAr || cat?.name || cat?.nameAr || values[`promo_slide_${n}_title_en`] || "";
                  return name ? `women's ${name}` : "women's fashion: dresses, shoes and bags";
                })()}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  dir="rtl"
                  className={field}
                  placeholder="العنوان بالعربية"
                  value={values[`promo_slide_${n}_title_ar`] ?? ""}
                  onChange={(e) => onChange(`promo_slide_${n}_title_ar`, e.target.value)}
                  data-testid={`input-promo-${n}-title-ar`}
                />
                <input
                  dir="ltr"
                  className={field}
                  placeholder="Title in English"
                  value={values[`promo_slide_${n}_title_en`] ?? ""}
                  onChange={(e) => onChange(`promo_slide_${n}_title_en`, e.target.value)}
                  data-testid={`input-promo-${n}-title-en`}
                />
              </div>
              <input
                dir="ltr"
                className={field}
                placeholder="/shop"
                disabled={!!catId}
                value={values[`promo_slide_${n}_link`] ?? ""}
                onChange={(e) => onChange(`promo_slide_${n}_link`, e.target.value)}
                data-testid={`input-promo-${n}-link`}
              />
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Preview of the storefront news bar: one message at a time, rotating, in the bar's own colour. */
function NewsBarPreview({ text }: { text: string }) {
  const items = text.split("|").map((t) => t.trim()).filter(Boolean);
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const id = window.setInterval(() => setIdx((v) => v + 1), 3200);
    return () => window.clearInterval(id);
  }, [items.length]);
  const current = items.length ? items[idx % items.length] : "";
  return (
    <div className="bg-berry text-white overflow-hidden">
      <div className="flex h-9 items-center justify-center px-4" dir="auto">
        <span key={`${idx}-${current}`} className="news-rise truncate text-[13px] font-medium">
          {current}
        </span>
      </div>
      {items.length > 1 && (
        <p className="bg-black/15 py-0.5 text-center text-[10px] text-white/80">
          {(idx % items.length) + 1} / {items.length}
        </p>
      )}
    </div>
  );
}

function NewsBarCard({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const enabled = values["news_bar_enabled"] === "true";
  const hasArText = (values["news_bar_text_ar"] ?? "").trim().length > 0;
  const hasEnText = (values["news_bar_text_en"] ?? "").trim().length > 0;
  const hasAnyText = hasArText || hasEnText;

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-news-bar">
      <button
        type="button"
        className={`w-full flex items-center justify-between px-5 py-4 transition-colors ${
          enabled
            ? "bg-foreground/[0.04] hover:bg-foreground/[0.07] dark:bg-foreground/10 dark:hover:bg-foreground/15"
            : "bg-muted/30 hover:bg-muted/60"
        }`}
        onClick={() => setOpen(!open)}
        data-testid="toggle-section-news-bar"
      >
        <div className="flex items-center gap-2.5">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          {enabled ? (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              مباشر
            </span>
          ) : (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              معطّل
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold text-sm">شريط الأخبار</p>
            <p className="text-xs text-muted-foreground">Announcement Bar</p>
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            enabled
              ? "bg-foreground text-background"
              : "bg-muted/60 text-muted-foreground"
          }`}>
            <Megaphone className="w-4.5 h-4.5" />
          </div>
        </div>
      </button>

      {open && (
        <div className="bg-background">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between mb-5">
              <button
                type="button"
                onClick={() => onChange("news_bar_enabled", enabled ? "false" : "true")}
                className={`relative w-12 h-[26px] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  enabled ? "bg-foreground" : "bg-muted-foreground/25"
                }`}
                data-testid="checkbox-news-bar-enabled"
              >
                <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-background shadow-sm transition-transform duration-200 ${
                  enabled ? "left-[3px] translate-x-[22px]" : "left-[3px] translate-x-0"
                }`} />
              </button>
              <Label
                htmlFor="news-bar-toggle"
                className="text-sm font-medium cursor-pointer select-none"
                onClick={() => onChange("news_bar_enabled", enabled ? "false" : "true")}
              >
                عرض شريط الأخبار في الموقع
              </Label>
            </div>

            <div className={`space-y-4 transition-opacity duration-200 ${enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <div className="space-y-2">
                <div className="flex items-center justify-end gap-2">
                  <Label className="text-sm font-medium">النص بالعربية</Label>
                  <div className="w-7 h-7 rounded-md bg-muted/50 flex items-center justify-center">
                    <Type className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
                <Input
                  value={values["news_bar_text_ar"] ?? ""}
                  onChange={e => onChange("news_bar_text_ar", e.target.value)}
                  placeholder="مثال: لوسيرن بوتيك | شحن مجاني | موضة نسائية"
                  className="text-sm h-10 border-border/60 focus:border-foreground/30"
                  dir="rtl"
                  data-testid="input-news-bar-text-ar"
                />
                <p className="text-[11px] text-muted-foreground text-right">افصلي الرسائل بـ | — تظهر رسالة واحدة في كل مرة وتتبدّل تلقائياً</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-end gap-2">
                  <Label className="text-sm font-medium">النص بالإنجليزية</Label>
                  <div className="w-7 h-7 rounded-md bg-muted/50 flex items-center justify-center">
                    <Languages className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                </div>
                <Input
                  value={values["news_bar_text_en"] ?? ""}
                  onChange={e => onChange("news_bar_text_en", e.target.value)}
                  placeholder="e.g. Lucerne Boutique | Free Shipping | Women's Fashion"
                  className="text-sm h-10 border-border/60 focus:border-foreground/30"
                  dir="ltr"
                  data-testid="input-news-bar-text-en"
                />
                <p className="text-[11px] text-muted-foreground text-right">Separate messages with | — one shows at a time and they rotate automatically</p>
              </div>

              {!hasAnyText && enabled && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-right flex items-center justify-end gap-1.5">
                  أضف نصاً لعرضه في الشريط
                  <EyeOff className="w-3.5 h-3.5" />
                </p>
              )}
            </div>
          </div>

          {enabled && hasAnyText && (
            <div className="border-t border-border/50">
              <div className="px-5 pt-3 pb-1.5">
                <p className="text-[11px] text-muted-foreground text-right flex items-center justify-end gap-1.5 mb-2.5">
                  معاينة مباشرة
                  <Eye className="w-3 h-3" />
                </p>
              </div>
              <div className="mx-5 mb-4 rounded-lg overflow-hidden border border-border/40 shadow-sm" data-testid="news-bar-preview">
                <NewsBarPreview text={values["news_bar_text_ar"] || values["news_bar_text_en"] || ""} />
                {hasArText && hasEnText && (
                  <div className="bg-muted/30 px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/30">
                    <span dir="ltr" className="truncate max-w-[45%]">EN: {values["news_bar_text_en"]}</span>
                    <span dir="rtl" className="truncate max-w-[45%]">ع: {values["news_bar_text_ar"]}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ShippingZonesCard({ values, onChange }: { values: Record<string, string>; onChange: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);
  const zones: ShippingZone[] = getShippingZones(values);

  const updateZones = (updated: ShippingZone[]) => {
    onChange("shipping_zones", JSON.stringify(updated));
  };

  const updateZone = (idx: number, field: keyof ShippingZone, value: string | number) => {
    const updated = [...zones];
    updated[idx] = { ...updated[idx], [field]: value };
    updateZones(updated);
  };

  const addZone = () => {
    const newId = `zone_${Date.now()}`;
    updateZones([...zones, { id: newId, nameAr: "", nameEn: "", price: 0 }]);
  };

  const removeZone = (idx: number) => {
    updateZones(zones.filter((_, i) => i !== idx));
  };

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/50 transition-colors"
        data-testid="button-toggle-shipping-zones"
      >
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
        <div className="flex items-center gap-3 text-right">
          <div>
            <div className="font-semibold text-sm">مناطق التوصيل والأسعار</div>
            <div className="text-xs text-muted-foreground">{zones.length} مناطق</div>
          </div>
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Truck className="w-4 h-4 text-primary" />
          </div>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t">
          {zones.map((zone, idx) => (
            <div key={zone.id} className="border rounded-lg p-4 space-y-3 bg-muted/20 mt-4">
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeZone(idx)}
                  className="text-destructive hover:text-destructive h-8 w-8 p-0"
                  data-testid={`button-remove-zone-${idx}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium text-right">منطقة {idx + 1}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-right block">الاسم بالعربية</Label>
                  <Input
                    value={zone.nameAr}
                    onChange={(e) => updateZone(idx, "nameAr", e.target.value)}
                    className="text-right text-sm"
                    placeholder="مثال: الضفة الغربية"
                    data-testid={`input-zone-name-ar-${idx}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-right block">الاسم بالإنجليزية</Label>
                  <Input
                    value={zone.nameEn}
                    onChange={(e) => updateZone(idx, "nameEn", e.target.value)}
                    className="text-sm"
                    placeholder="e.g. West Bank"
                    data-testid={`input-zone-name-en-${idx}`}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-right block">السعر (₪)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={zone.price}
                    onChange={(e) => updateZone(idx, "price", Number(e.target.value))}
                    className="text-sm"
                    data-testid={`input-zone-price-${idx}`}
                  />
                </div>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={addZone}
            className="w-full gap-2 mt-2"
            data-testid="button-add-zone"
          >
            <Plus className="w-4 h-4" />
            إضافة منطقة جديدة
          </Button>
        </div>
      )}
    </div>
  );
}

interface FaqItem { question_ar: string; question_en: string; answer_ar: string; answer_en: string; }

function SupportPagesCard({ values, onChange }: { values: Record<string, string>; onChange: (key: string, val: string) => void }) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"faq" | "shipping" | "contact" | "location">("faq");

  const getFaqItems = (): FaqItem[] => {
    try { return JSON.parse(values.faq_items || "[]"); } catch { return []; }
  };
  const setFaqItems = (items: FaqItem[]) => onChange("faq_items", JSON.stringify(items));
  const faqItems = getFaqItems();

  const addFaqItem = () => setFaqItems([...faqItems, { question_ar: "", question_en: "", answer_ar: "", answer_en: "" }]);
  const removeFaqItem = (i: number) => setFaqItems(faqItems.filter((_, idx) => idx !== i));
  const updateFaqItem = (i: number, field: keyof FaqItem, val: string) => {
    const updated = [...faqItems];
    updated[i] = { ...updated[i], [field]: val };
    setFaqItems(updated);
  };

  const tabs = [
    { id: "faq" as const, label: "الأسئلة الشائعة", en: "FAQ" },
    { id: "shipping" as const, label: "الشحن والإرجاع", en: "Shipping & Returns" },
    { id: "contact" as const, label: "اتصلي بنا", en: "Contact" },
    { id: "location" as const, label: "موقعنا", en: "Location" },
  ];

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-support-pages">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/60 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid="toggle-section-support"
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm">صفحات الدعم</p>
          <p className="text-xs text-muted-foreground">Support Pages (FAQ, Shipping, Contact, Location)</p>
        </div>
      </button>

      {open && (
        <div className="bg-background">
          {/* Tabs */}
          <div className="flex border-b border-border overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-support-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-5">
            {/* FAQ Tab */}
            {activeTab === "faq" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground text-right">أضف أو عدّل أسئلة الأسئلة الشائعة. كل سؤال يحتاج نصاً بالعربية والإنجليزية.</p>
                {faqItems.map((item, i) => (
                  <div key={i} className="border border-border rounded-lg p-4 space-y-3" data-testid={`faq-item-${i}`}>
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={() => removeFaqItem(i)} className="text-destructive hover:opacity-70 transition-opacity" data-testid={`button-remove-faq-${i}`}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-semibold text-muted-foreground">سؤال {i + 1}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground">السؤال (عربي)</p>
                        <Input value={item.question_ar} onChange={e => updateFaqItem(i, "question_ar", e.target.value)} className="h-9 text-xs" dir="rtl" data-testid={`input-faq-q-ar-${i}`} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground">Question (English)</p>
                        <Input value={item.question_en} onChange={e => updateFaqItem(i, "question_en", e.target.value)} className="h-9 text-xs" dir="ltr" data-testid={`input-faq-q-en-${i}`} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground">الجواب (عربي)</p>
                        <textarea value={item.answer_ar} onChange={e => updateFaqItem(i, "answer_ar", e.target.value)} rows={3} className="w-full px-3 py-2 text-xs border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" dir="rtl" data-testid={`input-faq-a-ar-${i}`} />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] text-muted-foreground">Answer (English)</p>
                        <textarea value={item.answer_en} onChange={e => updateFaqItem(i, "answer_en", e.target.value)} rows={3} className="w-full px-3 py-2 text-xs border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" dir="ltr" data-testid={`input-faq-a-en-${i}`} />
                      </div>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addFaqItem} className="w-full gap-2" data-testid="button-add-faq">
                  <Plus className="w-4 h-4" /> إضافة سؤال
                </Button>
              </div>
            )}

            {/* Shipping Tab */}
            {activeTab === "shipping" && (
              <div className="space-y-5">
                <div>
                  <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">تفاصيل الشحن (سطر لكل نقطة)</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">عربي</p>
                      <textarea value={values.shipping_details_ar ?? ""} onChange={e => onChange("shipping_details_ar", e.target.value)} rows={6} dir="rtl" className="w-full px-3 py-2 text-xs border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" data-testid="input-shipping-details-ar" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">English</p>
                      <textarea value={values.shipping_details_en ?? ""} onChange={e => onChange("shipping_details_en", e.target.value)} rows={6} dir="ltr" className="w-full px-3 py-2 text-xs border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" data-testid="input-shipping-details-en" />
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">تفاصيل الإرجاع (سطر لكل نقطة)</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">عربي</p>
                      <textarea value={values.returns_details_ar ?? ""} onChange={e => onChange("returns_details_ar", e.target.value)} rows={6} dir="rtl" className="w-full px-3 py-2 text-xs border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" data-testid="input-returns-details-ar" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">English</p>
                      <textarea value={values.returns_details_en ?? ""} onChange={e => onChange("returns_details_en", e.target.value)} rows={6} dir="ltr" className="w-full px-3 py-2 text-xs border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" data-testid="input-returns-details-en" />
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">ملاحظة</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">عربي</p>
                      <Input value={values.shipping_note_ar ?? ""} onChange={e => onChange("shipping_note_ar", e.target.value)} dir="rtl" className="text-xs" data-testid="input-shipping-note-ar" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">English</p>
                      <Input value={values.shipping_note_en ?? ""} onChange={e => onChange("shipping_note_en", e.target.value)} dir="ltr" className="text-xs" data-testid="input-shipping-note-en" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Contact Tab */}
            {activeTab === "contact" && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">رقم الهاتف / WhatsApp</Label>
                  <Input value={values.contact_phone ?? ""} onChange={e => onChange("contact_phone", e.target.value)} dir="ltr" placeholder="970597314193" className="text-xs" data-testid="input-contact-phone" />
                  <p className="text-[11px] text-muted-foreground">أدخلي الرقم مع رمز الدولة بدون +، مثال: 970597314193</p>
                </div>
                <div>
                  <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">العنوان</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">عربي</p>
                      <Input value={values.contact_address_ar ?? ""} onChange={e => onChange("contact_address_ar", e.target.value)} dir="rtl" className="text-xs" data-testid="input-contact-address-ar" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">English</p>
                      <Input value={values.contact_address_en ?? ""} onChange={e => onChange("contact_address_en", e.target.value)} dir="ltr" className="text-xs" data-testid="input-contact-address-en" />
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">ساعات العمل</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">عربي</p>
                      <Input value={values.contact_hours_ar ?? ""} onChange={e => onChange("contact_hours_ar", e.target.value)} dir="rtl" className="text-xs" data-testid="input-contact-hours-ar" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">English</p>
                      <Input value={values.contact_hours_en ?? ""} onChange={e => onChange("contact_hours_en", e.target.value)} dir="ltr" className="text-xs" data-testid="input-contact-hours-en" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Location Tab */}
            {activeTab === "location" && (
              <div className="space-y-5">
                <div>
                  <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">العنوان</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">عربي</p>
                      <Input value={values.location_address_ar ?? ""} onChange={e => onChange("location_address_ar", e.target.value)} dir="rtl" className="text-xs" data-testid="input-location-address-ar" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">English</p>
                      <Input value={values.location_address_en ?? ""} onChange={e => onChange("location_address_en", e.target.value)} dir="ltr" className="text-xs" data-testid="input-location-address-en" />
                    </div>
                  </div>
                </div>
                <div>
                  <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">ساعات العمل</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">عربي</p>
                      <Input value={values.location_hours_ar ?? ""} onChange={e => onChange("location_hours_ar", e.target.value)} dir="rtl" className="text-xs" data-testid="input-location-hours-ar" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">English</p>
                      <Input value={values.location_hours_en ?? ""} onChange={e => onChange("location_hours_en", e.target.value)} dir="ltr" className="text-xs" data-testid="input-location-hours-en" />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">رقم الهاتف</Label>
                  <Input value={values.location_phone ?? ""} onChange={e => onChange("location_phone", e.target.value)} dir="ltr" className="text-xs" data-testid="input-location-phone" />
                </div>
                <div>
                  <Label className="mb-2 block text-xs font-semibold text-muted-foreground uppercase tracking-wide">التوجيهات / كيف تصلين إلينا</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">عربي</p>
                      <textarea value={values.location_directions_ar ?? ""} onChange={e => onChange("location_directions_ar", e.target.value)} rows={3} dir="rtl" className="w-full px-3 py-2 text-xs border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" data-testid="input-location-directions-ar" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">English</p>
                      <textarea value={values.location_directions_en ?? ""} onChange={e => onChange("location_directions_en", e.target.value)} rows={3} dir="ltr" className="w-full px-3 py-2 text-xs border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" data-testid="input-location-directions-en" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" />
                    فيديو المتجر
                  </Label>
                  <VideoUploadField
                    value={values.location_video_url ?? ""}
                    onChange={(url) => onChange("location_video_url", url)}
                    position={values.location_video_position ?? ""}
                    onChangePosition={(pos) => onChange("location_video_position", pos)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  );
}

type QuickToggle = {
  key: string;
  icon: any;
  group: "orders" | "auth" | "messages" | "account";
  titleAr: string;
  titleEn: string;
  descAr: string;
  hiddenNoteAr: string;
  /** When true the toggle is OFF unless the setting is explicitly "true". */
  defaultOff?: boolean;
  /** Only has an effect while this other switch is on. */
  dependsOn?: string;
  /** Name of that other switch, and the label of the one-click fix, for the explanation shown when it is off. */
  dependsOnLabelAr?: string;
  dependsFixAr?: string;
};

const TOGGLE_GROUPS: { id: QuickToggle["group"]; labelAr: string; labelEn: string }[] = [
  { id: "orders", labelAr: "الطلب والدفع", labelEn: "Ordering & payment" },
  { id: "auth", labelAr: "تسجيل الدخول والتسجيل", labelEn: "Sign-in & sign-up" },
  { id: "messages", labelAr: "الرسائل", labelEn: "Messages" },
  { id: "account", labelAr: "حساب العميلة", labelEn: "Customer account" },
];

const QUICK_TOGGLES: QuickToggle[] = [
  {
    key: "guest_checkout_enabled",
    group: "orders",
    icon: UserRound,
    titleAr: "الطلب كضيف (بدون تسجيل)",
    titleEn: "Guest Checkout",
    descAr: "السماح بإتمام الطلب دون حساب (بدون نقاط أو أكواد خصم)، مع التحقق برمز",
    hiddenNoteAr: "سيُطلب من العميلات تسجيل الدخول لإتمام الطلب",
  },
  {
    key: "guest_sms_enabled",
    group: "orders",
    icon: MessageSquareText,
    titleAr: "رسائل SMS للضيوف",
    titleEn: "Guest SMS verification",
    descAr: "يتحقق الضيف برمز SMS عبر Twilio، أو بالبريد الإلكتروني (رسالتان بحد أقصى، 60 ثانية بينهما)",
    hiddenNoteAr: "سيتحقق الضيوف بالبريد الإلكتروني فقط",
    dependsOn: "guest_checkout_enabled",
    dependsOnLabelAr: "الطلب كضيف",
    dependsFixAr: "تفعيل الطلب كضيف",
  },
  {
    key: "online_pickup_enabled",
    group: "orders",
    icon: Store,
    titleAr: "الاستلام من المتجر (دفع أونلاين)",
    titleEn: "Online Store Pickup",
    descAr: "السماح باختيار الاستلام من المتجر في صفحة الدفع، بالدفع أونلاين فقط",
    hiddenNoteAr: "سيُخفى خيار الاستلام من المتجر من صفحة الدفع، ويبقى التوصيل كما هو",
    // Pickup is online-payment only, so it can't appear while card payment is off.
    dependsOn: "card_payment_enabled",
    dependsOnLabelAr: "الدفع بالبطاقة",
    dependsFixAr: "تفعيل الدفع بالبطاقة",
  },
  {
    key: "card_payment_enabled",
    group: "orders",
    icon: CreditCard,
    titleAr: "الدفع بالبطاقة",
    titleEn: "Card Payment at Checkout",
    descAr: "السماح بالدفع عبر البطاقة في صفحة الدفع",
    hiddenNoteAr: "سيُخفى خيار الدفع بالبطاقة (والاستلام من المتجر لأنه يحتاج دفعاً أونلاين)",
  },
  {
    key: "loyalty_points_enabled",
    group: "orders",
    icon: Gift,
    titleAr: "نقاطي والرصيد",
    titleEn: "Loyalty Points & Credit at Checkout",
    descAr: "السماح باستخدام رصيد الولاء وعرض النقاط في صفحة الدفع",
    hiddenNoteAr: "سيُخفى رصيد الولاء وشارة النقاط من صفحتي السلة والدفع",
  },
  {
    key: "phone_signup_enabled",
    group: "auth",
    icon: WhatsAppIcon,
    titleAr: "التسجيل برقم الهاتف عبر واتساب",
    titleEn: "Phone Sign-up / Login (WhatsApp)",
    descAr: "إظهار زر \"عبر واتساب\" للتسجيل وتسجيل الدخول برقم الهاتف",
    hiddenNoteAr: "سيُخفى زر \"عبر واتساب\" من صفحة تسجيل الدخول والتسجيل فقط. رسائل طلبات صفحة الدفع لها مفتاح مستقل",
  },
  {
    key: "firebase_sms_enabled",
    group: "auth",
    icon: Smartphone,
    titleAr: "التسجيل برقم الهاتف عبر SMS (Firebase)",
    titleEn: "Phone Sign-up / Login (SMS via Firebase)",
    descAr: "إظهار زر \"عبر SMS\" للتسجيل وتسجيل الدخول برقم الهاتف، برمز يُرسل كرسالة SMS حقيقية عبر Firebase",
    hiddenNoteAr: "سيُخفى زر \"عبر SMS\" من صفحة تسجيل الدخول والتسجيل. يمكن تفعيل الزرّين معاً — كل عميلة تختار الطريقة التي تناسبها",
    defaultOff: true,
  },
  {
    key: "twilio_sms_enabled",
    group: "auth",
    icon: Smartphone,
    titleAr: "التسجيل برقم الهاتف عبر SMS (Twilio)",
    titleEn: "Phone Sign-up / Login (SMS via Twilio)",
    descAr: "إظهار خيار Twilio SMS في تسجيل الدخول والتسجيل، وإرسال رمز التحقق عبر Twilio Verify",
    hiddenNoteAr: "سيُخفى خيار Twilio SMS فقط، وسيبقى Firebase وواتساب كما هما",
    defaultOff: true,
  },
  {
    key: "checkout_whatsapp_enabled",
    group: "messages",
    icon: WhatsAppIcon,
    titleAr: "رسالة واتساب بعد الطلب",
    titleEn: "Checkout WhatsApp Confirmation",
    descAr: "إظهار تنبيه واتساب في صفحة الدفع وإرسال رسالة تأكيد بعد إنشاء الطلب (لا تُرسل للضيوف)",
    hiddenNoteAr: "سيُخفى تنبيه واتساب من صفحة الدفع ولن تُرسل رسالة تأكيد الطلب، بدون التأثير على تسجيل الدخول عبر واتساب",
  },
  {
    key: "exchanges_enabled",
    group: "account",
    icon: Repeat,
    titleAr: "طلبات الاستبدال",
    titleEn: "Exchange Requests on Profile Page",
    descAr: "السماح للعميلات بطلب استبدال المنتجات (باستثناء الفساتين)",
    hiddenNoteAr: "سيُخفى زر \"طلب استبدال\" من صفحة الحساب",
  },
];

function isToggleOn(t: QuickToggle, values: Record<string, string>) {
  return t.defaultOff ? values[t.key] === "true" : values[t.key] !== "false";
}

type StatusFilter = "all" | "on" | "off";

function QuickTogglesCard({
  values,
  onChange,
  query,
  status,
  onStatus,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  query: string;
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
}) {
  const q = query.toLowerCase().trim();
  const onCount = QUICK_TOGGLES.filter((t) => isToggleOn(t, values)).length;
  const matches = (t: QuickToggle) => {
    const on = isToggleOn(t, values);
    if (status === "on" && !on) return false;
    if (status === "off" && on) return false;
    if (!q) return true;
    return `${t.titleAr} ${t.titleEn} ${t.descAr}`.toLowerCase().includes(q);
  };
  const chips: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: "الكل", count: QUICK_TOGGLES.length },
    { id: "on", label: "مفعّلة", count: onCount },
    { id: "off", label: "معطّلة", count: QUICK_TOGGLES.length - onCount },
  ];
  const visibleGroups = TOGGLE_GROUPS.map((g) => ({ g, rows: QUICK_TOGGLES.filter((t) => t.group === g.id && matches(t)) })).filter((x) => x.rows.length > 0);

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-quick-toggles">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-1.5" role="tablist" aria-label="تصفية المفاتيح">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={status === c.id}
              onClick={() => onStatus(c.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                status === c.id ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground/40"
              }`}
              data-testid={`filter-toggles-${c.id}`}
            >
              {c.label}
              <span className={`rounded-full px-1.5 text-[10px] ${status === c.id ? "bg-background/20" : "bg-muted"}`}>{c.count}</span>
            </button>
          ))}
        </div>
        <div className="text-right">
          <p className="font-semibold text-sm">إعدادات سريعة</p>
          <p className="text-xs text-muted-foreground">Quick Toggles · {onCount}/{QUICK_TOGGLES.length} مفعّلة</p>
        </div>
      </div>

      {visibleGroups.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground" data-testid="text-no-toggles">لا توجد مفاتيح مطابقة</p>
      )}

      {visibleGroups.map(({ g, rows }) => (
        <div key={g.id} data-testid={`toggle-group-${g.id}`}>
          <p className="px-5 pt-4 pb-1.5 text-[11px] font-bold tracking-wide text-muted-foreground text-right">{g.labelAr} · {g.labelEn}</p>
          <div className="divide-y divide-border/50">
            {rows.map((toggle) => {
              const enabled = isToggleOn(toggle, values);
              const parentOff = toggle.dependsOn ? values[toggle.dependsOn] === "false" : false;
              // Switched on, but it can't show to customers because the switch it depends on is off.
              const blocked = parentOff && enabled;
              const Icon = toggle.icon;
              return (
                <div key={toggle.key} className={`flex items-center justify-between gap-4 px-5 py-3.5 ${parentOff && !enabled ? "opacity-55" : ""}`} data-testid={`row-${toggle.key}`} data-blocked={blocked ? "true" : undefined}>
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={toggle.titleAr}
                      onClick={() => onChange(toggle.key, enabled ? "false" : "true")}
                      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${enabled ? "bg-foreground" : "bg-muted-foreground/25"}`}
                      data-testid={`checkbox-${toggle.key.replace(/_/g, "-")}`}
                    >
                      <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-background shadow-sm transition-transform duration-200 ${enabled ? "left-[3px] translate-x-[20px]" : "left-[3px] translate-x-0"}`} />
                    </button>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${blocked ? "bg-amber-100 text-amber-800" : enabled ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`} data-testid={`status-${toggle.key}`}>
                      {blocked ? "لا يظهر الآن" : enabled ? "مفعّل" : "معطّل"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 min-w-0 flex-1 justify-end text-right">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm cursor-pointer select-none" onClick={() => onChange(toggle.key, enabled ? "false" : "true")}>
                        {toggle.titleAr}
                      </p>
                      {blocked ? (
                        <p className="text-[11px] text-amber-800 leading-relaxed" data-testid={`blocked-${toggle.key}`}>
                          مفعّل، لكنه لا يظهر للزبائن لأنه يعمل فقط عند تفعيل «{toggle.dependsOnLabelAr}».{" "}
                          <button
                            type="button"
                            onClick={() => onChange(toggle.dependsOn!, "true")}
                            className="font-bold underline underline-offset-2 hover:no-underline"
                            data-testid={`button-fix-${toggle.key}`}
                          >
                            {toggle.dependsFixAr}
                          </button>
                        </p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {parentOff ? `يعمل فقط عند تفعيل «${toggle.dependsOnLabelAr}»` : enabled ? toggle.descAr : toggle.hiddenNoteAr}
                        </p>
                      )}
                    </div>
                    <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${enabled ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground"}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="h-2" />
    </div>
  );
}

/* ── Sub-pages inside the page ───────────────────────────────────────────── */

type TabId = "overview" | "home" | "dresses" | "clothes" | "shoes" | "sales" | "support";

const TABS: { id: TabId; labelAr: string; labelEn: string; icon: any; hintAr: string }[] = [
  { id: "overview", labelAr: "الرئيسية", labelEn: "Overview", icon: LayoutDashboard, hintAr: "كل المفاتيح والإعدادات المهمة في مكان واحد" },
  { id: "home", labelAr: "الصفحة الرئيسية", labelEn: "Home", icon: House, hintAr: "البانر، الأكثر مبيعاً، العناوين وشبكة التحرير" },
  { id: "dresses", labelAr: "الفساتين", labelEn: "Dresses", icon: Shirt, hintAr: "صورة وعنوان صفحة الفساتين" },
  { id: "clothes", labelAr: "الملابس", labelEn: "Clothes", icon: Shirt, hintAr: "صورة وعنوان صفحة الملابس" },
  { id: "shoes", labelAr: "الأحذية", labelEn: "Shoes", icon: Footprints, hintAr: "صورة وعنوان صفحة الأحذية" },
  { id: "sales", labelAr: "التخفيضات", labelEn: "Sales", icon: BadgePercent, hintAr: "صورة وعنوان صفحة التخفيضات" },
  { id: "support", labelAr: "الأسئلة والدعم", labelEn: "Q&A & Support", icon: CircleHelp, hintAr: "الأسئلة الشائعة، الشحن والإرجاع، التواصل والموقع" },
];

/** Which sub-page a saved setting belongs to (for the "unsaved changes" dots). */
function tabForKey(key: string): string {
  if (key.startsWith("dresses_")) return "dresses";
  if (key.startsWith("clothes_")) return "clothes";
  if (key.startsWith("shoes_")) return "shoes";
  if (key.startsWith("sales_")) return "sales";
  // Page settings of a category the admin added: "<slug>_hero_…" lives on that category's own tab.
  const hero = key.match(/^(.+)_hero_(image|video|subtitle|title|tag)/);
  if (hero && hero[1] !== "home") return `cat:${hero[1]}`;
  if (key === "shipping_zones") return "overview";
  if (/^(faq_|shipping_details|returns_details|shipping_note|contact_|location_)/.test(key)) return "support";
  if (/(_enabled$|^news_bar|^seasonal_|^exchange_)/.test(key)) return "overview";
  return "home";
}

/** Everything searchable, with the sub-page it lives on. */
const SEARCH_INDEX: { id: string; tab: TabId; labelAr: string; labelEn: string; extra?: string }[] = [
  { id: "seasonal", tab: "overview", labelAr: "المواسم والأعياد", labelEn: "Seasonal themes", extra: "christmas eid fitr adha كريسماس عيد الفطر الأضحى ثلج هلال فانوس" },
  { id: "newsbar", tab: "overview", labelAr: "شريط الأخبار", labelEn: "News bar announcement", extra: "إعلان شريط" },
  { id: "shipping", tab: "overview", labelAr: "مناطق التوصيل والأسعار", labelEn: "Shipping zones", extra: "شحن توصيل سعر الضفة القدس الداخل" },
  { id: "bestsellers", tab: "home", labelAr: "الأكثر مبيعاً", labelEn: "Best sellers" },
  { id: "headings", tab: "home", labelAr: "عناوين الأقسام", labelEn: "Section headings" },
  { id: "editorial", tab: "home", labelAr: "شبكة التحرير", labelEn: "Editorial grid" },
  { id: "pills", tab: "home", labelAr: "أزرار الأقسام تحت السلايدر", labelEn: "Home category buttons", extra: "pills أقسام فئات تصنيف فرعي صورة أزرار" },
  { id: "homebanners", tab: "home", labelAr: "بانرات العناوين المتحركة", labelEn: "Home animated heading banners", extra: "banner بانر شريط وصل حديثا الأكثر مبيعا نص متحرك new arrivals best sellers" },
  { id: "catstrips", tab: "home", labelAr: "بانرات الفئات في الصفحة الرئيسية", labelEn: "Home category strip banners", extra: "banner بانر شريط فئة فئات صورة category" },
  { id: "menuphotos", tab: "home", labelAr: "صور قائمة الهاتف", labelEn: "Phone menu photos", extra: "menu mobile قائمة هاتف موبايل صور فئات" },
  { id: "promo", tab: "home", labelAr: "سلايدر الصور", labelEn: "Home photo slider", extra: "slider سلايدر صور شرائح" },
  { id: "page-home", tab: "home", labelAr: "بانر الصفحة الرئيسية", labelEn: "Home hero banner", extra: "صورة فيديو عنوان" },
  { id: "page-dresses", tab: "dresses", labelAr: "صفحة الفساتين", labelEn: "Dresses page" },
  { id: "page-clothes", tab: "clothes", labelAr: "صفحة الملابس", labelEn: "Clothes page" },
  { id: "page-shoes", tab: "shoes", labelAr: "صفحة الأحذية", labelEn: "Shoes page", extra: "شوزات" },
  { id: "page-sales", tab: "sales", labelAr: "صفحة التخفيضات", labelEn: "Sales page", extra: "عروض" },
  { id: "support", tab: "support", labelAr: "الأسئلة الشائعة وصفحات الدعم", labelEn: "FAQ support shipping returns contact location QA", extra: "اتصل موقع شحن إرجاع الأسئلة" },
];

function sectionMatches(q: string, labelAr: string, labelEn: string) {
  const query = q.toLowerCase().trim();
  if (!query) return true;
  return labelAr.includes(query) || labelEn.toLowerCase().includes(query);
}

function SiteContentSummary({ values }: { values: Record<string, string> }) {
  const on = QUICK_TOGGLES.filter((t) => isToggleOn(t, values)).length;
  const season = getActiveTheme(values);
  // Store pickup only shows to customers while card payment is on too, so say so instead of a misleading green "on".
  function pickupChip(v: Record<string, string>): { label: string; value: string; tone: "good" | "muted" | "warn" } {
    const pickupOn = v["online_pickup_enabled"] !== "false";
    const cardOn = v["card_payment_enabled"] !== "false";
    return { label: "الاستلام من المتجر", value: !pickupOn ? "معطّل" : cardOn ? "مفعّل" : "مفعّل · لا يظهر", tone: pickupOn && cardOn ? "good" : "warn" };
  }
  const chips: { label: string; value: string; tone: "good" | "muted" | "warn" }[] = [
    { label: "المفاتيح المفعّلة", value: `${on} / ${QUICK_TOGGLES.length}`, tone: "good" },
    { label: "الموسم", value: season ? SEASONS[season].nameAr : "لا يوجد", tone: season ? "good" : "muted" },
    { label: "الطلب كضيف", value: values["guest_checkout_enabled"] !== "false" ? "مفعّل" : "معطّل", tone: values["guest_checkout_enabled"] !== "false" ? "good" : "warn" },
    pickupChip(values),
  ];
  const tone = { good: "text-emerald-700 bg-emerald-50 border-emerald-200", muted: "text-muted-foreground bg-muted/50 border-border", warn: "text-amber-800 bg-amber-50 border-amber-200" };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" data-testid="site-summary">
      {chips.map((c) => (
        <div key={c.label} className={`rounded-xl border px-3.5 py-2.5 text-right ${tone[c.tone]}`}>
          <p className="text-[11px] opacity-80">{c.label}</p>
          <p className="text-sm font-bold">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function SiteContent() {
  const { toast } = useToast();
  const { data: saved, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/site-settings"],
  });

  const [tab, setTab] = useState<string>("overview");
  // Categories the admin added get their own page tab, exactly like dresses / clothes / shoes.
  const { data: allCategories = [] } = useQuery<any[]>({ queryKey: ["/api/categories"] });
  const extraCategories = allCategories.filter(
    (c: any) => c && c.slug && !["dresses", "clothes", "shoes"].includes(c.slug),
  );
  const extraTabs = extraCategories.map((c: any) => ({
    id: `cat:${c.slug}`,
    labelAr: c.nameAr || c.name,
    labelEn: c.name,
    icon: Shirt,
    hintAr: `صورة وعنوان صفحة ${c.nameAr || c.name}`,
  }));
  const salesAt = TABS.findIndex((t) => t.id === "sales");
  const allTabs: { id: string; labelAr: string; labelEn: string; icon: any; hintAr: string }[] = [
    ...TABS.slice(0, salesAt),
    ...extraTabs,
    ...TABS.slice(salesAt),
  ];
  const [search, setSearch] = useState("");
  const [toggleStatus, setToggleStatus] = useState<StatusFilter>("all");
  const [local, setLocal] = useState<Record<string, string>>({});

  const merged: Record<string, string> = { ...defaultSettings, ...saved, ...local };

  const handleChange = (key: string, value: string) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/site-settings/bulk", local);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-settings"] });
      setLocal({});
      toast({ title: "تم الحفظ بنجاح ✓" });
    },
    onError: () => {
      toast({ title: "فشل الحفظ", variant: "destructive" });
    },
  });

  const hasChanges = Object.keys(local).length > 0;
  const changedByTab = Object.keys(local).reduce<Record<string, number>>((acc, k) => {
    const t = tabForKey(k);
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const q = search.trim();
  const searching = q.length > 0;
  const hits = searching ? SEARCH_INDEX.filter((e) => sectionMatches(q, e.labelAr, `${e.labelEn} ${e.extra ?? ""}`)) : [];
  const toggleHits = searching ? QUICK_TOGGLES.filter((t) => `${t.titleAr} ${t.titleEn} ${t.descAr}`.toLowerCase().includes(q.toLowerCase())) : [];
  const tabLabel = (id: string) => allTabs.find((t) => t.id === id)?.labelAr ?? id;

  const pageSection = (id: string): PageSection | undefined => {
    const fixed = PAGE_SECTIONS.find((s) => s.id === id);
    if (fixed) return fixed;
    const c = extraCategories.find((x: any) => x.slug === id);
    if (!c) return undefined;
    return {
      id: c.slug,
      labelAr: `صفحة ${c.nameAr || c.name}`,
      labelEn: `${c.name} Page`,
      hasTitle: false,
      hasTag: false,
      keys: ["image", "image_position", "video", "video_position", "subtitle_ar", "subtitle_en"].map((k) => `${c.slug}_hero_${k}`),
    };
  };
  const renderCard = (id: string) => {
    switch (id) {
      case "seasonal": return <SeasonalThemeCard values={merged} onChange={handleChange} />;
      case "newsbar": return <NewsBarCard values={merged} onChange={handleChange} />;
      case "shipping": return <ShippingZonesCard values={merged} onChange={handleChange} />;
      case "bestsellers": return <BestSellersCard values={merged} onChange={handleChange} />;
      case "headings": return <SectionHeadingsCard values={merged} onChange={handleChange} />;
      case "editorial": return <EditorialGridCard values={merged} onChange={handleChange} />;
      case "pills": return <HomePillsCard values={merged} onChange={handleChange} />;
      case "homebanners": return <HomeBannersCard values={merged} onChange={handleChange} />;
      case "catstrips": return <CategoryStripBannersCard values={merged} onChange={handleChange} />;
      case "menuphotos": return <MenuPhotosCard values={merged} onChange={handleChange} />;
      case "promo": return <PromoSliderCard values={merged} onChange={handleChange} />;
      case "support": return <SupportPagesCard values={merged} onChange={handleChange} />;
      default: {
        if (id.startsWith("page-")) {
          const s = pageSection(id.slice(5));
          return s ? <SectionCard section={s} values={merged} onChange={handleChange} /> : null;
        }
        return null;
      }
    }
  };
  const cardsForTab: Record<string, string[]> = {
    ...Object.fromEntries(extraCategories.map((c: any) => [`cat:${c.slug}`, [`page-${c.slug}`]])),
    overview: [],
    home: ["page-home", "pills", "bestsellers", "headings", "editorial", "promo", "homebanners", "catstrips", "menuphotos"],
    dresses: ["page-dresses"],
    clothes: ["page-clothes"],
    shoes: ["page-shoes"],
    sales: ["page-sales"],
    support: ["support"],
  };

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto">
        <AdminPageHeader
          title="محتوى الصفحات"
          description="كل الإعدادات المهمة في «الرئيسية» والباقي في صفحات فرعية — اضغطي على أي صفحة للتعديل"
          icon={ImageIcon}
          iconGradient="from-cyan-500 to-blue-600"
          actions={
            <Button onClick={() => saveMutation.mutate()} disabled={!hasChanges || saveMutation.isPending} className="gap-2" data-testid="button-save-settings">
              {saveMutation.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ التغييرات
            </Button>
          }
        />

        {hasChanges && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm text-right flex items-center justify-between gap-3" data-testid="banner-unsaved">
            <Button size="sm" variant="ghost" className="text-amber-700 dark:text-amber-400 h-7 px-2 text-xs" onClick={() => setLocal({})}>تراجع</Button>
            <span>لديك {Object.keys(local).length} تغيير غير محفوظ</span>
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <span className="absolute inset-y-0 end-3 flex items-center pointer-events-none text-muted-foreground"><Search className="w-4 h-4" /></span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث عن مفتاح أو صفحة… (مثل: ضيف، شحن، الأحذية، عيد)"
            className="w-full border border-border rounded-xl bg-background px-4 pe-10 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
            data-testid="input-section-search"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute inset-y-0 start-3 flex items-center text-muted-foreground hover:text-foreground transition-colors" data-testid="button-clear-section-search">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sub-page navigation */}
        {!searching && (
          <nav className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="صفحات الإعدادات" data-testid="admin-tabs">
            {allTabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              const dots = changedByTab[t.id] || 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`relative inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                    active ? "bg-foreground text-background border-foreground shadow-sm" : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                  }`}
                  data-testid={`tab-${t.id}`}
                >
                  <Icon className="w-4 h-4" />
                  {t.labelAr}
                  {dots > 0 && (
                    <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center px-1" data-testid={`dot-${t.id}`}>{dots}</span>
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : searching ? (
          /* ── Search results across every sub-page ── */
          <div className="space-y-3" data-testid="search-results">
            <p className="text-xs text-muted-foreground text-right">{hits.length + (toggleHits.length ? 1 : 0)} نتيجة لـ «{q}»</p>
            {toggleHits.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-bold text-muted-foreground text-right">في «الرئيسية» · المفاتيح</p>
                <QuickTogglesCard values={merged} onChange={handleChange} query={q} status="all" onStatus={() => {}} />
              </div>
            )}
            {hits.map((h) => (
              <div key={h.id}>
                <div className="mb-1.5 flex items-center justify-between">
                  <button type="button" onClick={() => { setSearch(""); setTab(h.tab); }} className="text-[11px] font-semibold text-primary underline underline-offset-2" data-testid={`goto-${h.id}`}>
                    افتحي الصفحة ←
                  </button>
                  <p className="text-[11px] font-bold text-muted-foreground">في «{tabLabel(h.tab)}»</p>
                </div>
                {renderCard(h.id)}
              </div>
            ))}
            {hits.length === 0 && toggleHits.length === 0 && (
              <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-no-sections-found">لا توجد نتائج مطابقة · No results</div>
            )}
          </div>
        ) : tab === "overview" ? (
          <div className="space-y-4" data-testid="page-overview">
            <SiteContentSummary values={merged} />
            <QuickTogglesCard values={merged} onChange={handleChange} query="" status={toggleStatus} onStatus={setToggleStatus} />
            {renderCard("seasonal")}
            {renderCard("newsbar")}
            {renderCard("shipping")}
          </div>
        ) : (
          <div className="space-y-4" data-testid={`page-${tab}`}>
            <p className="text-xs text-muted-foreground text-right">{allTabs.find((t) => t.id === tab)?.hintAr}</p>
            {(cardsForTab[tab] || []).map((id) => <div key={id}>{renderCard(id)}</div>)}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
