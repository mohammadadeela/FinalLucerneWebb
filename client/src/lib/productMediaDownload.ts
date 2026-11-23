// Downloading what is on the products: their videos alone, or photos and videos together.
import { prepareProductPhotoDownload, type PhotoExportMode } from "@/lib/productPhotoDownload";
import { productVariants } from "@/components/admin/studio/StudioParts";

export interface ProductVideoRef { productId: number; url: string }

/** Every video that is on these products, one entry per different file. */
export function productVideoRefs(products: any[], ids: number[]): ProductVideoRef[] {
  const refs: ProductVideoRef[] = [];
  for (const id of ids) {
    const product = products.find((p) => p.id === id);
    if (!product) continue;
    const seen = new Set<string>();
    for (const variant of productVariants(product)) {
      if (!variant.video || seen.has(variant.video)) continue;
      seen.add(variant.video);
      refs.push({ productId: product.id, url: variant.video });
    }
  }
  return refs;
}

async function fetchVideo(ref: ProductVideoRef, watermark: boolean, fallbackName: string): Promise<{ name: string; blob: Blob }> {
  const res = await fetch("/api/admin/ai-studio/download", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...ref, watermark }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  return { name: decodeURIComponent(res.headers.get("X-File-Name") || "") || fallbackName, blob };
}

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 60000);
}

export interface MediaDownloadResult { photos: number; videos: number }

/**
 * Saves the videos of the chosen products, with or without their photos.
 *  - one video and no photos: the .mp4 itself
 *  - anything more: a single ZIP (photos at the top, videos in a "videos" folder)
 */
export async function downloadProductMedia(opts: {
  products: any[];
  ids: number[];
  withPhotos: boolean;
  photoMode?: PhotoExportMode;
  watermark?: boolean;
  onProgress?: (text: { done: number; total: number; stage: "photos" | "videos" }) => void;
}): Promise<MediaDownloadResult> {
  const { products, ids, withPhotos, watermark = false, onProgress } = opts;
  const refs = productVideoRefs(products, ids);
  if (!withPhotos && !refs.length) throw new Error("NO_VIDEOS");

  let photoZip: Blob | null = null;
  let photos = 0;
  if (withPhotos) {
    const prepared = await prepareProductPhotoDownload(ids, opts.photoMode || "main", (done, total) => onProgress?.({ done, total, stage: "photos" }), fetch, watermark);
    photoZip = prepared.blob;
    photos = prepared.included;
  }

  const videos: { name: string; blob: Blob }[] = [];
  const used = new Set<string>();
  for (let i = 0; i < refs.length; i++) {
    onProgress?.({ done: i, total: refs.length, stage: "videos" });
    const file = await fetchVideo(refs[i], watermark, `lucerne-video-${i + 1}.mp4`);
    if (used.has(file.name)) file.name = file.name.replace(/(\.[^.]+)$/, `-${i + 1}$1`);
    used.add(file.name);
    videos.push(file);
  }
  onProgress?.({ done: refs.length, total: refs.length, stage: "videos" });

  const label = ids.length === 1 ? `product-${ids[0]}` : `${ids.length}-products`;
  if (!photoZip && videos.length === 1) {
    saveBlob(videos[0].blob, videos[0].name);
    return { photos, videos: 1 };
  }
  if (photoZip && !videos.length) {
    saveBlob(photoZip, `lucerne-${label}-photos.zip`);
    return { photos, videos: 0 };
  }
  const JSZip = (await import("jszip")).default;
  const archive = photoZip ? await JSZip.loadAsync(photoZip) : new JSZip();
  for (const file of videos) archive.file(photoZip ? `videos/${file.name}` : file.name, file.blob);
  // Photos and videos are already compressed: storing them is faster and loses nothing.
  saveBlob(await archive.generateAsync({ type: "blob", compression: "STORE" }), `lucerne-${label}-${photoZip ? "photos-videos" : "videos"}${watermark ? "-watermark" : ""}.zip`);
  return { photos, videos: videos.length };
}
