"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WorldState, NarrationLine, Evidence } from "../lib/core/types";
import {
  TravelJournal,
  createJournal,
  captureLive,
  markComplete,
  restore,
  allSnapshotStates,
} from "../lib/core/travel";
import type { EpisodeMeta } from "./episode-meta";
import type { InvestigationPayload } from "./investigation-payload";
import type { TtsLine } from "./tts-types";
import {
  GameHeader,
  TravelBar,
  WorldPanel,
  NarrativeLog,
  EvidencePanel,
  CommandInput,
  Toast,
  TabBar,
} from "./GameShell";

const SAVE_KEY = "chris-game-save-v2";

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
  const [mobileTab, setMobileTab] = useState<"world" | "board" | null>(null);
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

  // Single-flight lock so the local vox TTS server never receives two
  // concurrent /api/tts calls (it's a single worker; a burst was crashing it).
  const ttsLock: { chain: Promise<unknown> } = { chain: Promise.resolve() };
  function ttsRequest(text: string): Promise<{ ok: boolean; blob?: Blob }> {
    const run = async () => {
      // Fail fast: if vox is down or wedged (single-worker waitress + global
      // infer lock), we must not let the <audio> spinner hang for the proxy's
      // full 120s server timeout. 40s bounds the perceptible "voice stuck" case
      // and lets the single-flight chain advance to the next line.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 40_000);
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, voice: "chris.wav", speed: 1.0 }),
          signal: ctrl.signal,
        });
        if (!res.ok) return { ok: false as const };
        return { ok: true as const, blob: await res.blob() };
      } finally {
        clearTimeout(timer);
      }
    };
    const p = ttsLock.chain.then(run, run);
    // Keep the chain alive even if one request rejects.
    ttsLock.chain = p.then(() => undefined, () => undefined);
    return p;
  }

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
        const r = await ttsRequest(text);
        if (!r.ok) {
          setTts((prev) => ({ ...prev, [idx]: { status: "error" } }));
          return;
        }
        const blob = r.blob!;
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
          const r = await ttsRequest(s.text);
          if (cancelled || myVersion !== logVersionRef.current) return;
          if (!r.ok) {
            setTts((prev) => ({ ...prev, [s.idx]: { status: "error" } }));
            continue;
          }
          const blob = r.blob!;
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
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      let res: Response;
      try {
        res = await fetch("/api/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: JSON.stringify(state), input: text }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
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
      <GameHeader
        meta={meta}
        ws={ws}
        voiceOn={voiceOn}
        onToggleVoice={toggleVoice}
        onNewGame={startNew}
        onOpenBoard={() => {
          setBoardOpen(true);
          if (state) void refreshBoard(state);
        }}
      />

      <TravelBar
        journal={journal}
        ws={ws}
        viewingLive={viewingLive}
        onTravel={travelTo}
        onReturnToLive={returnToLive}
      />

      <WorldPanel ws={ws} meta={meta} mobileTab={mobileTab} />

      <NarrativeLog
        log={log}
        tts={tts}
        ws={ws}
        meta={meta}
        busy={busy}
        onPlay={playLine}
        onStop={stopLine}
        onAdvance={advanceEpisode}
        scrollRef={scrollRef}
        onScroll={onScroll}
      />

      <EvidencePanel
        boardOpen={boardOpen}
        board={board}
        onCloseBoard={() => setBoardOpen(false)}
        evidence={evidence}
        established={established}
        ws={ws}
        commandHints={commandHints(ws)}
        onPickCommand={(c) => setInput(c)}
        mobileTab={mobileTab}
      />

      <CommandInput
        input={input}
        busy={busy}
        onChange={setInput}
        onSend={send}
        onKey={onKey}
        inputRef={inputRef}
      />

      <Toast toast={toast} />
      <TabBar active={mobileTab} onTab={(t) => setMobileTab((cur) => (cur === t ? null : t))} />
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

// Re-imported here (kept local to avoid a circular concern); identical to source.
import { isSpokenSpeaker } from "./GameShell";

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
