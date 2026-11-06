import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate } from "../api.js";
import { useAuth } from "../auth.jsx";

export function MyTrips() {
  const { user, ready } = useAuth();
  const [email, setEmail] = useState("");
  const [searched, setSearched] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Signed-in: the ledger is yours by right — always loaded from your session
  useEffect(() => {
    if (!user) return;
    setError("");
    setBusy(true);
    api.myBookings()
      .then((b) => { setBookings(b); setSearched(true); })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }, [user]);

  function load(e) {
    e?.preventDefault();
    setError("");
    setBusy(true);
    api.myBookings(email)
      .then((b) => { setBookings(b); setSearched(true); })
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }

  if (!ready) return null;

  return (
    <div className="step-shell">
      <header className="step-head">
        {user ? (
          <>
            <h1>My trips</h1>
            <p className="step-sub muted">Signed in as {user.email} — showing your bookings.</p>
          </>
        ) : (
          <>
            <h1>My trips</h1>
            <p className="step-sub muted">
              Guest tickets: enter the email you booked with.{" "}
              <Link to="/login" state={{ from: "/my-trips" }}>Sign in</Link> instead to always see them here.
            </p>
          </>
        )}
      </header>

      {!user && (
        <form className="search-bar search-bar--plain" onSubmit={load}>
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <button type="submit" className="btn btn-amber" disabled={busy}>
            {busy ? "Looking…" : "Find bookings"}
          </button>
        </form>
      )}
      {user && bookings.length === 0 && !busy && !error && (
        <p className="empty-line">No bookings on your account yet. <Link to="/">Search a route</Link> to get your first ticket.</p>
      )}
      {error && <p className="error-banner">{error}</p>}

      {!user && searched && !error && bookings.length === 0 && (
        <p className="empty-line">No bookings with {email} yet. <Link to="/">Search a route</Link> to get your first ticket.</p>
      )}

      {bookings.map((bk) => (
        <article key={bk.pnr} className="trip-row">
          <div className="trip-times">
            <div>
              <span className="trip-time">{bk.depart_time}</span>
              <span className="trip-city">{bk.from_city}</span>
            </div>
            <div className="trip-bar" aria-hidden="true">
              <span className="trip-duration">{fmtDate(bk.travel_date)}</span>
            </div>
            <div>
              <span className="trip-time mono">{bk.seats.join(" ")}</span>
              <span className="trip-city">{bk.to_city}</span>
            </div>
          </div>
          <div className="trip-meet">
            <span className={`chip ${bk.status === "cancelled" ? "chip-cancelled" : "chip-type"}`}>{bk.status}</span>
            <span className="trip-operator"><strong>{bk.bus.operator}</strong> {bk.bus.name}</span>
          </div>
          <div className="trip-buy">
            <span className="trip-price mono">{bk.pnr}</span>
            <Link to={`/ticket/${bk.pnr}`} className="btn btn-amber">View ticket</Link>
          </div>
        </article>
      ))}
    </div>
  );
}
