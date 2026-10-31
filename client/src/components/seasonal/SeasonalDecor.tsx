import { useId } from "react";
import { useLanguage } from "@/i18n";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { SEASONS, getActiveTheme, daysUntil, daysLabel, type SeasonalTheme } from "@/lib/seasonal";

/* Seasonal decorations. Everything here is decoration only: pointer-events-none, aria-hidden, animated with
   CSS transforms/opacity (cheap on phones), and fully switched off for people who prefer reduced motion. */

const CSS = `
@keyframes sx-fall { 0%{transform:translate3d(0,-8%,0)} 50%{transform:translate3d(16px,55%,0)} 100%{transform:translate3d(-8px,112%,0)} }
@keyframes sx-swing { 0%{transform:rotate(-7deg)} 100%{transform:rotate(7deg)} }
@keyframes sx-twinkle { 0%,100%{opacity:1} 50%{opacity:.2} }
@keyframes sx-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-9px)} }
@keyframes sx-glow { 0%,100%{opacity:.82} 50%{opacity:1} }
.sx-swing{transform-origin:50% 0;animation:sx-swing 4.2s ease-in-out infinite alternate}
.sx-float{animation:sx-float 7s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){ .sx-anim,.sx-swing,.sx-float{animation:none!important} }
`;

/* ── Christmas pieces ─────────────────────────────────────────────────────── */

function Bauble({ color, size }: { color: string; size: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size * 1.6} viewBox="0 0 40 64" aria-hidden>
      <defs>
        <radialGradient id={`b${id}`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset=".25" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity=".78" />
        </radialGradient>
      </defs>
      <line x1="20" y1="0" x2="20" y2="14" stroke="#d4af37" strokeWidth="1.5" />
      <rect x="15" y="12" width="10" height="7" rx="2" fill="#d4af37" />
      <circle cx="20" cy="41" r="19" fill={`url(#b${id})`} />
      <path d="M3 41 Q20 50 37 41" stroke="#fff" strokeOpacity=".3" fill="none" strokeWidth="1.5" />
    </svg>
  );
}

function CandyCane({ flip }: { flip?: boolean }) {
  return (
    <svg width="64" height="110" viewBox="0 0 64 110" aria-hidden style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M14 104 V34 A22 22 0 0 1 58 34" fill="none" stroke="#fff" strokeWidth="13" strokeLinecap="round" />
      <path d="M14 104 V34 A22 22 0 0 1 58 34" fill="none" stroke="#dc2626" strokeWidth="13" strokeLinecap="round" strokeDasharray="9 9" />
    </svg>
  );
}

const LIGHT_COLORS = ["#ef4444", "#22c55e", "#fbbf24", "#60a5fa"];

/** A sagging wire of twinkling lights across the top of the hero. */
function StringLights() {
  // 6 sagging arcs of 200 units; a bulb every 50 units along each arc (quadratic curve: y = 6 + 80·t·(1−t)).
  const bulbs: { x: number; y: number; c: string; d: number }[] = [];
  for (let arc = 0; arc < 6; arc++) {
    for (let k = 0; k < 4; k++) {
      const u = k * 50;
      const t = u / 200;
      bulbs.push({ x: arc * 200 + u, y: 6 + 80 * t * (1 - t), c: LIGHT_COLORS[(arc * 4 + k) % 4], d: ((arc * 4 + k) % 4) * 0.45 });
    }
  }
  return (
    <svg className="absolute top-0 inset-x-0 w-full h-14" viewBox="0 0 1200 50" preserveAspectRatio="xMidYMin slice" aria-hidden>
      <path d="M0 6 Q100 46 200 6 Q300 46 400 6 Q500 46 600 6 Q700 46 800 6 Q900 46 1000 6 Q1100 46 1200 6" fill="none" stroke="#1f2937" strokeOpacity=".7" strokeWidth="2" />
      {bulbs.map((b, i) => (
        <g key={i}>
          <circle cx={b.x} cy={b.y + 6} r="9" fill={b.c} opacity=".28" className="sx-anim" style={{ animation: `sx-twinkle 1.8s ease-in-out ${b.d}s infinite` }} />
          <circle cx={b.x} cy={b.y + 6} r="4.5" fill={b.c} className="sx-anim" style={{ animation: `sx-twinkle 1.8s ease-in-out ${b.d}s infinite` }} />
        </g>
      ))}
    </svg>
  );
}

function Snow({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const size = 3 + (i % 4);
        return (
          <span
            key={i}
            className="sx-anim absolute rounded-full bg-white"
            style={{
              left: `${(i * 37) % 100}%`,
              top: 0,
              width: size,
              height: size,
              opacity: 0.55 + ((i * 13) % 40) / 100,
              animation: `sx-fall ${8 + ((i * 7) % 9)}s linear ${-((i * 5) % 12)}s infinite`,
            }}
          />
        );
      })}
    </>
  );
}

/* ── Eid pieces ───────────────────────────────────────────────────────────── */

function Lantern({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size * 2} viewBox="0 0 60 120" aria-hidden>
      <defs>
        <radialGradient id={`l${id}`} cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#fff7c2" />
          <stop offset=".55" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#b45309" />
        </radialGradient>
      </defs>
      <line x1="30" y1="0" x2="30" y2="20" stroke="#d4af37" strokeWidth="1.5" />
      <circle cx="30" cy="20" r="3.5" fill="none" stroke="#d4af37" strokeWidth="1.5" />
      <path d="M20 26 H40 L44 34 H16 Z" fill="#b8860b" />
      <path d="M17 34 H43 L51 66 Q51 80 43 84 H17 Q9 80 9 66 Z" fill={`url(#l${id})`} className="sx-anim" style={{ animation: "sx-glow 3s ease-in-out infinite" }} />
      <path d="M30 34 V84 M23 34 L18 84 M37 34 L42 84" stroke="#7c4a03" strokeOpacity=".55" strokeWidth="1.5" fill="none" />
      <path d="M15 84 H45 L41 94 H19 Z" fill="#b8860b" />
      <line x1="30" y1="94" x2="30" y2="108" stroke="#d4af37" strokeWidth="1.5" />
      <circle cx="30" cy="111" r="3.5" fill="#d4af37" />
    </svg>
  );
}

function Crescent({ size }: { size: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ filter: "drop-shadow(0 0 10px rgba(252,211,77,.7))" }}>
      <defs>
        <mask id={`m${id}`}>
          <rect width="100" height="100" fill="#fff" />
          <circle cx="64" cy="40" r="35" fill="#000" />
        </mask>
      </defs>
      <circle cx="46" cy="52" r="38" fill="#fcd34d" mask={`url(#m${id})`} />
      <path transform="translate(80 26) scale(1.15)" d="M0,-10 L2.9,-3.1 10,-3.1 4.3,1.6 6.2,8.5 0,4.4 -6.2,8.5 -4.3,1.6 -10,-3.1 -2.9,-3.1Z" fill="#fde68a" />
    </svg>
  );
}

function Sparkles({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <svg
          key={i}
          className="sx-anim absolute"
          width={8 + (i % 3) * 4}
          height={8 + (i % 3) * 4}
          viewBox="-9 -9 18 18"
          aria-hidden
          style={{
            left: `${(i * 53 + 7) % 96}%`,
            top: `${(i * 31 + 11) % 88}%`,
            animation: `sx-twinkle ${2 + (i % 4) * 0.7}s ease-in-out ${(i % 5) * 0.5}s infinite`,
          }}
        >
          <path d="M0,-8 Q1,-1 8,0 Q1,1 0,8 Q-1,1 -8,0 Q-1,-1 0,-8Z" fill="#fde68a" />
        </svg>
      ))}
    </>
  );
}

function IslamicPattern() {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="absolute inset-0 w-full h-full" aria-hidden style={{ opacity: 0.1 }}>
      <defs>
        <pattern id={`p${id}`} width="60" height="60" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#f4d58d" strokeWidth="1">
            <rect x="15" y="15" width="30" height="30" />
            <rect x="15" y="15" width="30" height="30" transform="rotate(45 30 30)" />
            <circle cx="30" cy="30" r="6" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#p${id})`} />
    </svg>
  );
}

function Skyline() {
  return (
    <svg className="absolute bottom-0 inset-x-0 w-full h-16 sm:h-24" viewBox="0 0 1200 120" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <path
        d="M0 120 V95 H120 V80 Q150 40 180 80 V95 H300 V70 L312 36 L324 70 V95 H420 V85 Q470 18 520 85 V95 H600 V90 Q640 50 680 90 V95 H760 V70 L772 36 L784 70 V95 H880 V80 Q910 40 940 80 V95 H1200 V120 Z"
        fill="rgba(0,0,0,.5)"
        stroke="#fcd34d"
        strokeOpacity=".4"
        strokeWidth="2"
        />
      <g fill="#fde68a" opacity=".9">
        <circle cx="312" cy="30" r="3" /><circle cx="772" cy="30" r="3" /><circle cx="495" cy="22" r="3.5" />
      </g>
    </svg>
  );
}

const TINT: Record<SeasonalTheme, string> = {
  christmas: "radial-gradient(ellipse at 50% 0%, rgba(220,38,38,.20), transparent 62%), linear-gradient(to top, rgba(20,83,45,.28), transparent 42%)",
  eid_fitr: "linear-gradient(to bottom, rgba(76,29,149,.32), transparent 58%), linear-gradient(to top, rgba(251,191,36,.10), transparent 40%)",
  eid_adha: "linear-gradient(to bottom, rgba(6,78,59,.34), transparent 58%), linear-gradient(to top, rgba(251,191,36,.10), transparent 40%)",
};

/** Decorative layer for the home hero. Renders nothing when no season is active. */
export function SeasonalHeroOverlay() {
  const { data: settings } = useSiteSettings();
  const { language } = useLanguage();
  const season = getActiveTheme(settings);
  if (!season) return null;
  const info = SEASONS[season];
  const ar = language === "ar";
  const days = daysUntil(settings?.seasonal_countdown_date);
  const countdown =
    days === null || days < 0
      ? null
      : days === 0
        ? (ar ? `اليوم ${info.eventAr}! ${info.emoji}` : `${info.eventEn} is today! ${info.emoji}`)
        : (ar ? `باقي ${daysLabel(days, "ar")} على ${info.eventAr}` : `${daysLabel(days, "en")} until ${info.eventEn}`);

  return (
    <div className="absolute inset-0 z-[2] overflow-hidden pointer-events-none" aria-hidden="true" data-testid="seasonal-hero-overlay" data-season={season}>
      <style>{CSS}</style>
      <div className="absolute inset-0" style={{ background: TINT[season] }} />

      {season === "christmas" ? (
      <>
      <Snow count={34} />
      <div className="absolute inset-x-0 bottom-0" style={{ top: "calc(var(--news-bar-offset, 0px) + 5rem)" }}>
      <StringLights />
          <div className="sx-swing absolute left-[5%] top-10" style={{ animationDelay: "-1s" }}><Bauble color="#dc2626" size={34} /></div>
          <div className="sx-swing absolute left-[12%] top-8 hidden sm:block" style={{ animationDelay: "-2.4s" }}><Bauble color="#d4af37" size={26} /></div>
          <div className="sx-swing absolute right-[6%] top-10" style={{ animationDelay: "-3s" }}><Bauble color="#16a34a" size={32} /></div>
          <div className="sx-swing absolute right-[14%] top-8 hidden sm:block" style={{ animationDelay: "-.6s" }}><Bauble color="#dc2626" size={24} /></div>
          </div>
          <div className="absolute bottom-0 start-3 sm:start-8 opacity-90"><CandyCane /></div>
          <div className="absolute bottom-0 end-3 sm:end-8 opacity-90"><CandyCane flip /></div>
        </>
      ) : (
        <>
          <IslamicPattern />
          <Sparkles count={22} />
          <div className="absolute inset-x-0 bottom-0" style={{ top: "calc(var(--news-bar-offset, 0px) + 5rem)" }}>
          <div className="sx-float absolute right-[4%] top-1 sm:top-5 scale-[0.62] origin-top-right sm:scale-100"><Crescent size={86} /></div>
          <div className="sx-swing absolute left-[5%] top-0" style={{ animationDelay: "-1.2s" }}><Lantern size={36} /></div>
          <div className="sx-swing absolute left-[13%] top-0 hidden sm:block" style={{ animationDelay: "-2.6s" }}><Lantern size={26} /></div>
          <div className="sx-swing absolute left-[22%] top-0 hidden md:block" style={{ animationDelay: "-.4s" }}><Lantern size={30} /></div>
          </div>
          {season === "eid_adha" && <Skyline />}
        </>
      )}

      <div className="absolute bottom-5 sm:bottom-7 inset-x-0 flex flex-col items-center gap-2 px-4">
        <div
          className="rounded-full px-4 py-1.5 text-xs sm:text-sm font-semibold tracking-wide backdrop-blur-md border"
          style={{ color: info.accent, background: "rgba(0,0,0,.35)", borderColor: "rgba(255,255,255,.18)" }}
          data-testid="seasonal-greeting"
        >
          {info.emoji} {ar ? info.greetingAr : info.greetingEn}
        </div>
        {countdown && (
          <div
            className="rounded-full px-3.5 py-1 text-[11px] sm:text-xs font-bold text-white backdrop-blur-md"
            style={{ background: "rgba(0,0,0,.45)" }}
            data-testid="seasonal-countdown"
          >
            ⏳ {countdown}
          </div>
        )}
      </div>
    </div>
  );
}

/** Small themed ornament that sits on the corner of the navbar logo (Santa hat / crescent). */
export function SeasonalLogoAccent() {
  const { data: settings } = useSiteSettings();
  const season = getActiveTheme(settings);
  if (!season) return null;
  return (
    <span className="pointer-events-none absolute -top-2.5 -end-3 rotate-12" aria-hidden="true" data-testid="seasonal-logo-accent" data-season={season}>
      {season === "christmas" ? (
        <svg width="24" height="21" viewBox="0 0 32 28">
          <path d="M4 22 C6 8 16 2 26 6 C24 10 22 16 22 22 Z" fill="#dc2626" />
          <rect x="2" y="20" width="22" height="6" rx="3" fill="#fff" />
          <circle cx="27" cy="6" r="3.5" fill="#fff" />
        </svg>
      ) : (
        <Crescent size={22} />
      )}
    </span>
  );
}

/** Thin themed greeting band shown just above the footer. */
export function SeasonalFooterStrip() {
  const { data: settings } = useSiteSettings();
  const { language } = useLanguage();
  const season = getActiveTheme(settings);
  if (!season) return null;
  const info = SEASONS[season];
  return (
    <div
      className="w-full py-2.5 text-center text-xs sm:text-sm font-semibold tracking-wide"
      style={{ background: info.barBg, color: info.barText }}
      data-testid="seasonal-footer-strip"
      data-season={season}
    >
      {info.emoji} {language === "ar" ? info.greetingAr : info.greetingEn} {info.emoji}
    </div>
  );
}
