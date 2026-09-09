# R2 code-stage safety plan

This branch introduces R2 support behind `MEDIA_STORAGE=r2` while keeping Cloudinary as the default and rollback path.

Current scope:
- dependency-free AWS Signature V4 client for Cloudflare R2
- original + responsive WebP variants + blur placeholder for new image uploads
- original + optimized H.264 MP4 + poster for new video uploads
- R2-aware delete helper
- frontend support for R2 responsive variants, blur placeholders, and video posters
- preconnect to `media.lucerne-boutique.com`

The live database media URLs must not be changed until this branch builds and upload tests pass on the VPS.
