import NowPlayingScreen from "./NowPlayingScreen";
import DevPanel from "./DevPanel";

export default function App() {
  const isDev = new URLSearchParams(window.location.search).has("dev");
  const useFrame = isDev || new URLSearchParams(window.location.search).has("frame");
  const pageStyle = useFrame ? styles.pageFrame : styles.pageFull;
  const frameStyle = useFrame ? styles.frameFixed : styles.frameFull;

  return (
    <div style={pageStyle}>
      <div style={frameStyle}>
        <NowPlayingScreen />
      </div>

      {isDev && <DevPanel />}
    </div>
  );
}

const styles = {
  pageFull: {
    minHeight: "100vh",
    width: "100vw",
    display: "flex",
    alignItems: "stretch",
    justifyContent: "stretch",
    background: "#000",
  },
  frameFull: {
    width: "100vw",
    height: "100vh",
    background: "#000",
    borderRadius: 0,
    overflow: "hidden",
    boxShadow: "none",
    border: "none",
    position: "relative", // <-- important pour l'overlay settings
  },
  pageFrame: {
    minHeight: "100vh",
    width: "100vw",
    display: "grid",
    placeItems: "center",
    background: "#0f0f12",
  },
  frameFixed: {
    width: 1024,
    height: 600,
    background: "#000",
    borderRadius: 18,
    overflow: "hidden",
    boxShadow: "0 20px 70px rgba(0,0,0,0.6)",
    border: "1px solid rgba(255,255,255,0.08)",
    position: "relative", // <-- important pour l'overlay settings
  },
};
