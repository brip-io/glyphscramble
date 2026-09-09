import { beats } from "./storyboard";

/**
 * Server-rendered narrative of the cinematic. It is the poster-mode content
 * and the screen-reader narrative in cinematic mode, so the whole story is
 * always in the DOM.
 */
export function HeroNarrative() {
  return (
    <div className="cine-narrative">
      <p className="cine-narrative-kicker">The pipeline in nine beats</p>
      <ol className="cine-narrative-list">
        {beats.map((beat) => (
          <li key={beat.id}>
            <span className="cine-narrative-index" aria-hidden="true">
              {String(beat.index + 1).padStart(2, "0")}
            </span>
            <strong>{beat.label}</strong>
            <p>{beat.caption}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
