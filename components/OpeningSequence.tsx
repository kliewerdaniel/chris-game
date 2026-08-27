"use client";

import { useEffect, useState } from "react";

/**
 * OpeningSequence — the new opening. Black screen; "CHRIS" resolves; a
 * literary subtitle; an archival photograph fades in; then three lines of
 * epistemic framing; then BEGIN RECONSTRUCTION.
 *
 * The sequence is purely presentational and skippable (click / keypress) — it
 * never gates engine state. Reduced-motion: the crawl collapses to an instant
 * static title + button (no staged fade intervals).
 */

export interface OpeningSequenceProps {
  onBegin: () => void;
}

export default function OpeningSequence(props: OpeningSequenceProps) {
  const { onBegin } = props;
  const [stage, setStage] = useState(0); // 0..N staged reveals
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(
      typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    );
  }, []);

  useEffect(() => {
    if (reduced) {
      setStage(99);
      return;
    }
    const steps = [1, 2, 3, 4, 5];
    const timers = steps.map((s, i) => setTimeout(() => setStage(s), 700 + i * 1300));
    return () => timers.forEach(clearTimeout);
  }, [reduced]);

  function begin() {
    setStage(99);
    onBegin();
  }

  const showTitle = stage >= 1;
  const showSub = stage >= 2;
  const showPhoto = stage >= 3;
  const showLines = stage >= 4;
  const showBegin = reduced || stage >= 5;

  return (
    <div
      className="opening"
      role="button"
      tabIndex={0}
      aria-label="CHRIS — a literary survival mystery. Press to begin the reconstruction."
      onClick={begin}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") begin();
      }}
    >
      <div className="opening-photo" data-show={showPhoto}>
        <div className="opening-photo-frame">
          <div className="opening-photo-grain" />
          <div className="opening-photo-caption">Chris — Austin, sometime.</div>
        </div>
      </div>
      <div className="opening-center">
        <h1 className="opening-title" data-show={showTitle}>
          CHRIS
        </h1>
        <div className="opening-sub" data-show={showSub}>
          A LITERARY SURVIVAL MYSTERY
        </div>
        <div className="opening-lines" data-show={showLines}>
          <p>There are things you remember.</p>
          <p>There are things you were told.</p>
          <p>And there are things you can prove.</p>
        </div>
        {showBegin && (
          <button type="button" className="opening-begin" onClick={begin}>
            BEGIN RECONSTRUCTION
          </button>
        )}
      </div>
    </div>
  );
}
