import { useEffect, useRef, type VideoHTMLAttributes } from "react";

type AutoplayVideoProps = VideoHTMLAttributes<HTMLVideoElement>;

/**
 * A <video> wrapper that reliably autoplays on mobile browsers.
 *
 * Symptom this fixes: on first visit (mobile Safari/Chrome), hero/home
 * videos would render a blank frame or "broken video" icon instead of
 * playing, and would only start working after navigating away and back.
 *
 * Root cause: our video sources are only known once site settings/data
 * finish loading from the API, so the <video> element's `src` is set
 * asynchronously after the initial render rather than being present in
 * the very first paint. Some mobile browsers evaluate the native
 * `autoPlay` attribute once and don't retry when `src` shows up later —
 * so the element sits there loaded but never actually playing. Once the
 * file is cached by the browser (e.g. after navigating back), a fresh
 * mount autoplays immediately, which is why it "fixes itself" on the
 * second visit.
 *
 * Fix: keep a ref to the element and explicitly call `.load()` / `.play()`
 * whenever `src` changes, forcing the browser to attempt playback instead
 * of relying purely on the attribute.
 */
export function AutoplayVideo({ src, ...props }: AutoplayVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const vid = ref.current;
    if (!vid || !src) return;
    vid.load();
    const playPromise = vid.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Autoplay can still be blocked in rare cases (e.g. low power mode);
        // fail silently since the poster image remains visible.
      });
    }
  }, [src]);

  return (
    <video
      ref={ref}
      key={src}
      src={src}
      autoPlay
      muted
      loop
      playsInline
      {...props}
    />
  );
}
