# 06 — Infrastructure & Deployment

This document specifies the hosting configuration, domain strategy, port assignments, Nginx reverse proxy setup, and systemd service orchestration for the unified `checkpoints` platform.

---

## 1. Hosting Environment & Ports

### 1.1 Host Context
* **Host Server:** `appsyss-vm` (`136.114.230.206`).
* **Operating System:** Debian Linux.
* **Available Resources:** ~1.9 GB RAM total; running multiple background daemons.

### 1.2 Port Strategy & Collision Prevention
Previously, the three standalone projects occupied multiple ports:
* `go-checkpoints`: API `8133`, Vite `5192`, Docker `8134`
* `js-checkpoints`: API `8130`, Vite `5191`, Docker `8131`
* `rust-checkpoints`: API `8128`, Vite `5190`, Docker `8129`

> [!WARNING] Port Collision Avoidance
> Ports are reserved by the manager (decisions D2). The legacy ports below stay in use until cutover, so the unified platform uses its own reserved ports, recorded in `docs/decisions.md`.

The unified platform consolidates these down to **one production API port** and **one local development port**:

| Port | Variable | Context | Role |
|---|---|---|---|
| **8133** | `API_PORT` | Production VM & Local Backend | Unified Express API & WebSocket Server (consolidating 8128, 8130, 8133) |
| **5192** | `WEB_PORT` | Local Development | Single Vite Dev Server |

*(Ports 8128, 8130, and 8133 will be decommissioned and freed once legacy services are retired).*

---

## 2. Domain & DNS Strategy

### 2.1 Primary Domain
* **Domain Name:** `checkpoints.appsyss.com`
* **DNS Target:** `A` record pointing to `136.114.230.206`.
* **SSL Certificate:** Issued via Certbot (Let's Encrypt) under `/etc/letsencrypt/live/checkpoints.appsyss.com/`.

### 2.2 Subdomain Redirection (Preserving Existing Links)
To avoid breaking bookmarks or Discord shared links, the three existing subdomains will permanently redirect (HTTP 301) to the unified platform:

* `https://go-checkpoints.appsyss.com/:path*` $\rightarrow$ `https://checkpoints.appsyss.com/go/:path*`
* `https://js-checkpoints.appsyss.com/:path*` $\rightarrow$ `https://checkpoints.appsyss.com/js/:path*`
* `https://rust-checkpoints.appsyss.com/:path*` $\rightarrow$ `https://checkpoints.appsyss.com/rust/:path*`

---

## 3. Nginx Reverse Proxy Configuration

Below is the production Nginx virtual host template for the unified platform:

```nginx
# 1. Permanent Redirects from Legacy Subdomains
server {
  listen 80;
  listen 443 ssl http2;
  server_name go-checkpoints.appsyss.com;
  ssl_certificate     /etc/letsencrypt/live/go-checkpoints.appsyss.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/go-checkpoints.appsyss.com/privkey.pem;
  return 301 https://checkpoints.appsyss.com/go$request_uri;
}

server {
  listen 80;
  listen 443 ssl http2;
  server_name js-checkpoints.appsyss.com;
  ssl_certificate     /etc/letsencrypt/live/js-checkpoints.appsyss.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/js-checkpoints.appsyss.com/privkey.pem;
  return 301 https://checkpoints.appsyss.com/js$request_uri;
}

server {
  listen 80;
  listen 443 ssl http2;
  server_name rust-checkpoints.appsyss.com;
  ssl_certificate     /etc/letsencrypt/live/rust-checkpoints.appsyss.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/rust-checkpoints.appsyss.com/privkey.pem;
  return 301 https://checkpoints.appsyss.com/rust$request_uri;
}

# 2. HTTP to HTTPS Redirection for Main Domain
server {
  listen 80;
  listen [::]:80;
  server_name checkpoints.appsyss.com;
  location /.well-known/acme-challenge/ { root /var/www/html; }
  location / { return 301 https://$host$request_uri; }
}

# 3. Main Unified Application Server
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name checkpoints.appsyss.com;

  ssl_certificate     /etc/letsencrypt/live/checkpoints.appsyss.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/checkpoints.appsyss.com/privkey.pem;
  include /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

  # Security Headers
  add_header X-Frame-Options SAMEORIGIN always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

  client_max_body_size 2m;

  # Real-time WebSocket Output Streaming
  location /ws/ {
    proxy_pass http://127.0.0.1:8133;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host       $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  # REST API
  location /api/ {
    proxy_pass http://127.0.0.1:8133;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 180s;
  }

  # Health Check Endpoint
  location = /healthz {
    proxy_pass http://127.0.0.1:8133;
    proxy_set_header Host $host;
  }

  # Static Single Page Application (SPA)
  location / {
    root /home/abbas/Documents/checkpoints/web/dist;
    try_files $uri $uri/ /index.html;
  }
}
```

---

## 4. Systemd Service Unit (`checkpoints.service`)

A single systemd service manages the Node backend with strict memory safeguards:

```ini
[Unit]
Description=Reboot01 Unified Checkpoint Tester
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=abbas
Group=abbas
WorkingDirectory=/home/abbas/Documents/checkpoints/server
EnvironmentFile=/home/abbas/Documents/checkpoints/.env.vm
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=5

# Host RAM Protection Limits
MemoryMax=384M
MemoryHigh=256M

# Standard Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=checkpoints

[Install]
WantedBy=multi-user.target
```

---

## 5. Cutover & Rollout Plan

1. **Staging Verification:** Build and verify `checkpoints` locally with test submissions across Go, JS, and Rust.
2. **Database Merge on VM:** Execute `merge.ts` on `appsyss-vm` to consolidate the three existing SQLite databases.
3. **Nginx Configuration:** Deploy `checkpoints.appsyss.com` virtual host and legacy redirect rules.
4. **Service Launch:** Enable and start `checkpoints.service`.
5. **Decommissioning:** Stop and disable legacy services (`go-checkpoints.service`, `js-checkpoints.service`, `rust-checkpoints.service`).

