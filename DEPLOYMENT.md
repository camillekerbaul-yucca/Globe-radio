# 🎵 Globe Radio - Deployment Guide

## Quick Start (Fresh Raspberry Pi)

### Option 1: Automated Deployment (Recommended)

On your fresh Raspberry Pi OS, run:

```bash
curl -sSL https://raw.githubusercontent.com/camillekerbaul-yucca/Globe-radio/main/deploy.sh | bash
```

Or manually:

```bash
git clone https://github.com/camillekerbaul-yucca/Globe-radio.git
cd Globe-radio
chmod +x deploy.sh
./deploy.sh
```

The script will:
- ✅ Clone the repository
- ✅ Install Node.js and Chromium
- ✅ Set up Python virtual environment
- ✅ Prompt for Spotify credentials
- ✅ Build the frontend
- ✅ Create systemd services for auto-start
- ✅ Disable keyring prompts
- ✅ Configure kiosk mode
- ✅ Everything auto-launches on reboot

### Option 2: Manual Deployment

```bash
# 1. Clone & enter repo
git clone https://github.com/camillekerbaul-yucca/Globe-radio.git
cd Globe-radio

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install Chromium
sudo apt-get install -y chromium

# 4. Setup Python
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn spotipy python-dotenv mutagen

# 5. Configure Spotify credentials
nano server/.env
# Add:
# SPOTIFY_CLIENT_ID=<your_id>
# SPOTIFY_CLIENT_SECRET=<your_secret>
# SPOTIFY_BACKEND_BASE_URL=http://192.168.1.64:8000
# SPOTIFY_FRONTEND_BASE_URL=http://192.168.1.64:5173

# 6. Build frontend
cd globe-radio-ui
npm install
npm run build
cd ..

# 7. Create systemd services (see deploy.sh for content)
# 8. Enable kiosk autostart
# 9. Reboot
sudo reboot
```

## Configuration

### Spotify Developer Settings

Before the first boot, update your Spotify Developer Dashboard:

1. Go to https://developer.spotify.com/dashboard
2. Click your app
3. In "Redirect URIs", add: `http://192.168.1.64:8000/callback`
4. Save

### Environment Variables

Edit `server/.env`:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_BACKEND_BASE_URL=http://192.168.1.64:8000
SPOTIFY_FRONTEND_BASE_URL=http://192.168.1.64:5173
```

## Service Management

### Check Service Status
```bash
sudo systemctl status globe-radio-backend.service
sudo systemctl status globe-radio-frontend.service
```

### View Logs
```bash
sudo journalctl -u globe-radio-backend.service -f
sudo journalctl -u globe-radio-frontend.service -f
```

### Restart Services
```bash
sudo systemctl restart globe-radio-backend.service
sudo systemctl restart globe-radio-frontend.service
```

### Update Code

```bash
cd ~/Globe-radio
git pull
sudo systemctl restart globe-radio-backend.service
sudo systemctl restart globe-radio-frontend.service
```

## Troubleshooting

### Kiosk doesn't start
- Check if Chromium is installed: `which chromium`
- Check autostart file: `cat ~/.config/autostart/globe-radio.desktop`
- Check logs: `journalctl -xe`

### Like button returns 400
- Check CORS configuration in `server/server.py`
- Verify `192.168.1.64:5173` is in `allow_origins`
- Restart backend: `sudo systemctl restart globe-radio-backend.service`

### Services don't auto-start on boot
- Enable them: `sudo systemctl enable globe-radio-backend.service`
- Check: `sudo systemctl is-enabled globe-radio-backend.service`

## Architecture

```
┌─────────────────────────────────────┐
│   Raspberry Pi with Touch Display   │
├─────────────────────────────────────┤
│  Chromium (Kiosk)                   │
│  http://192.168.1.64:5173           │
├─────────────────────────────────────┤
│  Frontend Service (HTTP)            │
│  Port 5173: globe-radio-ui dist/    │
├─────────────────────────────────────┤
│  Backend Service (FastAPI)          │
│  Port 8000: Spotify API, Search     │
├─────────────────────────────────────┤
│  Spotify Web API                    │
│  (via OAuth2 + spotipy)             │
└─────────────────────────────────────┘
```

All services auto-restart on crash and auto-start on boot.

## Development

### Local Development (Windows/Mac)

```bash
# Terminal 1: Backend
cd server
python -m uvicorn server.server:app --reload --host 127.0.0.1 --port 8000

# Terminal 2: Frontend
cd globe-radio-ui
npm run dev
# Access at http://localhost:5173
```

### Push Changes

```bash
git add .
git commit -m "Feature: description"
git push origin main
```

Then on Pi:
```bash
cd ~/Globe-radio
git pull
sudo systemctl restart globe-radio-backend.service
```

## License

[Your License Here]
