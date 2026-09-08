import {
  BODY,
  FOLD,
  MARK_H,
  MARK_W,
  WORD,
  WORD_H,
  WORD_W,
} from "../src/brand-geometry.mjs";

/* The BRIP endorsement lockup: the ribbon-B mark beside the drawn BRIP
 * wordmark.
 *
 * Both drawings come from src/brand-geometry.mjs, which is the only place
 * either exists in this repository and whose header says where their master
 * is. The favicon and the share card are rendered from the same module by
 * scripts/generate-brand-assets.mjs, so the chrome cannot carry a different
 * version of the mark than the tab icon does.
 *
 * The wordmark is lettering, not type. It was the four characters `brip`
 * set in the body face, and a wordmark set in a body face changes when the
 * face does — including in the frame before the woff2 lands, which is the
 * frame a cold visit renders in. Sizing it in `em` (globals.css) keeps the
 * behaviour that gave us: it still answers to `font-size`.
 */

interface BripLockupProps {
  className?: string;
  label?: string;
}

export function BripLockup({
  className = "",
  label = "BRIP",
}: BripLockupProps) {
  return (
    <span className={`brip-lockup ${className}`.trim()}>
      <svg
        className="brip-mark"
        viewBox={`0 0 ${MARK_W} ${MARK_H}`}
        aria-hidden="true"
      >
        <path className="brip-mark-fold" d={FOLD} />
        <path className="brip-mark-body" d={BODY} />
      </svg>
      {/* The word and its trademark sign are a row of their own, not two
          more items in the outer one. The sign is aligned to the top of
          whatever row holds it, and the mark is taller than the word — so
          in a single row it would hang off the mark's cap rather than the
          word's, which is a sign floating in space above the lettering. */}
      <span className="brip-word-lockup">
        <svg
          className="brip-word"
          viewBox={`0 0 ${WORD_W} ${WORD_H}`}
          role="img"
          aria-label={label}
        >
          <path d={WORD} />
        </svg>
        <sup className="brip-tm" aria-hidden="true">
          ™
        </sup>
      </span>
    </span>
  );
}
