"use client";

/**
 * EvidenceReveal — the signature "evidence reveal" cinematic.
 *
 * When the player discovers something, the WORLD layer freezes and dims; the
 * artifact is brought into the center of the screen as a physical object, then
 * the player physically places it on the board ("PLACE ON BOARD"). This gives
 * discovery weight instead of appending "Evidence found." to a log.
 *
 * Driven entirely by the engine's deterministic `discoveredEvidence` — the
 * overlay shows whatever the engine returned this turn. No state mutation; it
 * calls back into the engine's challenge loop on "investigate" and closes on
 * dismiss. Reduced-motion: the reveal is instant (no scale/fade), per the
 * project's §9 motion floor.
 */

import type { Evidence } from "../lib/core/types";

export interface EvidenceRevealProps {
  evidence: Evidence | null;
  /** connection labels (e.g. "Chris", "Austin") shown beneath the artifact. */
  connections: string[];
  onPlace: () => void;
  onInvestigate: () => void;
  onDismiss: () => void;
}

export default function EvidenceReveal(props: EvidenceRevealProps) {
  const { evidence, connections, onPlace, onInvestigate, onDismiss } = props;
  if (!evidence) return null;
  return (
    <div className="reveal-overlay" role="dialog" aria-modal="true" aria-label={`evidence: ${evidence.title}`}>
      <div className="reveal-vignette" onClick={onDismiss} aria-hidden="true" />
      <div className="reveal-stage">
        <div className="reveal-tag">EVIDENCE {String(evidence.id).toUpperCase().slice(-6)}</div>
        <div className="reveal-artifact" data-kind={evidence.kind}>
          <div className="reveal-artifact-frame">
            <div className="reveal-kind">{evidence.kind}</div>
            <div className="reveal-title">{evidence.title}</div>
            <div className="reveal-body">{evidence.content}</div>
            {evidence.provenance?.source && (
              <div className="reveal-source">
                <span className="reveal-meta-label">SOURCE</span> {evidence.provenance.source}
              </div>
            )}
            <div className="reveal-status status-{evidence.status}">
              <span className="reveal-meta-label">STATUS</span>{" "}
              {evidence.discovered ? "Newly discovered" : evidence.status}
            </div>
            {connections.length > 0 && (
              <div className="reveal-connections">
                <span className="reveal-meta-label">CONNECTIONS</span> {connections.join(" · ")}
              </div>
            )}
          </div>
        </div>
        <div className="reveal-actions">
          <button type="button" className="reveal-place" onClick={onPlace}>
            PLACE ON BOARD
          </button>
          <button type="button" className="reveal-investigate" onClick={onInvestigate}>
            investigate this thread
          </button>
        </div>
      </div>
    </div>
  );
}
