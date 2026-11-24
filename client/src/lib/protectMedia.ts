/* Makes it hard for shoppers to save the shop's photos and videos.
 *
 * On the storefront (never in the admin area, where staff need to save and download):
 *   - no right-click menu on photos and videos ("Save image as…"),
 *   - no long-press "Save photo" sheet on phones,
 *   - no dragging a photo out to the desktop or another tab,
 *   - no download or picture-in-picture button on video players.
 *
 * This stops the ordinary ways of saving. It cannot stop a screenshot or a determined
 * technical user: anything a browser can show, it has already downloaded.
 */

const inAdmin = () => document.documentElement.classList.contains("admin-theme");

function isMedia(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.closest) return false;
  if (el.closest("img, video, picture, canvas")) return true;
  // A photo behind a transparent layer (watermark, gradient, link) still counts.
  const holder = el.closest("a, button, div, span, figure");
  return !!holder && !!holder.querySelector?.(":scope > img, :scope > video, :scope > picture") && !el.closest("input, textarea, [contenteditable]");
}

function lockVideo(video: HTMLVideoElement) {
  if (video.dataset.locked) return;
  video.dataset.locked = "1";
  video.setAttribute("controlsList", "nodownload noremoteplayback");
  video.disablePictureInPicture = true;
  (video as any).disableRemotePlayback = true;
}

export function protectMedia() {
  if (typeof window === "undefined" || (window as any).__lucerneMediaLocked) return;
  (window as any).__lucerneMediaLocked = true;

  const block = (e: Event) => {
    if (inAdmin() || !isMedia(e.target)) return;
    e.preventDefault();
  };
  document.addEventListener("contextmenu", block, true);
  document.addEventListener("dragstart", block, true);

  const lockAll = (root: ParentNode) => {
    if (inAdmin()) return;
    root.querySelectorAll?.("video").forEach((v) => lockVideo(v as HTMLVideoElement));
  };
  lockAll(document);
  new MutationObserver((changes) => {
    for (const change of changes) {
      change.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node instanceof HTMLVideoElement) { if (!inAdmin()) lockVideo(node); }
        else lockAll(node);
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
