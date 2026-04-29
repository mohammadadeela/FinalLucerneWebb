import { useParams } from "wouter";
import { useCategories } from "@/hooks/use-categories";
import CategoryPage from "@/pages/CategoryPage";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useLanguage } from "@/i18n";
import { Footprints, ShoppingBag, Gem, Shirt } from "lucide-react";

export default function DynamicCategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: categories, isLoading } = useCategories();
  const { language } = useLanguage();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-foreground/20 border-t-foreground animate-spin" />
        </div>
        <Footer />
      </div>
    );
  }

  const category = categories?.find(c => c.slug === slug);

  if (!category) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>{language === "ar" ? "الفئة غير موجودة" : "Category not found"}</p>
        </div>
        <Footer />
      </div>
    );
  }

  const title = language === "ar" ? (category.nameAr || category.name) : category.name;

  const isShoeCategory =
    /shoe|shoes/i.test(category.name) ||
    /shoe|shoes/i.test(category.slug || "") ||
    /شوز|أحذية|حذاء/i.test(category.nameAr || "");

  const isBagCategory =
    /bag|bags|purse|handbag/i.test(category.name) ||
    /bag|bags|purse|handbag/i.test(category.slug || "") ||
    /حقيبة|شنطة|حقائب/i.test(category.nameAr || "");

  const isAccessoryCategory =
    /access|jewel|gem|watch|jewelry/i.test(category.name) ||
    /اكسس|مجوهرات|ساعة|إكسسوار/i.test(category.nameAr || "");

  const categoryIcon = isShoeCategory
    ? Footprints
    : isBagCategory
    ? ShoppingBag
    : isAccessoryCategory
    ? Gem
    : Shirt;

  return (
    <CategoryPage
      title={title}
      subtitle=""
      categoryIds={[category.id]}
      heroImage={category.image || ""}
      icon={categoryIcon}
      defaultSizes={isShoeCategory ? ["36", "37", "38", "39", "40", "41", "42"] : undefined}
    />
  );
}
