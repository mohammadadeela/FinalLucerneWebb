import assert from "node:assert/strict";
import { getOriginalProductPhoto } from "../client/src/lib/productAiSource";

const original = "https://example.com/uploaded-shoe.jpg";
const alternate = "https://example.com/uploaded-shoe-side.jpg";
const aiModel = "https://example.com/generated-model.jpg";
const aiProduct = "https://example.com/generated-product.jpg";

assert.equal(
  getOriginalProductPhoto({
    originalImage: original,
    mainImage: aiModel,
    images: [original, aiProduct],
    media: [
      { type: "image", url: original },
      { type: "image", url: aiProduct, aiGenerated: true },
      { type: "image", url: aiModel, aiGenerated: true },
    ],
  }, aiModel),
  original,
  "A saved original wins even when the AI model image is the current main photo",
);

assert.equal(
  getOriginalProductPhoto({
    mainImage: aiModel,
    images: [original, aiProduct],
    media: [
      { type: "image", url: original },
      { type: "image", url: aiProduct, aiGenerated: true },
      { type: "image", url: aiModel, aiGenerated: true },
    ],
  }, aiModel),
  original,
  "An existing gallery selects the original instead of a generated main image",
);

assert.equal(
  getOriginalProductPhoto({
    mainImage: aiModel,
    images: [original, aiProduct],
    media: [
      { type: "image", url: original },
      { type: "image", url: aiProduct },
      { type: "image", url: aiModel, isPrimary: true },
    ],
  }, aiModel),
  original,
  "Legacy galleries without AI metadata still prefer the uploaded first image",
);

assert.equal(
  getOriginalProductPhoto({
    mainImage: original,
    images: [alternate],
    media: [
      { type: "image", url: original },
      { type: "image", url: alternate },
    ],
  }, alternate),
  alternate,
  "Before the first generation, the explicitly clicked uploaded photo is the source",
);

assert.equal(
  getOriginalProductPhoto({
    originalImage: alternate,
    mainImage: aiModel,
    images: [original, alternate, aiProduct],
    media: [
      { type: "image", url: original },
      { type: "image", url: alternate },
      { type: "image", url: aiProduct, aiGenerated: true },
      { type: "image", url: aiModel, aiGenerated: true },
    ],
  }, original),
  alternate,
  "Once pinned, the source stays the same even if a different thumbnail is clicked",
);

assert.equal(
  getOriginalProductPhoto({ mainImage: original, images: [], media: [] }),
  original,
  "Legacy products with no media array still work",
);

assert.equal(
  getOriginalProductPhoto({
    mainImage: aiModel,
    media: [{ type: "image", url: aiModel, aiGenerated: true }],
  }),
  aiModel,
  "Only when no original remains may the system fall back to an AI photo",
);

assert.equal(getOriginalProductPhoto(null), undefined, "Missing images must not invent a reference");

console.log("Original-source selection: all 8 checks passed.");
