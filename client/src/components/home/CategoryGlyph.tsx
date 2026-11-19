import { Shirt, ShoppingBag, Gem } from "lucide-react";
import { DressIcon, HeelIcon } from "@/components/layout/Navbar";

/**
 * A simple line icon for a category, picked from its name / slug, so new
 * categories the admin adds get a fitting icon automatically.
 */
export function CategoryGlyph({
  category,
  className,
}: {
  category: { slug?: string | null; name?: string | null; nameAr?: string | null } | null | undefined;
  className?: string;
}) {
  const key = `${category?.slug || ""} ${category?.name || ""} ${category?.nameAr || ""}`.toLowerCase();
  if (/shoe|heel|sandal|boot|حذاء|أحذية|احذية|شوز|كعب|صندل/.test(key)) return <HeelIcon className={className} />;
  if (/dress|abaya|gown|فستان|فساتين|عباي/.test(key)) return <DressIcon className={className} />;
  if (/bag|purse|clutch|حقيب|حقائب|شنط/.test(key)) return <ShoppingBag className={className} strokeWidth={1.2} />;
  if (/belt|accessor|jewel|scarf|أقشط|اقشط|قشاط|حزام|إكسسوار|اكسسوار|مجوهرات/.test(key)) return <Gem className={className} strokeWidth={1.2} />;
  return <Shirt className={className} strokeWidth={1.2} />;
}
