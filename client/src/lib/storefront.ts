/** Small helpers shared by the storefront landing page and navigation. */

const DEDICATED_ROUTES: Record<string, string> = {
  dresses: "/dresses",
  shoes: "/shoes",
  clothes: "/clothes",
};

/** Storefront URL of a category (the three original categories have their own pages). */
export function categoryHref(category: { slug?: string | null } | null | undefined): string {
  const slug = category?.slug || "";
  if (!slug) return "/shop";
  return DEDICATED_ROUTES[slug] ?? `/category/${slug}`;
}

/** Storefront URL of a subcategory inside its parent category page. */
export function subcategoryHref(
  parent: { slug?: string | null } | null | undefined,
  subId: number | string,
): string {
  return `${categoryHref(parent)}?sub=${subId}`;
}

/**
 * Splits a headline into a plain part and an accented part.
 *
 * The admin can mark the accent explicitly with asterisks — "Your style, your *story.*" —
 * otherwise the last word is accented automatically, so any hero title the
 * admin types gets the editorial two-tone treatment with no extra work.
 */
export function splitAccent(title: string): { lead: string; accent: string; tail: string } {
  const text = (title || "").trim();
  const marked = text.match(/^([\s\S]*?)\*([\s\S]+?)\*([\s\S]*)$/);
  if (marked) {
    return { lead: marked[1], accent: marked[2], tail: marked[3] };
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return { lead: text, accent: "", tail: "" };
  const accent = words[words.length - 1];
  return { lead: words.slice(0, -1).join(" ") + " ", accent, tail: "" };
}
