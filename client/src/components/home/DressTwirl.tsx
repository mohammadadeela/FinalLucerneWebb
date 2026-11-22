import { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react";
import { Dress3D } from "@/components/three/Dress3D";
import { useLanguage } from "@/i18n";

const SHADES = [
  { hex: "#E8257D", ar: "وردي", en: "Pink" },
  { hex: "#7A1140", ar: "عنّابي", en: "Berry" },
  { hex: "#1E1B22", ar: "أسود", en: "Black" },
  { hex: "#EFE3D0", ar: "عاجي", en: "Ivory" },
  { hex: "#2F6B5A", ar: "زمردي", en: "Emerald" },
  { hex: "#C9A56B", ar: "ذهبي", en: "Gold" },
];

/** The landing page showpiece: a real 3D dress the customer can twirl and re-dye. */
export function DressTwirl() {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const [shade, setShade] = useState(SHADES[0]);
  const [ok, setOk] = useState(true);
  const Arrow = isAr ? ArrowLeft : ArrowRight;
  if (!ok) return null;

  return (
    <section
      className="dress-stage relative overflow-hidden rounded-[2rem] text-white"
      style={{ ["--shade" as any]: shade.hex }}
      data-testid="section-dress-3d"
    >
      {/* Big outlined word behind the dress, like a magazine cover */}
      <p className="ghost-type display-latin pointer-events-none absolute inset-x-0 top-[38%] -translate-y-1/2 select-none whitespace-nowrap text-center text-[26vw] font-semibold leading-none sm:top-1/2 lg:text-[15rem]" aria-hidden="true">
        TWIRL
      </p>

      <div className="relative grid items-center lg:grid-cols-2">
        <div className="relative order-1 h-[340px] sm:h-[420px] lg:order-2 lg:h-[520px]">
          {/* soft pool of light under the stand */}
          <span className="pointer-events-none absolute bottom-[7%] left-1/2 h-8 w-[46%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-xl" aria-hidden="true" />
          <Dress3D color={shade.hex} className="relative h-full w-full" onFail={() => setOk(false)} />
          <span className="pointer-events-none absolute top-3 flex items-center ltr:right-4 rtl:left-4 gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium backdrop-blur-sm">
            <RotateCw className="h-3 w-3" />
            {isAr ? "اسحبيه ليدور" : "Drag to twirl"}
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative order-2 px-6 pb-8 pt-2 text-center lg:order-1 lg:p-14 lg:text-start"
        >
          <h2 className="text-[2rem] font-bold leading-tight sm:text-5xl">
            {isAr ? "لفّيه. لوّنيه." : "Twirl it. Tint it."}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-white/80 sm:text-base lg:mx-0">
            {isAr ? "اسحبي الفستان ليدور، واختاري اللون الذي يشبهك." : "Drag the dress to spin it, and pick the colour that feels like you."}
          </p>

          <div className="mt-5 flex items-center justify-center gap-2.5 lg:justify-start" role="radiogroup" aria-label={isAr ? "لون الفستان" : "Dress colour"}>
            {SHADES.map((s) => {
              const on = s.hex === shade.hex;
              return (
                <button
                  key={s.hex}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={isAr ? s.ar : s.en}
                  onClick={() => setShade(s)}
                  className={`relative h-9 w-9 rounded-full border-2 transition-transform duration-200 ${on ? "scale-110 border-white" : "border-white/40 hover:scale-105"}`}
                  style={{ background: s.hex }}
                  data-testid={`button-dress-shade-${s.en.toLowerCase()}`}
                >
                  {on && <motion.span layoutId="dress-shade-ring" className="absolute -inset-1.5 rounded-full border border-white/70" />}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs font-medium text-white/75" data-testid="text-dress-shade">{isAr ? shade.ar : shade.en}</p>

          <Link
            href="/dresses"
            className="sima-btn mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold text-foreground"
            data-testid="link-dress-3d-shop"
          >
            {isAr ? "تسوّقي الفساتين" : "Shop dresses"}
            <Arrow className="h-4 w-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
