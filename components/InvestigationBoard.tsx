"use client";

/**
 * InvestigationBoard — the diegetic investigation wall (the "Reconstruction").
 *
 * Pure projection of the engine's deterministic `GraphState` (built by
 * `lib/reconstruction/graph.ts` from `WorldState`) onto a 2D archival board.
 * No engine mutation, no model call. The board IS the player's mental model of
 * Chris: cards are artifacts (person / place / photograph / document /
 * evidence / claim / memory), and contradictions render as a RED THREAD
 * between two cards — the visual language for epistemology the design calls for.
 *
 * Accessibility: every card is a real <button>; a parallel sr-only list of the
 * same cards (§9 DOM floor) guarantees the board is never a visual-only wall
 * for keyboard / AT users. Threads are decorative (aria-hidden); the tension
 * they express is also reported in the sr-only list as prose.
 */

import { useMemo, useState } from "react";
import type { GraphState } from "../lib/reconstruction/graph";
import { buildBoardLayout, type BoardCard, type CardKind } from "../lib/board/board-layout";

const KIND_LABEL: Record<CardKind, string> = {
  person: "Person",
  character: "Person",
  place: "Place",
  event: "Event",
  claim: "Claim",
  evidence: "Evidence",
  fragment: "Memory",
  contradiction: "Contradiction",
};

// Epistemic status -> color token. Mirrors the engine palette in tokens.css.
const STATUS_VAR: Record<string, string> = {
  canonical: "var(--canonical)",
  testimony: "var(--testimony)",
  belief: "var(--belief)",
  hypothesis: "var(--hypothesis)",
  rumor: "var(--rumor)",
  observation: "var(--observation)",
  unknown: "var(--unknown)",
};

export interface InvestigationBoardProps {
  graph: GraphState;
  /** counts for the bottom status bar (memoria). */
  evidenceCount: number;
  questionCount: number;
  contradictionCount: number;
  /** wire a card's "investigate" affordance to the engine challenge loop. */
  onChallenge: (factId: string) => void;
  /** wire a card select to surface provenance in the WORLD layer. */
  onInspect?: (cardId: string) => void;
}

export default function InvestigationBoard(props: InvestigationBoardProps) {
  const { graph, evidenceCount, questionCount, contradictionCount, onChallenge, onInspect } = props;
  const layout = useMemo(() => buildBoardLayout(graph), [graph]);
  const [selected, setSelected] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Set<string>>(new Set());

  // Mark newly-arrived cards as "just placed" for the drop-in animation, but
  // keep it deterministic: a card is placed once it has been on the board.
  const cards = layout.cards;
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  function handlePlace() {
    setPlaced(new Set(cards.map((c) => c.id)));
  }

  const sel = selected ? byId.get(selected) ?? null : null;

  return (
    <div className="board" aria-label="the reconstruction — investigation board">
      <div className="board-surface">
        {/* Threads first (under the cards). Tension threads are the red. */}
        <svg className="board-threads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {layout.threads.map((t) => {
            const a = byId.get(t.from);
            const b = byId.get(t.to);
            if (!a || !b) return null;
            return (
              <line
                key={t.id}
                className={`thread${t.tension ? " tension" : ""}`}
                x1={a.x * 100}
                y1={a.y * 100}
                x2={b.x * 100}
                y2={b.y * 100}
                stroke={t.tension ? "var(--contradiction)" : "var(--border-strong)"}
                strokeWidth={t.tension ? 0.5 : 0.2}
                strokeDasharray={t.tension ? "1.2 1.2" : undefined}
                opacity={t.tension ? 0.9 : 0.4}
              />
            );
          })}
        </svg>

        {cards.map((c) => (
          <BoardCardView
            key={c.id}
            card={c}
            placed={placed.has(c.id)}
            selected={selected === c.id}
            onSelect={() => {
              setSelected((cur) => (cur === c.id ? null : c.id));
              onInspect?.(c.id);
            }}
            onInvestigate={() => onChallenge(c.id)}
          />
        ))}

        {layout.contradictions.length > 0 && (
          <div className="board-contradictions" aria-live="polite">
            {layout.contradictions.map((ct) => (
              <div key={ct.id} className="contradiction-note">
                <span className="contradiction-mark">⨯</span> {ct.report}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected card detail — diegetic, not a meta panel. */}
      {sel && (
        <div className="board-detail" role="dialog" aria-label={`${KIND_LABEL[sel.kind]}: ${sel.label}`}>
          <div className="board-detail-kind">{KIND_LABEL[sel.kind]}</div>
          <div className="board-detail-label">{sel.label}</div>
          {sel.status && (
            <div className="board-detail-status" style={{ color: STATUS_VAR[sel.status] ?? "var(--ink-dim)" }}>
              {sel.status.toUpperCase()}
            </div>
          )}
          {sel.authored && <div className="board-detail-note">a hypothesis you authored</div>}
          <button type="button" className="board-detail-investigate" onClick={() => onChallenge(sel.id)}>
            investigate this thread
          </button>
          <button type="button" className="board-detail-close" onClick={() => setSelected(null)} aria-label="close">
            ×
          </button>
        </div>
      )}

      {/* Bottom memoria bar — replaces the dashboard utility panels. */}
      <div className="boardbar" aria-label="reconstruction state">
        <span className="boardbar-mark">CHRIS</span>
        <button type="button" className="boardbar-cell" onClick={handlePlace} title="place all artifacts on the board">
          <span className="n">{evidenceCount}</span> EVIDENCE
        </button>
        <span className="boardbar-cell">
          <span className="n">{questionCount}</span> QUESTIONS
        </span>
        <span className={`boardbar-cell${contradictionCount ? " has-contra" : ""}`}>
          <span className="n">{contradictionCount}</span> CONTRADICTION{contradictionCount === 1 ? "" : "S"}
        </span>
      </div>

      {/* §9 parallel DOM control surface — keyboard/AT operable list of the same cards. */}
      <ul className="board-dom-list">
        {cards.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              className="board-dom-item"
              onClick={() => {
                setSelected(c.id);
                onInspect?.(c.id);
              }}
            >
              {KIND_LABEL[c.kind]}: {c.label}
              {c.status ? ` (${c.status})` : ""}
            </button>
          </li>
        ))}
        {layout.contradictions.length > 0 && (
          <li className="board-dom-contra">
            Contradictions:{" "}
            {layout.contradictions.map((ct) => ct.report).join(" · ")}
          </li>
        )}
      </ul>
    </div>
  );
}

function BoardCardView(props: {
  card: BoardCard;
  placed: boolean;
  selected: boolean;
  onSelect: () => void;
  onInvestigate: () => void;
}) {
  const { card, placed, selected, onSelect, onInvestigate } = props;
  const sizePx = 64 + card.size * 46;
  return (
    <button
      type="button"
      className={`board-card kind-${card.kind}${selected ? " selected" : ""}${placed ? " placed" : ""}${card.authored ? " authored" : ""}`}
      style={{
        left: `${card.x * 100}%`,
        top: `${card.y * 100}%`,
        width: sizePx,
        // epistemic tint as a faint border/edge, never the only signal
        ["--card-status" as string]: STATUS_VAR[card.status ?? "unknown"] ?? "var(--border-strong)",
      }}
      onClick={onSelect}
      onDoubleClick={onInvestigate}
      aria-pressed={selected}
      title={`${KIND_LABEL[card.kind]}: ${card.label}${card.status ? ` (${card.status})` : ""}`}
    >
      <span className="card-frame">
        <span className="card-kind">{KIND_LABEL[card.kind]}</span>
        <span className="card-label">{card.label}</span>
        {card.status && <span className={`card-status status-${card.status}`}>{card.status}</span>}
      </span>
    </button>
  );
}
