#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/FinalLucerneWebb}"
PM2_APP="${PM2_APP:-lucerne}"
APP_PORT="${APP_PORT:-5000}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${APP_PORT}/api/health}"
LIVE_URL="${LIVE_URL:-https://www.lucerne-boutique.com}"

cd "$APP_DIR"

echo "========================================"
echo "       LUCERNE SAFE DEPLOY"
echo "========================================"

echo "===== 1. FETCH LATEST GITHUB MAIN ====="
git fetch --prune origin
git reset --hard origin/main

echo "===== 2. VERIFY ENV FILE ====="
if [[ ! -f .env ]]; then
  echo "ERROR: $APP_DIR/.env is missing. Deployment stopped before changing the running app."
  exit 1
fi

echo "===== 3. INSTALL LOCKED DEPENDENCIES (INCLUDING BUILD TOOLS) ====="
# The VPS commonly runs with NODE_ENV=production. npm can then omit
# devDependencies, but this project intentionally keeps Vite/tsx/esbuild and
# other compile-time tooling in devDependencies. Force them to be present for
# the production build; the running app still starts with NODE_ENV=production.
npm ci --include=dev --no-audit --no-fund

echo "===== 3B. VERIFY BUILD TOOLCHAIN ====="
for bin in tsx vite esbuild; do
  if [[ ! -x "node_modules/.bin/$bin" ]]; then
    echo "ERROR: node_modules/.bin/$bin is missing after npm ci."
    echo "Deployment stopped before touching the working dist/ bundle."
    exit 1
  fi
done
echo "✓ tsx, vite and esbuild are installed"

echo "===== 4. BUILD INTO STAGING + ATOMIC SWAP ====="
npm run build

echo "===== 5. VERIFY BUILD BEFORE PM2 RESTART ====="
test -s dist/index.cjs
test -s dist/public/index.html
ls -lh dist/index.cjs dist/public/index.html

echo "===== 6. RESTART ONLY AFTER BUILD EXISTS ====="
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP" --update-env
else
  pm2 start dist/index.cjs --name "$PM2_APP"
fi

echo "===== 7. WAIT UNTIL BACKEND IS ACTUALLY READY ====="
ready=0
for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null 2>&1; then
    ready=1
    echo "Backend ready after ${attempt}s"
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "ERROR: Lucerne did not become healthy within 30 seconds."
  pm2 logs "$PM2_APP" --lines 80 --nostream || true
  exit 1
fi

echo "===== 8. NGINX CHECK ====="
nginx -t
systemctl reload nginx

echo "===== 9. FINAL TESTS ====="
curl --fail --silent --show-error "$HEALTH_URL"
echo
curl -I --fail --silent --show-error "$LIVE_URL" | head -n 1

echo "===== 10. VERSION ====="
echo "SERVER: $(git rev-parse HEAD)"
echo "GITHUB: $(git rev-parse origin/main)"

if [[ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]]; then
  echo "ERROR: Server commit does not match origin/main."
  exit 1
fi

pm2 save

echo "========================================"
echo "✓ DEPLOY COMPLETE"
echo "========================================"
