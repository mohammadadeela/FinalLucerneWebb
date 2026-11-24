import { AutoplayVideo } from "@/components/ui/AutoplayVideo";

interface PageHeroProps {
  image: string;
  imagePosition?: string;
  title: string;
  subtitle?: string;
  titleTestId?: string;
  subtitleTestId?: string;
  video?: string;
  videoPosition?: string;
}

/**
 * Category / sale page banner — the same look as the landing page banner: the page's own
 * photo or video as one wide rounded picture, with the title written on it at the bottom.
 */
export function PageHero({
  image,
  imagePosition = "center",
  title,
  subtitle,
  titleTestId,
  subtitleTestId,
  video,
  videoPosition = "50% 50%",
}: PageHeroProps) {
  return (
    <section className="w-full px-3 pt-navbar sm:px-6 lg:px-10">
      <div className="relative mx-auto mt-3 w-full max-w-[1560px] overflow-hidden rounded-[1.5rem] bg-blush sm:mt-4 sm:rounded-[2rem]">
        <div className="relative aspect-[16/9] sm:aspect-[4/1]">
          {video ? (
            <AutoplayVideo src={video} preload="auto" poster={image || undefined} className="h-full w-full object-cover" style={{ objectPosition: videoPosition }} />
          ) : (
            <img src={image} alt={title} fetchPriority="high" loading="eager" decoding="async" className="h-full w-full object-cover" style={{ objectPosition: imagePosition }} />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/5 to-transparent" />
          <div className="absolute bottom-5 start-3.5 max-w-[85%] text-white sm:bottom-9 sm:start-9">
            <h1 className="font-heading truncate text-2xl font-medium leading-tight sm:text-4xl lg:text-5xl" data-testid={titleTestId}>
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 line-clamp-2 max-w-xl text-[13px] leading-snug text-white/85 sm:text-[15px]" data-testid={subtitleTestId}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
