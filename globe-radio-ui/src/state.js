import { useEffect, useState } from "react";
import { fetchState, openWS } from "./api";

let state = null;
let listeners = [];
let ws = null;

function notify() {
  listeners.forEach((l) => l());
}

export function useNowPlaying() {
  const [, force] = useState(0);

  useEffect(() => {
    const l = () => force((v) => v + 1);
    listeners.push(l);

    // init state + ws une seule fois
    if (!state) {
      fetchState()
        .then((s) => {
          state = s;
          notify();
        })
        .catch(() => {
          state = {
            artist: "—",
            track: "Backend offline",
            country: "—",
            decade: "—",
            coverUrl: "",
            trackId: "offline",
            trackUri: null,
            liked: false,
          };
          notify();
        });
    }

    if (!ws) {
      ws = openWS((next) => {
        state = next;
        notify();
      });
    }

    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  return state;
}

// pour que l'UI fasse une maj optimiste si besoin
export function setNowPlaying(patch) {
  if (!state) return;
  state = { ...state, ...patch };
  notify();
}
