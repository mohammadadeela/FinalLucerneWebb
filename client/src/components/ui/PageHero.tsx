import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { HeroScene, useSeasonSkin } from "@/components/seasonal/SeasonalDecor";
import { LucerneMark } from "@/components/ui/BrandButterfly";
import { AutoplayVideo } from "@/components/ui/AutoplayVideo";
import { useLanguage } from "@/i18n";
import { splitAccent } from "@/lib/storefront";

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

/* Each page gets its own soft panel colour, picked from its title so it is
   stable between visits (shoes stay blush, clothes stay sage, …). */
const TINTS = [
  "linear-gradient(120deg, hsl(var(--blush)) 0%, hsl(var(--blush) / 0.88) 100%)",
];
function tintFor(title: string) {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

/**
 * Category / sale page banner — the same split, lookbook-style composition as
 * the landing page hero: the admin's photo or video on the start side behind a
 * diagonal cut, and a calm tinted panel carrying the title on the other.
 * The photo drifts gently with the pointer and settles in with a slow zoom.
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
  const { language } = useLanguage();
  const isAr = language === "ar";
  // While the admin has a season on (Christmas / Eid) the banner wears that season's colours.
  const skin = useSeasonSkin();

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const smoothX = useSpring(mouseX, { stiffness: 50, damping: 18 });
  const smoothY = useSpring(mouseY, { stiffness: 50, damping: 18 });
  const imgX = useTransform(smoothX, [0, 1], ["1.5%", "-1.5%"]);
  const imgY = useTransform(smoothY, [0, 1], ["1.2%", "-1.2%"]);
  const flyX = useTransform(smoothX, [0, 1], ["-10px", "10px"]);
  const flyY = useTransform(smoothY, [0, 1], ["-8px", "8px"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };
  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  const { lead, accent, tail } = splitAccent(title);
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <section
      className="relative isolate overflow-hidden pt-navbar"
      style={{ background: skin ? skin.panel : tintFor(title) }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div className="relative h-[13.5rem] sm:h-[clamp(15rem,23vw,23rem)]">
        {/* Media — full-bleed on phones, start side with a diagonal cut from sm up */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute will-change-transform"
            style={{ inset: "-5%", x: imgX, y: imgY }}
            initial={{ scale: 1.08 }}
            animate={{ scale: 1 }}
            transition={{ duration: 2.2, ease }}
          >
            {video ? (
              <AutoplayVideo
                src={video}
                preload="auto"
                poster={image || undefined}
                className="h-full w-full object-cover"
                style={{ objectPosition: videoPosition }}
              />
            ) : (
              <img
                src={image}
                alt={title}
                fetchPriority="high"
                loading="eager"
                decoding="async"
                className="h-full w-full object-cover"
                style={{ objectPosition: imagePosition }}
              />
            )}
          </motion.div>
        </div>

        {/* Larger screens: a soft fade behind the text only, so the photo stays whole */}
        <div
          className="absolute inset-0 hidden sm:block"
          style={{
            background: skin
              ? `linear-gradient(to ${isAr ? "right" : "left"}, ${skin.night}f2 0%, ${skin.night}d9 24%, ${skin.night}66 40%, transparent 56%)`
              : `linear-gradient(to ${isAr ? "right" : "left"}, hsl(var(--blush) / 0.95) 0%, hsl(var(--blush) / 0.86) 24%, hsl(var(--blush) / 0.4) 40%, transparent 56%)`,
          }}
        />

        {/* Phones: fade the photo into the page colour on the text side */}
        <div
          className="absolute inset-0 sm:hidden"
          style={{
            background: skin
              ? `linear-gradient(to ${isAr ? "right" : "left"}, ${skin.night}f7 0%, ${skin.night}e6 38%, ${skin.night}80 56%, transparent 76%)`
              : `linear-gradient(to ${isAr ? "right" : "left"}, hsl(var(--blush) / 0.97) 0%, hsl(var(--blush) / 0.9) 38%, hsl(var(--blush) / 0.5) 56%, transparent 76%)`,
          }}
        />

        {/* Decoration */}
        {!skin && (
          <>
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -top-4 end-2 hidden sm:block lg:end-8"
              style={{ x: flyX, y: flyY }}
            >
              <LucerneMark className="soft-float h-32 w-auto text-berry/[0.09] lg:h-48" />
            </motion.div>
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-20 end-[14%] hidden h-48 w-48 rounded-full bg-white/50 blur-3xl sm:block"
            />
          </>
        )}

        {/* Butterflies — or the season's own moving pieces while one is switched on */}
        <HeroScene compact />

        {/* Copy */}
        <div className="absolute inset-y-0 end-0 z-10 flex w-[58%] items-center pe-4 ps-1 sm:w-[44%] sm:justify-center sm:pe-8 lg:pe-14">
          <div className="w-full max-w-[28rem]">
            <motion.p
              className="mb-2 inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.28em] text-berry sm:mb-3 sm:text-xs"
              style={skin ? { color: skin.accent } : undefined}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease }}
            >
              <motion.span
                className="block h-px w-6 origin-left bg-current opacity-60 rtl:origin-right sm:w-9"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, delay: 0.15, ease }}
              />
              Lucerne Boutique
            </motion.p>
            <motion.h1
              className="text-balance text-[2rem] font-medium leading-[1.04] text-foreground sm:text-[clamp(2.2rem,4vw,4rem)] rtl:leading-[1.3]"
              data-testid={titleTestId}
              style={skin ? { color: skin.ink } : undefined}
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.06, ease }}
            >
              {lead}
              {accent && <em className="text-berry ltr:italic rtl:not-italic" style={skin ? { color: skin.accent } : undefined}>{accent}</em>}
              {tail}
            </motion.h1>
            {subtitle && (
              <motion.p
                className="font-heading mt-2 line-clamp-3 text-[13px] leading-snug text-foreground/75 sm:mt-3.5 sm:text-[clamp(0.95rem,1.25vw,1.2rem)] sm:leading-relaxed"
                data-testid={subtitleTestId}
                style={skin ? { color: skin.sub } : undefined}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.16, ease }}
              >
                {subtitle}
              </motion.p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
