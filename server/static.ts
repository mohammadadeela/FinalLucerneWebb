import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { injectMetaTags, buildProductPageMeta } from "./seo";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // ── Product pages: inject real <title>/description/og:image/JSON-LD ──────
  // Social crawlers (WhatsApp, Facebook, Twitter) and search engines read the
  // raw HTML response and don't run the SPA's JavaScript, so this has to
  // happen server-side before the file is sent — see server/seo.ts.
  app.get("/product/:id", async (req, res, next) => {
    try {
      const meta = await buildProductPageMeta(req.params.id);
      if (!meta) return next(); // unknown product id — fall through to the plain SPA shell
      const template = await fs.promises.readFile(path.resolve(distPath, "index.html"), "utf-8");
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.send(injectMetaTags(template, meta));
    } catch (err) {
      console.error("[seo] Failed to render product meta tags:", err);
      next(); // fall back to the default index.html rather than erroring the page
    }
  });

  // Long-term cache for hashed/fingerprinted bundles in /assets, no cache for HTML
  app.use(
    express.static(distPath, {
      etag: true,
      lastModified: true,
      setHeaders: (res, filePath) => {
        if (/\.html?$/i.test(filePath)) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          // Vite emits content-hashed filenames under /assets — safe to cache forever
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else if (/\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|woff2?|ttf|otf)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=2592000");
        } else {
          res.setHeader("Cache-Control", "public, max-age=3600");
        }
      },
    }),
  );

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
