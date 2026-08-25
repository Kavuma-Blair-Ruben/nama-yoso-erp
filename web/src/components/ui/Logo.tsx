import Image from "next/image";

// Real pixel dimensions of public/brand/nama-yoso-logo.png, needed by
// next/image for layout even though it renders at whatever `height` is
// requested — keeps every call site's aspect ratio correct automatically.
const ASPECT = 1595 / 1219;

/**
 * The real NAMA YOSO logo file (public/brand/nama-yoso-logo.png — the
 * blue-on-white line-art wordmark supplied by the user), rendered as-is
 * rather than redrawn. The original JPEG's white background was unmatted
 * to a transparent PNG (constant ink color, per-pixel alpha derived from
 * distance-from-white) so it drops cleanly onto any background color —
 * the light sidebar, white print documents, or anything else later.
 */
export function Logo({ className, height = 44, white = false }: { className?: string; height?: number; white?: boolean }) {
  return (
    <Image
      src="/brand/nama-yoso-logo.png"
      alt="NAMA YOSO"
      height={height}
      width={Math.round(height * ASPECT)}
      className={className}
      // The source ink is a single solid color (constant color, per-pixel
      // alpha) — brightness(0) collapses every opaque pixel to black
      // regardless of its original hue, then invert(1) flips that to
      // white, so this recolors correctly on a dark background without a
      // second logo asset to keep in sync with the original.
      style={{ height, width: "auto", maxWidth: "100%", objectFit: "contain", filter: white ? "brightness(0) invert(1)" : undefined }}
      unoptimized
      priority
    />
  );
}
