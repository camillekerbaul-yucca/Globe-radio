import { useState } from "react";
import { devPatch } from "./api";
import { useNowPlaying } from "./state";
import SpotifySearch from "./SpotifySearch";

const COUNTRIES = ["Nigeria", "France", "Brazil", "Japan", "USA", "Mexico", "Ghana"];
const DECADES = ["1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s"];

export default function DevPanel() {
  const s = useNowPlaying();
  const [busy, setBusy] = useState(false);
  const [spotifyOpen, setSpotifyOpen] = useState(false);

  if (!s) return null;

  const idxC = Math.max(0, COUNTRIES.indexOf(s.country));
  const idxD = Math.max(0, DECADES.indexOf(s.decade));

  const patch = async (p) => {
    try {
      setBusy(true);
      await devPatch(p);
    } finally {
      setBusy(false);
    }
  };

  const handleSpotifyTrackSelect = (track) => {
    patch({
      artist: track.artist,
      track: track.name,
      trackId: `spotify-${track.id}`,
      coverUrl: track.image,
      country: "Spotify",
      decade: "Now",
    });
  };

  const prevCountry = () =>
    patch({
      country: COUNTRIES[(idxC - 1 + COUNTRIES.length) % COUNTRIES.length],
    });

  const nextCountry = () =>
    patch({ country: COUNTRIES[(idxC + 1) % COUNTRIES.length] });

  const prevDecade = () =>
    patch({ decade: DECADES[(idxD - 1 + DECADES.length) % DECADES.length] });

  const nextDecade = () =>
    patch({ decade: DECADES[(idxD + 1) % DECADES.length] });

  const presetFR60 = () =>
    patch({
      artist: "Georges Brassens",
      track: "Les copains d’abord",
      country: "France",
      decade: "1960s",
      trackId: "brassens-copains-1960",
      coverUrl: "https://upload.wikimedia.org/wikipedia/en/9/9b/Georges_Brassens.jpg",
    });

  return (
    <div style={st.panel}>
      <div style={st.header}>
        <div style={st.title}>DEV (hardware sim)</div>
        <div style={st.badge}>{busy ? "…" : "OK"}</div>
      </div>

      <div style={st.block}>
        <div style={st.label}>Globe (Pays)</div>
        <div style={st.row}>
          <button className="touch-btn" style={st.btn} onClick={prevCountry}>
            ◀
          </button>
          <div style={st.value} title={s.country}>
            {s.country}
          </div>
          <button className="touch-btn" style={st.btn} onClick={nextCountry}>
            ▶
          </button>
        </div>
      </div>

      <div style={st.block}>
        <div style={st.label}>Bouton (Décennie)</div>
        <div style={st.row}>
          <button className="touch-btn" style={st.btn} onClick={prevDecade}>
            ◀
          </button>
          <div style={st.value} title={s.decade}>
            {s.decade}
          </div>
          <button className="touch-btn" style={st.btn} onClick={nextDecade}>
            ▶
          </button>
        </div>
      </div>

      <div style={st.block}>
        <div style={st.label}>Track (simulate player)</div>

        <input
          style={st.input}
          value={s.artist}
          onChange={(e) => patch({ artist: e.target.value })}
          placeholder="artist"
        />
        <input
          style={st.input}
          value={s.track}
          onChange={(e) => patch({ track: e.target.value })}
          placeholder="track"
        />
        <input
          style={st.input}
          value={s.coverUrl}
          onChange={(e) => patch({ coverUrl: e.target.value })}
          placeholder="coverUrl"
        />
        <input
          style={st.input}
          value={s.trackId}
          onChange={(e) => patch({ trackId: e.target.value })}
          placeholder="trackId (important pour likes)"
        />
      </div>

      <div style={st.block}>
        <button 
          className="touch-btn" 
          style={st.btnWide}
          onClick={() => setSpotifyOpen(true)}
        >
          🎵 Spotify Search
        </button>
      </div>

      <div style={st.foot}>
        <button className="touch-btn" style={st.btnWide} onClick={presetFR60}>
          Preset FR 60s
        </button>
      </div>

      <SpotifySearch 
        isOpen={spotifyOpen} 
        onClose={() => setSpotifyOpen(false)}
        onTrackSelect={handleSpotifyTrackSelect}
      />
    </div>
  );
}

const st = {
  panel: {
    position: "fixed",
    right: 18,
    top: 18,
    width: 260,
    padding: 12,
    borderRadius: 12,
    background: "rgba(10,10,12,0.92)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "white",
    fontFamily: "system-ui",
    fontSize: 12,
    boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
    zIndex: 9999,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  title: { fontWeight: 800, opacity: 0.9 },
  badge: { fontWeight: 800, opacity: 0.8 },

  block: { marginBottom: 12 },
  label: { opacity: 0.7, marginBottom: 6, fontWeight: 700 },

  row: {
    display: "grid",
    gridTemplateColumns: "36px 1fr 36px",
    gap: 8,
    alignItems: "center",
  },
  value: {
    textAlign: "center",
    padding: "8px 10px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    fontWeight: 800,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  btn: {
    height: 34,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    touchAction: "manipulation",
  },

  input: {
    width: "100%",
    height: 34,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    padding: "0 10px",
    marginBottom: 8,
    outline: "none",
  },

  foot: { display: "flex", justifyContent: "flex-end" },

  btnWide: {
    height: 34,
    width: "100%",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
    touchAction: "manipulation",
  },
};
