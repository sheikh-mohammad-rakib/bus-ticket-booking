# Riders — bus ticket booking (Bangladesh)

A full-stack bus ticket booking demo for Bangladesh: React (Vite) frontend,
Express API, **PostgreSQL** (via `pg`). Routes, operators and fares mirror
typical intercity coach travel in Bangladesh, priced in ৳ (BDT).

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
| POST   | `/bookings/:pnr/cancel`   | frees the seats back               |
| GET    | `/my-bookings?email`      | booking history                    |

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
