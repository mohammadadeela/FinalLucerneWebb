import sharp from "sharp";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";

const execFileAsync = promisify(execFile);

/**
 * Optimizes an uploaded image using Sharp.
 * - Converts to WebP (modern, ~30-50% smaller than JPEG)
 * - Caps width at 1600px (enough for any display, including 2× retina)
 * - Quality 82 — visually lossless for fashion photography
 * - Preserves full color fidelity and sharp edges
 * Returns the path of the optimized file (replaces the original).
 */
export async function optimizeImage(filePath: string): Promise<string> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);
  const outPath = path.join(dir, `${base}.webp`);

  await sharp(filePath)
    .rotate()                    // auto-rotate from EXIF (fixes sideways phone photos)
    .resize({
      width: 1600,
      height: 2200,
      fit: "inside",             // never upscale; keep aspect ratio
      withoutEnlargement: true,
    })
    .webp({
      quality: 82,               // sweet spot: premium quality + fast loading
      effort: 4,                 // balanced encode speed
      smartSubsample: true,
    })
    .toFile(outPath);

  // Remove original if it's a different file (e.g., .jpg → .webp)
  if (outPath !== filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  return outPath;
}

/**
 * Compresses and resizes a portrait fashion video using FFmpeg.
 * - Portrait 1080×1920 (9:16) → 720×1280 (smaller, loads faster)
 * - H.264 with CRF 26 — sharp quality, half the file size
 * - AAC audio stripped (product videos don't need audio)
 * - Also generates a poster thumbnail (first frame, saved as WebP)
 * Returns { videoPath, posterPath } — both in /uploads/
 */
export async function optimizeVideo(filePath: string): Promise<{ videoPath: string; posterPath: string }> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath, ext);
  const outVideo = path.join(dir, `${base}_opt.mp4`);
  const outPoster = path.join(dir, `${base}_poster.webp`);

  // Step 1: Compress + resize the video
  // -vf scale: resize to max 720px wide, keep aspect ratio, divisible by 2 (codec req)
  // -crf 26: good quality, roughly half the bitrate of default
  // -preset fast: fast encode, reasonable compression
  // -movflags +faststart: put index at front so video starts playing immediately
  // -an: strip audio (fashion product videos are silent)
  await execFileAsync("ffmpeg", [
    "-i", filePath,
    "-vf", "scale='min(720,iw)':-2",
    "-c:v", "libx264",
    "-crf", "26",
    "-preset", "fast",
    "-profile:v", "main",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-an",
    "-y",
    outVideo,
  ]);

  // Step 2: Extract poster frame (frame at 0.5s for a non-black first frame)
  await execFileAsync("ffmpeg", [
    "-i", outVideo,
    "-ss", "0.5",
    "-frames:v", "1",
    "-vf", "scale='min(720,iw)':-2",
    "-y",
    outPoster,
  ]);

  // Remove original large file
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  return { videoPath: outVideo, posterPath: outPoster };
}
