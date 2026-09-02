import type { ChatEntities } from "./entityExtractor";

/* Known categories that have dedicated, nicely-designed landing pages.
   Anything not listed here (e.g. admin-added categories) falls back to the
   generic dynamic route /category/<slug>. */
const HARD_ROUTES: Record<string, string> = {
  dresses: "/dresses",
  shoes:   "/shoes",
  heels:   "/shoes",
  sandals: "/shoes",
  boots:   "/shoes",
  clothes: "/clothes",
  tops:    "/clothes",
  pants:   "/clothes",
  skirts:  "/clothes",
  blazers: "/clothes",
};

export function buildProductUrl(
  entities: ChatEntities,
  knownCategorySlugs?: Set<string>,
): string {
  const cat = entities.category;

  // Route priority: dedicated hardcoded page → real DB category page → /shop.
  // Hardcoded-only aliases with no DB category (e.g. "abayas") fall back to
  // /shop so we never link to a non-existent /category/<slug> page.
  let base = "/shop";
  if (cat) {
    if (HARD_ROUTES[cat]) base = HARD_ROUTES[cat];
    else if (knownCategorySlugs?.has(cat)) base = `/category/${cat}`;
    else base = "/shop";
  }

  const params = new URLSearchParams();

  // Destination pages read these exact param names:
  //   CategoryPage / DynamicCategoryPage → ?sub= ?color= ?size=
  //   Shop → ?color= ?size=
  if (entities.subcategory) params.set("sub",   entities.subcategory);
  if (entities.color)       params.set("color", entities.color);
  if (entities.size)        params.set("size",  entities.size);

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
