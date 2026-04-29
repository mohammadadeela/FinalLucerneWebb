import { build } from "esbuild";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

console.log("Building frontend with Vite...");
execSync("node_modules/.bin/vite build", { stdio: "inherit", cwd: root });

console.log("Building backend with esbuild...");
await build({
  entryPoints: [path.join(root, "server/index.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(root, "dist/index.cjs"),
  packages: "external",
  define: {
    "import.meta.dirname": "__dirname",
    "import.meta.filename": "__filename",
  },
});

console.log("Build complete!");
