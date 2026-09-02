export interface ChatEntities {
  category?: string;
  subcategory?: string;
  color?: string;
  size?: string;
  style?: string;
  occasion?: string;
  priceMax?: number;
  priceMin?: number;
}

/* Live taxonomy loaded from the DB so the bot understands admin-added
   categories / subcategories automatically (not just the hardcoded aliases). */
export interface TaxonomyCategory {
  slug: string;
  name: string;
  nameAr?: string | null;
}
export interface TaxonomySubcategory {
  slug: string;
  name: string;
  nameAr?: string | null;
  categorySlug: string;
}
export interface Taxonomy {
  categories: TaxonomyCategory[];
  subcategories: TaxonomySubcategory[];
}

/* Build a clean list of search aliases from a taxonomy entry. */
function aliasesOf(name: string, nameAr?: string | null, slug?: string): string[] {
  return [name, nameAr ?? "", (slug ?? "").replace(/[-_]+/g, " ")]
    .map((a) => a.trim())
    .filter((a) => norm(a).length >= 2);
}

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآاٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .trim();
}

function hasAny(text: string, words: string[]): boolean {
  const n = norm(text);
  return words.some((w) => n.includes(norm(w)));
}

const CATEGORIES: Record<string, string[]> = {
  dresses: ["فستان","فساتين","فستاني","ماكسي","ميدي","قفطان","dress","dresses","maxi","midi","gown"],
  shoes:   ["حذاء","احذيه","كندره","شوز","شوزات","shoe","shoes","footwear"],
  heels:   ["كعب","كعوب","ستيليتو","heel","heels","stiletto","pumps"],
  sandals: ["صندل","صنادل","sandal","sandals","flip flop"],
  boots:   ["بوت","بوتات","بوتس","boot","boots"],
  abayas:  ["عبايه","عبايات","abaya","abayas"],
  tops:    ["بلوزه","بلايز","قميص","توب","blouse","top","tops","shirt"],
  pants:   ["بنطلون","بناطيل","جينز","pants","trousers","jeans"],
  skirts:  ["تنوره","تنانير","skirt","skirts"],
  blazers: ["بليزر","بليزرات","سترة","blazer","blazers","jacket"],
  accessories: ["اكسسوار","اكسسوارات","حزام","حقيبه","accessories","accessory","bag","belt"],
  clothes: ["ملابس","لبس","قطعه","clothes","clothing","outfit","wear"],
};

const COLORS: Record<string, string[]> = {
  black:  ["اسود","أسود","سواد","black"],
  white:  ["ابيض","أبيض","white"],
  red:    ["احمر","أحمر","red"],
  beige:  ["بيج","كريمي","beige","cream"],
  pink:   ["زهري","وردي","بينك","pink","rose"],
  blue:   ["ازرق","أزرق","blue","navy"],
  green:  ["اخضر","أخضر","green"],
  brown:  ["بني","brown","chocolate"],
  gold:   ["ذهبي","golden","gold"],
  silver: ["فضي","silver"],
  purple: ["بنفسجي","موف","purple","lilac","mauve"],
  orange: ["برتقالي","orange"],
  yellow: ["اصفر","أصفر","yellow"],
  camel:  ["كاميل","جملي","camel"],
};

const STYLES: Record<string, string[]> = {
  casual:     ["كاجوال","يومي","جامعه","بيت","casual","daily","everyday","university"],
  formal:     ["رسمي","سهره","elegant","formal"],
  modest:     ["شرعي","محتشم","modest","conservative"],
  comfortable:["مريح","comfortable","comfy","relaxed"],
  luxury:     ["فخم","راقي","luxury","chic","classy"],
};

const OCCASIONS: Record<string, string[]> = {
  eid:        ["عيد","eid"],
  wedding:    ["عرس","زفاف","خطوبه","wedding","engagement","bride"],
  university: ["جامعه","university","school","college"],
  work:       ["شغل","عمل","مكتب","work","office","business"],
  party:      ["حفله","حفلة","party","event","celebration"],
  daily:      ["يومي","اليومي","daily","everyday"],
};

const SIZES = ["36","37","38","39","40","41","42","xxl","xl","xxs","xs","2xl","s","m","l"];

export function extractEntities(
  message: string,
  lastEntities?: ChatEntities,
  taxonomy?: Taxonomy,
): ChatEntities {
  const n = norm(message);
  const entities: ChatEntities = { ...lastEntities };

  /* Detect the category/subcategory mentioned in THIS message. A fresh match
     overrides whatever the previous turn carried over (so "shoes" → "dresses"
     switches correctly); if nothing matches, the lastEntities value persists
     (so a follow-up like "بدي احمر" keeps the current category). */
  let matchedCategory = false;

  /* ── Dynamic taxonomy from the DB first (the DB is the source of truth, so
        admin-added cats/subs win over the broad hardcoded buckets) ────────── */
  if (taxonomy) {
    // Subcategory is the most specific signal — it also pins the parent category.
    for (const sub of taxonomy.subcategories) {
      if (hasAny(n, aliasesOf(sub.name, sub.nameAr, sub.slug))) {
        entities.subcategory = sub.slug;
        if (sub.categorySlug) entities.category = sub.categorySlug;
        matchedCategory = true;
        break;
      }
    }
    if (!matchedCategory) {
      for (const cat of taxonomy.categories) {
        if (hasAny(n, aliasesOf(cat.name, cat.nameAr, cat.slug))) {
          entities.category = cat.slug;
          delete entities.subcategory;
          matchedCategory = true;
          break;
        }
      }
    }
  }

  /* ── Hardcoded colloquial aliases (شوز، كندره …) — fill the gaps the DB
        terms can't catch. Only runs when the DB pass found no category. ───── */
  if (!matchedCategory) {
    for (const [cat, words] of Object.entries(CATEGORIES)) {
      if (hasAny(n, words)) {
        if (["heels","sandals","boots"].includes(cat)) {
          entities.category = "shoes";
          entities.subcategory = cat;
        } else {
          entities.category = cat;
          delete entities.subcategory;
        }
        break;
      }
    }
  }

  for (const [color, words] of Object.entries(COLORS)) {
    if (hasAny(n, words)) { entities.color = color; break; }
  }

  for (const [style, words] of Object.entries(STYLES)) {
    if (hasAny(n, words)) { entities.style = style; break; }
  }

  for (const [occ, words] of Object.entries(OCCASIONS)) {
    if (hasAny(n, words)) { entities.occasion = occ; break; }
  }

  const words = n.split(/\s+/);
  for (const sz of SIZES) {
    if (words.includes(sz) || words.includes(sz.toLowerCase())) {
      entities.size = sz.toUpperCase();
      break;
    }
  }
  const sizeNumMatch = n.match(/\b(3[6-9]|4[0-2])\b/);
  if (sizeNumMatch && !entities.size) entities.size = sizeNumMatch[1];

  const maxMatch = n.match(/(?:اقل من|تحت|under|less than|max|below)\s*(\d+)/);
  if (maxMatch) entities.priceMax = parseInt(maxMatch[1]);
  const minMatch = n.match(/(?:فوق|اكثر من|above|over|min|more than)\s*(\d+)/);
  if (minMatch) entities.priceMin = parseInt(minMatch[1]);
  const betweenMatch = n.match(/(?:between|بين)\s*(\d+)\s*(?:and|و|to|-)\s*(\d+)/);
  if (betweenMatch) {
    entities.priceMin = parseInt(betweenMatch[1]);
    entities.priceMax = parseInt(betweenMatch[2]);
  }

  return entities;
}
