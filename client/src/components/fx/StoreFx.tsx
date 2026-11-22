import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";

/* Small storefront effects, in the spirit of the Sima Beauty site:
   a pink swipe across the top when the page changes, and a puff of hearts
   when a piece is added to the favourites. Neither runs in the admin area. */

interface Burst { id: number; x: number; y: number }

/** Call from a click handler to throw a puff of hearts from that spot. */
export function burstHearts(e: { clientX: number; clientY: number }) {
  window.dispatchEvent(new CustomEvent("lucerne-burst", { detail: { x: e.clientX, y: e.clientY } }));
}

export function StoreFx() {
  const [location] = useLocation();
  const [swipe, setSwipe] = useState(0);
  const first = useRef(true);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const isAdmin = location.startsWith("/admin");

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!isAdmin) setSwipe((n) => n + 1);
  }, [location]);

  useEffect(() => {
    let id = 0;
    const on = (e: Event) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      // The page is zoomed out a little on wide screens; fixed positions are in pre-zoom pixels.
      const z = parseFloat(getComputedStyle(document.documentElement).zoom || "1") || 1;
      const d = (e as CustomEvent).detail;
      const b = { id: ++id, x: d.x / z, y: d.y / z } as Burst;
      setBursts((list) => [...list, b]);
      window.setTimeout(() => setBursts((list) => list.filter((x) => x.id !== b.id)), 1100);
    };
    window.addEventListener("lucerne-burst", on);
    return () => window.removeEventListener("lucerne-burst", on);
  }, []);

  if (isAdmin) return null;
  return (
    <>
      {swipe > 0 && (
        <div key={swipe} className="route-swipe pointer-events-none fixed inset-x-0 top-0 z-[130] h-[3px] bg-primary" aria-hidden="true" />
      )}
      <div className="pointer-events-none fixed inset-0 z-[120]" aria-hidden="true">
        {bursts.map((b) =>
          [...Array(9)].map((_, i) => {
            const angle = -Math.PI / 2 + (i - 4) * 0.42;
            const dist = 50 + (i % 3) * 34;
            return (
              <motion.span
                key={`${b.id}-${i}`}
                className="absolute"
                style={{ left: b.x - 10, top: b.y - 10, color: i % 2 ? "#E8257D" : "#FF6BAA" }}
                initial={{ x: 0, y: 0, scale: 0, opacity: 1, rotate: 0 }}
                animate={{ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 30, scale: 1, opacity: 0, rotate: (i - 4) * 14 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              >
                <Heart size={14 + (i % 3) * 6} fill="currentColor" strokeWidth={0} />
              </motion.span>
            );
          }),
        )}
      </div>
    </>
  );
}
