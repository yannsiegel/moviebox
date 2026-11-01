#!/usr/bin/env bash
# MovieBox installer for Ubuntu/Debian.
#   sudo ./install.sh
# Running it again later updates the code and keeps all settings, media and the nginx/HTTPS setup.
set -euo pipefail

INSTALL_DIR=/opt/moviebox
MEDIA_DIR=/srv/moviebox/media
SERVICE_USER=moviebox
NGINX_NO_DOMAIN_PORT=8096
HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$INSTALL_DIR/server/.env"

bold=$'\e[1m'; green=$'\e[32m'; yellow=$'\e[33m'; red=$'\e[31m'; reset=$'\e[0m'
step() { echo; echo "${bold}==> $*${reset}"; }
ok()   { echo "${green}✔ $*${reset}"; }
warn() { echo "${yellow}! $*${reset}"; }
die()  { echo "${red}✘ $*${reset}" >&2; exit 1; }
ask()  { local answer; read -r -p "$1 " answer || true; echo "${answer:-$2}"; }

[[ $EUID -eq 0 ]] || die "Bitte mit sudo starten:  sudo ./install.sh"
[[ -f "$HERE/server/package.json" ]] || die "install.sh muss im entpackten MovieBox-Ordner liegen (dort, wo auch 'server/' ist)."
command -v apt-get >/dev/null || die "Dieses Skript ist für Ubuntu/Debian (apt) gedacht."

# ------------------------------------------------------------------ Checks
step "Prüfe Voraussetzungen"

# sudo resets PATH, so Node from nvm etc. can be passed in: sudo NODE_BIN=$(which node) ./install.sh
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
[[ -n "$NODE_BIN" ]] || die "Node.js nicht gefunden. Falls es über nvm installiert ist:  sudo NODE_BIN=\$(which node) ./install.sh"
NODE_DIR="$(dirname "$NODE_BIN")"
"$NODE_BIN" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=6)?0:1)' \
  || die "Node.js $("$NODE_BIN" -v) ist zu alt, nötig ist mindestens 20.6."
[[ -x "$NODE_DIR/npm" ]] || die "npm nicht neben $NODE_BIN gefunden."
ok "Node.js $("$NODE_BIN" -v) ($NODE_BIN)"

command -v nginx >/dev/null || die "nginx nicht gefunden."
ok "nginx vorhanden"

# ------------------------------------------------------------------ Fragen (nur bei Erstinstallation)
if [[ -f "$ENV_FILE" ]]; then
  step "Bestehende Installation gefunden – Einstellungen werden übernommen"
  env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1; }
  API_TOKEN="$(env_value API_TOKEN)"
  PORT="$(env_value PORT)"
  MONGO_URL="$(env_value MONGO_URL)"
  DOMAIN="$(env_value MOVIEBOX_DOMAIN)"
  FIRST_INSTALL=false
else
  FIRST_INSTALL=true
  step "Ein paar Fragen (Enter übernimmt den Vorschlag in Klammern)"
  echo "Unter welcher (Sub-)Domain soll MovieBox erreichbar sein, z. B. movies.example.com?"
  echo "Die Domain muss per DNS auf diesen Server zeigen. Leer lassen = ohne Domain über http://<IP>:$NGINX_NO_DOMAIN_PORT"
  DOMAIN="$(ask "Domain []:" "")"
  DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
  EMAIL=""
  if [[ -n "$DOMAIN" ]]; then
    EMAIL="$(ask "E-Mail für das kostenlose HTTPS-Zertifikat (Let's Encrypt, optional) []:" "")"
  fi
  MONGO_URL="$(ask "MongoDB-Adresse [mongodb://127.0.0.1:27017]:" "mongodb://127.0.0.1:27017")"
  API_TOKEN="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"

  PORT=3200
  while ss -ltnH "sport = :$PORT" | grep -q .; do PORT=$((PORT + 1)); done
fi

# quick reachability check of MongoDB (host:port out of the URL)
mongo_hostport="$(echo "$MONGO_URL" | sed -E 's#^mongodb(\+srv)?://([^@/]*@)?([^/,?]+).*#\3#')"
mongo_host="${mongo_hostport%%:*}"; mongo_port="${mongo_hostport##*:}"
[[ "$mongo_port" == "$mongo_host" ]] && mongo_port=27017
if [[ "$MONGO_URL" != mongodb+srv* ]] && ! timeout 3 bash -c "</dev/tcp/$mongo_host/$mongo_port" 2>/dev/null; then
  die "MongoDB unter $mongo_host:$mongo_port nicht erreichbar. Läuft der Dienst? (sudo systemctl status mongod)"
fi
ok "MongoDB erreichbar ($mongo_host:$mongo_port)"

# ------------------------------------------------------------------ Pakete
step "Installiere Pakete (ffmpeg, qrencode$([[ -n "$DOMAIN" ]] && echo ", certbot"))"
packages=(ffmpeg qrencode curl ca-certificates)
[[ -n "$DOMAIN" ]] && packages+=(certbot python3-certbot-nginx)
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${packages[@]}" >/dev/null
ok "Pakete installiert"

# ------------------------------------------------------------------ Code & Konfiguration
step "Installiere den MovieBox-Server nach $INSTALL_DIR"
id "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$INSTALL_DIR/server" "$MEDIA_DIR"
rm -rf "$INSTALL_DIR/server/src" "$INSTALL_DIR/server/deploy" "$INSTALL_DIR/server/web"
cp -a "$HERE/server/src" "$HERE/server/deploy" "$HERE/server/web" "$HERE/server/package.json" "$INSTALL_DIR/server/"
if [[ -f "$HERE/server/package-lock.json" ]]; then
  cp -a "$HERE/server/package-lock.json" "$INSTALL_DIR/server/"
  (cd "$INSTALL_DIR/server" && PATH="$NODE_DIR:$PATH" npm ci --omit=dev --no-audit --no-fund --loglevel=error)
else
  (cd "$INSTALL_DIR/server" && PATH="$NODE_DIR:$PATH" npm install --omit=dev --no-audit --no-fund --loglevel=error)
fi
ok "Server-Code und Abhängigkeiten installiert"

if $FIRST_INSTALL; then
  cat > "$ENV_FILE" <<EOF
# Created by install.sh - change values here, then: sudo systemctl restart moviebox
API_TOKEN=$API_TOKEN
HOST=127.0.0.1
PORT=$PORT
MONGO_URL=$MONGO_URL
MONGO_DB=moviebox
MEDIA_DIR=$MEDIA_DIR
MAX_TRANSCODE_HEIGHT=1080
TRANSCODE_CONCURRENCY=1
ACCEL_REDIRECT_PREFIX=/_moviebox_media
MOVIEBOX_DOMAIN=$DOMAIN
EOF
  ok "Konfiguration angelegt ($ENV_FILE)"
fi
chmod 600 "$ENV_FILE"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR" /srv/moviebox
# nginx (www-data) delivers the video files, so it needs read access
chmod 755 /srv/moviebox "$MEDIA_DIR"

runuser -u "$SERVICE_USER" -- "$NODE_BIN" -v >/dev/null 2>&1 \
  || die "Der Dienst-Benutzer '$SERVICE_USER' kann $NODE_BIN nicht ausführen (liegt Node in einem Home-Verzeichnis?). Installiere Node systemweit, z. B. über NodeSource."

# ------------------------------------------------------------------ systemd
step "Richte den Dienst 'moviebox' ein"
cat > /etc/systemd/system/moviebox.service <<EOF
[Unit]
Description=MovieBox video server
After=network.target mongod.service

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/server
ExecStart=$NODE_BIN --env-file=$ENV_FILE src/index.js
Environment=PATH=$NODE_DIR:/usr/local/bin:/usr/bin:/bin
Restart=on-failure
RestartSec=5
# keep scans and transcodes from slowing down the other services on this server
Nice=10
IOSchedulingClass=idle

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable moviebox >/dev/null 2>&1
systemctl restart moviebox

for _ in $(seq 1 20); do
  curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null && break
  sleep 1
done
curl -fs "http://127.0.0.1:$PORT/api/health" >/dev/null \
  || { journalctl -u moviebox -n 20 --no-pager; die "Der Dienst startet nicht (Log siehe oben)."; }
ok "Dienst läuft (intern auf Port $PORT)"

# ------------------------------------------------------------------ nginx
step "Richte nginx ein"
NGINX_CONF="/etc/nginx/sites-available/moviebox.conf"
NGINX_LINK="/etc/nginx/sites-enabled/moviebox.conf"

if [[ -n "$DOMAIN" ]]; then
  cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /api/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        client_max_body_size 20g;
        proxy_request_buffering off;
    }

    location /_moviebox_media/ {
        internal;
        alias $MEDIA_DIR/;
        add_header Cache-Control "private, max-age=2592000";
    }

    location /_moviebox_hls/ {
        internal;
        alias $MEDIA_DIR/transcodes/;
        add_header Cache-Control "private, max-age=60";
    }

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
else
  cat > "$NGINX_CONF" <<EOF
server {
    listen $NGINX_NO_DOMAIN_PORT default_server;
    listen [::]:$NGINX_NO_DOMAIN_PORT default_server;
    server_name _;

    location /api/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        client_max_body_size 20g;
        proxy_request_buffering off;
    }

    location /_moviebox_media/ {
        internal;
        alias $MEDIA_DIR/;
        add_header Cache-Control "private, max-age=2592000";
    }

    location /_moviebox_hls/ {
        internal;
        alias $MEDIA_DIR/transcodes/;
        add_header Cache-Control "private, max-age=60";
    }

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
fi
ln -sf "$NGINX_CONF" "$NGINX_LINK"
nginx -t >/dev/null && systemctl reload nginx
ok "nginx eingerichtet"

# ------------------------------------------------------------------ HTTPS (optional)
if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
  step "Hole HTTPS-Zertifikat (Let's Encrypt) für $DOMAIN"
  if certbot --nginx -n --agree-tos --email "$EMAIL" -d "$DOMAIN" --redirect; then
    ok "HTTPS aktiv"
  else
    warn "certbot ist fehlgeschlagen – MovieBox läuft weiter über http://$DOMAIN"
  fi
fi

# ------------------------------------------------------------------ Zusammenfassung
step "Fertig"
if [[ -n "$DOMAIN" ]]; then
  URL="https://$DOMAIN"
  [[ -z "$EMAIL" ]] && URL="http://$DOMAIN"
else
  URL="http://$(hostname -I | awk '{print $1}'):$NGINX_NO_DOMAIN_PORT"
fi
echo "   MovieBox läuft unter: ${bold}$URL${reset}"
echo "   Admin-Token (Web-Player & API):  ${bold}$API_TOKEN${reset}"
echo "   Logs:  sudo journalctl -u moviebox -f"
echo "   Dienst neu starten:  sudo systemctl restart moviebox"
