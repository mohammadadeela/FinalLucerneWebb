import CategoryPage from "./CategoryPage";
import { useLanguage } from "@/i18n";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import { useCategories } from "@/hooks/use-categories";
import { Footprints } from "lucide-react";

export default function ShoesPage() {
  const { t, language } = useLanguage();
  const { data: siteSettings } = useSiteSettings();
  const { data: categories } = useCategories();

  const category = categories?.find(c => c.slug === "shoes");

  const heroImage = getSetting(siteSettings, "shoes_hero_image");
  const heroImagePosition = getSetting(siteSettings, "shoes_hero_image_position") || "center";
  const heroVideo = getSetting(siteSettings, "shoes_hero_video");
  const heroVideoPosition = getSetting(siteSettings, "shoes_hero_video_position") || "50% 50%";
  const subtitle = language === "ar"
    ? getSetting(siteSettings, "shoes_hero_subtitle_ar")
    : getSetting(siteSettings, "shoes_hero_subtitle_en");

  if (!category) return null;

  return (
    <CategoryPage
      title={t.nav.shoes}
      subtitle={subtitle}
      categoryIds={[category.id]}
      icon={Footprints}
      heroImage={heroImage}
      heroImagePosition={heroImagePosition}
      heroVideo={heroVideo}
      heroVideoPosition={heroVideoPosition}
      defaultSizes={["36", "37", "38", "39", "40", "41", "42"]}
    />
  );
}
