import { v2 as cloudinary } from "cloudinary";
import {
  deleteFromR2,
  isR2Enabled,
  isR2Url,
  uploadImageToR2,
  uploadVideoToR2,
} from "./r2";

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
  if (isR2Enabled()) {
    return uploadImageToR2(buffer, originalName);
  }

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
  if (isR2Enabled()) {
    return uploadVideoToR2(source, originalName);
  }

  applyConfig();

  if (typeof source === "string") {
    const result = await cloudinary.uploader.upload(source, {
      folder: "lucerne-boutique",
      resource_type: "video",
      allowed_formats: ["mp4", "webm", "mov", "avi", "mkv"],
    });
    return result.secure_url.replace("/upload/", "/upload/f_mp4,vc_h264,q_auto:good,br_2m/");
  }

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

function extractPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:[^/]*\/)*?(?:v\d+\/)?(.+)$/);
  if (!match) return null;
  return match[1].replace(/\.[^/.]+$/, "");
}

export async function warmCloudinaryCache(url: string): Promise<void> {
  // R2 image variants are generated during upload, so there is nothing to warm.
  if (!url || isR2Url(url)) return;
  if (!url.includes("res.cloudinary.com")) return;
  const publicId = extractPublicId(url);
  if (!publicId) return;
  try {
    applyConfig();
    await cloudinary.uploader.explicit(publicId, {
      type: "upload",
      eager: [
        { width: 400, crop: "limit", quality: "auto:good", fetch_format: "auto" },
        { width: 800, crop: "limit", quality: "auto:good", fetch_format: "auto" },
        { width: 1200, crop: "limit", quality: "auto:good", fetch_format: "auto" },
      ],
      eager_async: true,
    });
  } catch {
    // Non-critical — silently ignore.
  }
}

export async function deleteFromCloudinary(url: string): Promise<void> {
  try {
    if (isR2Url(url)) {
      await deleteFromR2(url);
      return;
    }

    applyConfig();
    const match = url.match(/\/upload\/(?:[^/]*\/)*?(?:v\d+\/)?(.+)$/);
    if (!match) return;
    const publicId = match[1].replace(/\.[^/.?#]+(?:[?#].*)?$/, "");

    const looksVideo = /\/video\/upload\//i.test(url) || /\.(mp4|webm|mov|avi|mkv)(?:[?#].*)?$/i.test(url);
    const firstType = looksVideo ? "video" : "image";
    const secondType = looksVideo ? "image" : "video";

    const first = await cloudinary.uploader.destroy(publicId, { resource_type: firstType as any });
    if (!first || (first as any).result === "not found") {
      await cloudinary.uploader.destroy(publicId, { resource_type: secondType as any });
    }
  } catch (err) {
    console.error("Media delete error:", err);
  }
}

export { cloudinary };
