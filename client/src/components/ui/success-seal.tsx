import { motion } from "framer-motion";

/* The Lucerne success seal: a scalloped "verified" badge with a dotted inner ring and a drawn check.
   The checkout scene ends on it in rose, and the confirmation page starts on it in rose and turns it green,
   so the same shape carries over from one screen to the next. */
export const SEAL_PATH = "M60.00 10.00 A12.02 12.02 0 0 1 81.69 14.95 A12.02 12.02 0 0 1 99.09 28.83 A12.02 12.02 0 0 1 108.75 48.87 A12.02 12.02 0 0 1 108.75 71.13 A12.02 12.02 0 0 1 99.09 91.17 A12.02 12.02 0 0 1 81.69 105.05 A12.02 12.02 0 0 1 60.00 110.00 A12.02 12.02 0 0 1 38.31 105.05 A12.02 12.02 0 0 1 20.91 91.17 A12.02 12.02 0 0 1 11.25 71.13 A12.02 12.02 0 0 1 11.25 48.87 A12.02 12.02 0 0 1 20.91 28.83 A12.02 12.02 0 0 1 38.31 14.95 A12.02 12.02 0 0 1 60.00 10.00 Z";
export const ROSE = ["#f27a9b", "#c8355f"] as const;
export const JADE = ["#3ee0a0", "#0ea371"] as const;

export function SealShape({ id, colors, className = "", style }: { id: string; colors: readonly [string, string]; className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 120 120" className={className} style={style} aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={colors[0]} /><stop offset="1" stopColor={colors[1]} /></linearGradient></defs>
      <path d={SEAL_PATH} fill={`url(#${id})`} />
      <circle cx="60" cy="60" r="38" fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" strokeDasharray="2 3" />
    </svg>
  );
}

export function SealTick({ className = "", delay = 0, duration = 0.4, draw = true }: { className?: string; delay?: number; duration?: number; draw?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" className={className} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <motion.path d="M42 61 l12 12 l24 -26" initial={{ pathLength: draw ? 0 : 1 }} animate={{ pathLength: 1 }} transition={{ delay, duration, ease: "easeOut" }} />
    </svg>
  );
}
