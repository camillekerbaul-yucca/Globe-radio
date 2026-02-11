// Spotify Web Playback SDK Manager
let spotifyPlayer = null;
let deviceId = null;
let isReady = false;
let accessToken = null;
let playbackStateCallback = null;
let initPromise = null;

const waitForSpotifySDK = () => {
  return new Promise((resolve) => {
    if (window.Spotify) {
      resolve();
      return;
    }

    const onReady = () => {
      resolve();
    };

    window.onSpotifyWebPlaybackSDKReady = onReady;
  });
};

const transferPlayback = async (id) => {
  if (!accessToken || !id) return false;

  const response = await fetch("https://api.spotify.com/v1/me/player", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      device_ids: [id],
      play: false,
    }),
  });

  return response.ok || response.status === 204;
};

export const initSpotifyPlayer = (token) => {
  if (initPromise) return initPromise;

  initPromise = new Promise(async (resolve, reject) => {
    await waitForSpotifySDK();

    accessToken = token;

    const player = new window.Spotify.Player({
      name: "Globe Radio Player",
      getOAuthToken: (callback) => {
        callback(token);
      },
      volume: 0.5,
    });

    // Player ready
    player.addListener("player_state_changed", (state) => {
      if (state) {
        isReady = true;
        if (playbackStateCallback) {
          playbackStateCallback(state);
        }
      }
    });

    // Player initialization error
    player.addListener("initialization_error", ({ message }) => {
      console.error("Player initialization error:", message);
      reject(new Error(message));
    });

    // Authentication error
    player.addListener("authentication_error", ({ message }) => {
      console.error("Authentication error:", message);
      reject(new Error(message));
    });

    // Account error
    player.addListener("account_error", ({ message }) => {
      console.error("Account error:", message);
      reject(new Error(message));
    });

    // Ready to use
    player.addListener("ready", ({ device_id }) => {
      console.log("✓ Spotify player ready with device_id:", device_id);
      deviceId = device_id;
      spotifyPlayer = player;
      isReady = true;

      // Transfer playback so Spotify registers the device
      transferPlayback(device_id)
        .then(() => resolve(device_id))
        .catch((error) => {
          console.warn("Playback transfer failed:", error);
          resolve(device_id);
        });
    });

    // Connect to the player
    player.connect().catch((err) => {
      reject(err);
    });
  });

  return initPromise;
};

export const playTrack = async (trackUri) => {
  if (!isReady || !deviceId || !accessToken) {
    throw new Error("Spotify player not ready");
  }

  try {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          uris: [trackUri],
        }),
      }
    );

    // 404 means device not found - retry after a brief delay
    if (response.status === 404) {
      console.warn("Device not found on first attempt, retrying...");
      await transferPlayback(deviceId);
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      const retryResponse = await fetch(
        `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            uris: [trackUri],
          }),
        }
      );

      if (!retryResponse.ok && retryResponse.status !== 204) {
        const error = await retryResponse.json();
        throw new Error(
          error.error?.message || `Failed to play track (${retryResponse.status})`
        );
      }
      return true;
    }

    if (!response.ok && response.status !== 204) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to play track");
    }

    return true;
  } catch (error) {
    console.error("Error playing track:", error);
    throw error;
  }
};

export const pausePlayback = async () => {
  if (!isReady || !deviceId || !accessToken) {
    throw new Error("Spotify player not ready");
  }

  try {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 204) {
      throw new Error("Failed to pause playback");
    }

    return true;
  } catch (error) {
    console.error("Error pausing playback:", error);
    throw error;
  }
};

export const resumePlayback = async () => {
  if (!isReady || !deviceId || !accessToken) {
    throw new Error("Spotify player not ready");
  }

  try {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 204) {
      throw new Error("Failed to resume playback");
    }

    return true;
  } catch (error) {
    console.error("Error resuming playback:", error);
    throw error;
  }
};

export const skipToNext = async () => {
  if (!isReady || !deviceId || !accessToken) {
    throw new Error("Spotify player not ready");
  }

  try {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/next?device_id=${deviceId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 204) {
      throw new Error("Failed to skip track");
    }

    return true;
  } catch (error) {
    console.error("Error skipping track:", error);
    throw error;
  }
};

export const skipToPrevious = async () => {
  if (!isReady || !deviceId || !accessToken) {
    throw new Error("Spotify player not ready");
  }

  try {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/previous?device_id=${deviceId}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 204) {
      throw new Error("Failed to skip to previous");
    }

    return true;
  } catch (error) {
    console.error("Error skipping to previous:", error);
    throw error;
  }
};

export const setVolume = (volume) => {
  if (spotifyPlayer) {
    spotifyPlayer.setVolume(Math.max(0, Math.min(1, volume)));
  }
};

export const seek = async (positionMs) => {
  if (!isReady || !deviceId || !accessToken) {
    throw new Error("Spotify player not ready");
  }

  try {
    const response = await fetch(
      `https://api.spotify.com/v1/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok && response.status !== 204) {
      throw new Error("Failed to seek");
    }

    return true;
  } catch (error) {
    console.error("Error seeking:", error);
    throw error;
  }
};

export const onPlaybackStateChanged = (callback) => {
  playbackStateCallback = callback;
};

export const isPlayerReady = () => isReady;

export const getDeviceId = () => deviceId;

export const disconnect = () => {
  if (spotifyPlayer) {
    spotifyPlayer.disconnect();
    spotifyPlayer = null;
    deviceId = null;
    isReady = false;
  }
};
