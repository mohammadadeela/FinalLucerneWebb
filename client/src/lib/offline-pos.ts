import { create } from "zustand";
import { timeoutSignal } from "@/lib/connection";

/* Offline sales for the POS page — and only the POS page.

   When the connection is down (or drops in the middle of a sale) the sale is saved on THIS device, the cashier
   gets a temporary invoice number (OFF-XXX-0001) to print, and the sale is uploaded automatically as soon as the
   connection is back. What makes this safe:

   - Each sale has a unique `clientRef`. The server refuses to create two invoices for the same one, so a retry
     (even after a dropped response) can never duplicate a sale.
   - The sale keeps its real time and the real cashier when it is uploaded later.
   - Sales live in IndexedDB, so they survive closing the app or restarting the PC. If IndexedDB is unavailable
     the queue falls back to memory (it still works until the page is closed, and the panel says so).
   - Stock shown on screen is reduced by sales that are saved but not yet uploaded, so the same last piece can't be
     sold twice while offline. */

export type QueuedSaleStatus = "pending" | "failed" | "synced";

export interface QueuedSale {
  clientRef: string;
  offlineNumber: string;
  /** ISO time the customer actually paid. */
  soldAt: string;
  sellerId?: number;
  sellerName?: string;
  /** The exact body the online POST would have sent. */
  payload: any;
  total: number;
  status: QueuedSaleStatus;
  attempts: number;
  lastError?: string;
  /** Set once uploaded: the real invoice number on the server. */
  serverOrderId?: number;
  createdAt: number;
  syncedAt?: number;
}

/* ── Tiny IndexedDB wrapper (with a memory fallback) ───────────────────── */

const DB_NAME = "lucerne-pos-offline";
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = { sales: new Map<string, QueuedSale>(), meta: new Map<string, any>(), snapshot: new Map<string, any>() };
export let usingMemoryFallback = false;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") throw new Error("no indexedDB");
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("sales")) db.createObjectStore("sales", { keyPath: "clientRef" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
        if (!db.objectStoreNames.contains("snapshot")) db.createObjectStore("snapshot", { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { usingMemoryFallback = true; resolve(null); };
      req.onblocked = () => { usingMemoryFallback = true; resolve(null); };
    } catch {
      usingMemoryFallback = true;
      resolve(null);
    }
  });
  return dbPromise;
}

type StoreName = "sales" | "meta" | "snapshot";

async function withStore<T>(store: StoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = run(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function putSale(sale: QueuedSale) {
  const db = await openDb();
  if (!db) { memory.sales.set(sale.clientRef, sale); return; }
  await withStore("sales", "readwrite", (s) => s.put(sale));
}
async function deleteSaleRow(clientRef: string) {
  const db = await openDb();
  if (!db) { memory.sales.delete(clientRef); return; }
  await withStore("sales", "readwrite", (s) => s.delete(clientRef));
}
async function allSales(): Promise<QueuedSale[]> {
  const db = await openDb();
  if (!db) return Array.from(memory.sales.values());
  return ((await withStore<QueuedSale[]>("sales", "readonly", (s) => s.getAll())) || []) as QueuedSale[];
}
async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return memory.meta.get(key);
  const row = await withStore<{ key: string; value: T }>("meta", "readonly", (s) => s.get(key));
  return row?.value;
}
async function setMeta(key: string, value: any) {
  const db = await openDb();
  if (!db) { memory.meta.set(key, value); return; }
  await withStore("meta", "readwrite", (s) => s.put({ key, value }));
}

/* ── Identity of this device + sales ───────────────────────────────────── */

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const rand = (n: number) => Array.from({ length: n }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

/** Unique id for one sale. Sent with EVERY POS sale (online too) so a retry can never create a second invoice. */
export function newClientRef(): string {
  return `S-${Date.now().toString(36)}-${rand(6)}`.toLowerCase();
}

async function deviceCode(): Promise<string> {
  let code = await getMeta<string>("deviceCode");
  if (!code) {
    code = rand(3);
    await setMeta("deviceCode", code);
  }
  return code;
}

let numberLock: Promise<unknown> = Promise.resolve();
/** OFF-<device>-0001, 0002, … — never reused on this device. */
async function nextOfflineNumber(): Promise<string> {
  const run = async () => {
    const [code, n] = [await deviceCode(), ((await getMeta<number>("counter")) || 0) + 1];
    await setMeta("counter", n);
    return `OFF-${code}-${String(n).padStart(4, "0")}`;
  };
  const p = numberLock.then(run, run);
  numberLock = p.catch(() => {});
  return p;
}

/* ── Zustand view of the queue (what the UI renders) ───────────────────── */

interface QueueState {
  sales: QueuedSale[];
  ready: boolean;
  syncing: boolean;
  refresh: () => Promise<void>;
}

export const useOfflineQueue = create<QueueState>((set) => ({
  sales: [],
  ready: false,
  syncing: false,
  refresh: async () => {
    const rows = (await allSales()).sort((a, b) => a.createdAt - b.createdAt);
    set({ sales: rows, ready: true });
  },
}));

const SYNCED_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/** Load the queue and tidy up old, already-uploaded rows. */
export async function initOfflineQueue() {
  const rows = await allSales();
  const cutoff = Date.now() - SYNCED_KEEP_MS;
  for (const s of rows) if (s.status === "synced" && (s.syncedAt || 0) < cutoff) await deleteSaleRow(s.clientRef);
  await useOfflineQueue.getState().refresh();
}

export async function enqueueSale(input: { clientRef: string; payload: any; total: number; sellerId?: number; sellerName?: string }): Promise<QueuedSale> {
  const sale: QueuedSale = {
    clientRef: input.clientRef,
    offlineNumber: await nextOfflineNumber(),
    soldAt: new Date().toISOString(),
    sellerId: input.sellerId,
    sellerName: input.sellerName,
    payload: input.payload,
    total: input.total,
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
  };
  await putSale(sale);
  await useOfflineQueue.getState().refresh();
  return sale;
}

export async function retrySale(clientRef: string) {
  const s = (await allSales()).find((x) => x.clientRef === clientRef);
  if (!s) return;
  await putSale({ ...s, status: "pending", attempts: 0, lastError: undefined });
  await useOfflineQueue.getState().refresh();
}

export async function dismissSale(clientRef: string) {
  await deleteSaleRow(clientRef);
  await useOfflineQueue.getState().refresh();
}

/** Plain-text copy of a sale so nothing is ever lost if it has to be entered by hand. */
export function describeSale(s: QueuedSale): string {
  const items = (s.payload?.items || []).map((i: any) => `- ${i.name || i.productId} ×${i.quantity}${i.size ? ` (${i.size})` : ""}${i.color ? ` [${i.color}]` : ""} @ ₪${i.price}`).join("\n");
  return `${s.offlineNumber}\n${new Date(s.soldAt).toLocaleString()}\n${items}\nTotal: ₪${s.total.toFixed(2)} (${s.payload?.paymentMethod})${s.lastError ? `\nProblem: ${s.lastError}` : ""}`;
}

/* ── Showing stock that already accounts for unsent sales ──────────────── */

/** Reduces stock by sales that are saved on this device but not on the server yet (pure; does not touch the input). */
export function applyPendingToProducts<T extends { id: number }>(products: T[], sales: QueuedSale[]): T[] {
  // A "failed" sale was physically sold too, so it keeps holding its stock until someone resolves it.
  const open = sales.filter((s) => s.status !== "synced");
  if (open.length === 0) return products;
  const clones = new Map<number, any>();
  const clone = (id: number) => {
    let c = clones.get(id);
    if (c) return c;
    const src: any = products.find((p) => p.id === id);
    if (!src) return null;
    c = { ...src, sizeInventory: { ...(src.sizeInventory || {}) }, colorVariants: JSON.parse(JSON.stringify(src.colorVariants || [])) };
    clones.set(id, c);
    return c;
  };
  for (const sale of open) {
    for (const item of sale.payload?.items || []) {
      const p = clone(item.productId);
      if (!p) continue;
      const qty = Number(item.quantity) || 0;
      const variants: any[] = p.colorVariants || [];
      if (variants.length > 0 && item.color) {
        const v = variants.find((x) => x.name === item.color);
        if (v && item.size) {
          v.sizeInventory = { ...(v.sizeInventory || {}) };
          v.sizeInventory[item.size] = Math.max(0, (v.sizeInventory[item.size] ?? 0) - qty);
        }
        const merged: Record<string, number> = {};
        let total = 0;
        for (const cv of variants) for (const [sz, q] of Object.entries(cv.sizeInventory || {})) { merged[sz] = (merged[sz] || 0) + (q as number); total += q as number; }
        p.sizeInventory = merged;
        p.stockQuantity = total;
      } else if (item.size && p.sizeInventory && p.sizeInventory[item.size] !== undefined) {
        p.sizeInventory[item.size] = Math.max(0, p.sizeInventory[item.size] - qty);
        p.stockQuantity = Object.values(p.sizeInventory).reduce((a: number, b: any) => a + (b as number), 0);
      } else {
        p.stockQuantity = Math.max(0, (p.stockQuantity ?? 0) - qty);
      }
    }
  }
  return products.map((p) => clones.get(p.id) ?? p);
}

/* ── Product snapshot, so the product list is there even if the page loads offline ── */

export async function saveProductsSnapshot(products: any[]) {
  const row = { key: "products", savedAt: Date.now(), products };
  const db = await openDb();
  if (!db) { memory.snapshot.set("products", row); return; }
  try { await withStore("snapshot", "readwrite", (s) => s.put(row)); } catch { /* too big or blocked: not critical */ }
}
export async function loadProductsSnapshot(): Promise<{ savedAt: number; products: any[] } | null> {
  const db = await openDb();
  if (!db) return memory.snapshot.get("products") ?? null;
  return ((await withStore<any>("snapshot", "readonly", (s) => s.get("products"))) as any) ?? null;
}

/* ── Uploading ─────────────────────────────────────────────────────────── */

export interface SyncResult { synced: number; failed: number; stoppedBecause?: "offline" | "login" | "server" }
let syncLock = false;

async function messageOf(res: Response): Promise<string> {
  try { const j = await res.json(); return String(j?.message || res.statusText || res.status); } catch { return String(res.status); }
}

/** Uploads waiting sales one by one, oldest first. Safe to call any time and from several places at once. */
export async function syncPendingSales(): Promise<SyncResult> {
  if (syncLock) return { synced: 0, failed: 0 };
  syncLock = true;
  useOfflineQueue.setState({ syncing: true });
  const result: SyncResult = { synced: 0, failed: 0 };
  try {
    const pending = (await allSales()).filter((s) => s.status === "pending").sort((a, b) => a.createdAt - b.createdAt);
    for (const sale of pending) {
      let res: Response;
      try {
        res = await fetch("/api/pos/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: timeoutSignal(30000),
          body: JSON.stringify({
            ...sale.payload,
            clientRef: sale.clientRef,
            offlineSale: true,
            offlineNumber: sale.offlineNumber,
            soldAt: sale.soldAt,
            sellerId: sale.sellerId,
          }),
        });
      } catch {
        // No connection / timed out: keep it, try again later. Nothing is lost.
        await putSale({ ...sale, attempts: sale.attempts + 1, lastError: "offline" });
        result.stoppedBecause = "offline";
        break;
      }
      if (res.ok) {
        const order = await res.json().catch(() => ({}));
        await putSale({ ...sale, status: "synced", serverOrderId: order?.id, syncedAt: Date.now(), lastError: undefined });
        result.synced++;
        continue;
      }
      if (res.status === 401) {
        // Session ended while offline: keep everything and ask the cashier to sign in again.
        await putSale({ ...sale, lastError: "login_required" });
        result.stoppedBecause = "login";
        break;
      }
      if (res.status >= 500 || res.status === 429 || res.status === 408) {
        await putSale({ ...sale, attempts: sale.attempts + 1, lastError: `server_${res.status}` });
        result.stoppedBecause = "server";
        break;
      }
      // The server understood the sale and refused it (e.g. a product was deleted meanwhile). Retrying can't fix
      // that, so flag it for a person to resolve — and keep going with the others.
      await putSale({ ...sale, status: "failed", attempts: sale.attempts + 1, lastError: await messageOf(res) });
      result.failed++;
    }
  } finally {
    syncLock = false;
    useOfflineQueue.setState({ syncing: false });
    await useOfflineQueue.getState().refresh();
  }
  return result;
}
