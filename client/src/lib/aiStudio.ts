// Client side of the AI Studio: starting jobs, following them, the library, and downloads.
import { useCallback, useEffect, useRef, useState } from "react";

export type StudioMediaKind = "product_video" | "ig_image" | "ig_video";

export interface StudioMedia {
  id: number;
  kind: StudioMediaKind;
  url: string;
  poster: string | null;
  product_id: number | null;
  variant_index: number | null;
  label: string | null;
  meta: any;
  status: "draft" | "published";
  created_at: string;
}

export interface StudioJob {
  id: string;
  label: string;
  status: "queued" | "running" | "done" | "error";
  message?: string;
  noKey?: boolean;
  /** The Gemini account has no money left. */
  noCredit?: boolean;
  /** Never started: the batch was stopped after an error. */
  stopped?: boolean;
  result?: { media?: StudioMedia; publishSkipped?: string };
}

export interface StudioItem {
  productId: number;
  variantIndex: number;
}

async function readJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export async function studioPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await readJson(res);
  if (!res.ok) {
    const error: any = new Error(data?.message || `Request failed (${res.status})`);
    error.status = res.status;
    error.noKey = !!data?.noKey;
    error.reason = data?.reason;
    throw error;
  }
  return data;
}

export async function fetchStudioMedia(group: "product" | "instagram"): Promise<StudioMedia[]> {
  const res = await fetch(`/api/admin/ai-studio/media?group=${group}`, { credentials: "include" });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.message || "Could not load the library");
  return Array.isArray(data.media) ? data.media : [];
}

export async function deleteStudioMedia(id: number): Promise<void> {
  const res = await fetch(`/api/admin/ai-studio/media/${id}`, { method: "DELETE", credentials: "include" });
  if (!res.ok) throw new Error((await readJson(res))?.message || "Could not remove it");
}

/**
 * Follows generation jobs until each one is finished. The job ids are kept for the browser
 * session, so leaving the page and coming back shows the same batch still running.
 */
export function useStudioJobs(storageKey: string, onFinished?: () => void) {
  const [jobs, setJobs] = useState<StudioJob[]>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(jobs.slice(-120)));
    } catch {
      /* the list simply is not kept */
    }
  }, [jobs, storageKey]);

  const pendingKey = jobs.filter((j) => j.status === "queued" || j.status === "running").map((j) => j.id).join(",");

  useEffect(() => {
    if (!pendingKey) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/ai-studio/jobs?ids=${encodeURIComponent(pendingKey)}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (stopped || !Array.isArray(data.jobs)) return;
        const byId = new Map<string, any>(data.jobs.map((j: any) => [j.id, j]));
        // Worked out from the current list, not inside the state update: React runs that later,
        // which used to leave the video list un-refreshed after a job finished.
        const someFinished = jobsRef.current.some((job) => {
          const fresh = byId.get(job.id);
          return !!fresh && (fresh.status === "done" || fresh.status === "error") && job.status !== fresh.status;
        });
        // The server forgets jobs when it restarts; such a job can never finish.
        const known = new Set(data.jobs.map((j: any) => j.id));
        setJobs((prev) =>
          prev.map((job) => {
            const fresh = byId.get(job.id);
            if (!fresh) {
              return (job.status === "queued" || job.status === "running") && !known.has(job.id)
                ? { ...job, status: "error" as const, message: "The server restarted before this finished. Generate it again." }
                : job;
            }
            return { ...job, status: fresh.status, message: fresh.message, noKey: fresh.noKey, noCredit: fresh.noCredit, stopped: fresh.stopped, result: fresh.result };
          }),
        );
        if (someFinished) finishedRef.current?.();
      } catch {
        /* the next tick tries again */
      }
    };
    void tick();
    const timer = window.setInterval(tick, 4000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [pendingKey]);

  const add = useCallback((started: { jobId: string; label: string }[]) => {
    setJobs((prev) => [...prev, ...started.map((j) => ({ id: j.jobId, label: j.label, status: "queued" as const }))]);
  }, []);
  const clearFinished = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status === "queued" || j.status === "running"));
  }, []);

  return { jobs, add, clearFinished, running: !!pendingKey };
}

export type DownloadRequest = { mediaId: number } | { productId: number; url: string };

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

/**
 * Downloads the chosen photos and videos, each one with or without the watermark. One file is
 * saved as it is; several are fetched one after another and saved together as a single ZIP.
 */
export async function downloadStudioFiles(
  requests: DownloadRequest[],
  watermark: boolean,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (!requests.length) return 0;
  const files: { name: string; blob: Blob }[] = [];
  const used = new Set<string>();
  for (let i = 0; i < requests.length; i++) {
    onProgress?.(i, requests.length);
    const res = await fetch("/api/admin/ai-studio/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...requests[i], watermark }),
    });
    if (!res.ok) throw new Error((await readJson(res))?.message || `Download failed (${res.status})`);
    const blob = await res.blob();
    let name = decodeURIComponent(res.headers.get("X-File-Name") || "") || `lucerne-${i + 1}.${blob.type.includes("image") ? "jpg" : "mp4"}`;
    if (used.has(name)) name = name.replace(/(\.[^.]+)$/, `-${i + 1}$1`);
    used.add(name);
    files.push({ name, blob });
  }
  onProgress?.(requests.length, requests.length);
  if (files.length === 1) {
    saveBlob(files[0].blob, files[0].name);
    return 1;
  }
  const JSZip = (await import("jszip")).default;
  const archive = new JSZip();
  for (const file of files) archive.file(file.name, file.blob);
  // Photos and videos are already compressed: storing them is faster and loses nothing.
  saveBlob(await archive.generateAsync({ type: "blob", compression: "STORE" }), `lucerne-${files.length}-files${watermark ? "-watermark" : ""}.zip`);
  return files.length;
}
