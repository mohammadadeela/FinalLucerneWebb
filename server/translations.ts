// English/Arabic names for the shop.
//
// The catalogue is written in Arabic. Each category and subcategory has an Arabic name
// (name_ar) and an English one (name); each product has its original name and description
// plus an optional English pair (name_en, description_en); site texts come in *_ar / *_en
// pairs. This file does three things:
//   1. finds every text that is missing in one of the two languages,
//   2. writes the missing ones with AI when the admin asks for it,
//   3. hands the shop the English names when a customer browses in English.
import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";

const MODEL = process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_MODEL || "gemini-flash-latest";
const API_BASE = (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");

const hasArabic = (s: unknown) => /[؀-ۿ]/.test(String(s ?? ""));
const hasLatin = (s: unknown) => /[A-Za-z]/.test(String(s ?? ""));
const blank = (s: unknown) => !String(s ?? "").trim();

export type TranslationKind = "category" | "subcategory" | "product" | "text";
export type TranslationRow = {
  /** kind:id:field — e.g. "product:12:name" or "text:home_hero_title". */
  key: string;
  kind: TranslationKind;
  field: "name" | "description" | "text";
  /** A short label for the admin, e.g. the parent category. */
  label: string;
  ar: string;
  en: string;
  missing: "en" | "ar" | null;
};

/** Every text of the shop with both of its languages, and which one is missing. */
export async function collectTranslations(): Promise<TranslationRow[]> {
  const [cats, subs, products, settings] = await Promise.all([
    storage.getCategories(),
    storage.getSubcategories(),
    storage.getProducts(),
    storage.getSiteSettings(),
  ]);
  const rows: TranslationRow[] = [];
  const catName = new Map<number, string>();

  const pair = (key: string, kind: TranslationKind, field: TranslationRow["field"], label: string, arRaw: unknown, enRaw: unknown) => {
    const ar = String(arRaw ?? "").trim();
    const en = String(enRaw ?? "").trim();
    // English counts as missing when it is empty or still written in Arabic letters.
    const missing = !ar && !en ? null : blank(en) || hasArabic(en) ? "en" : blank(ar) ? "ar" : null;
    if (ar || en) rows.push({ key, kind, field, label, ar, en, missing });
  };

  for (const c of cats as any[]) {
    catName.set(c.id, c.nameAr || c.name);
    // Old categories may hold the Arabic name in "name" with name_ar empty.
    const ar = c.nameAr || (hasArabic(c.name) ? c.name : "");
    const en = hasArabic(c.name) ? "" : c.name;
    pair(`category:${c.id}:name`, "category", "name", "", ar, en);
  }
  for (const s of subs as any[]) {
    const ar = s.nameAr || (hasArabic(s.name) ? s.name : "");
    const en = hasArabic(s.name) ? "" : s.name;
    pair(`subcategory:${s.id}:name`, "subcategory", "name", catName.get(s.categoryId) || "", ar, en);
  }
  for (const p of products as any[]) {
    const label = catName.get(p.categoryId) || "";
    // A name already written in Latin letters (a brand or model name) needs no English copy.
    const nameEn = p.nameEn || (!hasArabic(p.name) ? p.name : "");
    pair(`product:${p.id}:name`, "product", "name", label, p.name, nameEn);
    if (!blank(p.description)) {
      const descEn = p.descriptionEn || (!hasArabic(p.description) ? p.description : "");
      pair(`product:${p.id}:description`, "product", "description", p.name, p.description, descEn);
    }
  }
  const byKey = new Map((settings as any[]).map((s) => [s.key, s.value]));
  const seen = new Set<string>();
  for (const key of byKey.keys()) {
    const m = /^(.*)_(ar|en)$/.exec(key);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const ar = byKey.get(`${m[1]}_ar`);
    const en = byKey.get(`${m[1]}_en`);
    // Leave out things that are not sentences: links, numbers, colours, JSON.
    const sample = String(ar || en || "");
    if (/^(https?:|\/|#|\{|\[)/.test(sample.trim()) || !/[؀-ۿA-Za-z]{2}/.test(sample)) continue;
    pair(`text:${m[1]}`, "text", "text", m[1], ar, en);
  }
  return rows;
}

async function gemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error("GEMINI_API_KEY is not set"), { code: "no_key" });
  const res = await fetch(`${API_BASE}/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    const noCredit = res.status === 402 || /prepayment credits|credits are depleted|enable billing/i.test(text);
    throw Object.assign(new Error(`Gemini ${res.status}: ${text}`), { code: noCredit ? "no_credit" : res.status === 429 ? "busy" : "failed" });
  }
  const data: any = await res.json();
  return (data?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
}

/** Translates a batch of texts. Returns id → translation; texts the AI skipped are left out. */
async function translateBatch(items: { id: string; text: string; what: string }[], to: "en" | "ar"): Promise<Record<string, string>> {
  const target = to === "en" ? "English" : "Arabic";
  const prompt = [
    `You write the ${target} texts for Lucerne Boutique, a women's fashion shop (dresses, abayas, tops, trousers, shoes, bags, accessories).`,
    `Translate each item below from ${to === "en" ? "Arabic" : "English"} into natural ${target} the way a good fashion shop would write it.`,
    `Rules:`,
    `- "name" items are product or category names: short, title case, no full stop, no quotation marks. Translate the meaning; do not transliterate Arabic words letter by letter unless it is a brand or a garment name with no English word (e.g. "Abaya").`,
    `- "description" and "text" items: keep the same meaning, facts, sizes, numbers and line breaks. Do not add claims, prices, materials or emojis that are not in the original.`,
    `- Keep brand names, model codes and numbers exactly as written.`,
    `Reply with JSON only, in this exact shape: {"items":[{"id":"...","text":"..."}]} — one entry per item, same ids.`,
    ``,
    JSON.stringify({ items: items.map((i) => ({ id: i.id, kind: i.what, text: i.text })) }),
  ].join("\n");
  const raw = await gemini(prompt);
  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw Object.assign(new Error("The AI reply could not be read"), { code: "failed" });
  }
  const out: Record<string, string> = {};
  for (const entry of parsed?.items || []) {
    const text = String(entry?.text ?? "").trim();
    if (!entry?.id || !text) continue;
    // A translation still in the wrong alphabet is no translation.
    if (to === "en" ? !hasLatin(text) || hasArabic(text) : !hasArabic(text)) continue;
    out[String(entry.id)] = text;
  }
  return out;
}

/** Saves one text in one language. */
async function saveTranslation(key: string, lang: "en" | "ar", value: string): Promise<boolean> {
  const [kind, id, field] = key.split(":");
  const text = value.trim();
  if (!text) return false;
  if (kind === "text") {
    await storage.setSiteSetting(`${id}_${lang}`, text);
    return true;
  }
  const numId = Number(id);
  if (!Number.isFinite(numId)) return false;
  if (kind === "category") return !!(await storage.updateCategory(numId, (lang === "en" ? { name: text } : { nameAr: text }) as any));
  if (kind === "subcategory") return !!(await storage.updateSubcategory(numId, (lang === "en" ? { name: text } : { nameAr: text }) as any));
  if (kind === "product") {
    if (lang === "en") return !!(await storage.updateProduct(numId, (field === "description" ? { descriptionEn: text } : { nameEn: text }) as any));
    return !!(await storage.updateProduct(numId, (field === "description" ? { description: text } : { name: text }) as any));
  }
  return false;
}

/**
 * For a customer browsing in English: swap each product's name and description for the
 * English ones where they exist. The originals stay available as nameAr / descriptionAr.
 * Nothing is changed for the admin area, which never sends the header.
 */
function localize(value: any, depth = 0): any {
  if (!value || typeof value !== "object" || depth > 6) return value;
  if (Array.isArray(value)) {
    for (const item of value) localize(item, depth + 1);
    return value;
  }
  if (typeof value.nameEn === "string" && value.nameEn.trim() && typeof value.name === "string") {
    if (value.nameAr === undefined) value.nameAr = value.name;
    value.name = value.nameEn;
  }
  if (typeof value.descriptionEn === "string" && value.descriptionEn.trim() && typeof value.description === "string") {
    value.descriptionAr = value.description;
    value.description = value.descriptionEn;
  }
  for (const k of Object.keys(value)) {
    const v = value[k];
    if (v && typeof v === "object") localize(v, depth + 1);
  }
  return value;
}

export function storeLanguageMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method !== "GET" || !req.path.startsWith("/api/") || req.path.startsWith("/api/admin")) return next();
  res.vary("X-Store-Lang");
  if (req.get("x-store-lang") !== "en") return next();
  const json = res.json.bind(res);
  res.json = ((body: any) => {
    try {
      // Work on a copy: some routes answer from a shared in-memory cache.
      body = localize(JSON.parse(JSON.stringify(body)));
    } catch {
      /* send it as it is */
    }
    return json(body);
  }) as any;
  next();
}

export function registerTranslationRoutes(app: Express) {
  const admin = (req: Request, res: Response): boolean => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return false;
    }
    return true;
  };

  // Everything, with what is missing.
  app.get("/api/admin/translations", async (req, res) => {
    if (!admin(req, res)) return;
    const rows = await collectTranslations();
    res.json({ success: true, data: { rows, aiReady: !!process.env.GEMINI_API_KEY } });
  });

  // Write the missing language with AI for the chosen rows (or all missing rows).
  app.post("/api/admin/translations/generate", async (req, res) => {
    if (!admin(req, res)) return;
    const wanted: string[] | null = Array.isArray(req.body?.keys) ? req.body.keys.map(String) : null;
    const overwrite = req.body?.overwrite === true;
    const all = await collectTranslations();
    const pick = all.filter((r) => (wanted ? wanted.includes(r.key) : !!r.missing));
    // Rows that have both languages are only redone when the admin asks to overwrite the English.
    const jobs = pick
      .map((r) => ({ row: r, to: (r.missing || (overwrite ? "en" : null)) as "en" | "ar" | null }))
      .filter((j) => j.to && !blank(j.to === "en" ? j.row.ar : j.row.en))
      .slice(0, 400);

    const done: { key: string; lang: "en" | "ar"; value: string }[] = [];
    let stopped: string | null = null;
    for (const to of ["en", "ar"] as const) {
      const list = jobs.filter((j) => j.to === to);
      // Names go many at a time; descriptions are longer, so fewer per request.
      const names = list.filter((j) => j.row.field === "name");
      const longer = list.filter((j) => j.row.field !== "name");
      const batches: (typeof list)[] = [];
      for (let i = 0; i < names.length; i += 40) batches.push(names.slice(i, i + 40));
      for (let i = 0; i < longer.length; i += 10) batches.push(longer.slice(i, i + 10));
      for (const batch of batches) {
        if (stopped) break;
        try {
          const out = await translateBatch(batch.map((j) => ({ id: j.row.key, text: to === "en" ? j.row.ar : j.row.en, what: j.row.field })), to);
          for (const j of batch) {
            const value = out[j.row.key];
            if (value && (await saveTranslation(j.row.key, to, value))) done.push({ key: j.row.key, lang: to, value });
          }
        } catch (err: any) {
          // Stop at the first failure so a billing problem does not keep sending requests.
          stopped = err?.code || "failed";
          console.error("[translations]", err?.message || err);
        }
      }
    }
    res.json({ success: true, data: { done, asked: jobs.length, stopped } });
  });

  // The admin's own wording for one text.
  app.put("/api/admin/translations", async (req, res) => {
    if (!admin(req, res)) return;
    const key = String(req.body?.key || "");
    const lang = req.body?.lang === "ar" ? "ar" : "en";
    const value = String(req.body?.value || "").slice(0, 5000);
    if (!/^(category|subcategory|product):\d+:(name|description)$|^text:[a-z0-9_]+$/i.test(key)) return res.status(400).json({ success: false, message: "Bad key" });
    const ok = await saveTranslation(key, lang, value);
    res.status(ok ? 200 : 400).json({ success: ok });
  });
}
