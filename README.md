# BiTa Mock Backend (Phase 1)

Minimal Express backend that matches the Flutter app's current API contract.

## Run

```bash
npm install
npm run start
# or
npm run dev
```

## Run with PostgreSQL (recommended for real data)

This repo ships with a Postgres-backed store. Easiest way is Docker Compose:

```bash
docker compose -f docker-compose.postgres.yml up --build
```

Default base URL: `http://localhost:8080`

Database (inside Docker):

- host: `localhost`
- port: `5432`
- db: `bita`
- user: `bita`
- password: `bita_password`

Smoke test (in another terminal, while the server is running):

```bash
npm run smoke
```

Default base URL: `http://localhost:8080`

Enable request logs (helps to verify UI triggers the expected calls):

```bash
LOG_REQUESTS=true npm run start
```

Optional: persist mock data to disk (so users/listings survive restarts):

```bash
PERSIST_DB=true DB_PATH=./data/db.json npm run start
```

Optional: debug snapshot endpoint (disabled by default):

```bash
ENABLE_DEBUG_ENDPOINTS=true DEBUG_TOKEN=changeme npm run start
curl -H "x-debug-token: changeme" http://localhost:8080/debug/db
```

Flutter run example:

```bash
flutter run --dart-define=USE_BACKEND=true --dart-define=API_BASE_URL=http://10.0.2.2:8080
```

(For Android emulator, `10.0.2.2` maps to your machine's localhost.)

Windows desktop run example:

```bash
flutter run -d windows --dart-define=USE_BACKEND=true --dart-define=API_BASE_URL=http://localhost:8080
```

## Manual end-to-end checklist (UI)

- Login (any email/password works in mock) → should see `POST /auth/login` logs.
- Feed opens → should see `GET /listings/feed?...` logs.
- Open a listing's offers → should see `GET /listings/:id/offers` logs.
- Unlock an offer (Bilgileri Gör) → should see `POST /users/:userId/unlocked-offers` then `GET /users/:userId/unlocked-offers` on next login.
- Apply filters (serviceType/adType/origin/destination) → should see `GET /listings/feed?...` with query params.

## Docker / VPS

Local Docker:

```bash
docker compose up --build
```

On a VPS, run the same compose file and open port `8080` (or put it behind Nginx/Caddy and expose `443`).

### SMTP (Forgot/Reset password)

This backend can send password reset emails via SMTP (Nodemailer). Configure it via environment variables.

- Template: `.env.example` (copy to `.env` on the VPS)
- Required for sending: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- Recommended: `SMTP_FROM` and `RESET_URL_BASE`

If Docker is not available, see `deploy/README.md` for a systemd-based deployment.

## Implemented endpoints

- `POST /auth/login`
- `POST /auth/register`
- `GET /listings/feed`
- `POST /listings`
- `GET /listings/:listingId/offers`
- `GET /users/:userId/unlocked-offers`
- `POST /users/:userId/unlocked-offers`

All responses are shaped as `{ data: ... }`.