"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  WorldState,
  NarrationLine,
  Evidence,
  FactStatus,
} from "@/lib/core/types";

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

const SAVE_KEY = "chris-game-save-v2";

const EPISODE_INTROS: Record<string, NarrationLine[]> = {
  ep1: [
    {
      speaker: "narrator",
      text:
        "THE NIGHT BEFORE. Sarge is dead. Chris sits across from you in a pool of lamplight, and something in the room is unsaid. You are not who you were. Neither, you suspect, is he.",
      status: "canonical",
    },
  ],
  ep2: [
    {
      speaker: "narrator",
      text:
        "THE PORCH. Years earlier. The cabin. Chris is alive, and he is teaching you to live where the systems don't reach. But you already know what he was doing the night Sarge died — and he doesn't know that you know.",
      status: "canonical",
    },
  ],
  ep3: [
    {
      speaker: "narrator",
      text:
        "THE LAST CALL. Much later. Chris is smaller in the chair than he used to be. You have built a life, a company. He lets the phone ring. Something in him is ending, and he'd rather you didn't notice.",
      status: "canonical",
    },
  ],
  ep4: [
    {
      speaker: "narrator",
      text:
        "THE REBUILD. After. You have used everything he ever wrote to stitch a reconstruction of Chris — his voice, his jokes, his cadence. It sounds like him. It is not him. On the desk, a sealed envelope in his hand: 'IF YOU BUILD THE THING.'",
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

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
        };
        setState(JSON.parse(parsed.state));
        setLog(parsed.log);
        setEvidence(parsed.evidence ?? []);
        setEstablished(parsed.established ?? []);
        setEpMeta(parsed.epMeta ?? null);
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
  }, [log, evidence, scrollToBottom]);

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
    setBusy(false);
    save(ws, intro, [], [], data.episode ?? null);
    stickRef.current = true;
    scrollToBottom(true);
  }

  function save(ws: WorldState, lg: NarrationLine[], ev: Evidence[], est: string[], meta: EpisodeMeta | null) {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ state: JSON.stringify(ws), log: lg, evidence: ev, established: est, epMeta: meta })
    );
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
      save(ws, newLog, evidence, established, data.episode ?? null);
      stickRef.current = true;
      scrollToBottom(true);
    } finally {
      setBusy(false);
    }
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
      save(
        ws,
        newLog,
        data.discoveredEvidence?.length ? [...evidence, ...data.discoveredEvidence] : evidence,
        established,
        data.episode ?? epMeta
      );
    } catch (e) {
      setToast("The connection faltered. Your progress is safe.");
    } finally {
      setBusy(false);
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
          <a onClick={startNew} style={{ cursor: "pointer" }}>
            [new game]
          </a>
        </div>
      </header>

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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={busy ? "…" : "What do you do?"}
          disabled={busy}
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
    return ["look around", "talk to Chris", "ask Chris about Sarge", "examine the axe", "examine the envelope", "help"];
  if (ep === "ep3")
    return ["look around", "talk to Chris", "ask Chris about Sarge", "examine the pills", "confront Chris", "help"];
  if (ep === "ep4")
    return [
      "look around",
      "talk to the reconstruction",
      "ask the reconstruction about Sarge",
      "examine the envelope",
      "examine the output log",
      "help",
    ];
  return ["look around", "talk to Chris", "ask Chris about Sarge", "examine the note", "confront Chris", "search the room", "sleep"];
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
