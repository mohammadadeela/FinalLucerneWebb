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
