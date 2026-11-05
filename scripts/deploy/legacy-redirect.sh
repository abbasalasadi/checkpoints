#!/usr/bin/env bash
# (DEPLOY) Replace the three old vhosts with one static page that links to the
# new dashboard, for every path. Temporary until the DNS redirect. The old
# vhost files are kept as *.conf.old in sites-available; services are untouched.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"
load_env_file "${ENV_FILE:-$ROOT_DIR/.env.vm}"
build_ssh_args
target="$(resolve_ssh_target)"
scp "${SCP_ARGS[@]}" "$ROOT_DIR/deploy/legacy-redirect.html" "${target}:/tmp/legacy-redirect.html" >/dev/null
ssh "${SSH_ARGS[@]}" "$target" bash -s <<'REMOTE'
set -euo pipefail
sudo install -d /var/www/checkpoints-legacy
sudo install -m 0644 /tmp/legacy-redirect.html /var/www/checkpoints-legacy/index.html
rm -f /tmp/legacy-redirect.html
for h in go js rust; do
  host="$h-checkpoints.appsyss.com"; f="/etc/nginx/sites-available/$host.conf"
  [ -f "$f.old" ] || sudo cp "$f" "$f.old"
  sudo tee "$f" >/dev/null <<CONF
server {
  listen 80; listen [::]:80;
  server_name $host;
  location /.well-known/acme-challenge/ { root /var/www/html; }
  location / { return 301 https://\$host\$request_uri; }
}
server {
  listen 443 ssl http2; listen [::]:443 ssl http2;
  server_name $host;
  ssl_certificate     /etc/letsencrypt/live/$host/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/$host/privkey.pem;
  root /var/www/checkpoints-legacy;
  add_header Cache-Control "no-store" always;
  location / { try_files /index.html =404; }
}
CONF
done
if ! sudo nginx -t 2>/tmp/nginx-t.log; then
  cat /tmp/nginx-t.log >&2
  for h in go js rust; do f="/etc/nginx/sites-available/$h-checkpoints.appsyss.com.conf"; sudo cp "$f.old" "$f"; done
  echo "ERROR: nginx -t failed; old vhosts restored" >&2; exit 1
fi
sudo systemctl reload nginx
for h in go js rust; do
  printf '%s %s\n' "$h" "$(curl -s -o /dev/null -w '%{http_code}' "https://$h-checkpoints.appsyss.com/some/old/path")"
done
REMOTE
print_info "[VM] old sites now show the moved page (expect 200 above)"
