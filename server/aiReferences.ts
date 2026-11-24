// Real products as the models for AI-made site photos.
//
// When the admin generates a banner, a category or subcategory photo, a menu tile or a banner
// clip, the AI is no longer asked to imagine "a dress". The shop's own products are chosen
// for the subject and their photos are handed to the AI as references, so the picture shows
// pieces a customer can actually buy.
//
// Choosing, in order of weight: the subcategory or category named in the subject, the kind
// of product it describes (shoes, dress, bag…), words shared with product names, then what
// sells best. Only pieces in stock with a hosted photo are used, and different colours are
// preferred so a row of pieces does not look like one product repeated.
import sharp from "sharp";
import { storage } from "./storage";
import { kindOf, type Kind } from "../client/src/lib/outfitMatch";

export type ReferenceProduct = { id: number; name: string; url: string; kind: Kind };
export type ReferenceImage = { data: string; mimeType: string };

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const words = (s: unknown) => norm(s).split(" ").filter((w) => w.length > 2);
// A name "appears" in the subject when one contains the other (handles plurals and "ال").
const mentions = (subject: string, name: unknown) => {
  const n = norm(name);
  if (n.length < 3) return false;
  if (subject.includes(n)) return true;
  return words(n).some((w) => subject.includes(w) || subject.split(" ").some((sw) => sw.length > 3 && w.includes(sw)));
};

function mainPhoto(product: any, variant?: any): string {
  const media = Array.isArray(variant?.media) ? variant.media.filter((m: any) => m?.type === "image" && m.url) : [];
  return String((media.find((m: any) => m.isPrimary) || media[0])?.url || variant?.mainImage || product.mainImage || "").trim();
}

/** How many real pieces each kind of photo should show. */
export function referenceCount(slot: string): number {
  if (slot === "row") return 6;
  if (slot === "promo") return 5;
  if (slot === "homeHero" || slot === "pageHero") return 3;
  if (slot === "editorialCenter") return 2;
  return 1; // tiles, circles, pills, menu photos: one clear piece
}

/** The shop's products that best fit a subject such as "Dresses", "أحذية شتوية" or "New collection". */
export async function pickReferenceProducts(subject: string, count: number): Promise<ReferenceProduct[]> {
  const [categories, subcategories, products, bestSellers] = await Promise.all([
    storage.getCategories(),
    storage.getSubcategories(),
    storage.getProducts(),
    storage.getBestSellers(80).catch(() => []),
  ]);
  const text = norm(subject);
  const rank = new Map((bestSellers as any[]).map((p, i) => [p.id, i]));
  const subjectKind = kindOf({ name: subject }, []);

  const cats = (categories as any[]).filter((c) => mentions(text, c.name) || mentions(text, c.nameAr) || mentions(text, c.slug));
  const subs = (subcategories as any[]).filter((s) => mentions(text, s.name) || mentions(text, s.nameAr));
  const catIds = new Set(cats.map((c) => c.id));
  const subIds = new Set(subs.map((s) => s.id));
  const subjectWords = words(subject);

  const scored = (products as any[])
    .filter((p) => (p.stockQuantity ?? 0) > 0 && /^https?:\/\//i.test(mainPhoto(p, (p.colorVariants || [])[0])))
    .map((p) => {
      let score = 0;
      const inSub = subIds.has(Number(p.subcategoryId)) || (Array.isArray(p.subcategoryIds) && p.subcategoryIds.some((id: any) => subIds.has(Number(id))));
      if (inSub) score += 100;
      if (catIds.has(Number(p.categoryId))) score += 60;
      const kind = kindOf(p, categories as any[]);
      if (subjectKind !== "other" && kind === subjectKind) score += 45;
      const nameWords = words(`${p.name} ${p.nameEn || ""}`);
      score += Math.min(30, nameWords.filter((w) => subjectWords.some((sw) => sw === w || (sw.length > 3 && (w.includes(sw) || sw.includes(w))))).length * 15);
      return { p, kind, score };
    });

  const matched = scored.filter((s) => s.score > 0);
  // The subject names a kind of product or a category the shop has nothing in stock for
  // ("Bags" with no bags): no references, rather than showing shoes on a bags photo.
  const specific = subjectKind !== "other" || cats.length > 0 || subs.length > 0;
  if (specific && matched.length === 0) return [];
  // A subject that names nothing in particular ("New collection", "Welcome") gets the best sellers.
  const pool = (matched.length ? matched : scored).map((s) => {
    const r = rank.get(s.p.id);
    return { ...s, score: s.score + (r !== undefined ? Math.max(4, 40 - r) : 0) + (s.p.isNewArrival ? 5 : 0) };
  });
  pool.sort((a, b) => b.score - a.score);

  const out: ReferenceProduct[] = [];
  const usedColours = new Set<string>();
  const usedKinds = new Map<Kind, number>();
  const generic = matched.length === 0;
  for (const pass of [0, 1]) {
    for (const s of pool) {
      if (out.length >= count) break;
      if (out.some((o) => o.id === s.p.id)) continue;
      const variants: any[] = s.p.colorVariants || [];
      // First pass: a colour not shown yet (and, for a generic subject, a mix of kinds).
      const variant = variants.find((v) => v?.name && !usedColours.has(norm(v.name))) || (pass === 1 ? variants[0] : undefined);
      if (pass === 0 && variants.length && !variant) continue;
      if (pass === 0 && generic && (usedKinds.get(s.kind) || 0) >= Math.ceil(count / 2)) continue;
      const url = mainPhoto(s.p, variant);
      if (!/^https?:\/\//i.test(url)) continue;
      if (variant?.name) usedColours.add(norm(variant.name));
      usedKinds.set(s.kind, (usedKinds.get(s.kind) || 0) + 1);
      out.push({ id: s.p.id, name: s.p.nameEn || s.p.name, url, kind: s.kind });
    }
  }
  return out;
}

/** Downloads the reference photos, sized for the AI. Photos that cannot be read are skipped. */
export async function loadReferenceImages(refs: ReferenceProduct[]): Promise<{ refs: ReferenceProduct[]; images: ReferenceImage[] }> {
  const kept: ReferenceProduct[] = [];
  const images: ReferenceImage[] = [];
  for (const ref of refs) {
    try {
      const res = await fetch(ref.url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const buffer = await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
      kept.push(ref);
      images.push({ data: buffer.toString("base64"), mimeType: "image/jpeg" });
    } catch {
      /* skip this one */
    }
  }
  return { refs: kept, images };
}

/** The part of the prompt that tells the AI what the attached photos are and how to use them. */
export function referencePrompt(refs: ReferenceProduct[]): string {
  if (!refs.length) return "";
  const list = refs.map((r, i) => `  Photo ${i + 1}: ${r.name}`).join("\n");
  return `REAL PRODUCTS — the ${refs.length === 1 ? "attached photo shows a real product" : `${refs.length} attached photos show real products`} this shop sells:
${list}
The photograph you create must show ${refs.length === 1 ? "this exact product" : "these exact products, one from each photo"} — re-photographed on the set described below, as if the same physical item${refs.length === 1 ? " was" : "s were"} carried into the studio.
- Keep each product's true design: its shape and cut, exact colour, fabric or material, pattern, length, heel height, straps, buttons, embroidery and every decoration. Do not redesign, recolour, simplify or "improve" it, and do not invent other products.
- Take ONLY the product from each attached photo. Ignore everything else in it: the background, the room, the floor, the mannequin or person, hands, hangers and props.
- Any watermark, logo or text printed across an attached photo (for example a butterfly mark or the words "Lucerne Boutique") is NOT part of the product. Never reproduce it, and paint the product clean where it covered it.
- If a product is worn or held in its photo, show it clean, complete and unworn as described in "Presentation", unless a model is asked for below — then a new fictional model wears it.
- Show each product once, whole, and at a natural size in proportion to the others.`;
}
