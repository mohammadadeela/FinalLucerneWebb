import { v2 as cloudinary } from "cloudinary";

function applyConfig() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

applyConfig();

export async function uploadToCloudinary(
  buffer: Buffer,
  originalName: string
): Promise<string> {
  applyConfig();
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: "lucerne-boutique",
        resource_type: "image",
        allowed_formats: ["jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif"],
        quality: "auto:good",
        fetch_format: "auto",
        transformation: [{ width: 1200, crop: "limit" }],
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Upload failed"));
        } else {
          // Inject f_auto,q_auto so the stored URL always delivers the best
          // format (WebP/AVIF) and auto-compressed quality to the browser.
          const optimizedUrl = result.secure_url.replace("/upload/", "/upload/f_auto,q_auto/");
          resolve(optimizedUrl);
        }
      }
    );
    upload.end(buffer);
  });
}

export async function uploadVideoToCloudinary(
  source: Buffer | string,
  originalName: string
): Promise<string> {
  applyConfig();

  // If source is a file path, use Cloudinary's direct upload API (no memory buffering)
  if (typeof source === "string") {
    const result = await cloudinary.uploader.upload(source, {
      folder: "lucerne-boutique",
      resource_type: "video",
      allowed_formats: ["mp4", "webm", "mov", "avi", "mkv"],
    });
    return result.secure_url.replace("/upload/", "/upload/f_mp4,vc_h264,q_auto:good,br_2m/");
  }

  // Buffer fallback
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: "lucerne-boutique",
        resource_type: "video",
        allowed_formats: ["mp4", "webm", "mov", "avi", "mkv"],
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Video upload failed"));
        } else {
          const mp4Url = result.secure_url.replace("/upload/", "/upload/f_mp4,vc_h264,q_auto:good,br_2m/");
          resolve(mp4Url);
        }
      }
    );
    upload.end(source);
  });
}

/**
 * Extracts the Cloudinary public_id from a stored URL.
 * Works for both clean URLs (no transforms) and pre-transformed URLs.
 */
function extractPublicId(url: string): string | null {
  // Skip any transform segments (e.g. f_auto,q_auto/) then grab the public_id
  const match = url.match(/\/upload\/(?:[^/]*\/)*?(?:v\d+\/)?(.+)$/);
  if (!match) return null;
  return match[1].replace(/\.[^/.]+$/, ""); // strip extension
}

/**
 * Pre-generates commonly-used Cloudinary transform variants for a given image URL.
 * This "warms" Cloudinary's cache so the first real user never waits for on-demand
 * generation of a 5+ MB raw photo.
 * Fire-and-forget — errors are swallowed so callers are never blocked.
 */
export async function warmCloudinaryCache(url: string): Promise<void> {
  if (!url || !url.includes("res.cloudinary.com")) return;
  const publicId = extractPublicId(url);
  if (!publicId) return;
  try {
    applyConfig();
    await cloudinary.uploader.explicit(publicId, {
      type: "upload",
      eager: [
        { width: 400,  crop: "limit", quality: "auto:good", fetch_format: "auto" },
        { width: 800,  crop: "limit", quality: "auto:good", fetch_format: "auto" },
        { width: 1200, crop: "limit", quality: "auto:good", fetch_format: "auto" },
      ],
      eager_async: true, // Cloudinary generates them in the background
    });
  } catch {
    // Non-critical — silently ignore
  }
}

export async function deleteFromCloudinary(url: string): Promise<void> {
  try {
    applyConfig();
    // Skip transformation segments (f_auto,q_auto / f_mp4,vc_h264 / so_0, etc.)
    // and version segments before extracting the public_id.
    const match = url.match(/\/upload\/(?:[^/]*\/)*?(?:v\d+\/)?(.+)$/);
    if (!match) return;
    const publicId = match[1].replace(/\.[^/.?#]+(?:[?#].*)?$/, "");

    // Cloudinary deletes images by default. Product media can also be videos,
    // so try the correct type first when the URL clearly points at video, then
    // fall back to the other type. This makes the admin remove button work for
    // both photos and videos.
    const looksVideo = /\/video\/upload\//i.test(url) || /\.(mp4|webm|mov|avi|mkv)(?:[?#].*)?$/i.test(url);
    const firstType = looksVideo ? "video" : "image";
    const secondType = looksVideo ? "image" : "video";

    const first = await cloudinary.uploader.destroy(publicId, { resource_type: firstType as any });
    if (!first || (first as any).result === "not found") {
      await cloudinary.uploader.destroy(publicId, { resource_type: secondType as any });
    }
  } catch (err) {
    console.error("Cloudinary delete error:", err);
  }
}

export { cloudinary };
