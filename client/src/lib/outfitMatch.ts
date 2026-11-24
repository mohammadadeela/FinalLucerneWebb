/* Which pieces to suggest beside a product.
 *
 * Two rows on the product page are built here:
 *   - "Complete your look": pieces of OTHER kinds that make an outfit with this one
 *     (a dress → shoes, a bag, an accessory), one of each kind first.
 *   - "People also buy": what customers really bought or viewed with it, from any
 *     category, mixed so the row is never a wall of one kind.
 *
 * Each candidate gets a score from: bought/viewed together and sales rank (the order of the
 * server's recommendation list), how well its kind completes this one, colour harmony,
 * a price in the same range, and being on sale. Only pieces in stock are suggested.
 */

type P = any;

export type Kind = "dress" | "abaya" | "top" | "bottom" | "shoes" | "bag" | "belt" | "accessory" | "other";

const KIND_WORDS: [Kind, RegExp][] = [
  ["abaya", /abaya|عباي|عبايه|عبايات/i],
  ["dress", /dress|gown|jumpsuit|فستان|فساتين|جمبسوت/i],
  ["shoes", /shoe|heel|\bboot|sneaker|sandal|\bflats?\b|slipper|loafer|حذاء|أحذية|احذية|شوز|كعب|بوت|صندل|سنيكر/i],
  ["bag", /bag|clutch|wallet|purse|backpack|حقيبة|حقائب|شنطة|شنط|محفظة|كلتش/i],
  ["belt", /belt|حزام|أحزمة|احزمة|قشاط|أقشطة|اقشطة/i],
  ["accessory", /accessor|jewel|scarf|\bhat\b|glasses|\bwatch|necklace|earring|bracelet|إكسسوار|اكسسوار|مجوهرات|وشاح|شال|قبعة|نظارة|ساعة|عقد|حلق|اسوارة|إسوارة/i],
  ["bottom", /\bpants?\b|trouser|skirt|jeans?\b|\bshorts\b|legging|بنطلون|بنطال|بناطيل|تنورة|تنانير|جينز|شورت/i],
  ["top", /\btops?\b|blouse|shirt|\btee\b|sweater|jacket|\bcoat|cardigan|hoodie|blazer|vest|بلوزة|بلوزات|قميص|قمصان|تيشيرت|كنزة|جاكيت|معطف|بليزر|ملابس|clothes/i],
];

export function kindOf(product: P, categories: P[] | undefined): Kind {
  const cat = (categories || []).find((c) => c.id === product?.categoryId);
  const fromCategory = `${cat?.name || ""} ${cat?.nameAr || ""} ${cat?.slug || ""}`;
  // The product's own name is more exact than a broad category such as "clothes".
  const fromName = `${product?.name || ""} ${product?.nameAr || ""}`;
  for (const text of [fromName, fromCategory]) {
    for (const [kind, words] of KIND_WORDS) if (words.test(text)) return kind;
  }
  return "other";
}

/** What completes each kind, best first. */
const COMPLETES: Record<Kind, Kind[]> = {
  dress: ["shoes", "bag", "accessory", "belt", "abaya"],
  abaya: ["bag", "shoes", "accessory", "dress"],
  top: ["bottom", "shoes", "bag", "accessory", "belt"],
  bottom: ["top", "shoes", "belt", "bag", "accessory"],
  shoes: ["bag", "dress", "bottom", "accessory", "top"],
  bag: ["shoes", "dress", "accessory", "abaya", "top"],
  belt: ["bottom", "dress", "bag", "shoes"],
  accessory: ["dress", "bag", "top", "shoes"],
  other: ["dress", "shoes", "bag", "top", "bottom", "accessory"],
};

function hue(hex: string | undefined): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return -1;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  // Black, white, grey and beige go with everything: treated as neutral.
  if (max - min < 0.12) return -2;
  let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
const hues = (p: P) => ((p?.colorVariants as any[]) || []).map((v) => hue(v?.colorCode)).filter((h) => h !== -1);

/** 0–1: how well two pieces' colours sit together. */
function colourHarmony(a: P, b: P): number {
  const ha = hues(a), hb = hues(b);
  if (!ha.length || !hb.length) return 0.5;
  let best = 0;
  for (const x of ha) {
    for (const y of hb) {
      if (x === -2 || y === -2) { best = Math.max(best, 0.85); continue; } // a neutral always works
      const d = Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
      best = Math.max(best, d <= 25 ? 1 : d >= 150 ? 0.8 : d <= 60 ? 0.6 : 0.3);
    }
  }
  return best;
}

const priceOf = (p: P) => parseFloat(String(p?.discountPrice || p?.price)) || 0;
const onSale = (p: P) => !!p?.discountPrice && Number(p.discountPrice) > 0 && Number(p.discountPrice) < Number(p.price);

function baseScore(product: P, candidate: P, rank: Map<number, number>): number {
  let score = 0;
  // Bought / viewed together and best sellers: earlier in the server's list is stronger.
  const r = rank.get(candidate.id);
  if (r !== undefined) score += Math.max(8, 60 - r * 2.5);
  score += colourHarmony(product, candidate) * 22;
  const a = priceOf(product), b = priceOf(candidate);
  if (a > 0 && b > 0) {
    const ratio = b / a;
    // An add-on that costs less than the main piece is the easiest "yes".
    score += ratio <= 1 && ratio >= 0.25 ? 16 : ratio <= 1.5 ? 9 : ratio <= 2.2 ? 3 : 0;
  }
  if (onSale(candidate)) score += 6;
  if (candidate.isNewArrival) score += 3;
  // A small stable shuffle so two similar products do not show the exact same row.
  score += ((product.id * 31 + candidate.id * 17) % 50) / 10;
  return score;
}

/** Takes the best of each group in turn, so no kind fills the row. */
function mixByKind(sorted: { p: P; kind: Kind }[], limit: number, perKind: number): P[] {
  const out: P[] = [];
  const used = new Map<Kind, number>();
  const rest = [...sorted];
  while (out.length < limit && rest.length) {
    const lastKind = out.length ? sorted.find((s) => s.p === out[out.length - 1])?.kind : undefined;
    let i = rest.findIndex((s) => (used.get(s.kind) || 0) < perKind && s.kind !== lastKind);
    if (i < 0) i = rest.findIndex((s) => (used.get(s.kind) || 0) < perKind);
    if (i < 0) break;
    const [pick] = rest.splice(i, 1);
    used.set(pick.kind, (used.get(pick.kind) || 0) + 1);
    out.push(pick.p);
  }
  return out;
}

const available = (product: P, all: P[]) => all.filter((p) => p.id !== product.id && (p.stockQuantity ?? 0) > 0);

/** Pieces of other kinds that finish the outfit. */
export function completeTheLook(product: P, all: P[], categories: P[] | undefined, recommendedIds: number[] = [], limit = 12): P[] {
  const rank = new Map(recommendedIds.map((id, i) => [id, i]));
  const mine = kindOf(product, categories);
  const wanted = COMPLETES[mine];
  const scored = available(product, all)
    .map((p) => ({ p, kind: kindOf(p, categories) }))
    .filter((c) => c.kind !== mine && (c.kind !== "other" || c.p.categoryId !== product.categoryId))
    .map((c) => {
      const order = wanted.indexOf(c.kind);
      return { ...c, score: baseScore(product, c.p, rank) + (order >= 0 ? 45 - order * 8 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  // Only kinds that are worn WITH this piece (never trousers beside a dress). Other kinds
  // are used only when the shop has too few of those to fill a row.
  const fitting = scored.filter((c) => wanted.includes(c.kind));
  const row = mixByKind(fitting, limit, Math.max(2, Math.ceil(limit / 3)));
  if (row.length >= 4) return row;
  return [...row, ...mixByKind(scored.filter((c) => !wanted.includes(c.kind)), limit - row.length, 2)];
}

/** What customers buy with it, from every category, mixed. */
export function peopleAlsoBuy(product: P, all: P[], categories: P[] | undefined, recommendedIds: number[] = [], exclude: P[] = [], limit = 12): P[] {
  const rank = new Map(recommendedIds.map((id, i) => [id, i]));
  const skip = new Set(exclude.map((p) => p.id));
  const mine = kindOf(product, categories);
  const wanted = COMPLETES[mine];
  const scored = available(product, all)
    .filter((p) => !skip.has(p.id))
    .map((p) => ({ p, kind: kindOf(p, categories) }))
    .map((c) => {
      const order = wanted.indexOf(c.kind);
      // The same kind is a fair alternative; a completing kind is a second sale.
      const kindBonus = c.kind === mine ? 14 : order >= 0 ? 20 - order * 3 : 0;
      return { ...c, score: baseScore(product, c.p, rank) + kindBonus };
    })
    .sort((a, b) => b.score - a.score);
  // At most a third of the row from one kind, never two of a kind side by side.
  return mixByKind(scored, limit, Math.max(2, Math.ceil(limit / 3)));
}
