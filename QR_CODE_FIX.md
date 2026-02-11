# QR Code Hostname Fix

## Problem
When scanning the QR code from a mobile phone, it was opening `http://127.0.0.1:8000/callback` instead of `http://192.168.1.64:8000/callback`. This prevented Spotify OAuth redirect to work on the phone because `127.0.0.1` is localhost relative to the phone, not the Raspberry Pi.

## Root Cause
The `SPOTIFY_REDIRECT_URI` in `server.py` was hardcoded to use the configured `SPOTIFY_BACKEND_BASE_URL` which defaulted to `http://127.0.0.1:8000`. This URI is registered with Spotify's OAuth provider, and when users log in via phone, Spotify redirects to this hardcoded address.

## Solution Implemented

### 1. **Backend Changes** (`server/server.py`)
- Replaced hardcoded `SPOTIFY_REDIRECT_URI` with a dynamic function `get_spotify_redirect_uri()`
- This function detects the LAN IP via `get_lan_ip()` and uses it if available
- Falls back to `SPOTIFY_BACKEND_BASE_URL` for local development
- Updated startup logs to show the detected LAN IP and redirect URI

### 2. **Frontend Changes** (`globe-radio-ui/src/NowPlayingScreen.jsx`)
- Updated `checkSpotifyStatus()` to use the detected LAN IP (`spotifyHostOverride`) instead of hardcoded `localhost`
- This ensures Spotify status checks use the same hostname as the QR code

## Deployment Steps

### **CRITICAL: Spotify Developer Dashboard Update**
You must register **both** possible redirect URIs in your Spotify app settings:

1. Go to https://developer.spotify.com/dashboard/applications
2. Select your "Globe Radio" app
3. Click "Edit Settings"
4. In **Redirect URIs** section, add/ensure these are registered:
   - `http://127.0.0.1:8000/callback` (for local dev)
   - `http://192.168.1.64:8000/callback` (for your Pi's IP)
   - If your Pi's IP is different, use that instead of `192.168.1.64`

**⚠️ Important:** If you forget this step, Spotify will reject the redirect and OAuth will fail.

### On Raspberry Pi
1. Pull the latest changes:
   ```bash
   cd ~/Globe-radio
   git pull origin main
   ```

2. Rebuild the frontend:
   ```bash
   cd globe-radio-ui
   npm run build
   ```

3. Restart services:
   ```bash
   sudo systemctl restart globe-radio-backend.service
   sudo systemctl restart globe-radio-frontend.service
   ```

4. Verify logs:
   ```bash
   sudo journalctl -u globe-radio-backend.service -n 20
   ```
   Look for output like:
   ```
   Detected LAN IP: 192.168.1.64
   Spotify Redirect URI: http://192.168.1.64:8000/callback
   ```

5. Test: Open the kiosk browser console (F12 or browser dev tools) and check:
   - Network tab: Verify `/api/hostinfo` returns your Pi's IP
   - Console: Should see `✓ Fetched LAN IP from server: 192.168.1.64`
   - QR code modal: Verify the generated QR encodes the correct IP

### Verify Works
1. Touch the Spotify icon on the kiosk to open the QR modal
2. Scan the QR code with your phone
3. Check that the URL shown in the browser address bar contains your Pi's IP (e.g., `192.168.1.64`), not `127.0.0.1`
4. Complete the Spotify login flow

## Troubleshooting

### QR Code Still Shows `127.0.0.1`
1. Check browser console logs: Should see `✓ Fetched LAN IP from server: XXX.XXX.XXX.XXX`
2. If log doesn't appear:
   - Check `/api/hostinfo` returns a valid IP: `curl http://192.168.1.64:8000/api/hostinfo`
   - Verify frontend js was rebuilt: Check `globe-radio-ui/dist/` has recent timestamps
   - Clear browser cache (Ctrl+Shift+Delete)

### Spotify OAuth Fails After Scan
1. Verify you registered the redirect URI in Spotify Developer Dashboard
2. Check both URIs are present:
   - `http://127.0.0.1:8000/callback` (dev)
   - `http://192.168.1.64:8000/callback` (or your actual Pi IP)
3. Restart backend service: `sudo systemctl restart globe-radio-backend.service`

### Wrong IP Detected on Pi
If `get_lan_ip()` returns `127.0.0.1` instead of `192.168.1.64`:
1. The Pi is not on a network, or
2. Network connectivity issue
3. Manually set `SPOTIFY_REDIRECT_URI` in `.env`:
   ```
   SPOTIFY_BACKEND_BASE_URL=http://192.168.1.64:8000
   ```
4. Restart: `sudo systemctl restart globe-radio-backend.service`

## Files Modified
- `server/server.py` - Made redirect URI dynamic
- `globe-radio-ui/src/NowPlayingScreen.jsx` - Updated status check to use detected IP
- This document

## Testing Checklist
- [ ] Spotify Developer Dashboard has both redirect URIs registered
- [ ] Backend logs show detected LAN IP at startup
- [ ] Frontend console shows `✓ Fetched LAN IP from server: [PI_IP]`
- [ ] QR code modal displays correct IP in URL
- [ ] Phone scan shows correct IP in browser address bar
- [ ] Spotify OAuth login completes successfully
- [ ] Logged-in status shows on kiosk after callback redirects

## Next Steps
After this fix, the QR-based Spotify login should work seamlessly from any phone on the same network as your Raspberry Pi kiosk!
