# Riders — bus ticket booking (Bangladesh)

[![CI](https://github.com/sheikh-mohammad-rakib/bus-ticket-booking/actions/workflows/ci.yml/badge.svg)](https://github.com/sheikh-mohammad-rakib/bus-ticket-booking/actions/workflows/ci.yml)

A full-stack bus ticket booking demo for Bangladesh: React (Vite) frontend,
Express API, **PostgreSQL** (via `pg`). Routes, operators and fares mirror
typical intercity coach travel in Bangladesh, priced in ৳ (BDT).

Every push to `main` (and every PR) runs CI in GitHub Actions:
it builds the client, boots the API against a real
Postgres 17 service container, seeds the Bangladesh data, and runs an
end-to-end smoke suite (`server/scripts/smoke.mjs` — booking, payment
rejection, cancellation charges). Run the same suite locally with:

```powershell
cd server
npm test    # expects the API running on :4000
```

## Run it (dev)

```powershell
npm install                  # root (concurrently)
npm --prefix server install
npm --prefix client install

# one-time: start a local Postgres (docker compose, or your own instance)
docker compose up -d db      # postgres:16 on localhost:5432, user/pass postgres, db riders

npm run dev                  # starts API on :4000 + web on :5173
```

Open http://localhost:5173.

The server configures via `DATABASE_URL` (default
`postgres://postgres:postgres@localhost:5432/riders`). The schema is created
automatically on startup and the sample Bangladesh data is seeded only when the
trips table is empty. To wipe and reseed: `docker compose down -v`,
`docker compose up -d db`, then restart the API.

## Deploy

The app deploys as **one service**: when `client/dist` exists, the Express
server serves the built React app and falls back to `index.html` for
client-side routes (`/ticket/...`, `/my-trips`) while keeping `/api` JSON-only.

### 1. Test production mode locally

```powershell
npm run build      # builds client/dist
npm start          # node server/src/index.js → open http://localhost:4000
```

### 2. Platform options (commit-what-you-see: no lockfiles are present)

**Render / Railway / Fly.io (simplest — one web service + managed Postgres):**

- Build command: `npm install && npm --prefix server install && npm --prefix client install && npm run build`
- Start command: `node server/src/index.js`
- Provision a managed Postgres on the same platform (Render/Railway/Fly all
  offer one), copy its connection string into the `DATABASE_URL` env var.
  The service autodetects and honors the platform's `PORT` too.
- Free tiers exist on all three; a tiny `db-0` Postgres instance is enough.

**Docker Compose (self-hosting):** `docker compose up -d --build` — starts
Postgres 16 (persistent `pgdata` volume) and the app together,
app on `:4000`, DB reachable only inside the compose network.

Docker app only: `docker build -t riders .` and point `DATABASE_URL` anywhere.

**VPS (DigitalOcean etc.):** run Postgres in Docker or a managed instance,
`DATABASE_URL=postgres://...` then `npm run build` and
`pm2 start "node server/src/index.js" --name riders` behind nginx/caddy
proxying to `localhost:4000`. (Note: I can't verify from here — this session's
research gateway is unsigned-in, so treat provider details as standard practice.)

### Not a fit

- **Vercel/Netlify serverless functions** for the API: the app is a
  long-lived process holding a Postgres pool; serverless would churn
  connections and need Neon-style pooling anyway — the single service is
  less config.

## The flow

Search (city pair + date) → seat map (per-trip sold-seat state) → passenger
details → mock payment → ticket (printable, with PNR lookup and cancellation).

## Demo payment

Checkout is simulated (no real charge):

- Valid demo card: `4111 1111 1111 1111` (any future expiry, 3-digit CVV)
- Cards ending in `0000` are declined
- Card numbers must pass a Luhn check, exactly like a real gateway's front-end

## API (mounted at `/api`)

| Method | Path                      | Notes                              |
| ------ | ------------------------- | ---------------------------------- |
| GET    | `/cities`                 | city list                          |
| GET    | `/trips?from&to&date`     | trip search + live availability    |
| GET    | `/trips/:id/seatmap?date` | layout + sold seats                |
| POST   | `/bookings`               | books seats transactionally        |
| GET    | `/bookings/:pnr`          | ticket lookup                      |
| GET    | `/bookings/:pnr/cancel-quote` | shows the cancellation charge before confirming |
| POST   | `/bookings/:pnr/cancel`   | charges 10% (min ৳50), seats freed |
| GET    | `/my-bookings?email`      | booking history                    |

Operator console (auth required — admin password session, or a signed-in
account with role `admin`; rate-limited on login):

| Method | Path                      | Notes                              |
| ------ | ------------------------- | ---------------------------------- |
| POST   | `/admin/login` / `/admin/logout` / `/admin/me` | session manage |
| GET    | `/admin/stats`            | revenue, seats sold, cancellations, top routes |
| GET    | `/admin/bookings?q&limit` | searchable bookings ledger         |

## Accounts & authorization

- **Register / sign in** at `/login`: bcrypt-hashed passwords (salted, cost 10),
  duplicate emails rejected, sessions are HMAC-signed HttpOnly cookies
  (`Path=/api`, 30 days) — no session table needed and no token in JS.
  Passengers log in via email+password; wrong logins give one generic error
  (no account enumeration).
- **Ownership**: bookings store `user_id`. Signed-in users always receive their
  own ledger on `/my-bookings` — the email query string is ignored for them —
  so one account can't probe another's bookings. Guests keep the legacy
  email-based lookup (fine for a demo; a production deployment should retire it).
- **Roles**: accounts are `passenger` (default) or `admin`. Admin accounts
  bypass the operator password gate; passengers get 401 on console endpoints.
  Promote an account from the CLI:
  `node scripts/make-admin.mjs user@example.com` (append `demote` to reverse).
- **Operator password**: still works for `/admin` (`ADMIN_PASSWORD`, demo
  default `riders-admin` — set a real one anywhere reachable).

## Operator console

`/admin` in the app is a lightweight dashboard for the bus company: sign in to
see revenue and seats sold, cancellation stats with fees/refunds, best-selling
routes, and a searchable ledger of every booking (PNR, passenger, seats,
amounts, refund status). Operator sessions are HMAC-signed HttpOnly cookies
scoped to `/api/admin`, expiring after 12 hours; user sessions with the
`admin` role enter directly.

## Design notes

- Double-booking is prevented by a `SELECT … FOR UPDATE` row lock on the trip
  inside a Postgres transaction, which serializes seat checks per trip before
  insert — safe under concurrent traffic, unlike a plain check-then-insert.
- Seats are re-derived from bookings, so cancellation instantly returns seats
  to the pool (no separate "holds" table needed for a demo).
- `pg` pool (max 10) with `$1`-style parameterized queries throughout.
- Localized for Bangladesh: 10 cities (Dhaka, Chattogram, Sylhet, Khulna,
  Rajshahi, Barishal, Cox's Bazar, Rangpur, Cumilla, Mymensingh), familiar
  operators (Green Line, Hanif, Shohag, Ena, Shyamoli, Royal Coach), fares in
  ৳50 steps, and +880 phone formatting.

## Security notes

- **Headers** via helmet: strict CSP (self-hosted assets + Google Fonts only),
  `X-Frame-Options` / `frame-ancestors 'none'` (no clickjacking), `nosniff`,
  `Strict-Transport-Security`, `Referrer-Policy`.
- **Rate limiting** (per IP; key correctness on scale platforms thanks to
  `trust proxy`): 300/min API-wide, 15 per 10 min on `POST /bookings`, 60/min
  on PNR/email lookups and cancellations — `429` + `RateLimit` headers.
- **CORS allowlist** (`CORS_ORIGIN` env, defaults to the Vite dev origins);
  requests from unknown origins get no access headers.
- **Input hygiene**: 16 kB JSON body cap, length-limited contact fields,
  strict regex validation (seats, dates, email, phone, card Luhn/expiry).
- **Card data**: the mock gateway validates card numbers but stores only the
  paid amount — card numbers, CVVs and expiry are never persisted or logged.
- **Accounts**: bcrypt-hashed passwords (cost 10) with HMAC-signed HttpOnly
  session cookies; bookings are ownership-tagged (`user_id`); the `admin` role
  gates the operator console; login forms are rate-limited (10/10 min).
- **Known limitation**: guest lookup by raw email still exists (as in real
  Bangladeshi bus apps); signed-in users are never affected by it — their
  ledger is strictly their own. A production deployment would retire it.
