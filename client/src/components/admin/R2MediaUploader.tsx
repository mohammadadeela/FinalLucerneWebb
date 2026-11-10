import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Check, CloudUpload, FileVideo, ImageIcon, Loader2, RefreshCw, Upload, X } from "lucide-react";

export type R2UploadedMedia = {
  type: "image" | "video";
  url: string;
  poster?: string;
  filename: string;
};

type UploadStatus = "queued" | "uploading" | "processing" | "done" | "error";
type UploadJob = {
  id: number;
  file: File;
  type: R2UploadedMedia["type"];
  status: UploadStatus;
  progress: number;
  error?: string;
  result?: R2UploadedMedia;
};

const imageExt = /\.(jpe?g|png|gif|webp|avif|heic|heif)$/i;
const videoExt = /\.(mp4|mov|webm|avi|mkv)$/i;
const fileAccept = ".jpg,.jpeg,.png,.gif,.webp,.avif,.heic,.heif,.mp4,.mov,.webm,.avi,.mkv";
const IMAGE_LIMIT = 25 * 1024 * 1024;
const VIDEO_LIMIT = 500 * 1024 * 1024;

function uploadToR2(job: UploadJob, onProgress: (percent: number, processing: boolean) => void): Promise<R2UploadedMedia> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const data = new FormData();
    const isImage = job.type === "image";
    data.append(isImage ? "image" : "video", job.file);
    xhr.open("POST", isImage ? "/api/admin/r2/upload-image" : "/api/admin/r2/upload-video");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(progress, progress === 100);
      }
    };
    xhr.onload = () => {
      let response: any = {};
      try { response = JSON.parse(xhr.responseText || "{}"); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && response.storage === "r2" && response.url) {
        resolve({ type: job.type, url: response.url, poster: response.poster, filename: job.file.name });
      } else {
        reject(new Error(response.message || `R2 upload failed (HTTP ${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error while uploading. Please retry."));
    xhr.onabort = () => reject(new Error("Upload interrupted."));
    xhr.send(data);
  });
}

/**
 * Uploads directly through authenticated admin-only R2 endpoints.
 * Files are processed one at a time to avoid overloading the server's image
 * optimizer / FFmpeg, especially with many or large product videos.
 */
export function R2MediaUploader({ onUploaded }: { onUploaded: (items: R2UploadedMedia[]) => void }) {
  const { toast } = useToast();
  const imagePicker = useRef<HTMLInputElement>(null);
  const videoPicker = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  const running = useRef(false);
  const mounted = useRef(true);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [active, setActive] = useState(false);
  const [runCycle, setRunCycle] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const enqueue = (files: File[]) => {
    if (!files.length) return;
    const accepted: UploadJob[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const type = imageExt.test(file.name) ? "image" : videoExt.test(file.name) ? "video" : null;
      if (!type) { rejected.push(`${file.name}: unsupported format`); continue; }
      if (file.size > (type === "image" ? IMAGE_LIMIT : VIDEO_LIMIT)) {
        rejected.push(`${file.name}: exceeds ${type === "image" ? "25 MB" : "500 MB"} limit`);
        continue;
      }
      if (file.size === 0) { rejected.push(`${file.name}: empty file`); continue; }
      accepted.push({ id: ++nextId.current, file, type, progress: 0, status: "queued" });
    }
    if (rejected.length) {
      toast({ title: `${rejected.length} file(s) skipped`, description: rejected.slice(0, 2).join("; "), variant: "destructive" });
    }
    if (accepted.length) {
      setJobs(prev => {
        const existing = new Set(prev.filter(x => x.status !== "error").map(x => `${x.file.name}:${x.file.size}:${x.file.lastModified}`));
        return [...prev, ...accepted.filter(x => !existing.has(`${x.file.name}:${x.file.size}:${x.file.lastModified}`))];
      });
    }
  };

  useEffect(() => {
    if (running.current || !jobs.some(j => j.status === "queued")) return;
    running.current = true;
    setActive(true);
    const pending = jobs.filter(j => j.status === "queued");

    (async () => {
      const completed: R2UploadedMedia[] = [];
      for (const job of pending) {
        if (!mounted.current) break;
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "uploading", progress: 0, error: undefined } : j));
        try {
          const uploaded = await uploadToR2(job, (progress, processing) => {
            if (!mounted.current) return;
            setJobs(prev => prev.map(j => j.id === job.id
              ? { ...j, progress, status: processing ? "processing" : "uploading" } : j));
          });
          completed.push(uploaded);
          if (mounted.current) setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "done", progress: 100, result: uploaded } : j));
        } catch (err: any) {
          if (mounted.current) setJobs(prev => prev.map(j => j.id === job.id
            ? { ...j, status: "error", error: err?.message || "Upload failed" } : j));
        }
      }
      if (mounted.current) {
        running.current = false;
        setActive(false);
        setRunCycle(n => n + 1);
        if (completed.length) onUploadedRef.current(completed);
      }
    })();
  }, [jobs, runCycle]);

  const queued = jobs.filter(j => j.status === "queued").length;
  const finished = jobs.filter(j => j.status === "done").length;
  const failed = jobs.filter(j => j.status === "error").length;
  const totalProgress = jobs.length ? Math.round(jobs.reduce((sum, j) => sum + (j.status === "done" ? 100 : j.progress), 0) / jobs.length) : 0;

  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><CloudUpload className="w-4 h-4" /> Upload to R2</h3>
          <p className="text-xs text-muted-foreground mt-1">Add many photos or videos at once. Photos are optimized for the storefront; videos get a poster and web-ready MP4.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={imagePicker} type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.avif,.heic,.heif" multiple className="hidden"
            onChange={e => { enqueue(Array.from(e.target.files || [])); e.target.value = ""; }} />
          <input ref={videoPicker} type="file" accept=".mp4,.mov,.webm,.avi,.mkv" multiple className="hidden"
            onChange={e => { enqueue(Array.from(e.target.files || [])); e.target.value = ""; }} />
          <Button type="button" size="sm" onClick={() => imagePicker.current?.click()}>
            <ImageIcon className="w-4 h-4 me-1.5" /> Upload Photos
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => videoPicker.current?.click()}>
            <FileVideo className="w-4 h-4 me-1.5" /> Upload Videos
          </Button>
        </div>
      </div>
      <div
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
        onDrop={e => { e.preventDefault(); setDragging(false); enqueue(Array.from(e.dataTransfer.files)); }}
        className={`rounded-lg border border-dashed px-4 py-3 text-center text-xs transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border text-muted-foreground"}`}
      >
        <Upload className="w-4 h-4 inline-block me-1.5 align-middle" />
        Drag and drop photos and videos here, or use the buttons above.
        <span className="block mt-1 text-[11px]">Images up to 25 MB each · Videos up to 500 MB each · Keep this page open until uploads finish</span>
      </div>
      {jobs.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-medium">{finished} uploaded · {queued} queued{active ? " · uploading" : ""}{failed ? ` · ${failed} failed` : ""}</span>
            <div className="flex gap-2">
              {failed > 0 && (
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setJobs(prev => prev.map(j => j.status === "error" ? { ...j, status: "queued", progress: 0, error: undefined } : j))}>
                  <RefreshCw className="w-3 h-3 me-1" /> Retry failed
                </Button>
              )}
              {!active && jobs.every(j => j.status !== "queued") && (
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setJobs([])}>
                  <X className="w-3 h-3 me-1" /> Clear list
                </Button>
              )}
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${totalProgress}%` }} />
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-border border border-border rounded-lg">
            {jobs.map(job => (
              <div key={job.id} className="flex items-center gap-2 py-2 px-3 text-xs">
                {job.type === "image" ? <ImageIcon className="w-4 h-4 text-muted-foreground shrink-0" /> : <FileVideo className="w-4 h-4 text-muted-foreground shrink-0" />}
                <span className="truncate flex-1" title={job.file.name}>{job.file.name}</span>
                {job.status === "done" && job.result
                  ? <a href={job.result.url} target="_blank" rel="noopener noreferrer" className="text-primary underline whitespace-nowrap"><Check className="w-3 h-3 inline me-1" />On R2</a>
                  : job.status === "error"
                    ? <span title={job.error} className="text-destructive max-w-48 truncate">Failed: {job.error}</span>
                    : job.status === "queued" ? <span className="text-muted-foreground">Queued</span>
                    : <span className="flex items-center gap-1 text-muted-foreground whitespace-nowrap">
                        {job.status === "processing" ? <><Loader2 className="w-3 h-3 animate-spin" />Processing…</> : `${job.progress}%`}
                      </span>}
              </div>
            ))}
          </div>
          {finished > 0 && <p className="text-xs text-muted-foreground">Uploaded photos appear in the R2 image browser. Videos can be attached to products using the media picker after generating product details.</p>}
        </div>
      )}
    </div>
  );
}
