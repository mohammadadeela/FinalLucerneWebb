import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildTrackedPhotoLookupQuery } from "../server/photoExportQuery";
import { buildZip } from "../server/watermark";

const dialect = new PgDialect();
const urls = [
  "https://media.lucerne-boutique.com/media/images/test/main.webp",
  "https://res.cloudinary.com/example/image/upload/ai-generated-photo.jpg",
  "https://example.com/photo?x=' OR 1=1 --",
];

const lookup = dialect.sqlToQuery(buildTrackedPhotoLookupQuery(urls));
assert.match(lookup.sql, /\bIN\s*\(/i);
assert.doesNotMatch(lookup.sql, /ANY\s*\(|::text\[\]/i);
assert.deepEqual(lookup.params, urls, "Each photo URL should be a bound SQL parameter");
assert.equal((lookup.sql.match(/\$\d+/g) || []).length, urls.length);
assert.equal(
  dialect.sqlToQuery(buildTrackedPhotoLookupQuery([urls[0]])).params.length,
  1,
  "A single AI image should also be queryable",
);
assert.equal(
  dialect.sqlToQuery(buildTrackedPhotoLookupQuery(Array.from({ length: 250 }, (_, i) => urls[0] + i))).params.length,
  250,
  "A full lookup chunk should be supported",
);
assert.throws(() => buildTrackedPhotoLookupQuery([]), /between 1 and 250/);
assert.throws(
  () => buildTrackedPhotoLookupQuery(Array.from({ length: 251 }, (_, i) => String(i))),
  /between 1 and 250/,
);

// All three download modes produce the same standard ZIP structure. The
// different modes select different files, not different ZIP encoders.
const zip = buildZip([
  { name: "shoe-001.jpg", data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
  { name: "shoe-002.jpg", data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) },
]);
assert.equal(zip.readUInt32LE(0), 0x04034b50);
assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
assert.equal(zip.readUInt16LE(zip.length - 12), 2, "Two images should be listed in the archive");
assert.ok(zip.includes(Buffer.from("shoe-001.jpg")));
assert.ok(zip.includes(Buffer.from("shoe-002.jpg")));

console.log("Photo export: bound SQL lookup, edge cases, and ZIP checks passed.");

const { photosForProduct } = await import("../server/productPhotoSelection");
const { prepareProductPhotoDownload } = await import("../client/src/lib/productPhotoDownload");
const JSZip = (await import("jszip")).default;
const products = Array.from({ length: 44 }, (_, i) => ({
  id: i + 1, name: "بوت شتوي",
  colorVariants: ["بني", "أسود"].map((name, color) => ({
    name,
    // No mainImage/isPrimary: first media fallback previously lost AI flag.
    media: [0, 1].map((shot) => ({ type: "image", aiGenerated: true,
      url: `https://example.com/${i}/${color}/${shot}.webp` })),
  })),
}));
const selected = products.flatMap((p) => photosForProduct(p, "ai")).filter((p) => p.aiGenerated);
assert.equal(selected.length, 176, "Both AI shots of every color of all 44 products");
assert.deepEqual(new Set(selected.map((p) => p.color)), new Set(["بني", "أسود"]));
const entries = selected.map((p) => ({ name: `${p.productId}-${p.color}-${p.index}.jpg`, data: Buffer.from(p.url) }));
let calls = 0;
const request: typeof fetch = async (_url, init) => {
  calls++;
  const body = JSON.parse(init!.body as string);
  assert.equal(body.ids.length, 44);
  assert.equal(body.mode, "ai");
  const end = Math.min(body.offset + 4, entries.length);
  return new Response(new Uint8Array(buildZip(entries.slice(body.offset, end))), { headers: {
    "X-Photos-Total": String(entries.length), "X-Photos-Included": String(end - body.offset),
    "X-Photos-Failed": "0", "X-Photos-Next-Offset": String(end < entries.length ? end : 0),
  } });
};
const result = await prepareProductPhotoDownload(products.map((p) => p.id), "ai", () => {}, request);
const complete = await JSZip.loadAsync(await result.blob.arrayBuffer(), { checkCRC32: true });
assert.equal(result.included, 176);
assert.equal(Object.keys(complete.files).length, 176);
assert.equal(calls, 44);
for (const entry of entries) assert.deepEqual(await complete.file(entry.name)!.async("nodebuffer"), entry.data);
let retries = 0;
await prepareProductPhotoDownload(products.map((p) => p.id), "ai", () => {}, async (...args) => {
  if (retries++ === 0) return new Response("", { status: 502 });
  return request(...args);
});
await assert.rejects(prepareProductPhotoDownload([1], "ai", () => {}, async () =>
  new Response(JSON.stringify({ message: "Missing image" }), { status: 502 })), /Missing image/);
await assert.rejects(prepareProductPhotoDownload([1], "ai", () => {}, async () =>
  new Response(new Uint8Array(buildZip(entries.slice(0, 1))), { headers: {
    "X-Photos-Total": "2", "X-Photos-Included": "1", "X-Photos-Failed": "0", "X-Photos-Next-Offset": "0",
  } })), /Not all product photos/);
await assert.rejects(prepareProductPhotoDownload([1], "ai", () => {}, async () =>
  new Response(new Uint8Array(buildZip(entries.slice(0, 1))), { headers: {
    "X-Photos-Total": "2", "X-Photos-Included": "1", "X-Photos-Failed": "1", "X-Photos-Next-Offset": "0",
  } })), /incomplete/);
console.log("44 products / 176 color photos merged into one valid ZIP; retries and incomplete-export checks passed.");

const { selectAiPhotoHistory, aiPhotoSeeds } = await import("../server/productPhotoSelection");
const { buildAiPhotoHistoryQuery } = await import("../server/photoExportQuery");
const legacyProducts = products.map((product, p) => ({ ...product,
  colorVariants: product.colorVariants.map((variant, c) => ({ ...variant,
    originalImage: `https://example.com/source/${p}/${c}`,
    mainImage: `https://example.com/source/${p}/${c}`,
    // Simulates older products: only 10 images carry explicit AI markers.
    media: variant.media.map((m, shot) => ({ ...m, aiGenerated: p < 5 && c === 0 ? true : undefined })),
    images: [`https://example.com/legacy/${p}/${c}.webp`],
  })),
}));
const history = legacyProducts.flatMap((product) => product.colorVariants.flatMap((v) => [
  ...v.media.map((m) => ({ url: m.url, source_url: v.originalImage })),
  { url: v.images[0], source_url: null }, // old URL-only tracking still supported
  { url: v.originalImage + "/missing-from-gallery.webp", source_url: v.originalImage },
  { url: v.originalImage + "/regenerated.webp", source_url: v.originalImage + "/missing-from-gallery.webp" },
]));
assert.equal(legacyProducts.flatMap((p) => photosForProduct(p, "ai")).filter((p) => p.aiGenerated).length, 10);
const recovered = selectAiPhotoHistory(legacyProducts, history);
assert.equal(recovered.length, 440, "Recover all 5 generated images of each of 88 product colors, not only the 10 flagged photos");
assert.equal(new Set(recovered.map((p) => p.productId)).size, 44);
assert.ok(recovered.every((p) => !p.url.endsWith("/0") && !p.url.endsWith("/1")));
assert.equal(aiPhotoSeeds(legacyProducts[0]).filter((p) => p.url.includes("/legacy/")).length, 2);
assert.equal(selectAiPhotoHistory([legacyProducts[0]], [...history,
  { url: "https://unrelated.test/ai.webp", source_url: "https://unrelated.test/source" },
]).length, 10, "Unselected product history must not leak into the download");
const cycle = [{ url: "https://cycle.test/a", source_url: "https://cycle.test/b" },
  { url: "https://cycle.test/b", source_url: "https://cycle.test/a" }];
assert.equal(selectAiPhotoHistory([{ id: 999, mainImage: cycle[0].url }], cycle).length, 2);
const historyQuery = dialect.sqlToQuery(buildAiPhotoHistoryQuery(urls));
assert.deepEqual(historyQuery.params, urls);
assert.match(historyQuery.sql, /WITH RECURSIVE/);
assert.doesNotMatch(historyQuery.sql, /UNION ALL/);
console.log("AI history: 10 flagged photos expanded to 440 recorded photos across 44 products / 88 colors; legacy arrays, lineage, cycles and selection boundaries passed.");
