# Riders — bus ticket booking (Bangladesh)

[![CI](https://github.com/sheikh-mohammad-rakib/bus-ticket-booking/actions/workflows/ci.yml/badge.svg)](https://github.com/sheikh-mohammad-rakib/bus-ticket-booking/actions/workflows/ci.yml)

A full-stack bus ticket booking demo for Bangladesh: React (Vite) frontend,
Express API, **PostgreSQL** (via `pg`). Routes, operators and fares mirror
typical intercity coach travel in Bangladesh, priced in ৳ (BDT).

Every push to `main` (and every PR) runs CI in GitHub Actions:
it builds the client, runs the unit tests, boots the API against a real
Postgres 17 service container, seeds the Bangladesh data, and runs an
end-to-end smoke suite (`server/scripts/smoke.mjs` — booking, payment
rejection, cancellation charges, role ladder, staff management). Run the same suites locally with:

```powershell
cd server
npm run unit   # pure-logic tests (fee math, Luhn, session codec) — no server needed
npm test       # smoke suite; expects the API running on :4000 (override with SMOKE_BASE_URL)
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

If :4000 is unavailable on your machine (Windows reserves ranges around
Hyper-V/WinNAT), run the API elsewhere and point the dev proxy at it:

```powershell
# server:  $env:PORT = '4100'; npm run dev
# client:  $env:API_TARGET = 'http://localhost:4100'; npm run dev
```

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
proxying to `localhost:4000`. (Provider details below are standard practice;
verify current specifics with your provider.)

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/riders` | Postgres connection string |
| `PORT` | `4000` | API listen port (platforms inject their own) |
| `ADMIN_PASSWORD` | `riders-admin` | operator password opening the console at owner level — set a real one anywhere users are reachable |
| `AUTH_SECRET` | derived from `ADMIN_PASSWORD` | HMAC key for user session cookies; setting it keeps sessions stable across password changes |
| `CORS_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | comma-separated allowlist for cross-origin API calls |
| `SMOKE_BASE_URL` | `http://localhost:4000` | base URL the smoke suite targets (set to `:4100` etc. when testing a non-default port) |

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

Operator console (auth required — operator-password session, or a signed-in staff
account; login endpoints are rate-limited):

| Method | Path                             | Notes                                        |
| ------ | -------------------------------- | -------------------------------------------- |
| POST   | `/admin/login` / `/admin/logout` / `/admin/me` | session manage                  |
| GET    | `/admin/stats`                   | revenue, seats sold, cancellations, top routes — **owner only** |
| GET    | `/admin/bookings?q&limit`        | searchable bookings ledger — operator and owner |
| POST   | `/admin/bookings/:pnr/checkin`   | stamp boarding — operator and owner; second call 409 |
| GET    | `/admin/staff`                   | list staff accounts — **owner only** |
| POST   | `/admin/staff`                   | create counter operator (or owner) — **owner only** |
| PATCH  | `/admin/staff/:id`               | disable/enable, optional password reset — **owner only** |
| DELETE | `/admin/staff/:id`               | remove account (guards: not self, not last owner, no booking history) — **owner only** |

## Accounts & authorization

Three roles form an access ladder — `passenger < counter_operator < owner`:

| Role | Can |
| ---- | --- |
| `passenger` (default) | book, keep and cancel own tickets |
| `counter_operator` | everything a passenger can, plus the counter console: bookings ledger lookup and boarding check-in |
| `owner` | everything the counter can, plus the financial view: revenue, seats sold, cancellations with fees/refunds, best-selling routes |

- **Register / sign in** at `/login`: bcrypt-hashed passwords (salted, cost 10),
  duplicate emails rejected, sessions are HMAC-signed HttpOnly cookies
  (`Path=/api`, 30 days) — no session table needed and no token in JS.
  Wrong logins give one generic error (no account enumeration).
- **HTTP status semantics on the console**: anonymous requests get `401`;
  signed-in passengers get `403` on owner-only endpoints (authenticated but
  not authorized); counter operators get `403` on owner-only financials.
- **Ownership**: bookings store `user_id`. Signed-in users always receive their
  own ledger on `/my-bookings` — the email query string is ignored for them —
  so one account can't probe another's bookings. Guests keep the legacy
  email-based lookup (fine for a demo; a production deployment should retire it).
- **Demo staff accounts**: on first boot, a database that lacks an owner or a
  counter operator (no account of that role at all) is seeded with
  `owner@riders.demo` and `counter@riders.demo`, password `riders-demo-1`.
  Existing staff accounts are never touched (`ON CONFLICT DO NOTHING`); delete
  or change them for anything real.
- **Changing roles** from the CLI (account must exist — register in the app
  first):
  `node scripts/make-admin.mjs user@example.com owner` (or `counter`, or
  `demote` to send back to passenger).
- **Operator password**: still opens the console at owner level (`ADMIN_PASSWORD`,
  demo default `riders-admin` — set a real one anywhere users are reachable).
- **Staff management**: the owner panel creates/disables/resets/removes staff
  accounts (see `/admin` routes above). Disabled accounts lose console access
  immediately and cannot sign in; the schema keeps an `active` flag on users.

## Operator console

`/admin` in the app tailors itself to who signed in:

- **Counter console** (counter operator): the searchable bookings ledger
  (PNR, passenger, seats, amounts, refund status) with a **Check in** button per
  confirmed ticket — stamps `checked_in_at`, shown as "boarded ✓"; a second
  check-in is rejected with 409. No financial numbers are exposed.
- **Owner console** (owner, or the operator password): everything the counter
  sees plus revenue and seats-sold cards, cancellation stats with fees/refunds,
  best-selling routes, and the **staff panel** — create counter operators,
  disable/enable accounts (disabled accounts lose console access on their next
  request and can't sign in), reset passwords, and remove no-history accounts.
  Guards prevent disabling/removing yourself or the last active owner.
- The operator-password session is an HMAC-signed HttpOnly cookie scoped to
  `/api/admin`, expiring after 12 hours; staff accounts enter directly.

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
  session cookies; bookings are ownership-tagged (`user_id`); staff roles
  (`counter_operator`, `owner`) gate the console with an access ladder; login
  forms are rate-limited (30 logins / 10 min, 10 registrations / 10 min).
- **Known limitation**: guest lookup by raw email still exists (as in real
  Bangladeshi bus apps); signed-in users are never affected by it — their
  ledger is strictly their own. A production deployment would retire it.
