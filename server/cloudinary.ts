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
        quality: 100,
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error("Upload failed"));
        } else {
          resolve(result.secure_url);
        }
      }
    );
    upload.end(buffer);
  });
}

export async function uploadVideoToCloudinary(
  buffer: Buffer,
  originalName: string
): Promise<string> {
  applyConfig();
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
          // Inject f_mp4 so Cloudinary always serves a browser-compatible mp4
          // regardless of the original upload format (mov, avi, mkv, etc.)
          const mp4Url = result.secure_url.replace("/upload/", "/upload/f_mp4,vc_h264/");
          resolve(mp4Url);
        }
      }
    );
    upload.end(buffer);
  });
}

export async function deleteFromCloudinary(url: string): Promise<void> {
  try {
    // Skip any transformation segments (e.g. f_mp4,vc_h264/) before the version token
    const match = url.match(/\/upload\/(?:[^/]*\/)*?(?:v\d+\/)?(.+)$/);
    if (!match) return;
    const publicId = match[1].replace(/\.[^/.]+$/, "");
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Cloudinary delete error:", err);
  }
}

export { cloudinary };
