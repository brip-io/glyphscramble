"use client";

import {
  ArrowRightIcon,
  BookOpenIcon,
  CaretDownIcon,
  CaretUpIcon,
  PauseIcon,
  PlayIcon,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HeroMode, HeroTier } from "./capabilities";
import { detectMode, detectTier } from "./capabilities";
import {
  createProgressStore,
  beatPreview,
  scrollerProgress,
  stepProgress,
} from "./scroll-progress";
import { beatAt, beats } from "./storyboard";

const CinematicScene = dynamic(() => import("./cinematic-scene"), {
  ssr: false,
  loading: () => null,
});

/** Seconds for the autoplay to travel the whole scroller. */
const AUTOPLAY_SECONDS = 42;

interface CinematicHeroProps {
  /** Server-rendered hero copy: maker line, h1, summary, actions. */
  children: ReactNode;
  /** Server-rendered ordered narrative (poster content + SR narrative). */
  narrative: ReactNode;
}

export function CinematicHero({ children, narrative }: CinematicHeroProps) {
  const [mode, setMode] = useState<HeroMode>("poster");
  const [tier, setTier] = useState<HeroTier>("lite");
  const [beatIndex, setBeatIndex] = useState(0);
  const [inView, setInView] = useState(true);
  const [playing, setPlaying] = useState(false);
  const fallback = useCallback(() => {
    setPlaying(false);
    setMode("poster");
  }, []);

  const sectionRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const store = useMemo(() => createProgressStore(0), []);
  const geometry = useRef({ top: 0, height: 0 });
  const inViewRef = useRef(true);
  inViewRef.current = inView;

  /** Scroll the window so the stage sits at progress `p`. */
  const scrollToProgress = useCallback(
    (p: number, behavior: ScrollBehavior) => {
      const { top, height } = geometry.current;
      const stageHeight =
        sectionRef.current?.querySelector(".cine-stage")?.clientHeight ??
        window.innerHeight;
      const travel = Math.max(height - stageHeight, 0);
      store.set(p);
      window.scrollTo({ top: top + p * travel, behavior });
    },
    [store],
  );

  useEffect(() => {
    setMode(detectMode());
    setTier(detectTier());
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      if (media.matches) setMode("poster");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (mode !== "cinematic") return;
    const scroller = scrollerRef.current;
    const section = sectionRef.current;
    if (!scroller || !section) return;

    let top = 0;
    let height = 0;
    let frame = 0;
    let currentBeat = -1;

    const measure = () => {
      const rect = scroller.getBoundingClientRect();
      top = rect.top + window.scrollY;
      height = scroller.offsetHeight;
      geometry.current = { top, height };
    };

    const update = () => {
      frame = 0;
      const p = scrollerProgress(
        top,
        height,
        section.querySelector(".cine-stage")?.clientHeight ??
          window.innerHeight,
        window.scrollY,
      );
      store.set(p);
      const beat = beatAt(p);
      section.style.setProperty("--cine-p", p.toFixed(4));
      if (beat.index !== currentBeat) {
        currentBeat = beat.index;
        setBeatIndex(beat.index);
      }
    };

    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      schedule();
    };

    measure();
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setInView(entry.isIntersecting);
      },
      { rootMargin: "20% 0px" },
    );
    observer.observe(scroller);
    if (new URLSearchParams(window.location.search).has("autoplay")) {
      scrollToProgress(0, "instant");
      setPlaying(true);
    }

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [mode, store, scrollToProgress]);

  // Arrow keys step between beats while the stage is on screen.
  useEffect(() => {
    if (mode !== "cinematic") return;
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return;
      const rect = scrollerRef.current?.getBoundingClientRect();
      if (
        !inViewRef.current ||
        !rect ||
        rect.top > 1 ||
        rect.bottom < window.innerHeight - 1
      )
        return;
      const direction =
        event.key === "ArrowDown" || event.key === "PageDown"
          ? 1
          : event.key === "ArrowUp" || event.key === "PageUp"
            ? -1
            : 0;
      if (direction === 0) {
        if (event.key === "Escape") setPlaying(false);
        return;
      }
      setPlaying(false);
      const next = stepProgress(store.get(), direction);
      if (next === null) return;
      event.preventDefault();
      scrollToProgress(next, "smooth");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, store, scrollToProgress]);

  // Autoplay drives the scroll position at a fixed pace; any manual input
  // hands control back to the reader.
  useEffect(() => {
    if (!playing || mode !== "cinematic") return;
    let frame = 0;
    let last = performance.now();
    let p = store.get();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      p = Math.min(p + dt / AUTOPLAY_SECONDS, 1);
      scrollToProgress(p, "instant");
      if (p >= 1) {
        setPlaying(false);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    const stop = () => setPlaying(false);
    const onPointer = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest("[data-playback-toggle]"))
        return;
      stop();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing, mode, store, scrollToProgress]);

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (store.get() >= 0.999) scrollToProgress(0, "instant");
    setPlaying(true);
  };
  const step = (direction: 1 | -1) => {
    setPlaying(false);
    const next = stepProgress(store.get(), direction);
    if (next !== null) scrollToProgress(next, "smooth");
  };

  const goToBeat = (index: number) => {
    setPlaying(false);
    scrollToProgress(beatPreview(index), "smooth");
  };

  const beat = beats[beatIndex] ?? beats[0]!;
  const cinematic = mode === "cinematic";

  return (
    <section
      ref={sectionRef}
      className="cine-hero"
      data-mode={mode}
      data-tier={tier}
      data-beat={beat.id}
    >
      <div ref={scrollerRef} className="cine-scroller">
        <div className="cine-stage">
          {cinematic ? (
            <div className="cine-canvas" aria-hidden="true">
              <CinematicScene
                store={store}
                tier={tier}
                inView={inView && beatIndex !== 0}
                onFallback={fallback}
              />
            </div>
          ) : null}
          <div className="cine-overlay shell">
            {cinematic ? (
              <div className="cine-topline">
                <span>
                  <i /> Inside GlyphScramble{" "}
                  <span className="cine-topline-detail">
                    / An interactive walkthrough
                  </span>
                </span>
                <div className="cine-top-actions">
                  <button
                    type="button"
                    onClick={() => {
                      fallback();
                      requestAnimationFrame(() =>
                        sectionRef.current?.scrollIntoView({
                          behavior: "instant",
                        }),
                      );
                    }}
                  >
                    Read instead
                  </button>
                  <a href="#how-it-works" onClick={() => setPlaying(false)}>
                    Skip to overview{" "}
                    <ArrowRightIcon size={14} aria-hidden="true" />
                  </a>
                </div>
              </div>
            ) : null}
            <div
              className="cine-hero-copy"
              data-active={!cinematic || beatIndex === 0}
            >
              {children}
              {cinematic ? (
                <button
                  className="button cine-start"
                  type="button"
                  data-playback-toggle
                  onClick={() => {
                    scrollToProgress(beats[1]!.range[0], "instant");
                    setPlaying(true);
                  }}
                >
                  <PlayIcon aria-hidden="true" weight="fill" size={18} /> See
                  how it works
                </button>
              ) : (
                <a className="button cine-start" href="/demo/">
                  <ArrowRightIcon aria-hidden="true" size={18} /> Explore the
                  demo
                </a>
              )}
              <p className="cine-boundary">Friction, not DRM.</p>
            </div>
            {cinematic ? (
              <>
                <div className="cine-captions" aria-hidden="true">
                  {beats.slice(1).map((item) => (
                    <div
                      key={item.id}
                      className="cine-caption"
                      data-active={item.index === beatIndex}
                    >
                      <span className="cine-beat-chip">
                        {String(item.index + 1).padStart(2, "0")} / 09 ·{" "}
                        {item.label}
                      </span>
                      <h2>{item.headline}</h2>
                      <p>{item.summary}</p>
                    </div>
                  ))}
                </div>
                <div
                  className="cine-outro"
                  data-active={beat.id === "recovery"}
                >
                  <p className="cine-outro-title">Friction, not DRM.</p>
                  <div className="hero-actions">
                    <a className="button button-primary" href="/demo/">
                      Explore demo
                      <ArrowRightIcon aria-hidden="true" size={18} />
                    </a>
                    <a className="button button-secondary" href="/docs/">
                      <BookOpenIcon aria-hidden="true" size={18} />
                      Documentation
                    </a>
                  </div>
                </div>
                <div className="cine-progress" aria-hidden="true">
                  <span />
                </div>
                <div
                  className="cine-controls"
                  role="group"
                  aria-label="Pipeline playback"
                >
                  <button
                    type="button"
                    data-playback-toggle
                    onClick={togglePlay}
                    aria-pressed={playing}
                    aria-label={
                      playing ? "Pause autoplay" : "Play the pipeline"
                    }
                  >
                    {playing ? (
                      <PauseIcon aria-hidden="true" size={16} weight="fill" />
                    ) : (
                      <PlayIcon aria-hidden="true" size={16} weight="fill" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    disabled={beatIndex === 0}
                    aria-label="Previous beat (Up arrow)"
                  >
                    <CaretUpIcon aria-hidden="true" size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    disabled={beatIndex === beats.length - 1}
                    aria-label="Next beat (Down arrow)"
                  >
                    <CaretDownIcon aria-hidden="true" size={16} />
                  </button>
                  <span className="cine-controls-beat" aria-live="polite">
                    {String(beatIndex + 1).padStart(2, "0")} / 09{" "}
                    <span>{beat.label}</span>
                  </span>
                </div>
                <nav
                  className="cine-chapters"
                  aria-label="Walkthrough chapters"
                >
                  {beats.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={
                        item.index === beatIndex ? "step" : undefined
                      }
                      aria-label={`Chapter ${item.index + 1}: ${item.label}`}
                      onClick={() => goToBeat(item.index)}
                    >
                      <span>{String(item.index + 1).padStart(2, "0")}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </nav>
              </>
            ) : null}
          </div>
        </div>
      </div>
      {narrative}
    </section>
  );
}
