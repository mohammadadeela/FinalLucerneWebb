import type { Express, Request, Response, NextFunction } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { products, categories, subcategories } from "@shared/schema";

type Entity = "product" | "category" | "subcategory";
type Operation = "create" | "update" | "delete";
type UndoSpec = { entity: Entity; operation: Operation; ids: number[] };
type Row = Record<string, any>;

let tablePromise: Promise<void> | null = null;
export function ensureAdminUndoTable(): Promise<void> {
  if (!tablePromise) {
    tablePromise = db.execute(sql`
      CREATE TABLE IF NOT EXISTS admin_undo_history (
        id bigserial PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        undone_at timestamptz,
        actor_id integer NOT NULL,
        undone_by integer,
        entity_type text NOT NULL,
        operation text NOT NULL,
        entity_name text,
        before_state jsonb NOT NULL,
        after_state jsonb NOT NULL
      )
    `).then(() => undefined).catch((error) => {
      tablePromise = null;
      throw error;
    });
  }
  return tablePromise;
}

function selectSpec(req: Request): UndoSpec | null {
  const path = req.path;
  const method = req.method;
  const productId = path.match(/^\/api\/products\/(\d+)$/);
  const categoryId = path.match(/^\/api\/categories\/(\d+)$/);
  const subcategoryId = path.match(/^\/api\/subcategories\/(\d+)$/);
  if (path === "/api/products" && method === "POST") {
    return { entity: "product", operation: "create", ids: [] };
  }
  if (path === "/api/categories" && method === "POST") {
    return { entity: "category", operation: "create", ids: [] };
  }
  if (path === "/api/subcategories" && method === "POST") {
    return { entity: "subcategory", operation: "create", ids: [] };
  }
  if (productId && method === "PUT") {
    return { entity: "product", operation: "update", ids: [Number(productId[1])] };
  }
  if (method === "PATCH" && ["/api/products/bulk-edit", "/api/products/bulk-flags"].includes(path)) {
    const rawIds: unknown[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const ids: number[] = rawIds.map(Number).filter((v) => Number.isInteger(v) && v > 0);
    if (!ids.length || ids.length > 500) return null;
    return { entity: "product", operation: "update", ids: [...new Set(ids)] };
  }
  if (categoryId && method === "PATCH") {
    return { entity: "category", operation: "update", ids: [Number(categoryId[1])] };
  }
  if (subcategoryId && method === "PATCH") {
    return { entity: "subcategory", operation: "update", ids: [Number(subcategoryId[1])] };
  }
  return null;
}

async function getRows(conn: any, entity: Entity, ids: number[]): Promise<Row[]> {
  if (!ids.length) return [];
  let rows: any[];
  if (entity === "product") rows = await conn.select().from(products).where(inArray(products.id, ids));
  else if (entity === "category") rows = await conn.select().from(categories).where(inArray(categories.id, ids));
  else rows = await conn.select().from(subcategories).where(inArray(subcategories.id, ids));
  return JSON.parse(JSON.stringify(rows.sort((a, b) => a.id - b.id)));
}

function stableJSON(value: any): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.keys(val).sort().reduce((acc: any, key) => {
        acc[key] = val[key];
        return acc;
      }, {});
    }
    return val;
  });
}

function itemIds(before: Row[], after: Row[]): number[] {
  return [...new Set([...before, ...after].map((item) => Number(item.id)))];
}

function restoreDates(row: Row): Row {
  const copy = { ...row };
  if (typeof copy.createdAt === "string") copy.createdAt = new Date(copy.createdAt);
  return copy;
}

// Before undoing a creation, check every database foreign-key reference,
// including CASCADE references, so removing the new record never silently
// removes a subsequent order, wishlist item or other related data.
async function assertNotReferenced(tx: any, entity: Entity, id: number): Promise<void> {
  const table = entity === "product" ? "products" : entity === "category" ? "categories" : "subcategories";
  const refs = await tx.execute(sql`
    SELECT ns.nspname AS schema_name, cl.relname AS table_name, att.attname AS column_name
    FROM pg_constraint fk
    JOIN pg_class cl ON cl.oid = fk.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = cl.oid AND att.attnum = fk.conkey[1]
    WHERE fk.contype = 'f'
      AND fk.confrelid = to_regclass(${"public." + table})
      AND array_length(fk.conkey, 1) = 1
  `);
  for (const ref of ((refs as any).rows || [])) {
    const identifier = (v: string) => '"' + v.replace(/"/g, '""') + '"';
    const relatedTable = sql.raw(identifier(ref.schema_name) + "." + identifier(ref.table_name));
    const relatedColumn = sql.raw(identifier(ref.column_name));
    const found = await tx.execute(sql`
      SELECT EXISTS(SELECT 1 FROM ${relatedTable} WHERE ${relatedColumn} = ${id}) AS in_use
    `);
    if ((found as any).rows?.[0]?.in_use) {
      throw new Error("Cannot undo creation: this item has related records or sales.");
    }
  }
  // POS invoices store item references in JSONB, not as foreign keys.
  // Prevent deleting a product with POS history even though PostgreSQL
  // would otherwise allow it and leave the invoice referring to a missing ID.
  if (entity === "product") {
    const pos = await tx.execute(sql`
      SELECT EXISTS(
        SELECT 1 FROM pos_orders
        WHERE items @> ${JSON.stringify([{ productId: id }])}::jsonb
      ) AS in_use
    `);
    if ((pos as any).rows?.[0]?.in_use) {
      throw new Error("Cannot undo creation: this product is referenced by a POS invoice.");
    }
    const groupsExist = await tx.execute(sql`SELECT to_regclass('public.product_groups') AS relation`);
    if ((groupsExist as any).rows?.[0]?.relation) {
      const groups = await tx.execute(sql`
        SELECT EXISTS(SELECT 1 FROM product_groups WHERE ${id} = ANY(product_ids)) AS in_use
      `);
      if ((groups as any).rows?.[0]?.in_use) {
        throw new Error("Cannot undo creation: this product belongs to a product group.");
      }
    }
  }
}

// Capture the actual DB state before and after a successful admin mutation.
// This history is server-side, survives reloads, and never stores passwords
// or the customer's data. Stock/POS changes are deliberately not rewindable.
export async function adminUndoMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated() || (req.user as any)?.role !== "admin") return next();
  const spec = selectSpec(req);
  if (!spec) return next();
  try {
    await ensureAdminUndoTable();
    const before = await getRows(db, spec.entity, spec.ids);
    const originalJson = res.json.bind(res);
    let handled = false;
    res.json = ((payload: any) => {
      if (handled || res.statusCode >= 400) return originalJson(payload);
      handled = true;
      void (async () => {
        try {
          const resultId = Number(payload?.data?.id ?? payload?.id);
          const ids = spec.operation === "create" ? (Number.isInteger(resultId) && resultId > 0 ? [resultId] : []) : spec.ids;
          const after = await getRows(db, spec.entity, ids);
          if (ids.length && stableJSON(before) !== stableJSON(after)) {
            const first = after[0] ?? before[0];
            const name = spec.ids.length > 1
              ? spec.ids.length + " products"
              : String(first?.name || "#" + ids[0]).slice(0, 150);
            await db.execute(sql`
              INSERT INTO admin_undo_history
                (actor_id, entity_type, operation, entity_name, before_state, after_state)
              VALUES (${Number((req.user as any).id)}, ${spec.entity}, ${spec.operation},
                      ${name}, ${JSON.stringify(before)}::jsonb, ${JSON.stringify(after)}::jsonb)
            `);
          }
        } catch (error) {
          console.error("[admin-undo] Could not record change", error);
        } finally {
          if (!res.headersSent) originalJson(payload);
        }
      })();
      return res;
    }) as any;
    next();
  } catch (error) {
    console.error("[admin-undo] History unavailable", error);
    next();
  }
}

export function registerAdminUndoRoutes(app: Express): void {
  app.get("/api/admin/undo-history", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      await ensureAdminUndoTable();
      const history = await db.execute(sql`
        SELECT id, created_at AS "createdAt", undone_at AS "undoneAt",
               entity_type AS "entityType", operation, entity_name AS "entityName",
               actor_id AS "actorId", undone_by AS "undoneBy"
        FROM admin_undo_history ORDER BY id DESC LIMIT 60
      `);
      res.setHeader("Cache-Control", "no-store");
      return res.json((history as any).rows ?? []);
    } catch (error) {
      return res.status(500).json({ message: "Could not load undo history" });
    }
  });

  app.post("/api/admin/undo-history/:id/undo", async (req, res) => {
    if (!req.isAuthenticated() || (req.user as any).role !== "admin") {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const historyId = Number(req.params.id);
    if (!Number.isSafeInteger(historyId) || historyId <= 0) {
      return res.status(400).json({ message: "Invalid history item" });
    }
    try {
      await ensureAdminUndoTable();
      await db.transaction(async (tx) => {
        const response = await tx.execute(sql`
          SELECT * FROM admin_undo_history WHERE id = ${historyId} FOR UPDATE
        `);
        const entry = ((response as any).rows ?? [])[0];
        if (!entry) throw new Error("History item not found");
        if (entry.undone_at) throw new Error("This action was already undone");
        const entity = entry.entity_type as Entity;
        const operation = entry.operation as Operation;
        if (!["product", "category", "subcategory"].includes(entity)
          || !["create", "update", "delete"].includes(operation)) {
          throw new Error("This action is not reversible");
        }
        const before = entry.before_state as Row[];
        const after = entry.after_state as Row[];
        const ids = itemIds(before, after);
        const current = await getRows(tx, entity, ids);
        if (stableJSON(current) !== stableJSON(after)) {
          throw new Error("Newer changes exist. Undo is blocked to protect current product data.");
        }
        for (const row of after) {
          if (operation !== "create") continue;
          await assertNotReferenced(tx, entity, Number(row.id));
          if (entity === "product") await tx.delete(products).where(eq(products.id, row.id));
          else if (entity === "category") await tx.delete(categories).where(eq(categories.id, row.id));
          else await tx.delete(subcategories).where(eq(subcategories.id, row.id));
        }
        if (operation === "delete") {
          for (const row of before) {
            if (entity === "product") await tx.insert(products).values(restoreDates(row) as any);
            else if (entity === "category") await tx.insert(categories).values(row as any);
            else await tx.insert(subcategories).values(row as any);
          }
        } else if (operation === "update") {
          for (const row of before) {
            const restored = restoreDates(row);
            if (entity === "product") await tx.update(products).set(restored as any).where(eq(products.id, row.id));
            else if (entity === "category") await tx.update(categories).set(restored as any).where(eq(categories.id, row.id));
            else await tx.update(subcategories).set(restored as any).where(eq(subcategories.id, row.id));
          }
        }
        await tx.execute(sql`
          UPDATE admin_undo_history SET undone_at = now(), undone_by = ${Number((req.user as any).id)}
          WHERE id = ${historyId}
        `);
      });
      res.setHeader("Cache-Control", "no-store");
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[admin-undo] Revert failed:", error);
      return res.status(409).json({ message: error?.message || "Could not undo this action" });
    }
  });
}
