import NowPlayingScreen from "./NowPlayingScreen";
import DevPanel from "./DevPanel";

export default function App() {
  const isDev = new URLSearchParams(window.location.search).has("dev");

  return (
    <div style={styles.page}>
      <div style={styles.frame}>
        <NowPlayingScreen />
      </div>

      {isDev && <DevPanel />}
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#0f0f12",
  },
  frame: {
    width: 480,
    height: 320,
    background: "#0b0b0c",
    borderRadius: 18,
    overflow: "hidden",
    boxShadow: "0 20px 70px rgba(0,0,0,0.6)",
    border: "1px solid rgba(255,255,255,0.08)",
    position: "relative", // <-- important pour l'overlay settings
  },
};
