export type HeroMode = "poster" | "cinematic";
export type HeroTier = "full" | "lite";

interface NavigatorExtras {
  connection?: { saveData?: boolean };
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

function supportsWebGl2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2", {
      failIfMajorPerformanceCaveat: true,
    });
    if (!context) return false;
    const lose = context.getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Decide whether the page may upgrade from the poster to the cinematic. */
export function detectMode(): HeroMode {
  if (typeof window === "undefined") return "poster";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    return "poster";
  const extras = navigator as Navigator & NavigatorExtras;
  if (extras.connection?.saveData) return "poster";
  if (!supportsWebGl2()) return "poster";
  return "cinematic";
}

/** Pick a render budget for the current device. */
export function detectTier(): HeroTier {
  if (typeof window === "undefined") return "lite";
  const extras = navigator as Navigator & NavigatorExtras;
  if (window.matchMedia("(pointer: coarse)").matches) return "lite";
  if (extras.deviceMemory !== undefined && extras.deviceMemory < 4)
    return "lite";
  if (
    extras.hardwareConcurrency !== undefined &&
    extras.hardwareConcurrency <= 4
  )
    return "lite";
  return "full";
}
