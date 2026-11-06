import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, q, ensureSchema, seedIfEmpty, seedStaffIfNone } from "./db.js";
import { cancellationFee } from "./fares.js";
import { luhnValid } from "./luhn.js";
import { userSessionCodec } from "./session.js";

const app = express();

// Behind Render/Railway/ingress proxies so rate limits key on the real client IP
app.set("trust proxy", 1);
app.disable("x-powered-by");

// ---------- security headers ----------
// CSP is tuned for this app: Vite-built self-hosted assets + Google Fonts.
// Everything else stays at helmet's strict defaults (no frames, no sniffing,
// HSTS on http requests that reach us over TLS platforms, no object loading).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'"],
        "style-src": ["'self'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'none'"],
      },
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

// ---------- CORS allowlist ----------
// Dev: the Vite origin. Deployed single-service: same-origin requests carry no
// Origin header and pass through. Extra origins can be added via CORS_ORIGIN.
const CORS_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || CORS_ORIGINS.includes(origin)) return cb(null, true);
      return cb(null, false); // deny quietly, don't reflect
    },
  })
);

// Hard cap on request bodies (bookings are a few hundred bytes of JSON)
app.use(express.json({ limit: "16kb" }));

// ---------- rate limiting ----------
// Flood control for the whole API.
const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests — slow down." },
});

// Seat-buying is the expensive, abusable endpoint: cap attempts per IP.
const purchaseLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many booking attempts — try again in a few minutes." },
});

// PNR/email lookups are the guessable surface — heavier throttling.
const lookupLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many lookups — slow down." },
});

app.use("/api", apiLimiter);

// ---------- admin auth ----------
// Single-operator demo auth: ADMIN_PASSWORD env + a signed, expiring session
// cookie (HttpOnly). The cookie Path is scoped to /api/admin so nothing else
// triggers it, and the signature is derived from the password itself, so
// changing the password instantly invalidates all existing sessions.
const ADMIN_COOKIE = "riders_admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "riders-admin"; // demo default
const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;

function adminSecret() {
  return createHmac("sha256", "riders-admin-session-v1").update(ADMIN_PASSWORD).digest();
}
function signSession(expMs) {
  const exp = String(expMs);
  return `${exp}.${createHmac("sha256", adminSecret()).update(exp).digest("base64url")}`;
}
function verifySession(token) {
  const dot = (token || "").indexOf(".");
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = signSession(Number(exp)).split(".")[1];
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const expMs = Number(exp);
  return Number.isInteger(expMs) && Date.now() < expMs;
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Brute-force guard on the login forms only. Registration has its own, smaller
// limiter — a full smoke run does several legitimate logins plus one register,
// so sharing one budget made second test runs 429.
const loginLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts — try again in a few minutes." },
});

const registerLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-ups from this device — try again in a few minutes." },
});

// ---------- user accounts ----------
// Stateless signed session cookies: the token carries {userId, expiry} and an
// HMAC bound to the server secret, so no session table is needed. Set
// AUTH_SECRET in production; without it the secret derives from ADMIN_PASSWORD
// (changing either password logs everyone out — acceptable, and honest).
const USER_COOKIE = "riders_session";
const USER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const userSecret = () =>
  process.env.AUTH_SECRET
    ? createHmac("sha256", process.env.AUTH_SECRET).update("riders-user-session-v1").digest()
    : createHmac("sha256", ADMIN_PASSWORD).update("riders-user-session-v1").digest();
const userSession = userSessionCodec(userSecret());
const signUserSession = userSession.sign;
const verifyUserSession = userSession.verify;

function setSessionCookie(req, res, userId) {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.cookie(USER_COOKIE, signUserSession(userId, Date.now() + USER_SESSION_MS), {
    httpOnly: true,
    sameSite: "lax",
    path: "/api",
    secure,
    maxAge: USER_SESSION_MS,
  });
}

// Populates req.user from the session cookie / bearer token (one lookup per request)
async function attachUser(req, _res, next) {
  const token = parseCookies(req)[USER_COOKIE] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const userId = verifyUserSession(token);
  if (userId) {
    const { rows } = await q("SELECT id, name, email, role FROM users WHERE id = $1 AND active", [userId]);
    if (rows[0]) req.user = rows[0];
  }
  next();
}
app.use("/api", attachUser);

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Sign in to do that" });
  next();
}

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
app.post("/api/bookings", purchaseLimiter, async (req, res) => {
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
  if (typeof email !== "string" || email.length > 120 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return res.status(400).json({ error: "A valid email is required" });
  if (typeof phone !== "string" || phone.length > 20 || !/^\+?[\d\s-]{7,15}$/.test(phone))
    return res.status(400).json({ error: "A valid phone number is required" });
  const cleanName = contact_name.trim().slice(0, 80);

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
      contactName: cleanName,
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      userId: req.user?.id ?? null,
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

async function createBooking({ tripId, travelDate, seats, contactName, email, phone, userId = null }) {
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
      `INSERT INTO bookings (pnr, trip_id, travel_date, contact_name, email, phone, total_amount, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [pnr, tripId, travelDate, contactName, email, phone, total, userId]
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
    checked_in_at: bk.checked_in_at,
    created_at: bk.created_at,
  };
}

// What a cancellation would cost, before confirming
app.get("/api/bookings/:pnr/cancel-quote", lookupLimiter, async (req, res) => {
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
app.get("/api/bookings/:pnr", lookupLimiter, async (req, res) => {
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
app.post("/api/bookings/:pnr/cancel", lookupLimiter, async (req, res) => {
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
app.get("/api/my-bookings", lookupLimiter, async (req, res) => {
  try {
    // Authorization: signed-in users always see their own ledger, even if a
    // different email is supplied in the query string.
    if (req.user) {
      const { rows } = await q("SELECT pnr FROM bookings WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]);
      const tickets = await Promise.all(rows.map((r) => ticketPayload(r.pnr)));
      return res.json(tickets.filter(Boolean));
    }
    const email = String(req.query.email || "").trim().toLowerCase().slice(0, 120);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return res.status(400).json({ error: "A valid email is required (or sign in)" });
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

// ---------- user auth endpoints ----------
app.post("/api/auth/register", registerLimiter, async (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 80);
  const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 120);
  const password = String(req.body?.password || "");

  if (name.length < 2) return res.status(400).json({ error: "Your name is required" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return res.status(400).json({ error: "A valid email is required" });
  if (password.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (password.length > 100)
    return res.status(400).json({ error: "Password is too long" });

  try {
    const existing = await q("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows[0]) return res.status(409).json({ error: "An account with this email already exists" });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await q(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, role",
      [name, email, hash]
    );
    setSessionCookie(req, res, rows[0].id);
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 120);
  const password = String(req.body?.password || "");
  try {
    const { rows } = await q("SELECT id, name, email, role, active, password_hash FROM users WHERE email = $1", [email]);
    const user = rows[0];
    // One generic message: don't reveal whether the email exists
    const hash = user?.password_hash || "$2a$10$invalidsaltinvalidsaltinvalidsaltinvalidsaltinvalidsalthe";
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) return res.status(401).json({ error: "Wrong email or password" });
    if (!user.active) return res.status(403).json({ error: "This account has been disabled. Contact the operator." });
    setSessionCookie(req, res, user.id);
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.get("/api/auth/me", requireUser, (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(USER_COOKIE, { path: "/api" });
  res.json({ user: null });
});

// ---------- admin dashboard endpoints ----------
app.post("/api/admin/login", loginLimiter, (req, res) => {
  const pw = String(req.body?.password || "");
  const a = Buffer.from(pw);
  const b = Buffer.from(ADMIN_PASSWORD);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  if (!ok) return res.status(401).json({ error: "Wrong password" });
  // Secure flag whenever the connection is TLS (Render/Railway behind proxy)
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  res.cookie(ADMIN_COOKIE, signSession(Date.now() + ADMIN_SESSION_MS), {
    httpOnly: true,
    sameSite: "lax",
    path: "/api/admin",
    secure,
    maxAge: ADMIN_SESSION_MS,
  });
  res.json({ admin: true, level: "owner" });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: "/api/admin" });
  res.json({ admin: false });
});

app.get("/api/admin/me", (req, res) => {
  const level = operatorLevel(req);
  if (!level) return res.status(401).json({ error: "Admin access required" });
  res.json({ admin: true, level });
});

// ---------- staff management (owner only) ----------
app.get("/api/admin/staff", requireOwner, async (_req, res) => {
  try {
    const { rows } = await q(
      `SELECT id, name, email, role, active, created_at
       FROM users
       WHERE role IN ('counter_operator', 'owner')
       ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load staff" });
  }
});

app.post("/api/admin/staff", requireOwner, async (req, res) => {
  const name = String(req.body?.name || "").trim().slice(0, 80);
  const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 120);
  const password = String(req.body?.password || "");
  const role = req.body?.role === "owner" ? "owner" : "counter_operator";

  if (!name) return res.status(400).json({ error: "Name is required" });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return res.status(400).json({ error: "A valid email is required" });
  if (password.length < 8)
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  if (password.length > 100)
    return res.status(400).json({ error: "Password is too long" });

  try {
    const existing = await q("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows[0]) return res.status(409).json({ error: "An account with this email already exists" });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await q(
      "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, active",
      [name, email, hash, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not create the account" });
  }
});

// Disable / re-enable a staff account, optionally reset their password
app.patch("/api/admin/staff/:id", requireOwner, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad staff id" });
  const { active } = req.body || {};
  const newPassword = req.body?.password;

  try {
    const { rows } = await q("SELECT id, role FROM users WHERE id = $1", [id]);
    const target = rows[0];
    if (!target) return res.status(404).json({ error: "Staff member not found" });
    if (target.role !== "counter_operator" && target.role !== "owner")
      return res.status(400).json({ error: "Only staff accounts can be managed here" });

    if (active === false) {
      // Never lock the console: keep the current owner signed in and keep at
      // least one active owner in the system.
      if (target.id === req.user?.id)
        return res.status(409).json({ error: "You cannot disable your own account" });
      if (target.role === "owner") {
        const { rows: owners } = await q(
          "SELECT COUNT(*)::int AS n FROM users WHERE role = 'owner' AND active AND id <> $1",
          [id]
        );
        if (owners[0].n === 0)
          return res.status(409).json({ error: "You cannot disable the last active owner" });
      }
    }

    if (typeof active === "boolean") {
      await q("UPDATE users SET active = $1 WHERE id = $2", [active, id]);
    }
    if (newPassword != null) {
      if (newPassword.length < 8)
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      if (newPassword.length > 100)
        return res.status(400).json({ error: "Password is too long" });
      await q("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(newPassword, 10), id]);
    }

    const { rows: out } = await q(
      "SELECT id, name, email, role, active FROM users WHERE id = $1",
      [id]
    );
    res.json(out[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update the account" });
  }
});

app.delete("/api/admin/staff/:id", requireOwner, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad staff id" });
  try {
    const { rows } = await q("SELECT id, role FROM users WHERE id = $1", [id]);
    const target = rows[0];
    if (!target) return res.status(404).json({ error: "Staff member not found" });
    if (target.role !== "counter_operator" && target.role !== "owner")
      return res.status(400).json({ error: "Only staff accounts can be managed here" });
    if (target.id === req.user?.id)
      return res.status(409).json({ error: "You cannot remove your own account" });
    if (target.role === "owner") {
      const { rows: owners } = await q(
        "SELECT COUNT(*)::int AS n FROM users WHERE role = 'owner' AND active AND id <> $1",
        [id]
      );
      if (owners[0].n === 0)
        return res.status(409).json({ error: "You cannot remove the last active owner" });
    }
    const history = await q("SELECT COUNT(*)::int AS n FROM bookings WHERE user_id = $1", [id]);
    if (history.rows[0].n > 0)
      return res.status(409).json({ error: "This account has booking history — disable it instead" });
    await q("DELETE FROM users WHERE id = $1", [id]);
    res.json({ removed: true, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove the account" });
  }
});

// Access ladder: counter operator < owner. The operator password (if used)
// grants owner level; staff accounts carry a role.
function operatorLevel(req) {
  if (verifySession(parseCookies(req)[ADMIN_COOKIE])) return "owner";
  if (req.user?.role === "owner") return "owner";
  if (req.user?.role === "counter_operator") return "operator";
  return null;
}

function requireOperator(req, res, next) {
  // 401 = anonymous; 403 = signed in but not staff
  if (operatorLevel(req)) return next();
  if (req.user) return res.status(403).json({ error: "Staff access required" });
  res.status(401).json({ error: "Staff access required" });
}

function requireOwner(req, res, next) {
  const level = operatorLevel(req);
  if (level === "owner") return next();
  // 401 = anonymous; 403 = signed in (staff or passenger) but not the owner
  if (level || req.user) return res.status(403).json({ error: "Owner access required" });
  res.status(401).json({ error: "Staff access required" });
}

// Aggregate stats for the dashboard cards
app.get("/api/admin/stats", requireOwner, async (_req, res) => {
  try {
    const { rows } = await q(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'confirmed')::int                                          AS confirmed,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int                                          AS cancelled,
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int                                    AS booked_today,
        COALESCE(SUM(total_amount) FILTER (WHERE status = 'confirmed'), 0)::float                  AS revenue,
        COALESCE(SUM(cancellation_fee) FILTER (WHERE status = 'cancelled'), 0)::float              AS cancel_fees,
        COALESCE(SUM(refund_amount) FILTER (WHERE status = 'cancelled'), 0)::float                 AS refunds,
        (SELECT COUNT(*)::int FROM booking_seats
          WHERE booking_id IN (SELECT id FROM bookings WHERE status = 'confirmed'))                AS seats_sold
      FROM bookings
    `);
    const topRoutes = await q(`
      SELECT cf.name AS from_city, ct.name AS to_city, COUNT(bs.id)::int AS seats,
             COALESCE(SUM(bk.total_amount), 0)::float AS revenue
      FROM bookings bk
      JOIN booking_seats bs ON bs.booking_id = bk.id
      JOIN trips t  ON t.id = bk.trip_id
      JOIN cities cf ON cf.id = t.from_city_id
      JOIN cities ct ON ct.id = t.to_city_id
      WHERE bk.status = 'confirmed'
      GROUP BY cf.name, ct.name
      ORDER BY seats DESC
      LIMIT 5
    `);
    res.json({ ...rows[0], top_routes: topRoutes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stats failed" });
  }
});

// Recent/filtered bookings ledger — counter operators and owners both need this
app.get("/api/admin/bookings", requireOperator, async (req, res) => {
  const query = String(req.query.q || "").trim().slice(0, 60);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  try {
    const { rows } = await query
      ? await q(
          `SELECT bk.pnr, bk.travel_date, bk.status, bk.total_amount,
                  bk.cancellation_fee, bk.refund_amount, bk.contact_name, bk.email,
                  bk.created_at, t.depart_time, b.operator, bk.checked_in_at,
                  cf.name AS from_city, ct.name AS to_city,
                  COALESCE(STRING_AGG(bs.seat, ' ' ORDER BY bs.seat), '') AS seats
           FROM bookings bk
           JOIN trips t ON t.id = bk.trip_id
           JOIN buses b ON b.id = t.bus_id
           JOIN cities cf ON cf.id = t.from_city_id
           JOIN cities ct ON ct.id = t.to_city_id
           LEFT JOIN booking_seats bs ON bs.booking_id = bk.id
           WHERE bk.email ILIKE $1 OR bk.pnr ILIKE $1 OR bk.contact_name ILIKE $1 OR bk.phone ILIKE $1
           GROUP BY bk.id, t.id, b.operator, cf.name, ct.name
           ORDER BY bk.created_at DESC
           LIMIT $2`,
          [`%${query}%`, limit]
        )
      : await q(
          `SELECT bk.pnr, bk.travel_date, bk.status, bk.total_amount,
                  bk.cancellation_fee, bk.refund_amount, bk.contact_name, bk.email,
                  bk.created_at, t.depart_time, b.operator, bk.checked_in_at,
                  cf.name AS from_city, ct.name AS to_city,
                  COALESCE(STRING_AGG(bs.seat, ' ' ORDER BY bs.seat), '') AS seats
           FROM bookings bk
           JOIN trips t ON t.id = bk.trip_id
           JOIN buses b ON b.id = t.bus_id
           JOIN cities cf ON cf.id = t.from_city_id
           JOIN cities ct ON ct.id = t.to_city_id
           LEFT JOIN booking_seats bs ON bs.booking_id = bk.id
           GROUP BY bk.id, t.id, b.operator, cf.name, ct.name
           ORDER BY bk.created_at DESC
           LIMIT $1`,
          [limit]
        );
    res.json(rows.map((r) => ({ ...r, travel_date: typeof r.travel_date === "string" ? r.travel_date : r.travel_date.toISOString().slice(0, 10) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Listing failed" });
  }
});

// Counter operator stamps a boarding ticket
app.post("/api/admin/bookings/:pnr/checkin", requireOperator, async (req, res) => {
  const pnr = String(req.params.pnr).toUpperCase().slice(0, 20);
  try {
    const { rows } = await q(
      `SELECT bk.pnr, bk.status, bk.checked_in_at FROM bookings bk WHERE bk.pnr = $1`,
      [pnr]
    );
    const bk = rows[0];
    if (!bk) return res.status(404).json({ error: "Booking not found" });
    if (bk.status === "cancelled") return res.status(409).json({ error: "This ticket was cancelled" });
    if (bk.checked_in_at) return res.status(409).json({ error: "Already checked in", checked_in_at: bk.checked_in_at });
    await q("UPDATE bookings SET checked_in_at = now() WHERE pnr = $1", [pnr]);
    const out = await q("SELECT checked_in_at FROM bookings WHERE pnr = $1", [pnr]);
    res.json({ pnr, checked_in: true, checked_in_at: out.rows[0].checked_in_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Check-in failed" });
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
  await seedStaffIfNone();
  app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT} (Postgres)`);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
