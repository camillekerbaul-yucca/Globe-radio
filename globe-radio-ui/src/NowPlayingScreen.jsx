import { useEffect, useRef, useState } from "react";
import { useNowPlaying, setNowPlaying } from "./state";
import { postLike } from "./api";
import {
  isPlayerReady,
  pausePlayback,
  resumePlayback,
  skipToNext,
  skipToPrevious,
  onPlaybackStateChanged,
} from "./spotifyPlayer";

import placeholderCover from "./assets/cover-placeholder.png";

// Icons (PNG) in src/assets/icones
import likeIcon from "./assets/icones/like-icone.png";
import likedIcon from "./assets/icones/liked-icone.png";
import playIcon from "./assets/icones/play-icone.png";
import pauseIcon from "./assets/icones/pause-icone.png";
import playlistIcon from "./assets/icones/playlist-icone.png";
import previousIcon from "./assets/icones/previous-icone.png";
import nextIcon from "./assets/icones/next-icon.png";
import settingsIcon from "./assets/icones/settings-icon.png";
import wifiIcon from "./assets/icones/wifi-icone.png";

export default function NowPlayingScreen() {
  const state = useNowPlaying();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [showSpotifyQr, setShowSpotifyQr] = useState(false);
  const [spotifyHostOverride, setSpotifyHostOverride] = useState("");

  const audioARef = useRef(null);
  const audioBRef = useRef(null);
  const activeRef = useRef(0); // 0 => A is considered active, 1 => B

  const fadeRAF = useRef(null);

  const artist = state?.artist ?? "—";
  const track = state?.track ?? "Chargement…";
  const country = state?.country ?? "—";
  const decade = state?.decade ?? "—";

  const rawCover = state?.coverUrl || "";
  const coverUrl = rawCover
    ? rawCover.startsWith("http")
      ? rawCover
      : `http://localhost:8000${rawCover}`
    : placeholderCover;

  const liked = Boolean(state?.liked);
  const trackId = state?.trackId ?? "loading";
  const trackUri = state?.trackUri ?? null;

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const getActiveAudio = () => {
    const aA = audioARef.current;
    const aB = audioBRef.current;
    if (!aA || !aB) return null;
    return activeRef.current === 0 ? aA : aB;
  };

  const anyAudioPlaying = () => {
    const aA = audioARef.current;
    const aB = audioBRef.current;
    return Boolean((aA && !aA.paused) || (aB && !aB.paused));
  };

  const cancelFade = () => {
    if (fadeRAF.current) {
      cancelAnimationFrame(fadeRAF.current);
      fadeRAF.current = null;
    }
  };

  const rampVolume = (audioEl, fromVol, toVol, durationMs) => {
    return new Promise((resolve) => {
      if (!durationMs || durationMs <= 0) {
        audioEl.volume = Math.max(0, Math.min(1, toVol));
        resolve();
        return;
      }

      const startTime = performance.now();
      const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        let vol = fromVol + (toVol - fromVol) * progress;
        vol = Math.max(0, Math.min(1, vol));
        audioEl.volume = vol;

        if (progress < 1) {
          fadeRAF.current = requestAnimationFrame(animate);
        } else {
          fadeRAF.current = null;
          resolve();
        }
      };

      fadeRAF.current = requestAnimationFrame(animate);
    });
  };

  // Crossfade playback when streamUrl changes
  useEffect(() => {
    const streamUrl = state?.streamUrl || "";
    if (!streamUrl) return;

    const absolute = streamUrl.startsWith("http")
      ? streamUrl
      : `http://localhost:8000${streamUrl}`;

    const aA = audioARef.current;
    const aB = audioBRef.current;
    if (!aA || !aB) return;

    cancelFade();

    const from = activeRef.current === 0 ? aA : aB;
    const to = activeRef.current === 0 ? aB : aA;

    const fromSrc = from.currentSrc || from.src || "";
    if (fromSrc === absolute && !from.paused) return;

    to.pause();
    to.src = absolute;
    to.currentTime = 0;
    to.volume = 0;

    const FADE_IN_MS = 900;
    const FADE_OUT_MS = 900;
    const TARGET_VOL = 1.0;

    to.play()
      .then(async () => {
        // Once play succeeds, we consider the system "playing"
        setIsPlaying(true);

        const inP = rampVolume(to, 0, TARGET_VOL, FADE_IN_MS);

        const outP = from.paused
          ? Promise.resolve()
          : rampVolume(from, from.volume ?? TARGET_VOL, 0, FADE_OUT_MS).then(
              () => {
                from.pause();
              }
            );

        await Promise.all([inP, outP]);
        activeRef.current = activeRef.current === 0 ? 1 : 0;
      })
      .catch(() => {
        // autoplay blocked until user gesture
        setIsPlaying(anyAudioPlaying());
      });

    return () => cancelFade();
  }, [state?.streamUrl]);

  // Track time updates + play/pause state from BOTH audios
  useEffect(() => {
    const aA = audioARef.current;
    const aB = audioBRef.current;
    if (!aA || !aB) return;

    const updateFrom = (audio) => {
      setCurrentTime(audio.currentTime || 0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };

    const syncPlaying = () => setIsPlaying(anyAudioPlaying());

    const onTimeA = () => updateFrom(aA);
    const onTimeB = () => updateFrom(aB);

    aA.addEventListener("timeupdate", onTimeA);
    aA.addEventListener("loadedmetadata", onTimeA);
    aB.addEventListener("timeupdate", onTimeB);
    aB.addEventListener("loadedmetadata", onTimeB);

    aA.addEventListener("play", syncPlaying);
    aA.addEventListener("pause", syncPlaying);
    aA.addEventListener("ended", syncPlaying);

    aB.addEventListener("play", syncPlaying);
    aB.addEventListener("pause", syncPlaying);
    aB.addEventListener("ended", syncPlaying);

    // initialize
    syncPlaying();

    return () => {
      aA.removeEventListener("timeupdate", onTimeA);
      aA.removeEventListener("loadedmetadata", onTimeA);
      aB.removeEventListener("timeupdate", onTimeB);
      aB.removeEventListener("loadedmetadata", onTimeB);

      aA.removeEventListener("play", syncPlaying);
      aA.removeEventListener("pause", syncPlaying);
      aA.removeEventListener("ended", syncPlaying);

      aB.removeEventListener("play", syncPlaying);
      aB.removeEventListener("pause", syncPlaying);
      aB.removeEventListener("ended", syncPlaying);
    };
  }, []);

  // Subscribe to Spotify playback state changes
  useEffect(() => {
    if (!isPlayerReady()) return;

    const handlePlaybackStateChange = (state) => {
      if (state) {
        setIsPlaying(!state.paused);
        setCurrentTime(state.position);
        setDuration(state.duration);
      }
    };

    onPlaybackStateChanged(handlePlaybackStateChange);
  }, []);

  const toggleLike = async () => {
    if (!state) return;
    const next = !liked;

    setPulse(true);
    setTimeout(() => setPulse(false), 240);

    setNowPlaying({ liked: next });
    try {
      await postLike(trackId, next, trackUri);
    } catch {
      setNowPlaying({ liked: !next });
    }
  };

  const handlePrevious = async () => {
    if (!isPlayerReady()) {
      console.warn("Spotify player not ready");
      return;
    }
    try {
      await skipToPrevious();
    } catch (error) {
      console.error("Error skipping to previous:", error);
    }
  };

  const handleNext = async () => {
    if (!isPlayerReady()) {
      console.warn("Spotify player not ready");
      return;
    }
    try {
      await skipToNext();
    } catch (error) {
      console.error("Error skipping to next:", error);
    }
  };

  const handlePlayPause = async () => {
    if (!isPlayerReady()) {
      console.warn("Spotify player not ready");
      return;
    }

    try {
      if (isPlaying) {
        await pausePlayback();
        setIsPlaying(false);
      } else {
        await resumePlayback();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error("Error toggling playback:", error);
    }
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;
  const remainingTime = duration ? duration - currentTime : 0;
  
  // Determine the proper host and protocol for Spotify
  // - Always use HTTPS since backend runs on HTTPS (with self-signed certs on Pi)
  const isLocalhost = !spotifyHostOverride && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const spotifyHost = spotifyHostOverride || window.location.hostname || "localhost";
  const spotifyProtocol = "https";  // Always HTTPS since backend runs on HTTPS
  const spotifyLoginUrl = `${spotifyProtocol}://${spotifyHost}:8000/api/spotify/login`;
  const spotifyQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
    spotifyLoginUrl
  )}`;
  const isLocalhostHost = spotifyHost === "localhost" || spotifyHost === "127.0.0.1";

  const checkSpotifyStatus = async () => {
    try {
      // Use detected host or fall back to localhost
      const hostToCheck = spotifyHostOverride || "localhost";
      const protocol = "https";  // Always HTTPS since backend runs on HTTPS
      const res = await fetch(`${protocol}://${hostToCheck}:8000/api/spotify/status`);
      if (!res.ok) {
        setSpotifyConnected(false);
        return;
      }
      const data = await res.json();
      setSpotifyConnected(Boolean(data.authenticated && data.available));
    } catch {
      setSpotifyConnected(false);
    }
  };

  const fetchHostInfo = async () => {
    try {
      // Only fetch LAN IP if not on localhost development
      const currentHost = window.location.hostname || "localhost";
      if (currentHost === "localhost" || currentHost === "127.0.0.1") {
        // Development mode on localhost - don't try to fetch LAN IP
        console.log("ℹ Running on localhost (dev mode) - using localhost for Spotify redirect");
        return;
      }
      
      // On Pi or other network host - fetch the detected LAN IP
      const apiBase = `http://${currentHost}:8000`;
      const res = await fetch(`${apiBase}/api/hostinfo`);
      if (!res.ok) return;
      const data = await res.json();
      
      if (data.lan_ip) {
        console.log(`✓ Fetched LAN IP from server: ${data.lan_ip}`);
        setSpotifyHostOverride(data.lan_ip);
      }
    } catch (err) {
      console.log(`ℹ Host info fetch failed:`, err);
      // Ignore host info failures - will fall back to window.location.hostname
    }
  };

  const handleSpotifyClick = async () => {
    if (spotifyConnected) {
      try {
        await fetch("http://localhost:8000/api/spotify/logout");
      } finally {
        await checkSpotifyStatus();
      }
      return;
    }

    setShowSpotifyQr(true);
  };

  const handleOpenLoginHere = () => {
    window.location.href = spotifyLoginUrl;
  };

  const handleCopyLoginLink = async () => {
    try {
      await navigator.clipboard.writeText(spotifyLoginUrl);
    } catch {
      // Ignore clipboard errors on locked-down devices
    }
  };

  useEffect(() => {
    checkSpotifyStatus();
    fetchHostInfo();

    const onFocus = () => checkSpotifyStatus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <div style={s.root}>
      <audio ref={audioARef} preload="auto" onEnded={() => handleNext()} />
      <audio ref={audioBRef} preload="auto" onEnded={() => handleNext()} />

      {/* STATUS (top bar) */}
      <div style={s.statusBar}>
        <div style={s.statusLeft}>
          <button
            type="button"
            onClick={handleSpotifyClick}
            style={s.spotifyIconButton}
            aria-label={
              spotifyConnected ? "Spotify connected" : "Spotify not connected"
            }
            title={spotifyConnected ? "Spotify connected" : "Connect Spotify"}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden="true"
              style={{
                display: "block",
                color: spotifyConnected ? "#1db954" : "#e24b4b",
              }}
            >
              <path
                fill="currentColor"
                d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.637 14.547a.75.75 0 0 1-1.03.256c-2.824-1.726-6.384-2.116-10.58-1.16a.75.75 0 1 1-.335-1.462c4.6-1.05 8.544-.6 11.637 1.29a.75.75 0 0 1 .308 1.076zm1.472-2.596a.9.9 0 0 1-1.237.303c-3.234-1.988-8.163-2.565-11.983-1.403a.9.9 0 1 1-.522-1.722c4.36-1.324 9.795-.67 13.49 1.604a.9.9 0 0 1 .252 1.218zm.126-2.707c-3.71-2.204-9.839-2.409-13.38-1.323a1.05 1.05 0 0 1-.615-2.008c4.066-1.244 10.828-1.003 15.11 1.548a1.05 1.05 0 0 1-1.115 1.783z"
              />
            </svg>
          </button>
        </div>
        <div style={s.statusRight}>
          <img src={wifiIcon} alt="wifi" style={s.statusIcon} draggable={false} />
        </div>
      </div>

      <div style={s.mainContent}>
        <div style={s.coverWrap}>
          <img
            key={coverUrl}
            src={coverUrl}
            alt="Pochette"
            style={s.cover}
            draggable={false}
            onError={(e) => (e.currentTarget.src = placeholderCover)}
          />
        </div>

        <div style={s.titleSection}>
          <div style={s.titleMarquee}>
            <div style={s.titleMarqueeInner}>
              <span style={s.titleText}>{track} - {artist}</span>
              <span style={s.titleText} aria-hidden="true">
                {track} - {artist}
              </span>
            </div>
          </div>
        </div>

        <div style={s.pillSection}>
          <div style={s.pill}>
            <span style={s.pillValue}>{country}</span>
          </div>

          <button
            onClick={toggleLike}
            disabled={!state}
            style={s.likeButton}
            className={pulse ? "heart-pulse" : ""}
            aria-label={liked ? "Unlike" : "Like"}
          >
            <img
              src={liked ? likedIcon : likeIcon}
              alt={liked ? "Unlike" : "Like"}
              style={s.likeButtonImg}
              draggable={false}
            />
          </button>

          <div style={s.pill}>
            <span style={s.pillValue}>{decade}</span>
          </div>
        </div>

        <div style={s.progressSection}>
          <span style={s.progressTime}>{formatTime(currentTime)}</span>
          <div style={s.progressBar}>
            <div style={{ ...s.progressFill, width: `${progressPercent}%` }} />
          </div>
          <span style={s.progressTime}>-{formatTime(remainingTime)}</span>
        </div>

        <div style={s.controlsSection}>
          <button style={s.miniButton} className="touch-btn" aria-label="playlist">
            <img
              src={playlistIcon}
              alt="playlist"
              style={s.controlIcon}
              draggable={false}
            />
          </button>

          <button
            onClick={handlePrevious}
            style={s.controlButton}
            className="touch-btn"
            aria-label="previous"
          >
            <img
              src={previousIcon}
              alt="previous"
              style={s.controlIcon}
              draggable={false}
            />
          </button>

          <button
            onClick={handlePlayPause}
            disabled={!isPlayerReady()}
            style={{
              ...s.playButton,
              opacity: isPlayerReady() ? 1 : 0.5,
              cursor: isPlayerReady() ? "pointer" : "not-allowed",
            }}
            className="touch-btn"
            aria-label={isPlaying ? "pause" : "play"}
          >
            <img
              src={isPlaying ? pauseIcon : playIcon}
              alt={isPlaying ? "pause" : "play"}
              style={s.playIcon}
              draggable={false}
            />
          </button>

          <button
            onClick={handleNext}
            style={s.controlButton}
            className="touch-btn"
            aria-label="next"
          >
            <img src={nextIcon} alt="next" style={s.controlIcon} draggable={false} />
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            style={s.controlButton}
            className="touch-btn"
            aria-label="settings"
          >
            <img
              src={settingsIcon}
              alt="settings"
              style={s.controlIcon}
              draggable={false}
            />
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div style={s.overlay} onClick={() => setSettingsOpen(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>Paramètres</div>
              <button onClick={() => setSettingsOpen(false)} style={s.closeButton}>
                ✕
              </button>
            </div>

            <div style={s.modalBody}>
              <Row label="Wi-Fi" value="(plus tard)" />
              <Row label="Volume" value="(plus tard)" />
              <Row label="Mode debug" value="ON" />
            </div>

            <div style={s.modalFooter}>
              <button onClick={() => setSettingsOpen(false)} style={s.secondaryButton}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {showSpotifyQr && (
        <div style={s.overlay} onClick={() => setShowSpotifyQr(false)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>Connect Spotify</div>
              <button onClick={() => setShowSpotifyQr(false)} style={s.closeButton}>
                ✕
              </button>
            </div>

            <div style={s.modalBody}>
              <div style={s.qrWrap}>
                <img src={spotifyQrUrl} alt="Spotify login QR" style={s.qrImg} />
              </div>
              <div style={s.qrText}>Scan with your phone to connect.</div>
              {isLocalhostHost && (
                <div style={s.qrHint}>
                  This device is using localhost. Use your computer's LAN IP
                  instead so your phone can reach the server.
                </div>
              )}
              {!isLocalhostHost && (
                <div style={s.qrHint}>
                  Login link: {spotifyLoginUrl}
                </div>
              )}
            </div>

            <div style={s.modalFooter}>
              <button onClick={handleCopyLoginLink} style={s.secondaryButton}>
                Copy link
              </button>
              <button onClick={handleOpenLoginHere} style={s.primaryButton}>
                Open here
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={s.row}>
      <div style={s.rowLabel}>{label}</div>
      <div style={s.rowValue}>{value}</div>
    </div>
  );
}

const s = {
  root: {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    color: "rgba(255,255,255,0.92)",
    fontFamily:
      "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    userSelect: "none",
    background: "#000",
    padding: 12,
    boxSizing: "border-box",
    position: "relative",
    justifyContent: "center",
    overflow: "hidden",
  },
  statusBar: {
    position: "absolute",
    top: 8,
    left: 12,
    right: 12,
    height: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    pointerEvents: "auto",
    opacity: 0.92,
  },
  statusLeft: { display: "flex", alignItems: "center" },
  statusRight: { display: "flex", alignItems: "center", gap: 8 },
  statusIcon: { width: 16, height: 16, objectFit: "contain" },
  spotifyIconButton: {
    width: 24,
    height: 24,
    display: "grid",
    placeItems: "center",
    background: "transparent",
    border: "none",
    padding: 0,
  },

  mainContent: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    flex: 1,
    justifyContent: "center",
  },

  coverWrap: {
    width: 100,
    height: 100,
    borderRadius: 8,
    overflow: "hidden",
    background: "#e6e6e6",
    flex: "0 0 auto",
    marginTop: 3,
  },
  cover: { width: "100%", height: "100%", objectFit: "cover" },

  titleSection: { textAlign: "center", width: "100%" },
  titleMarquee: {
    width: "100%",
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  titleMarqueeInner: {
    display: "inline-flex",
    gap: 24,
    alignItems: "center",
    animation: "titleMarquee 12s linear infinite",
  },
  titleText: {
    fontSize: 18,
    fontWeight: 500,
    lineHeight: 1.2,
    color: "rgba(255,255,255,0.95)",
  },

  pillSection: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
  },
  pill: {
    width: 110,
    height: 26,
    borderRadius: 16,
    background: "#6c6c6c",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.95,
    flexShrink: 0,
  },
  pillValue: { fontSize: 14, fontWeight: 500, color: "#fff" },

  likeButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
  },
  likeButtonImg: { width: 40, height: 40, objectFit: "contain" },

  progressSection: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    maxWidth: 360,
  },
  progressTime: {
    fontSize: 10,
    fontWeight: 600,
    color: "#9a9a9a",
    minWidth: 24,
    textAlign: "center",
  },
  progressBar: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    background: "#2b2b2b",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#00cfe8",
    borderRadius: 999,
    transition: "width 0.1s linear",
  },

  controlsSection: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    width: "100%",
    marginTop: 2,
  },
  miniButton: {
    width: 32,
    height: 32,
    borderRadius: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    padding: 0,
    flexShrink: 0,
  },
  controlIcon: { width: 18, height: 18, objectFit: "contain" },
  playIcon: { width: 32, height: 32, objectFit: "contain" },

  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    flexShrink: 0,
  },
  playButton: {
    width: 46,
    height: 46,
    borderRadius: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "grid",
    placeItems: "center",
    zIndex: 1000,
  },
  modal: {
    width: 320,
    borderRadius: 12,
    background: "rgba(20,20,24,0.96)",
    border: "1px solid rgba(255,255,255,0.12)",
    overflow: "hidden",
    boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
  },
  modalHeader: {
    padding: "12px 14px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  modalTitle: { fontWeight: 700, fontSize: 15, color: "rgba(255,255,255,0.9)" },
  primaryButton: {
    padding: "8px 14px",
    borderRadius: 8,
    background: "rgba(0,207,232,0.18)",
    border: "1px solid rgba(0,207,232,0.35)",
    color: "rgba(255,255,255,0.95)",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 12,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: "none",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.8)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  modalBody: { padding: 12, display: "flex", flexDirection: "column", gap: 7 },
  modalFooter: {
    padding: 12,
    borderTop: "1px solid rgba(255,255,255,0.08)",
    display: "flex",
    justifyContent: "flex-end",
    gap: 7,
  },
  secondaryButton: {
    padding: "8px 14px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.9)",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 12,
  },
  qrWrap: {
    width: 180,
    height: 180,
    borderRadius: 10,
    background: "#fff",
    display: "grid",
    placeItems: "center",
    alignSelf: "center",
  },
  qrImg: { width: 160, height: 160 },
  qrText: {
    textAlign: "center",
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    marginTop: 8,
  },
  qrHint: {
    textAlign: "center",
    color: "rgba(255,255,255,0.6)",
    fontSize: 11,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 10px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  rowLabel: { opacity: 0.7, fontWeight: 600, fontSize: 12 },
  rowValue: { fontWeight: 700, fontSize: 12, color: "rgba(255,255,255,0.9)" },
};
