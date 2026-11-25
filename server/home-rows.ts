/**
 * The rules that decide what the two product rows on the home page show.
 * Pure functions (no database), so the rules can be read and tested in one place.
 */

type Piece = {
  id: number;
  categoryId?: number | null;
  stockQuantity?: number | null;
  isNewArrival?: boolean | null;
  createdAt?: Date | string | null;
};

const DAY = 24 * 60 * 60 * 1000;
const addedAt = (p: Piece) => +new Date(p.createdAt || 0);

/** A category stays in "New Season" for at least a month after its last delivery. */
export const NEW_SEASON_MIN_DAYS = 30;
/** Fewer new pieces than this is a stray addition, not a delivery (unless marked "New"). */
const REAL_DELIVERY_SIZE = 3;

/**
 * NEW SEASON
 *
 * 1. A piece is new when it is in stock and was added in the last `days` days
 *    (never less than a month, so a category is not dropped a week after its delivery).
 * 2. A category takes part only when it really received something new in that time:
 *    at least one new piece marked "New", or a delivery of 3+ pieces. A category that
 *    got nothing new (or only a stray unmarked piece) is left out completely.
 * 3. The categories take turns, the one with the most recent delivery first, so the row
 *    always mixes every category that has news and the last category stocked can't fill it.
 * 4. Inside a category: pieces marked "New" first, then the newest.
 */
export function pickNewSeason<T extends Piece>(all: T[], limit = 10, days = NEW_SEASON_MIN_DAYS, now = Date.now()): T[] {
  const since = now - Math.max(days, NEW_SEASON_MIN_DAYS) * DAY;
  const byCategory = new Map<number, T[]>();
  for (const p of all) {
    if ((p.stockQuantity ?? 0) <= 0 || addedAt(p) < since) continue;
    const key = Number(p.categoryId) || 0;
    byCategory.set(key, [...(byCategory.get(key) || []), p]);
  }
  const queues = [...byCategory.values()]
    .filter((list) => list.length >= REAL_DELIVERY_SIZE || list.some((p) => p.isNewArrival))
    .map((list) => ({
      newest: Math.max(...list.map(addedAt)),
      list: list.sort((a, b) => Number(!!b.isNewArrival) - Number(!!a.isNewArrival) || addedAt(b) - addedAt(a) || b.id - a.id),
    }))
    .sort((a, b) => b.newest - a.newest);

  const out: T[] = [];
  while (out.length < limit && queues.some((q) => q.list.length)) {
    for (const q of queues) {
      const next = q.list.shift();
      if (next) out.push(next);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/**
 * BEST SELLERS
 *
 * `ranked` is every in-stock piece that has real sales, best first, with its sales score.
 *
 * 1. Every category that sells gets guaranteed places (2 when the row has 8+ places),
 *    so shoes are always in the row even when dresses sell more pieces.
 * 2. The places that are left are shared by how much each category really sells,
 *    and no category takes more than 40% of the row while others still have pieces.
 * 3. Inside a category only its own top sellers are taken, in sales order.
 * 4. The row opens with the number-one piece of each category (biggest-selling category
 *    first), so the first cards the customer sees already cover the whole shop; after
 *    that the pieces follow by sales, never more than two of one category in a row.
 */
export function pickBestSellers<T extends Piece>(ranked: { p: T; score: number }[], limit = 8): T[] {
  const groups = new Map<number, { p: T; score: number }[]>();
  for (const row of ranked) {
    const key = Number(row.p.categoryId) || 0;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const cats = [...groups.entries()]
    .map(([id, rows]) => ({ id, rows, total: rows.reduce((sum, r) => sum + r.score, 0), seats: 0 }))
    .sort((a, b) => b.total - a.total);
  if (cats.length === 0) return [];

  const places = Math.min(limit, ranked.length);
  const guaranteed = limit >= 8 ? 2 : 1;
  const cap = Math.max(guaranteed, Math.ceil(limit * 0.4));

  // Guaranteed places, one round at a time so a short row still reaches every category.
  let left = places;
  for (let round = 0; round < guaranteed; round++) {
    for (const c of cats) {
      if (left > 0 && c.seats < c.rows.length && c.seats === round) { c.seats++; left--; }
    }
  }
  // The rest by real sales: each free place goes to the category whose next piece is owed most.
  const grand = cats.reduce((sum, c) => sum + c.total, 0) || 1;
  const give = (respectCap: boolean) => {
    while (left > 0) {
      const open = cats.filter((c) => c.seats < c.rows.length && (!respectCap || c.seats < cap));
      if (open.length === 0) return;
      open.sort((a, b) => (b.total / grand) / (b.seats + 1) - (a.total / grand) / (a.seats + 1));
      open[0].seats++;
      left--;
    }
  };
  give(true);
  give(false); // only reached when the capped categories could not fill the row

  const lead = cats.filter((c) => c.seats > 0).map((c) => c.rows[0]);
  const rest = cats.flatMap((c) => c.rows.slice(1, c.seats)).sort((a, b) => b.score - a.score);

  const out = lead.map((r) => r.p);
  while (rest.length) {
    const n = out.length;
    const blocked = n >= 2 && out[n - 1].categoryId === out[n - 2].categoryId ? out[n - 1].categoryId : undefined;
    let index = blocked === undefined ? 0 : rest.findIndex((r) => r.p.categoryId !== blocked);
    if (index < 0) index = 0;
    out.push(rest.splice(index, 1)[0].p);
  }
  return out;
}
