import { build } from "esbuild";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const liveDist = path.join(root, "dist");
const stagingDist = path.join(root, ".dist-next");
const previousDist = path.join(root, ".dist-previous");

function requireBuiltFile(filePath: string, label: string) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error(`${label} was not generated: ${filePath}`);
  }
}

// Build into a staging directory first. The currently running PM2 process can
// continue serving the existing dist/ directory while the new build is made.
// Only after both frontend and backend succeed do we swap the new build in.
fs.rmSync(stagingDist, { recursive: true, force: true });

try {
  console.log("Building frontend with Vite into staging directory...");
  execFileSync(
    path.join(root, "node_modules", ".bin", "vite"),
    ["build", "--outDir", path.join(stagingDist, "public"), "--emptyOutDir"],
    { stdio: "inherit", cwd: root },
  );

  console.log("Building backend with esbuild into staging directory...");
  await build({
    entryPoints: [path.join(root, "server/index.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.join(stagingDist, "index.cjs"),
    packages: "external",
    define: {
      "import.meta.dirname": "__dirname",
      "import.meta.filename": "__filename",
    },
  });

  requireBuiltFile(path.join(stagingDist, "index.cjs"), "Backend build");
  requireBuiltFile(path.join(stagingDist, "public", "index.html"), "Frontend build");

  // Same-filesystem renames make the final swap very fast and ensure PM2 is
  // never intentionally restarted while dist/index.cjs is missing.
  fs.rmSync(previousDist, { recursive: true, force: true });
  if (fs.existsSync(liveDist)) {
    fs.renameSync(liveDist, previousDist);
  }

  try {
    fs.renameSync(stagingDist, liveDist);
  } catch (swapError) {
    if (!fs.existsSync(liveDist) && fs.existsSync(previousDist)) {
      fs.renameSync(previousDist, liveDist);
    }
    throw swapError;
  }

  fs.rmSync(previousDist, { recursive: true, force: true });
  console.log("Build complete and activated safely!");
} catch (error) {
  fs.rmSync(stagingDist, { recursive: true, force: true });
  throw error;
}
