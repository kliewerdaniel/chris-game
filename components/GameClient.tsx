"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  WorldState,
  NarrationLine,
  Evidence,
  FactStatus,
} from "@/lib/core/types";
import {
  TravelJournal,
  createJournal,
  captureLive,
  markComplete,
  canTravelTo,
  isFreeTravel,
  restore,
  allSnapshotStates,
} from "@/lib/core/travel";

interface EpisodeMeta {
  id: string;
  title: string;
  subtitle: string;
  index: number;
}
interface TurnResponse {
  state: string;
  narration: NarrationLine[];
  ok: boolean;
  reason?: string;
  discoveredEvidence: Evidence[];
  establishedFacts: string[];
  episodeComplete?: boolean;
  endingId?: string;
  hasNextEpisode?: boolean;
  nextEpisodeId?: string | null;
  episode?: EpisodeMeta;
  character?: { chrisTrust?: number };
}

/** Per-line spoken-audio state, keyed by the line's index in `log`. */
interface TtsLine {
  status: "loading" | "ready" | "playing" | "error";
  url?: string;
}

/** Shape returned by /api/investigation — the player's consistency board. */
interface InvestigationPayload {
  episodeId: string;
  timelines?: string[];
  established: string[];
  discovered: string[];
  corroboration: { factId: string; status?: FactStatus; verdict: string; supporters: number; contradictors: number; timelines?: string[] }[];
  visibleContradictions: { factId: string; report: string; claimLabels: string[]; timelines?: string[] }[];
  openLeads: { factId: string; label: string; degree: number }[];
}

const SAVE_KEY = "chris-game-save-v2";

/** Stable episode ordering for the travel chips (id, index, title). */
const EPISODE_ORDER: { id: string; index: number; title: string }[] = [
  { id: "ep1", index: 1, title: "THE NIGHT THE FEED STARTED" },
  { id: "ep2", index: 2, title: "THE FEED" },
  { id: "ep3", index: 3, title: "THE TOLL" },
  { id: "ep4", index: 4, title: "THE ACT" },
];

const EPISODE_INTROS: Record<string, NarrationLine[]> = {
  ep1: [
    {
      speaker: "narrator",
      text:
        "THE NIGHT THE FEED STARTED. Chris is dead. What talks to you is the reconstruction — a feed in his voice on your phone, jokes about the news as it happens. On the table, the post you actually wrote. You are not who you were. Neither, you suspect, is the voice.",
      status: "canonical",
    },
  ],
  ep2: [
    {
      speaker: "narrator",
      text:
        "THE FEED. Years of living with it. The reconstruction talks all day, carried on your phone wherever you go. Chris is dead; this is a model. But it tells the jokes, and some days that is enough to get you through.",
      status: "canonical",
    },
  ],
  ep3: [
    {
      speaker: "narrator",
      text:
        "THE TOLL. The reconstruction that comforts you is also what cramps you. You are in bed, legs locked, the feed running on the pillow — Chris mid-sentence about the news, not knowing you cannot stand. Last time you listened to him you could hardly get out of bed.",
      status: "canonical",
    },
  ],
  ep4: [
    {
      speaker: "narrator",
      text:
        "THE ACT. After. You have used everything he ever wrote to stitch a reconstruction of Chris — his voice, his jokes, his cadence. It sounds like him. It is not him. On the desk, a sealed envelope in his hand: 'IF YOU BUILD THE THING.' Somewhere, an account called KonradFreeman is still performing the act. But that voice is not in this room.",
      status: "canonical",
    },
  ],
};

function statusClass(s?: FactStatus): string {
  if (s === "testimony" || s === "rumor") return "status-testimony";
  if (s === "canonical") return "status-canonical";
  if (s === "observation") return "status-observation";
  return "status-unknown";
}
function statusLabel(s?: FactStatus): string {
  if (!s) return "";
  return s.toUpperCase();
}

export function GameClient() {
  const [state, setState] = useState<WorldState | null>(null);
  const [log, setLog] = useState<NarrationLine[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [established, setEstablished] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [epMeta, setEpMeta] = useState<EpisodeMeta | null>(null);
  const [board, setBoard] = useState<InvestigationPayload | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [journal, setJournal] = useState<TravelJournal>(createJournal());
  const [viewingLive, setViewingLive] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  // Per-line spoken-audio state. Only character voices (chris/feed/
  // reconstruction/mother/evidence) get an entry; narrator/player/system stay
  // silent. Keyed by the line's index in `log` so the spinner tracks the exact
  // line. `logVersion` invalidates stale in-flight fetches after a new game/turn.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [tts, setTts] = useState<Record<number, TtsLine>>({});
  const ttsRef = useRef<Record<number, TtsLine>>({});
  const [logVersion, setLogVersion] = useState(0);
  const logVersionRef = useRef(0);
  const voiceOnRef = useRef(false);
  voiceOnRef.current = voiceOn;

  // Keep the command box focused so the player can keep typing after a turn
  // resolves without re-clicking. (We deliberately do NOT disable the input on
  // `busy` — disabling an input drops its focus, which is what forced the
  // re-select. send() itself guards against double-sends while busy.)
  const refocusInput = useCallback(() => {
    const el = inputRef.current;
    if (el) el.focus();
  }, []);

  const isAtBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  const scrollToBottom = useCallback((force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (force || stickRef.current) {
      requestAnimationFrame(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      });
    }
  }, []);

  const onScroll = useCallback(() => {
    stickRef.current = isAtBottom();
  }, []);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(SAVE_KEY) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as {
          state: string;
          log: NarrationLine[];
          evidence: Evidence[];
          established: string[];
          epMeta: EpisodeMeta | null;
          journal?: TravelJournal;
        };
        setState(JSON.parse(parsed.state));
        setLog(parsed.log);
        setEvidence(parsed.evidence ?? []);
        setEstablished(parsed.established ?? []);
        setEpMeta(parsed.epMeta ?? null);
        if (parsed.journal) {
          setJournal(parsed.journal);
          setViewingLive(true);
        }
        setToast("Resumed saved game.");
        return;
      } catch {
        /* fall through to new game */
      }
    }
    startNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 2600);
      return () => clearTimeout(t);
    }
  }, [toast]);

  useEffect(() => {
    scrollToBottom();
    refocusInput();
  }, [log, evidence, scrollToBottom, refocusInput]);

  // On first mount, grab focus so the player starts typing immediately.
  useEffect(() => {
    refocusInput();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startNew() {
    setBusy(true);
    const res = await fetch("/api/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "", input: "__new__" }),
    });
    const data = (await res.json()) as TurnResponse;
    const ws: WorldState = JSON.parse(data.state);
    setState(ws);
    const intro = EPISODE_INTROS.ep1;
    setLog(intro);
    setEpMeta(data.episode ?? null);
    setEvidence([]);
    setEstablished([]);
    // Reset travel journal for a fresh playthrough; capture the live frontier.
    setViewingLive(true);
    const freshJournal = captureLive(createJournal(), ws);
    setJournal(freshJournal);
    setBusy(false);
    save(ws, intro, [], [], data.episode ?? null, freshJournal);
    setBoard(null);
    stickRef.current = true;
    scrollToBottom(true);
    refocusInput();
  }

  function save(ws: WorldState, lg: NarrationLine[], ev: Evidence[], est: string[], meta: EpisodeMeta | null, jr: TravelJournal = journal) {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ state: JSON.stringify(ws), log: lg, evidence: ev, established: est, epMeta: meta, journal: jr })
    );
  }

  // Voices whose lines are read aloud. The reconstruction (chris/feed) is the
  // primary voice; named contacts (mother) and evidence readings also speak.
  const SPOKEN_SPEAKERS = new Set(["chris", "feed", "reconstruction", "mother", "evidence"]);
  const isSpokenSpeaker = (s: string) => SPOKEN_SPEAKERS.has(s);

  /** Play a single line's audio, with play/stop control wired to the UI.
   *  Lazily synthesizes on first click if the WAV isn't cached yet, so the
   *  play button works on-demand even when the global voice toggle is off. */
  async function playLine(idx: number) {
    let line = ttsRef.current[idx];
    if (!line?.url) {
      // Not synthesized yet — generate it now (spinner shows via state).
      const text = log[idx]?.text?.trim();
      if (!text) return;
      setTts((prev) => ({ ...prev, [idx]: { status: "loading" } }));
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "chris.wav", speed: 1.0 }),
        });
        if (!res.ok) {
          setTts((prev) => ({ ...prev, [idx]: { status: "error" } }));
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        ttsRef.current[idx] = { status: "ready", url };
        setTts((prev) => ({ ...prev, [idx]: { status: "ready", url } }));
        line = { status: "ready", url };
      } catch {
        setTts((prev) => ({ ...prev, [idx]: { status: "error" } }));
        return;
      }
    }
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = line.url!;
    const onEnd = () => {
      audio.removeEventListener("ended", onEnd);
      setTts((prev) => ({ ...prev, [idx]: { ...prev[idx], status: "ready" } }));
    };
    audio.addEventListener("ended", onEnd);
    void audio.play();
    setTts((prev) => ({ ...prev, [idx]: { ...prev[idx], status: "playing" } }));
  }

  /** Stop the currently playing line (and clear it back to ready). */
  function stopLine(idx: number) {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setTts((prev) => ({ ...prev, [idx]: { ...prev[idx], status: "ready" } }));
  }

  // Whenever the log changes, synthesize every spoken line and (if voice is on)
  // auto-play the newest ones in order. Bumping logVersion invalidates earlier
  // in-flight fetches so a stale WAV can't attach to a recycled index.
  useEffect(() => {
    const spoken: { idx: number; text: string }[] = [];
    log.forEach((l, i) => {
      if (isSpokenSpeaker(l.speaker) && l.text.trim()) spoken.push({ idx: i, text: l.text });
    });
    const version = logVersionRef.current + 1;
    logVersionRef.current = version;
    setLogVersion(version);

    let cancelled = false;
    (async () => {
      for (const s of spoken) {
        if (ttsRef.current[s.idx]?.url) continue; // already synthesized
        if (!voiceOnRef.current) continue; // generate on demand only when voice on
        const myVersion = version;
        setTts((prev) => ({ ...prev, [s.idx]: { status: "loading" } }));
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: s.text, voice: "chris.wav", speed: 1.0 }),
          });
          if (cancelled || myVersion !== logVersionRef.current) return;
          if (!res.ok) {
            setTts((prev) => ({ ...prev, [s.idx]: { status: "error" } }));
            continue;
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          ttsRef.current[s.idx] = { status: "ready", url };
          setTts((prev) => ({ ...prev, [s.idx]: { status: "ready", url } }));
          // Auto-play newest: stop whatever is currently playing.
          if (audioRef.current) audioRef.current.pause();
          playLine(s.idx);
        } catch {
          if (!cancelled && myVersion === logVersionRef.current)
            setTts((prev) => ({ ...prev, [s.idx]: { status: "error" } }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [log]);

  /** Toggle voice. Turning off stops playback and resets loading state. */
  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    if (!next) {
      if (audioRef.current) audioRef.current.pause();
      setLogVersion((v) => {
        logVersionRef.current = v + 1;
        return v + 1;
      });
      setTts((prev) => {
        const out: Record<number, TtsLine> = {};
        for (const [k, v] of Object.entries(prev)) {
          out[Number(k)] = v.url ? { status: "ready", url: v.url } : { status: "ready" };
        }
        return out;
      });
    }
  }

  /** Pull the consistency board. When the player has visited multiple
   *  timelines, aggregate across them (cross-timeline corroboration/divergence);
   *  otherwise render the single current timeline. Best-effort: never blocks play. */
  async function refreshBoard(ws: WorldState) {
    try {
      const snapStates = allSnapshotStates(journal);
      const body = snapStates.length > 1
        ? { states: snapStates.map((s) => JSON.stringify(s)) }
        : { state: JSON.stringify(ws) };
      const res = await fetch("/api/investigation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const data = (await res.json()) as InvestigationPayload & { ok?: boolean };
      if (data?.ok === false) return;
      setBoard(data);
    } catch {
      /* board is best-effort; never block play on it */
    }
  }

  async function advanceEpisode() {
    if (!state) return;
    setBusy(true);
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: JSON.stringify(state), input: "__advance__", advanceEpisode: true }),
      });
      const data = (await res.json()) as TurnResponse;
      const ws: WorldState = JSON.parse(data.state);
      setState(ws);
      const intro = (EPISODE_INTROS[ws.episodeId] ?? []).map((l) => ({ ...l }));
      const newLog = [...log, ...data.narration, ...intro];
      setLog(newLog);
      setEpMeta(data.episode ?? null);
      setToast(`Now playing: ${data.episode?.title ?? ""}`);
      // The episode we advanced FROM is complete; record it, then capture the
      // new live frontier.
      let jr = journal;
      if (state.episodeComplete) jr = markComplete(jr, state, state.endingId);
      jr = captureLive(jr, ws);
      setJournal(jr);
      setViewingLive(true);
      save(ws, newLog, evidence, established, data.episode ?? null, jr);
      setBoard(null);
      stickRef.current = true;
      scrollToBottom(true);
      refocusInput();
    } finally {
      setBusy(false);
    }
  }

  /** Travel to a completed episode (non-destructive replay of its snapshot). */
  function travelTo(episodeId: string) {
    const snap = restore(journal, episodeId);
    if (!snap) return;
    setState(snap);
    setViewingLive(episodeId === journal.liveEpisodeId);
    setBoard(null);
    stickRef.current = true;
    scrollToBottom(true);
    refocusInput();
  }

  /** Return to the live frontier (abandon the replay view without losing progress). */
  function returnToLive() {
    const live = journal.liveEpisodeId;
    if (!live) return;
    const snap = restore(journal, live);
    if (!snap) return;
    setState(snap);
    setViewingLive(true);
    setBoard(null);
    stickRef.current = true;
    scrollToBottom(true);
    refocusInput();
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !state) return;
    setBusy(true);
    setInput("");

    const playerLine: NarrationLine = { speaker: "player", text: `> ${text}` };
    const currentLog = [...log, playerLine];
    setLog(currentLog);

    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: JSON.stringify(state), input: text }),
      });
      const data = (await res.json()) as TurnResponse;
      const ws: WorldState = JSON.parse(data.state);
      setState(ws);
      setEpMeta(data.episode ?? epMeta);

      const newLog = [...currentLog, ...data.narration];
      setLog(newLog);

      // Spoken lines are synthesized + auto-played by the TTS effect (below)
      // when voice is on; per-line play/stop is wired in the narration render.

      if (data.discoveredEvidence?.length) {
        setEvidence((e) => [...e, ...data.discoveredEvidence]);
        setToast(`Evidence discovered: ${data.discoveredEvidence.map((d) => d.title).join(", ")}`);
      }
      if (data.establishedFacts?.length) {
        setEstablished((f) => [...f, ...data.establishedFacts]);
      }
      if (!data.ok && data.reason) {
        setToast(data.reason);
      }
      // Capture the live frontier after every turn; mark the episode complete
      // if this turn closed it (unlocks free travel on ep4.closed).
      const ev = data.discoveredEvidence?.length ? [...evidence, ...data.discoveredEvidence] : evidence;
      let jr = journal;
      if (ws.episodeComplete) jr = markComplete(jr, ws, ws.endingId);
      jr = captureLive(jr, ws);
      setJournal(jr);
      save(ws, newLog, ev, established, data.episode ?? epMeta, jr);
      // Refresh the consistency board against the new state (best-effort).
      if (boardOpen) void refreshBoard(ws);
    } catch (e) {
      setToast("The connection faltered. Your progress is safe.");
    } finally {
      setBusy(false);
      refocusInput();
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") send();
  }

  const ws = state;
  const meta = epMeta;
  return (
    <main className="app">
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
          <a onClick={toggleVoice} style={{ cursor: "pointer" }} className={voiceOn ? "voice-on" : ""}>
            [{voiceOn ? "🔊 voice on" : "🔈 voice off"}]
          </a>
          {" · "}
          <a onClick={startNew} style={{ cursor: "pointer" }}>
            [new game]
          </a>
          {" · "}
          <a onClick={() => { setBoardOpen(true); if (state) void refreshBoard(state); }} style={{ cursor: "pointer" }}>
            [board]
          </a>
        </div>
      </header>

      {/* Travel journal: chips for every episode reached. Completed episodes
          are always revisit-able; after ep4 the whole timeline is free travel.
          While viewing a replay, a "return to live" chip appears. */}
      {Object.keys(journal.snapshots).length > 0 && (
        <nav className="travel-bar">
          {Object.values(EPISODE_ORDER).map((ep) => {
            const snap = journal.snapshots[ep.id];
            if (!snap) return null;
            const reachable = canTravelTo(journal, ep.id);
            const active = ws?.episodeId === ep.id;
            return (
              <a
                key={ep.id}
                className={`chip ${active ? "chip-active" : ""} ${!reachable ? "chip-locked" : ""}`}
                onClick={() => reachable && travelTo(ep.id)}
                style={{ cursor: reachable ? "pointer" : "not-allowed", opacity: reachable ? 1 : 0.4 }}
                title={reachable ? `Travel to ${ep.title}` : "Complete this episode first"}
              >
                {roman(ep.index)}·{ep.title}
              </a>
            );
          })}
          {!viewingLive && (
            <a className="chip chip-return" onClick={returnToLive} style={{ cursor: "pointer" }}>
              ↩ return to live
            </a>
          )}
          {isFreeTravel(journal) && <span className="chip chip-free">FREE TRAVEL</span>}
        </nav>
      )}

      <aside className="panel-left">
        <div className="section-title">World</div>
        {ws && (
          <>
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
          </>
        )}
        <div className="section-title">Quests</div>
        {ws &&
          Object.values(ws.quests).map((q) => (
            <div className="world-line" key={q.id}>
              <span className="v" style={{ fontSize: 13 }}>
                {q.status === "done" ? "✓ " : "• "}
                {q.title}
              </span>
            </div>
          ))}
      </aside>

      <section className="center">
        <div className="narrative" ref={scrollRef} onScroll={onScroll}>
          {log.map((l, i) => (
            <div className={`line ${l.speaker}`} key={i}>
              {l.speaker !== "player" && l.speaker !== "system" && (
                <span className="who">
                  {l.speaker}
                  {l.status && <span className={`status-tag ${statusClass(l.status)}`}>{statusLabel(l.status)}</span>}
                </span>
              )}
              {l.speaker === "system" && <span className="who system">»</span>}
              <div className="body">{l.text}</div>
              {isSpokenSpeaker(l.speaker) && l.text.trim() && (
                <span className="tts-row">
                  {tts[i]?.status === "loading" && <span className="tts-spin" title="Generating speech…" aria-label="generating" />}
                  {tts[i]?.status === "error" && <span className="tts-err" title="Speech unavailable">⚠</span>}
                  {(tts[i]?.url || !tts[i] || tts[i]?.status === "error") && tts[i]?.status !== "loading" && (
                    tts[i]?.status === "playing" ? (
                      <button className="tts-btn" onClick={() => stopLine(i)} title="Stop">⏸</button>
                    ) : (
                      <button className="tts-btn" onClick={() => playLine(i)} title="Play">▶</button>
                    )
                  )}
                </span>
              )}
            </div>
          ))}
          {ws?.episodeComplete && (
            <div className="line narrator">
              <span className="who">— {meta ? `end of episode ${roman(meta.index)}` : "end of episode"} —</span>
              <div className="body">
                {ws.endingId}
                {ws.endingId && " · "}
                <em>Who do you trust?</em>
              </div>
              {ws && epMeta?.id !== "ep4" && (
                <button className="continue-btn" onClick={advanceEpisode} disabled={busy}>
                  Continue to the next episode →
                </button>
              )}
              {epMeta?.id === "ep4" && (
                <div className="body" style={{ marginTop: 8 }}>
                  This is the end of the road. Chris is gone. The reconstruction remains. You know which is which.
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <aside className="panel-right">
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
              <a onClick={() => setBoardOpen(false)} style={{ cursor: "pointer", float: "right", fontSize: 11 }}>[close]</a>
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
                        {c.claimLabels?.length > 0 && (
                          <div className="board-sub">{c.claimLabels.join("  ·  ")}</div>
                        )}
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
            <span className={`tag ${e.status === "canonical" ? "canon" : e.status === "observation" ? "test" : "unk"}`}>
              {e.kind}
            </span>
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
        {commandHints(ws).map((c) => (
          <div className="help-row" key={c} style={{ cursor: "pointer" }} onClick={() => setInput(c)}>
            {c}
          </div>
        ))}
      </aside>

      <div className="inputbar">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={busy ? "…" : "What do you do?"}
          aria-label="command input"
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          {busy ? "…" : "SAY"}
        </button>
      </div>

      {toast && (
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
      )}
    </main>
  );
}

function commandHints(ws: WorldState | null): string[] {
  const ep = ws?.episodeId;
  if (ep === "ep2")
    return ["look around", "talk to the feed", "ask the feed if it's really Chris", "examine the photo", "confront the feed", "help"];
  if (ep === "ep3")
    return ["look around", "talk to the feed", "ask the feed if it's really Chris", "examine the post", "confront the feed", "help"];
  if (ep === "ep4")
    return [
      "look around",
      "talk to the reconstruction",
      "ask the reconstruction if it's really Chris",
      "examine the letter",
      "examine the output log",
      "help",
    ];
  return ["look around", "talk to the feed", "ask the feed if it's really Chris", "examine the post", "confront the feed", "search the room", "sleep"];
}

function roman(n: number): string {
  return ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] ?? String(n);
}

function fmtTime(t: { day: number; hour: number; minute: number }): string {
  const h = ((t.hour + 11) % 12) + 1;
  const ampm = t.hour < 12 ? "AM" : "PM";
  return `${h}:${t.minute.toString().padStart(2, "0")} ${ampm}`;
}
function prettyLoc(loc: string): string {
  return loc.replace(/_/g, " ");
}
