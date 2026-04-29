import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Button } from "@/components/ui/button";
import { Check, X, ZoomIn, RotateCcw, Sparkles } from "lucide-react";

type PreviewType = "product" | "category" | "general";

interface Config {
  aspect: number;
  circular: boolean;
  label: string;
  labelAr: string;
  hint: string;
  hintAr: string;
}

const CONFIGS: Record<PreviewType, Config> = {
  product: {
    aspect: 3 / 4,
    circular: false,
    label: "Product Photo",
    labelAr: "صورة المنتج",
    hint: "Crop to 3:4 — how it appears on the product card",
    hintAr: "اقتصاص 3:4 — كما تظهر في كارد المنتج",
  },
  category: {
    aspect: 1,
    circular: true,
    label: "Category Photo",
    labelAr: "صورة الفئة",
    hint: "Crop to circle — how it appears on the home page",
    hintAr: "اقتصاص دائري — كما تظهر في الصفحة الرئيسية",
  },
  general: {
    aspect: 1,
    circular: false,
    label: "Photo",
    labelAr: "صورة",
    hint: "Crop your photo",
    hintAr: "اقتصص صورتك",
  },
};

function centerAspectCrop(width: number, height: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 88 }, aspect, width, height),
    width,
    height
  );
}

async function getCroppedBlob(image: HTMLImageElement, crop: PixelCrop, fileName: string): Promise<File> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = Math.round(crop.width * scaleX);
  canvas.height = Math.round(crop.height * scaleY);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    image,
    crop.x * scaleX, crop.y * scaleY,
    crop.width * scaleX, crop.height * scaleY,
    0, 0, canvas.width, canvas.height
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(new File([blob], fileName.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" })) : reject(new Error("Canvas empty")),
      "image/jpeg", 0.93
    );
  });
}

interface Props {
  file: File | null;
  onConfirm: (file: File) => void;
  onCancel: () => void;
  previewType?: PreviewType;
}

export default function ImageCropDialog({ file, onConfirm, onCancel, previewType = "general" }: Props) {
  const config = CONFIGS[previewType];
  const [src, setSrc] = useState("");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [previewUrl, setPreviewUrl] = useState("");
  const [isVideo, setIsVideo] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setIsVideo(file.type.startsWith("video/"));
    setSrc(url);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, config.aspect));
  }, [config.aspect]);

  const handleReset = () => {
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      setCrop(centerAspectCrop(width, height, config.aspect));
    }
  };

  // Live preview update
  useEffect(() => {
    if (!completedCrop || !imgRef.current) return;
    const image = imgRef.current;
    const canvas = document.createElement("canvas");
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      image,
      completedCrop.x * scaleX, completedCrop.y * scaleY,
      completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0, canvas.width, canvas.height
    );
    setPreviewUrl(canvas.toDataURL("image/jpeg", 0.85));
  }, [completedCrop]);

  const handleConfirm = async () => {
    if (isVideo || !completedCrop || !imgRef.current) {
      onConfirm(file!);
      return;
    }
    const cropped = await getCroppedBlob(imgRef.current, completedCrop, file!.name);
    onConfirm(cropped);
  };

  if (!file) return null;

  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent
        className="w-[calc(100%-1.5rem)] max-w-md p-0 overflow-hidden border-0 shadow-2xl rounded-2xl"
        data-testid="dialog-image-crop"
      >
        <VisuallyHidden><DialogTitle>Image Crop</DialogTitle></VisuallyHidden>
        {/* Header */}
        <div className="relative px-4 pt-4 pb-3 bg-gradient-to-r from-foreground to-foreground/80 text-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-background/15 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="font-semibold text-sm leading-tight">
                  {isVideo ? "Video Preview" : config.label} · {isVideo ? "معاينة الفيديو" : config.labelAr}
                </p>
                {!isVideo && (
                  <p className="text-[11px] text-background/60 leading-tight mt-0.5">
                    {config.hint}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onCancel}
              className="w-7 h-7 rounded-full bg-background/10 hover:bg-background/20 flex items-center justify-center transition-colors"
              data-testid="button-crop-close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col md:flex-row min-h-0 overflow-hidden">

          {/* LEFT — Crop tool */}
          <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden">
            <div className="flex-1 flex items-center justify-center p-3 overflow-hidden">
              {isVideo ? (
                <video
                  src={src}
                  controls
                  className="max-h-40 w-full rounded-xl object-contain"
                  data-testid="video-preview"
                />
              ) : (
                <div className={`flex items-center justify-center transition-all duration-300 ${zoomed ? "scale-150 origin-center" : ""}`}>
                  <ReactCrop
                    crop={crop}
                    onChange={(c) => setCrop(c)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={config.aspect}
                    circularCrop={config.circular}
                    minWidth={20}
                    minHeight={20}
                    className="max-h-40"
                  >
                    <img
                      ref={imgRef}
                      src={src}
                      alt="crop"
                      onLoad={onImageLoad}
                      className="max-h-40 max-w-full object-contain select-none"
                      draggable={false}
                      data-testid="img-crop-source"
                    />
                  </ReactCrop>
                </div>
              )}
            </div>

            {/* Crop toolbar */}
            {!isVideo && (
              <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-white/10">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
                  data-testid="button-reset-crop"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  إعادة · Reset
                </button>
                <span className="w-px h-4 bg-white/20" />
                <button
                  onClick={() => setZoomed((z) => !z)}
                  className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
                  data-testid="button-zoom-crop"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  {zoomed ? "تصغير · Zoom Out" : "تكبير · Zoom In"}
                </button>
                <span className="w-px h-4 bg-white/20" />
                <span className="text-[11px] text-white/30">
                  {config.circular ? "اسحب لاختيار المنطقة الدائرية" : "اسحب لاختيار المنطقة"}
                </span>
              </div>
            )}
          </div>

          {/* RIGHT — Live Preview (side panel on desktop, horizontal strip on mobile) */}
          {!isVideo && (
            <div className="w-full md:w-40 border-t md:border-t-0 md:border-s border-border bg-muted/20 flex flex-col">
              <div className="px-3 pt-2.5 pb-1 shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  كيف ستظهر · Preview
                </p>
              </div>

              {/* MOBILE: horizontal scroll strip */}
              <div className="md:hidden flex flex-row gap-3 overflow-x-auto px-3 pb-3 scrollbar-none">
                {previewType === "product" && (
                  <>
                    <div className="shrink-0 flex flex-col gap-1">
                      <p className="text-[9px] text-muted-foreground">صفحة المنتج</p>
                      <div className="w-20 rounded-lg overflow-hidden border bg-card shadow-sm">
                        <div className="aspect-[3/4] overflow-hidden bg-muted">
                          {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted animate-pulse" />}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col gap-1">
                      <p className="text-[9px] text-muted-foreground">كارد المنتج</p>
                      <div className="w-16 rounded-lg overflow-hidden border bg-card shadow-sm">
                        <div className="aspect-[3/4] overflow-hidden bg-muted">
                          {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted animate-pulse" />}
                        </div>
                        <div className="p-1 space-y-0.5">
                          <div className="h-1.5 bg-muted rounded-full w-4/5" />
                          <div className="h-1 bg-primary/25 rounded-full w-2/5" />
                        </div>
                      </div>
                    </div>
                  </>
                )}
                {previewType === "category" && (
                  <>
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <p className="text-[9px] text-muted-foreground">صغير</p>
                      <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-border bg-muted">
                        {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted animate-pulse rounded-full" />}
                      </div>
                    </div>
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <p className="text-[9px] text-muted-foreground">كبير</p>
                      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-border bg-muted">
                        {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted animate-pulse rounded-full" />}
                      </div>
                    </div>
                  </>
                )}
                {previewType === "general" && (
                  <div className="shrink-0 w-24 rounded-xl overflow-hidden border bg-card">
                    <div className="aspect-square bg-muted">
                      {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted animate-pulse" />}
                    </div>
                  </div>
                )}
              </div>

              {/* DESKTOP: vertical scroll panel */}
              <div className="hidden md:flex flex-col gap-4 overflow-y-auto px-3 pb-3 max-h-[280px]">
                {previewType === "product" && (
                  <>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1.5">صفحة المنتج · Product page</p>
                      <div className="w-full rounded-xl overflow-hidden border bg-card shadow-sm">
                        <div className="aspect-[3/4] overflow-hidden bg-muted">
                          {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted animate-pulse" />}
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1.5">كارد المنتج · Card</p>
                      <div className="w-3/4 rounded-xl overflow-hidden border bg-card shadow-sm">
                        <div className="aspect-[3/4] overflow-hidden bg-muted">
                          {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted animate-pulse" />}
                        </div>
                        <div className="p-1.5 space-y-1">
                          <div className="h-2 bg-muted rounded-full w-4/5" />
                          <div className="h-1.5 bg-primary/25 rounded-full w-2/5" />
                        </div>
                      </div>
                    </div>
                  </>
                )}
                {previewType === "category" && (
                  <>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-2">الصفحة الرئيسية · Home</p>
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border shadow-md bg-muted">
                          {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted animate-pulse rounded-full" />}
                        </div>
                        <div className="h-2 bg-muted rounded-full w-12" />
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-2">حجم أكبر · Larger</p>
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border shadow-md bg-muted">
                          {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted animate-pulse rounded-full" />}
                        </div>
                        <div className="h-2 bg-muted rounded-full w-16" />
                      </div>
                    </div>
                  </>
                )}
                {previewType === "general" && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5">معاينة · Preview</p>
                    <div className="w-full rounded-xl overflow-hidden border bg-card shadow-sm">
                      <div className="aspect-square overflow-hidden bg-muted">
                        {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full bg-muted animate-pulse" />}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t bg-background">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-muted-foreground"
            data-testid="button-crop-cancel"
          >
            <X className="w-4 h-4 me-1.5" />
            إلغاء · Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            className="gap-1.5 px-5"
            data-testid="button-crop-confirm"
          >
            <Check className="w-4 h-4" />
            تأكيد ورفع · Confirm & Upload
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
