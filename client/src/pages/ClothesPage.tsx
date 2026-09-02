import CategoryPage from "./CategoryPage";
import { useLanguage } from "@/i18n";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import { useCategories } from "@/hooks/use-categories";
import { Shirt } from "lucide-react";

export default function ClothesPage() {
  const { t, language } = useLanguage();
  const { data: siteSettings } = useSiteSettings();
  const { data: categories } = useCategories();

  // "ملابس" covers Tops & Blouses + Pants & Skirts (no single "clothes" slug exists)
  const clothesSlugs = ["tops", "pants-skirts", "clothes"];
  const clothesCategories = (categories || []).filter(c => clothesSlugs.includes(c.slug));
  const categoryIds = clothesCategories.map(c => c.id);

  const heroImage = getSetting(siteSettings, "clothes_hero_image");
  const heroImagePosition = getSetting(siteSettings, "clothes_hero_image_position") || "center";
  const heroVideo = getSetting(siteSettings, "clothes_hero_video");
  const heroVideoPosition = getSetting(siteSettings, "clothes_hero_video_position") || "50% 50%";
  const subtitle = language === "ar"
    ? getSetting(siteSettings, "clothes_hero_subtitle_ar")
    : getSetting(siteSettings, "clothes_hero_subtitle_en");

  if (!categories) return null;

  return (
    <CategoryPage
      title={t.nav.clothes}
      subtitle={subtitle}
      categoryIds={categoryIds}
      icon={Shirt}
      heroImage={heroImage}
      heroImagePosition={heroImagePosition}
      heroVideo={heroVideo}
      heroVideoPosition={heroVideoPosition}
    />
  );
}
