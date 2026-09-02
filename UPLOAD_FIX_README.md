# Fix: "Unexpected token '<' … is not valid JSON" / "Video upload failed" when adding product photos or videos

## What the error actually means
When you upload a photo or video, the browser sends it to `/api/upload` (images) or
`/api/upload-video` (videos). The error message:

> Unexpected token '<', "<html> <h"... is not valid JSON

means the server answered with an **HTML error page** instead of JSON. The app's
own code always answers with JSON, so this HTML is coming from the **web server /
reverse proxy that sits in front of the app** (typically **nginx** on a VPS, or the
hosting platform's gateway). It is rejecting the upload **before** it ever reaches
the app — almost always because the file is larger than the proxy's allowed request
size.

The app code change in this release makes the admin panel show a clear message
("Image/Video too large to upload…") instead of crashing on that HTML. But to make
uploads actually succeed, you must raise the size limit on the proxy. This is a
one-line server config change.

---

## Fix for nginx (most common — Hostinger / VPS)
nginx's default `client_max_body_size` is **1 MB**, so any normal product photo is
rejected. Raise it:

1. Open your site's nginx config (often `/etc/nginx/sites-available/your-site` or
   `/etc/nginx/nginx.conf`).
2. Inside the `server { … }` block (or the specific `location / { … }`), add:

   ```nginx
   client_max_body_size 500M;   # allow large product videos; images are far smaller
   ```

3. Also make sure slow large uploads aren't cut off by short timeouts. In the same
   `server` or `location` block add (safe values):

   ```nginx
   proxy_read_timeout 300s;
   proxy_send_timeout 300s;
   client_body_timeout 300s;
   ```

4. Test and reload nginx:

   ```bash
   sudo nginx -t        # should say "syntax is ok" / "test is successful"
   sudo systemctl reload nginx
   ```

That's it — photo and video uploads will work after the reload.

---

## If you are on a hosting platform (Render, Railway, etc.) instead of raw nginx
- The platform's gateway may impose its own request-size or timeout limit.
- Images are well within normal limits, so if **images** now work but only large
  **videos** fail, the platform is timing out on the big upload. Options:
  - Upload smaller / compressed videos, OR
  - Upload the video to Cloudinary directly and paste the URL into the product's
    media URL field (the admin form supports pasting a media URL).

---

## App-side limits (already configured correctly — listed for reference)
These are the limits the application itself enforces. They are already high enough;
you normally do **not** need to change them. They live in `server/routes.ts`:

- Images: up to **25 MB** each (`upload`, `uploadLocal`).
- Videos: up to **500 MB** each (`uploadLocalVideo`).

The proxy limit (above) must be **>=** these for uploads to reach the app.

---

## How to confirm the fix worked
1. Open the admin "Add product" dialog.
2. Add a photo larger than 1 MB.
   - Before the proxy fix: red "too large" / non-JSON error.
   - After the proxy fix: the photo uploads and appears in the form.
3. Add a short video and confirm it uploads (or falls back to a local copy).
