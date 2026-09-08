/* The BRIP endorsement lockup: the ribbon-B mark beside the drawn BRIP
 * wordmark.
 *
 * BOTH DRAWINGS ARE COPIES, and that is the thing to know before editing
 * them. Their master is `src/brand-geometry.mjs` in the BRIP monorepo, and
 * this repository is public and shares no runtime code with it — so the
 * paths are transcribed here rather than imported, and a change to the
 * identity has to be brought across by hand. Do not redraw either by eye:
 * a favicon and a footer carrying different versions of somebody else’s
 * mark is the fault the single-master rule exists to stop, and it is worse
 * across a repository boundary because nothing here can detect it.
 * `app/icon.svg` is the third copy; it moves with these two.
 *
 * TWO PATHS, AND THE ORDER MATTERS. The mark is a folded ribbon reading as
 * a B: two dark arms with the ribbon’s pale underside showing where it
 * turns. FOLD is the whole silhouette and BODY is the dark part of it, so
 * the mark draws FOLD then BODY and the pale tone is what is left
 * uncovered rather than a third shape to hold in register. Flattened to
 * one tone the B reads as a blob with a notch in it, which is why the
 * previous one-tone folder mark could be a single path and this cannot.
 *
 * The wordmark is lettering, not type. It was the four characters `brip`
 * set in the body face, and a wordmark set in a body face changes when the
 * face does — including in the frame before the woff2 lands, which is the
 * frame a cold visit renders in. Sizing it in `em` (globals.css) keeps the
 * behaviour that gave us: it still answers to `font-size`.
 */

/** The whole silhouette. Drawn first, in the pale tone. */
const FOLD =
  "M24.47 22.64L24.49 22.78L25.02 23.04L26.02 23.67C27.26 24.63 28.44 26 28.93 27.53C29.47 29.21 29.66 30.82 29.43 32.58C28.94 36.27 25.8 39.58 22.09 40L18.58 39.49L11.66 37.82C8.65 37.07 5.23 36.57 3.5 33.68L3.03 32.6L2.83 30.65L2.82 30.46L2.44 30.36L1.7 30.1L0.17 28.64L0 25.7L0 19.95L0 18.36L0.41 17.32L1.38 17.35L3.3 17.83L8.12 18.94L11 19.63L11.97 19.45L13.7 19.02L19.45 17.55L19.6 17.48L19.41 17.42L8.45 14.78L2.67 13.37L1.13 13L0.27 12.57L0 11.44L0 9.86L0.05 2.94L0 0.97L0.61 0.02L1.59 0.15L2.94 0.45L9.11 1.83L18.76 4C20.76 4.43 22.76 4.77 24.53 5.86C28.66 8.41 30.05 14.02 28.09 18.36C27.3 20.1 26.01 21.54 24.47 22.64Z";

/** The two dark arms, drawn over the silhouette. */
const BODY =
  "M25.11 22.18L24.95 22.26L25 22.07C25.45 20.5 24.61 19.28 23.24 18.56L20.63 17.72L16.39 16.69L4.65 13.85L1.57 13.11L0.3 12.62C-0.14 12.14 0 11.3 0 10.71L0 5.95L0 1.82L0.2 0.27L1.39 0.1L2.94 0.45L10.65 2.18L18.76 4C20.76 4.43 22.76 4.77 24.53 5.86C28.66 8.41 30.05 14.02 28.09 18.36C27.39 19.9 26.31 21.03 25.11 22.18ZM24.42 39.36L24.26 39.4L24.33 39.22L24.53 38.47C24.61 36.48 22.21 35.53 20.65 35.14L19.51 34.84L18.17 34.48L5.53 31.18L2.86 30.47C1.91 30.2 0.95 29.88 0.38 29.02L0 26.72L0 22.95L0 18.99L0.24 17.48L1.34 17.34L2.69 17.67L9.62 19.31L19.84 21.6C21.79 22.03 23.94 22.27 25.64 23.4C29.7 26.11 30.67 31.91 28.15 35.99C27.24 37.46 25.95 38.57 24.42 39.36Z";

/** BRIP, on its own cap-height grid: the box is exactly the cap height, so
    a surface can size the word in ems against the type beside it. */
const WORD =
  "M247.1 63.2C246.9 63.7 247.3 64 247.6 64.3L270.3 88C271.5 89.3 275.2 92.8 276 94C276.5 94.8 276.8 96 276.5 97C276.2 98.3 275.2 99.2 273.9 99.6C272.3 100 243.4 100 241.1 99.6C239.1 99.3 237.1 98.3 235.7 96.9C227.8 88.8 220.4 80.2 212.7 72C210.3 69.5 207.2 65.2 204.1 63.9C203.3 63.5 202.3 63.2 201.4 63.2C199.2 63 179 62.9 178.2 63.3C177.1 64.4 178.6 90 177.8 93.4C177.4 95.2 176.4 96.8 175 98C173.8 98.9 172.5 99.5 171.1 99.8C169 100.1 153.2 100.1 151.4 99.7C149.8 99.3 148.4 98.3 147.3 97.1C144.2 93.8 145.1 88.7 145.1 84.5L145.1 31.3L145.1 16C145.1 13.5 145 10.8 145.1 8.3C145.2 7 145.6 5.7 146.3 4.6C149 -0.3 153.7 0 158.6 0L222.4 0L241.3 0C244.6 0 248 -0.1 251.3 0.1C254.3 0.3 257.4 0.9 260.2 1.9C270 5.6 276.3 13.3 278.7 23.5C279.6 27.4 280 31.5 279.4 35.5C277.7 48.1 267.9 58.6 255.7 61.8L251.1 62.7C249.9 62.9 248.2 62.7 247.1 63.2ZM302.2 0C305.3 0 314.3 -0.4 316.9 0.4C318.6 0.9 320.1 2.1 321.2 3.5C322.1 4.6 322.7 6.1 322.9 7.5C323.3 10.3 323 15.3 323 18.3L323 41.9L323 74.9C323 80.5 323.2 86.4 323 92L322.5 94.3C321.4 97.3 318.6 99.5 315.4 99.9L314.1 99.9C310.8 100 298.7 100.3 296.3 99.7C294.7 99.3 293.2 98.4 292.1 97.2C291 95.9 290.2 94.3 290 92.6C289.6 89.4 289.9 85.5 289.9 82.3L289.9 64.4L289.9 28C289.9 21.5 289.7 14.9 289.9 8.3C290 7.4 290.2 6.5 290.5 5.6C292.8 0 297.1 0.1 302.2 0ZM347.5 0L409.2 0L428.9 0C432.5 0 436.1 -0.1 439.7 0C442.7 0.2 445.8 0.5 448.7 1.2C476.2 8.4 483.6 44.8 458.5 59.8C454.4 62.2 450 63.7 445.4 64.4C435.6 65.9 398.2 65 385.7 65C382.7 65 374.8 64.7 372.3 65C371.1 65.2 370 65.8 369.1 66.6C368.6 67.3 368.2 68.1 368 68.9C367.6 71.1 367.9 79.1 367.9 81.8C367.9 84.6 368.3 91.1 367.7 93.5C367 96.7 364.3 99.3 361 99.8C358.3 100.3 355.4 99.9 352.7 99.9C349.6 99.9 343.6 100.4 340.9 99.4C338.6 98.4 336.7 96.5 335.9 94.1L335.5 91.8C335.3 88.1 335.5 84.4 335.5 80.7L335.5 57.7L335.5 23.1C335.5 19.3 335.2 11.2 335.5 7.9C335.7 6.6 336.1 5.3 336.8 4.2C339.3 0.1 343.2 0 347.5 0ZM120.1 47C120.3 47.7 121.6 48.1 122.2 48.4C124.7 49.8 127 51.7 128.9 54C137.1 64.2 136 79.3 127.3 88.9C122.6 94.2 116 97.8 109 99.3C107.1 99.7 105.1 99.9 103.1 99.9C94.5 100.2 10 100.2 7.5 99.8C4.8 99.2 2.4 97.5 1 95.1L0.8 94.6L0.5 93.9C0.2 93 0 92.1 -0.1 91.1L-0.1 75.9L-0.1 38.7L-0.1 17.8C-0.1 14.8 -0.4 11.1 0 8.2C0.3 6 1.5 3.9 3.1 2.4C4.7 1.1 6.7 0.3 8.8 0.1C16.4 -0.7 36.1 0 44.9 0C64.9 0 86.5 -0.5 106.2 0C107.9 0.1 109.6 0.2 111.3 0.6C116.7 1.6 121.7 4.1 125.5 8C134.5 17 135.6 31.5 127 41.2C125.9 42.4 124.8 43.5 123.6 44.5C122.7 45.2 120.7 46.2 120.1 47ZM371.3 22.7C369.4 23.3 368.1 24.8 368 26.8C367.8 28.9 367.7 37.3 368.1 39C368.3 39.8 368.8 40.5 369.5 41.1C370.2 41.8 371.2 42.2 372.3 42.3C377.9 42.8 389.3 42.4 395.5 42.4C407.5 42.4 420.7 42.7 432.5 42.3C433.4 42.3 434.4 42.2 435.3 41.9C438.8 40.8 441.8 37.8 442.5 34.1C443.3 29.4 440.5 24.9 436.1 23.2C435 22.8 433.8 22.6 432.6 22.5L425.1 22.5L407.8 22.5C396.1 22.5 384.5 22.2 372.9 22.5L371.3 22.7ZM181.1 23C177.1 24 177.6 27.6 177.6 30.8C177.6 32.8 177.3 37.4 177.8 39.1C178.1 39.9 178.7 40.6 179.4 41.1C180.1 41.6 180.9 41.8 181.8 41.9C189.2 42.4 201.5 41.9 209.4 41.9C218.9 41.9 230.5 42.3 239.7 41.9C240.6 41.9 241.5 41.7 242.4 41.4C246.1 40.2 248.7 37.2 249.3 33.4C250 29.1 247.3 25.2 243.3 23.7C242.2 23.2 241 23 239.8 22.9C237.3 22.8 234.8 22.9 232.3 22.9L214.7 22.9L190.4 22.9C187.9 22.9 183.4 22.6 181.1 23ZM33.6 23.8C31.1 24.6 30.8 26.6 30.8 28.9C30.7 30.9 30.4 35.2 31 36.9C31.3 37.5 31.7 38.1 32.3 38.5C32.9 38.9 33.7 39.1 34.5 39.2C38.8 39.5 94.9 39.3 96.5 39C98.5 38.6 100.2 37.7 101.4 36.1L102.3 34.5L102.7 33C103.1 29.8 102.8 26 99.6 24.4C98.7 23.9 97.6 23.7 96.6 23.6C91.6 23.4 34.7 23.5 33.6 23.8ZM34.1 59.7C30.5 60.3 30.7 63.3 30.7 66.2C30.8 68.8 30 73.4 32.5 74.9C33.1 75.3 33.8 75.5 34.5 75.5C40.2 76 50.9 75.5 57.2 75.5C69.4 75.5 82.6 75.9 94.7 75.5L97 75.2C100 74.2 102.3 71.7 102.7 68.5C103.1 64.9 101.2 61.5 97.9 60.2C96.9 59.8 95.9 59.7 94.8 59.7L82.7 59.7L56.1 59.7L40.8 59.7C38.6 59.7 36.3 59.5 34.1 59.7Z";

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
      <svg className="brip-mark" viewBox="0 0 29.54 40" aria-hidden="true">
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
          viewBox="0 0 473.9 100"
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
