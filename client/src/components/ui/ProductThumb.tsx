import { useState } from "react";
import { optimizeCloudinaryUrl, blurCloudinaryUrl } from "@/lib/utils";

interface ProductThumbProps {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  grayscale?: boolean;
  hover?: boolean;
}

export function ProductThumb({
  src,
  alt = "",
  className = "",
  grayscale = false,
  hover = false,
}: ProductThumbProps) {
  const [loaded, setLoaded] = useState(false);

  const optimized = optimizeCloudinaryUrl(src, 120);
  const blurred = blurCloudinaryUrl(src);

  if (!src) return null;

  return (
    <div
      className={`relative overflow-hidden flex-shrink-0 ${className} ${hover ? "transition-transform duration-300 group-hover:scale-105" : ""}`}
    >
      {blurred && (
        <img
          src={blurred}
          aria-hidden="true"
          alt=""
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-0" : "opacity-100"} ${grayscale ? "grayscale" : ""}`}
        />
      )}
      <img
        src={optimized ?? src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={(e) => { e.currentTarget.src = "/placeholder-product.svg"; setLoaded(true); }}
        className={`relative w-full h-full object-cover transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"} ${grayscale ? "grayscale" : ""}`}
      />
    </div>
  );
}
