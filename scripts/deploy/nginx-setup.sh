#!/usr/bin/env bash
# (DEPLOY) Bootstrap or refresh nginx + HTTPS on the VM.
#
# The one real departure from the detecto vhost is the /ws/terminal block: this
# application needs a WebSocket upgrade for the PTY, and the default 60s
# proxy_read_timeout would drop an idle terminal mid-session.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/common.sh"

load_env_file "${ENV_FILE:-$ROOT_DIR/.env.vm}"
build_ssh_args

host="${VM_DOMAIN}"
port="${API_PORT:-8128}"
project="${REMOTE_PROJECT_DIR}"
flag="${REMOTE_MAINTENANCE_FLAG}"
html="${REMOTE_MAINTENANCE_HTML}"
email="${CERTBOT_EMAIL}"
target="$(resolve_ssh_target)"

[ -n "$host" ] || die "VM_DOMAIN is required"
[ -n "$email" ] || die "CERTBOT_EMAIL is required for certificate issuance"

print_info "[VM] Installing nginx vhost for ${host}"

# Ship the maintenance page first so error_page 503 has something to serve.
scp "${SCP_ARGS[@]}" "$ROOT_DIR/deploy/maintenance.html" "${target}:/tmp/rc-maintenance.html" >/dev/null
ssh "${SSH_ARGS[@]}" "$target" "sudo mkdir -p \$(dirname '${html}') && sudo mv /tmp/rc-maintenance.html '${html}' && sudo chmod 0644 '${html}'"

ssh "${SSH_ARGS[@]}" "$target" "HOST='${host}' PORT='${port}' PROJECT='${project}' FLAG='${flag}' HTML='${html}' EMAIL='${email}' bash -s" <<'REMOTE'
set -euo pipefail

# /usr/sbin is absent from a non-root non-login PATH on Debian, so a bare
# `command -v nginx` reports "not installed" on a VM that is serving 20 sites.
# Every later nginx call goes through sudo, which does have /usr/sbin.
command -v nginx >/dev/null || [ -x /usr/sbin/nginx ] || {
  echo "nginx is not installed on the VM"; exit 1; }

# HTTP/2 is configured two different ways, and picking the wrong one makes the
# WHOLE nginx config invalid — not just this vhost — so every other site on the
# box fails its next reload too.
#
#   < 1.25.1   listen 443 ssl http2;
#   >= 1.25.1  listen 443 ssl;  +  http2 on;   (the old form warns as deprecated)
nginx_bin="$(command -v nginx || echo /usr/sbin/nginx)"
nginx_ver="$(sudo "$nginx_bin" -v 2>&1 | sed -n 's|.*nginx/\([0-9.]*\).*|\1|p')"
if [ -n "$nginx_ver" ] && \
   [ "$(printf '%s\n1.25.1\n' "$nginx_ver" | sort -V | head -1)" = "1.25.1" ]; then
  LISTEN_HTTP2=""
  HTTP2_DIRECTIVE="  http2 on;"
else
  LISTEN_HTTP2=" http2"
  HTTP2_DIRECTIVE=""
fi
echo "nginx ${nginx_ver:-unknown}: using ${HTTP2_DIRECTIVE:-listen ... http2}"

conf="/etc/nginx/sites-available/${HOST}.conf"
maint_uri="/__rc_maintenance__"

# HTTP: ACME challenge plus a redirect. Written before certbot runs so the
# challenge location exists on a first-time issue.
sudo tee "$conf" >/dev/null <<CONF
server {
  listen 80;
  listen [::]:80;
  server_name ${HOST};

  location /.well-known/acme-challenge/ { root /var/www/html; }
  location / { return 301 https://\$host\$request_uri; }
}
CONF

sudo ln -sf "$conf" "/etc/nginx/sites-enabled/${HOST}.conf"
sudo nginx -t && sudo systemctl reload nginx

# Issue or renew. --keep-until-expiring makes reruns cheap and idempotent.
if [ ! -d "/etc/letsencrypt/live/${HOST}" ]; then
  sudo certbot certonly --webroot -w /var/www/html -d "${HOST}" \
    --non-interactive --agree-tos -m "${EMAIL}" --keep-until-expiring
fi

# Full vhost, now that a certificate exists.
sudo tee "$conf" >/dev/null <<CONF
server {
  listen 80;
  listen [::]:80;
  server_name ${HOST};
  location /.well-known/acme-challenge/ { root /var/www/html; }
  location / { return 301 https://\$host\$request_uri; }
}

server {
  listen 443 ssl${LISTEN_HTTP2};
  listen [::]:443 ssl${LISTEN_HTTP2};
${HTTP2_DIRECTIVE}
  server_name ${HOST};

  ssl_certificate     /etc/letsencrypt/live/${HOST}/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/${HOST}/privkey.pem;

  # Security headers. The CSP is deliberately strict: this site renders
  # student-authored program output.
  add_header X-Frame-Options SAMEORIGIN always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  # A student's code can print anything; cap what a single request may carry.
  client_max_body_size 2m;

  error_page 503 ${maint_uri};
  location = ${maint_uri} {
    internal;
    alias ${HTML};
    default_type text/html;
  }

  # The PTY WebSocket. Without the upgrade headers this silently degrades to a
  # failed handshake; without the long read timeout an idle terminal is dropped
  # after 60s, which looks like a crash to the student.
  location /ws/terminal {
    if (-f ${FLAG}) { return 503; }
    proxy_pass http://127.0.0.1:${PORT};
    proxy_http_version 1.1;
    proxy_set_header Upgrade    \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host       \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }

  location /api/ {
    if (-f ${FLAG}) { return 503; }
    proxy_pass http://127.0.0.1:${PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    # The login rate limiter derives the client IP from this, and trusts it
    # only because it comes from this proxy.
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_read_timeout 180s;
  }

  location = /healthz {
    proxy_pass http://127.0.0.1:${PORT};
    proxy_set_header Host \$host;
  }

  # The SPA. nginx serves it; the backend is API-only.
  location / {
    if (-f ${FLAG}) { return 503; }
    root ${PROJECT}/web/dist;
    try_files \$uri \$uri/ /index.html;
  }
}
CONF

# If the new vhost does not validate, unlink it before bailing out. Leaving a
# broken file in sites-enabled means nginx is fine until its next restart and
# then refuses to start at all, taking every unrelated site down with it.
if ! sudo nginx -t; then
  echo "ERROR: nginx rejected the vhost for ${HOST} — reverting" >&2
  sudo rm -f "/etc/nginx/sites-enabled/${HOST}.conf"
  sudo nginx -t >/dev/null 2>&1 && echo "reverted; other sites are unaffected" >&2
  exit 1
fi
sudo systemctl reload nginx
echo "nginx configured for ${HOST}"
REMOTE

print_info "[VM] nginx + HTTPS ready for https://${host}"
