#!/usr/bin/env bash
# Sirve la app y abre un enlace publico (HTTPS) para probarla en el celular o la tablet.
# La camara SOLO funciona por HTTPS, por eso el tunel.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
PUERTO=8510
LOG="$DIR/tunel.log"

pkill -f "http.server $PUERTO" 2>/dev/null || true
pkill -f "cloudflared tunnel --url http://localhost:$PUERTO" 2>/dev/null || true
sleep 1

cd "$DIR"
setsid nohup python3 -m http.server $PUERTO >/dev/null 2>&1 & disown
setsid nohup "$HOME/cloudflared" tunnel --url "http://localhost:$PUERTO" > "$LOG" 2>&1 & disown

echo "Esperando el enlace publico..."
for i in $(seq 1 40); do
  U=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1 || true)
  [ -n "$U" ] && { echo; echo "  Abre esto en el celular o la tablet:"; echo "  $U"; echo; exit 0; }
  sleep 1
done
echo "No salio el enlace. Revisa $LOG"
