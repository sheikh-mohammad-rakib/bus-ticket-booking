import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { api, money, fmtDuration, fmtDate } from "../api.js";
import { bnCity } from "../bn.js";
import { Stepper } from "../components/Header.jsx";

export function Ticket() {
  const { pnr } = useParams();
  const { state } = useLocation();
  const [ticket, setTicket] = useState(state?.ticket || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ticket) {
      api.ticket(pnr).then(setTicket).catch((err) => setError(err.message));
    }
  }, [pnr]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return (
    <div className="step-shell">
      <p className="error-banner">{error}</p>
      <Link to="/my-trips" className="btn btn-ghost">Look up by email</Link>
    </div>
  );
  if (!ticket) return <p className="muted">Loading ticket…</p>;

  const cancelled = ticket.status === "cancelled";
  const [depH, depM] = ticket.depart_time.split(":").map(Number);
  const arr = new Date();
  arr.setHours(depH, depM + ticket.duration_min, 0, 0);
  const arrText = `${String(arr.getHours()).padStart(2, "0")}:${String(arr.getMinutes()).padStart(2, "0")}`;

  function cancel() {
    if (!window.confirm("Cancel this booking? Seats go back on sale.")) return;
    setBusy(true);
    api.cancel(ticket.pnr)
      .then(setTicket)
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <div className="step-shell">
      <Stepper step={4} />
      <header className="step-head">
        <h1>{cancelled ? "Booking cancelled" : "You're booked!"}</h1>
        {!cancelled && <p className="step-sub muted">Show this ticket to the staff before boarding.</p>}
      </header>

      <div className="ticket-card">
        <div className="ticket-main">
          <div className="ticket-pnr">
            <span className="ticket-pnr-label">Booking code</span>
            <span className="ticket-pnr-value mono">{ticket.pnr}</span>
            <span className={`ticket-status ${cancelled ? "is-cancelled" : ""}`}>
              {cancelled ? "Cancelled" : "Confirmed"}
            </span>
          </div>
          <p className="ticket-route">
            {bnCity(ticket.from_city)} → {bnCity(ticket.to_city)}
          </p>
          <div className="ticket-times">
            <div>
              <span className="trip-time">{ticket.depart_time}</span>
              <span className="trip-city">{ticket.from_city}</span>
            </div>
            <div className="trip-bar" aria-hidden="true">
              <span className="trip-duration">{fmtDuration(ticket.duration_min)}</span>
            </div>
            <div>
              <span className="trip-time">{arrText}</span>
              <span className="trip-city">{ticket.to_city}</span>
            </div>
          </div>
          <p className="ticket-meta">
            {fmtDate(ticket.travel_date)} · {ticket.bus.operator} — {ticket.bus.name} · {ticket.bus.type}
          </p>
        </div>

        <div className="ticket-perf" aria-hidden="true" />

        <div className="ticket-stub">
          <dl className="stub-list">
            <div><dt>Seats</dt><dd className="mono">{ticket.seats.join(" ")}</dd></div>
            <div><dt>Date</dt><dd className="mono">{fmtDate(ticket.travel_date)}</dd></div>
            <div><dt>Paid</dt><dd className="stub-total mono">{cancelled ? "—" : money(ticket.total_amount)}</dd></div>
          </dl>
        </div>
      </div>

      <p className="ticket-contact muted">
        {ticket.contact.name}, {ticket.contact.email} — {ticket.contact.phone}
      </p>

      {!cancelled && (
        <div className="ticket-actions no-print">
          <button className="btn btn-amber" onClick={() => window.print()}>Print ticket</button>
          <button className="btn btn-ghost" onClick={cancel} disabled={busy}>{busy ? "Cancelling…" : "Cancel booking"}</button>
        </div>
      )}
      <div className="ticket-actions no-print">
        <Link className="btn btn-ghost" to="/">Book another ride</Link>
        <Link className="btn btn-ghost" to="/my-trips">My trips</Link>
      </div>
    </div>
  );
}
