import type { ReactNode } from "react";

/**
 * Hand-drawn vector pieces for the category banners on the landing page — shoes, dresses,
 * abayas, belts and everyday clothes. They are drawn by the site (no photos to upload), so
 * they stay sharp at every size and screen.
 */

const GOLD = "#C9A24B";
const C = {
  nude: "#E9C6B2",
  nudeDark: "#D4A58C",
  white: "#FFFFFF",
  offWhite: "#F3ECE6",
  burgundy: "#8E2F4D",
  burgundyDark: "#6F2139",
  beige: "#E4D2BC",
  beigeDark: "#CDB698",
  tan: "#B9774A",
  tanDark: "#96592F",
  black: "#2B2326",
  cream: "#F6EDDD",
  pink: "#F2A9BF",
  mauve: "#B58A9A",
  brown: "#6E4A3A",
  olive: "#8C9373",
  blue: "#AFC3DD",
  navy: "#2F3A5C",
};

function Svg({ w, h, children }: { w: number; h: number; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-auto" fill="none" aria-hidden="true">
      {children}
    </svg>
  );
}

const shadow = (cx: number, cy: number, rx: number) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={2.6} fill="#000" opacity={0.09} />
);

/* ── Shoes (side view, toe to the right), 120 × 84 ── */
function Stiletto({ fill, dark }: { fill: string; dark: string }) {
  return (
    <Svg w={120} h={84}>
      {shadow(60, 79, 46)}
      <path d="M17 44 L14.5 77 H19 L25 52 Z" fill={dark} />
      <path
        d="M11 36 C12 25 25 21 34 27 C47 42 72 52 101 60 C109 62 110 71 102 71 H64 C46 71 35 63 26 55 L17 46 C12 43 10 40 11 36 Z"
        fill={fill}
      />
      <path d="M34 27 C40 40 56 50 78 56" stroke={dark} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M26 55 C36 64 47 71 64 71 H102" stroke={dark} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function BlockHeel({ fill, dark }: { fill: string; dark: string }) {
  return (
    <Svg w={120} h={84}>
      {shadow(60, 79, 46)}
      <path d="M12 44 H31 L29 77 H13 Z" fill={dark} />
      <path
        d="M10 36 C11 24 25 20 35 26 C48 41 73 51 102 59 C110 61 111 71 103 71 H62 C47 71 38 64 31 56 L15 47 C11 44 9 40 10 36 Z"
        fill={fill}
      />
      <path d="M35 26 C41 39 57 49 79 55" stroke={dark} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M31 57 C40 66 49 71 62 71 H103" stroke={dark} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function Sneaker() {
  return (
    <Svg w={120} h={84}>
      {shadow(60, 79, 48)}
      <path
        d="M11 44 C10 33 20 29 29 32 L43 37 C55 47 77 50 98 55 C108 58 110 66 108 70 H12 C10 62 11 52 11 44 Z"
        fill={C.white}
        stroke="#D9CFC8"
        strokeWidth={1.2}
      />
      <path d="M10 67 H109 C110 72 108 77 102 77 H16 C11 77 9 72 10 67 Z" fill={C.offWhite} stroke="#D9CFC8" strokeWidth={1.2} />
      <path d="M43 37 C50 44 60 48 72 50" stroke="#D9CFC8" strokeWidth={1.2} />
      <path d="M47 41 L53 36 M54 45 L60 40 M61 48 L67 43" stroke="#BDB1A9" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M12 52 C24 52 34 56 44 62" stroke={C.pink} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}
function Ballerina({ fill, dark }: { fill: string; dark: string }) {
  return (
    <Svg w={120} h={84}>
      {shadow(60, 79, 46)}
      <path
        d="M12 58 C13 46 28 45 40 52 C60 62 84 60 103 65 C110 67 110 75 103 75 H18 C12 75 11 66 12 58 Z"
        fill={fill}
      />
      <path d="M22 54 C40 60 62 66 86 65" stroke={dark} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M14 73 H104" stroke={dark} strokeWidth={2} strokeLinecap="round" />
      <path d="M82 58 l-7 -4 v8 z M82 58 l7 -4 v8 z" fill={dark} />
      <circle cx={82} cy={58} r={1.8} fill={fill} />
    </Svg>
  );
}
function AnkleBoot({ fill, dark }: { fill: string; dark: string }) {
  return (
    <Svg w={120} h={84}>
      {shadow(60, 79, 46)}
      <path d="M16 66 H34 V77 H16 Z" fill={dark} />
      <path
        d="M17 12 H45 L47 42 C60 50 84 52 101 58 C109 61 110 70 104 70 H16 Z"
        fill={fill}
      />
      <path d="M16 68 H104 C106 72 104 75 100 75 H34 V68" fill={dark} />
      <path d="M17 12 H45" stroke={dark} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M31 14 V40" stroke={dark} strokeWidth={1.4} strokeDasharray="2 3" />
    </Svg>
  );
}

/* ── Dresses and abayas on a hanger, 64 × 100 ── */
const hanger = (
  <>
    <path d="M32 9 C32 4 38 4 37 8 C36 10 32 10 32 13" stroke={GOLD} strokeWidth={1.4} strokeLinecap="round" />
    <path d="M18 18 L32 13 L46 18" stroke={GOLD} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
  </>
);
function Dress({ fill, dark, hem = 92, flare = 22, sleeves = false, dots = false, ruffle = false, slip = false }: {
  fill: string; dark: string; hem?: number; flare?: number; sleeves?: boolean; dots?: boolean; ruffle?: boolean; slip?: boolean;
}) {
  const l = 32 - flare;
  const r = 32 + flare;
  const top = slip
    ? "M24 18 L27 30 H37 L40 18"
    : "M22 18 C26 24 38 24 42 18";
  return (
    <Svg w={64} h={100}>
      {hanger}
      {sleeves && (
        <path d="M22 18 L8 46 L15 50 L25 32 Z M42 18 L56 46 L49 50 L39 32 Z" fill={fill} stroke={dark} strokeWidth={0.8} />
      )}
      <path
        d={`M22 18 C26 24 38 24 42 18 L42 42 C44 58 ${r - 4} ${hem - 18} ${r} ${hem} H${l} C${l + 4} ${hem - 18} 20 58 22 42 Z`}
        fill={fill}
      />
      {slip && <path d="M22 18 L24 8 M42 18 L40 8" stroke={fill} strokeWidth={1.6} />}
      <path d={top} stroke={dark} strokeWidth={1.2} fill="none" strokeLinecap="round" />
      <path d="M22 42 C28 45 36 45 42 42" stroke={dark} strokeWidth={1.3} strokeLinecap="round" />
      {ruffle && (
        <path
          d={`M${l} ${hem} q4 6 8 0 q4 6 8 0 q4 6 8 0 q4 6 8 0 q4 6 ${r - l - 32} 0`}
          stroke={dark}
          strokeWidth={1.6}
          fill={fill}
        />
      )}
      {dots &&
        [
          [28, 30], [36, 34], [30, 50], [38, 56], [24, 62], [34, 68], [42, 74], [22, 78], [30, 84], [40, 86], [18, 88], [46, 88],
        ].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.3} fill={C.white} />)}
    </Svg>
  );
}
function Abaya({ fill, trim }: { fill: string; trim: string }) {
  return (
    <Svg w={64} h={100}>
      {hanger}
      <path d="M20 18 L3 58 L12 62 L22 40 Z M44 18 L61 58 L52 62 L42 40 Z" fill={fill} />
      <path d="M20 18 C26 23 38 23 44 18 L50 94 H14 Z" fill={fill} />
      <path d="M32 21 V94" stroke={trim} strokeWidth={2.2} />
      <path d="M20 18 C26 23 38 23 44 18" stroke={trim} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      <path d="M5 55 L13 59 M59 55 L51 59" stroke={trim} strokeWidth={2} strokeLinecap="round" />
      <path d="M14 94 H50" stroke={trim} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

/* ── Belts, coiled, 100 × 84 ── */
function Belt({ fill, dark }: { fill: string; dark: string }) {
  return (
    <Svg w={100} h={84}>
      {shadow(50, 78, 36)}
      <ellipse cx={50} cy={46} rx={34} ry={24} stroke={fill} strokeWidth={11} />
      <ellipse cx={50} cy={46} rx={34} ry={24} stroke={dark} strokeWidth={1} opacity={0.55} />
      <ellipse cx={50} cy={46} rx={22} ry={13} stroke={dark} strokeWidth={1} opacity={0.4} />
      <path d="M60 62 C72 66 84 66 94 60" stroke={fill} strokeWidth={10} strokeLinecap="round" />
      <path d="M78 62 h2 M86 60 h2" stroke={dark} strokeWidth={2} strokeLinecap="round" />
      <rect x={36} y={58} width={24} height={17} rx={3} stroke={GOLD} strokeWidth={4} />
      <path d="M48 60 V72" stroke={GOLD} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/* ── Everyday clothes, 64 × 100 ── */
function Blazer({ fill, dark }: { fill: string; dark: string }) {
  return (
    <Svg w={64} h={100}>
      {hanger}
      <path d="M21 18 L6 50 L14 54 L23 36 Z M43 18 L58 50 L50 54 L41 36 Z" fill={fill} />
      <path d="M21 18 L32 26 L43 18 L46 78 H18 Z" fill={fill} />
      <path d="M21 18 L32 44 L43 18" stroke={dark} strokeWidth={1.4} fill="none" strokeLinejoin="round" />
      <path d="M32 44 V78" stroke={dark} strokeWidth={1.2} />
      <circle cx={32} cy={54} r={1.5} fill={dark} />
      <circle cx={32} cy={64} r={1.5} fill={dark} />
    </Svg>
  );
}
function Trousers({ fill, dark }: { fill: string; dark: string }) {
  return (
    <Svg w={64} h={100}>
      {hanger}
      <path d="M19 18 H45 L50 94 H35 L32 44 L29 94 H14 Z" fill={fill} />
      <path d="M19 24 H45" stroke={dark} strokeWidth={1.4} />
      <path d="M32 24 V44" stroke={dark} strokeWidth={1.2} />
    </Svg>
  );
}
function Skirt({ fill, dark }: { fill: string; dark: string }) {
  return (
    <Svg w={64} h={100}>
      {hanger}
      <path d="M21 18 H43 L54 80 H10 Z" fill={fill} />
      <path d="M21 24 H43" stroke={dark} strokeWidth={1.4} />
      <path d="M26 26 L20 80 M32 26 V80 M38 26 L44 80" stroke={dark} strokeWidth={1} opacity={0.6} />
    </Svg>
  );
}
function Blouse({ fill, dark }: { fill: string; dark: string }) {
  return (
    <Svg w={64} h={100}>
      {hanger}
      <path d="M21 18 L8 38 L15 43 L22 34 Z M43 18 L56 38 L49 43 L42 34 Z" fill={fill} stroke={dark} strokeWidth={0.6} />
      <path d="M21 18 C26 25 38 25 43 18 L45 70 H19 Z" fill={fill} stroke={dark} strokeWidth={0.6} />
      <path d="M32 24 V70" stroke={dark} strokeWidth={1} />
      <circle cx={32} cy={34} r={1.2} fill={dark} />
      <circle cx={32} cy={44} r={1.2} fill={dark} />
      <circle cx={32} cy={54} r={1.2} fill={dark} />
    </Svg>
  );
}

const SHOES: ReactNode[] = [
  <Stiletto fill={C.nude} dark={C.nudeDark} />,
  <Sneaker />,
  <BlockHeel fill={C.burgundy} dark={C.burgundyDark} />,
  <Ballerina fill={C.beige} dark={C.beigeDark} />,
  <AnkleBoot fill={C.tan} dark={C.tanDark} />,
  <Stiletto fill={C.black} dark="#000000" />,
  <Ballerina fill={C.pink} dark={C.burgundy} />,
  <AnkleBoot fill={C.black} dark="#000000" />,
];
const DRESSES: ReactNode[] = [
  <Dress fill={C.black} dark="#55484C" hem={84} flare={20} />,
  <Dress fill={C.cream} dark={C.beigeDark} hem={90} flare={14} slip />,
  <Dress fill={C.burgundy} dark={C.burgundyDark} hem={94} flare={24} />,
  <Dress fill={C.pink} dark={C.burgundy} hem={66} flare={20} ruffle />,
  <Dress fill={C.beige} dark={C.beigeDark} hem={94} flare={18} sleeves />,
  <Dress fill={C.black} dark="#55484C" hem={82} flare={22} dots />,
];
const ABAYAS: ReactNode[] = [
  <Abaya fill={C.beige} trim={C.beigeDark} />,
  <Abaya fill={C.black} trim={GOLD} />,
  <Abaya fill={C.burgundy} trim={C.burgundyDark} />,
  <Abaya fill={C.mauve} trim="#8E6475" />,
  <Abaya fill={C.brown} trim={GOLD} />,
  <Abaya fill={C.cream} trim={C.beigeDark} />,
];
const BELTS: ReactNode[] = [
  <Belt fill={C.black} dark="#000000" />,
  <Belt fill={C.burgundy} dark={C.burgundyDark} />,
  <Belt fill={C.tan} dark={C.tanDark} />,
  <Belt fill={C.navy} dark="#1B2440" />,
  <Belt fill={C.brown} dark="#4A2F23" />,
  <Belt fill={C.cream} dark={C.beigeDark} />,
];
const CLOTHES: ReactNode[] = [
  <Blazer fill={C.cream} dark={C.beigeDark} />,
  <Trousers fill={C.beige} dark={C.beigeDark} />,
  <Blouse fill={C.white} dark="#CFC4BC" />,
  <Skirt fill={C.olive} dark="#6E755A" />,
  <Blazer fill={C.black} dark="#55484C" />,
  <Blouse fill={C.blue} dark="#8AA2C2" />,
  <Trousers fill={C.black} dark="#55484C" />,
  <Skirt fill={C.burgundy} dark={C.burgundyDark} />,
];

/** Picks the drawn set for a category from its names; unknown categories get everyday clothes. */
export function categoryArt(category: { name?: string | null; nameAr?: string | null; slug?: string | null }): ReactNode[] {
  const t = `${category.name || ""} ${category.slug || ""} ${category.nameAr || ""}`.toLowerCase();
  if (/shoe|heel|boot|sneaker|sandal|حذ|شوز|كعب|جزم|بوت/.test(t)) return SHOES;
  if (/abaya|عباي|عباء/.test(t)) return ABAYAS;
  if (/belt|قشط|قشاط|حزام|أحزمة/.test(t)) return BELTS;
  if (/dress|فستان|فساتين/.test(t)) return DRESSES;
  return CLOTHES;
}
