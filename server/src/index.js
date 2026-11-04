import express from "express";
import cors from "cors";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, q, ensureSchema, seedIfEmpty } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// ---------- helpers ----------

const TRIP_SELECT = `
  SELECT t.id, t.depart_time, t.duration_min, t.price,
         b.id AS bus_id, b.operator, b.name AS bus_name, b.type, b.rows, b.cols,
         cf.name AS from_city, ct.name AS to_city
  FROM trips t
  JOIN buses b ON b.id = t.bus_id
  JOIN cities cf ON cf.id = t.from_city_id
  JOIN cities ct ON ct.id = t.to_city_id
`;

function makePnr() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i++) code += chars[bytes[i] % chars.length];
  return `RT${code}`;
}

function fmtDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : null;
}

const soldSeatsStmt = (tripId, date) =>
  q(
    `SELECT s.seat
     FROM bookings bk
     JOIN booking_seats s ON s.booking_id = bk.id
     WHERE bk.trip_id = $1 AND bk.travel_date = $2 AND bk.status = 'confirmed'`,
    [tripId, date]
  );

// Mock payment validation: Luhn check; decline cards ending in "0000"
function luhnValid(numStr) {
  let sum = 0;
  let dbl = false;
  for (let i = numStr.length - 1; i >= 0; i--) {
    let d = numStr.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

// ---------- routes ----------

app.get("/api/cities", async (_req, res) => {
  try {
    const { rows } = await q("SELECT id, name FROM cities ORDER BY name");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load cities" });
  }
});

// Search trips: /api/trips?from=Dhaka&to=Chattogram&date=2026-11-05
app.get("/api/trips", async (req, res) => {
  const { from, to, date } = req.query;
  if (!from || !to) return res.status(400).json({ error: "from and to cities are required" });
  const travelDate = fmtDate(date);
  if (!travelDate) return res.status(400).json({ error: "date must be YYYY-MM-DD" });

  try {
    const { rows: trips } = await q(
      `${TRIP_SELECT} WHERE cf.name = $1 AND ct.name = $2 ORDER BY t.depart_time`,
      [from, to]
    );
    const results = await Promise.all(
      trips.map(async (t) => {
        const { rows: sold } = await soldSeatsStmt(t.id, travelDate);
        const totalSeats = t.rows * t.cols;
        return {
          id: t.id,
          from_city: t.from_city,
          to_city: t.to_city,
          depart_time: t.depart_time,
          duration_min: t.duration_min,
          price: t.price,
          operator: t.operator,
          bus_name: t.bus_name,
          type: t.type,
          total_seats: totalSeats,
          available_seats: totalSeats - sold.length,
        };
      })
    );
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to search trips" });
  }
});

// Seat map for a trip on a date
app.get("/api/trips/:id/seatmap", async (req, res) => {
  const date = fmtDate(req.query.date);
  if (!date) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  try {
    const { rows } = await q(`${TRIP_SELECT} WHERE t.id = $1`, [req.params.id]);
    const trip = rows[0];
    if (!trip) return res.status(404).json({ error: "Trip not found" });

    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const seatRows = [];
    for (let r = 0; r < trip.rows; r++) {
      const seats = [];
      for (let n = 1; n <= trip.cols; n++) seats.push(`${letters[r]}${n}`);
      seatRows.push({ label: letters[r], seats, aisleAfter: trip.cols === 4 ? [2] : [2, 4] });
    }

    const { rows: sold } = await soldSeatsStmt(trip.id, date);
    res.json({
      trip: {
        id: trip.id,
        operator: trip.operator,
        bus_name: trip.bus_name,
        type: trip.type,
        from_city: trip.from_city,
        to_city: trip.to_city,
        depart_time: trip.depart_time,
        duration_min: trip.duration_min,
        price: trip.price,
      },
      date,
      layout: { rows: trip.rows, cols: trip.cols, rowsWithSeats: seatRows },
      sold: sold.map((s) => s.seat),
      price_per_seat: trip.price,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load seat map" });
  }
});

// Create booking
app.post("/api/bookings", async (req, res) => {
  const { trip_id, date, seats, contact_name, email, phone, payment } = req.body || {};

  const travelDate = fmtDate(date);
  if (!travelDate) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  if (!Array.isArray(seats) || seats.length === 0 || seats.length > 6)
    return res.status(400).json({ error: "Provide 1-6 seats" });
  if (typeof seats[0] !== "string" || seats.some((s) => !/^[A-L]\d{1,2}$/.test(s)))
    return res.status(400).json({ error: "Invalid seat id" });
  if (new Set(seats).size !== seats.length)
    return res.status(400).json({ error: "Duplicate seats" });
  if (!contact_name || typeof contact_name !== "string" || contact_name.trim().length < 2)
    return res.status(400).json({ error: "contact_name is required" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || ""))
    return res.status(400).json({ error: "A valid email is required" });
  if (!/^\+?[\d\s-]{7,15}$/.test(phone || ""))
    return res.status(400).json({ error: "A valid phone number is required" });

  if (!payment || !/^\d{12,19}$/.test(String(payment.card_number || "")))
    return res.status(400).json({ error: "card_number must be 12-19 digits" });
  if (!luhnValid(String(payment.card_number)))
    return res.status(400).json({ error: "Card number failed validation (Luhn)" });
  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(String(payment.expiry || "")))
    return res.status(400).json({ error: "expiry must be MM/YY" });
  if (!/^\d{3,4}$/.test(String(payment.cvv || "")))
    return res.status(400).json({ error: "cvv must be 3-4 digits" });
  if (String(payment.card_number).endsWith("0000"))
    return res.status(402).json({ error: "Payment declined by issuer (mock): card ended in 0000" });

  try {
    const booking = await createBooking({
      tripId: Number(trip_id),
      travelDate,
      seats,
      contactName: contact_name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
    });
    res.status(201).json(booking);
  } catch (err) {
    if (err.code === "SEAT_TAKEN" || err.code === "TRIP_NOT_FOUND") {
      return res.status(409).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Booking failed" });
  }
});

async function createBooking({ tripId, travelDate, seats, contactName, email, phone }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize per trip: this row lock makes concurrent seat checks safe
    const tripRes = await client.query(`${TRIP_SELECT} WHERE t.id = $1 FOR UPDATE OF t`, [tripId]);
    const trip = tripRes.rows[0];
    if (!trip) {
      const e = new Error("Trip not found");
      e.code = "TRIP_NOT_FOUND";
      throw e;
    }

    const soldRes = await client.query(
      `SELECT s.seat
       FROM bookings bk
       JOIN booking_seats s ON s.booking_id = bk.id
       WHERE bk.trip_id = $1 AND bk.travel_date = $2 AND bk.status = 'confirmed'`,
      [tripId, travelDate]
    );
    const sold = new Set(soldRes.rows.map((r) => r.seat));
    const taken = seats.filter((s) => sold.has(s));
    if (taken.length > 0) {
      const e = new Error(`Seats already taken: ${taken.join(", ")}`);
      e.code = "SEAT_TAKEN";
      throw e;
    }

    const total = Number(trip.price) * seats.length;
    const pnr = makePnr();
    const ins = await client.query(
      `INSERT INTO bookings (pnr, trip_id, travel_date, contact_name, email, phone, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [pnr, tripId, travelDate, contactName, email, phone, total]
    );
    const bookingId = ins.rows[0].id;

    for (const s of seats) {
      await client.query("INSERT INTO booking_seats (booking_id, seat) VALUES ($1, $2)", [bookingId, s]);
    }

    await client.query("COMMIT");
    return ticketPayload(pnr);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function ticketPayload(pnr) {
  const { rows } = await q(
    `SELECT bk.*, t.depart_time, t.duration_min, t.price,
            cf.name AS from_city, ct.name AS to_city,
            b.operator, b.name AS bus_name, b.type
     FROM bookings bk
     JOIN trips t ON t.id = bk.trip_id
     JOIN buses b ON b.id = t.bus_id
     JOIN cities cf ON cf.id = t.from_city_id
     JOIN cities ct ON ct.id = t.to_city_id
     WHERE bk.pnr = $1`,
    [pnr]
  );
  const bk = rows[0];
  if (!bk) return null;
  const seats = await q("SELECT seat FROM booking_seats WHERE booking_id = $1 ORDER BY seat", [bk.id]);
  return {
    pnr: bk.pnr,
    status: bk.status,
    travel_date: typeof bk.travel_date === "string" ? bk.travel_date.slice(0, 10) : bk.travel_date.toISOString().slice(0, 10),
    route: `${bk.from_city} → ${bk.to_city}`,
    from_city: bk.from_city,
    to_city: bk.to_city,
    bus: { operator: bk.operator, name: bk.bus_name, type: bk.type },
    depart_time: bk.depart_time,
    duration_min: bk.duration_min,
    contact: { name: bk.contact_name, email: bk.email, phone: bk.phone },
    seats: seats.rows.map((s) => s.seat),
    total_amount: bk.total_amount,
    cancellation_fee: bk.cancellation_fee,
    refund_amount: bk.refund_amount,
    created_at: bk.created_at,
  };
}

// Cancellation charge: 10% of what was paid, at least ৳50, rounded up to ৳50
function cancellationFee(total) {
  const n = Number(total) || 0;
  return Math.max(50, Math.ceil((n * 0.1) / 50) * 50);
}

// What a cancellation would cost, before confirming
app.get("/api/bookings/:pnr/cancel-quote", async (req, res) => {
  const pnr = String(req.params.pnr).toUpperCase();
  try {
    const { rows } = await q(
      "SELECT status, total_amount FROM bookings WHERE pnr = $1",
      [pnr]
    );
    const bk = rows[0];
    if (!bk) return res.status(404).json({ error: "Booking not found" });
    if (bk.status === "cancelled")
      return res.status(409).json({ error: "Already cancelled" });
    const fee = cancellationFee(bk.total_amount);
    res.json({
      fee,
      refund: Math.max(0, Number(bk.total_amount) - fee),
      note: "10% of the ticket value, minimum ৳50, rounded up to ৳50 steps",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Quote failed" });
  }
});

// Ticket lookup by PNR
app.get("/api/bookings/:pnr", async (req, res) => {
  try {
    const ticket = await ticketPayload(String(req.params.pnr).toUpperCase());
    if (!ticket) return res.status(404).json({ error: "Booking not found" });
    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

// Cancel a booking
app.post("/api/bookings/:pnr/cancel", async (req, res) => {
  const pnr = String(req.params.pnr).toUpperCase();
  try {
    const { rows } = await q("SELECT id, status, total_amount FROM bookings WHERE pnr = $1", [pnr]);
    const bk = rows[0];
    if (!bk) return res.status(404).json({ error: "Booking not found" });
    if (bk.status === "cancelled") return res.status(409).json({ error: "Already cancelled" });

    const fee = cancellationFee(bk.total_amount);
    const refund = Math.max(0, Number(bk.total_amount) - fee);
    await q(
      "UPDATE bookings SET status = 'cancelled', cancellation_fee = $1, refund_amount = $2 WHERE id = $3",
      [fee, refund, bk.id]
    );
    res.json(await ticketPayload(pnr));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Cancellation failed" });
  }
});

// List bookings by email
app.get("/api/my-bookings", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return res.status(400).json({ error: "A valid email is required" });
  try {
    const { rows } = await q("SELECT pnr FROM bookings WHERE email = $1 ORDER BY created_at DESC", [email]);
    const tickets = await Promise.all(rows.map((r) => ticketPayload(r.pnr)));
    res.json(tickets.filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await q("SELECT 1");
    res.json({ ok: true, db: "postgres" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, db: "unreachable" });
  }
});

app.use((_err, _req, res, _next) => {
  res.status(500).json({ error: "Internal server error" });
});

// Serve the built React app (client/dist) when deployed as a single service
const clientDist = fileURLToPath(new URL("../../client/dist/", import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

async function main() {
  await ensureSchema();
  await seedIfEmpty();
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT} (Postgres)`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
