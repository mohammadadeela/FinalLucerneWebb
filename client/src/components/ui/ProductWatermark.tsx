export function ProductWatermark({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const logoSize =
    size === "sm" ? "w-12 h-8 sm:w-20 sm:h-14" :
    size === "lg" ? "w-20 h-14 sm:w-36 sm:h-24" :
    "w-14 h-10 sm:w-28 sm:h-20";

  const textSize =
    size === "sm" ? "text-[8px] sm:text-[12px]" :
    size === "lg" ? "text-[11px] sm:text-[18px]" :
    "text-[9px] sm:text-[15px]";

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none z-20 ${className ?? ""}`}
      aria-hidden="true"
    >
      <div className="flex flex-col items-center gap-1 opacity-35 drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]">
        <svg
          version="1.0"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 393 297"
          preserveAspectRatio="xMidYMid meet"
          className={`${logoSize} fill-white`}
          aria-hidden="true"
        >
          <g transform="translate(0,297) scale(0.1,-0.1)" fill="currentColor" stroke="none">
            <path d="M2685 2594 c-179 -27 -296 -59 -490 -136 -259 -103 -609 -284 -965
-501 -126 -77 -160 -104 -160 -124 0 -26 34 -12 158 65 434 269 823 464 1138
571 167 57 252 73 379 75 100 1 115 -1 160 -25 105 -53 147 -157 126 -310 -15
-115 -53 -252 -108 -389 -114 -287 -230 -468 -408 -638 -133 -127 -246 -199
-407 -257 -76 -27 -77 -27 -101 -9 -113 89 -164 123 -242 160 -128 61 -190 76
-342 81 -115 5 -141 3 -201 -16 -114 -34 -167 -103 -125 -159 11 -15 37 -37
59 -49 52 -30 240 -89 334 -105 102 -17 356 -17 449 1 l74 15 49 -55 c67 -75
133 -175 176 -267 33 -70 37 -85 37 -163 0 -78 -2 -89 -27 -122 -16 -20 -53
-48 -85 -64 -55 -27 -64 -28 -198 -28 -145 0 -184 8 -345 66 -194 71 -407 241
-518 414 -151 234 -171 410 -152 1340 4 223 3 256 -13 301 -37 107 -122 196
-225 235 -71 26 -176 37 -187 19 -12 -19 23 -40 64 -40 69 0 161 -41 217 -96
57 -57 104 -160 104 -227 0 -39 -17 -49 -39 -24 -6 8 -35 19 -64 26 -103 23
-199 -28 -248 -133 -59 -124 -18 -252 87 -274 60 -13 151 6 196 40 18 14 37
26 42 27 6 0 10 -131 11 -337 2 -555 40 -725 211 -949 208 -272 589 -458 899
-440 163 10 250 52 298 146 64 128 4 322 -165 534 -32 39 -58 75 -58 80 0 4
10 12 23 17 12 5 56 23 99 40 222 90 465 318 620 583 130 221 234 512 257 716
20 186 -46 322 -179 366 -48 16 -166 26 -215 19z m-1854 -495 c30 -12 55 -50
64 -99 9 -50 -36 -135 -92 -174 -34 -23 -53 -29 -102 -30 -53 -1 -64 2 -87 26
-38 37 -44 107 -14 175 45 104 128 141 231 102z m759 -1010 c92 -23 220 -84
294 -139 100 -73 76 -85 -169 -85 -189 1 -281 15 -424 66 -113 39 -145 59
-149 91 -5 38 38 61 173 92 38 9 200 -6 275 -25z"/>
          </g>
        </svg>
        <span
          className={`text-white font-black tracking-[0.25em] uppercase ${textSize} leading-none`}
        >
          LUCERNE BOUTIQUE
        </span>
      </div>
    </div>
  );
}
