import { useState } from "react";
import { Download, Film, Image as ImageIcon, Images, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ProductDownloadChoice = "photos" | "videos" | "both";

/**
 * The download button beside a product: its photos, its videos, or both together.
 * The video choices are switched off when the product has no video.
 */
export function ProductDownloadMenu({
  productId,
  videoCount,
  busy,
  isAr,
  compact,
  onChoose,
}: {
  productId: number;
  videoCount: number;
  busy: boolean;
  isAr: boolean;
  compact?: boolean;
  onChoose: (choice: ProductDownloadChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const tr = (ar: string, en: string) => (isAr ? ar : en);
  const choose = (choice: ProductDownloadChoice) => {
    setOpen(false);
    onChoose(choice);
  };
  const row = "w-full justify-start text-start h-auto py-2.5 whitespace-normal";
  const noVideo = videoCount === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          disabled={busy}
          className={compact ? "text-slate-600 h-8 w-8" : "text-slate-600 hover:text-slate-800 hover:bg-slate-50"}
          title={tr("تحميل صور وفيديوهات المنتج", "Download the product's photos and videos")}
          data-testid={`button-download-product-${compact ? "mobile-" : ""}${productId}`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1.5 space-y-1" dir={isAr ? "rtl" : "ltr"}>
        <Button variant="ghost" type="button" className={row} onClick={() => choose("photos")} data-testid={`download-product-photos-${productId}`}>
          <ImageIcon className="w-4 h-4 shrink-0 me-2" />
          <span className="min-w-0 flex-1">{tr("الصور فقط", "Photos only")}</span>
        </Button>
        <Button variant="ghost" type="button" className={row} disabled={noVideo} onClick={() => choose("videos")} data-testid={`download-product-videos-${productId}`}>
          <Film className="w-4 h-4 shrink-0 me-2" />
          <span className="min-w-0 flex-1">{tr("الفيديوهات فقط", "Videos only")}</span>
          <span className="shrink-0 ms-2 text-xs font-semibold tabular-nums text-muted-foreground">{videoCount}</span>
        </Button>
        <Button variant="ghost" type="button" className={row} disabled={noVideo} onClick={() => choose("both")} data-testid={`download-product-both-${productId}`}>
          <Images className="w-4 h-4 shrink-0 me-2" />
          <span className="min-w-0 flex-1">{tr("الصور والفيديوهات", "Photos and videos")}</span>
        </Button>
        {noVideo && <p className="px-2 pb-1 text-[11px] text-muted-foreground">{tr("هذا المنتج ليس له فيديو بعد.", "This product has no video yet.")}</p>}
      </PopoverContent>
    </Popover>
  );
}
