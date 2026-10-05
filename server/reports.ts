/**
 * Reports engine — single source of truth for the admin "Sales Report",
 * the "Category Capital" page and the per-category drill-down.
 *
 * Business rules (agreed with the shop owner)
 * ───────────────────────────────────────────
 *  • Sales    = money value of what was sold, AFTER discounts and AFTER
 *               returns/exchanges, shipping excluded.
 *               Website: only Delivered orders.  POS: every invoice.
 *  • Profit   = 50% of the PRODUCT PRICE × units sold (net of returned units).
 *               It is NOT derived from the sales amount.
 *  • Capital  = 50% of the PRODUCT PRICE × units currently in stock.
 *
 * Everything is computed here, in TypeScript, from the raw rows so that every
 * page shows numbers that add up to each other (category rows always sum to the
 * channel totals, cash + card + store-credit always sum to sales, …).
 */
import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";

/* ─────────────────────────── constants & helpers ─────────────────────────── */

/** Shop time zone — day/month boundaries are computed here, not in UTC. */
export const REPORT_TZ = "Asia/Hebron";
/** Cost of goods (and therefore capital + profit) as a share of product price. */
export const COST_RATIO = 0.5;

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPORT_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function localYmd(d: Date): string {
  return ymdFormatter.format(d); // YYYY-MM-DD
}

function weekStartOf(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const back = (dt.getUTCDay() + 6) % 7; // Monday = start of week
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Postgres `timestamp` (no tz) values are stored in UTC. */
function parseTs(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  let s = String(v).trim();
  if (!/[zZ]|[+-]\d{2}(:?\d{2})?$/.test(s)) s = s.replace(" ", "T") + "Z";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const num = (v: any): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ───────────────────────────────── types ─────────────────────────────────── */

export interface ProductInfo {
  id: number;
  name: string;
  price: number;
  categoryId: number | null;
  subcategoryId: number | null;
  stock: number;
  image: string | null;
  barcode: string | null;
}
export interface CategoryInfo { id: number; name: string; nameAr: string; image: string | null }
export interface SubcategoryInfo { id: number; categoryId: number; name: string; nameAr: string; isActive: boolean }

export interface WebOrderRow {
  id: number;
  status: string;
  createdAt: Date;
  total: number;
  shipping: number;
  credit: number;
  paymentMethod: string;
  region: string | null;
  city: string | null;
  items: { productId: number; qty: number; price: number }[];
}
export interface PosOrderRow {
  id: number;
  createdAt: Date;
  total: number;
  subtotal: number;
  discount: number;
  method: string;
  cash: number;
  card: number;
  note: string;
  items: { productId: number; qty: number; price: number; size: string; color: string }[];
  history: any[];
}
export interface RawData {
  products: ProductInfo[];
  categories: CategoryInfo[];
  subcategories: SubcategoryInfo[];
  webOrders: WebOrderRow[]; // all non-cancelled website orders (items only for Delivered)
  posOrders: PosOrderRow[];
}

/** One product line of one order, after discounts / returns. */
export interface SaleLine {
  channel: "web" | "pos";
  orderId: number;
  ymd: string;
  productId: number;
  categoryId: number; // 0 = no category / deleted product
  subcategoryId: number | null;
  qty: number;
  gross: number;
  net: number;
  profit: number;
  cash: number;
  card: number;
  credit: number;
}
export interface OrderSummary {
  channel: "web" | "pos";
  id: number;
  ymd: string;
  isExchangeInvoice: boolean;
  units: number;
  gross: number;
  net: number;
  profit: number;
}
export interface Dataset {
  raw: RawData;
  productById: Map<number, ProductInfo>;
  lines: SaleLine[];
  orders: OrderSummary[];
  /** POS invoices that are exchange invoices. */
  exchangeInvoiceIds: Set<number>;
  loadedAt: number;
}

export interface Agg {
  orders: number;
  units: number;
  gross: number;
  discounts: number;
  sales: number;
  profit: number;
  cash: number;
  card: number;
  credit: number;
}
const emptyAgg = (): Agg => ({ orders: 0, units: 0, gross: 0, discounts: 0, sales: 0, profit: 0, cash: 0, card: 0, credit: 0 });
function roundAgg(a: Agg): Agg {
  return {
    orders: a.orders,
    units: a.units,
    gross: round2(a.gross),
    discounts: round2(a.discounts),
    sales: round2(a.sales),
    profit: round2(a.profit),
    cash: round2(a.cash),
    card: round2(a.card),
    credit: round2(a.credit),
  };
}
function addLineToAgg(a: Agg, l: SaleLine) {
  a.units += l.qty;
  a.gross += l.gross;
  a.discounts += Math.max(0, l.gross - l.net);
  a.sales += l.net;
  a.profit += l.profit;
  a.cash += l.cash;
  a.card += l.card;
  a.credit += l.credit;
}

/* ───────────────────── POS invoice maths (mirrors POS.tsx) ───────────────── */
// These are the same rules the POS screen uses to show an invoice total, so the
// reports can never disagree with what the cashier sees.

function posLineSub(o: PosOrderRow): number {
  return o.items.reduce((s, it) => s + it.price * (it.qty || 1), 0);
}
function posDiscount(o: PosOrderRow): number {
  if (o.discount > 0) return o.discount;
  const lineSub = posLineSub(o);
  if (o.method === "card" && o.card > 0 && o.card < lineSub - 0.005) return lineSub - o.card;
  if (o.method === "split" && o.cash + o.card > 0 && o.cash + o.card < lineSub - 0.005) return lineSub - (o.cash + o.card);
  if (o.total < lineSub - 0.005) return lineSub - o.total;
  return 0;
}
/** Money the customer actually paid for the goods on this invoice (change excluded). */
function posTotal(o: PosOrderRow): number {
  const lineSub = posLineSub(o);
  const discount = posDiscount(o);
  if (discount > 0) {
    if (Math.abs(o.total - lineSub) < 0.01) return Math.max(0, lineSub - discount);
    return o.total;
  }
  if (o.method === "card" && o.card > 0) return o.card;
  if (o.method === "split" && o.cash + o.card > 0) return o.cash + o.card;
  return o.total;
}
/** cash / card split of posTotal(). For cash sales `cash_amount` is the money handed over (not the sale), so it is NOT used. */
function posSplit(o: PosOrderRow): { cash: number; card: number } {
  const total = posTotal(o);
  if (o.method === "card") return { cash: 0, card: total };
  if (o.method === "split" && o.cash + o.card > 0) {
    const s = o.cash + o.card;
    return { cash: (o.cash / s) * total, card: (o.card / s) * total };
  }
  return { cash: total, card: 0 };
}

const isExchangeNote = (note: string) => note.includes("فاتورة تبديل") || note.includes("EXCHANGE INVOICE");
function parseExchangeNote(note: string): { originalId: number | null; credit: number; replacementTotal: number | null } {
  const idMatch = note.match(/(?:الفاتورة الأصلية|Original invoice)\s*:\s*#?(\d+)/i);
  const creditMatch = note.match(/(?:رصيد المرتجع|قيمة المرتجع|Return credit)\s*:\s*₪?\s*([\d.,]+)/i);
  const replMatch = note.match(/(?:إجمالي القطع البديلة|إجمالي البديل|Replacement total)\s*:\s*₪?\s*([\d.,]+)/i);
  return {
    originalId: idMatch ? Number(idMatch[1]) : null,
    credit: creditMatch ? num(creditMatch[1]) : 0,
    replacementTotal: replMatch ? num(replMatch[1]) : null,
  };
}

const variantKey = (productId: unknown, size: unknown, color: unknown) =>
  `${Number(productId) || 0}|${String(size || "")}|${String(color || "")}`;

/* ─────────────────────── raw rows → lines & summaries ────────────────────── */

export function buildDataset(raw: RawData): Dataset {
  const productById = new Map(raw.products.map((p) => [p.id, p] as const));
  const lines: SaleLine[] = [];
  const orders: OrderSummary[] = [];

  const catOf = (productId: number) => {
    const p = productById.get(productId);
    return { categoryId: p?.categoryId ?? 0, subcategoryId: p?.subcategoryId ?? null, listPrice: p?.price };
  };
  const profitOf = (productId: number, qty: number, fallbackPrice: number) => {
    const listPrice = productById.get(productId)?.price;
    const base = listPrice && listPrice > 0 ? listPrice : fallbackPrice;
    return qty * base * COST_RATIO;
  };

  /* ── website: Delivered orders ── */
  for (const o of raw.webOrders) {
    if (o.status !== "Delivered" || o.items.length === 0) continue;
    const ymd = localYmd(o.createdAt);
    const lineGross = o.items.reduce((s, i) => s + i.price * i.qty, 0);
    // Money value of the goods = what was charged minus shipping, plus store credit
    // (credit is a way of paying, not a discount).
    const net = Math.max(0, o.total - o.shipping + o.credit);
    const factor = lineGross > 0 ? net / lineGross : 0;
    const credit = Math.min(o.credit, net);
    const paidReal = Math.max(0, net - credit);
    const isCash = String(o.paymentMethod || "").toLowerCase() === "cash on delivery";
    const sh = net > 0
      ? { cash: isCash ? paidReal / net : 0, card: isCash ? 0 : paidReal / net, credit: credit / net }
      : { cash: 0, card: 0, credit: 0 };
    let units = 0, gross = 0, netSum = 0, profit = 0;
    for (const it of o.items) {
      const { categoryId, subcategoryId } = catOf(it.productId);
      const lg = it.price * it.qty;
      const ln = lg * factor;
      const lp = profitOf(it.productId, it.qty, it.price);
      lines.push({
        channel: "web", orderId: o.id, ymd, productId: it.productId, categoryId, subcategoryId,
        qty: it.qty, gross: lg, net: ln, profit: lp,
        cash: ln * sh.cash, card: ln * sh.card, credit: ln * sh.credit,
      });
      units += it.qty; gross += lg; netSum += ln; profit += lp;
    }
    orders.push({ channel: "web", id: o.id, ymd, isExchangeInvoice: false, units, gross, net: netSum, profit });
  }

  /* ── POS: every invoice ── */
  const posById = new Map(raw.posOrders.map((o) => [o.id, o] as const));
  const sharesMemo = new Map<number, { cash: number; card: number }>();
  const effNetMemo = new Map<number, { net: number; creditApplied: number }>();

  const effectiveNet = (o: PosOrderRow): { net: number; creditApplied: number } => {
    const memo = effNetMemo.get(o.id);
    if (memo) return memo;
    const total = posTotal(o);
    let res = { net: total, creditApplied: 0 };
    if (isExchangeNote(o.note)) {
      // On an exchange invoice the returned goods' value is applied as a discount.
      // That part is NOT a real discount — it is money the customer already paid
      // on the original invoice, so it counts as sales of the replacement items.
      const parsed = parseExchangeNote(o.note);
      const replacement = parsed.replacementTotal ?? posLineSub(o);
      const creditUsed = Math.min(parsed.credit, replacement);
      const creditApplied = Math.min(creditUsed, posDiscount(o));
      res = { net: total + creditApplied, creditApplied };
    }
    effNetMemo.set(o.id, res);
    return res;
  };

  const getShares = (o: PosOrderRow, depth = 0): { cash: number; card: number } => {
    const memo = sharesMemo.get(o.id);
    if (memo) return memo;
    const split = posSplit(o);
    const { net, creditApplied } = effectiveNet(o);
    let cash = split.cash;
    let card = split.card;
    if (creditApplied > 0) {
      const parsed = parseExchangeNote(o.note);
      const orig = parsed.originalId != null && depth < 5 ? posById.get(parsed.originalId) : undefined;
      const os = orig ? getShares(orig, depth + 1) : { cash: 1, card: 0 };
      cash += creditApplied * os.cash;
      card += creditApplied * os.card;
    }
    const s = cash + card;
    const res = s > 0 && net > 0 ? { cash: cash / s, card: card / s } : { cash: 0, card: 0 };
    sharesMemo.set(o.id, res);
    return res;
  };

  for (const o of raw.posOrders) {
    const ymd = localYmd(o.createdAt);
    const lineSub = posLineSub(o);
    const { net: effNet } = effectiveNet(o);
    const factor = lineSub > 0 ? effNet / lineSub : 0;
    const sh = getShares(o);

    // Units that came back (returns + exchanges) are removed from the original invoice.
    const returned = new Map<string, number>();
    for (const ev of Array.isArray(o.history) ? o.history : []) {
      for (const ri of Array.isArray(ev?.returnedItems) ? ev.returnedItems : []) {
        const k = variantKey(ri.productId ?? ri.product_id, ri.size, ri.color);
        returned.set(k, (returned.get(k) || 0) + Math.max(0, Number(ri.quantity) || 0));
      }
    }

    let units = 0, gross = 0, netSum = 0, profit = 0;
    for (const it of o.items) {
      let qty = it.qty || 1;
      const k = variantKey(it.productId, it.size, it.color);
      const back = Math.min(qty, returned.get(k) || 0);
      if (back > 0) {
        qty -= back;
        returned.set(k, (returned.get(k) || 0) - back);
      }
      if (qty <= 0) continue;
      const { categoryId, subcategoryId } = catOf(it.productId);
      const lg = qty * it.price;
      const ln = lg * factor;
      const lp = profitOf(it.productId, qty, it.price);
      lines.push({
        channel: "pos", orderId: o.id, ymd, productId: it.productId, categoryId, subcategoryId,
        qty, gross: lg, net: ln, profit: lp,
        cash: ln * sh.cash, card: ln * sh.card, credit: 0,
      });
      units += qty; gross += lg; netSum += ln; profit += lp;
    }
    orders.push({ channel: "pos", id: o.id, ymd, isExchangeInvoice: isExchangeNote(o.note), units, gross, net: netSum, profit });
  }

  const exchangeInvoiceIds = new Set(orders.filter((o) => o.channel === "pos" && o.isExchangeInvoice).map((o) => o.id));
  return { raw, productById, lines, orders, exchangeInvoiceIds, loadedAt: Date.now() };
}

/* ──────────────────────────────── DB loader ──────────────────────────────── */

async function loadRaw(): Promise<RawData> {
  const [prodRes, catRes, subRes, ordRes, itemRes, posOrders] = await Promise.all([
    db.execute(sql`SELECT id, name, price, category_id, subcategory_id, stock_quantity, main_image, barcode FROM products`),
    db.execute(sql`SELECT id, name, COALESCE(name_ar, name) AS name_ar, image FROM categories ORDER BY id`),
    db.execute(sql`SELECT id, category_id, name, COALESCE(name_ar, name) AS name_ar, is_active FROM subcategories ORDER BY name`),
    db.execute(sql`SELECT id, status, created_at, total_amount, shipping_cost, credit_used, payment_method, shipping_region, city FROM orders WHERE status <> 'Cancelled'`),
    db.execute(sql`SELECT oi.order_id, oi.product_id, oi.quantity, oi.price FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status = 'Delivered'`),
    storage.getPosOrders(),
  ]);

  const products: ProductInfo[] = (prodRes.rows as any[]).map((r) => ({
    id: Number(r.id),
    name: String(r.name ?? ""),
    price: num(r.price),
    categoryId: r.category_id == null ? null : Number(r.category_id),
    subcategoryId: r.subcategory_id == null ? null : Number(r.subcategory_id),
    stock: Math.max(0, Math.round(num(r.stock_quantity))),
    image: r.main_image ?? null,
    barcode: r.barcode ?? null,
  }));
  const categories: CategoryInfo[] = (catRes.rows as any[]).map((r) => ({
    id: Number(r.id), name: String(r.name ?? ""), nameAr: String(r.name_ar ?? r.name ?? ""), image: r.image ?? null,
  }));
  const subcategories: SubcategoryInfo[] = (subRes.rows as any[]).map((r) => ({
    id: Number(r.id), categoryId: Number(r.category_id), name: String(r.name ?? ""),
    nameAr: String(r.name_ar ?? r.name ?? ""), isActive: r.is_active !== false,
  }));

  const itemsByOrder = new Map<number, WebOrderRow["items"]>();
  for (const r of itemRes.rows as any[]) {
    const oid = Number(r.order_id);
    if (!itemsByOrder.has(oid)) itemsByOrder.set(oid, []);
    itemsByOrder.get(oid)!.push({ productId: Number(r.product_id), qty: Math.max(0, Number(r.quantity) || 0), price: num(r.price) });
  }
  const webOrders: WebOrderRow[] = [];
  for (const r of ordRes.rows as any[]) {
    const createdAt = parseTs(r.created_at);
    if (!createdAt) continue;
    webOrders.push({
      id: Number(r.id),
      status: String(r.status ?? ""),
      createdAt,
      total: num(r.total_amount),
      shipping: num(r.shipping_cost),
      credit: num(r.credit_used),
      paymentMethod: String(r.payment_method ?? ""),
      region: r.shipping_region ?? null,
      city: r.city ?? null,
      items: itemsByOrder.get(Number(r.id)) ?? [],
    });
  }

  const pos: PosOrderRow[] = [];
  for (const o of posOrders as any[]) {
    const createdAt = parseTs(o.createdAt ?? o.created_at);
    if (!createdAt) continue;
    const items = (Array.isArray(o.items) ? o.items : [])
      .filter((it: any) => it && typeof it === "object")
      .map((it: any) => ({
        productId: Number(it.productId ?? it.product_id) || 0,
        qty: Math.max(0, Number(it.quantity) || 0),
        price: num(it.price),
        size: String(it.size || ""),
        color: String(it.color || ""),
      }));
    pos.push({
      id: Number(o.id),
      createdAt,
      total: num(o.totalAmount ?? o.total_amount),
      subtotal: num(o.subtotalAmount ?? o.subtotal_amount),
      discount: num(o.discountAmount ?? o.discount_amount),
      method: String(o.paymentMethod ?? o.payment_method ?? "cash"),
      cash: num(o.cashAmount ?? o.cash_amount),
      card: num(o.cardAmount ?? o.card_amount),
      note: String(o.note || ""),
      items,
      history: Array.isArray(o.exchangeHistory) ? o.exchangeHistory : [],
    });
  }

  return { products, categories, subcategories, webOrders, posOrders: pos };
}

let cache: { at: number; promise: Promise<Dataset> } | null = null;
const CACHE_MS = 15_000;

/** Loads + normalises everything. Cached for a few seconds so several report endpoints / tabs share one load. */
export function getDataset(force = false): Promise<Dataset> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.promise;
  const promise = loadRaw().then(buildDataset);
  cache = { at: Date.now(), promise };
  promise.catch(() => { if (cache?.promise === promise) cache = null; });
  return promise;
}

/* ─────────────────────────────── period helpers ───────────────────────────── */

export function parseMonthParam(v: unknown): string | null {
  const s = typeof v === "string" ? v : "";
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : null;
}
const inPeriod = (ymd: string, month: string | null) => !month || ymd.startsWith(month);

function lastNMonths(n: number): string[] {
  const now = localYmd(new Date());
  let y = Number(now.slice(0, 4));
  let m = Number(now.slice(5, 7));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

function channelTotals(ds: Dataset, month: string | null, categoryId?: number) {
  const web = emptyAgg();
  const pos = emptyAgg();
  const ordersSeen = { web: new Set<number>(), pos: new Set<number>() };
  let exchangeInvoices = 0;
  for (const l of ds.lines) {
    if (!inPeriod(l.ymd, month)) continue;
    if (categoryId !== undefined && l.categoryId !== categoryId) continue;
    addLineToAgg(l.channel === "web" ? web : pos, l);
    ordersSeen[l.channel].add(l.orderId);
  }
  // Orders = invoices that still carry sold goods (a fully-returned invoice has none).
  // Exchange invoices are also reported separately so they can be told apart.
  web.orders = ordersSeen.web.size;
  pos.orders = ordersSeen.pos.size;
  exchangeInvoices = Array.from(ordersSeen.pos).filter((id) => ds.exchangeInvoiceIds.has(id)).length;
  const all = emptyAgg();
  for (const k of Object.keys(all) as (keyof Agg)[]) all[k] = web[k] + pos[k];
  return { web: roundAgg(web), pos: roundAgg(pos), all: roundAgg(all), exchangeInvoices };
}

/* ────────────────────────── 1) Sales report (overview) ────────────────────── */

export function buildOverview(ds: Dataset, month: string | null) {
  const totals = channelTotals(ds, month);

  // Monthly timeline (last 12 months, always — the filter only highlights one month)
  const months = lastNMonths(12);
  const mm = new Map<string, { web: Agg; pos: Agg }>(months.map((m) => [m, { web: emptyAgg(), pos: emptyAgg() }] as const));
  const monthOrders = new Map<string, { web: Set<number>; pos: Set<number> }>(months.map((m) => [m, { web: new Set<number>(), pos: new Set<number>() }] as const));
  for (const l of ds.lines) {
    const key = l.ymd.slice(0, 7);
    const bucket = mm.get(key);
    if (!bucket) continue;
    addLineToAgg(bucket[l.channel], l);
    monthOrders.get(key)![l.channel].add(l.orderId);
  }
  const monthly = months.map((m) => {
    const b = mm.get(m)!;
    b.web.orders = monthOrders.get(m)!.web.size;
    b.pos.orders = monthOrders.get(m)!.pos.size;
    return {
      month: m,
      web: { sales: round2(b.web.sales), profit: round2(b.web.profit), orders: b.web.orders, units: b.web.units },
      pos: { sales: round2(b.pos.sales), profit: round2(b.pos.profit), orders: b.pos.orders, units: b.pos.units },
    };
  });

  // Daily timeline: the selected month, otherwise the last 30 days
  const today = localYmd(new Date());
  const dayMap = new Map<string, { web: number; pos: number; profit: number }>();
  if (month) {
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= daysInMonth; d++) dayMap.set(`${month}-${String(d).padStart(2, "0")}`, { web: 0, pos: 0, profit: 0 });
  } else {
    for (let i = 29; i >= 0; i--) dayMap.set(addDaysYmd(today, -i), { web: 0, pos: 0, profit: 0 });
  }
  for (const l of ds.lines) {
    const b = dayMap.get(l.ymd);
    if (!b) continue;
    b[l.channel] += l.net;
    b.profit += l.profit;
  }
  const daily = Array.from(dayMap.entries()).map(([day, v]) => ({ day, web: round2(v.web), pos: round2(v.pos), profit: round2(v.profit) }));

  // Categories
  const catMap = new Map<number, { web: Agg; pos: Agg; orders: Set<string> }>();
  for (const l of ds.lines) {
    if (!inPeriod(l.ymd, month)) continue;
    if (!catMap.has(l.categoryId)) catMap.set(l.categoryId, { web: emptyAgg(), pos: emptyAgg(), orders: new Set() });
    const b = catMap.get(l.categoryId)!;
    addLineToAgg(b[l.channel], l);
    b.orders.add(`${l.channel}-${l.orderId}`);
  }
  const catInfo = new Map(ds.raw.categories.map((c) => [c.id, c] as const));
  const totalSales = totals.all.sales;
  const categories = Array.from(catMap.entries()).map(([id, b]) => {
    const c = catInfo.get(id);
    const all = emptyAgg();
    for (const k of Object.keys(all) as (keyof Agg)[]) all[k] = b.web[k] + b.pos[k];
    return {
      id,
      name: c?.name ?? "Uncategorized",
      nameAr: c?.nameAr ?? "بدون فئة",
      web: roundAgg(b.web),
      pos: roundAgg(b.pos),
      all: roundAgg(all),
      orders: b.orders.size,
      sharePct: totalSales > 0 ? round2((all.sales / totalSales) * 100) : 0,
    };
  }).sort((a, b) => b.all.sales - a.all.sales);

  // Best-selling products in the period
  const prodMap = new Map<number, { units: number; sales: number; profit: number }>();
  for (const l of ds.lines) {
    if (!inPeriod(l.ymd, month)) continue;
    const b = prodMap.get(l.productId) ?? { units: 0, sales: 0, profit: 0 };
    b.units += l.qty; b.sales += l.net; b.profit += l.profit;
    prodMap.set(l.productId, b);
  }
  const topProducts = Array.from(prodMap.entries())
    .map(([id, b]) => {
      const p = ds.productById.get(id);
      const c = p?.categoryId != null ? catInfo.get(p.categoryId) : undefined;
      return { id, name: p?.name ?? `#${id}`, image: p?.image ?? null, category: c?.name ?? "", categoryAr: c?.nameAr ?? "", units: b.units, sales: round2(b.sales), profit: round2(b.profit) };
    })
    .sort((a, b) => b.units - a.units || b.sales - a.sales)
    .slice(0, 10);

  // Website geography (non-cancelled orders in the period)
  const regionMap = new Map<string, number>();
  const cityMap = new Map<string, number>();
  for (const o of ds.raw.webOrders) {
    if (!inPeriod(localYmd(o.createdAt), month)) continue;
    if (o.region) regionMap.set(o.region, (regionMap.get(o.region) || 0) + 1);
    if (o.city && o.city.trim()) cityMap.set(o.city.trim(), (cityMap.get(o.city.trim()) || 0) + 1);
  }
  const ordersByRegion = Array.from(regionMap.entries()).map(([region, orderCount]) => ({ region, orderCount })).sort((a, b) => b.orderCount - a.orderCount);
  const ordersByCity = Array.from(cityMap.entries()).map(([city, orderCount]) => ({ city, orderCount })).sort((a, b) => b.orderCount - a.orderCount).slice(0, 15);

  const availableMonths = Array.from(new Set(ds.lines.map((l) => l.ymd.slice(0, 7)))).sort().reverse();

  return {
    month,
    costRatio: COST_RATIO,
    availableMonths,
    totals,
    monthly,
    daily,
    categories,
    topProducts,
    ordersByRegion,
    ordersByCity,
    generatedAt: new Date().toISOString(),
  };
}

/* ──────────────────────── 2) Capital overview (all categories) ────────────── */

function inventoryOf(products: ProductInfo[]) {
  let productCount = 0, inStock = 0, outOfStock = 0, units = 0, sellingValue = 0, priceSum = 0, priced = 0;
  for (const p of products) {
    productCount++;
    if (p.stock > 0) inStock++; else outOfStock++;
    units += p.stock;
    sellingValue += p.price * p.stock;
    if (p.price > 0) { priceSum += p.price; priced++; }
  }
  return {
    productCount,
    inStockCount: inStock,
    outOfStockCount: outOfStock,
    totalUnits: units,
    avgPrice: round2(priced > 0 ? priceSum / priced : 0),
    sellingValue: round2(sellingValue),
    capital: round2(sellingValue * COST_RATIO),
    expectedProfit: round2(sellingValue * (1 - COST_RATIO)),
  };
}

export function buildCapitalOverview(ds: Dataset, month: string | null) {
  const byCat = new Map<number, ProductInfo[]>();
  for (const p of ds.raw.products) {
    const k = p.categoryId ?? 0;
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(p);
  }
  const salesByCat = new Map<number, Agg>();
  for (const l of ds.lines) {
    if (!inPeriod(l.ymd, month)) continue;
    if (!salesByCat.has(l.categoryId)) salesByCat.set(l.categoryId, emptyAgg());
    addLineToAgg(salesByCat.get(l.categoryId)!, l);
  }

  const cats: { id: number; name: string; nameAr: string; image: string | null }[] = ds.raw.categories.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr, image: c.image }));
  if (byCat.has(0) || salesByCat.has(0)) cats.push({ id: 0, name: "Uncategorized", nameAr: "بدون فئة", image: null });

  const rows = cats.map((c) => {
    const inv = inventoryOf(byCat.get(c.id) ?? []);
    const s = roundAgg(salesByCat.get(c.id) ?? emptyAgg());
    return { ...c, inventory: inv, sales: { units: s.units, sales: s.sales, profit: s.profit, discounts: s.discounts } };
  }).sort((a, b) => b.inventory.capital - a.inventory.capital);

  const total = inventoryOf(ds.raw.products);
  const soldAll = emptyAgg();
  for (const l of ds.lines) if (inPeriod(l.ymd, month)) addLineToAgg(soldAll, l);
  const sold = roundAgg(soldAll);

  return {
    month,
    costRatio: COST_RATIO,
    availableMonths: Array.from(new Set(ds.lines.map((l) => l.ymd.slice(0, 7)))).sort().reverse(),
    total: { inventory: total, sales: { units: sold.units, sales: sold.sales, profit: sold.profit, discounts: sold.discounts } },
    categories: rows,
  };
}

/* ──────────────────────────── 3) Category drill-down ──────────────────────── */

export function buildCategoryDetail(ds: Dataset, categoryId: number, month: string | null) {
  const cat = ds.raw.categories.find((c) => c.id === categoryId);
  if (!cat && categoryId !== 0) return null;
  const category = cat ?? { id: 0, name: "Uncategorized", nameAr: "بدون فئة", image: null };

  const products = ds.raw.products.filter((p) => (p.categoryId ?? 0) === categoryId);
  const catLines = ds.lines.filter((l) => l.categoryId === categoryId);
  const periodLines = catLines.filter((l) => inPeriod(l.ymd, month));

  const inv = inventoryOf(products);
  const totals = channelTotals(ds, month, categoryId);

  // Per-product table (inventory + sales in the period)
  const sold = new Map<number, { web: Agg; pos: Agg }>();
  for (const l of periodLines) {
    if (!sold.has(l.productId)) sold.set(l.productId, { web: emptyAgg(), pos: emptyAgg() });
    addLineToAgg(sold.get(l.productId)![l.channel], l);
  }
  const productRows = products.map((p) => {
    const s = sold.get(p.id);
    const units = (s?.web.units ?? 0) + (s?.pos.units ?? 0);
    const sales = (s?.web.sales ?? 0) + (s?.pos.sales ?? 0);
    const profit = (s?.web.profit ?? 0) + (s?.pos.profit ?? 0);
    return {
      id: p.id, name: p.name, image: p.image, barcode: p.barcode, subcategoryId: p.subcategoryId,
      price: round2(p.price), stock: p.stock,
      sellingValue: round2(p.price * p.stock), capital: round2(p.price * p.stock * COST_RATIO),
      webUnits: s?.web.units ?? 0, posUnits: s?.pos.units ?? 0,
      soldUnits: units, sales: round2(sales), profit: round2(profit),
    };
  });
  // Sold products that no longer exist in the catalogue still belong in the totals
  Array.from(sold.entries()).forEach(([pid, s]) => {
    if (ds.productById.has(pid)) return;
    const units = s.web.units + s.pos.units;
    productRows.push({
      id: pid, name: `#${pid}`, image: null, barcode: null, subcategoryId: null, price: 0, stock: 0, sellingValue: 0, capital: 0,
      webUnits: s.web.units, posUnits: s.pos.units, soldUnits: units,
      sales: round2(s.web.sales + s.pos.sales), profit: round2(s.web.profit + s.pos.profit),
    });
  });

  // Sub-categories (+ a "none" row so the rows always add up to the category total)
  const subs = ds.raw.subcategories.filter((s) => s.categoryId === categoryId);
  const validSubIds = new Set(subs.map((s) => s.id));
  const effSub = (id: number | null | undefined): number | null => (id != null && validSubIds.has(id) ? id : null);
  const subRows = subs.map((s) => ({ id: s.id as number | null, name: s.name, nameAr: s.nameAr, isActive: s.isActive }));
  subRows.push({ id: null, name: "No sub-category", nameAr: "بدون فئة فرعية", isActive: true });
  const subcategories = subRows.map((s) => {
    const i = inventoryOf(products.filter((p) => effSub(p.subcategoryId) === s.id));
    const agg = { web: emptyAgg(), pos: emptyAgg() };
    for (const l of periodLines) if (effSub(l.subcategoryId) === s.id) addLineToAgg(agg[l.channel], l);
    return {
      id: s.id, name: s.name, nameAr: s.nameAr, isActive: s.isActive,
      productCount: i.productCount, stockUnits: i.totalUnits, sellingValue: i.sellingValue, capital: i.capital,
      webSales: round2(agg.web.sales), posSales: round2(agg.pos.sales),
      units: agg.web.units + agg.pos.units,
      sales: round2(agg.web.sales + agg.pos.sales),
      profit: round2(agg.web.profit + agg.pos.profit),
    };
  }).filter((s) => s.id !== null || s.productCount > 0 || s.sales > 0)
    .sort((a, b) => b.sales - a.sales || b.capital - a.capital);

  // Timelines
  const months = lastNMonths(12);
  type MonthBucket = { web: number; pos: number; profit: number; cashWeb: number; cardWeb: number; cashPos: number; cardPos: number };
  const monthMap = new Map<string, MonthBucket>();
  months.forEach((m) => monthMap.set(m, { web: 0, pos: 0, profit: 0, cashWeb: 0, cardWeb: 0, cashPos: 0, cardPos: 0 }));
  const today = localYmd(new Date());
  const days = new Map<string, { web: number; pos: number; profit: number }>();
  for (let i = 29; i >= 0; i--) days.set(addDaysYmd(today, -i), { web: 0, pos: 0, profit: 0 });
  const weekKeys: string[] = [];
  const weekMap = new Map<string, { cashWeb: number; cardWeb: number; cashPos: number; cardPos: number }>();
  const thisWeek = weekStartOf(today);
  for (let i = 11; i >= 0; i--) {
    const k = addDaysYmd(thisWeek, -7 * i);
    weekKeys.push(k);
    weekMap.set(k, { cashWeb: 0, cardWeb: 0, cashPos: 0, cardPos: 0 });
  }
  for (const l of catLines) {
    const mb = monthMap.get(l.ymd.slice(0, 7));
    if (mb) {
      mb[l.channel] += l.net;
      mb.profit += l.profit;
      if (l.channel === "web") { mb.cashWeb += l.cash; mb.cardWeb += l.card; } else { mb.cashPos += l.cash; mb.cardPos += l.card; }
    }
    const db_ = days.get(l.ymd);
    if (db_) { db_[l.channel] += l.net; db_.profit += l.profit; }
    const wb = weekMap.get(weekStartOf(l.ymd));
    if (wb) {
      if (l.channel === "web") { wb.cashWeb += l.cash; wb.cardWeb += l.card; } else { wb.cashPos += l.cash; wb.cardPos += l.card; }
    }
  }

  const bestSellers = [...productRows].filter((p) => p.soldUnits > 0).sort((a, b) => b.soldUnits - a.soldUnits || b.sales - a.sales).slice(0, 10);

  return {
    month,
    costRatio: COST_RATIO,
    availableMonths: Array.from(new Set(catLines.map((l) => l.ymd.slice(0, 7)))).sort().reverse(),
    category,
    inventory: inv,
    totals,
    subcategories,
    products: productRows.sort((a, b) => b.capital - a.capital || b.soldUnits - a.soldUnits),
    bestSellers,
    monthly: months.map((m) => {
      const v = monthMap.get(m)!;
      return { month: m, web: round2(v.web), pos: round2(v.pos), profit: round2(v.profit), webCash: round2(v.cashWeb), webCard: round2(v.cardWeb), posCash: round2(v.cashPos), posCard: round2(v.cardPos) };
    }),
    daily: Array.from(days.entries()).map(([day, v]) => ({ day, web: round2(v.web), pos: round2(v.pos), profit: round2(v.profit) })),
    weeklyPayment: weekKeys.map((k) => {
      const v = weekMap.get(k)!;
      return { week: k, webCash: round2(v.cashWeb), webCard: round2(v.cardWeb), posCash: round2(v.cashPos), posCard: round2(v.cardPos) };
    }),
  };
}
