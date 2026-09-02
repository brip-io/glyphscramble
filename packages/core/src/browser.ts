import type { GlyphPayload } from "./types.js";

export interface MountOptions {
  timeoutMs?: number;
  errorText?: string;
}

/**
 * Installs the matching face, waits for it, and reveals an aria-hidden block.
 * The element must already contain only payload.encodedText.
 */
export async function revealGlyphPayload(
  element: HTMLElement,
  payload: GlyphPayload,
  options: MountOptions = {},
): Promise<void> {
  element.hidden = true;
  element.setAttribute("aria-hidden", "true");
  const style = document.createElement("style");
  if (payload.cspNonce) style.nonce = payload.cspNonce;
  style.textContent = payload.css;
  document.head.append(style);
  element.style.fontFamily = `"${payload.family}"`;
  element.style.visibility = "hidden";
  element.hidden = false;
  try {
    await Promise.race([
      document.fonts.load(
        `1em "${payload.family}"`,
        payload.encodedText.slice(0, 32),
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("font timeout")),
          options.timeoutMs ?? 8_000,
        ),
      ),
    ]);
    if (!document.fonts.check(`1em "${payload.family}"`))
      throw new Error("font failed to load");
    element.style.visibility = "visible";
    element.dataset.glyphscramble = "ready";
  } catch {
    element.textContent =
      options.errorText ?? "This protected content could not be displayed.";
    element.style.fontFamily = "inherit";
    element.style.visibility = "visible";
    element.dataset.glyphscramble = "error";
  }
}
