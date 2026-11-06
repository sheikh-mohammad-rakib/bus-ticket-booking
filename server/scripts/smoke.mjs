// End-to-end smoke test against a running API.
//
//   cd server && node scripts/smoke.mjs          (expects API on :4000)
//   SMOKE_BASE_URL=http://host:port npm run smoke
//
// Covers: health, cities, trip search, seat map, payment rejection
// (declined card + Luhn), booking, ticket lookup, my-bookings,
// cancel-quote math and cancellation. Exits 1 if anything fails.

const BASE = (process.env.SMOKE_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
import { luhnValid } from "../src/luhn.js";

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

// Find a Luhn-valid 16-digit card ending in "0000" — exactly what the mock
// issuer rejects — so the decline path is exercised with a legal card.
// Shape: 4 + a + 9 zeros + b + 0000  (1+1+9+1+4 = 16 digits)
function declinedCard() {
  for (let a = 0; a <= 9; a++) {
    for (let b = 0; b <= 9; b++) {
      const card = `4${a}000000000${b}0000`;
      if (card.length === 16 && luhnValid(card)) return card;
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
  check("passenger role denied financial stats (403)", notAdmin.status === 403);
  const lo = await fetch(`${BASE}/api/auth/logout`, { method: "POST", headers: { Cookie: userCookie } });
  const cleared = ((lo.headers.getSetCookie?.() || [])[0] || "").includes("riders_session=");
  check("logout clears session cookie", lo.status === 200 && cleared);

  // --- three roles: counter operator < owner ---
  // Demo staff accounts are seeded by the server on first boot.
  const staffLogin = async (email, password) => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.status !== 200) throw new Error(`staff login failed for ${email} (HTTP ${res.status})`);
    const cookie2 = ((res.headers.getSetCookie?.() || [])[0] || "").split(";")[0];
    return async (method, path, body) =>
      fetch(BASE + path, { method, headers: { Cookie: cookie2, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined })
        .then(async (resp) => ({ status: resp.status, body: await resp.json().catch(() => null) }));
  };

  const counter = await staffLogin("counter@riders.demo", "riders-demo-1");
  const counterMe = await counter("GET", "/api/admin/me");
  check("counter operator authenticates at operator level", counterMe.status === 200 && counterMe.body?.level === "operator");
  const counterStats = await counter("GET", "/api/admin/stats");
  check("operator denied financial stats (403)", counterStats.status === 403);
  const counterLedger = await counter("GET", "/api/admin/bookings");
  check("operator sees bookings ledger", counterLedger.status === 200 && Array.isArray(counterLedger.body) && counterLedger.body.length >= 1);

  // Boarding check-in on the confirmed booking made by the user account above
  const boardPnr = ubk.body?.pnr;
  const ci = await counter("POST", `/api/admin/bookings/${boardPnr}/checkin`);
  check("operator checks a passenger in", ci.status === 200 && ci.body?.checked_in === true);
  const ciDup = await counter("POST", `/api/admin/bookings/${boardPnr}/checkin`);
  check("double check-in rejected (409)", ciDup.status === 409);
  const ledgerAfter = await counter("GET", `/api/admin/bookings?q=${boardPnr}`);
  check(
    "ledger row carries the check-in stamp",
    ledgerAfter.status === 200 && Array.isArray(ledgerAfter.body) && !!ledgerAfter.body[0]?.checked_in_at
  );

  const ownerFetchPlain = async (method, path, body) =>
    fetch(BASE + path, { method, headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined })
      .then(async (resp) => ({ status: resp.status, body: await resp.json().catch(() => null) }));

  const owner = await staffLogin("owner@riders.demo", "riders-demo-1").catch(() => null);
  // Either the seeded demo owner account or the operator-password cookie: both are owner level
  const ownerAs = owner || ownerFetchPlain;
  if (owner) {
    const ownerMe = await ownerAs("GET", "/api/admin/me");
    check("owner authenticates at owner level", ownerMe.status === 200 && ownerMe.body?.level === "owner");
  } else {
    const ownerMe = await ownerAs("GET", "/api/admin/me");
    check("owner level authenticates via password cookie", ownerMe.status === 200 && ownerMe.body?.level === "owner");
  }
  const ownerStats = await ownerAs("GET", "/api/admin/stats");
  check("owner sees financial stats", ownerStats.status === 200 && "revenue" in (ownerStats.body || {}));

  // --- staff management (owner only) ---
  const counterStaff = await counter("GET", "/api/admin/staff");
  check("operator denied staff panel (403)", counterStaff.status === 403);

  const staffList = await ownerAs("GET", "/api/admin/staff");
  check(
    "owner sees staff list",
    staffList.status === 200 && Array.isArray(staffList.body) &&
      staffList.body.every((u) => u.role === "owner" || u.role === "counter_operator"),
    `${staffList.body?.length ?? 0} staff accounts`
  );

  // Create a fresh counter operator, then put its account through disable/enable
  const semail = `smoke.staff.${Date.now() % 100000}@example.com`;
  const spw = "counter-demo-77";
  const newStaff = await ownerAs("POST", "/api/admin/staff", {
    name: "Smoke Counter", email: semail, password: spw,
  });
  check("owner creates counter operator (201)", newStaff.status === 201 && newStaff.body?.role === "counter_operator" && newStaff.body?.active === true);
  const dupStaff = await ownerAs("POST", "/api/admin/staff", {
    name: "Smoke Counter", email: semail, password: spw,
  });
  check("duplicate staff email rejected (409)", dupStaff.status === 409);

  const op = await staffLogin(semail, spw);
  const opLevel = await op("GET", "/api/admin/me");
  check("new operator authenticates at operator level", opLevel.status === 200 && opLevel.body?.level === "operator");

  const disabled = await ownerAs("PATCH", `/api/admin/staff/${newStaff.body.id}`, { active: false });
  check("owner disables operator", disabled.status === 200 && disabled.body?.active === false);
  const opLockedOut = await op("GET", "/api/admin/me");
  check("disabled operator's live session loses access (401)", opLockedOut.status === 401);
  const disabledLogin = await api("POST", "/api/auth/login", { email: semail, password: spw });
  check("disabled operator cannot sign in (403)", disabledLogin.status === 403);

  const enabled = await ownerAs("PATCH", `/api/admin/staff/${newStaff.body.id}`, { active: true });
  check("owner re-enables operator", enabled.status === 200 && enabled.body?.active === true);
  const resetPw = await ownerAs("PATCH", `/api/admin/staff/${newStaff.body.id}`, { password: "fresh-passcode-11" });
  check("owner resets operator password", resetPw.status === 200);
  const loginNewPw = await api("POST", "/api/auth/login", { email: semail, password: "fresh-passcode-11" });
  check("operator signs in with reset password", loginNewPw.status === 200);
  const badReset = await ownerAs("PATCH", `/api/admin/staff/${newStaff.body.id}`, { password: "short" });
  check("too-short staff password rejected (400)", badReset.status === 400);

  // Clean up the test account so demo databases stay tidy
  const removed = await ownerAs("DELETE", `/api/admin/staff/${newStaff.body.id}`);
  check("owner removes staff account", removed.status === 200 && removed.body?.removed === true);
  const staffAfter = await ownerAs("GET", "/api/admin/staff");
  check("removed staff no longer listed", staffAfter.status === 200 && !staffAfter.body.some((u) => u.id === newStaff.body.id));

  // --- fleet & trip management (owner only) ---
  const counterFleet = await counter("GET", "/api/admin/fleet");
  check("operator denied fleet panel (403)", counterFleet.status === 403);
  const counterTripsList = await counter("GET", "/api/admin/trips");
  check("operator denied trips panel (403)", counterTripsList.status === 403);

  const fleetList = await ownerAs("GET", "/api/admin/fleet");
  check(
    "owner sees fleet",
    fleetList.status === 200 && Array.isArray(fleetList.body) && fleetList.body.length >= 1 &&
      typeof fleetList.body[0].trips === "number",
    `${fleetList.body?.length ?? 0} buses`
  );

  // Create a bus, then a trip on it, edit it, and remove it
  const badBus = await ownerAs("POST", "/api/admin/fleet", { operator: "Smoke Line", name: "Test Coach", type: "Hovercraft", rows: 8, cols: 4 });
  check("invalid bus type rejected (400)", badBus.status === 400);
  const newBus = await ownerAs("POST", "/api/admin/fleet", { operator: "Smoke Line", name: "Test Coach", type: "AC Seater", rows: 4, cols: 4 });
  check("owner creates bus (201)", newBus.status === 201 && newBus.body?.rows === 4 && newBus.body?.cols === 4);
  const dupBus = await ownerAs("POST", "/api/admin/fleet", { operator: "", name: "x", type: "AC Seater", rows: 8, cols: 4 });
  check("bus without operator rejected (400)", dupBus.status === 400);

  const cityList = cities.body || [];
  const dco = cityList[0]?.id;
  const lone = cityList.find((c) => c.id !== dco)?.id;
  if (!dco || !lone) throw new Error("seeded cities missing for fleet tests");
  const badTrip = await ownerAs("POST", "/api/admin/trips", { bus_id: newBus.body.id, from_city_id: dco, to_city_id: dco, depart_time: "06:30", duration_min: 300, price: 700 });
  check("same-city trip rejected (400)", badTrip.status === 400);
  const badTime = await ownerAs("POST", "/api/admin/trips", { bus_id: newBus.body.id, from_city_id: dco, to_city_id: lone, depart_time: "25:99", duration_min: 300, price: 700 });
  check("invalid departure time rejected (400)", badTime.status === 400);
  const newTrip = await ownerAs("POST", "/api/admin/trips", { bus_id: newBus.body.id, from_city_id: dco, to_city_id: lone, depart_time: "06:30", duration_min: 300, price: 700 });
  check("owner creates trip (201)", newTrip.status === 201 && Number.isInteger(newTrip.body?.id));
  const tripsList = await ownerAs("GET", "/api/admin/trips");
  check(
    "owner sees trips incl. the new one",
    tripsList.status === 200 && tripsList.body.some((t) => t.id === newTrip.body.id && t.operator === "Smoke Line"),
    `${tripsList.body?.length ?? 0} trips`
  );

  const editTrip = await ownerAs("PATCH", `/api/admin/trips/${newTrip.body.id}`, { price: 750, depart_time: "06:45" });
  check("owner edits trip price/time", editTrip.status === 200 && editTrip.body?.updated === true);
  const badEdit = await ownerAs("PATCH", `/api/admin/trips/${newTrip.body.id}`, { price: -5 });
  check("negative price rejected (400)", badEdit.status === 400);

  // A trip with a booking cannot be removed
  const bookedTrip = await ownerAs("DELETE", `/api/admin/trips/${trip.id}`);
  check("trip with booking history protected (409)", bookedTrip.status === 409);
  const delTrip = await ownerAs("DELETE", `/api/admin/trips/${newTrip.body.id}`);
  check("owner removes unused trip", delTrip.status === 200 && delTrip.body?.removed === true);
  const delBus = await ownerAs("DELETE", `/api/admin/fleet/${newBus.body.id}`);
  check("owner removes unused bus", delBus.status === 200 && delBus.body?.removed === true);
}

main().catch((err) => {
  console.error(`  \u2717 smoke aborted — ${err.message}`);
  process.exitCode = 1;
});
