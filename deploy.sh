#!/bin/bash
set -e

echo "🎵 Globe Radio Deployment Script"
echo "=================================="

# 1. Clone repo if needed
if [ ! -d "Globe-radio" ]; then
    echo "📦 Cloning Globe Radio repository..."
    git clone https://github.com/camillekerbaul-yucca/Globe-radio.git
    cd Globe-radio
else
    echo "✓ Repository already exists"
    cd Globe-radio
fi

# 2. Update system
echo "🔄 Updating system..."
sudo apt-get update -qq

# 3. Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✓ Node.js already installed"
fi

# 4. Install Chromium if not present
if ! command -v chromium &> /dev/null; then
    echo "📦 Installing Chromium..."
    sudo apt-get install -y chromium
else
    echo "✓ Chromium already installed"
fi

# 5. Create Python virtual environment
echo "🐍 Setting up Python environment..."
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install fastapi uvicorn spotipy python-dotenv mutagen

# 6. Generate self-signed SSL certificates
echo "🔒 Generating self-signed SSL certificates..."
if [ ! -d "certs" ]; then
    mkdir -p certs
    openssl req -x509 -newkey rsa:4096 -nodes -out certs/cert.pem -keyout certs/key.pem -days 365 -subj "/CN=192.168.1.64"
    echo "✓ SSL certificates generated"
else
    echo "✓ SSL certificates already exist"
fi

# 7. Configure .env if not present
if [ ! -f "server/.env" ]; then
    echo "⚙️  Creating .env file..."
    read -p "Enter Spotify Client ID: " SPOTIFY_CLIENT_ID
    read -sp "Enter Spotify Client Secret: " SPOTIFY_CLIENT_SECRET
    echo ""
    
    cat > server/.env << EOF
SPOTIFY_CLIENT_ID=$SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET=$SPOTIFY_CLIENT_SECRET
SPOTIFY_BACKEND_BASE_URL=https://192.168.1.64:8000
SPOTIFY_FRONTEND_BASE_URL=http://192.168.1.64:5173
EOF
    echo "✓ .env created"
else
    echo "✓ .env already exists"
fi

# 8. Build frontend
echo "🏗️  Building frontend..."
cd globe-radio-ui
npm install --silent
npm run build
cd ..

# 9. Create systemd services
echo "🚀 Creating systemd services..."

sudo bash -c 'cat > /etc/systemd/system/globe-radio-backend.service << EOF
[Unit]
Description=Globe Radio Backend
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Globe-radio
ExecStart=/home/pi/Globe-radio/.venv/bin/python -m uvicorn server.server:app --host 0.0.0.0 --port 8000 --ssl-keyfile /home/pi/Globe-radio/certs/key.pem --ssl-certfile /home/pi/Globe-radio/certs/cert.pem
Restart=always

[Install]
WantedBy=multi-user.target
EOF'

sudo bash -c 'cat > /etc/systemd/system/globe-radio-frontend.service << EOF
[Unit]
Description=Globe Radio Frontend
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/Globe-radio/globe-radio-ui/dist
ExecStart=/usr/bin/python3 -m http.server 5173
Restart=always

[Install]
WantedBy=multi-user.target
EOF'

sudo systemctl daemon-reload
sudo systemctl enable globe-radio-backend.service
sudo systemctl enable globe-radio-frontend.service

# 10. Disable keyring
echo "🔐 Disabling GNOME Keyring prompts..."
systemctl --user mask gcr-ssh-agent.socket 2>/dev/null || true
systemctl --user mask gcr-ssh-agent.service 2>/dev/null || true
systemctl --user mask gnome-keyring-daemon.service 2>/dev/null || true
systemctl --user mask gnome-keyring-daemon.socket 2>/dev/null || true

# 11. Create kiosk autostart
echo "🖥️  Setting up kiosk mode..."
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/globe-radio.desktop << EOF
[Desktop Entry]
Type=Application
Name=Globe Radio
Exec=env GNOME_KEYRING_CONTROL= chromium --kiosk --password-store=basic http://192.168.1.64:5173
StartupNotify=true
EOF

# 12. Add .spotify_cache to .gitignore
echo ".spotify_cache" >> .gitignore 2>/dev/null || true

echo ""
echo "✅ Deployment complete!"
echo "=================================="
echo "🎵 Globe Radio is ready to use!"
echo ""
echo "Next steps:"
echo "1. Update Spotify Developer Dashboard redirect URI to: https://192.168.1.64:8000/callback"
echo "2. Verify certificate warning in browser is expected (self-signed HTTPS)"
echo "3. Reboot: sudo reboot"
echo ""
echo "The app will automatically start in kiosk mode at http://192.168.1.64:5173"
