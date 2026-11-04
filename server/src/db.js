import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// Return Postgres DATE (oid 1082) as a plain 'YYYY-MM-DD' string instead of a
// JS Date, which a local-midnight -> UTC roundtrip can shift by one day.
pg.types.setTypeParser(1082, (v) => v);
import { seed } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Local dev default; production gets DATABASE_URL from the platform (Render/Railway/Fly)
export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/riders",
  max: 10,
});

export const q = (sql, params) => pool.query(sql, params);

export function isProd() {
  return process.env.NODE_ENV === "production";
}

// Optional debug logging of SQL in dev
fs.mkdirSync(path.join(__dirname, ".."), { recursive: true });

export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cities (
      id   SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS buses (
      id       SERIAL PRIMARY KEY,
      operator TEXT NOT NULL,
      name     TEXT NOT NULL,
      type     TEXT NOT NULL CHECK (type IN ('AC Seater','Sleeper','AC Sleeper','Non-AC')),
      rows     SMALLINT NOT NULL CHECK (rows BETWEEN 4 AND 12),
      cols     SMALLINT NOT NULL CHECK (cols IN (4, 5))
    );

    CREATE TABLE IF NOT EXISTS trips (
      id           SERIAL PRIMARY KEY,
      bus_id       INTEGER NOT NULL REFERENCES buses(id),
      from_city_id INTEGER NOT NULL REFERENCES cities(id),
      to_city_id   INTEGER NOT NULL REFERENCES cities(id),
      depart_time  TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      price        NUMERIC(10,2) NOT NULL,
      CHECK (from_city_id != to_city_id)
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id           SERIAL PRIMARY KEY,
      pnr          TEXT NOT NULL UNIQUE,
      trip_id      INTEGER NOT NULL REFERENCES trips(id),
      travel_date  DATE NOT NULL,
      contact_name TEXT NOT NULL,
      email        TEXT NOT NULL,
      phone        TEXT NOT NULL,
      total_amount NUMERIC(10,2) NOT NULL,
      status       TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS booking_seats (
      id         SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      seat       TEXT NOT NULL,
      UNIQUE (booking_id, seat)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_trip_date ON bookings(trip_id, travel_date);
    CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email);
  `);

  // Cancellation charges (added after first launch; idempotent)
  await pool.query(`
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_fee NUMERIC(10,2);
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10,2);
  `);
}

export async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM trips");
  if (rows[0].n > 0) return;
  console.log("Empty database — seeding sample Bangladesh routes…");
  await seed();
}
