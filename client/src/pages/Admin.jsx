import { useEffect, useState } from "react";
import { api, money, fmtDate } from "../api.js";
import { useAuth } from "../auth.jsx";

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
        setStaffNote(`Created account for ${row.name} (${row.email}).`);
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
        setStaffNote(`Removed ${row.name} (${row.email}).`);
      })
      .catch((err) => setStaffNote(err.message))
      .finally(() => setBusyStaff(null));
  }

  function login(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    api.adminLogin(password)
      .then(() => {
        setAuthed(true);
        setPassword("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }

  function logout() {
    if (user?.role === "admin") {
      signOut().catch(() => {}).finally(() => setAuthed(false));
    } else {
      api.adminLogout().catch(() => {}).finally(() => setAuthed(false));
    }
  }

  if (!checked) return null;

  if (!isAdmin) {
    return (
      <div className="step-shell">
        <header className="step-head">
          <h1>Operator console</h1>
          <p className="step-sub muted">Operator access only. Sign in with the operator password.</p>
        </header>
        <form className="modal auth-form" onSubmit={login} style={{ maxWidth: 420 }}>
          <label className="field">
            <span className="field-label">Operator password</span>
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
            {busy ? "Signing in…" : "Sign in"}
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
        <h1>{isOwner ? "Owner console" : "Counter console"}</h1>
        <p className="step-sub muted">
          {isOwner
            ? "Live figures from the bookings ledger."
            : "Lookup, check-in and cancellations at the counter. Financials are visible to the owner only."}{" "}
          <button className="link-btn" onClick={logout}>Sign out</button>
        </p>
      </header>

      {error && <p className="error-banner" role="alert">{error}</p>}

      {isOwner && (
        <>
          <div className="stat-grid">
            <StatCard label="Bookings today" value={s.booked_today ?? "—"} />
            <StatCard label="Seats sold" value={s.seats_sold ?? "—"} sub={`${s.confirmed ?? 0} confirmed`} />
            <StatCard label="Revenue" value={s.revenue == null ? "—" : money(s.revenue)} tone="stat-green" />
            <StatCard
              label="Cancellations"
              value={`${s.cancelled ?? "—"} (${cancelRate}%)`}
              sub={`fees ${s.cancel_fees ? money(s.cancel_fees) : "৳0"} · refunds ${s.refunds ? money(s.refunds) : "৳0"}`}
              tone="stat-red"
            />
          </div>

          {s.top_routes?.length > 0 && (
            <section className="panel">
              <h2>Best-selling routes</h2>
              <ul className="route-board">
                {s.top_routes.map((r) => (
                  <li key={`${r.from_city}-${r.to_city}`}>
                    <span className="route-name">
                      {r.from_city} → {r.to_city}
                    </span>
                    <span className="route-seats mono">{r.seats} seats</span>
                    <span className="route-revenue mono">{money(r.revenue)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel">
            <h2>Staff</h2>
            <p className="muted staff-sub">
              Counter operators can look up bookings, check in passengers and cancel tickets. Disabled accounts lose access immediately.
            </p>

            {staff.length === 0 ? (
              <p className="muted">No staff accounts yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Joined</th>
                      <th>Status</th>
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
                            {r.role === "owner" ? "owner" : "counter"}
                          </span>
                        </td>
                        <td className="mono">{fmtDate(String(r.created_at).slice(0, 10))}</td>
                        <td>
                          {r.active
                            ? <span className="pill pill-green">active</span>
                            : <span className="pill chip-cancelled">disabled</span>}
                        </td>
                        <td>
                          {r.active ? (
                            <button
                              className="btn btn-ghost btn--small"
                              onClick={() => toggleStaff(r)}
                              disabled={busyStaff === r.id}
                            >
                              Disable
                            </button>
                          ) : (
                            <button
                              className="btn btn-amber btn--small"
                              onClick={() => toggleStaff(r)}
                              disabled={busyStaff === r.id}
                            >
                              Enable
                            </button>
                          )}{" "}
                          <button
                            className="btn btn-ghost btn--small"
                            onClick={() => removeStaff(r)}
                            disabled={busyStaff === r.id || (r.role === "owner" && r.id === user?.id)}
                            title={r.role === "owner" && r.id === user?.id ? "You cannot remove your own account" : "Remove account"}
                          >
                            Remove
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
                placeholder="Full name"
                value={staffForm.name}
                onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                required
              />
              <input
                className="field-input field-input--slim"
                type="email"
                placeholder="work email"
                value={staffForm.email}
                onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                required
              />
              <input
                className="field-input field-input--slim"
                type="password"
                placeholder="Password (min 8 chars)"
                value={staffForm.password}
                onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                minLength={8}
                required
                autoComplete="new-password"
              />
              <button className="btn btn-amber" type="submit" disabled={busyStaff === "add"}>
                {busyStaff === "add" ? "Adding…" : "Add counter operator"}
              </button>
            </form>
            {staffNote && <p className="hint-line">{staffNote}</p>}
          </section>
        </>
      )}

      <section className="panel">
        <h2>Bookings</h2>
        <form
          className="admin-search"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedFilter(filter.trim());
          }}
        >
          <input
            className="field-input field-input--slim"
            placeholder="Find by PNR, email, name or phone"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button className="btn btn-ghost" type="submit">Search</button>
        </form>

        {rows.length === 0 ? (
          <p className="muted">No bookings{appliedFilter ? ` matching “${appliedFilter}”` : " yet"}.</p>
        ) : (
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>PNR</th>
                  <th>Route</th>
                  <th>Seats</th>
                  <th>Date</th>
                  <th>Passenger</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Boarding</th>
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
                        <span className="table-sub"> fee {money(b.cancellation_fee)}</span>
                      )}
                    </td>
                    <td>
                      <span className={`pill ${b.status === "cancelled" ? "pill-red" : "pill-green"}`}>
                        {b.status}
                      </span>
                    </td>
                    <td>
                      {b.status !== "cancelled" &&
                        (b.checked_in_at ? (
                          <span className="pill pill-boarded">boarded ✓</span>
                        ) : (
                          <button
                            className="btn btn-ghost btn--small"
                            onClick={() => checkIn(b.pnr)}
                            disabled={busyCheck === b.pnr}
                          >
                            {busyCheck === b.pnr ? "…" : "Check in"}
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
