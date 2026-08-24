import json, urllib.request
BASE="http://127.0.0.1:3204"
def post(path, body):
    data=json.dumps(body).encode()
    req=urllib.request.Request(BASE+path, data=data, headers={"Content-Type":"application/json"})
    return json.load(urllib.request.urlopen(req, timeout=120))
st=post("/api/turn",{"input":"look around","state":""})["state"]
st=post("/api/turn",{"input":"examine the phone","state":st})["state"]
st=post("/api/turn",{"input":"get some sleep","state":st})["state"]
for _ in range(3):
    st=post("/api/turn",{"input":"","state":st,"advanceEpisode":True})["state"]
for u in ["tell the reconstruction I'm staying","tell Chris I'm staying","tell him I'm staying"]:
    r=post("/api/turn",{"input":u,"state":st})
    a=r.get("action") or {}
    ws2=json.loads(r["state"])
    print("UTT:",u)
    print("  verb:",a.get("type"),"target:",repr(a.get("targetId")),"topic:",a.get("topicId"),"ok:",r.get("ok"))
    print("  endingId:",ws2.get("endingId"),"complete:",ws2.get("episodeComplete"))
    print("  narr:",[n.get("text","")[:60] for n in r.get("narration",[])][:1])
