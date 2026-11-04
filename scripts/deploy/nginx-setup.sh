#!/usr/bin/env bash
# (DEPLOY) Bootstrap or refresh nginx + HTTPS for the unified app on the VM.
#
# Installs, from templates in deploy/nginx/:
#   - checkpoints-map.conf  -> /etc/nginx/conf.d/   (old host -> /go, /js, /rust)
#   - checkpoints.conf      -> sites-available/${VM_DOMAIN}.conf
#     ${VM_DOMAIN} (checkpoints.appsyss.com) proxied to 127.0.0.1:${API_PORT},
#     plus 301s from go-/js-/rust-checkpoints.appsyss.com.
#
# Certificates: one for ${VM_DOMAIN}, one named "checkpoints-legacy" covering the
# three old hosts. The old hosts' own vhosts (from the reference deploys) must be
# disabled first, or nginx sees duplicate server_names: set LEGACY_DISABLE=1 to
# have this script unlink them from sites-enabled (files are kept, not deleted).
#
# PREPARED, NOT RUN. Any validation failure reverts this site and leaves the
# other sites on the box untouched.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"

load_env_file "${ENV_FILE:-$ROOT_DIR/.env.vm}"
build_ssh_args

host="${VM_DOMAIN:-checkpoints.appsyss.com}"
port="${API_PORT:-8157}"
project="${REMOTE_PROJECT_DIR}"
flag="${REMOTE_MAINTENANCE_FLAG}"
html="${REMOTE_MAINTENANCE_HTML}"
email="${CERTBOT_EMAIL:-}"
legacy_disable="${LEGACY_DISABLE:-0}"
# LEGACY_REDIRECT=0: serve only the new host and leave the old sites untouched.
legacy_redirect="${LEGACY_REDIRECT:-1}"
target="$(resolve_ssh_target)"

[ -n "$email" ] || die "CERTBOT_EMAIL is required for certificate issuance"
for f in nginx/checkpoints.conf nginx/checkpoints-map.conf maintenance.html; do
  [ -f "$ROOT_DIR/deploy/$f" ] || die "missing deploy/$f"
done

print_info "[VM] Shipping nginx templates and the maintenance page"
stage="/tmp/cp-nginx-$$"
ssh "${SSH_ARGS[@]}" "$target" "mkdir -p '$stage'"
scp "${SCP_ARGS[@]}" "$ROOT_DIR/deploy/nginx/checkpoints.conf" "$ROOT_DIR/deploy/nginx/checkpoints-map.conf" \
  "$ROOT_DIR/deploy/maintenance.html" "${target}:${stage}/" >/dev/null

ssh "${SSH_ARGS[@]}" "$target" \
  "HOST='${host}' PORT='${port}' PROJECT='${project}' FLAG='${flag}' HTML='${html}' EMAIL='${email}' STAGE='${stage}' LEGACY_DISABLE='${legacy_disable}' LEGACY_REDIRECT='${legacy_redirect}' bash -s" <<'REMOTE'
set -euo pipefail
trap 'rm -rf "$STAGE"' EXIT
LEGACY="go-checkpoints.appsyss.com js-checkpoints.appsyss.com rust-checkpoints.appsyss.com"
[ "$LEGACY_REDIRECT" = "1" ] || LEGACY=""

command -v nginx >/dev/null || [ -x /usr/sbin/nginx ] || { echo "nginx is not installed on the VM"; exit 1; }

sudo mkdir -p "$(dirname "$HTML")"
sudo install -m 0644 "$STAGE/maintenance.html" "$HTML"

# HTTP/2 syntax depends on the nginx version; the wrong one breaks the WHOLE config.
nginx_bin="$(command -v nginx || echo /usr/sbin/nginx)"
nginx_ver="$(sudo "$nginx_bin" -v 2>&1 | sed -n 's|.*nginx/\([0-9.]*\).*|\1|p')"
if [ -n "$nginx_ver" ] && [ "$(printf '%s\n1.25.1\n' "$nginx_ver" | sort -V | head -1)" = "1.25.1" ]; then
  LISTEN_HTTP2=""; HTTP2_DIRECTIVE="  http2 on;"
else
  LISTEN_HTTP2=" http2"; HTTP2_DIRECTIVE=""
fi

conf="/etc/nginx/sites-available/${HOST}.conf"
enabled="/etc/nginx/sites-enabled/${HOST}.conf"
mapconf="/etc/nginx/conf.d/checkpoints-map.conf"

revert() {
  echo "ERROR: nginx rejected the config — reverting ${HOST}" >&2
  sudo rm -f "$enabled" "$mapconf"
  sudo nginx -t >/dev/null 2>&1 && echo "reverted; other sites are unaffected" >&2
  exit 1
}

# Old reference vhosts would duplicate the legacy server_names.
for h in $LEGACY; do
  for f in /etc/nginx/sites-enabled/*; do
    [ -e "$f" ] || continue
    [ "$(readlink -f "$f")" = "$(readlink -f "$conf")" ] && continue
    if sudo grep -qE "server_name[^;]*\b${h//./\\.}\b" "$f"; then
      if [ "$LEGACY_DISABLE" = "1" ]; then
        echo "disabling old vhost $f (file kept in sites-available)"; sudo rm -f "$f"
      else
        echo "ERROR: $f still serves $h. Re-run with LEGACY_DISABLE=1 to unlink it." >&2; exit 1
      fi
    fi
  done
done

# Step 1: HTTP only (ACME + redirects), so certbot's webroot challenge works.
sudo tee "$conf" >/dev/null <<CONF
server {
  listen 80; listen [::]:80;
  server_name ${HOST} ${LEGACY};
  location /.well-known/acme-challenge/ { root /var/www/html; }
  location / { return 301 https://\$host\$request_uri; }
}
CONF
[ -z "$LEGACY" ] || sudo install -m 0644 "$STAGE/checkpoints-map.conf" "$mapconf"
sudo ln -sf "$conf" "$enabled"
sudo nginx -t || revert
sudo systemctl reload nginx

# Step 2: certificates (idempotent).
if [ ! -d "/etc/letsencrypt/live/${HOST}" ]; then
  sudo certbot certonly --webroot -w /var/www/html -d "${HOST}" \
    --non-interactive --agree-tos -m "${EMAIL}" --keep-until-expiring
fi
if [ -n "$LEGACY" ] && [ ! -d /etc/letsencrypt/live/checkpoints-legacy ]; then
  args=(); for h in $LEGACY; do args+=( -d "$h" ); done
  sudo certbot certonly --webroot -w /var/www/html --cert-name checkpoints-legacy "${args[@]}" \
    --non-interactive --agree-tos -m "${EMAIL}" --keep-until-expiring
fi

# Step 3: the full site from the template.
drop=(); [ -n "$LEGACY" ] || drop=( -e "/# LEGACY-BEGIN/,/# LEGACY-END/d" )
sed "${drop[@]}" -e "s|@HOST@|${HOST}|g" -e "s|@PORT@|${PORT}|g" -e "s|@PROJECT@|${PROJECT}|g" \
    -e "s|@FLAG@|${FLAG}|g" -e "s|@HTML@|${HTML}|g" -e "s|@LISTEN_HTTP2@|${LISTEN_HTTP2}|g" \
    -e "s|@HTTP2_DIRECTIVE@|${HTTP2_DIRECTIVE}|g" "$STAGE/checkpoints.conf" | sudo tee "$conf" >/dev/null
if sudo grep -q '@[A-Z0-9_]*@' "$conf"; then echo "unfilled placeholder in $conf" >&2; revert; fi
sudo nginx -t || revert
sudo systemctl reload nginx
echo "nginx configured for ${HOST}${LEGACY:+ (+ 301 from ${LEGACY})}"
REMOTE

print_info "[VM] nginx + HTTPS ready for https://${host}"
