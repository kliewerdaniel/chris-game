"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  WorldState,
  NarrationLine,
  Evidence,
  FactStatus,
} from "@/lib/core/types";

interface TurnResponse {
  state: string;
  narration: NarrationLine[];
  ok: boolean;
  reason?: string;
  discoveredEvidence: Evidence[];
  establishedFacts: string[];
  character?: { chrisTrust?: number };
}

const SAVE_KEY = "chris-game-save-v1";

function statusClass(s?: FactStatus): string {
  if (s === "testimony") return "status-testimony";
  if (s === "canonical") return "status-canonical";
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  // Boot: resume from save or start new game.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(SAVE_KEY) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { state: string; log: NarrationLine[]; evidence: Evidence[]; established: string[] };
        setState(JSON.parse(parsed.state));
        setLog(parsed.log);
        setEvidence(parsed.evidence ?? []);
        setEstablished(parsed.established ?? []);
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

  useEffect(scrollToBottom, [log, evidence]);

  async function startNew() {
    setBusy(true);
    // Hit the API with an empty state → engine starts a new game.
    const res = await fetch("/api/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "", input: "__new__" }),
    });
    const data = (await res.json()) as TurnResponse;
    const ws: WorldState = JSON.parse(data.state);
    setState(ws);
    const intro: NarrationLine[] = [
      {
        speaker: "narrator",
        text:
          "THE NIGHT BEFORE. Sarge is dead. Chris sits across from you in a pool of lamplight, and something in the room is unsaid. You are not who you were. Neither, you suspect, is he.",
        status: "canonical",
      },
      {
        speaker: "system",
        text: "Type a command. Try: look around · talk to Chris · ask Chris about Sarge · examine the note · help",
        status: "canonical",
      },
    ];
    setLog(intro);
    setEvidence([]);
    setEstablished([]);
    setBusy(false);
    save(ws, intro, [], []);
  }

  function save(ws: WorldState, lg: NarrationLine[], ev: Evidence[], est: string[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ state: JSON.stringify(ws), log: lg, evidence: ev, established: est })
    );
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
      save(ws, newLog, data.discoveredEvidence?.length ? [...evidence, ...data.discoveredEvidence] : evidence, established);
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
  return (
    <main className="app">
      <header className="header">
        <div>
          <h1>CHRIS</h1>
          <div className="sub">a literary survival mystery · episode i: the night before</div>
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
            <div className="world-line">
              <span className="k">PHONE</span>
              <span className="v">{ws.phoneUnlocked ? "unlocked" : "locked"}</span>
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
        <div className="narrative" ref={scrollRef}>
          {log.map((l, i) => (
            <div className={`line ${l.speaker}`} key={i}>
              {l.speaker !== "player" && (
                <span className="who">
                  {l.speaker}
                  {l.status && <span className={`status-tag ${statusClass(l.status)}`}>{statusLabel(l.status)}</span>}
                </span>
              )}
              <div className="body">{l.text}</div>
            </div>
          ))}
          {ws?.episodeComplete && (
            <div className="line narrator">
              <span className="who">— end of episode i —</span>
              <div className="body">
                This is only the beginning. Chris is still alive. The note is still warm in your hand. The
                contradiction between what he said and what you found is yours to hold. <em>Who do you trust?</em>
              </div>
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
        {["look around", "talk to Chris", "ask Chris about Sarge", "examine the note", "confront Chris", "search the room", "sleep"].map(
          (c) => (
            <div className="help-row" key={c} style={{ cursor: "pointer" }} onClick={() => setInput(c)}>
              {c}
            </div>
          )
        )}
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

function fmtTime(t: { day: number; hour: number; minute: number }): string {
  const h = ((t.hour + 11) % 12) + 1;
  const ampm = t.hour < 12 ? "AM" : "PM";
  return `${h}:${t.minute.toString().padStart(2, "0")} ${ampm}`;
}
function prettyLoc(loc: string): string {
  return loc.replace(/_/g, " ");
}
