from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, HTMLResponse
from pydantic import BaseModel
import json
import random
import mimetypes
from mutagen.mp3 import MP3
from mutagen.id3 import ID3NoHeaderError
from pathlib import Path
import os
import sys
import socket
from dotenv import load_dotenv
import ssl

# Force add venv site-packages to path
venv_site_packages = Path(__file__).parent.parent / ".venv" / "Lib" / "site-packages"
if venv_site_packages.exists():
    sys.path.insert(0, str(venv_site_packages))

# Load environment variables from .env file in the same directory as this script
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

print(f"Python: {sys.executable}")
print(f"Python version: {sys.version}")
print(f"Site-packages: {venv_site_packages}")
print(f"Loading .env from: {env_path}")

try:
    import spotipy
    from spotipy.oauth2 import SpotifyOAuth
    SPOTIFY_AVAILABLE = True
    print("✓ Spotipy imported successfully")
except Exception as e:
    SPOTIFY_AVAILABLE = False
    print(f"✗ Failed to import spotipy: {e}")
    import traceback
    traceback.print_exc()

app = FastAPI()

def get_lan_ip() -> str | None:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except Exception:
        return None

# UI Vite tourne sur 5173
# Allow CORS from localhost, LAN IP, and any origin for development
cors_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://192.168.1.64:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Spotify configuration
SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID", "711d2c87130243d6b5acc63a6f991846")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET", "")
SPOTIFY_BACKEND_BASE_URL = os.getenv("SPOTIFY_BACKEND_BASE_URL", "https://localhost:8000")
SPOTIFY_FRONTEND_BASE_URL = os.getenv("SPOTIFY_FRONTEND_BASE_URL", "http://localhost:5173")
SPOTIFY_AUTH_SUCCESS_URL = os.getenv(
    "SPOTIFY_AUTH_SUCCESS_URL",
    f"{SPOTIFY_FRONTEND_BASE_URL}?spotify_auth=success",
)

# Determine the redirect URI 
def get_spotify_redirect_uri():
    """
    Get Spotify redirect URI. Priority:
    1. Explicit SPOTIFY_REDIRECT_URI env var (if set)
    2. LAN IP if detected on Pi (for Raspberry Pi deployment)
    3. Fall back to SPOTIFY_BACKEND_BASE_URL (for local dev)
    """
    # Check if explicitly set in environment
    explicit_uri = os.getenv("SPOTIFY_REDIRECT_URI")
    if explicit_uri:
        return explicit_uri
    
    # Auto-detect LAN IP for Pi deployment (only if not localhost)
    lan_ip = get_lan_ip()
    if lan_ip and lan_ip != "127.0.0.1":
        # For Pi with HTTPS: use the LAN IP with HTTPS protocol
        # This assumes HTTPS is set up on Pi (with self-signed cert)
        return f"https://{lan_ip}:8000/callback"
    
    # Fall back to configured URL (for local dev: https://localhost:8000)
    return f"{SPOTIFY_BACKEND_BASE_URL}/callback"

SPOTIFY_REDIRECT_URI = get_spotify_redirect_uri()

print(f"Spotify Client ID: {SPOTIFY_CLIENT_ID[:20]}...")
print(f"Spotify Client Secret: {'SET' if SPOTIFY_CLIENT_SECRET else 'NOT SET'}")
print(f"Spotify Redirect URI: {SPOTIFY_REDIRECT_URI}")
print(f"Detected LAN IP: {get_lan_ip() or 'Not detected (using fallback)'}")

# Spotify auth manager (only if available)
spotify_oauth = None
if SPOTIFY_AVAILABLE:
    try:
        spotify_oauth = SpotifyOAuth(
            client_id=SPOTIFY_CLIENT_ID,
            client_secret=SPOTIFY_CLIENT_SECRET,
            redirect_uri=SPOTIFY_REDIRECT_URI,
            scope="user-read-playback-state,user-modify-playback-state,streaming,user-read-email,user-read-private",
            cache_path=".spotify_cache"
        )
        print("✓ Spotify OAuth initialized successfully")
    except Exception as e:
        print(f"✗ Failed to initialize Spotify OAuth: {e}")
        SPOTIFY_AVAILABLE = False
else:
    print("✗ Spotify not available")

# Global Spotify client (will be set after auth)
spotify_client = None
spotify_user_token = None

def get_spotify_client():
    """Get or create Spotify client with proper token handling"""
    global spotify_user_token
    
    if not SPOTIFY_AVAILABLE or not spotify_oauth:
        print("Spotify not available")
        return None
    
    try:
        # Get cached token and refresh if needed
        token = spotify_oauth.get_cached_token()
        
        if not token:
            print("No cached token found - user not authenticated")
            return None
        
        if "access_token" not in token:
            print("Token missing access_token field")
            return None
        
        access_token = token["access_token"]
        print(f"Using access token (first 20 chars): {access_token[:20]}...")
        spotify_user_token = token
        
        # Create client with the access token directly
        # This avoids issues with auth_manager
        return spotipy.Spotify(auth=access_token)
        
    except Exception as e:
        print(f"Error getting Spotify client: {e}")
        import traceback
        traceback.print_exc()
        return None

def add_track_to_globe_likes(track_uri: str) -> bool:
    if not track_uri:
        return False

    sp = get_spotify_client()
    if not sp:
        return False

    try:
        user = sp.current_user()
        user_id = user.get("id") if user else None
        if not user_id:
            return False

        playlist_id = None
        playlists = sp.current_user_playlists(limit=50)
        while playlists:
            for item in playlists.get("items", []):
                name = item.get("name", "").strip().lower()
                if name == "globe likes":
                    playlist_id = item.get("id")
                    break

            if playlist_id or not playlists.get("next"):
                break
            playlists = sp.next(playlists)

        if not playlist_id:
            created = sp.user_playlist_create(
                user_id,
                "Globe likes",
                public=False,
                description="Tracks liked in Globe Radio"
            )
            playlist_id = created.get("id") if created else None

        if not playlist_id:
            return False

        sp.playlist_add_items(playlist_id, [track_uri])
        return True
    except Exception as e:
        print(f"Failed to add track to Globe likes: {e}")
        return False

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
LIKES_FILE = DATA_DIR / "likes.json"
COVERS_DIR = DATA_DIR / "covers"
COVERS_DIR.mkdir(exist_ok=True)

# --- Musique locale (simule carte SD)
MUSIC_DIR = Path(__file__).parent / "music"

def load_likes() -> dict:
    if LIKES_FILE.exists():
        return json.loads(LIKES_FILE.read_text(encoding="utf-8"))
    return {}

def save_likes(likes: dict):
    LIKES_FILE.write_text(json.dumps(likes, indent=2), encoding="utf-8")


def read_sidecar_json(mp3_path: Path) -> dict | None:
    j = mp3_path.with_suffix(".json")
    if not j.exists():
        return None
    try:
        return json.loads(j.read_text(encoding="utf-8"))
    except Exception:
        return None


def read_id3_meta(mp3_path: Path) -> dict:
    """
    Retourne dict {artist, title, cover_cached: bool}
    + extrait la cover embedded si dispo et la met en cache.
    """
    meta = {"artist": None, "title": None, "cover_cached": False}

    try:
        audio = MP3(mp3_path)
    except Exception:
        return meta

    tags = getattr(audio, "tags", None)
    if not tags:
        return meta

    # Title / Artist (ID3 frames)
    # TPE1 = artist, TIT2 = title
    try:
        tpe1 = tags.get("TPE1")
        tit2 = tags.get("TIT2")
        if tpe1 and getattr(tpe1, "text", None):
            meta["artist"] = str(tpe1.text[0])
        if tit2 and getattr(tit2, "text", None):
            meta["title"] = str(tit2.text[0])
    except Exception:
        pass

    # Cover (APIC)
    # On cache sous DATA_DIR/covers/<stable_name>.jpg|png
    try:
        apics = tags.getall("APIC")
        if apics:
            apic = apics[0]
            mime = apic.mime or "image/jpeg"
            ext = ".jpg" if "jpeg" in mime else (".png" if "png" in mime else ".img")
            cache_name = mp3_path.stem + ext
            out = COVERS_DIR / cache_name
            if not out.exists():
                out.write_bytes(apic.data)
            meta["cover_cached"] = True
    except Exception:
        pass

    return meta


def cover_url_for_track(country: str, decade: str, mp3_path: Path, sidecar: dict | None) -> str:
    """
    Priorité:
    1) sidecar["cover"] => /api/cover/<country>/<decade>/<file>
    2) cover extraite ID3 => /api/cover_cached/<stem>.<ext>
    3) sinon ""
    """
    if sidecar and sidecar.get("cover"):
        return f"/api/cover/{country}/{decade}/{sidecar['cover']}"

    # ID3 cached cover
    # Cherche un fichier de cache existant pour ce stem
    for ext in (".jpg", ".png", ".img"):
        p = COVERS_DIR / (mp3_path.stem + ext)
        if p.exists():
            return f"/api/cover_cached/{p.name}"

    return ""

# --- Etat simulé (plus tard: brancher audio + capteurs)
state = {
    "artist": "Fela Kuti",
    "track": "Water No Get Enemy",
    "country": "Nigeria",
    "decade": "1970s",
    "coverUrl": "https://upload.wikimedia.org/wikipedia/en/9/9a/Fela_Kuti_-_Expensive_Shit.jpg",
    "trackId": "fela-water-no-get-enemy",
    "source": "local",
    "streamUrl": "",
    "liked": False,
}

clients: set[WebSocket] = set()

async def broadcast(msg: dict):
    dead = []
    for ws in clients:
        try:
            await ws.send_json(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)

class LikeReq(BaseModel):
    trackId: str
    liked: bool
    trackUri: str | None = None

class PatchReq(BaseModel):
    artist: str | None = None
    track: str | None = None
    country: str | None = None
    decade: str | None = None
    coverUrl: str | None = None
    trackId: str | None = None
    streamUrl: str | None = None

class SpotifySearchReq(BaseModel):
    query: str
    limit: int | None = 20

class SpotifyPlayReq(BaseModel):
    uri: str
    device_id: str | None = None

def pick_track_path(country: str, decade: str) -> Path | None:
    folder = MUSIC_DIR / country / decade
    if not folder.exists():
        return None
    tracks = sorted(folder.glob("*.mp3"))
    if not tracks:
        return None
    return random.choice(tracks)

def set_track_from_fs(country: str, decade: str):
    p = pick_track_path(country, decade)
    if not p:
        state["track"] = "Aucun MP3"
        state["artist"] = "—"
        state["trackId"] = "no-track"
        state["streamUrl"] = ""
        state["coverUrl"] = ""
        return

    sidecar = read_sidecar_json(p) or {}

    # JSON -> fallback ID3 -> fallback filename
    artist = sidecar.get("artist")
    title = sidecar.get("title")

    id3 = None
    if not artist or not title or not sidecar.get("cover"):
        id3 = read_id3_meta(p)
        artist = artist or id3.get("artist")
        title = title or id3.get("title")

    artist = artist or "—"
    title = title or p.stem

    # Cover : sidecar > cached ID3 > none
    # Si pas de cover sidecar, la lecture ID3 ci-dessus aura (peut-être) généré un cache cover.
    cover_url = cover_url_for_track(country, decade, p, sidecar)

    state["artist"] = artist
    state["track"] = title
    state["trackId"] = f"{country}-{decade}-{p.stem}"
    state["streamUrl"] = f"/api/audio/{country}/{decade}/{p.name}"
    state["coverUrl"] = cover_url

# --- Common API Endpoints ---

@app.get("/api/state")
def get_state():
    likes = load_likes()
    state["liked"] = bool(likes.get(state["trackId"], False))
    return state

@app.get("/api/hostinfo")
def get_host_info():
    return {
        "lan_ip": get_lan_ip(),
        "host": socket.gethostname(),
    }

# --- Spotify Integration ---

@app.get("/api/spotify/login")
def spotify_login():
    """Redirect user to Spotify authorization"""
    if not SPOTIFY_AVAILABLE or not spotify_oauth:
        return JSONResponse({"error": "Spotify integration not available"}, status_code=503)
    auth_url = spotify_oauth.get_authorize_url()
    return RedirectResponse(url=auth_url)

@app.get("/api/spotify/logout")
def spotify_logout():
    """Log out user by clearing cached token"""
    global spotify_client, spotify_user_token

    spotify_client = None
    spotify_user_token = None

    cache_paths = []
    if spotify_oauth and getattr(spotify_oauth, "cache_path", None):
        cache_paths.append(Path(spotify_oauth.cache_path))
    cache_paths.append(Path(__file__).parent / ".spotify_cache")
    cache_paths.append(Path(__file__).parent.parent / ".spotify_cache")

    removed = False
    for path in cache_paths:
        try:
            if path.exists():
                path.unlink()
                removed = True
        except Exception:
            continue

    return RedirectResponse(url=f"{SPOTIFY_FRONTEND_BASE_URL}?spotify_auth=logout")

@app.get("/auth/success")
def spotify_auth_success():
        html = """
        <!doctype html>
        <html lang="en">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Spotify Connected</title>
                <style>
                    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: #0b0b0c; color: #fff; margin: 0; display: grid; place-items: center; height: 100vh; }
                    .card { background: #16161a; border: 1px solid rgba(255,255,255,0.08); padding: 24px 28px; border-radius: 14px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.4); max-width: 420px; }
                    h1 { margin: 0 0 8px 0; font-size: 22px; }
                    p { margin: 0; opacity: 0.8; font-size: 14px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>Spotify connected</h1>
                    <p>You can return to the kiosk now.</p>
                </div>
            </body>
        </html>
        """
        return HTMLResponse(html)

@app.get("/callback")
def spotify_callback(code: str = None, error: str = None):
    """Handle Spotify callback"""
    global spotify_client, spotify_user_token
    
    if not SPOTIFY_AVAILABLE or not spotify_oauth:
        return JSONResponse({"error": "Spotify integration not available"}, status_code=503)
    
    if error:
        return JSONResponse({"error": error}, status_code=400)
    
    if code:
        try:
            token_info = spotify_oauth.get_access_token(code)
            spotify_user_token = token_info
            spotify_client = spotipy.Spotify(auth_manager=spotify_oauth)
            
            print(f"✓ Spotify user authenticated: {token_info}")
            
            # Redirect to frontend with success
            return RedirectResponse(url=SPOTIFY_AUTH_SUCCESS_URL)
        except Exception as e:
            print(f"✗ Spotify auth error: {e}")
            return JSONResponse({"error": str(e)}, status_code=400)
    
    return JSONResponse({"error": "No code provided"}, status_code=400)

@app.get("/api/spotify/status")
def spotify_status():
    """Check if user is authenticated with Spotify"""
    if not SPOTIFY_AVAILABLE:
        return JSONResponse({
            "available": False,
            "authenticated": False,
            "has_token": False,
            "access_token": None
        })
    
    # Check for cached token
    try:
        if spotify_oauth:
            token = spotify_oauth.get_cached_token()
            is_authenticated = token is not None
            access_token = token.get("access_token") if token else None
        else:
            is_authenticated = False
            access_token = None
    except Exception:
        is_authenticated = False
        access_token = None
    
    return JSONResponse({
        "available": SPOTIFY_AVAILABLE,
        "authenticated": is_authenticated,
        "has_token": is_authenticated,
        "access_token": access_token
    })

@app.post("/api/spotify/search")
async def spotify_search(req: SpotifySearchReq):
    """Search tracks on Spotify"""
    
    if not SPOTIFY_AVAILABLE:
        return JSONResponse({"error": "Spotify integration not available"}, status_code=503)
    
    print(f"Search request for: '{req.query}' (limit: {req.limit})")
    
    client = get_spotify_client()
    if not client:
        print("No Spotify client - user not authenticated")
        return JSONResponse({"error": "Not authenticated with Spotify"}, status_code=401)
    
    try:
        # Spotify API limit: max 10 per search query for this API access level
        limit = req.limit if req.limit else 10
        try:
            limit = int(limit)
            limit = max(1, min(limit, 10))  # Cap at 10 due to Spotify API restrictions
        except (ValueError, TypeError):
            limit = 10
        
        # Use requests directly
        token = spotify_oauth.get_cached_token()
        if not token or "access_token" not in token:
            return JSONResponse({"error": "Token expired or invalid"}, status_code=401)
        
        access_token = token["access_token"]
        headers = {"Authorization": f"Bearer {access_token}"}
        
        params = {
            "q": req.query,
            "type": "track",
            "limit": limit
        }
        
        print(f"Searching with limit={limit}")
        
        import requests as req_lib
        response = req_lib.get(
            "https://api.spotify.com/v1/search",
            headers=headers,
            params=params,
            timeout=10
        )
        
        if response.status_code != 200:
            print(f"Spotify API error: {response.text}")
            return JSONResponse({"error": f"Spotify API error: {response.text}"}, status_code=response.status_code)
        
        results = response.json()
        print(f"Found {len(results.get('tracks', {}).get('items', []))} tracks")
        
        tracks = []
        for item in results.get("tracks", {}).get("items", []):
            track = {
                "id": item["id"],
                "uri": item["uri"],
                "name": item["name"],
                "artist": ", ".join([a["name"] for a in item.get("artists", [])]),
                "album": item.get("album", {}).get("name", ""),
                "image": item.get("album", {}).get("images", [{}])[0].get("url", ""),
                "duration_ms": item.get("duration_ms", 0),
                "preview_url": item.get("preview_url", "")
            }
            tracks.append(track)
        
        return {"tracks": tracks}
    except Exception as e:
        print(f"Search error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": f"Search failed: {str(e)}"}, status_code=500)

@app.post("/api/spotify/play")
async def spotify_play(req: SpotifyPlayReq):
    """Play a track on Spotify"""
    global state
    
    if not SPOTIFY_AVAILABLE:
        return JSONResponse({"error": "Spotify integration not available"}, status_code=503)
    
    client = get_spotify_client()
    if not client:
        return JSONResponse({"error": "Not authenticated with Spotify"}, status_code=401)
    
    try:
        # Get available devices
        devices = client.devices()
        device_list = devices.get("devices", [])
        
        if not device_list:
            return JSONResponse({"error": "No Spotify device available. Open Spotify app on any device."}, status_code=400)
        
        # Use provided device_id or the first active device
        device_id = req.device_id or device_list[0]["id"]
        
        # Play the track
        client.start_playback(device_id=device_id, uris=[req.uri])
        
        # Update state with Spotify track info
        try:
            track_info = client.track(req.uri.split(":")[-1])
            state["artist"] = ", ".join([a["name"] for a in track_info.get("artists", [])])
            state["track"] = track_info.get("name", "")
            state["trackId"] = f"spotify-{track_info['id']}"
            state["source"] = "spotify"
            state["coverUrl"] = track_info.get("album", {}).get("images", [{}])[0].get("url", "")
            state["streamUrl"] = ""  # Spotify doesn't expose direct stream URLs
        except:
            pass
        
        await broadcast({"type": "state", "state": state})
        return {"ok": True, "device_id": device_id}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/spotify/devices")
def spotify_devices():
    """Get available Spotify devices"""
    
    if not SPOTIFY_AVAILABLE:
        return JSONResponse({"error": "Spotify integration not available"}, status_code=503)
    
    client = get_spotify_client()
    if not client:
        return JSONResponse({"error": "Not authenticated with Spotify"}, status_code=401)
    
    try:
        devices = client.devices()
        return {
            "devices": [
                {
                    "id": d["id"],
                    "name": d["name"],
                    "type": d["type"],
                    "is_active": d["is_active"]
                }
                for d in devices.get("devices", [])
            ]
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


def get_state():
    likes = load_likes()
    state["liked"] = bool(likes.get(state["trackId"], False))
    return state

@app.get("/api/audio/{country}/{decade}/{filename}")
def audio(country: str, decade: str, filename: str):
    # sécurité simple anti path traversal
    safe = Path(filename).name
    path = (MUSIC_DIR / country / decade / safe).resolve()
    root = MUSIC_DIR.resolve()
    if not str(path).startswith(str(root)) or not path.exists():
        return JSONResponse({"error": "file_not_found"}, status_code=404)
    return FileResponse(path, media_type="audio/mpeg", filename=safe)


@app.get("/api/cover/{country}/{decade}/{filename}")
def cover(country: str, decade: str, filename: str):
    safe = Path(filename).name
    path = (MUSIC_DIR / country / decade / safe).resolve()
    root = MUSIC_DIR.resolve()
    if not str(path).startswith(str(root)) or not path.exists():
        return JSONResponse({"error": "file_not_found"}, status_code=404)

    media, _ = mimetypes.guess_type(str(path))
    return FileResponse(path, media_type=media or "application/octet-stream", filename=safe)


@app.get("/api/cover_cached/{filename}")
def cover_cached(filename: str):
    safe = Path(filename).name
    path = (COVERS_DIR / safe).resolve()
    root = COVERS_DIR.resolve()
    if not str(path).startswith(str(root)) or not path.exists():
        return JSONResponse({"error": "file_not_found"}, status_code=404)

    media, _ = mimetypes.guess_type(str(path))
    return FileResponse(path, media_type=media or "application/octet-stream", filename=safe)

@app.post("/api/like")
async def set_like(req: LikeReq):
    likes = load_likes()
    likes[req.trackId] = req.liked
    save_likes(likes)

    if req.trackId == state["trackId"]:
        state["liked"] = req.liked

    spotify_added = False
    if req.liked and req.trackUri:
        spotify_added = add_track_to_globe_likes(req.trackUri)

    await broadcast({"type": "state", "state": state})
    return {"ok": True, "spotify_added": spotify_added}

# Endpoint DEV pour simuler globe/bouton/player
@app.post("/api/dev/patch")
async def dev_patch(req: PatchReq):
    patch = req.model_dump()
    for k, v in patch.items():
        if v is not None:
            state[k] = v

    # si on change le pays ou la décennie, on pioche un mp3 local automatiquement
    if patch.get("country") is not None or patch.get("decade") is not None:
        set_track_from_fs(state["country"], state["decade"])

    likes = load_likes()
    state["liked"] = bool(likes.get(state["trackId"], False))

    await broadcast({"type": "state", "state": state})
    return {"ok": True, "state": state}

@app.post("/api/dev/next")
async def dev_next():
    set_track_from_fs(state["country"], state["decade"])
    await broadcast({"type": "state", "state": state})

@app.websocket("/ws")
async def ws(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    try:
        await ws.send_json({"type": "state", "state": state})
        while True:
            # on garde la connexion vivante
            await ws.receive_text()
    except WebSocketDisconnect:
        clients.discard(ws)
