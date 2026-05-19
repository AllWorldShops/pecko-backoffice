#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Pecko BOM Converter — install as a system service
#
# Linux (systemd):   sudo ./scripts/install-service.sh
# macOS (launchd):   ./scripts/install-service.sh   (no sudo needed)
#
# After installing, the app starts automatically on every reboot.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_NAME="pecko-bom"
START_SCRIPT="$APP_DIR/scripts/start.sh"

# Make start.sh executable
chmod +x "$START_SCRIPT"

# ── Detect OS ────────────────────────────────────────────────────────────────
OS="$(uname -s)"

# ── Linux — systemd ──────────────────────────────────────────────────────────
if [ "$OS" = "Linux" ]; then

  if [ "$EUID" -ne 0 ]; then
    echo "On Linux this script needs sudo to install a systemd service."
    echo "Re-run with:  sudo ./scripts/install-service.sh"
    exit 1
  fi

  # The user who will own the process (the user who called sudo, not root)
  SERVICE_USER="${SUDO_USER:-$USER}"
  NODE_BIN="$(su - "$SERVICE_USER" -c 'command -v node 2>/dev/null || echo ""')"
  [ -z "$NODE_BIN" ] && NODE_BIN="$(command -v node 2>/dev/null || echo "/usr/bin/node")"
  NODE_DIR="$(dirname "$NODE_BIN")"

  UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

  echo "Installing systemd service: $UNIT_FILE"
  echo "  App directory : $APP_DIR"
  echo "  Running as    : $SERVICE_USER"
  echo "  Node.js       : $NODE_BIN"
  echo ""

  cat > "$UNIT_FILE" << EOF
[Unit]
Description=Pecko BOM Converter
Documentation=https://github.com/your-org/pecko-bom-converter
After=network.target
StartLimitIntervalSec=60
StartLimitBurst=3

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin
Environment=NODE_ENV=production
ExecStart=$START_SCRIPT
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Allow the server process enough open files for uploads
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"

  echo "──────────────────────────────────────────"
  echo "  ✅  Service installed and started!"
  echo ""
  echo "  Useful commands:"
  echo "    Status:   sudo systemctl status $SERVICE_NAME"
  echo "    Logs:     sudo journalctl -u $SERVICE_NAME -f"
  echo "    Restart:  sudo systemctl restart $SERVICE_NAME"
  echo "    Stop:     sudo systemctl stop $SERVICE_NAME"
  echo "    Remove:   sudo systemctl disable $SERVICE_NAME && sudo rm $UNIT_FILE"
  echo "──────────────────────────────────────────"

# ── macOS — launchd ──────────────────────────────────────────────────────────
elif [ "$OS" = "Darwin" ]; then

  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST_FILE="$PLIST_DIR/com.pecko.bom-converter.plist"
  NODE_BIN="$(command -v node 2>/dev/null || echo "/usr/local/bin/node")"
  NODE_DIR="$(dirname "$NODE_BIN")"

  mkdir -p "$PLIST_DIR"

  echo "Installing launchd agent: $PLIST_FILE"
  echo "  App directory : $APP_DIR"
  echo "  Node.js       : $NODE_BIN"
  echo ""

  cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.pecko.bom-converter</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$START_SCRIPT</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$NODE_DIR:/usr/local/bin:/usr/bin:/bin</string>
    <key>NODE_ENV</key>
    <string>production</string>
  </dict>

  <!-- Start when the user logs in -->
  <key>RunAtLoad</key>
  <true/>

  <!-- Restart if it crashes -->
  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>$APP_DIR/logs/stdout.log</string>

  <key>StandardErrorPath</key>
  <string>$APP_DIR/logs/stderr.log</string>
</dict>
</plist>
EOF

  mkdir -p "$APP_DIR/logs"

  # Unload first in case it was already registered
  launchctl unload "$PLIST_FILE" 2>/dev/null || true
  launchctl load "$PLIST_FILE"

  echo "──────────────────────────────────────────"
  echo "  ✅  LaunchAgent installed and started!"
  echo ""
  echo "  Useful commands:"
  echo "    Status:   launchctl list | grep pecko"
  echo "    Logs:     tail -f $APP_DIR/logs/stdout.log"
  echo "    Stop:     launchctl unload $PLIST_FILE"
  echo "    Remove:   launchctl unload $PLIST_FILE && rm $PLIST_FILE"
  echo "──────────────────────────────────────────"

else
  echo "Unsupported OS: $OS"
  echo "Please set up the service manually using scripts/start.sh"
  exit 1
fi
