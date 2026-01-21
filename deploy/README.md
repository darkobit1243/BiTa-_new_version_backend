# VPS Deploy (Mock Backend)

You can deploy the mock backend in two ways:

1) **Docker (recommended)** – easiest on a VPS if Docker is available.
2) **Systemd (no Docker)** – run Node directly as a service.

## Option A — Docker (recommended)

Prereqs: Docker + docker compose plugin.

```bash
# on VPS
git clone <your-repo>
cd <your-repo>/server
sudo docker compose up --build -d
```

- App listens on `:8080`.
- Put it behind Nginx/Caddy for HTTPS on `:443`.

## Option B — systemd (no Docker)

### 1) Install Node.js
Use Node 20+ (LTS).

### 2) Copy files to VPS
Suggested layout:

- `/opt/bita-mock/current` → this folder contains `server.js`, `package.json`, `src/`.

### 3) Install dependencies

```bash
cd /opt/bita-mock/current
npm ci --omit=dev
```

### 4) Create systemd unit
Copy `bita-mock.service` to:

- `/etc/systemd/system/bita-mock.service`

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bita-mock
sudo systemctl status bita-mock
```

### 5) (Optional) Nginx reverse proxy
Copy `nginx-bita-mock.conf` into `/etc/nginx/sites-available/` and enable it.

## Firewall / ports

- If exposing directly: open `8080/tcp`.
- If behind Nginx: only open `80/tcp` + `443/tcp` and keep `8080` bound to localhost.

## Quick health check

```bash
curl http://127.0.0.1:8080/health
```
