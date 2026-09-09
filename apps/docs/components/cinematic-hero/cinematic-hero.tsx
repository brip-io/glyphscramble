"use client";

import {
  ArrowRightIcon,
  BookOpenIcon,
  CaretDownIcon,
} from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { HeroMode, HeroTier } from "./capabilities";
import { detectMode, detectTier } from "./capabilities";
import { createProgressStore, scrollerProgress } from "./scroll-progress";
import { beatAt, beats } from "./storyboard";

const CinematicScene = dynamic(() => import("./cinematic-scene"), {
  ssr: false,
  loading: () => null,
});

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
  const sectionRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const store = useMemo(() => createProgressStore(0), []);

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
    };

    const update = () => {
      frame = 0;
      const p = scrollerProgress(
        top,
        height,
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

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [mode, store]);

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
                inView={inView}
                onFallback={() => setMode("poster")}
              />
            </div>
          ) : null}
          <div className="cine-overlay shell">
            <div
              className="cine-hero-copy"
              data-active={!cinematic || beatIndex === 0}
            >
              {children}
              {cinematic ? (
                <p className="cine-scroll-hint" aria-hidden="true">
                  Scroll to run the pipeline
                  <CaretDownIcon size={16} />
                </p>
              ) : null}
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
                        {String(item.index).padStart(2, "0")} / 08 ·{" "}
                        {item.label}
                      </span>
                      <p>{item.caption}</p>
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
              </>
            ) : null}
          </div>
        </div>
      </div>
      {narrative}
    </section>
  );
}
