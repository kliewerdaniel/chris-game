#!/usr/bin/env python3
"""Live 4-episode playthrough through the LLM resolver (CHRIS_USE_LLM_PARSE=1).
Verifies the 4 defects found in the prior run are FIXED:
  #1 ask Chris about Sarge -> target chris (not sarge)
  #2 call mother works in ep3 (phoneUnlocked carried + reachable)
  #3 examine the letter Chris left -> note (not chris)
  #4 finale reachable: tell reconstruction -> endingId set (game winnable)
Writes scripts/playthrough-report.txt."""
import json, sys, urllib.request, urllib.error, time

BASE = "http://127.0.0.1:3204"
REP = []

def post(path, body, timeout=120):
    data = json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r), None
    except urllib.error.HTTPError as e:
        return None, f"HTTP {e.code}: {e.read().decode()[:200]}"
    except Exception as e:
        return None, str(e)[:200]

def turn(state, inp, advance=False):
    r, err = post("/api/turn", {"input": inp, "state": state, "advanceEpisode": advance})
    if err or r is None:
        return state, None, err, 0.0
    return r.get("state"), r, err, 0.0

def log(s):
    REP.append(s); print(s, flush=True)

fails = 0
def check(label, cond, detail=""):
    global fails
    status = "PASS" if cond else "FAIL"
    if not cond: fails += 1
    log(f"   [{status}] {label} {detail}")

log("=== CHRIS live re-verify (LLM resolver fixes) ===\n")

st, r, err, _ = turn("", "look around")
if err or st is None:
    log(f"FATAL: {err}"); sys.exit(1)
log(f"[START] ep={r.get('episode',{}).get('id')}")

# --- EP1: ask Chris about Sarge + unlock phone ---
st, r, err, _ = turn(st, "ask Chris about Sarge")
a = r.get("action") or {}
check("#1 ask Chris about Sarge -> target chris (not sarge)",
      a.get("type") == "ask" and a.get("targetId") == "chris",
      f"verb={a.get('type')} tgt={a.get('targetId')} ok={r.get('ok')}")
st, r, err, _ = turn(st, "examine the phone")
ws = json.loads(st); log(f"   [ep1] phoneUnlocked={ws.get('phoneUnlocked')}")
st, r, err, _ = turn(st, "get some sleep")
log(f"   [ep1 complete={r.get('episodeComplete')}]")

# --- ADVANCE ep1 -> ep2 -> ... -> ep4 ---
for _ in range(3):
    st, r, err, _ = turn(st, "", advance=True)
    if err:
        log(f"   [ADVANCE ERR] {err}"); break
log(f"[NOW] ep={json.loads(st).get('episodeId')}")

# --- EP3: call mother should now connect ---
st, r, err, _ = turn(st, "call mother on the phone")
a = r.get("action") or {}
ok = r.get("ok")
check("#2 call mother in ep3 -> ok (phoneUnlocked carried + reachable)",
      a.get("type") == "call" and ok is True,
      f"verb={a.get('type')} tgt={a.get('targetId')} ok={ok}")
# advance to ep4 (we are in ep3 now per script order)
st, r, err, _ = turn(st, "", advance=True)
log(f"[NOW] ep={json.loads(st).get('episodeId')}")

# --- EP4: examine letter -> note ; finale via tell ---
st, r, err, _ = turn(st, "examine the letter Chris left")
a = r.get("action") or {}
ev = r.get("discoveredEvidence") or []
check("#3 examine the letter Chris left -> target note (not chris)",
      a.get("targetId") == "note" and len(ev) > 0,
      f"tgt={a.get('targetId')} ev={ev}")
st, r, err, _ = turn(st, "tell the reconstruction I'm staying")
a = r.get("action") or {}
ws = json.loads(st)
check("#4 finale: tell reconstruction -> endingId set (winnable)",
      a.get("type") == "tell" and ws.get("endingId") is not None and ws.get("episodeComplete"),
      f"verb={a.get('type')} endingId={ws.get('endingId')} complete={ws.get('episodeComplete')}")

log(f"\n=== {'ALL FIXES VERIFIED' if fails==0 else str(fails)+' FAILURE(S)'} ===")
with open("scripts/playthrough-report.txt", "w") as f:
    f.write("\n".join(REP))
