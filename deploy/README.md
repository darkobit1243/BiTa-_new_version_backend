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

### 0) SSH into VPS

```bash
ssh bitasi@<VPS_IP> -p <SSH_PORT>
```

### 1) Basic setup + firewall

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl

# Firewall: allow your SSH port (example: 22667)
sudo ufw allow 22667/tcp
sudo ufw enable
sudo ufw status
```

### 2) (Skip) Dedicated user

If you already created a sudo user (e.g. `bitasi`), you can skip creating a new one.

### 3) Install Node.js 20 (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt -y install nodejs
node -v
npm -v
```

### 2) Copy files to VPS
Suggested layout:

- `/opt/bita-mock/current` → this folder contains `server.js`, `package.json`, `src/`.

Example using git:

```bash
sudo mkdir -p /opt/bita-mock
sudo chown -R bitasi:bitasi /opt/bita-mock

sudo -u bitasi bash -lc "cd /opt/bita-mock && git clone <your-repo-url> current"
```

### 3) Install dependencies

```bash
cd /opt/bita-mock/current
npm ci --omit=dev
```

### 3.1) (Optional) Environment overrides

Create `/etc/bita-mock.env` if you want to override defaults:

```bash
sudo tee /etc/bita-mock.env >/dev/null <<'EOF'
PORT=8080
HOST=0.0.0.0
LOG_REQUESTS=false
EOF
```

### 4) Create systemd unit
Copy `bita-mock.service` to:

- `/etc/systemd/system/bita-mock.service`

Then:

```bash
sudo cp deploy/bita-mock.service /etc/systemd/system/bita-mock.service
sudo systemctl daemon-reload
sudo systemctl enable --now bita-mock
sudo systemctl status bita-mock
```

Logs:

```bash
sudo journalctl -u bita-mock -f
```

### 5) (Optional) Nginx reverse proxy
Copy `nginx-bita-mock.conf` into `/etc/nginx/sites-available/` and enable it.

```bash
sudo apt -y install nginx
sudo cp deploy/nginx-bita-mock.conf /etc/nginx/sites-available/bita-mock
sudo ln -sf /etc/nginx/sites-available/bita-mock /etc/nginx/sites-enabled/bita-mock
sudo nginx -t
sudo systemctl restart nginx
```

If you use Nginx, you can keep the Node service on localhost only by setting `HOST=127.0.0.1` in `/etc/bita-mock.env`.

### 6) (Optional) HTTPS (recommended)

With a real domain pointing to your VPS:

```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d <your-domain>
```

## Firewall / ports

- If exposing directly: open `8080/tcp`.
- If behind Nginx: only open `80/tcp` + `443/tcp` and keep `8080` bound to localhost.

Commands:

```bash
# Direct expose
sudo ufw allow 8080/tcp

# Or if using Nginx
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

## Quick health check

```bash
curl http://127.0.0.1:8080/health
```
