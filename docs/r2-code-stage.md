# R2 code-stage safety plan

This branch introduces R2 support behind `MEDIA_STORAGE=r2` while keeping Cloudinary as the default and rollback path.

Current scope:
- dependency-free AWS Signature V4 client for Cloudflare R2
- original + responsive WebP variants + blur placeholder for new image uploads
- original + optimized H.264 MP4 + poster for new video uploads
- R2-aware delete helper
- frontend support for R2 responsive variants, blur placeholders, and video posters
- preconnect to `media.lucerne-boutique.com`

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

The live database media URLs must not be changed until the R2-compatible application code is deployed, new uploads are switched to R2, and a final database/media delta backup is completed.
