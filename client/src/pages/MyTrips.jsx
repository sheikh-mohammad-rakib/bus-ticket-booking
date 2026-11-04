import { useState } from "react";
import { Link } from "react-router-dom";
import { api, fmtDate } from "../api.js";

export function MyTrips() {
  const [email, setEmail] = useState("");
  const [searched, setSearched] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function load(e) {
    e?.preventDefault();
    setError("");
    setBusy(true);
    api.myBookings(email)
      .then(setBookings)
      .then(() => setSearched(true))
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <div className="step-shell">
      <header className="step-head">
        <h1>My trips</h1>
        <p className="step-sub muted">Enter the email you booked with.</p>
      </header>

      <form className="search-bar search-bar--plain" onSubmit={load}>
        <label className="field">
          <span className="field-label">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <button type="submit" className="btn btn-amber" disabled={busy}>
          {busy ? "Looking…" : "Find bookings"}
        </button>
      </form>
      {error && <p className="error-banner">{error}</p>}

      {searched && !error && bookings.length === 0 && (
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
