// End-to-end smoke test against a running API.
//
//   cd server && node scripts/smoke.mjs          (expects API on :4000)
//   SMOKE_BASE_URL=http://host:port npm run smoke
//
// Covers: health, cities, trip search, seat map, payment rejection
// (declined card + Luhn), booking, ticket lookup, my-bookings,
// cancel-quote math and cancellation. Exits 1 if anything fails.

const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

let failures = 0;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`  \u2713 ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures++;
    console.error(`  \u2717 ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      const { status, body } = await api("GET", "/api/health");
      if (status === 200 && body?.ok) return body;
    } catch {
      /* keep retrying while the server boots */
    }
    if (Date.now() > deadline) {
      throw new Error(`API never became healthy at ${BASE}. Is it running? (cd server && npm start)`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function luhnCheck(num) {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

// Find a Luhn-valid 16-digit card ending in "0000" — exactly what the mock
// issuer rejects — so the decline path is exercised with a legal card.
// Shape: 4 + a + 9 zeros + b + 0000  (1+1+9+1+4 = 16 digits)
function declinedCard() {
  for (let a = 0; a <= 9; a++) {
    for (let b = 0; b <= 9; b++) {
      const card = `4${a}000000000${b}0000`;
      if (card.length === 16 && luhnCheck(card)) return card;
    }
  }
  throw new Error("could not construct a Luhn-valid card ending in 0000");
}

async function main() {
  const h = await waitForHealth();
  check("health", true, `db: ${h.db}`);

  // --- cities ---
  const cities = await api("GET", "/api/cities");
  const names = (cities.body || []).map((c) => c.name);
  check("cities endpoint", cities.status === 200 && names.length >= 5, `${names.length} cities`);
  check("BD cities seeded", names.includes("Dhaka") && names.includes("Chattogram"));

  // --- trip search (a future date, far enough out to avoid demo-data collisions) ---
  const date = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const trips = await api("GET", `/api/trips?from=Dhaka&to=Chattogram&date=${date}`);
  check(
    "trip search Dhaka→Chattogram",
    trips.status === 200 && trips.body.length >= 1,
    `${(trips.body || []).length} trips on ${date}`
  );
  const trip = (trips.body || [])[0];
  if (!trip) throw new Error("No trips returned — seed data missing");
  check("trip carries price/seat data", Number(trip.price) > 0 && trip.total_seats > 0, `৳${trip.price}, ${trip.total_seats} seats`);

  // --- seat map: pick a genuinely free seat ---
  const map = await api("GET", `/api/trips/${trip.id}/seatmap?date=${date}`);
  const allSeats = (map.body?.layout?.rowsWithSeats || []).flatMap((r) => r.seats);
  const sold = new Set(map.body?.sold || []);
  const seat = allSeats.find((s) => !sold.has(s));
  check("seat map + free seat", Boolean(seat), seat);

  if (!seat) throw new Error("No free seat available to test booking");

  // --- payment rejection paths ---
  const declined = await api("POST", "/api/bookings", {
    trip_id: trip.id,
    date,
    seats: [seat],
    contact_name: "Smoke Test",
    email: "smoke@example.com",
    phone: "+8801700000001",
    payment: { card_number: declinedCard(), expiry: "09/29", cvv: "512" },
  });
  check(
    "card ending 0000 is declined (402)",
    declined.status === 402,
    `${declined.status} ${declined.body?.error ?? ""}`.trim()
  );
  const luhnBad = await api("POST", "/api/bookings", {
    trip_id: trip.id,
    date,
    seats: [seat],
    contact_name: "Smoke Test",
    email: "smoke@example.com",
    phone: "+8801700000001",
    payment: { card_number: "1234567890123456", expiry: "09/29", cvv: "512" },
  });
  check("Luhn-invalid card rejected", luhnBad.status === 400 && /luhn/i.test(luhnBad.body?.error ?? ""));

  // --- booking ---
  const good = "4111111111111111";
  const bk = await api("POST", "/api/bookings", {
    trip_id: trip.id,
    date,
    seats: [seat],
    contact_name: "Smoke Test",
    email: "smoke@example.com",
    phone: "+8801700000001",
    payment: { card_number: good, expiry: "09/29", cvv: "512" },
  });
  check(
    "booking created",
    bk.status >= 200 && bk.status < 300 && !!bk.body?.pnr,
    `PNR ${bk.body?.pnr} (HTTP ${bk.status})`
  );
  const pnr = bk.body?.pnr;
  const total = Number(bk.body?.total_amount);
  check("total = price × seats", total === Number(trip.price) * 1, `৳${total}`);

  // --- ticket + my-bookings ---
  const ticket = await api("GET", `/api/bookings/${pnr}`);
  check(
    "ticket lookup",
    ticket.status === 200 && ticket.body?.status === "confirmed" && ticket.body?.seats?.[0] === seat
  );
  const mine = await api("GET", "/api/my-bookings?email=smoke@example.com");
  check("my-bookings lists it", mine.status === 200 && mine.body.some((b) => b.pnr === pnr));

  // --- cancellation quote + cancel ---
  const expectedFee = Math.max(50, Math.ceil((total * 0.1) / 50) * 50);
  const quote = await api("GET", `/api/bookings/${pnr}/cancel-quote`);
  check(
    "cancel-quote = 10% (min ৳50, ৳50 steps)",
    quote.status === 200 && Number(quote.body?.fee) === expectedFee,
    `fee ${quote.body?.fee} ৳, refund ${quote.body?.refund} ৳`
  );
  const cancelled = await api("POST", `/api/bookings/${pnr}/cancel`);
  check(
    "cancel stores fee + refund",
    cancelled.status === 200 &&
      cancelled.body?.status === "cancelled" &&
      Number(cancelled.body?.cancellation_fee) === expectedFee &&
      Number(cancelled.body?.refund_amount) === total - expectedFee,
    `fee ${cancelled.body?.cancellation_fee}, refund ${cancelled.body?.refund_amount}`
  );
  const requoted = await api("GET", `/api/bookings/${pnr}/cancel-quote`);
  check("re-quote on cancelled booking blocked (409)", requoted.status === 409);

  // seat is free again
  const map2 = await api("GET", `/api/trips/${trip.id}/seatmap?date=${date}`);
  check("seat back on sale after cancel", !(map2.body?.sold || []).includes(seat));

  // --- admin console ---
  const wrong = await api("POST", "/api/admin/login", { password: "definitely-wrong" });
  check("admin rejects wrong password (401)", wrong.status === 401);
  const noAuth = await api("GET", "/api/admin/stats");
  check("admin endpoints locked without session (401)", noAuth.status === 401);

  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD || "riders-admin" }),
  });
  if (res.status !== 200) throw new Error(`admin login failed (HTTP ${res.status})`);
  const cookie = ((res.headers.getSetCookie?.() || [])[0] || "").split(";")[0];
  check("admin login issues session cookie", /riders_admin=/.test(cookie));

  const authedFetch = async (method, path) => {
    const resp = await fetch(BASE + path, { method, headers: { Cookie: cookie } });
    return { status: resp.status, body: await resp.json().catch(() => null) };
  };
  const me = await authedFetch("GET", "/api/admin/me");
  check("session cookie authenticates", me.status === 200 && me.body?.admin === true);
  const st = await authedFetch("GET", "/api/admin/stats");
  check(
    "admin stats",
    st.status === 200 && typeof st.body?.revenue === "number" && Array.isArray(st.body?.top_routes)
  );
  const list = await authedFetch("GET", "/api/admin/bookings?limit=10");
  check(
    "admin bookings list",
    list.status === 200 && Array.isArray(list.body) && list.body.some((b) => b.pnr === pnr),
    `${list.body?.length ?? 0} rows incl. PNR ${pnr}`
  );
  const searched = await authedFetch("GET", "/api/admin/bookings?q=" + pnr);
  check(
    "admin search by PNR",
    searched.status === 200 && Array.isArray(searched.body) && searched.body.length >= 1
  );

  // --- user accounts + authorization ---
  const uname = `Smoke User ${Date.now() % 100000}`;
  const uemail = `smoke.${Date.now() % 100000}@example.com`;
  const pw = "correct-horse-9";
  const reg = await api("POST", "/api/auth/register", { name: uname, email: uemail, password: pw });
  check("register creates account", reg.status === 201 && reg.body?.user?.role === "passenger");
  const regDup = await api("POST", "/api/auth/register", { name: uname, email: uemail, password: pw });
  check("duplicate email rejected (409)", regDup.status === 409);
  const badLogin = await api("POST", "/api/auth/login", { email: uemail, password: "wrong-pass" });
  check("login rejects wrong password (401)", badLogin.status === 401);
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: uemail, password: pw }),
  });
  const userCookie = ((loginRes.headers.getSetCookie?.() || [])[0] || "").split(";")[0];
  check("login issues session cookie", /riders_session=/.test(userCookie));
  const userFetch = async (method, path, body) =>
    fetch(BASE + path, { method, headers: { Cookie: userCookie, ...(body ? { "Content-Type": "application/json" } : {}), }, body: body ? JSON.stringify(body) : undefined })
      .then(async (resp) => ({ status: resp.status, body: await resp.json().catch(() => null) }));
  const meR = await userFetch("GET", "/api/auth/me");
  check("session authenticates as user", meR.status === 200 && meR.body?.user?.email === uemail);

  // A booking made by this user is linked and visible; a passenger role can't
  // reach the admin console (authorization check).
  const ubk = await userFetch("POST", "/api/bookings", {
    trip_id: trip.id, date, seats: [seat], contact_name: uname,
    email: uemail, phone: "+8801700000055",
    payment: { card_number: "4111111111111111", expiry: "09/29", cvv: "512" },
  });
  check("signed-in booking created", ubk.status >= 200 && ubk.status < 300 && !!ubk.body?.pnr);
  const mineUser = await userFetch("GET", "/api/my-bookings");
  check(
    "user ledger shows own booking (no email param)",
    mineUser.status === 200 && Array.isArray(mineUser.body) && mineUser.body.some((b) => b.pnr === ubk.body?.pnr)
  );
  const notAdmin = await userFetch("GET", "/api/admin/stats");
  check("passenger role blocked from console (401)", notAdmin.status === 401);
  const lo = await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: { Cookie: userCookie } });
  const cleared = ((lo.headers.getSetCookie?.() || [])[0] || "").includes("riders_session=");
  check("logout clears session cookie", lo.status === 200 && cleared);
}

main().catch((err) => {
  console.error(`  \u2717 smoke aborted — ${err.message}`);
  process.exitCode = 1;
});
