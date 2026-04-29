import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Save, Upload, Image, ChevronDown, ChevronUp, Move, Megaphone, Eye, EyeOff, Languages, Type, Truck, Plus, Trash2, CreditCard, Video, X, Search, Gift, ImageIcon, Repeat } from "lucide-react";
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

function ImageUploadField({
  value,
  position,
  onChangeImage,
  onChangePosition,
}: {
  value: string;
  position: string;
  onChangeImage: (url: string) => void;
  onChangePosition: (pos: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [showCropper, setShowCropper] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cropperRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("images", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.urls?.[0]) onChangeImage(data.urls[0]);
    } catch {
      toast({ title: "فشل رفع الصورة", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
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
          <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
            <div className="relative w-full h-40 overflow-hidden">
              <img
                src={value}
                alt="hero preview"
                className="w-full h-full object-cover"
                style={{ objectPosition: normalizedPos }}
              />
              <div className="absolute inset-0 bg-black/20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-white text-xs font-medium bg-black/40 px-2 py-1 rounded">معاينة كبانر</p>
              </div>
            </div>
          </div>

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
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
    </div>
  );
}

function VideoUploadField({
  value,
  onChange,
  position,
  onChangePosition,
}: {
  value: string;
  onChange: (url: string) => void;
  position?: string;
  onChangePosition?: (pos: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
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
          <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30">
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
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-white text-xs font-medium bg-black/40 px-2 py-1 rounded flex items-center gap-1">
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
  const [open, setOpen] = useState(section.id === "home");
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SimpleImageUpload({ value, onChange, label }: { value: string; onChange: (url: string) => void; label?: string }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("images", file);
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
    <div className="space-y-2">
      {label && <p className="text-xs text-muted-foreground font-medium">{label}</p>}
      <div className="relative rounded-lg overflow-hidden border border-border bg-muted/30 aspect-square">
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
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
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
  const categories = allCategories || [];

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

          {/* Center image */}
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
            />
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
                return (
                  <div key={n} className="space-y-2 border border-border rounded-lg p-3">
                    <p className="text-xs font-semibold text-muted-foreground">الخانة {posLabel}</p>
                    {/* Category selector */}
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">الفئة</p>
                      <select
                        value={selectedCatId}
                        onChange={(e) => onChange(`editorial_tile_${n}_category_id`, e.target.value)}
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
                    {/* Custom image override */}
                    <SimpleImageUpload
                      value={values[`editorial_tile_${n}_image`] ?? ""}
                      onChange={(url) => onChange(`editorial_tile_${n}_image`, url)}
                      label="صورة مخصصة (اختياري — تتجاوز صورة الفئة)"
                    />
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

function CardPaymentCard({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const enabled = values["card_payment_enabled"] !== "false";

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-card-payment">
      <div className={`w-full flex items-center justify-between px-5 py-4 transition-colors ${
        enabled
          ? "bg-foreground/[0.04] dark:bg-foreground/10"
          : "bg-muted/30"
      }`}>
        <div className="flex items-center gap-2.5">
          {enabled ? (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              مفعّل
            </span>
          ) : (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              معطّل
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold text-sm">الدفع بالبطاقة</p>
            <p className="text-xs text-muted-foreground">Card Payment at Checkout</p>
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            enabled ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground"
          }`}>
            <CreditCard className="w-4 h-4" />
          </div>
        </div>
      </div>
      <div className="bg-background px-5 py-4 border-t border-border/50">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onChange("card_payment_enabled", enabled ? "false" : "true")}
            className={`relative w-12 h-[26px] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              enabled ? "bg-foreground" : "bg-muted-foreground/25"
            }`}
            data-testid="checkbox-card-payment-enabled"
          >
            <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-background shadow-sm transition-transform duration-200 ${
              enabled ? "left-[3px] translate-x-[22px]" : "left-[3px] translate-x-0"
            }`} />
          </button>
          <Label
            className="text-sm font-medium cursor-pointer select-none"
            onClick={() => onChange("card_payment_enabled", enabled ? "false" : "true")}
          >
            السماح بالدفع عبر البطاقة في صفحة الدفع
          </Label>
        </div>
        {!enabled && (
          <p className="text-xs text-amber-600 dark:text-amber-400 text-right mt-3 flex items-center justify-end gap-1.5">
            سيُخفى خيار الدفع بالبطاقة من صفحة الدفع للعملاء
            <CreditCard className="w-3.5 h-3.5" />
          </p>
        )}
      </div>
    </div>
  );
}

function LoyaltyPointsCard({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const enabled = values["loyalty_points_enabled"] !== "false";

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-loyalty-points">
      <div className={`w-full flex items-center justify-between px-5 py-4 transition-colors ${
        enabled
          ? "bg-foreground/[0.04] dark:bg-foreground/10"
          : "bg-muted/30"
      }`}>
        <div className="flex items-center gap-2.5">
          {enabled ? (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              مفعّل
            </span>
          ) : (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              معطّل
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold text-sm">نقاطي والرصيد</p>
            <p className="text-xs text-muted-foreground">Loyalty Points & Credit at Checkout</p>
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            enabled ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground"
          }`}>
            <Gift className="w-4 h-4" />
          </div>
        </div>
      </div>
      <div className="bg-background px-5 py-4 border-t border-border/50">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onChange("loyalty_points_enabled", enabled ? "false" : "true")}
            className={`relative w-12 h-[26px] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              enabled ? "bg-foreground" : "bg-muted-foreground/25"
            }`}
            data-testid="checkbox-loyalty-points-enabled"
          >
            <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-background shadow-sm transition-transform duration-200 ${
              enabled ? "left-[3px] translate-x-[22px]" : "left-[3px] translate-x-0"
            }`} />
          </button>
          <Label
            className="text-sm font-medium cursor-pointer select-none"
            onClick={() => onChange("loyalty_points_enabled", enabled ? "false" : "true")}
          >
            السماح باستخدام رصيد الولاء وعرض النقاط في صفحة الدفع
          </Label>
        </div>
        {!enabled && (
          <p className="text-xs text-amber-600 dark:text-amber-400 text-right mt-3 flex items-center justify-end gap-1.5">
            سيُخفى رصيد الولاء وشارة النقاط من صفحتي السلة والدفع
            <Gift className="w-3.5 h-3.5" />
          </p>
        )}
      </div>
    </div>
  );
}

function ExchangesEnabledCard({
  values,
  onChange,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const enabled = values["exchanges_enabled"] !== "false";

  return (
    <div className="border border-border rounded-xl overflow-hidden shadow-sm" data-testid="section-exchanges-enabled">
      <div className={`w-full flex items-center justify-between px-5 py-4 transition-colors ${
        enabled ? "bg-foreground/[0.04] dark:bg-foreground/10" : "bg-muted/30"
      }`}>
        <div className="flex items-center gap-2.5">
          {enabled ? (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              مفعّل
            </span>
          ) : (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
              معطّل
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold text-sm">طلبات الاستبدال</p>
            <p className="text-xs text-muted-foreground">Exchange Requests on Profile Page</p>
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            enabled ? "bg-foreground text-background" : "bg-muted/60 text-muted-foreground"
          }`}>
            <Repeat className="w-4 h-4" />
          </div>
        </div>
      </div>
      <div className="bg-background px-5 py-4 border-t border-border/50">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onChange("exchanges_enabled", enabled ? "false" : "true")}
            className={`relative w-12 h-[26px] rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              enabled ? "bg-foreground" : "bg-muted-foreground/25"
            }`}
            data-testid="checkbox-exchanges-enabled"
          >
            <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-background shadow-sm transition-transform duration-200 ${
              enabled ? "left-[3px] translate-x-[22px]" : "left-[3px] translate-x-0"
            }`} />
          </button>
          <Label
            className="text-sm font-medium cursor-pointer select-none"
            onClick={() => onChange("exchanges_enabled", enabled ? "false" : "true")}
          >
            السماح للعميلات بطلب استبدال المنتجات (خلال 3 أيام من الاستلام، باستثناء الفساتين)
          </Label>
        </div>
        {!enabled && (
          <p className="text-xs text-amber-600 dark:text-amber-400 text-right mt-3 flex items-center justify-end gap-1.5">
            سيُخفى زر "طلب استبدال" من صفحة الحساب
            <Repeat className="w-3.5 h-3.5" />
          </p>
        )}
      </div>
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
                <p className="text-[11px] text-muted-foreground text-right">افصلي العناصر بـ | لعرضها مع فاصل ✦</p>
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
                <p className="text-[11px] text-muted-foreground text-right">Separate items with | to display them with ✦ dividers</p>
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
                <div className="bg-foreground text-background overflow-hidden">
                  <div className="news-preview-track flex items-center whitespace-nowrap py-2.5" dir="ltr">
                    {[0, 1, 2, 3].map(rep => {
                      const previewText = values["news_bar_text_ar"] || values["news_bar_text_en"] || "";
                      const previewItems = previewText.split("|").map((s: string) => s.trim()).filter(Boolean);
                      return previewItems.map((item: string, i: number) => (
                        <span key={`${rep}-${i}`} className="inline-flex items-center gap-6 px-4">
                          <span className="text-xs font-light tracking-[0.25em] uppercase text-background/80">{item}</span>
                          <span className="text-background/30 text-[8px]">✦</span>
                        </span>
                      ));
                    })}
                  </div>
                </div>
                {hasArText && hasEnText && (
                  <div className="bg-muted/30 px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/30">
                    <span dir="ltr" className="truncate max-w-[45%]">EN: {values["news_bar_text_en"]}</span>
                    <span dir="rtl" className="truncate max-w-[45%]">ع: {values["news_bar_text_ar"]}</span>
                  </div>
                )}
              </div>
              <style>{`
                .news-preview-track { animation: news-preview-scroll 15s linear infinite; }
                @keyframes news-preview-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
              `}</style>
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

const STATIC_CARDS = [
  { id: "support", labelAr: "صفحات الدعم", labelEn: "Support Pages" },
  { id: "shipping", labelAr: "مناطق الشحن", labelEn: "Shipping Zones" },
  { id: "payment", labelAr: "الدفع بالبطاقة", labelEn: "Card Payment" },
  { id: "loyalty", labelAr: "نقاطي", labelEn: "Loyalty Points" },
  { id: "exchanges", labelAr: "طلبات الاستبدال", labelEn: "Exchange Requests" },
  { id: "newsbar", labelAr: "شريط الأخبار", labelEn: "News Bar" },
  { id: "bestsellers", labelAr: "الأكثر مبيعاً", labelEn: "Best Sellers" },
  { id: "headings", labelAr: "عناوين الأقسام", labelEn: "Section Headings" },
  { id: "editorial", labelAr: "شبكة التحرير", labelEn: "Editorial Grid" },
];

function sectionMatches(q: string, labelAr: string, labelEn: string) {
  const query = q.toLowerCase().trim();
  if (!query) return true;
  return labelAr.includes(query) || labelEn.toLowerCase().includes(query);
}

export default function SiteContent() {
  const { toast } = useToast();
  const { data: saved, isLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/site-settings"],
  });

  const [sectionSearch, setSectionSearch] = useState("");
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

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto">
        <AdminPageHeader
          title="محتوى الصفحات"
          description="تخصيص صور وعناوين الأقسام البارزة في الموقع"
          icon={ImageIcon}
          iconGradient="from-cyan-500 to-blue-600"
          actions={
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!hasChanges || saveMutation.isPending}
              className="gap-2"
              data-testid="button-save-settings"
            >
              {saveMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              حفظ التغييرات
            </Button>
          }
        />

        {hasChanges && (
          <div className="mb-4 px-4 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm text-right flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-amber-700 dark:text-amber-400 h-7 px-2 text-xs"
              onClick={() => setLocal({})}
            >
              تراجع
            </Button>
            <span>لديك تغييرات غير محفوظة</span>
          </div>
        )}

        {/* Search bar */}
        <div className="relative mb-5">
          <span className="absolute inset-y-0 end-3 flex items-center pointer-events-none text-muted-foreground">
            <Search className="w-4 h-4" />
          </span>
          <input
            type="text"
            value={sectionSearch}
            onChange={(e) => setSectionSearch(e.target.value)}
            placeholder="ابحث عن قسم... / Search section..."
            className="w-full border border-border rounded-lg bg-background px-4 pe-10 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60"
            data-testid="input-section-search"
          />
          {sectionSearch && (
            <button
              type="button"
              onClick={() => setSectionSearch("")}
              className="absolute inset-y-0 start-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
              data-testid="button-clear-section-search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {sectionMatches(sectionSearch, STATIC_CARDS[0].labelAr, STATIC_CARDS[0].labelEn) && (
              <SupportPagesCard values={merged} onChange={handleChange} />
            )}
            {sectionMatches(sectionSearch, STATIC_CARDS[1].labelAr, STATIC_CARDS[1].labelEn) && (
              <ShippingZonesCard values={merged} onChange={handleChange} />
            )}
            {sectionMatches(sectionSearch, STATIC_CARDS[2].labelAr, STATIC_CARDS[2].labelEn) && (
              <CardPaymentCard values={merged} onChange={handleChange} />
            )}
            {sectionMatches(sectionSearch, STATIC_CARDS[3].labelAr, STATIC_CARDS[3].labelEn) && (
              <LoyaltyPointsCard values={merged} onChange={handleChange} />
            )}
            {sectionMatches(sectionSearch, STATIC_CARDS[4].labelAr, STATIC_CARDS[4].labelEn) && (
              <ExchangesEnabledCard values={merged} onChange={handleChange} />
            )}
            {sectionMatches(sectionSearch, STATIC_CARDS[5].labelAr, STATIC_CARDS[5].labelEn) && (
              <NewsBarCard values={merged} onChange={handleChange} />
            )}
            {sectionMatches(sectionSearch, STATIC_CARDS[6].labelAr, STATIC_CARDS[6].labelEn) && (
              <BestSellersCard values={merged} onChange={handleChange} />
            )}
            {sectionMatches(sectionSearch, STATIC_CARDS[7].labelAr, STATIC_CARDS[7].labelEn) && (
              <SectionHeadingsCard values={merged} onChange={handleChange} />
            )}
            {sectionMatches(sectionSearch, STATIC_CARDS[8].labelAr, STATIC_CARDS[8].labelEn) && (
              <EditorialGridCard values={merged} onChange={handleChange} />
            )}
            {PAGE_SECTIONS.filter((s) =>
              sectionMatches(sectionSearch, s.labelAr, s.labelEn)
            ).map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                values={merged}
                onChange={handleChange}
              />
            ))}
            {sectionSearch.trim() &&
              !STATIC_CARDS.some((c) => sectionMatches(sectionSearch, c.labelAr, c.labelEn)) &&
              !PAGE_SECTIONS.some((s) => sectionMatches(sectionSearch, s.labelAr, s.labelEn)) && (
              <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-no-sections-found">
                لا توجد أقسام مطابقة · No sections found
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
