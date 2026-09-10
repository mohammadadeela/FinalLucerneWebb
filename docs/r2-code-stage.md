# Cloudflare R2 production media architecture

Cloudflare R2 is the primary media provider. `MEDIA_STORAGE=r2` is the production setting; Cloudinary is retained only as an explicit emergency rollback provider with `MEDIA_STORAGE=cloudinary`.

Current scope:
- dependency-free AWS Signature V4 client for Cloudflare R2
- original + responsive WebP variants + blur placeholder for new image uploads
- original + optimized H.264 MP4 + poster for new video uploads
- R2-aware delete helper
- frontend support for R2 responsive variants, blur placeholders, and video posters
- primary preconnect to `media.lucerne-boutique.com`

Verification completed on 2026-09-09:
- production build passed in an isolated worktree
- real R2 image upload passed
- main/1200/800/400/blur image variants all returned HTTP 200
- original image backup was present
- real FFmpeg video pipeline passed
- optimized H.264 MP4 returned HTTP 200
- byte-range streaming returned HTTP 206
- WebP and JPEG posters returned HTTP 200
- original video backup was present

The repository includes the transactional database cutover and media-only rollback tooling used for safe migrations. Production deployments should keep Cloudinary assets for a rollback retention period rather than deleting them immediately.
