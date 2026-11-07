import { useEffect, useState } from "react";
import { api, money, fmtDate, fmtDuration } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useLang } from "../lang.jsx";

function StatCard({ label, value, sub, tone = "" }) {
  return (
    <div className={`stat-card ${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
      {sub && <div className="stat-sub muted">{sub}</div>}
    </div>
  );
}

export function Admin() {
  const { t } = useLang();
  const { user, signOut } = useAuth();
  const [checked, setChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [level, setLevel] = useState(null); // 'operator' | 'owner'
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");
  const [busyCheck, setBusyCheck] = useState(null);
  const [staff, setStaff] = useState([]);
  const [staffForm, setStaffForm] = useState({ name: "", email: "", password: "" });
  const [busyStaff, setBusyStaff] = useState(null); // null | 'add' | number
  const [staffNote, setStaffNote] = useState("");
  const [fleet, setFleet] = useState([]);
  const [trips, setTrips] = useState([]);
  const [cities, setCities] = useState([]);
  const [busForm, setBusForm] = useState({ operator: "", name: "", type: "AC Seater", rows: 8, cols: 4 });
  const [tripForm, setTripForm] = useState({ bus_id: "", from_city_id: "", to_city_id: "", depart_time: "", duration_min: "", price: "" });
  const [busyFleet, setBusyFleet] = useState(null); // null | 'add-bus' | 'add-trip' | trip id
  const [editTrip, setEditTrip] = useState(null); // { id, depart_time, duration_min, price }
  const [fleetNote, setFleetNote] = useState("");

  const isAdmin = authed || user?.role === "owner" || user?.role === "counter_operator";
  const isOwner = level === "owner" || user?.role === "owner";

  // Restore an existing session on mount (password cookie or staff account)
  useEffect(() => {
    auth0();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function auth0() {
    api.adminMe()
      .then((r) => {
        setAuthed(true);
        setLevel(r.level || (user?.role === "owner" ? "owner" : null));
      })
      .catch(() => {})
      .finally(() => setChecked(true));
  }

  // Pull data once signed in — financials for the owner, ledger for everyone
  useEffect(() => {
    if (!isAdmin) return;
    if (isOwner) {
      api.adminStats().then(setStats).catch((err) => setError(err.message));
      api.adminStaff().then(setStaff).catch((err) => setError(err.message));
      api.adminFleet().then(setFleet).catch((err) => setFleetNote(err.message));
      api.adminTrips().then(setTrips).catch((err) => setFleetNote(err.message));
      api.cities().then(setCities).catch(() => {});
    } else setStats(null);
    api.adminBookings(appliedFilter).then(setRows).catch((err) => setError(err.message));
  }, [isAdmin, isOwner, appliedFilter]);

  function checkIn(pnr) {
    setError("");
    setBusyCheck(pnr);
    api.adminCheckIn(pnr)
      .then(() => api.adminBookings(appliedFilter))
      .then(setRows)
      .catch((err) => setError(err.message))
      .finally(() => setBusyCheck(null));
  }

  function addStaff(e) {
    e.preventDefault();
    setStaffNote("");
    setBusyStaff("add");
    api.adminCreateStaff(staffForm)
      .then((row) => {
        setStaff((s) => [...s, row]);
        setStaffForm({ name: "", email: "", password: "" });
        setStaffNote(t("Created account for {name} ({email}).", { name: row.name, email: row.email }));
      })
      .catch((err) => setStaffNote(err.message))
      .finally(() => setBusyStaff(null));
  }

  function toggleStaff(row) {
    setStaffNote("");
    setBusyStaff(row.id);
    api.adminUpdateStaff(row.id, { active: !row.active })
      .then((updated) => setStaff((s) => s.map((r) => (r.id === updated.id ? updated : r))))
      .catch((err) => setStaffNote(err.message))
      .finally(() => setBusyStaff(null));
  }

  function removeStaff(row) {
    setStaffNote("");
    setBusyStaff(row.id);
    api.adminRemoveStaff(row.id)
      .then(() => {
        setStaff((s) => s.filter((r) => r.id !== row.id));
        setStaffNote(t("Removed {name} ({email}).", { name: row.name, email: row.email }));
      })
      .catch((err) => setStaffNote(err.message))
      .finally(() => setBusyStaff(null));
  }

  const refreshTrips = () =>
    Promise.all([api.adminTrips().then(setTrips), api.adminFleet().then(setFleet)]);

  function addBus(e) {
    e.preventDefault();
    setFleetNote("");
    setBusyFleet("add-bus");
    api.adminCreateBus(busForm)
      .then((b) => {
        setFleet((f) => [...f, b]);
        setBusForm({ operator: "", name: "", type: "AC Seater", rows: 8, cols: 4 });
        setFleetNote(t("Added {operator} {name} ({type}, {rows}×{cols}).", { operator: b.operator, name: b.name, type: t(b.type), rows: b.rows, cols: b.cols }));
      })
      .catch((err) => setFleetNote(err.message))
      .finally(() => setBusyFleet(null));
  }

  function addTrip(e) {
    e.preventDefault();
    setFleetNote("");
    if (tripForm.from_city_id === tripForm.to_city_id) {
      setFleetNote(t("From and to cities must differ."));
      return;
    }
    setBusyFleet("add-trip");
    api.adminCreateTrip({
      bus_id: Number(tripForm.bus_id),
      from_city_id: Number(tripForm.from_city_id),
      to_city_id: Number(tripForm.to_city_id),
      depart_time: tripForm.depart_time,
      duration_min: Number(tripForm.duration_min),
      price: Number(tripForm.price),
    })
      .then(() => refreshTrips())
      .then(() => {
        setTripForm({ bus_id: "", from_city_id: "", to_city_id: "", depart_time: "", duration_min: "", price: "" });
        setFleetNote(t("Trip added. It now appears in public search."));
      })
      .catch((err) => setFleetNote(err.message))
      .finally(() => setBusyFleet(null));
  }

  function startTripEdit(t) {
    setEditTrip({ id: t.id, depart_time: t.depart_time, duration_min: String(t.duration_min), price: String(Number(t.price)) });
  }

  function saveTripEdit() {
    setFleetNote("");
    setBusyFleet(editTrip.id);
    api.adminUpdateTrip(editTrip.id, {
      depart_time: editTrip.depart_time,
      duration_min: Number(editTrip.duration_min),
      price: Number(editTrip.price),
    })
      .then(() => refreshTrips())
      .then(() => setFleetNote(t("Trip updated. Existing bookings keep the price they paid.")))
      .catch((err) => setFleetNote(err.message))
      .finally(() => setBusyFleet(null));
    setEditTrip(null);
  }

  function removeTrip(trip) {
    setFleetNote("");
    setBusyFleet(trip.id);
    api.adminRemoveTrip(trip.id)
      .then(() => refreshTrips())
      .then(() => setFleetNote(t("Removed {from} → {to} {time}.", { from: trip.from_city, to: trip.to_city, time: trip.depart_time })))
      .catch((err) => setFleetNote(err.message))
      .finally(() => setBusyFleet(null));
  }

  function removeBus(b) {
    setFleetNote("");
    setBusyFleet(b.id);
    api.adminRemoveBus(b.id)
      .then(() => api.adminFleet())
      .then(setFleet)
      .then(() => setFleetNote(t("Removed {operator} {name}.", { operator: b.operator, name: b.name })))
      .catch((err) => setFleetNote(err.message))
      .finally(() => setBusyFleet(null));
  }

  function login(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    api.adminLogin(password)
      .then(() => auth0()) // re-read the level — the operator password grants owner
      .then(() => {
        setAuthed(true);
        setPassword("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }

  function logout() {
    if (user?.role === "admin") {
      signOut().catch(() => {}).finally(() => { setAuthed(false); setLevel(null); });
    } else {
      api.adminLogout().catch(() => {}).finally(() => { setAuthed(false); setLevel(null); });
    }
  }

  if (!checked) return null;

  if (!isAdmin) {
    return (
      <div className="step-shell">
        <header className="step-head">
          <h1>{t("Operator console")}</h1>
          <p className="step-sub muted">{t("Operator access only. Sign in with the operator password.")}</p>
        </header>
        <form className="modal auth-form" onSubmit={login} style={{ maxWidth: 420 }}>
          <label className="field">
            <span className="field-label">{t("Operator password")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="error-banner" role="alert">{error}</p>}
          <button className="btn btn-amber" type="submit" disabled={busy || !password}>
            {busy ? t("Signing in…") : t("Sign in")}
          </button>
        </form>
      </div>
    );
  }

  const s = stats || {};
  const cancelRate = s.confirmed + s.cancelled > 0
    ? Math.round((100 * s.cancelled) / (s.confirmed + s.cancelled))
    : 0;

  return (
    <div className="step-shell">
      <header className="step-head">
        <h1>{isOwner ? t("Owner console") : t("Counter console")}</h1>
        <p className="step-sub muted">
          {isOwner
            ? t("Live figures from the bookings ledger.")
            : t("Lookup, check-in and cancellations at the counter. Financials are visible to the owner only.")}{" "}
          <button className="link-btn" onClick={logout}>{t("Sign out")}</button>
        </p>
      </header>

      {error && <p className="error-banner" role="alert">{error}</p>}

      {isOwner && (
        <>
          <div className="stat-grid">
            <StatCard label={t("Bookings today")} value={s.booked_today ?? "—"} />
            <StatCard label={t("Seats sold")} value={s.seats_sold ?? "—"} sub={t("{n} confirmed", { n: s.confirmed ?? 0 })} />
            <StatCard label={t("Revenue")} value={s.revenue == null ? "—" : money(s.revenue)} tone="stat-green" />
            <StatCard
              label={t("Cancellations")}
              value={`${s.cancelled ?? "—"} (${cancelRate}%)`}
              sub={t("fees {a} · refunds {b}", { a: s.cancel_fees ? money(s.cancel_fees) : "৳0", b: s.refunds ? money(s.refunds) : "৳0" })}
              tone="stat-red"
            />
          </div>

          {s.top_routes?.length > 0 && (
            <section className="panel">
              <h2>{t("Best-selling routes")}</h2>
              <ul className="route-board">
                {s.top_routes.map((r) => (
                  <li key={`${r.from_city}-${r.to_city}`}>
                    <span className="route-name">
                      {r.from_city} → {r.to_city}
                    </span>
                    <span className="route-seats mono">{t("{n} seats", { n: r.seats })}</span>
                    <span className="route-revenue mono">{money(r.revenue)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel">
            <h2>{t("Staff")}</h2>
            <p className="muted staff-sub">
              {t("Counter operators can look up bookings, check in passengers and cancel tickets. Disabled accounts lose access immediately.")}
            </p>

            {staff.length === 0 ? (
              <p className="muted">{t("No staff accounts yet.")}</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t("Name")}</th>
                      <th>{t("Email")}</th>
                      <th>{t("Role")}</th>
                      <th>{t("Joined")}</th>
                      <th>{t("Status")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td className="mono">{r.email}</td>
                        <td>
                          <span className={`pill ${r.role === "owner" ? "pill-green" : "chip-type"}`}>
                            {r.role === "owner" ? t("owner") : t("counter")}
                          </span>
                        </td>
                        <td className="mono">{fmtDate(String(r.created_at).slice(0, 10))}</td>
                        <td>
                          {r.active
                            ? <span className="pill pill-green">{t("active")}</span>
                            : <span className="pill chip-cancelled">{t("disabled")}</span>}
                        </td>
                        <td>
                          {r.active ? (
                            <button
                              className="btn btn-ghost btn--small"
                              onClick={() => toggleStaff(r)}
                              disabled={busyStaff === r.id}
                            >
                              {t("Disable")}
                            </button>
                          ) : (
                            <button
                              className="btn btn-amber btn--small"
                              onClick={() => toggleStaff(r)}
                              disabled={busyStaff === r.id}
                            >
                              {t("Enable")}
                            </button>
                          )}{" "}
                          <button
                            className="btn btn-ghost btn--small"
                            onClick={() => removeStaff(r)}
                            disabled={busyStaff === r.id || (r.role === "owner" && r.id === user?.id)}
                            title={r.role === "owner" && r.id === user?.id ? t("You cannot remove your own account") : t("Remove account")}
                          >
                            {t("Remove")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <form className="staff-form" onSubmit={addStaff}>
              <input
                className="field-input field-input--slim"
                placeholder={t("Full name")}
                value={staffForm.name}
                onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                required
              />
              <input
                className="field-input field-input--slim"
                type="email"
                placeholder={t("work email")}
                value={staffForm.email}
                onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                required
              />
              <input
                className="field-input field-input--slim"
                type="password"
                placeholder={t("Password (min 8 chars)")}
                value={staffForm.password}
                onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                minLength={8}
                required
                autoComplete="new-password"
              />
              <button className="btn btn-amber" type="submit" disabled={busyStaff === "add"}>
                {busyStaff === "add" ? t("Adding…") : t("Add counter operator")}
              </button>
            </form>
            {staffNote && <p className="hint-line">{staffNote}</p>}
          </section>

          <section className="panel">
            <h2>{t("Fleet")}</h2>
            <p className="muted staff-sub">
              {t("Coaches available to schedule. Seat count comes from the layout (rows × cols).")}
            </p>
            {fleet.length === 0 ? (
              <p className="muted">{t("No buses yet.")}</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t("Operator")}</th>
                      <th>{t("Bus")}</th>
                      <th>{t("Type")}</th>
                      <th className="num">{t("Seats")}</th>
                      <th className="num">{t("Trips")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {fleet.map((b) => (
                      <tr key={b.id}>
                        <td>{b.operator}</td>
                        <td>{b.name}</td>
                        <td>{b.type}</td>
                        <td className="mono num">{b.rows * b.cols}</td>
                        <td className="mono num">{b.trips}</td>
                        <td>
                          <button
                            className="btn btn-ghost btn--small"
                            onClick={() => removeBus(b)}
                            disabled={busyFleet === b.id || b.trips > 0}
                            title={b.trips > 0 ? t("Has scheduled trips — remove them first") : t("Remove this bus")}
                          >
                            {t("Remove")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <form className="row-form" onSubmit={addBus}>
              <input
                className="field-input field-input--slim"
                placeholder={t("Operator (e.g. Green Line)")}
                value={busForm.operator}
                onChange={(e) => setBusForm({ ...busForm, operator: e.target.value })}
                required
              />
              <input
                className="field-input field-input--slim"
                placeholder={t("Bus name (e.g. Volvo 9600)")}
                value={busForm.name}
                onChange={(e) => setBusForm({ ...busForm, name: e.target.value })}
                required
              />
              <select
                className="field-select field-input--slim"
                value={busForm.type}
                onChange={(e) => setBusForm({ ...busForm, type: e.target.value })}
              >
                {["AC Seater", "Sleeper", "AC Sleeper", "Non-AC"].map((ty) => <option key={ty} value={ty}>{t(ty)}</option>)}
              </select>
              <input
                className="field-input field-input--slim"
                type="number"
                min={4}
                max={12}
                value={busForm.rows}
                onChange={(e) => setBusForm({ ...busForm, rows: e.target.value })}
                title={t("Seat rows")}
                required
              />
              <select
                className="field-select field-input--slim"
                value={busForm.cols}
                onChange={(e) => setBusForm({ ...busForm, cols: e.target.value })}
                title={t("Seats per row")}
              >
                <option value={4}>{t("4 across")}</option>
                <option value={5}>{t("5 across")}</option>
              </select>
              <button className="btn btn-amber" type="submit" disabled={busyFleet === "add-bus"}>
                {busyFleet === "add-bus" ? t("Adding…") : t("Add bus")}
              </button>
            </form>
          </section>

          <section className="panel">
            <h2>{t("Trips")}</h2>
            <p className="muted staff-sub">
              {t("Scheduled services shown in public search. Trips run daily; bookings carry the date. Editing price or times affects future bookings only — paid tickets keep their price.")}
            </p>
            {trips.length === 0 ? (
              <p className="muted">{t("No trips scheduled yet.")}</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t("Route")}</th>
                      <th>{t("Bus")}</th>
                      <th>{t("Departs")}</th>
                      <th>{t("Duration")}</th>
                      <th>{t("Price")}</th>
                      <th className="num">{t("Sold")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trips.map((tr) => {
                      const editing = editTrip?.id === tr.id;
                      return (
                        <tr key={tr.id}>
                          <td>{tr.from_city} → {tr.to_city}</td>
                          <td>{tr.operator}<br /><span className="muted table-sub">{tr.bus_name} · {tr.type}</span></td>
                          <td>
                            {editing ? (
                              <input
                                className="inline-input"
                                type="time"
                                value={editTrip.depart_time}
                                onChange={(e) => setEditTrip({ ...editTrip, depart_time: e.target.value })}
                              />
                            ) : (
                              <span className="mono">{tr.depart_time}</span>
                            )}
                          </td>
                          <td>
                            {editing ? (
                              <input
                                className="inline-input"
                                type="number"
                                min={30}
                                max={1440}
                                step={5}
                                value={editTrip.duration_min}
                                onChange={(e) => setEditTrip({ ...editTrip, duration_min: e.target.value })}
                              />
                            ) : (
                              fmtDuration(tr.duration_min)
                            )}
                          </td>
                          <td>
                            {editing ? (
                              <input
                                className="inline-input"
                                type="number"
                                min={50}
                                max={100000}
                                step={50}
                                value={editTrip.price}
                                onChange={(e) => setEditTrip({ ...editTrip, price: e.target.value })}
                              />
                            ) : (
                              <span className="mono">{money(tr.price)}</span>
                            )}
                          </td>
                          <td className="mono num">{tr.seats_sold}</td>
                          <td>
                            {editing ? (
                              <>
                                <button className="btn btn-amber btn--small" onClick={saveTripEdit} disabled={busyFleet === tr.id}>{t("Save")}</button>{" "}
                                <button className="btn btn-ghost btn--small" onClick={() => setEditTrip(null)}>{t("Cancel")}</button>
                              </>
                            ) : (
                              <>
                                <button className="btn btn-ghost btn--small" onClick={() => startTripEdit(tr)} disabled={busyFleet === tr.id}>{t("Edit")}</button>{" "}
                                <button
                                  className="btn btn-ghost btn--small"
                                  onClick={() => removeTrip(tr)}
                                  disabled={busyFleet === tr.id || tr.seats_sold > 0}
                                  title={tr.seats_sold > 0 ? t("Has booking history — cannot be removed") : t("Remove this trip")}
                                >
                                  {t("Remove")}
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <form className="row-form" onSubmit={addTrip}>
              <select
                className="field-select field-input--slim"
                value={tripForm.bus_id}
                onChange={(e) => setTripForm({ ...tripForm, bus_id: e.target.value })}
                required
              >
                <option value="">{t("Bus…")}</option>
                {fleet.map((b) => (
                  <option key={b.id} value={b.id}>{b.operator} {b.name}</option>
                ))}
              </select>
              <select
                className="field-select field-input--slim"
                value={tripForm.from_city_id}
                onChange={(e) => setTripForm({ ...tripForm, from_city_id: e.target.value })}
                required
              >
                <option value="">{t("From…")}</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                className="field-select field-input--slim"
                value={tripForm.to_city_id}
                onChange={(e) => setTripForm({ ...tripForm, to_city_id: e.target.value })}
                required
              >
                <option value="">{t("To…")}</option>
                {cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                className="field-input field-input--slim"
                type="time"
                value={tripForm.depart_time}
                onChange={(e) => setTripForm({ ...tripForm, depart_time: e.target.value })}
                required
              />
              <input
                className="field-input field-input--slim"
                type="number"
                min={30}
                max={1440}
                step={5}
                placeholder={t("Minutes")}
                value={tripForm.duration_min}
                onChange={(e) => setTripForm({ ...tripForm, duration_min: e.target.value })}
                required
              />
              <input
                className="field-input field-input--slim"
                type="number"
                min={50}
                max={100000}
                step={50}
                placeholder={t("Price ৳")}
                value={tripForm.price}
                onChange={(e) => setTripForm({ ...tripForm, price: e.target.value })}
                required
              />
              <button className="btn btn-amber" type="submit" disabled={busyFleet === "add-trip" || !fleet.length}>
                {busyFleet === "add-trip" ? t("Adding…") : t("Add trip")}
              </button>
            </form>
            {fleetNote && <p className="hint-line">{fleetNote}</p>}
          </section>
        </>
      )}

      <section className="panel">
        <h2>{t("Bookings")}</h2>
        <form
          className="admin-search"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedFilter(filter.trim());
          }}
        >
          <input
            className="field-input field-input--slim"
            placeholder={t("Find by PNR, email, name or phone")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="btn btn-ghost" type="submit">{t("Search")}</button>
        </form>

        {rows.length === 0 ? (
          <p className="muted">
            {appliedFilter
              ? t("No bookings matching “{q}”.", { q: appliedFilter })
              : t("No bookings yet.")}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>PNR</th>
                  <th>{t("Route")}</th>
                  <th>{t("Seats")}</th>
                  <th>{t("Date")}</th>
                  <th>{t("Passenger")}</th>
                  <th className="num">{t("Amount")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Boarding")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.pnr} className={b.status === "cancelled" ? "row-cancelled" : ""}>
                    <td className="mono">{b.pnr}</td>
                    <td>{b.from_city} → {b.to_city}</td>
                    <td className="mono">{b.seats}</td>
                    <td className="mono">{fmtDate(b.travel_date)} {b.depart_time}</td>
                    <td>{b.contact_name}<br /><span className="muted table-sub">{b.email}</span></td>
                    <td className="mono num">
                      {money(b.total_amount)}
                      {b.status === "cancelled" && b.cancellation_fee != null && (
                        <span className="table-sub">{t(" fee {a}", { a: money(b.cancellation_fee) })}</span>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${b.status === "cancelled" ? "pill-red" : "pill-green"}`}>
                        {b.status === "cancelled" ? t("Cancelled") : t("Confirmed")}
                      </span>
                    </td>
                    <td>
                      {b.status !== "cancelled" &&
                        (b.checked_in_at ? (
                          <span className="pill pill-boarded">{t("boarded ✓")}</span>
                        ) : (
                          <button
                            className="btn btn-ghost btn--small"
                            onClick={() => checkIn(b.pnr)}
                            disabled={busyCheck === b.pnr}
                          >
                            {busyCheck === b.pnr ? "…" : t("Check in")}
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
