const HTTP = "http://localhost:8000";
const WS = "ws://localhost:8000/ws";

export async function fetchState() {
  const r = await fetch(`${HTTP}/api/state`);
  if (!r.ok) throw new Error("GET /api/state failed");
  return await r.json();
}

export async function postLike(trackId, liked, trackUri = null) {
  const r = await fetch(`${HTTP}/api/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trackId, liked, trackUri }),
  });
  if (!r.ok) throw new Error("POST /api/like failed");
}

export async function devPatch(patch) {
  const r = await fetch(`${HTTP}/api/dev/patch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("POST /api/dev/patch failed");
  return await r.json();
}

export function openWS(onState) {
  const ws = new WebSocket(WS);
  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg.type === "state") onState(msg.state);
    } catch (e) {
      console.error("Failed to parse WebSocket message:", e);
    }
  };
  ws.onerror = (evt) => {
    console.error("WebSocket error:", evt);
  };
  ws.onclose = () => {
    console.log("WebSocket disconnected");
  };
  return ws;
}
