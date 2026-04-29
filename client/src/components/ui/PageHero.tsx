import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface PageHeroProps {
  image: string;
  imagePosition?: string;
  title: string;
  subtitle?: string;
  titleTestId?: string;
  subtitleTestId?: string;
  video?: string;
  videoPosition?: string;
}

export function PageHero({
  image,
  imagePosition = "center",
  title,
  subtitle,
  titleTestId,
  subtitleTestId,
  video,
  videoPosition = "50% 50%",
}: PageHeroProps) {
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const smoothX = useSpring(mouseX, { stiffness: 50, damping: 18 });
  const smoothY = useSpring(mouseY, { stiffness: 50, damping: 18 });

  const imgX = useTransform(smoothX, [0, 1], ["2%", "-2%"]);
  const imgY = useTransform(smoothY, [0, 1], ["1.5%", "-1.5%"]);

  const textX = useTransform(smoothX, [0, 1], ["-7px", "7px"]);
  const textY = useTransform(smoothY, [0, 1], ["-4px", "4px"]);

  const glareX = useTransform(smoothX, [0, 1], ["15%", "85%"]);
  const glareY = useTransform(smoothY, [0, 1], ["15%", "85%"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width);
    mouseY.set((e.clientY - rect.top) / rect.height);
  };

  const handleMouseLeave = () => {
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <section
      className="relative h-72 md:h-[420px] flex items-center justify-center overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Parallax media layer — video takes priority over image */}
      <motion.div
        className="absolute z-0 will-change-transform"
        style={{
          inset: "-7%",
          x: imgX,
          y: imgY,
        }}
        animate={video ? undefined : { scale: [1.0, 1.07, 1.03, 1.08, 1.0] }}
        transition={video ? undefined : { duration: 22, repeat: Infinity, ease: "easeInOut" }}
      >
        {video ? (
          <video
            src={video}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
            style={{ objectPosition: videoPosition }}
          />
        ) : (
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover"
            style={{ objectPosition: imagePosition }}
          />
        )}
      </motion.div>

      {/* Depth gradient layers */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at 50% 60%, transparent 30%, rgba(0,0,0,0.28) 100%)",
        }}
      />
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.05) 50%, transparent 100%)",
        }}
      />
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.22) 0%, transparent 35%)",
        }}
      />

      {/* Animated glare that follows the mouse */}
      <motion.div
        className="absolute z-[2] pointer-events-none"
        style={{
          width: 480,
          height: 480,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,255,255,0.09) 0%, transparent 68%)",
          left: glareX,
          top: glareY,
          translateX: "-50%",
          translateY: "-50%",
        }}
      />

      {/* Decorative rotating rings for depth */}
      <div className="absolute inset-0 z-[2] overflow-hidden pointer-events-none">
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 340,
            height: 340,
            border: "1px solid rgba(255,255,255,0.09)",
            right: -80,
            top: -100,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 50, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 200,
            height: 200,
            border: "1px solid rgba(255,255,255,0.07)",
            right: -20,
            top: -40,
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 220,
            height: 220,
            border: "1px solid rgba(255,255,255,0.06)",
            left: -60,
            bottom: -60,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 42, repeat: Infinity, ease: "linear" }}
        />
        {/* Horizontal rule lines */}
        <motion.div
          className="absolute h-px"
          style={{
            background:
              "linear-gradient(to right, transparent, rgba(255,255,255,0.12), transparent)",
            left: "10%",
            right: "10%",
            bottom: "28%",
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      {/* 3D floating text with mouse tracking */}
      <motion.div
        className="relative z-10 text-center text-white px-4"
        style={{ x: textX, y: textY }}
      >
        <motion.h1
          className="font-display text-3xl sm:text-4xl md:text-6xl font-bold mb-3 tracking-tight select-none"
          data-testid={titleTestId}
          initial={{ opacity: 0, y: 40, rotateX: "25deg" }}
          animate={{ opacity: 1, y: 0, rotateX: "0deg" }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{
            textShadow: [
              "0 1px 0 rgba(255,255,255,0.18)",
              "0 2px 6px rgba(0,0,0,0.5)",
              "0 6px 20px rgba(0,0,0,0.35)",
              "0 12px 40px rgba(0,0,0,0.2)",
            ].join(", "),
          }}
        >
          {title}
        </motion.h1>

        {subtitle && (
          <motion.p
            className="text-sm sm:text-base md:text-lg font-light opacity-90 max-w-xl mx-auto"
            data-testid={subtitleTestId}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.55)" }}
          >
            {subtitle}
          </motion.p>
        )}
      </motion.div>
    </section>
  );
}
