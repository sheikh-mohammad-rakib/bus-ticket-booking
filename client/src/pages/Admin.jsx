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
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("");
  const [appliedFilter, setAppliedFilter] = useState("");

  const isAdmin = authed || user?.role === "admin";

  // Restore an existing session on mount (password cookie or admin-role account)
  useEffect(() => {
    api.adminMe()
      .then(() => setAuthed(true))
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);

  // Pull data once signed in
  useEffect(() => {
    if (!isAdmin) return;
    api.adminStats().then(setStats).catch((err) => setError(err.message));
    api.adminBookings(appliedFilter).then(setRows).catch((err) => setError(err.message));
  }, [isAdmin, appliedFilter]);

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
          <p className="step-sub muted">Operator access only. Sign in with the admin password.</p>
        </header>
        <form className="modal" onSubmit={login} style={{ maxWidth: 420 }}>
          <label className="field-label" htmlFor="admin-pw">Admin password</label>
          <input
            id="admin-pw"
            className="field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
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
        <h1>Operator console</h1>
        <p className="step-sub muted">
          Live figures from the bookings ledger.{" "}
          <button className="link-btn" onClick={logout}>Sign out</button>
        </p>
      </header>

      {error && <p className="error-banner" role="alert">{error}</p>}

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
