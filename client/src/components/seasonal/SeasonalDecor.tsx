import { useEffect, useId, useMemo, type ReactNode } from "react";
import { useLanguage } from "@/i18n";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { SEASONS, SEASON_FONT_URL, getActiveTheme, daysUntil, type SeasonalTheme, type SeasonInfo } from "@/lib/seasonal";

/* Seasonal atmospheres. Each season is a palette, a light and ONE signature object drawn in fine line-work that
   matches the boutique's hairline typography:
     Christmas  — Bethlehem night: a glowing star and olive branches
     Eid al-Fitr — dusk: a thin hilal, hanging fanous lanterns, a star-pattern border
     Eid al-Adha — a pointed-arch arcade and a saffron sun rising behind a domed skyline
   Everything is decoration only: pointer-events-none, aria-hidden, animated with transforms/opacity (cheap on
   phones), kept below the navigation so it never covers a link, and switched off for reduced motion. */

const CSS = `
@keyframes sx-fall { 0%{transform:translate3d(0,0,0)} 50%{transform:translate3d(14px,34vh,0)} 100%{transform:translate3d(-8px,72vh,0)} }
@keyframes sx-sway { 0%{transform:rotate(-3.5deg)} 100%{transform:rotate(3.5deg)} }
@keyframes sx-twinkle { 0%,100%{opacity:1} 50%{opacity:.18} }
@keyframes sx-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes sx-breathe { 0%,100%{opacity:.72;transform:scale(.95)} 50%{opacity:1;transform:scale(1.05)} }
@keyframes sx-rise { 0%{transform:translateY(0);opacity:0} 18%{opacity:.85} 100%{transform:translateY(-110px);opacity:0} }
.sx-sway{transform-origin:50% 0;animation:sx-sway 5.5s ease-in-out infinite alternate}
.sx-float{animation:sx-float 8s ease-in-out infinite}
.sx-ar{font-family:'Aref Ruqaa','Noto Sans Arabic',serif}
.sx-en{font-family:var(--font-display,'Cormorant Garamond',serif);font-style:italic}
@media (prefers-reduced-motion: reduce){ .sx-anim,.sx-sway,.sx-float{animation:none!important} }
`;

/** Loads the calligraphic greeting font — only while a season is actually on, so it costs nothing the rest of the year. */
function useSeasonFont() {
  useEffect(() => {
    if (typeof document === "undefined" || document.getElementById("sx-font")) return;
    const l = document.createElement("link");
    l.id = "sx-font";
    l.rel = "stylesheet";
    l.href = SEASON_FONT_URL;
    document.head.appendChild(l);
  }, []);
}

const uid = () => useId().replace(/:/g, "");

/* ── Shared ornaments ─────────────────────────────────────────────────────── */

/** Eight-pointed star (khatam): two squares, one turned 45°. Used inside <svg> only. */
function Star8({ s, fill }: { s: number; fill: string }) {
  return (
    <g fill={fill}>
      <rect x={-s} y={-s} width={s * 2} height={s * 2} />
      <rect x={-s} y={-s} width={s * 2} height={s * 2} transform="rotate(45)" />
    </g>
  );
}

function Flourish({ color }: { color: string }) {
  return (
    <svg width="150" height="14" viewBox="0 0 150 14" aria-hidden>
      <line x1="2" y1="7" x2="58" y2="7" stroke={color} strokeOpacity=".6" strokeWidth="1" />
      <line x1="92" y1="7" x2="148" y2="7" stroke={color} strokeOpacity=".6" strokeWidth="1" />
      <circle cx="64" cy="7" r="1.3" fill={color} />
      <circle cx="86" cy="7" r="1.3" fill={color} />
      <g transform="translate(75 7)"><Star8 s={3.6} fill={color} /></g>
    </svg>
  );
}

/* ── Christmas: Bethlehem night ───────────────────────────────────────────── */

/** The Star of Bethlehem: four long rays, four short ones, a breathing halo. */
export function BethlehemStar({ size, glow, core }: { size: number; glow: string; core: string }) {
  const id = uid();
  const RAYS = "M0,-56 L3.6,-3.6 L56,0 L3.6,3.6 L0,56 L-3.6,3.6 L-56,0 L-3.6,-3.6Z";
  return (
    <svg width={size} height={size} viewBox="-60 -60 120 120" aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`h${id}`}>
          <stop offset="0" stopColor={glow} stopOpacity=".85" />
          <stop offset=".3" stopColor={glow} stopOpacity=".26" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`r${id}`} x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stopColor={core} />
          <stop offset=".5" stopColor="#ffffff" />
          <stop offset="1" stopColor={core} />
        </linearGradient>
      </defs>
      <circle r="60" fill={`url(#h${id})`} className="sx-anim" style={{ animation: "sx-breathe 5s ease-in-out infinite", transformOrigin: "0 0" }} />
      <path d={RAYS} fill={`url(#r${id})`} />
      <path d={RAYS} fill={core} opacity=".85" transform="rotate(45) scale(.5)" className="sx-anim" style={{ animation: "sx-twinkle 3.4s ease-in-out infinite" }} />
      <circle r="5" fill="#ffffff" />
    </svg>
  );
}

/** An olive branch (a local nod): leaves along a drooping stem, a few candle-lit berries. */
function OliveBranch({ width, leafA, leafB, berry, fluid }: { width: number; leafA: string; leafB: string; berry: string; fluid?: boolean }) {
  const { leaves, berries } = useMemo(() => {
    const P0 = [6, 4], P1 = [96, 2], P2 = [162, 66];
    const pt = (t: number) => [(1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * P1[0] + t * t * P2[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * P1[1] + t * t * P2[1]];
    const tan = (t: number) => [2 * (1 - t) * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), 2 * (1 - t) * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1])];
    const leaves: { x: number; y: number; a: number; s: number; c: number }[] = [];
    const berries: { x: number; y: number }[] = [];
    for (let i = 0; i < 11; i++) {
      const t = 0.07 + i * 0.088;
      const [x, y] = pt(t);
      const [dx, dy] = tan(t);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const s = 1.15 - 0.55 * t;
      leaves.push({ x, y, a: ang - 52, s, c: i % 2 });
      leaves.push({ x, y, a: ang + 52, s, c: (i + 1) % 2 });
      if (i % 4 === 2) {
        const len = Math.hypot(dx, dy) || 1;
        berries.push({ x: x + (-dy / len) * 9 * s, y: y + (dx / len) * 9 * s });
      }
    }
    const [tx, ty] = pt(1);
    leaves.push({ x: tx, y: ty, a: Math.atan2(...(tan(1).reverse() as [number, number])) * 180 / Math.PI, s: 0.6, c: 0 });
    return { leaves, berries };
  }, []);
  return (
    <svg width={fluid ? "100%" : width} height={fluid ? undefined : width * 0.53} viewBox="0 0 190 100" aria-hidden style={{ overflow: "visible", display: "block" }}>
      <path d="M6 4 Q96 2 162 66" fill="none" stroke="#8a7650" strokeWidth="1.6" strokeLinecap="round" />
      {leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.a.toFixed(1)}) scale(${l.s.toFixed(2)})`}>
          <ellipse cx="10" cy="0" rx="10" ry="3.4" fill={l.c ? leafB : leafA} />
          <path d="M0 0 L19 0" stroke="#ffffff" strokeOpacity=".22" strokeWidth=".8" />
        </g>
      ))}
      {berries.map((b, i) => (
        <g key={i}>
          <circle cx={b.x} cy={b.y} r="5" fill={berry} opacity=".22" />
          <circle cx={b.x} cy={b.y} r="2.6" fill={berry} />
        </g>
      ))}
    </svg>
  );
}

/** Soft warm lights near the bottom — bokeh, not cartoon bulbs. */
function Bokeh({ color }: { color: string }) {
  const dots = [[6, 8, 46], [15, 3, 30], [27, 12, 38], [41, 2, 26], [58, 9, 42], [71, 4, 30], [84, 11, 48], [93, 2, 28]];
  return (
    <>
      {dots.map(([left, bottom, size], i) => (
        <span
          key={i}
          className="sx-anim absolute rounded-full"
          style={{
            left: `${left}%`, bottom: `${bottom}%`, width: size, height: size,
            background: `radial-gradient(circle, ${color}cc 0%, ${color}52 36%, ${color}00 70%)`,
            mixBlendMode: "screen",
            animation: `sx-breathe ${4 + (i % 4)}s ease-in-out ${i * 0.5}s infinite`,
          }}
        />
      ))}
    </>
  );
}

function Snow({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const size = 2 + (i % 3);
        return (
          <span
            key={i}
            className="sx-anim absolute rounded-full bg-white"
            style={{
              left: `${(i * 37) % 100}%`, top: 0, width: size, height: size,
              opacity: 0.4 + ((i * 13) % 40) / 100,
              animation: `sx-fall ${9 + ((i * 7) % 9)}s linear ${-((i * 5) % 12)}s infinite`,
            }}
          />
        );
      })}
    </>
  );
}

/* ── Eid pieces ───────────────────────────────────────────────────────────── */

/** A thin hilal (crescent) with its star. */
export function Hilal({ size, gold, glow }: { size: number; gold: string; glow: string }) {
  const id = uid();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden style={{ filter: `drop-shadow(0 0 14px ${glow}b3)` }}>
      <defs>
        <mask id={`m${id}`}>
          <rect width="100" height="100" fill="#fff" />
          <circle cx="63" cy="43" r="33" fill="#000" />
        </mask>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3cf" />
          <stop offset="1" stopColor={gold} />
        </linearGradient>
      </defs>
      <circle cx="48" cy="54" r="37" fill={`url(#g${id})`} mask={`url(#m${id})`} />
      <g transform="translate(79 27)"><Star8 s={5.4} fill="#fff3cf" /></g>
    </svg>
  );
}

/** A fanous: line-art lantern with a warm light inside. */
function Fanous({ size, gold, glow }: { size: number; gold: string; glow: string }) {
  const id = uid();
  return (
    <svg width={size} height={size * 2.2} viewBox="0 0 60 132" aria-hidden style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={`f${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={glow} stopOpacity=".9" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`b${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff1cc" stopOpacity=".95" />
          <stop offset="1" stopColor={glow} stopOpacity=".7" />
        </linearGradient>
      </defs>
      <circle cx="30" cy="74" r="40" fill={`url(#f${id})`} className="sx-anim" style={{ animation: "sx-breathe 3.6s ease-in-out infinite", transformOrigin: "30px 74px" }} />
      <line x1="30" y1="0" x2="30" y2="24" stroke={gold} strokeOpacity=".8" strokeWidth="1.2" />
      <circle cx="30" cy="26" r="2.6" fill="none" stroke={gold} strokeWidth="1.2" />
      <path d="M17 45 Q17 32 30 28 Q43 32 43 45 Z" fill={gold} fillOpacity=".92" />
      <path d="M16 46 H44 L50 80 Q50 94 42 100 H18 Q10 94 10 80 Z" fill={`url(#b${id})`} stroke={gold} strokeWidth="1.3" />
      <path d="M30 46 V100 M23 46 L19 100 M37 46 L41 100" stroke={gold} strokeOpacity=".45" strokeWidth="1" fill="none" />
      <path d="M12 66 H48" stroke={gold} strokeOpacity=".7" strokeWidth="1.1" />
      <g transform="translate(30 83)"><Star8 s={4.5} fill="#7c4a03" /></g>
      <g transform="translate(30 55)"><Star8 s={3} fill="#7c4a03" /></g>
      <path d="M16 100 H44 L40 110 H20 Z" fill={gold} />
      <line x1="30" y1="110" x2="30" y2="124" stroke={gold} strokeWidth="1.2" />
      <circle cx="30" cy="127" r="2.8" fill={gold} />
    </svg>
  );
}

/** Hangs something from the top edge on a visible chain; the whole thing sways gently. */
function Hanging({ chain, delay, gold, className, children }: { chain: number; delay: string; gold: string; className: string; children: ReactNode }) {
  return (
    <div className={`sx-sway absolute -top-1 flex flex-col items-center ${className}`} style={{ animationDelay: delay }}>
      <div style={{ width: 1, height: chain, background: `linear-gradient(to bottom, transparent, ${gold}aa)` }} />
      {children}
    </div>
  );
}

function Twinkles({ count, color }: { count: number; color: string }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <svg
          key={i}
          className="sx-anim absolute"
          width={7 + (i % 3) * 4}
          height={7 + (i % 3) * 4}
          viewBox="-9 -9 18 18"
          aria-hidden
          style={{
            // Only the outer margins, so a sparkle never lands on the headline or the buttons.
            left: i % 2 ? `${3 + ((i * 7) % 19)}%` : `${78 + ((i * 5) % 19)}%`,
            top: `${(i * 29 + 6) % 70}%`,
            animation: `sx-twinkle ${2.2 + (i % 4) * 0.7}s ease-in-out ${(i % 5) * 0.5}s infinite`,
          }}
        >
          <path d="M0,-8 Q1,-1 8,0 Q1,1 0,8 Q-1,1 -8,0 Q-1,-1 0,-8Z" fill={color} />
        </svg>
      ))}
    </>
  );
}

/** A band of eight-pointed stars along the bottom edge, fading upwards. */
function KhatamBand({ gold }: { gold: string }) {
  const id = uid();
  return (
    <svg className="absolute bottom-0 inset-x-0 w-full h-10" aria-hidden>
      <defs>
        <pattern id={`p${id}`} width="34" height="34" patternUnits="userSpaceOnUse">
          <g transform="translate(17 17)" fill="none" stroke={gold} strokeWidth="1">
            <rect x="-8" y="-8" width="16" height="16" />
            <rect x="-8" y="-8" width="16" height="16" transform="rotate(45)" />
            <circle r="2" fill={gold} stroke="none" />
          </g>
        </pattern>
        <linearGradient id={`f${id}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`k${id}`}><rect width="100%" height="100%" fill={`url(#f${id})`} /></mask>
      </defs>
      <rect width="100%" height="100%" fill={`url(#p${id})`} mask={`url(#k${id})`} opacity=".7" />
    </svg>
  );
}

/* ── Eid al-Adha: arcade + sunrise ────────────────────────────────────────── */

/** A row of pointed arches with a small lamp under each apex. */
export function Arcade({ gold, glow, height = 56 }: { gold: string; glow: string; height?: number }) {
  const id = uid();
  return (
    <svg className="absolute top-0 inset-x-0 w-full" height={height} aria-hidden>
      <defs>
        <pattern id={`p${id}`} width="112" height="58" patternUnits="userSpaceOnUse">
          <path d="M6 58 V30 C6 16 34 8 56 0 C78 8 106 16 106 30 V58" fill="rgba(5,47,42,.34)" stroke={gold} strokeOpacity=".62" strokeWidth="1.2" />
          <path d="M17 58 V32 C17 23 38 16 56 10 C74 16 95 23 95 32 V58" fill="none" stroke={gold} strokeOpacity=".28" strokeWidth="1" />
          <line x1="56" y1="10" x2="56" y2="19" stroke={gold} strokeOpacity=".7" strokeWidth="1" />
          <circle cx="56" cy="23" r="6" fill={glow} fillOpacity=".25" />
          <circle cx="56" cy="23" r="2.6" fill={glow} />
        </pattern>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".55" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`m${id}`}><rect width="100%" height="100%" fill={`url(#f${id})`} /></mask>
      </defs>
      <rect width="100%" height="100%" fill={`url(#p${id})`} mask={`url(#m${id})`} />
    </svg>
  );
}

/** Two layers of domes and minarets for depth. */
function Skyline({ back, front, edge }: { back: string; front: string; edge: string }) {
  return (
    <svg className="absolute bottom-0 inset-x-0 w-full h-16 sm:h-auto sm:max-h-44" viewBox="0 0 1200 120" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <path
        d="M0 120 V100 H80 V92 H150 V100 H240 V84 Q272 44 304 84 V100 H380 V50 L385 38 L390 50 V100 H470 V94 H520 V80 Q548 42 576 80 V94 H650 V100 H720 V70 Q752 26 784 70 V100 H870 V46 L875 36 L880 46 V100 H950 V88 Q980 52 1010 88 V100 H1090 V94 H1150 V104 H1200 V120 Z"
        fill={back}
      />
      <path
        d="M0 120 V98 H70 V88 H130 V98 H210 V80 Q240 38 270 80 V98 H330 V40 L336 28 L342 40 V98 H420 V90 H470 V74 Q500 30 530 74 V90 H610 V98 H660 V60 Q690 16 720 60 V98 H790 V40 L796 28 L802 40 V98 H870 V84 Q900 46 930 84 V98 H1010 V92 H1080 V82 H1140 V98 H1200 V120 Z"
        fill={front}
        stroke={edge}
        strokeOpacity=".4"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** A saffron sun with thin rings, half hidden behind the skyline. */
function SunDisc({ glow, gold }: { glow: string; gold: string }) {
  return (
    <div className="absolute start-1/2 -translate-x-1/2 rtl:translate-x-1/2 bottom-[-120px] sm:bottom-[-150px] w-[300px] h-[300px] sm:w-[400px] sm:h-[400px]">
      <div className="absolute inset-0 rounded-full sx-anim" style={{ background: `radial-gradient(circle, ${glow}cc 0%, ${glow}55 38%, ${glow}00 68%)`, animation: "sx-breathe 7s ease-in-out infinite" }} />
      <div className="absolute inset-[22%] rounded-full border" style={{ borderColor: `${gold}55` }} />
      <div className="absolute inset-[10%] rounded-full border" style={{ borderColor: `${gold}2e` }} />
    </div>
  );
}

/** Slow golden motes drifting up through the scene. */
function Motes({ color }: { color: string }) {
  return (
    <>
      {Array.from({ length: 9 }).map((_, i) => (
        <span
          key={i}
          className="sx-anim absolute rounded-full"
          style={{
            left: `${(i * 41 + 8) % 94}%`, bottom: `${6 + ((i * 17) % 30)}%`,
            width: 3 + (i % 3), height: 3 + (i % 3), background: color,
            animation: `sx-rise ${7 + (i % 5)}s ease-out ${-(i * 1.3)}s infinite`,
          }}
        />
      ))}
    </>
  );
}

/* ── Countdown ────────────────────────────────────────────────────────────── */

function countdownParts(days: number | null, info: SeasonInfo, ar: boolean): { num?: string; text: string } | null {
  if (days === null || days < 0) return null;
  const ev = ar ? info.eventAr : info.eventEn;
  if (days === 0) return { text: ar ? `اليوم ${ev}` : `${ev} is today` };
  if (days === 1) return { text: ar ? `غداً ${ev}` : `${ev} is tomorrow` };
  if (days === 2) return { text: ar ? `يومان على ${ev}` : `2 days until ${ev}` };
  return { num: String(days), text: ar ? `${days >= 11 ? "يوماً" : "أيام"} على ${ev}` : `days until ${ev}` };
}

/* ── Hero overlay ─────────────────────────────────────────────────────────── */

/** Decorative layer for the home hero. Renders nothing when no season is active. */
export function SeasonalHeroOverlay() {
  const { data: settings } = useSiteSettings();
  const season = getActiveTheme(settings);
  if (!season) return null;
  return <HeroInner season={season} countdownDate={settings?.seasonal_countdown_date} />;
}

function HeroInner({ season, countdownDate }: { season: SeasonalTheme; countdownDate?: string }) {
  const { language } = useLanguage();
  useSeasonFont();
  const info = SEASONS[season];
  const p = info.palette;
  const ar = language === "ar";
  const cd = countdownParts(daysUntil(countdownDate), info, ar);
  // The art sits below the navigation, so it never covers a menu link or the logo.
  const stage = { top: "calc(var(--news-bar-offset, 0px) + 5rem)" } as const;
  const lift = season === "eid_adha" ? "bottom-10 sm:bottom-14" : season === "eid_fitr" ? "bottom-9 sm:bottom-12" : "bottom-5 sm:bottom-8";

  return (
    <div className="absolute inset-0 z-[2] overflow-hidden pointer-events-none" aria-hidden="true" data-testid="seasonal-hero-overlay" data-season={season}>
      <style>{CSS}</style>
      <div className="absolute inset-0" style={{ background: info.heroTint }} />

      <div className="absolute inset-x-0 bottom-0" style={stage}>
        {season === "christmas" && (
          <>
            <Snow count={16} />
            <Bokeh color={p.glow} />
            <div className="absolute top-0 sm:top-3 start-0 opacity-95 w-[118px] sm:w-[250px] rtl:-scale-x-100">
              <OliveBranch width={250} leafA="#5B9970" leafB="#2F6F54" berry={p.glow} fluid />
            </div>
            <div className="absolute top-8 start-0 opacity-80 hidden sm:block rtl:-scale-x-100">
              <OliveBranch width={160} leafA="#4C8761" leafB="#265E47" berry={p.glow} />
            </div>
            <div className="absolute -top-2 sm:top-1 end-[2%] sm:end-[9%] sx-float">
              {/* scale lives on an inner wrapper: the float animation owns `transform` on the outer one */}
              <div className="scale-[.46] sm:scale-100 origin-top"><BethlehemStar size={132} glow={p.glow} core={p.gold} /></div>
            </div>
          </>
        )}

        {season === "eid_fitr" && (
          <>
            <Twinkles count={11} color={p.glow} />
            <div className="absolute top-1 end-[4%] sm:end-[8%] sx-float">
              <div className="scale-[.62] sm:scale-100 origin-top"><Hilal size={104} gold={p.gold} glow={p.glow} /></div>
            </div>
            <Hanging className="start-[1%] sm:start-[4%]" chain={34} delay="-1.1s" gold={p.gold}><div className="scale-[.62] sm:scale-100 origin-top"><Fanous size={42} gold={p.gold} glow={p.glow} /></div></Hanging>
            <Hanging className="start-[12%] hidden sm:flex" chain={8} delay="-2.7s" gold={p.gold}><Fanous size={28} gold={p.gold} glow={p.glow} /></Hanging>
            <Hanging className="start-[19%] hidden md:flex" chain={52} delay="-.5s" gold={p.gold}><Fanous size={32} gold={p.gold} glow={p.glow} /></Hanging>
            <KhatamBand gold={p.gold} />
          </>
        )}

        {season === "eid_adha" && (
          <>
            <SunDisc glow={p.glow} gold={p.gold} />
            <Motes color={p.glow} />
            <Skyline back="rgba(14,92,79,.62)" front="rgba(5,47,42,.9)" edge={p.gold} />
          </>
        )}
      </div>
      {season === "eid_adha" && (
        <div className="absolute inset-x-0" style={stage}>
          <Arcade gold={p.gold} glow={p.glow} height={56} />
        </div>
      )}

      <div className={`absolute ${lift} inset-x-0 flex flex-col items-center gap-2 sm:gap-2.5 px-4 text-center`}>
        <div data-testid="seasonal-greeting" className="flex flex-col items-center">
          <div
            className={`${ar ? "sx-ar text-[26px] sm:text-[40px] leading-[1.25]" : "sx-en text-[26px] sm:text-[40px] leading-[1.1]"}`}
            style={{ color: p.light, textShadow: "0 2px 20px rgba(0,0,0,.6)" }}
          >
            {ar ? info.titleAr : info.titleEn}
          </div>
          <div className="hidden sm:block my-1.5"><Flourish color={p.gold} /></div>
          <div className="text-[11px] sm:text-sm mt-1 sm:mt-0 tracking-wide" style={{ color: p.gold, textShadow: "0 1px 12px rgba(0,0,0,.6)" }}>
            {ar ? info.subAr : info.subEn}
          </div>
        </div>
        {cd && (
          <div
            className="inline-flex items-baseline gap-1.5 rounded-full px-4 py-1 text-[11px] sm:text-xs font-medium border backdrop-blur-sm"
            style={{ color: p.light, background: `${p.night}8c`, borderColor: `${p.gold}66` }}
            data-testid="seasonal-countdown"
          >
            {cd.num && <b className="text-base sm:text-lg leading-none font-semibold ltr-num" style={{ color: p.gold }}>{cd.num}</b>}
            <span>{cd.text}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Small ornament that sits on the corner of the navbar logo: the star of Bethlehem or a thin hilal. */
export function SeasonalLogoAccent() {
  const { data: settings } = useSiteSettings();
  const season = getActiveTheme(settings);
  if (!season) return null;
  const p = SEASONS[season].palette;
  return (
    <span className="pointer-events-none absolute -top-3 -end-4" aria-hidden="true" data-testid="seasonal-logo-accent" data-season={season}>
      {season === "christmas" ? <BethlehemStar size={22} glow={p.glow} core={p.gold} /> : <Hilal size={22} gold={p.gold} glow={p.glow} />}
    </span>
  );
}

/** Themed greeting band shown just above the footer. */
export function SeasonalFooterStrip() {
  const { data: settings } = useSiteSettings();
  const season = getActiveTheme(settings);
  if (!season) return null;
  return <FooterInner season={season} />;
}

function FooterInner({ season }: { season: SeasonalTheme }) {
  const { language } = useLanguage();
  useSeasonFont();
  const info = SEASONS[season];
  const p = info.palette;
  const ar = language === "ar";
  return (
    <div className="relative w-full py-5 sm:py-6 text-center" style={{ background: info.barBg, color: info.barText }} data-testid="seasonal-footer-strip" data-season={season}>
      <style>{CSS}</style>
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${p.gold}, transparent)` }} />
      <div className={ar ? "sx-ar text-xl sm:text-2xl" : "sx-en text-xl sm:text-2xl"} style={{ color: p.light }}>{ar ? info.titleAr : info.titleEn}</div>
      <div className="flex justify-center my-1"><Flourish color={p.gold} /></div>
      <div className="text-[11px] sm:text-xs opacity-80">{ar ? info.subAr : info.subEn}</div>
    </div>
  );
}

/** Mini preview of a season for the admin picker. */
export function SeasonThumb({ id }: { id: SeasonalTheme }) {
  useSeasonFont();
  const info = SEASONS[id];
  const p = info.palette;
  return (
    <div className="relative h-28 rounded-lg overflow-hidden" style={{ background: `linear-gradient(165deg, ${p.night}, ${p.deep})` }} aria-hidden="true" data-testid={`thumb-${id}`}>
      <div className="absolute inset-0" style={{ background: info.heroTint }} />
      {id === "christmas" && (
        <>
          <div className="absolute top-1 end-3"><BethlehemStar size={70} glow={p.glow} core={p.gold} /></div>
          <div className="absolute top-0 start-0 rtl:-scale-x-100 opacity-90"><OliveBranch width={96} leafA="#5B9970" leafB="#2F6F54" berry={p.glow} /></div>
        </>
      )}
      {id === "eid_fitr" && (
        <>
          <div className="absolute top-1 end-3"><Hilal size={62} gold={p.gold} glow={p.glow} /></div>
          <div className="absolute start-3 -top-1"><Fanous size={20} gold={p.gold} glow={p.glow} /></div>
          <div className="absolute start-10 -top-1"><Fanous size={15} gold={p.gold} glow={p.glow} /></div>
        </>
      )}
      {id === "eid_adha" && (
        <>
          <Arcade gold={p.gold} glow={p.glow} height={34} />
          <div className="absolute inset-x-0 bottom-0 h-10 overflow-hidden"><SunDisc glow={p.glow} gold={p.gold} /></div>
          <Skyline back="rgba(14,92,79,.62)" front="rgba(5,47,42,.9)" edge={p.gold} />
        </>
      )}
      <div className={`absolute inset-x-0 bottom-2 text-center ${id === "eid_adha" ? "bottom-3" : ""} ${"sx-ar"} text-[15px]`} style={{ color: p.light, textShadow: "0 1px 8px rgba(0,0,0,.6)" }}>{info.titleAr}</div>
      <style>{CSS}</style>
    </div>
  );
}
