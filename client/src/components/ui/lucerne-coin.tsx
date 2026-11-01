/* The loyalty mark: a gold Lucerne coin with a shine that sweeps across it. */
export function LucerneCoin({ className = "w-9 h-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <defs>
        <linearGradient id="lc-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1bf" /><stop offset=".45" stopColor="#e9bf5f" /><stop offset="1" stopColor="#c8923a" /></linearGradient>
        <linearGradient id="lc-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbe7a6" /><stop offset="1" stopColor="#b8822e" /></linearGradient>
        <clipPath id="lc-clip"><circle cx="20" cy="20" r="17" /></clipPath>
      </defs>
      <circle cx="20" cy="21.5" r="17" fill="rgba(0,0,0,.18)" />
      <circle cx="20" cy="20" r="17" fill="url(#lc-rim)" />
      <circle cx="20" cy="20" r="14" fill="url(#lc-gold)" />
      <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(120,70,10,.35)" strokeWidth="1" strokeDasharray="1.5 2.2" />
      <text x="20" y="25.5" textAnchor="middle" fontSize="15" fontWeight="700" fill="#7a4d10" style={{ fontFamily: "var(--font-display, 'Cormorant Garamond'), Georgia, serif" }}>L</text>
      <g clipPath="url(#lc-clip)">
        <rect x="-14" y="-6" width="10" height="52" fill="rgba(255,255,255,.55)" transform="rotate(25 20 20)" className="lc-shine" />
      </g>
      <style>{`@keyframes lc-shine{0%{transform:translateX(-18px) rotate(25deg)}60%,100%{transform:translateX(58px) rotate(25deg)}} .lc-shine{transform-box:fill-box;transform-origin:center;animation:lc-shine 3.2s ease-in-out infinite} @media (prefers-reduced-motion: reduce){.lc-shine{animation:none}}`}</style>
    </svg>
  );
}
