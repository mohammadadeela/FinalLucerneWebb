export type PhotoExportMode = "main" | "all" | "ai";

// Fetch small server batches, but save only ONE complete archive. This avoids
// long proxy requests and browsers blocking automatic multi-file downloads.
export async function prepareProductPhotoDownload(
  ids: number[],
  mode: PhotoExportMode,
  onProgress: (done: number, total: number) => void,
  request: typeof fetch = fetch,
): Promise<{ blob: Blob; included: number }> {
  const JSZip = (await import("jszip")).default;
  const archive = new JSZip();
  let offset = 0;
  let included = 0;
  let expectedTotal: number | undefined;
  while (true) {
    let response: Response | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await request("/api/admin/products/photo-export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids, mode, offset }),
        });
        if (response.status < 500 || attempt === 1) break;
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
    if (!response) throw new Error("Photo download failed. Please retry.");
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `Download failed (${response.status})`);
    }
    const total = Number(response.headers.get("X-Photos-Total"));
    const count = Number(response.headers.get("X-Photos-Included"));
    const failed = Number(response.headers.get("X-Photos-Failed"));
    const next = Number(response.headers.get("X-Photos-Next-Offset"));
    if (!Number.isSafeInteger(total) || total < 1 ||
        !Number.isSafeInteger(count) || count < 1 || failed !== 0 ||
        !Number.isSafeInteger(next) || next < 0 ||
        (expectedTotal !== undefined && total !== expectedTotal)) {
      throw new Error("The photo export is incomplete or changed. Please retry.");
    }
    expectedTotal = total;
    const batch = await JSZip.loadAsync(await response.arrayBuffer(), { checkCRC32: true });
    const files = Object.values(batch.files).filter((file) => !file.dir);
    if (files.length !== count) throw new Error("Incomplete photo ZIP. Please retry.");
    for (const file of files) {
      if (archive.file(file.name)) throw new Error("Duplicate photo in export. Please retry.");
      archive.file(file.name, await file.async("uint8array"));
    }
    included += count;
    onProgress(included, total);
    if (next === 0) {
      if (included !== total) throw new Error("Not all product photos were received. Please retry.");
      break;
    }
    if (next !== offset + count || next >= total) {
      throw new Error("Invalid photo export progress. Please retry.");
    }
    offset = next;
  }
  return { blob: await archive.generateAsync({ type: "blob", compression: "STORE" }), included };
}
