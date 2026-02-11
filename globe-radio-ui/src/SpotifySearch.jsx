import React, { useState, useEffect } from "react";
import { setNowPlaying } from "./state";
import { initSpotifyPlayer, playTrack, isPlayerReady } from "./spotifyPlayer";

export default function SpotifySearch({ onTrackSelect, isOpen, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    // Check for Spotify auth success in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get("spotify_auth") === "success") {
      setAuthMessage("✓ Spotify authenticated successfully!");
      // Remove the param from URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Check auth status after a brief delay
      setTimeout(checkSpotifyAuth, 500);
    } else {
      checkSpotifyAuth();
    }
  }, []);

  const checkSpotifyAuth = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/spotify/status");
      const data = await res.json();
      setIsAuthenticated(data.authenticated && data.available);
      
      // Initialize Spotify player if authenticated
      if (data.authenticated && data.access_token) {
        try {
          await initSpotifyPlayer(data.access_token);
          console.log("✓ Spotify player initialized");
        } catch (error) {
          console.error("Failed to initialize Spotify player:", error);
          // Continue anyway, but playback won't work
        }
      }
    } catch (error) {
      console.error("Error checking Spotify auth:", error);
      setIsAuthenticated(false);
    }
  };

  const fetchDevices = async () => {
    // Devices are no longer needed for local preview playback
  };

  const handleLogin = () => {
    window.location.href = "http://localhost:8000/api/spotify/login";
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/spotify/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 10 }),
      });

      if (res.status === 401) {
        setIsAuthenticated(false);
        alert("Please log in to Spotify first");
        return;
      }

      if (!res.ok) {
        const error = await res.json();
        console.error("Search error:", error);
        alert(`Search failed: ${error.error || 'Unknown error'}`);
        return;
      }

      const data = await res.json();
      setResults(data.tracks || []);
    } catch (error) {
      console.error("Search error:", error);
      alert(`Network error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayTrack = async (track) => {
    if (!isPlayerReady()) {
      alert("Spotify player not ready. Please make sure you have a Premium account and the player has finished loading.");
      return;
    }

    try {
      // Play the track via Spotify Web Playback SDK
      await playTrack(track.uri);
      
      // Update app state with track info
      setNowPlaying({
        track: track.name,
        artist: track.artist,
        album: track.album,
        coverUrl: track.image,
        streamUrl: null, // Full track, not preview
        trackId: track.id,
        trackUri: track.uri,
        source: "spotify",
        liked: false,
      });

      onTrackSelect(track);
      onClose();
    } catch (error) {
      console.error("Error playing track:", error);
      // Provide specific error messages
      if (error.message.includes("not ready")) {
        alert("Player not ready. Make sure you're a Spotify Premium member.");
      } else if (error.message.includes("Device not found")) {
        alert("Device temporarily unavailable. Please try again.");
      } else {
        alert(`Failed to play track: ${error.message}`);
      }
    }
  };

  // Re-check auth status when modal opens
  useEffect(() => {
    if (isOpen) {
      setAuthMessage(""); // Clear old messages
      checkSpotifyAuth();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Spotify Search</h2>
          <button style={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Device selection no longer needed for local preview playback */}

        {!isAuthenticated ? (
          <div style={styles.loginSection}>
            {authMessage && (
              <p style={styles.successMsg}>{authMessage}</p>
            )}
            <p style={styles.loginText}>Connect to Spotify to search and play tracks</p>
            <button style={styles.loginBtn} onClick={handleLogin}>
              Login with Spotify
            </button>
            <p style={styles.smallText}>
              Note: Make sure your Client Secret is set in the .env file on your server
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleSearch} style={styles.searchForm}>
              <input
                type="text"
                placeholder="Search artist, song, album..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={styles.input}
              />
              <button type="submit" style={styles.searchBtn} disabled={loading}>
                {loading ? "Searching..." : "Search"}
              </button>
            </form>

            <div style={styles.resultsContainer}>
              {results.length === 0 && query && !loading && (
                <p style={styles.noResults}>No results found</p>
              )}

              {results.map((track) => (
                <div key={track.id} style={styles.trackItem}>
                  <div style={styles.trackImage}>
                    {track.image && (
                      <img src={track.image} alt={track.name} style={{ width: "100%", height: "100%" }} />
                    )}
                  </div>
                  <div style={styles.trackInfo}>
                    <div style={styles.trackName}>{track.name}</div>
                    <div style={styles.trackArtist}>{track.artist}</div>
                    <div style={styles.trackAlbum}>{track.album}</div>
                  </div>
                  <button
                    style={styles.playBtn}
                    onClick={() => handlePlayTrack(track)}
                  >
                    ▶
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#1a1a1e",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 500,
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    border: "1px solid rgba(255, 255, 255, 0.1)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    margin: 0,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#888",
    fontSize: 24,
    cursor: "pointer",
    padding: 0,
  },
  loginSection: {
    textAlign: "center",
    padding: "40px 20px",
  },
  loginText: {
    color: "#aaa",
    marginBottom: 20,
    fontSize: 14,
  },
  loginBtn: {
    background: "#1DB954",
    color: "#fff",
    border: "none",
    padding: "10px 30px",
    borderRadius: 25,
    fontSize: 16,
    cursor: "pointer",
    fontWeight: "bold",
  },
  searchForm: {
    display: "flex",
    gap: 10,
    marginBottom: 15,
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    background: "#252530",
    color: "#fff",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    borderRadius: 4,
    fontSize: 14,
  },
  searchBtn: {
    background: "#1DB954",
    color: "#fff",
    border: "none",
    padding: "8px 20px",
    borderRadius: 4,
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: 12,
  },
  resultsContainer: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  trackItem: {
    display: "flex",
    gap: 12,
    padding: 10,
    background: "#252530",
    borderRadius: 6,
    alignItems: "center",
  },
  trackImage: {
    width: 50,
    height: 50,
    flexShrink: 0,
    borderRadius: 4,
    background: "#333",
    overflow: "hidden",
  },
  trackInfo: {
    flex: 1,
    minWidth: 0,
  },
  trackName: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "bold",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  trackArtist: {
    color: "#aaa",
    fontSize: 11,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  trackAlbum: {
    color: "#888",
    fontSize: 10,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  playBtn: {
    background: "#1DB954",
    color: "#fff",
    border: "none",
    width: 40,
    height: 40,
    borderRadius: "50%",
    cursor: "pointer",
    fontSize: 16,
    flexShrink: 0,
  },
  noResults: {
    color: "#888",
    textAlign: "center",
    padding: "40px 20px",
  },
  smallText: {
    color: "#888",
    fontSize: 11,
    marginTop: 10,
  },
  successMsg: {
    color: "#1DB954",
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 15,
    padding: "10px",
    background: "rgba(29, 185, 84, 0.1)",
    borderRadius: 4,
    border: "1px solid rgba(29, 185, 84, 0.3)",
  },
};
