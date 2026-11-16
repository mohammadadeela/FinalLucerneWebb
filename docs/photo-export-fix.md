# 2026-11-16 — Complete selected-product photo download

- Request: download all saved AI images for all selected products and their colors together in one ZIP, with images at the archive root.
- Changed: the client combines small server batches before triggering a single download; server batches contain four images with bounded fetch retries, reducing exposure to proxy timeouts. Failed images reject the batch; the client retries transient server failures and verifies ZIP CRCs, file counts, duplicate filenames, pagination and the total before saving.
- Fixed: preserve AI provenance when an image is first encountered as a main-image fallback and then encountered again in flagged media.
- Preserved: generation prompts, product data, image generation and the existing download menu. All three download choices use the same single-ZIP transport.
- Verified: `node --import tsx script/test-photo-export.ts` passed, including 44 products with two colors and two AI shots each (176 photos), valid Unicode filenames and bytes, transient retry, missing-photo errors and incomplete archive rejection. `node node_modules/typescript/bin/tsc --noEmit` and `node --import tsx script/build.ts` passed (existing large-chunk build warning).
- Limits: live production database/media were not available for end-to-end verification. AI images without either stored AI flags or indexed provenance cannot safely be distinguished from original photos. Final archive assembly uses browser memory. Deploy the updated client and server together with the existing deploy process, then verify the selected products in admin.

## Follow-up — selection completeness
- Report: selecting 44 products downloaded only 10 AI photos. The initial regression covered fully flagged media and did not cover incomplete legacy galleries/history.
- Changed: export queries persisted product records directly, preserving legacy per-color `images` that storefront sanitization can omit when `media` is present. AI selection combines explicit flags, URL-only historical tracking and recursive generation lineage from every selected color's gallery/original source. It includes recorded outputs no longer present in those galleries, deduplicates per product and sorts deterministically for batching. It never guesses that an unmarked original photo is AI-generated.
- History lookup failures now stop the export instead of silently returning only the small flagged subset.
- Verified: added a 44-product/88-color legacy fixture with only 10 flags and 440 recorded generated photos; all 440 are selected. Covers legacy arrays, source-only references, regeneration chains, unrelated-product exclusion, cycles and parameterized recursive SQL. Test script, type check and production build passed.
- Remaining: actual production records and download counts are unverified. Photos with no flags, no URL tracking and no source lineage cannot be identified automatically. Updated server must be deployed for this selection fix to take effect.
