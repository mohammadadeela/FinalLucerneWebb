import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLanguage } from "@/i18n";

/* The moment after "place order": a small, fast illustrated story on a plain white sheet.
     0. Packing   — our assistant closes the pink Lucerne box, ties the gold ribbon, presses the seal and sticks on
                    the QR delivery label, which is scanned
     1. Handover  — the sheet pans to the street: the Lucerne van pulls up, the box goes in the back
                    (store pickup: the box is set on the counter with a READY tag and the bell rings)
     2. Done      — the van drives off and a big check springs in
   Everything is SVG moved with framer-motion, in a 340×220 stage.

   Contract with the checkout page (unchanged): `open` while the order is being placed, `done` once it succeeded;
   the page keeps the scene up for a minimum time and removes it at once if the order fails.
   data-phase: 0 packing · 1 handover · 2 done. */

type Method = "cod" | "card" | "pickup";

const T1 = 1.7;                    // packing -> handover
const ACCENT = "#d6436d";
const SERIF = "var(--font-display, 'Cormorant Garamond'), Georgia, serif";
const GOLD = "url(#ls-gold)";
const tr = (reduce: boolean, t: Record<string, unknown>) => (reduce ? { duration: 0 } : t);

/* ── shared gradients ─────────────────────────────────────────────────────── */
function Defs() {
  const g = (id: string, a: string, b: string) => (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
  );
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        {g("ls-wall", "#fff8f4", "#fbe4de")}{g("ls-marble", "#fbf7f2", "#eadfd6")}{g("ls-boxf", "#2b2b30", "#121214")}
        {g("ls-boxt", "#4a4a52", "#2d2d33")}{g("ls-rose", "#f58fab", "#d4466e")}{g("ls-van", "#f6a3ba", "#d84d75")}
        {g("ls-sky", "#fff3ee", "#fbd9df")}{g("ls-road", "#4d4a56", "#33313b")}
        <linearGradient id="ls-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f6e2a6" /><stop offset=".5" stopColor="#cfa355" /><stop offset="1" stopColor="#f1d68e" /></linearGradient>
        <radialGradient id="ls-spot" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <linearGradient id="ls-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f9dcc4" /><stop offset="1" stopColor="#ecb998" /></linearGradient>
        <linearGradient id="ls-apron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#35353c" /><stop offset="1" stopColor="#141417" /></linearGradient>
        <linearGradient id="ls-blouse" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#efe6df" /></linearGradient>
        <linearGradient id="ls-faceShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#000" stopOpacity=".10" /><stop offset=".35" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0" /></linearGradient>
        <linearGradient id="ls-blonde" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f3d58e" /><stop offset=".55" stopColor="#d9ae5c" /><stop offset="1" stopColor="#b88a3f" /></linearGradient>
        <linearGradient id="ls-blondeDeep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c9983f" /><stop offset="1" stopColor="#9c7230" /></linearGradient>
        <linearGradient id="ls-blondeHi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff5d1" stopOpacity=".85" /><stop offset="1" stopColor="#fff5d1" stopOpacity="0" /></linearGradient>
        <radialGradient id="ls-cheek" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#f08a9c" stopOpacity=".55" /><stop offset="1" stopColor="#f08a9c" stopOpacity="0" /></radialGradient>
        <clipPath id="ls-win"><path d="M36 -92 L30 -92 L30 -54 L84 -54 L56 -86 Q50 -92 36 -92 Z" /></clipPath>
        {g("ls-pinkF", "#f7bfd0", "#e38aa8")}{g("ls-pinkT", "#fbd4df", "#f0a9c0")}{g("ls-pinkRim", "#e07a9c", "#c9587f")}
        <clipPath id="ls-card"><rect x="-32" y="-38" width="64" height="64" rx="8" /></clipPath>
        <clipPath id="ls-label"><rect x="-24" y="-30" width="48" height="60" rx="4" /></clipPath>
      </defs>
    </svg>
  );
}

/* ── the signature pink box (0,0 = bottom centre; the front face is 160×70) ─ */
const RIB_X = -46;   // the ribbon runs off-centre so the brand on the lid stays readable

function BoxBack() {
  return (<><path d="M-80 -70 L80 -70 L62 -86 L-62 -86 Z" fill="#b8486f" /><path d="M-62 -86 L62 -86 L50 -80 L-50 -80 Z" fill="#fff0e6" /></>);
}
function BoxFront() {
  return (
    <>
      <rect x="-80" y="-70" width="160" height="70" rx="3" fill="url(#ls-pinkF)" />
      <rect x="-80" y="-70" width="160" height="70" rx="3" fill="none" stroke="rgba(0,0,0,.06)" />
      <text x="-8" y="-10" textAnchor="middle" fontSize="7" letterSpacing="2" fill="rgba(60,20,40,.55)" style={{ fontFamily: SERIF }}>LUCERNE</text>
    </>
  );
}
function Lid() {
  return (
    <g>
      <path d="M-84 -86 L84 -86 L66 -104 L-66 -104 Z" fill="url(#ls-pinkT)" />
      <rect x="-84" y="-86" width="168" height="18" rx="2" fill="url(#ls-pinkRim)" />
      <rect x="-84" y="-86" width="168" height="2" fill="rgba(255,255,255,.35)" />
      <text x="18" y="-73.5" textAnchor="middle" fontSize="7.5" letterSpacing="2" fontWeight="600" fill="#fff6ee" style={{ fontFamily: SERIF }}>LUCERNE BOUTIQUE</text>
    </g>
  );
}
function Bow() {
  return (
    <g>
      <path d="M0 0 C-14 -22 -44 -22 -40 -4 C-37 10 -14 8 0 0 Z" fill={GOLD} /><path d="M0 0 C14 -22 44 -22 40 -4 C37 10 14 8 0 0 Z" fill={GOLD} />
      <path d="M0 0 C-10 -14 -30 -14 -28 -4 C-26 4 -10 4 0 0" fill="none" stroke="rgba(0,0,0,.14)" strokeWidth="2" /><path d="M0 0 C10 -14 30 -14 28 -4 C26 4 10 4 0 0" fill="none" stroke="rgba(0,0,0,.14)" strokeWidth="2" />
      <path d="M-2 2 L-16 22 L-8 22 L0 8 Z" fill="#d4a858" /><path d="M2 2 L16 22 L8 22 L0 8 Z" fill="#d4a858" />
      <circle cx="0" cy="0" r="6" fill="#c9994a" /><circle cx="0" cy="0" r="3.5" fill="#f3dc9c" />
    </g>
  );
}
function Seal() {
  return (
    <g>
      <path d="M0 -17 Q13 -16 16 -4 Q18 10 6 16 Q-8 19 -15 8 Q-19 -8 -8 -15 Z" fill="#1d1d22" />
      <circle cx="0" cy="0" r="12" fill="#2b2b30" /><circle cx="0" cy="0" r="12" fill="none" stroke="rgba(255,255,255,.18)" />
      <text x="0" y="5" textAnchor="middle" fontSize="14" fontWeight="700" fill="#f6e2a6" style={{ fontFamily: SERIF }}>L</text>
    </g>
  );
}
/* the QR delivery label (48×60, centred) */
function QrLabel() {
  const cells = [[12, 2, 3, 3], [17, 4, 3, 3], [12, 9, 3, 3], [2, 12, 3, 3], [7, 14, 3, 3], [12, 14, 5, 3], [19, 12, 3, 3], [25, 14, 3, 3], [29, 12, 3, 3], [12, 19, 3, 3], [17, 21, 3, 3], [23, 19, 3, 3], [12, 26, 3, 3], [16, 29, 5, 3], [24, 24, 3, 3], [29, 28, 3, 3]];
  const eye = (x: number, y: number) => (<><rect x={x} y={y} width="9" height="9" /><rect x={x + 2} y={y + 2} width="5" height="5" fill="#fff" /><rect x={x + 3} y={y + 3} width="3" height="3" /></>);
  const bars = [[-20, 1.5], [-17, 1], [-14, 2], [-10, 1], [-7, 1.5], [-4, 1], [-1, 2], [3, 1], [6, 1.5], [9, 1], [12, 2], [16, 1], [19, 1.5]];
  return (
    <g>
      <rect x="-24" y="-30" width="48" height="60" rx="4" fill="#fff" stroke="rgba(0,0,0,.12)" />
      <g fill="#1a1a1e" transform="translate(-16 -24)">{eye(0, 0)}{eye(23, 0)}{eye(0, 23)}{cells.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} />)}</g>
      <text x="0" y="18" textAnchor="middle" fontSize="5" letterSpacing="1.2" fill="#2a2a2f" style={{ fontFamily: SERIF }}>LUCERNE</text>
      <g fill="#1a1a1e">{bars.map(([x, w], i) => <rect key={i} x={x} y="21" width={w} height="6" />)}</g>
    </g>
  );
}
const LABEL_AT = { x: 46, y: -30, r: -5, s: 0.75 };
/* the finished, labelled box (used in the handover chapter) */
function WrappedBox() {
  return (
    <g>
      <ellipse cx="0" cy="4" rx="96" ry="7" fill="rgba(120,40,70,.16)" />
      <BoxBack /><BoxFront /><Lid />
      <rect x={RIB_X - 7} y="-104" width="14" height="104" fill={GOLD} />
      <rect x="-80" y="-42" width="160" height="14" fill={GOLD} /><rect x="-80" y="-42" width="160" height="14" fill="rgba(0,0,0,.08)" />
      <g transform={`translate(${RIB_X} -104)`}><Bow /></g>
      <g transform={`translate(${RIB_X} -35)`}><Seal /></g>
      <g transform={`translate(${LABEL_AT.x} ${LABEL_AT.y}) rotate(${LABEL_AT.r}) scale(${LABEL_AT.s})`}><QrLabel /></g>
    </g>
  );
}

/* ── our assistant, from the waist up, standing behind the packing table ─── */
function Packer({ reduce, lift }: { reduce: boolean; lift: boolean }) {
  return (
    <motion.g animate={reduce ? undefined : { y: [0, -1.5, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}>
      <g transform="translate(180 236)">
        <path d="M-44 34 C-54 22 -48 6 -52 -14 C-56 -40 -52 -68 -40 -84 C-28 -104 -12 -108 0 -108 C12 -108 28 -104 40 -84 C52 -68 56 -40 52 -14 C48 6 54 22 44 34 C40 46 28 48 26 38 C24 30 30 22 24 12 L24 -20 L-24 -20 L-24 12 C-30 22 -24 30 -26 38 C-28 48 -40 46 -44 34 Z" fill="url(#ls-blonde)"/>
        <path d="M-42 -60 C-50 -36 -46 -8 -40 16 C-44 -8 -46 -36 -36 -62 Z" fill="url(#ls-blondeHi)"/>
        <path d="M42 -60 C50 -36 46 -8 40 16 C44 -8 46 -36 36 -62 Z" fill="url(#ls-blondeHi)"/>
        <path d="M-48 0 C-52 16 -46 28 -42 34" stroke="url(#ls-blondeDeep)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".5"/>
        <path d="M48 0 C52 16 46 28 42 34" stroke="url(#ls-blondeDeep)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity=".5"/>
        <path d="M-50 78 L-47 14 Q-44 -6 -22 -14 L22 -14 Q44 -6 47 14 L50 78 Z" fill="url(#ls-blouse)"/>
        <path d="M-9 -30 L9 -30 L11 -12 Q0 -6 -11 -12 Z" fill="#e3ad8d"/>
        <path d="M-12 -14 Q0 -4 12 -14 L14 -8 Q0 2 -14 -8 Z" fill="url(#ls-skin)"/>
        <path d="M-22 -14 L-6 -6 L0 2 L6 -6 L22 -14 L18 -2 L0 8 L-18 -2 Z" fill="#fff" stroke="rgba(0,0,0,.08)" strokeWidth="1"/>
        <path d="M-38 78 L-34 8 Q-30 -2 -16 -4 L16 -4 Q30 -2 34 8 L38 78 Z" fill="url(#ls-apron)"/>
        <path d="M-22 -14 Q-10 -4 0 8 Q10 -4 22 -14" fill="none" stroke="#1a1a1e" strokeWidth="3" strokeLinecap="round"/>
        <rect x="-16" y="40" width="32" height="20" rx="4" fill="rgba(255,255,255,.07)"/>
        <circle cx="0" cy="24" r="8.5" fill="url(#ls-gold)"/><circle cx="0" cy="24" r="8.5" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth=".8"/>
        <text x="0" y="27.5" textAnchor="middle" fontSize="10" style={{ fontFamily: SERIF }} fontWeight="700" fill="#2a2a2f">L</text>
        <ellipse cx="-25" cy="-54" rx="3.5" ry="5" fill="#ecb998"/><ellipse cx="25" cy="-54" rx="3.5" ry="5" fill="#ecb998"/>
        <path d="M-24 -56 Q-26 -82 0 -84 Q26 -82 24 -56 Q24 -38 12 -28 Q0 -22 -12 -28 Q-24 -38 -24 -56 Z" fill="url(#ls-skin)"/>
        <path d="M-24 -56 Q-26 -82 0 -84 Q26 -82 24 -56 Q24 -38 12 -28 Q0 -22 -12 -28 Q-24 -38 -24 -56 Z" fill="url(#ls-faceShade)"/>
        <path d="M-28 -56 C-32 -92 -8 -100 4 -98 C30 -96 32 -72 28 -58 C26 -72 16 -80 4 -82 C-10 -84 -20 -72 -28 -56 Z" fill="url(#ls-blonde)"/>
        <path d="M-10 -78 C4 -88 20 -82 26 -68 C28 -62 28 -56 27 -52 C24 -66 14 -76 2 -78 C-4 -79 -8 -78 -10 -78 Z" fill="url(#ls-blondeDeep)" opacity=".3"/>
        <path d="M-23 -74 C-40 -50 -30 -22 -36 -2 C-40 16 -30 30 -22 28 C-16 24 -22 8 -20 -8 C-18 -30 -28 -50 -13 -70 Z" fill="url(#ls-blonde)"/>
        <path d="M23 -74 C36 -50 30 -24 33 -8 C35 8 28 20 24 18 C20 14 24 2 22 -10 C20 -32 28 -50 13 -70 Z" fill="url(#ls-blonde)"/>
        <path d="M-20 -86 C-6 -96 12 -94 20 -84 C10 -90 -4 -90 -16 -82 Z" fill="url(#ls-blondeHi)"/>
        <path d="M-30 -40 C-36 -20 -32 2 -28 14 C-32 0 -34 -22 -26 -42 Z" fill="url(#ls-blondeHi)"/>
        <path d="M30 -44 C34 -24 32 -4 28 8 C32 -6 32 -26 26 -44 Z" fill="url(#ls-blondeHi)"/>
        <path d="M-30 -56 C-26 -72 -14 -80 -4 -82" stroke="url(#ls-blondeDeep)" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".45"/>
        <g transform="translate(-19 -70)"><circle r="4.2" fill="url(#ls-rose)"/><circle r="4.2" fill="none" stroke="rgba(255,255,255,.35)"/><circle r="1.6" fill="#f6e2a6"/></g>
        <path d="M-16 -64 Q-10 -68 -4 -64" stroke="#7a5a2e" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        <path d="M4 -64 Q10 -68 16 -64" stroke="#7a5a2e" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        <motion.g style={{ originX: 0.5, originY: 0.5 }} animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1, 1] }} transition={{ duration: 3.4, times: [0, 0.58, 0.62, 0.66, 1], repeat: Infinity }}>
          <path d="M-16 -56 Q-10 -62 -4 -56 Q-10 -51 -16 -56 Z" fill="#fff"/><path d="M4 -56 Q10 -62 16 -56 Q10 -51 4 -56 Z" fill="#fff"/>
          <circle cx="-9.5" cy="-56" r="2.8" fill="#5a3a2e"/><circle cx="10.5" cy="-56" r="2.8" fill="#5a3a2e"/>
          <circle cx="-9.5" cy="-56" r="1.4" fill="#2a1a16"/><circle cx="10.5" cy="-56" r="1.4" fill="#2a1a16"/>
          <circle cx="-8.6" cy="-57" r=".8" fill="#fff"/><circle cx="11.4" cy="-57" r=".8" fill="#fff"/>
          <path d="M-16 -56 Q-10 -62.5 -4 -56" stroke="#3a2622" strokeWidth="1.4" fill="none" strokeLinecap="round"/><path d="M4 -56 Q10 -62.5 16 -56" stroke="#3a2622" strokeWidth="1.4" fill="none" strokeLinecap="round"/>
          <path d="M-16 -56.5 L-17.5 -58.5" stroke="#3a2622" strokeWidth="1" strokeLinecap="round"/><path d="M16 -56.5 L17.5 -58.5" stroke="#3a2622" strokeWidth="1" strokeLinecap="round"/>
        </motion.g>
        <path d="M-1 -50 Q-3 -44 1 -43" stroke="#d9a383" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
        <path d="M-6 -36 Q0 -31 6 -36" stroke="#c9566a" strokeWidth="2" fill="none" strokeLinecap="round"/>
        <path d="M-5 -36 Q0 -34 5 -36" fill="#e9808f"/>
        <circle cx="-15" cy="-42" r="6" fill="url(#ls-cheek)"/><circle cx="15" cy="-42" r="6" fill="url(#ls-cheek)"/>
        <circle cx="-25" cy="-48" r="1.6" fill="url(#ls-gold)"/><circle cx="25" cy="-48" r="1.6" fill="url(#ls-gold)"/>
        {/* arms: they rise to take the lid and come back down */}
        <motion.g animate={lift && !reduce ? { y: [0, -34, -34, 0] } : { y: 0 }} transition={tr(reduce, { delay: 0.55, duration: 0.85, times: [0, 0.3, 0.55, 1], ease: "easeInOut" })}>
          <path d="M-44 6 Q-84 36 -70 66" stroke="url(#ls-blouse)" strokeWidth="14" fill="none" strokeLinecap="round"/>
          <path d="M44 6 Q84 36 70 66" stroke="url(#ls-blouse)" strokeWidth="14" fill="none" strokeLinecap="round"/>
          <path d="M-76 56 Q-70 60 -64 58" stroke="#e4d6cc" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <path d="M76 56 Q70 60 64 58" stroke="#e4d6cc" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <g transform="translate(-70 70)"><path d="M-8 -4 Q-9 -10 -3 -10 L3 -10 Q9 -10 8 -4 L8 8 Q8 14 0 14 Q-8 14 -8 8 Z" fill="url(#ls-skin)"/><path d="M-4 2 L-4 10 M0 3 L0 11 M4 2 L4 10" stroke="rgba(0,0,0,.09)" strokeWidth="1.4" strokeLinecap="round"/><path d="M8 -2 Q11 2 9 8" stroke="url(#ls-skin)" strokeWidth="4" strokeLinecap="round" fill="none"/></g>
          <g transform="translate(70 70)"><path d="M-8 -4 Q-9 -10 -3 -10 L3 -10 Q9 -10 8 -4 L8 8 Q8 14 0 14 Q-8 14 -8 8 Z" fill="url(#ls-skin)"/><path d="M-4 2 L-4 10 M0 3 L0 11 M4 2 L4 10" stroke="rgba(0,0,0,.09)" strokeWidth="1.4" strokeLinecap="round"/><path d="M-8 -2 Q-11 2 -9 8" stroke="url(#ls-skin)" strokeWidth="4" strokeLinecap="round" fill="none"/></g>
        </motion.g>
      </g>
    </motion.g>
  );
}

function Wheel({ cx, cy, spin, reduce }: { cx: number; cy: number; spin: boolean; reduce: boolean }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r="16" fill="#1e1e22" />
      <motion.g style={{ originX: 0.5, originY: 0.5 }} animate={spin && !reduce ? { rotate: 360 } : { rotate: 0 }} transition={spin && !reduce ? { duration: 0.6, repeat: Infinity, ease: "linear" } : { duration: 0 }}>
        <circle r="8" fill="#e9e3dc" /><circle r="2.5" fill="#1e1e22" /><path d="M0 -8 L0 8 M-8 0 L8 0" stroke="#1e1e22" strokeWidth="2" />
      </motion.g>
    </g>
  );
}


/* ── scene A: the packing table (0..340) ─────────────────────────────────── */
const PK = { x: 170, y: 150, s: 0.6 };        // where the assistant stands
const BX = { x: 170, y: 200, s: 0.46 };       // where the box sits

function Packing({ reduce, away }: { reduce: boolean; away: boolean }) {
  return (
    <g>
      <g transform={`translate(${PK.x - 180 * PK.s} ${PK.y - 236 * PK.s}) scale(${PK.s})`}><Packer reduce={reduce} lift /></g>
      {/* the table top hides her waist */}
      <rect x="0" y="200" width="340" height="30" fill="#fff" />
      <path d="M40 200 H300" stroke="#e5e5e5" strokeWidth="1.5" strokeLinecap="round" />
      <ellipse cx="170" cy="203" rx="60" ry="3.5" fill="rgba(120,40,70,.10)" />
      <motion.g initial={{ opacity: 1 }} animate={{ opacity: away ? 0 : 1 }} transition={{ duration: 0.2 }}>
        <g transform={`translate(${BX.x} ${BX.y}) scale(${BX.s})`}>
          <BoxBack /><BoxFront />
          <motion.g initial={{ y: reduce ? 0 : -140, opacity: reduce ? 1 : 0 }} animate={{ y: 0, opacity: 1 }} transition={tr(reduce, { delay: 0.15, duration: 0.32, ease: [0.3, 0, 0.1, 1], opacity: { duration: 0.12 } })}><Lid /></motion.g>
          <motion.rect x={RIB_X - 7} y="-104" width="14" height="104" fill={GOLD} style={{ originX: 0.5, originY: 0 }} initial={{ scaleY: reduce ? 1 : 0 }} animate={{ scaleY: 1 }} transition={tr(reduce, { delay: 0.5, duration: 0.2, ease: "easeOut" })} />
          <motion.g style={{ originX: 0.5, originY: 0.5 }} initial={{ scaleX: reduce ? 1 : 0 }} animate={{ scaleX: 1 }} transition={tr(reduce, { delay: 0.6, duration: 0.2, ease: "easeOut" })}>
            <rect x="-80" y="-42" width="160" height="14" fill={GOLD} /><rect x="-80" y="-42" width="160" height="14" fill="rgba(0,0,0,.06)" />
          </motion.g>
          <motion.g style={{ originX: 0.5, originY: 0.5 }} initial={{ scale: reduce ? 1 : 0, rotate: reduce ? 0 : -25 }} animate={{ scale: 1, rotate: 0 }} transition={tr(reduce, { delay: 0.75, type: "spring", stiffness: 280, damping: 13 })}>
            <g transform={`translate(${RIB_X} -104)`}><Bow /></g>
          </motion.g>
          <motion.g style={{ originX: 0.5, originY: 0.5 }} initial={{ scale: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }} animate={{ scale: reduce ? 1 : [0, 1.6, 1], opacity: 1 }} transition={tr(reduce, { delay: 0.85, duration: 0.3, times: [0, 0.55, 1], ease: "easeOut" })}>
            <g transform={`translate(${RIB_X} -35)`}><Seal /></g>
          </motion.g>
          <motion.g initial={reduce ? { x: LABEL_AT.x, y: LABEL_AT.y, rotate: LABEL_AT.r, scale: LABEL_AT.s, opacity: 1 } : { x: 150, y: -40, rotate: 20, scale: 0.9, opacity: 0 }}
            animate={{ x: LABEL_AT.x, y: LABEL_AT.y, rotate: LABEL_AT.r, scale: LABEL_AT.s, opacity: 1 }}
            transition={tr(reduce, { delay: 1.0, duration: 0.3, ease: [0.3, 0, 0.2, 1], opacity: { duration: 0.1 } })}>
            <QrLabel />
            {!reduce && (
              <g clipPath="url(#ls-label)">
                <motion.rect x="-24" y="-3" width="48" height="6" fill={ACCENT} opacity=".8" initial={{ y: -34, opacity: 0 }} animate={{ y: [-34, 34, -34], opacity: [0, 0.85, 0] }} transition={{ delay: 1.3, duration: 0.4, ease: "easeInOut" }} />
              </g>
            )}
          </motion.g>
          <motion.g style={{ originX: 0.5, originY: 0.5 }} initial={{ scale: reduce ? 1 : 0 }} animate={{ scale: 1 }} transition={tr(reduce, { delay: 1.68, type: "spring", stiffness: 320, damping: 14 })}>
            <g transform={`translate(${LABEL_AT.x + 18} ${LABEL_AT.y - 20})`}>
              <circle r="9" fill="#10b981" /><path d="M-4 0.5 L-1 3.5 L4.5 -3" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          </motion.g>
        </g>
      </motion.g>
    </g>
  );
}

/* ── scene B: the street with the Lucerne van (340..680) ─────────────────── */
function Street({ done, reduce, active }: { done: boolean; reduce: boolean; active: boolean }) {
  const [rolling, setRolling] = useState(reduce);
  useEffect(() => { if (!active) return; const t = window.setTimeout(() => setRolling(true), reduce ? 0 : 1250); return () => window.clearTimeout(t); }, [active, reduce]);
  const spin = (rolling || done) && !reduce;
  return (
    <g transform="translate(340 0)">
      <path d="M-20 204 H360" stroke="#e5e5e5" strokeWidth="1.5" />
      <motion.path d="M-40 212 H400" stroke="#d4d4d4" strokeWidth="2" strokeDasharray="14 12" animate={spin ? { x: [0, -26] } : { x: 0 }} transition={spin ? { duration: done ? 0.2 : 0.45, repeat: Infinity, ease: "linear" } : { duration: 0 }} />
      {/* the box waits on the kerb (behind the van) */}
      <motion.g initial={{ opacity: 1 }} animate={{ opacity: active ? [1, 1, 0] : 1 }} transition={tr(reduce, { delay: 0.55, duration: 0.3, times: [0, 0.9, 1] })}>
        <g transform="translate(46 203) scale(.3)"><WrappedBox /></g>
      </motion.g>
      <motion.g initial={{ x: reduce ? 0 : -300 }} animate={active ? { x: done ? 520 : 0, y: spin && !done ? [0, -1.2, 0] : 0 } : { x: reduce ? 0 : -300 }}
        transition={done ? tr(reduce, { x: { duration: 0.7, ease: [0.55, 0, 0.9, 0.5] } }) : tr(reduce, { x: { duration: 0.55, ease: [0.15, 0.7, 0.2, 1] }, y: { duration: 0.35, repeat: Infinity, ease: "easeInOut" } })}>
        <g transform="translate(176 204) scale(.74)">
          <ellipse cx="0" cy="4" rx="118" ry="7" fill="rgba(30,20,30,.25)" />
          <path d="M-112 -20 L-112 -92 Q-112 -100 -104 -100 L30 -100 Q46 -100 56 -88 L96 -46 Q104 -38 104 -28 L104 -20 Z" fill="url(#ls-van)" />
          <path d="M36 -92 L30 -92 L30 -54 L84 -54 L56 -86 Q50 -92 36 -92 Z" fill="#e9f3f6" />
          {/* the courier at the wheel (he waves once the order is confirmed) */}
          <g clipPath="url(#ls-win)">
          <g transform="translate(50 -66)">
          <path d="M-14 22 Q-14 4 0 4 Q14 4 14 22 Z" fill="url(#ls-apron)"/>
          <path d="M-9 -4 Q-9 -16 0 -16 Q9 -16 9 -4 Q9 6 0 6 Q-9 6 -9 -4 Z" fill="url(#ls-skin)"/>
          <path d="M-10 -8 Q-10 -20 0 -20 Q10 -20 10 -8 L12 -6 L-12 -6 Z" fill="url(#ls-rose)"/>
          <path d="M8 -6 L18 -8 L18 -5 L8 -4 Z" fill="#c7466f"/>
          <circle cx="-3" cy="-4" r="1.3" fill="#2a1a16"/><circle cx="3" cy="-4" r="1.3" fill="#2a1a16"/>
          <path d="M-2.5 1 Q0 3 2.5 1" stroke="#b45a5a" strokeWidth="1" fill="none" strokeLinecap="round"/>
          <path d="M-8 -10 Q0 -13 8 -10" stroke="rgba(255,255,255,.4)" strokeWidth="1.2" fill="none"/>
          </g>
          <motion.circle cx="70" cy="-62" r="4.5" fill="url(#ls-skin)" animate={done && !reduce ? { y: [0, -10, -8, -10, 0] } : { y: 0 }} transition={done ? { duration: 0.9, repeat: Infinity } : { duration: 0 }} />
          <path d="M62 -58 Q70 -66 78 -58" stroke="#3a3a40" strokeWidth="2" fill="none"/>
          </g>
          <path d="M36 -92 L30 -92 L30 -54 L84 -54 L56 -86 Q50 -92 36 -92 Z" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" />
          <rect x="-112" y="-32" width="216" height="6" fill="rgba(0,0,0,.14)" />
          <rect x="-108" y="-96" width="40" height="70" rx="3" fill="#1b1b1f" />
          <text x="-16" y="-66" textAnchor="middle" fontSize="15" letterSpacing="3" fontWeight="600" fill="#1a1a1e" style={{ fontFamily: SERIF }}>LUCERNE</text>
          <text x="-16" y="-50" textAnchor="middle" fontSize="7.5" letterSpacing="3.5" fill="#fff7e8" style={{ fontFamily: SERIF }}>BOUTIQUE</text>
          <rect x="96" y="-40" width="8" height="10" rx="2" fill="#fff5cc" /><rect x="-112" y="-40" width="6" height="10" rx="2" fill="#ff8a8a" />
          {/* the box flies into the back */}
          <motion.g initial={{ x: -150, y: -38, scale: 0.42, opacity: reduce ? 0 : 0 }}
            animate={reduce ? { opacity: 0 } : { x: [-150, -120, -88], y: [-38, -92, -48], scale: [0.42, 0.32, 0.22], opacity: [1, 1, 1] }}
            transition={tr(reduce, { delay: 0.6, duration: 0.4, times: [0, 0.5, 1], ease: "easeInOut" })}>
            <WrappedBox />
          </motion.g>
          {/* roller shutter */}
          <motion.rect x="-108" y="-96" width="40" height="70" rx="3" fill="rgba(255,255,255,.22)" style={{ originX: 0.5, originY: 0 }} initial={{ scaleY: reduce ? 1 : 0.08 }} animate={{ scaleY: 1 }} transition={tr(reduce, { delay: 1.0, duration: 0.25, ease: "easeIn" })} />
          <rect x="-104" y="-56" width="32" height="2" fill="rgba(255,255,255,.35)" />
          <Wheel cx={-62} cy={-14} spin={rolling || done} reduce={reduce} /><Wheel cx={64} cy={-14} spin={rolling || done} reduce={reduce} />

          {done && !reduce && [0, 1, 2].map((i) => (
            <motion.rect key={`sp${i}`} x="-190" y={-80 + i * 14} width="56" height="3" rx="1.5" fill="#e5e5e5" initial={{ opacity: 0.9, scaleX: 0.4 }} animate={{ opacity: 0, scaleX: 1 }} transition={{ duration: 0.4, repeat: Infinity }} style={{ originX: 1, originY: 0.5 }} />
          ))}
        </g>
      </motion.g>
    </g>
  );
}

/* ── scene B (store pickup): the boutique counter ─────────────────────────── */
function Counter({ done, reduce, active }: { done: boolean; reduce: boolean; active: boolean }) {
  return (
    <g transform="translate(340 0)">
      <g transform={`translate(${PK.x - 180 * PK.s} ${PK.y - 236 * PK.s}) scale(${PK.s})`}><Packer reduce={reduce} lift={false} /></g>
      <rect x="0" y="200" width="340" height="30" fill="#fff" />
      <path d="M30 200 H310" stroke="#e5e5e5" strokeWidth="1.5" strokeLinecap="round" />
      <g transform="translate(272 200)">
        <ellipse cx="0" cy="0" rx="11" ry="2.5" fill="#c9994a" />
        <motion.g style={{ originX: 0.5, originY: 1 }} animate={active && !reduce ? { rotate: [0, 0, -8, 8, -5, 5, 0] } : { rotate: 0 }} transition={{ delay: 0.75, duration: 0.6, times: [0, 0.05, 0.25, 0.45, 0.65, 0.85, 1] }}>
          <path d="M-8 0 Q-8 -15 0 -16 Q8 -15 8 0 Z" fill={GOLD} /><circle cx="0" cy="-17.5" r="2.2" fill="#f3dc9c" />
        </motion.g>
        {active && !reduce && [0, 1].map((i) => (
          <motion.circle key={i} cx="0" cy="-9" r="12" fill="none" stroke="#cfa355" strokeWidth="1.5" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: [0, 0.7, 0], scale: [0.6, 2, 2.4] }} transition={{ delay: 0.8 + i * 0.25, duration: 0.8, ease: "easeOut" }} style={{ originX: 0.5, originY: 0.5 }} />
        ))}
      </g>
      <motion.g initial={{ x: reduce ? 0 : -220, opacity: reduce ? 1 : 0 }} animate={active ? { x: 0, opacity: 1 } : { x: reduce ? 0 : -220, opacity: reduce ? 1 : 0 }} transition={tr(reduce, { delay: 0.05, duration: 0.55, ease: [0.2, 0.8, 0.2, 1], opacity: { duration: 0.2 } })}>
        <g transform={`translate(${BX.x} ${BX.y}) scale(${BX.s})`}><WrappedBox /></g>
      </motion.g>
      <motion.g style={{ originX: 0, originY: 0.5 }} initial={{ scale: reduce ? 1 : 0, rotate: reduce ? 12 : -30, opacity: reduce ? 1 : 0 }} animate={active ? { scale: 1, rotate: done ? [12, 6, 12] : 12, opacity: 1 } : { scale: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
        transition={tr(reduce, done ? { rotate: { duration: 1.2, repeat: Infinity, ease: "easeInOut" } } : { delay: 0.65, type: "spring", stiffness: 240, damping: 14 })}>
        <g transform="translate(214 132)">
          <rect x="-22" y="-9" width="44" height="18" rx="5" fill={GOLD} /><circle cx="-16" cy="0" r="1.5" fill="#2a2a2f" />
          <text x="3" y="3" textAnchor="middle" fontSize="7" letterSpacing="1.2" fontWeight="700" fill="#2a2a2f" style={{ fontFamily: SERIF }}>READY</text>
        </g>
      </motion.g>
    </g>
  );
}

/* ── the scene ────────────────────────────────────────────────────────────── */
export default function PurchaseScene({ open, done, method }: { open: boolean; done: boolean; method: Method; images?: string[] }) {
  const { language } = useLanguage();
  const ar = language === "ar";
  const reduce = !!useReducedMotion();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!open) { setStage(0); return; }
    const t = window.setTimeout(() => setStage(1), T1 * 1000);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const phase = done ? 2 : stage;
  const pickup = method === "pickup";
  const handover = phase >= 1;
  const caption = phase === 2
    ? (ar ? "تم الطلب بنجاح" : "Order placed")
    : phase === 0
      ? (ar ? "نجهّز طلبك…" : "Packing your order…")
      : pickup ? (ar ? "نحضّره للاستلام…" : "Getting it ready to collect…") : method === "card" ? (ar ? "نحوّلك لدفع آمن…" : "Taking you to secure payment…") : (ar ? "نسلّمه للتوصيل…" : "Handing it to delivery…");

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-white px-6 overflow-hidden"
      role="dialog" aria-modal="true" aria-live="polite" aria-label={ar ? "جارٍ إتمام طلبك" : "Placing your order"}
      data-testid="purchase-scene" data-phase={phase} data-story={pickup ? "pickup" : method === "card" ? "card" : "delivery"}
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <Defs />
      <motion.div className="absolute top-10 inset-x-0 text-center select-none" aria-hidden initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="text-[11px] tracking-[0.42em] uppercase text-neutral-500" style={{ fontFamily: SERIF }}>Lucerne Boutique</div>
      </motion.div>

      {/* the small stage: one sheet that pans from the table to the street */}
      <div className="relative w-[340px] max-w-[90vw]" style={{ aspectRatio: "340 / 220" }} data-testid="purchase-scene-stage">
        <motion.svg viewBox="0 0 340 220" className="absolute inset-0 w-full h-full overflow-visible" aria-hidden
          animate={{ opacity: phase === 2 ? 0.25 : 1, scale: phase === 2 ? 0.92 : 1, y: phase === 2 ? 10 : 0 }} transition={{ duration: 0.4, delay: phase === 2 ? 0.55 : 0 }}>
          <motion.g initial={{ x: 0 }} animate={{ x: handover ? -340 : 0 }} transition={tr(reduce, { duration: 0.55, ease: [0.4, 0, 0.2, 1] })}>
            <Packing reduce={reduce} away={handover} />
            {pickup ? <Counter done={done} reduce={reduce} active={handover} /> : <Street done={done} reduce={reduce} active={handover} />}
          </motion.g>
        </motion.svg>

        {/* done: the check springs in over the stage */}
        <AnimatePresence>
          {phase === 2 && (
            <motion.div className="absolute inset-0 flex items-center justify-center" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <div className="relative w-24 h-24 flex items-center justify-center" data-testid="scene-check">
                {!reduce && [0, 1].map((i) => (
                  <motion.span key={i} className="absolute inset-0 rounded-full border-2" style={{ borderColor: ACCENT }} aria-hidden
                    initial={{ scale: 0.9, opacity: 0.5 }} animate={{ scale: 1.9, opacity: 0 }} transition={{ delay: 0.25 + i * 0.3, duration: 1.0, ease: "easeOut" }} />
                ))}
                <motion.span className="w-24 h-24 rounded-full flex items-center justify-center text-white shadow-[0_18px_40px_-16px_rgba(214,67,109,0.6)]" style={{ background: ACCENT }}
                  initial={reduce ? false : { scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.1 }}>
                  <motion.svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="w-12 h-12">
                    <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.3, duration: 0.4, ease: "easeOut" }} />
                  </motion.svg>
                </motion.span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* caption + two-step progress */}
      <div className="mt-6 h-14 flex flex-col items-center text-center">
        <AnimatePresence mode="wait">
          <motion.p key={phase} className={`font-semibold text-neutral-900 ${phase === 2 ? "text-lg" : "text-base"}`} data-testid="purchase-scene-caption"
            initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
            {caption}
          </motion.p>
        </AnimatePresence>
        {phase === 2 ? (
          <motion.p className="mt-1.5 text-sm text-neutral-500" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35, duration: 0.3 }}>
            {ar ? "شكراً لتسوقك من لوسيرن بوتيك" : "Thank you for shopping with Lucerne Boutique"}
          </motion.p>
        ) : (
          <div className="mt-3 flex gap-1.5" aria-hidden>
            {[T1, 1.2].map((secs, i) => (
              <span key={i} className="relative h-1 w-10 rounded-full bg-neutral-200 overflow-hidden">
                <motion.span className="absolute inset-y-0 left-0 rounded-full" style={{ background: ACCENT }} initial={{ width: i < phase ? "100%" : "0%" }} animate={{ width: i <= phase ? "100%" : "0%" }}
                  transition={i === phase && !reduce ? { duration: secs, ease: "linear" } : { duration: 0.25 }} />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
