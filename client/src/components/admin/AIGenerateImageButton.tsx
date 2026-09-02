import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface AIGenerateImageButtonProps {
  /** Builds the text prompt at click time (so it always reflects the latest
   *  name/category the admin has typed in, without needing to re-render). */
  getPrompt: () => string;
  /** Called with the generated (already-uploaded) image URL. */
  onGenerated: (url: string) => void;
  aspect?: "square" | "portrait" | "landscape";
  size?: "sm" | "default";
  /** Extra classes, e.g. to make it full-width to match a neighboring button. */
  className?: string;
  disabled?: boolean;
}

/**
 * "Generate with AI" button for admin image fields. The admin types a name /
 * category / description first (that's what getPrompt() reads), then clicks
 * to generate — same button shape everywhere: hero banners, category tiles,
 * subcategory thumbnails, category circle images.
 */
export default function AIGenerateImageButton({
  getPrompt,
  onGenerated,
  aspect = "landscape",
  size = "sm",
  className = "",
  disabled = false,
}: AIGenerateImageButtonProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleClick = async () => {
    const prompt = getPrompt().trim();
    if (!prompt) {
      toast({
        title: "اكتبي اسم أو وصف أولاً",
        description: "أدخلي اسم الفئة أو التصنيف قبل التوليد بالذكاء الاصطناعي",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ai-generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, aspect }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.noKey
            ? "ميزة الذكاء الاصطناعي غير مفعّلة على السيرفر (مفتاح API غير موجود)"
            : data?.message || "فشل توليد الصورة",
        );
      }
      if (data.url) {
        onGenerated(data.url);
        toast({ title: "تم توليد الصورة بنجاح" });
      } else {
        throw new Error("لم يتم إرجاع رابط الصورة");
      }
    } catch (err: any) {
      toast({
        title: "فشل التوليد",
        description: err?.message || "حاولي مرة أخرى",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={handleClick}
      disabled={disabled || loading}
      className={`shrink-0 gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary ${className}`}
      title="توليد صورة بالذكاء الاصطناعي"
      data-testid="button-ai-generate-image"
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <Sparkles className="w-4 h-4" />
      )}
      <span className="text-xs font-medium whitespace-nowrap">
        {loading ? "جارِ التوليد..." : "توليد بالذكاء الاصطناعي"}
      </span>
    </Button>
  );
}
