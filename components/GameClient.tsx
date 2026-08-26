"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { WorldState, NarrationLine, Evidence, GameAction } from "../lib/core/types";
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
import { createClientEngine, EPISODES } from "../lib/engine/game-engine";
import { buildInvestigationPayload } from "../lib/core/investigation";
import { parseAction, isConfident } from "../lib/inference/intent";
import {
  GameHeader,
  TravelBar,
  NarrativeLog,
  CaseFile,
  CommandInput,
  Toast,
  TabBar,
} from "./GameShell";

// ADR-014 Phase B: the R3F reconstruction visual is client-only (Three.js).
// No SSR — dynamic import with `ssr: false` so the canvas never renders server-side.
const ReconstructionScene = dynamic(() => import("./ReconstructionScene"), {
  ssr: false,
  loading: () => <div className="recon-loading">assembling reconstruction…</div>,
});

const SAVE_KEY = "chris-game-save-v2";

function episodeIntro(id: string, ws: WorldState | null): NarrationLine[] {
  switch (id) {
    case "ep1":
      return [
        {
          speaker: "narrator",
          text:
            "THE NIGHT THE FEED STARTED. Chris is dead. What talks to you is the reconstruction — a feed in his voice on your phone, jokes about the news as it happens. On the table, the post you actually wrote. You are not who you were. Neither, you suspect, is the voice.",
          status: "canonical",
        },
      ];
    case "ep2":
      return [
        {
          speaker: "narrator",
          text: ws?.flags["ep1.left"]
            ? "THE FEED. Years of living with it — since the night you walked out without reading your own post, and never quite came back to it. The reconstruction talks all day, carried on your phone wherever you go. Chris is dead; this is a model. Some days the joke is enough to get you through. Some days you wonder if you left the truth on the table on purpose."
            : "THE FEED. Years of living with it — since the night you finally read what you'd written. The reconstruction talks all day, carried on your phone wherever you go. Chris is dead; this is a model. But it tells the jokes, and some days that is enough to get you through.",
          status: "canonical",
        },
      ];
    case "ep3":
      return [
        {
          speaker: "narrator",
          text:
            "THE TOLL. The reconstruction that comforts you is also what cramps you. You are in bed, legs locked, the feed running on the pillow — Chris mid-sentence about the news, not knowing you cannot stand. Last time you listened to him you could hardly get out of bed.",
          status: "canonical",
        },
      ];
    case "ep4":
      return [
        {
          speaker: "narrator",
          text:
            "THE ACT. After. You have used everything he ever wrote to stitch a reconstruction of Chris — his voice, his jokes, his cadence. It sounds like him. It is not him. On the desk, a note in your own hand: 'it is just an act, just like me.' And in a tab you never closed, the account you wrote him from still runs — u/KonradFreeman, the handle you performed in to birth him. The handle is yours. The act was always yours. But that voice is not in this room.",
          status: "canonical",
        },
      ];
    default:
      return [];
  }
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
  const [sceneOpen, setSceneOpen] = useState(false);
  const [journal, setJournal] = useState<TravelJournal>(createJournal());
  const [viewingLive, setViewingLive] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  // Cloned-voice TTS is OFF for public (decision #4) — local/dev only. The voice
  // toggle and all /api/tts calls are suppressed unless explicitly enabled at
  // build time. The game is fully playable text-only.
  const ttsEnabled = process.env.NEXT_PUBLIC_TTS_ENABLED === "1";
  const [mobileTab, setMobileTab] = useState<"world" | "board" | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  // ADR-014 §5.2 auto-prompt — proactive next-step nudge on the main surface.
  // Holds the engine's suggestion (factId + label) so the player sees it without
  // opening the Board. Cleared when there's nothing to suggest or it's unchanged.
  const [nextHint, setNextHint] = useState<{ factId: string; label: string } | null>(null);
  const lastHintRef = useRef<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);
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

  // Rotating placeholder — quiet affordance, not a permanent command wall.
  const PLACEHOLDERS = [
    "What do you do?",
    "What do you say to the feed?",
    "Ask the reconstruction something.",
    "Type a command, or just talk. (type 'help' for the grammar)",
  ];
  const [affordance, setAffordance] = useState(PLACEHOLDERS[0]);
  useEffect(() => {
    const id = setInterval(() => {
      setAffordance((cur) => {
        const next = (PLACEHOLDERS.indexOf(cur) + 1) % PLACEHOLDERS.length;
        return PLACEHOLDERS[next];
      });
    }, 4500);
    return () => clearInterval(id);
  }, []);

  // The deterministic engine runs CLIENT-SIDE. It is built once (it holds a
  // retrieval index + narrator) and reused for every turn. Narration is the only
  // thing it delegates — to the HostedNarrateBackend (POST /api/narrate) when
  // NEXT_PUBLIC_NARRATION is not "off", else to the deterministic fallback.
  const engineRef = useRef(createClientEngine());

  // ADR-011: free-chat with the reconstruction of a dead friend is the most
  // ethically loaded surface in the game. Show a ONE-TIME disclosure before the
  // first free-chat turn and remember the acknowledgment in localStorage.
  const [chatDisclosure, setChatDisclosure] = useState(false);
  const chatAckRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      chatAckRef.current = localStorage.getItem("chris-chat-disclosure") === "1";
    } catch {
      chatAckRef.current = false;
    }
  }, []);
  const acknowledgeChat = useCallback(() => {
    chatAckRef.current = true;
    setChatDisclosure(false);
    try {
      localStorage.setItem("chris-chat-disclosure", "1");
    } catch {
      /* ignore */
    }
  }, []);

  // ADR-011: rules-first NLP. Try the deterministic parser; if it isn't
  // confident, ask the serverless /api/intent (hosted model, tool-calling) for
  // a closed-schema GameAction; on any failure fall back to the rule parser's
  // chat coercion. The engine always re-validates the returned action.
  const resolveAction = useCallback(async (raw: string): Promise<GameAction> => {
    const rule = parseAction(raw);
    if (isConfident(rule)) return rule;
    // Ambiguous → try hosted intent resolver.
    try {
      const res = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (res.ok) {
        const data = (await res.json()) as { action: GameAction | null };
        if (data.action && typeof data.action.type === "string") {
          return data.action;
        }
      }
    } catch {
      /* network/timeout → fall through to rules */
    }
    return rule; // engine coerces to chat if still unconfident
  }, []);

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
    try {
      const ws = engineRef.current.newGame();
      setState(ws);
      const intro = episodeIntro("ep1", ws);
      setLog(intro);
      const meta: EpisodeMeta = {
        id: EPISODES.ep1.id,
        title: EPISODES.ep1.title,
        subtitle: EPISODES.ep1.subtitle,
        index: EPISODES.ep1.index,
      };
      setEpMeta(meta);
      setEvidence([]);
      setEstablished([]);
      // Reset travel journal for a fresh playthrough; capture the live frontier.
      setViewingLive(true);
      const freshJournal = captureLive(createJournal(), ws);
      setJournal(freshJournal);
      setBusy(false);
      save(ws, intro, [], [], meta, freshJournal);
      setBoard(null);
      stickRef.current = true;
      scrollToBottom(true);
      refocusInput();
    } finally {
      setBusy(false);
      refocusInput();
    }
  }

  function save(ws: WorldState, lg: NarrationLine[], ev: Evidence[], est: string[], meta: EpisodeMeta | null, jr: TravelJournal = journal) {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ state: JSON.stringify(ws), log: lg, evidence: ev, established: est, epMeta: meta, journal: jr })
    );
  }

  // Single-flight pump so the local vox TTS server (a single worker) never
  // receives two concurrent /api/tts calls. MUST be a ref: the auto-voice
  // effect re-fires on every `log` change, and a fresh pump per render would
  // let those re-fires run concurrently and flood the single worker.
  const ttsPumpRef = useRef<{ chain: Promise<unknown> }>({ chain: Promise.resolve() });
  const ttsPump = ttsPumpRef.current;

  // Length guard: vox synthesizes ~20s per ~50-word chunk, serially. A line
  // longer than MAX_TTS_CHARS (≈ ~80 words) would take far longer than the
  // proxy's 45s generate timeout and return a bad/empty WAV — the exact
  // "examine the post takes forever then fails, next also fails" cascade.
  // Over-long lines are skipped (text only, marked muted) instead of sent.
  const MAX_TTS_CHARS = 480;

  // Synthesize one line, single-flighted through the pump so vox (single
  // worker) is only ever asked for one line at a time. On a busy response
  // (502/503) we retry with a short backoff, up to MAX_TTS_ATTEMPTS — this is
  // what prevents "the next line also fails": a line that loses the single
  // worker to a sibling simply waits its turn instead of being dropped.
  const MAX_TTS_ATTEMPTS = 6;
  async function synthLine(text: string): Promise<{ ok: boolean; blob?: Blob }> {
    if (text.length > MAX_TTS_CHARS) return { ok: false as const };
    let attempt = 0;
    const run = async (): Promise<{ ok: boolean; blob?: Blob }> => {
      const ctrl = new AbortController();
      // 40s bounds the perceptible "voice stuck" case and lets the pump advance
      // to the next line; vox itself fast-fails busy well under this.
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
    // Single-flight through the pump, then bounded busy-retry.
    const p = ttsPump.chain.then(async () => {
      for (;;) {
        const r = await run();
        if (r.ok) return r;
        if (++attempt >= MAX_TTS_ATTEMPTS) return r; // give up, mark error (not muted)
        await new Promise((res) => setTimeout(res, 1200 * attempt));
      }
    }, async () => {
      // Chain rejected (shouldn't) — still try once.
      return run();
    });
    // Keep the chain alive even if one line rejects.
    ttsPump.chain = p.then(() => undefined, () => undefined);
    return p;
  }

  /** Play a single line's audio, with play/stop control wired to the UI.
   *  Lazily synthesizes on first click if the WAV isn't cached yet, so the
   *  play button works on-demand even when the global voice toggle is off. */
  async function playLine(idx: number) {
    if (!ttsEnabled) return; // voice is a local/dev feature only
    let line = ttsRef.current[idx];
    if (!line?.url) {
      // Not synthesized yet — generate it now (spinner shows via state).
      const text = log[idx]?.text?.trim();
      if (!text) return;
      setTts((prev) => ({ ...prev, [idx]: { status: "loading" } }));
      try {
        const r = await synthLine(text);
        if (!r.ok) {
          const muted = text.length > MAX_TTS_CHARS;
          setTts((prev) => ({ ...prev, [idx]: { status: muted ? "muted" : "error" } }));
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
    if (!ttsEnabled) return; // public build: no /api/tts calls at all
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
        // Sticky guard: any prior attempt (loading/ready/error/muted) for this
        // line index must NOT be re-fired. Without this, every `log` change
        // re-requests the line; under vox backpressure those re-fires slam the
        // single-worker server, producing a 502 storm ("the next line also
        // fails"). The per-line ▶ button still retries on demand.
        if (ttsRef.current[s.idx]) continue;
        if (!voiceOnRef.current) continue; // generate on demand only when voice on
        const myVersion = version;
        const attempt: TtsLine = { status: "loading" };
        ttsRef.current[s.idx] = attempt;
        setTts((prev) => ({ ...prev, [s.idx]: attempt }));
        try {
          const r = await synthLine(s.text);
          if (cancelled || myVersion !== logVersionRef.current) return;
          if (!r.ok) {
            // Either vox is down OR the line is too long for speech (length
            // guard). Distinguish so a long line reads as "muted" (text only),
            // not a hard error. Mark sticky so we don't re-fire on log change.
            const muted = s.text.length > MAX_TTS_CHARS;
            const failed: TtsLine = { status: muted ? "muted" : "error" };
            ttsRef.current[s.idx] = failed;
            setTts((prev) => ({ ...prev, [s.idx]: failed }));
            continue;
          }
          const blob = r.blob!;
          const url = URL.createObjectURL(blob);
          const ready: TtsLine = { status: "ready", url };
          ttsRef.current[s.idx] = ready;
          setTts((prev) => ({ ...prev, [s.idx]: ready }));
          // Auto-play newest: stop whatever is currently playing.
          if (audioRef.current) audioRef.current.pause();
          playLine(s.idx);
        } catch {
          if (!cancelled && myVersion === logVersionRef.current) {
            const failed: TtsLine = { status: "error" };
            ttsRef.current[s.idx] = failed;
            setTts((prev) => ({ ...prev, [s.idx]: failed }));
          }
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
      const payload = snapStates.length > 1
        ? buildInvestigationPayload(snapStates[snapStates.length - 1])
        : buildInvestigationPayload(ws);
      setBoard(payload);
    } catch {
      /* board is best-effort; never block play on it */
    }
  }

  async function advanceEpisode() {
    if (!state) return;
    setBusy(true);
    try {
      const next = engineRef.current.nextEpisode(state);
      if (!next) return;
      const ws = next;
      setState(ws);
      const ep = EPISODES[ws.episodeId];
      const meta: EpisodeMeta = { id: ep.id, title: ep.title, subtitle: ep.subtitle, index: ep.index };
      const intro = episodeIntro(ws.episodeId, ws);
      const newLog: NarrationLine[] = [
        ...log,
        { speaker: "system", text: `— ${ep.title} —`, status: "canonical" },
        ...intro,
      ];
      setLog(newLog);
      setEpMeta(meta);
      setToast(`Now playing: ${ep.title}`);
      // The episode we advanced FROM is complete; record it, then capture the
      // new live frontier.
      let jr = journal;
      if (state.episodeComplete) jr = markComplete(jr, state, state.endingId);
      jr = captureLive(jr, ws);
      setJournal(jr);
      setViewingLive(true);
      save(ws, newLog, evidence, established, meta, jr);
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

  /**
   * ADR-014 §5.2 — single engine turn path, shared by the text box and by
   * claim-driven actions (challenge). Runs the deterministic pipeline and
   * commits the result into live state / log / board the same way `send` does.
   */
  async function runTurn(action: GameAction, playerText?: string) {
    if (!state) return;
    const currentLog = playerText
      ? [...log, { speaker: "player" as const, text: playerText }]
      : log;
    setLog(currentLog);
    try {
      const { state: ws, result } = await engineRef.current.processTurnWithAction(state, action);
      setState(ws);
      const ep = EPISODES[ws.episodeId];
      const meta: EpisodeMeta = { id: ep.id, title: ep.title, subtitle: ep.subtitle, index: ep.index };
      setEpMeta(meta);

      // ADR-014 §5.2 auto-prompt — surface the engine's next-step suggestion on
      // the main play surface. Only re-show when it actually changed (don't
      // nag with a stale nudge the player already sees).
      const sug = result.suggestedNext;
      if (sug && sug.factId !== lastHintRef.current) {
        setNextHint({ factId: sug.factId, label: sug.label });
        lastHintRef.current = sug.factId;
      } else if (!sug) {
        setNextHint(null);
        lastHintRef.current = null;
      }

      const newLog = [...currentLog, ...result.narration];
      setLog(newLog);

      if (result.discoveredEvidence?.length) {
        setEvidence((e) => [...e, ...result.discoveredEvidence!]);
        setToast(`Evidence discovered: ${result.discoveredEvidence.map((d) => d.title).join(", ")}`);
      }
      if (result.establishedFacts?.length) {
        setEstablished((f) => [...f, ...result.establishedFacts!]);
      }

      const ev = result.discoveredEvidence?.length ? [...evidence, ...result.discoveredEvidence] : evidence;
      let jr = journal;
      if (ws.episodeComplete) jr = markComplete(jr, ws, ws.endingId);
      jr = captureLive(jr, ws);
      setJournal(jr);
      save(ws, newLog, ev, established, meta, jr);
      if (boardOpen) void refreshBoard(ws);
    } catch (e) {
      setToast("The connection faltered. Your progress is safe.");
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy || !state) return;
    setBusy(true);
    setInput("");

    // ADR-011: first free-form turn → one-time disclosure. We still record the
    // player line, but pause processing until they acknowledge (or have before).
    if (!chatAckRef.current && !chatDisclosure) {
      setChatDisclosure(true);
      setBusy(false);
      return;
    }

    try {
      // Rules-first NLP (ADR-011): deterministic parse, else hosted /api/intent,
      // else rule chat-coercion. Engine re-validates the returned action.
      const action = await resolveAction(text);
      await runTurn(action, `> ${text}`);
    } finally {
      setBusy(false);
      refocusInput();
    }
  }

  /**
   * ADR-014 §5.2 — player skepticism drives the engine. A clicked claim (Board
   * divergence / evidence / reconstruction fragment) issues a deterministic
   * `challenge` action carrying the factId as targetId, routed straight through
   * the engine (no LLM). doChallenge records `challenge.<factId>` to the ledger
   * and the Board refreshes against the new state.
   */
  async function challengeClaim(factId: string) {
    if (busy || !state) return;
    setBusy(true);
    try {
      const action: GameAction = {
        type: "challenge",
        targetId: factId,
        intent: { verb: "challenge", target: factId },
        raw: `challenge ${factId}`,
      };
      await runTurn(action, `> you challenge: ${factId}`);
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
        ttsEnabled={ttsEnabled}
        onToggleVoice={toggleVoice}
        onNewGame={() => setConfirmNew(true)}
        onOpenBoard={() => {
          setBoardOpen(true);
          if (state) void refreshBoard(state);
        }}
      />

      <button
        type="button"
        className={`asbtn scene-toggle${sceneOpen ? " active" : ""}`}
        onClick={() => setSceneOpen((v) => !v)}
        title="Toggle the reconstruction visual"
      >
        {sceneOpen ? "hide reconstruction" : "show reconstruction"}
      </button>

      {sceneOpen && ws && (
        <ReconstructionScene ws={ws} onChallengeClaim={challengeClaim} />
      )}

      <TravelBar
        journal={journal}
        ws={ws}
        viewingLive={viewingLive}
        onTravel={travelTo}
        onReturnToLive={returnToLive}
      />

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

      <CaseFile
        boardOpen={boardOpen}
        board={board}
        onCloseBoard={() => setBoardOpen(false)}
        evidence={evidence}
        established={established}
        ws={ws}
        meta={meta}
        commandHints={commandHints(ws)}
        onPickCommand={(c: string) => setInput(c)}
        helpOpen={helpOpen}
        onToggleHelp={() => setHelpOpen((v) => !v)}
        fileOpen={mobileTab === "board"}
        onChallengeClaim={challengeClaim}
      />

      <CommandInput
        input={input}
        busy={busy}
        onChange={setInput}
        onSend={send}
        onKey={onKey}
        inputRef={inputRef}
        affordance={affordance}
        modeHint="look · talk · ask · examine · confront · help"
      />

      {nextHint && (
        <div className="next-hint" role="status" aria-live="polite">
          <span className="next-hint-label">▸ SUGGESTED NEXT</span>
          <span className="next-hint-text">{nextHint.label}</span>
          <button
            type="button"
            className="next-hint-btn"
            onClick={() => nextHint.factId && challengeClaim(nextHint.factId)}
          >
            investigate
          </button>
        </div>
      )}

      <Toast toast={toast} />
      <TabBar
        fileOpen={mobileTab === "board"}
        onToggle={() => setMobileTab((cur) => (cur === "board" ? null : "board"))}
      />

      {confirmNew && (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-box">
            <p>Start a new game? Your current progress will be erased.</p>
            <div className="confirm-actions">
              <button type="button" className="asbtn" onClick={() => setConfirmNew(false)}>
                [cancel]
              </button>
              <button
                type="button"
                className="asbtn confirm-danger"
                onClick={() => {
                  setConfirmNew(false);
                  void startNew();
                }}
              >
                [new game]
              </button>
            </div>
          </div>
        </div>
      )}

      {chatDisclosure && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="reconstruction disclosure">
          <div className="confirm-box chat-disclosure">
            <h3>This is a reconstruction.</h3>
            <p>
              When you talk to Chris here, you are talking to an AI model voiced in
              his style — built from what he wrote. It is <strong>not Chris</strong>,
              and it cannot be. It will reflect him, joke like him, and sometimes
              lie or withhold the way the story demands. Don&apos;t mistake it for him.
            </p>
            <div className="confirm-actions">
              <button type="button" className="asbtn confirm-danger" onClick={acknowledgeChat}>
                [I understand — let me talk to him]
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function commandHints(ws: WorldState | null): string[] {
  const ep = ws?.episodeId;
  const m2: string[] = ["hypothesize your theory of Chris", "connect one fact to another", "test a hypothesis"];
  if (ep === "ep2")
    return ["look around", "talk to the feed", "ask the feed if it's really Chris", "examine the photo", "confront the feed", "help", ...m2];
  if (ep === "ep3")
    return ["look around", "talk to the feed", "ask the feed if it's really Chris", "examine the post", "confront the feed", "help", ...m2];
  if (ep === "ep4")
    return [
      "look around",
      "talk to the reconstruction",
      "ask the reconstruction if it's really Chris",
      "examine the letter",
      "examine the output log",
      "help",
      ...m2,
    ];
  return ["look around", "talk to the feed", "ask the feed if it's really Chris", "examine the post", "confront the feed", "search the room", "sleep", ...m2];
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
