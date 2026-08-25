/**
 * GameShell presentational components (Iteration 1 — architecture prep).
 *
 * These are PURE, prop-driven render components extracted from the former
 * monolithic GameClient.tsx. They contain NO game state and NO game logic —
 * they receive exactly the data the old closures provided and render the same
 * markup. This keeps behavior byte-for-byte identical while creating clean
 * boundaries for the later visual redesign (tokens, epistemic language, R3F).
 *
 * The only deliberate behavioral change is an accessibility fix: interactive
 * actions are now real <button> elements (keyboard + focus + screen-reader
 * correct) instead of <a onClick>. Styling is preserved via `.asbtn`.
 */

import type { WorldState, NarrationLine, Evidence, FactStatus } from "../lib/core/types";
import type { TravelJournal } from "../lib/core/travel";
import { canTravelTo, isFreeTravel } from "../lib/core/travel";
import type { EpisodeMeta } from "./episode-meta";
import type { InvestigationPayload } from "./investigation-payload";
import type { TtsLine } from "./tts-types";

// ---------- shared helpers (moved up so subcomponents can use them) ----------

export function statusClass(s?: FactStatus): string {
  if (s === "testimony" || s === "rumor") return "status-testimony";
  if (s === "canonical") return "status-canonical";
  if (s === "observation") return "status-observation";
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

// ---------------------------------------------------------------------------
// TabBar (mobile only — first-class rail access, not hidden info)
// ---------------------------------------------------------------------------
export function TabBar(props: { active: "world" | "board" | null; onTab: (t: "world" | "board") => void }) {
  const { active, onTab } = props;
  return (
    <nav className="tabbar" aria-label="panels">
      <button
        type="button"
        className={active === "world" ? "active" : ""}
        onClick={() => onTab("world")}
        aria-pressed={active === "world"}
      >
        World
      </button>
      <button
        type="button"
        className={active === "board" ? "active" : ""}
        onClick={() => onTab("board")}
        aria-pressed={active === "board"}
      >
        Board
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// GameHeader
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
          {meta ? `episode ${roman(meta.index)} · ${meta.title.toLowerCase()}` : "a literary survival mystery"}
        </div>
      </div>
      <div className="save">
        {ws ? `Day ${ws.time.day} · ${fmtTime(ws.time)}` : ""}
        <br />
        {ttsEnabled && (
          <>
            <button type="button" onClick={onToggleVoice} className={`asbtn ${voiceOn ? "voice-on" : ""}`}>
              [{voiceOn ? "🔊 voice on" : "🔈 voice off"}]
            </button>
            {" · "}
          </>
        )}
        <button type="button" onClick={onNewGame} className="asbtn">
          [new game]
        </button>
        {" · "}
        <button type="button" onClick={onOpenBoard} className="asbtn">
          [board]
        </button>
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
// WorldPanel (left rail: world + quests)
// ---------------------------------------------------------------------------
export function WorldPanel(props: { ws: WorldState | null; meta: EpisodeMeta | null; mobileTab?: "world" | "board" | null }) {
  const { ws, meta, mobileTab } = props;
  if (!ws) return <aside className={`panel-left${mobileTab === "world" ? " open" : ""}`} />;
  return (
    <aside className={`panel-left${mobileTab === "world" ? " open" : ""}`}>
      <div className="section-title">World</div>
      <div className="world-line">
        <span className="k">EPISODE</span>
        <span className="v">{meta ? `${roman(meta.index)} · ${meta.title}` : ws.episodeId}</span>
      </div>
      <div className="world-line">
        <span className="k">LOCATION</span>
        <span className="v">{prettyLoc(ws.location)}</span>
      </div>
      <div className="world-line">
        <span className="k">HEALTH</span>
        <span className="v">{ws.player.health}</span>
      </div>
      <div className="world-line">
        <span className="k">STAMINA</span>
        <span className="v">{ws.player.stamina}</span>
      </div>
      <div className="world-line">
        <span className="k">TRUST·CHRIS</span>
        <span className="v">{ws.characterStates.chris?.trust ?? "—"}</span>
      </div>
      <div className="world-line">
        <span className="k">SOCIAL</span>
        <span className="v">{ws.player.socialTrust}</span>
      </div>
      <div className="section-title">Quests</div>
      {Object.values(ws.quests).map((q) => (
        <div className="world-line" key={q.id}>
          <span className="v" style={{ fontSize: 13 }}>
            {q.status === "done" ? "✓ " : "• "}
            {q.title}
          </span>
        </div>
      ))}
    </aside>
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
  return (
    <div className={`line ${line.speaker}`} key={index}>
      {line.speaker !== "player" && line.speaker !== "system" && (
        <span className="who">
          {line.speaker}
          {line.status && <span className={`status-tag ${statusClass(line.status)}`}>{statusLabel(line.status)}</span>}
        </span>
      )}
      {line.speaker === "system" && <span className="who system">»</span>}
      <div className="body">{line.text}</div>
      {isSpokenSpeaker(line.speaker) && line.text.trim() && (
        <span className="tts-row">
          {tts[index]?.status === "loading" && <span className="tts-spin" title="Generating speech…" aria-label="generating" />}
          {tts[index]?.status === "error" && <span className="tts-err" title="Speech unavailable">⚠</span>}
          {tts[index]?.status === "muted" && <span className="tts-muted" title="Line too long to narrate — read it instead">🔇</span>}
          {(tts[index]?.url || !tts[index] || tts[index]?.status === "error") && tts[index]?.status !== "loading" && tts[index]?.status !== "muted" && (
            tts[index]?.status === "playing" ? (
              <button type="button" className="tts-btn" onClick={() => onStop(index)} title="Stop">
                ⏸
              </button>
            ) : (
              <button type="button" className="tts-btn" onClick={() => onPlay(index)} title="Play">
                ▶
              </button>
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
  scrollRef: React.RefObject<HTMLDivElement>;
  onScroll: () => void;
}) {
  const { log, tts, ws, meta, busy, onPlay, onStop, onAdvance, scrollRef, onScroll } = props;
  return (
    <section className="center">
      <div className="narrative" ref={scrollRef} onScroll={onScroll}>
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
// EvidencePanel (right rail: board + evidence + facts + commands)
// ---------------------------------------------------------------------------
export function EvidencePanel(props: {
  boardOpen: boolean;
  board: InvestigationPayload | null;
  onCloseBoard: () => void;
  evidence: Evidence[];
  established: string[];
  ws: WorldState | null;
  commandHints: string[];
  onPickCommand: (c: string) => void;
  mobileTab?: "world" | "board" | null;
}) {
  const { boardOpen, board, onCloseBoard, evidence, established, ws, commandHints, onPickCommand, mobileTab } = props;
  return (
    <aside className={`panel-right${mobileTab === "board" ? " open" : ""}`}>
      {boardOpen && (
        <div className="board-wrap">
          <div className="section-title board-title">
            Consistency Board
            {board?.timelines && board.timelines.length > 1 && (
              <span className="board-agg"> · across {board.timelines.length} timelines</span>
            )}
            {board?.timelines && board.timelines.length > 1 && (
              <div className="board-timelines">{board.timelines.map((t) => t.toUpperCase()).join("  ·  ")}</div>
            )}
            <button type="button" onClick={onCloseBoard} className="asbtn" style={{ float: "right", fontSize: 11 }}>
              [close]
            </button>
          </div>
          {!board ? (
            <div className="empty">No data yet.</div>
          ) : (
            <div className="board-body">
              {board.openLeads?.length > 0 && (
                <div className="board-section">
                  <div className="board-label">OPEN LEADS ({board.openLeads.length})</div>
                  {board.openLeads.map((l) => (
                    <div key={l.factId} className="board-row lead">
                      <span className="dot" />
                      <span className="board-text">{l.label}</span>
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
      <div className="section-title">Evidence</div>
      {evidence.length === 0 && <div className="empty">Nothing recovered yet. Search the room.</div>}
      {evidence.map((e) => (
        <div className="ev-item" key={e.id}>
          <div className="t">{e.title}</div>
          <div className="c">{e.content}</div>
          <span className={`tag ${e.status === "canonical" ? "canon" : e.status === "observation" ? "test" : "unk"}`}>{e.kind}</span>
        </div>
      ))}

      <div className="section-title">Established Facts</div>
      {established.length === 0 && <div className="empty">No facts established yet.</div>}
      {established.map((f, i) => (
        <div className="fact-item" key={i}>
          <span className="t">{f}</span>
          <span className="tag canon">canon</span>
        </div>
      ))}

      <div className="section-title">Commands</div>
      {commandHints.map((c) => (
        <div className="help-row" key={c} style={{ cursor: "pointer" }} onClick={() => onPickCommand(c)}>
          {c}
        </div>
      ))}
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
  inputRef: React.RefObject<HTMLInputElement>;
  affordance?: string;
}) {
  const { input, busy, onChange, onSend, onKey, inputRef, affordance } = props;
  return (
    <div className="inputbar">
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder={busy ? "…" : "What do you do?"}
        aria-label="command input"
      />
      <button type="button" onClick={onSend} disabled={busy || !input.trim()}>
        {busy ? "…" : "SAY"}
      </button>
      {affordance && !input && <div className="input-hint">{affordance}</div>}
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
        bottom: 78,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--bg-soft)",
        border: "1px solid var(--border)",
        color: "var(--ink)",
        padding: "8px 16px",
        borderRadius: 3,
        fontSize: 13,
        zIndex: 10,
      }}
    >
      {toast}
    </div>
  );
}
