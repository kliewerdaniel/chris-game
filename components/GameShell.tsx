/**
 * GameShell — presentational components for the CHRIS literary surface.
 *
 * Pure, prop-driven render components. No game state, no game logic. Extracted
 * from the former monolithic GameClient so the visual redesign has clean
 * boundaries. Styling is driven entirely by tokens (app/tokens.css); these
 * components reference var(--*) only.
 *
 * Accessibility: interactive actions are real <button>s.
 */

import type { WorldState, NarrationLine, Evidence, FactStatus, DisclosureMode } from "../lib/core/types";
import { useState } from "react";
import { getFact } from "../lib/core/facts";
import { CORPUS_CHRIS_PROVENANCE } from "../lib/core/evidence";
import type { TravelJournal } from "../lib/core/travel";
import { canTravelTo, isFreeTravel } from "../lib/core/travel";
import type { EpisodeMeta } from "./episode-meta";
import type { InvestigationPayload } from "./investigation-payload";
import type { TtsLine } from "./tts-types";

// ---------- shared helpers ----------

export function statusClass(s?: FactStatus): string {
  if (s === "testimony" || s === "rumor") return "status-testimony";
  if (s === "canonical") return "status-canonical";
  if (s === "observation") return "status-observation";
  if (s === "belief") return "status-belief";
  if (s === "hypothesis") return "status-hypothesis";
  return "status-unknown";
}
export function statusLabel(s?: FactStatus): string {
  if (!s) return "";
  return s.toUpperCase();
}
export function prettyLoc(loc: string): string {
  return loc.replace(/_/g, " ");
}
export function roman(n: number): string {
  return ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] ?? String(n);
}
export function fmtTime(t: { day: number; hour: number; minute: number }): string {
  const h = ((t.hour + 11) % 12) + 1;
  const ampm = t.hour < 12 ? "AM" : "PM";
  return `${h}:${t.minute.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * SUBTLE in-fiction disclosure cue. The engine decides per-topic whether Chris
 * tells the truth / partial / LIES / withholds (DisclosureMode). We surface it
 * as a quiet diegetic whisper — NOT a meta-tag, never a "LIE" label. The player
 * feels the evasion through prose, which is the whole point of the epistemic
 * mechanic. Truthful modes carry no cue at all.
 */
const DISCLOSURE_CUES: Partial<Record<DisclosureMode, string>> = {
  lie: "He says it like he means it. You can't tell if he believes it.",
  withhold: "He doesn't answer that. The silence is deliberate.",
  deflect: "He laughs it off and turns to something else.",
  threaten: "Something in his voice goes cold.",
};
export function cueFor(handling?: DisclosureMode): string | undefined {
  return handling ? DISCLOSURE_CUES[handling] : undefined;
}

// ---------------------------------------------------------------------------
// Mobile tab bar (single toggle for the case file)
// ---------------------------------------------------------------------------
export function TabBar(props: { fileOpen: boolean; onToggle: () => void }) {
  const { fileOpen, onToggle } = props;
  return (
    <nav className="tabbar" aria-label="panels">
      <button type="button" className={fileOpen ? "active" : ""} onClick={onToggle} aria-pressed={fileOpen}>
        Case File
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Header — wordmark + chapter + controls
// ---------------------------------------------------------------------------
export function GameHeader(props: {
  meta: EpisodeMeta | null;
  ws: WorldState | null;
  voiceOn: boolean;
  ttsEnabled: boolean;
  onToggleVoice: () => void;
  onNewGame: () => void;
  onOpenBoard: () => void;
}) {
  const { meta, ws, voiceOn, ttsEnabled, onToggleVoice, onNewGame, onOpenBoard } = props;
  return (
    <header className="header">
      <div>
        <h1>CHRIS</h1>
        <div className="sub">
          {meta
            ? `episode ${roman(meta.index)} · ${meta.title.toLowerCase()}`
            : "a literary survival mystery"}
        </div>
      </div>
      <div className="meta">
        <div className="clock">{ws ? `Day ${ws.time.day} · ${fmtTime(ws.time)}` : ""}</div>
        <div className="tools">
          {ttsEnabled && (
            <button type="button" onClick={onToggleVoice} className={`asbtn ${voiceOn ? "voice-on" : ""}`}>
              [{voiceOn ? "voice on" : "voice off"}]
            </button>
          )}
          <button type="button" onClick={onNewGame} className="asbtn">
            [new game]
          </button>
          <button type="button" onClick={onOpenBoard} className="asbtn">
            [board]
          </button>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// TravelBar
// ---------------------------------------------------------------------------
const EPISODE_ORDER = [
  { id: "ep1", index: 1, title: "THE NIGHT THE FEED STARTED" },
  { id: "ep2", index: 2, title: "THE FEED" },
  { id: "ep3", index: 3, title: "THE TOLL" },
  { id: "ep4", index: 4, title: "THE ACT" },
];

export function TravelBar(props: {
  journal: TravelJournal;
  ws: WorldState | null;
  viewingLive: boolean;
  onTravel: (id: string) => void;
  onReturnToLive: () => void;
}) {
  const { journal, ws, viewingLive, onTravel, onReturnToLive } = props;
  if (Object.keys(journal.snapshots).length === 0) return null;
  return (
    <nav className="travel-bar">
      {Object.values(EPISODE_ORDER).map((ep) => {
        const snap = journal.snapshots[ep.id];
        if (!snap) return null;
        const reachable = canTravelTo(journal, ep.id);
        const active = ws?.episodeId === ep.id;
        return (
          <button
            key={ep.id}
            type="button"
            className={`chip ${active ? "chip-active" : ""} ${!reachable ? "chip-locked" : ""}`}
            disabled={!reachable}
            onClick={() => reachable && onTravel(ep.id)}
            style={{ cursor: reachable ? "pointer" : "not-allowed", opacity: reachable ? 1 : 0.4 }}
            title={reachable ? `Travel to ${ep.title}` : "Complete this episode first"}
          >
            {roman(ep.index)}·{ep.title}
          </button>
        );
      })}
      {!viewingLive && (
        <button type="button" className="chip chip-return" onClick={onReturnToLive} style={{ cursor: "pointer" }}>
          ↩ return to live
        </button>
      )}
      {isFreeTravel(journal) && <span className="chip chip-free">FREE TRAVEL</span>}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// NarrativeLog + NarrationLineView
// ---------------------------------------------------------------------------
const SPOKEN_SPEAKERS = new Set(["chris", "feed", "reconstruction", "mother", "evidence"]);
export function isSpokenSpeaker(s: string) {
  return SPOKEN_SPEAKERS.has(s);
}

export function NarrationLineView(props: {
  line: NarrationLine;
  index: number;
  tts: Record<number, TtsLine>;
  onPlay: (i: number) => void;
  onStop: (i: number) => void;
}) {
  const { line, index, tts, onPlay, onStop } = props;
  const cue = cueFor(line.handling);
  return (
    <div className={`line ${line.speaker}`} key={index}>
      {line.speaker !== "player" && line.speaker !== "system" && (
        <span className="who">
          {line.speaker}
          {line.status && <span className={`status-tag ${statusClass(line.status)}`}>{statusLabel(line.status)}</span>}
        </span>
      )}
      {line.speaker === "system" && <span className="who system">»</span>}
      <div className={"body"}>{line.text}</div>
      {line.ref?.kind === "memory" && line.ref.id === "corpus-chris" && (
        <div className="src-tag">
          <span className="src-label">what Daniel compiled about Chris · </span>
          <span className="src-detail">{CORPUS_CHRIS_PROVENANCE.source}</span>
        </div>
      )}
      {cue && <span className="cue">{cue}</span>}
      {isSpokenSpeaker(line.speaker) && line.text.trim() && (
        <span className="tts-row">
          {tts[index]?.status === "loading" && <span className="tts-spin" title="Generating speech…" aria-label="generating" />}
          {tts[index]?.status === "error" && <span className="tts-err" title="Speech unavailable">⚠</span>}
          {tts[index]?.status === "muted" && <span className="tts-muted" title="Line too long to narrate — read it instead">🔇</span>}
          {(tts[index]?.url || !tts[index] || tts[index]?.status === "error") && tts[index]?.status !== "loading" && tts[index]?.status !== "muted" && (
            tts[index]?.status === "playing" ? (
              <button type="button" className="tts-btn" onClick={() => onStop(index)} title="Stop">⏸</button>
            ) : (
              <button type="button" className="tts-btn" onClick={() => onPlay(index)} title="Play">▶</button>
            )
          )}
        </span>
      )}
    </div>
  );
}

export function NarrativeLog(props: {
  log: NarrationLine[];
  tts: Record<number, TtsLine>;
  ws: WorldState | null;
  meta: EpisodeMeta | null;
  busy: boolean;
  onPlay: (i: number) => void;
  onStop: (i: number) => void;
  onAdvance: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}) {
  const { log, tts, ws, meta, busy, onPlay, onStop, onAdvance, scrollRef, onScroll } = props;
  return (
    <section className="center">
      <div className="narrative" ref={scrollRef} onScroll={onScroll} tabIndex={0} aria-label="narrative log">
        {log.map((l, i) => (
          <NarrationLineView key={i} line={l} index={i} tts={tts} onPlay={onPlay} onStop={onStop} />
        ))}
        {ws?.episodeComplete && (
          <div className="line narrator">
            <span className="who">— {meta ? `end of episode ${roman(meta.index)}` : "end of episode"} —</span>
            <div className="body">
              {ws.endingId}
              {ws.endingId && " · "}
              <em>Who do you trust?</em>
            </div>
            {ws && meta?.id !== "ep4" && (
              <button type="button" className="continue-btn" onClick={onAdvance} disabled={busy}>
                Continue to the next episode →
              </button>
            )}
            {meta?.id === "ep4" && (
              <div className="body" style={{ marginTop: 8 }}>
                This is the end of the road. Chris is gone. The reconstruction remains. You know which is which.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CaseFile (right rail) — the detective's marginalia: world facts, evidence,
// established facts, and a collapsed command affordance.
// ---------------------------------------------------------------------------
export function Ledger(props: { established: string[] }) {
  const { established } = props;
  if (established.length === 0) {
    return <div className="empty">No facts established yet.</div>;
  }
  return (
    <div className="ledger">
      {established.map((id, i) => {
        const f = getFact(id);
        if (!f) return <div className="fact-item" key={i}><span>{id}</span></div>;
        return (
          <div className="fact-item" key={i}>
            <div className="ledger-stmt">
              <span>{f.statement}</span>
              {f.status && (
                <span className={`status-tag ${statusClass(f.status)}`}>{statusLabel(f.status)}</span>
              )}
            </div>
            {f.provenance?.source && <div className="src">{f.provenance.source}</div>}
          </div>
        );
      })}
    </div>
  );
}

export function CaseFile(props: {
  boardOpen: boolean;
  board: InvestigationPayload | null;
  onCloseBoard: () => void;
  evidence: Evidence[];
  established: string[];
  ws: WorldState | null;
  meta: EpisodeMeta | null;
  commandHints: string[];
  onPickCommand: (c: string) => void;
  helpOpen: boolean;
  onToggleHelp: () => void;
  fileOpen?: boolean;
  onChallengeClaim?: (factId: string) => void;
}) {
  const {
    boardOpen, board, onCloseBoard, evidence, established, ws, meta,
    commandHints, onPickCommand, helpOpen, onToggleHelp, fileOpen, onChallengeClaim,
  } = props;
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());
  return (
    <aside className={`file${fileOpen ? " open" : ""}`}>
      {boardOpen && (
        <div className="board-wrap">
          <div className="section-title board-title">
            Consistency Board
            {board?.timelines && board.timelines.length > 1 && (
              <>
                <span className="board-agg"> · across {board.timelines.length} timelines</span>
                <div className="board-timelines">{board.timelines.map((t) => t.toUpperCase()).join("  ·  ")}</div>
              </>
            )}
            <button type="button" onClick={onCloseBoard} className="asbtn" style={{ float: "right", fontSize: 11 }}>
              [close]
            </button>
          </div>
          {!board ? (
            <div className="empty">No data yet.</div>
          ) : (
            <div className="board-body">
              {board.suggestedNext && (
                <div className="board-section suggest">
                  <div className="board-label suggest-label">SUGGESTED NEXT</div>
                  <div className="board-row suggest-row">
                    <span className="board-text">{board.suggestedNext.label}</span>
                    {onChallengeClaim && (
                      <button
                        type="button"
                        className="board-challenge lead-challenge"
                        onClick={() => onChallengeClaim(board.suggestedNext!.factId)}
                      >
                        investigate
                      </button>
                    )}
                  </div>
                </div>
              )}
              {board.openLeads?.length > 0 && (
                <div className="board-section">
                  <div className="board-label">OPEN LEADS ({board.openLeads.length})</div>
                  {board.openLeads.map((l) => (
                    <div key={l.factId} className={`board-row lead${onChallengeClaim ? " clickable" : ""}`}>
                      <span className="dot" />
                      <span className="board-text">{l.label}</span>
                      {onChallengeClaim && (
                        <button
                          type="button"
                          className="board-challenge lead-challenge"
                          onClick={() => onChallengeClaim(l.factId)}
                        >
                          investigate
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {board.divergenceAlerts?.length > 0 && (
                <div className="board-section">
                  <div className="board-label warn">DIVERGENCE ALERTS ({board.divergenceAlerts.length})</div>
                  {board.divergenceAlerts.map((a) => (
                    <div key={a.factId + (a.report ?? "")} className="board-row contra alert">
                      <span className="board-text">{a.report}</span>
                      {a.strongerSource && a.weakerSource && (
                        <div className="board-sub">
                          {a.strongerSource} ⊣ {a.weakerSource} · re-read source or challenge the claim
                        </div>
                      )}
                      {onChallengeClaim && a.factId && (
                        <button
                          type="button"
                          className="board-challenge"
                          onClick={() => onChallengeClaim(a.factId)}
                        >
                          challenge the claim
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {board.visibleContradictions?.length > 0 && (
                <div className="board-section">
                  <div className="board-label warn">CONTRADICTIONS ({board.visibleContradictions.length})</div>
                  {board.visibleContradictions.map((c) => (
                    <div key={c.factId + (c.report ?? "")} className="board-row contra">
                      <span className="board-text">{c.report}</span>
                      {c.claimLabels?.length > 0 && <div className="board-sub">{c.claimLabels.join("  ·  ")}</div>}
                      {c.timelines && c.timelines.length > 1 && (
                        <div className="board-sub dim">seen in: {c.timelines.map((t) => t.toUpperCase()).join(" · ")}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="board-section">
                <div className="board-label">CORROBORATION ({board.corroboration.length})</div>
                {board.corroboration.map((c) => (
                  <div key={c.factId} className={`board-row ${c.contradictors > 0 ? "mixed" : c.supporters > 1 ? "ok" : "thin"}`}>
                    <span className="board-fact">{c.factId}</span>
                    <span className="board-text">
                      {c.verdict}
                      {(c.supporters > 0 || c.contradictors > 0) && (
                        <span className="board-counts">{"  "}({c.supporters}✓ / {c.contradictors}✗)</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="section-title">The Case</div>
      <div className="fact-line">
        <span className="k">EPISODE</span>
        <span className="v">{meta ? `${roman(meta.index)} · ${meta.title}` : ws?.episodeId}</span>
      </div>
      <div className="fact-line">
        <span className="k">LOCATION</span>
        <span className="v">{ws ? prettyLoc(ws.location) : "—"}</span>
      </div>
      <div className="fact-line">
        <span className="k">TRUST · CHRIS</span>
        <span className="v">{ws?.characterStates.chris?.trust ?? "—"}</span>
      </div>
      {Object.values(ws?.quests ?? {}).length > 0 && (
        <>
          <div className="section-title">Threads</div>
          {Object.values(ws!.quests).map((q) => (
            <div className="quest" key={q.id}>
              <span className={q.status === "done" ? "done" : q.status === "blocked" ? "blocked" : ""}>
                {q.status === "done" ? "✓ " : q.status === "blocked" ? "✕ " : "• "}
                {q.title}
              </span>
            </div>
          ))}
        </>
      )}

      <div className="section-title">Evidence</div>
      {evidence.length === 0 && <div className="empty">Nothing recovered yet. Search the room.</div>}
      {evidence.map((e) => {
        const expanded = expandedEvidence.has(e.id);
        return (
          <div
            key={e.id}
            className={`ev-item ${e.status === "canonical" ? "is-canonical" : e.status === "observation" ? "is-observation" : e.status === "testimony" ? "is-testimony" : ""}${expanded ? " expanded" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() =>
              setExpandedEvidence((prev) => {
                const next = new Set(prev);
                next.has(e.id) ? next.delete(e.id) : next.add(e.id);
                return next;
              })
            }
            onKeyDown={(ev) => {
              if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                setExpandedEvidence((prev) => {
                  const next = new Set(prev);
                  next.has(e.id) ? next.delete(e.id) : next.add(e.id);
                  return next;
                });
              }
            }}
          >
            <div className="t">
              {e.title}
              <span className={`ev-status-pill ${e.status}`}>{e.status}</span>
            </div>
            <div className="c">{e.content}</div>
            {expanded && e.provenance && (
              <div className="ev-provenance">
                <div className="ev-prov-label">PROVENANCE</div>
                <div className="ev-prov-source">{e.provenance.source || e.provenance.sourceType}</div>
                {e.provenance.quote && <blockquote className="ev-prov-quote">{e.provenance.quote}</blockquote>}
                <div className="ev-prov-meta">
                  {e.provenance.sourceType}
                  {e.provenance.sourceId ? ` · ${e.provenance.sourceId}` : ""}
                  {typeof e.provenance.confidence === "number" ? ` · conf ${(e.provenance.confidence * 100).toFixed(0)}%` : ""}
                </div>
                {onChallengeClaim && (
                  <button type="button" className="board-challenge" onClick={(ev) => { ev.stopPropagation(); onChallengeClaim(e.id); }}>
                    challenge this claim
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="section-title">Ledger</div>
      <Ledger established={established} />

      <div className="section-title">What You Can Do</div>
      <button type="button" className="help-toggle" onClick={onToggleHelp} aria-expanded={helpOpen}>
        Commands &amp; grammar <span className="chev">{helpOpen ? "▾" : "▸"}</span>
      </button>
      {helpOpen && (
        <div className="help-list">
          {commandHints.map((c) => (
            <div className="help-row" key={c} style={{ cursor: "pointer" }} onClick={() => onPickCommand(c)}>
              {c}
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// CommandInput
// ---------------------------------------------------------------------------
export function CommandInput(props: {
  input: string;
  busy: boolean;
  onChange: (v: string) => void;
  onSend: () => void;
  onKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  affordance?: string;
  modeHint?: string;
}) {
  const { input, busy, onChange, onSend, onKey, inputRef, affordance, modeHint } = props;
  return (
    <div className="inputbar">
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={busy ? "…" : affordance ?? "What do you do?"}
        aria-label="command input"
      />
      <button type="button" onClick={onSend} disabled={busy || !input.trim()}>
        {busy ? "…" : "SAY"}
      </button>
      {modeHint && !input && <div className="input-modes">{modeHint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
export function Toast(props: { toast: string | null }) {
  const { toast } = props;
  if (!toast) return null;
  return (
    <div
      style={{
        position: "fixed",
        bottom: 84,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--bg-soft)",
        border: "1px solid var(--border-strong)",
        borderLeft: "2px solid var(--accent)",
        color: "var(--ink)",
        padding: "9px 18px",
        borderRadius: 3,
        fontSize: 13,
        zIndex: 10,
      }}
    >
      {toast}
    </div>
  );
}
