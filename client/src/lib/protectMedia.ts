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
  if (el.closest("input, textarea, select, [contenteditable]")) return false;
  // A link, button or figure that holds a photo anywhere inside it (a product card).
  const wrapper = el.closest("a, button, figure");
  if (wrapper && wrapper.querySelector("img, video, picture")) return true;
  // A photo behind a transparent layer (watermark, gradient): a sibling inside the same box.
  const box = el.closest("div, span");
  return !!box && !!box.querySelector(":scope > img, :scope > video, :scope > picture");
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
  // Android opens its "Download image" menu from a long press: the press is cancelled on
  // photos and videos before the menu can open. A normal tap or swipe is not affected.
  let pressTimer: number | undefined;
  const cancelPress = () => { if (pressTimer) { window.clearTimeout(pressTimer); pressTimer = undefined; } };
  document.addEventListener("touchstart", (e) => {
    cancelPress();
    if (inAdmin() || e.touches.length !== 1 || !isMedia(e.target)) return;
    const target = e.target as HTMLElement;
    pressTimer = window.setTimeout(() => {
      // Still holding after 350ms: this is a long press, not a tap.
      target.dispatchEvent(new Event("touchcancel", { bubbles: true }));
      window.getSelection()?.removeAllRanges();
    }, 350);
  }, { capture: true, passive: true });
  for (const type of ["touchend", "touchmove", "touchcancel", "scroll"]) {
    document.addEventListener(type, cancelPress, { capture: true, passive: true });
  }
  // Photos are marked non-draggable as they appear (the attribute some browsers go by).
  const lockImages = (root: ParentNode) => {
    if (inAdmin()) return;
    root.querySelectorAll?.("img").forEach((img) => img.setAttribute("draggable", "false"));
  };
  lockImages(document);

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
        if (node instanceof HTMLImageElement) { if (!inAdmin()) node.setAttribute("draggable", "false"); }
        else lockImages(node);
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}
