# R2 migration status

Infrastructure verification completed on 2026-09-09.

- R2 bucket: `lucerne-media`
- Public media domain: `https://media.lucerne-boutique.com`
- Database media audit: 1,822 unique underlying Cloudinary assets referenced by the live database
- Recoverable assets preserved in R2: 1,821
- Known pre-existing dead Cloudinary asset: 1 (`dnt2lbk6r|image|upload|lucerne-boutique/isafx8yndg9sln2quvdq`)
- Hardcoded Cloudinary media URLs outside the database: 0
- R2 image delivery test: HTTP 200
- R2 video range test: HTTP 206
- Database, Cloudinary, and production website remained untouched during copy/verification

Do not delete Cloudinary or change database media URLs until the R2 application code and rollback path are deployed and verified.
