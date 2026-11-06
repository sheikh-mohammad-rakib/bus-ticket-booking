import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { api, money, fmtDuration, fmtDate } from "../api.js";
import { bnCity } from "../bn.js";
import { Stepper } from "../components/Header.jsx";

function CancelModal({ ticket, onClose, onConfirm, busy, quote, quoteError, confirmError }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cancel-title">Cancel booking?</h2>
        <p className="modal-sub muted">
          {bnCity(ticket.from_city)} → {bnCity(ticket.to_city)} ·{" "}
          <span className="mono">{fmtDate(ticket.travel_date)} {ticket.depart_time}</span> ·{" "}
          <span className="mono">{ticket.seats.join(" ")}</span>
        </p>

        {quoteError && <p className="error-banner" role="alert">{quoteError}</p>}
        {confirmError && <p className="error-banner" role="alert">{confirmError}</p>}

        {quote && (
          <dl className="modal-charges">
            <div><dt>You paid</dt><dd className="mono">{money(ticket.total_amount)}</dd></div>
            <div><dt>Cancellation fee</dt><dd className="mono modal-fee">{money(quote.fee)}</dd></div>
            <div className="modal-charges-total">
              <dt>Goes back to your card</dt>
              <dd className="mono stub-total">{money(quote.refund)}</dd>
            </div>
          </dl>
        )}
        <p className="hint-line">
          Fee is 10% of the ticket value, minimum ৳50. The refund returns to the same
          card in 5–7 working days. {ticket.seats.length > 1 ? "All seats" : "The seat"} go{ticket.seats.length > 1 ? "" : "es"} back on sale immediately.
        </p>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Keep my ticket
          </button>
          <button className="btn btn-amber btn-cancel" onClick={onConfirm} disabled={busy || !quote}>
            {busy ? "Cancelling…" : quote ? `Cancel booking · lose ${money(quote.fee)}` : "Cancel booking"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Ticket() {
  const { pnr } = useParams();
  const { state } = useLocation();
  const [ticket, setTicket] = useState(state?.ticket || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  // Failures while the ticket is on screen (e.g. a cancel that didn't go
  // through) show a banner — they must not clobber the ticket itself.
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!ticket) {
      api.ticket(pnr).then(setTicket).catch((err) => setError(err.message));
    }
  }, [pnr]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!modalOpen) return;
    setQuoteError("");
    setQuote(null);
    api.cancelQuote(pnr)
      .then(setQuote)
      .catch((err) => setQuoteError(err.message));
  }, [modalOpen, pnr]);

  if (error) return (
    <div className="step-shell">
      <div className="error-page">
        <p className="error-banner" role="alert">{error}</p>
        <div className="error-page-actions">
          <Link to="/" className="btn btn-amber">Back to home</Link>
          <Link to="/my-trips" className="btn btn-ghost">Look up by email</Link>
        </div>
      </div>
    </div>
  );
  if (!ticket) return <p className="muted">Loading ticket…</p>;

  const cancelled = ticket.status === "cancelled";
  const [depH, depM] = ticket.depart_time.split(":").map(Number);
  const arr = new Date();
  arr.setHours(depH, depM + ticket.duration_min, 0, 0);
  const arrText = `${String(arr.getHours()).padStart(2, "0")}:${String(arr.getMinutes()).padStart(2, "0")}`;

  function cancel() {
    setBusy(true);
    setActionError("");
    api.cancel(ticket.pnr)
      .then((t) => {
        setTicket(t);
        setModalOpen(false);
      })
      .catch((err) => setActionError(err.message))
      .finally(() => setBusy(false));
  }

  return (
    <div className="step-shell">
      <Stepper step={4} />
      <header className="step-head">
        <h1>{cancelled ? "Booking cancelled" : "You're booked!"}</h1>
        {!cancelled && <p className="step-sub muted">Show this ticket to the staff before boarding.</p>}
      </header>

      <div className="ticket-card" id="ticket-print">
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
            {cancelled ? (
              <>
                <div><dt>Cancellation fee</dt><dd className="mono">{ticket.cancellation_fee == null ? "—" : money(ticket.cancellation_fee)}</dd></div>
                <div><dt>Refunded</dt><dd className="stub-total mono">{ticket.refund_amount == null ? "—" : money(ticket.refund_amount)}</dd></div>
              </>
            ) : (
              <div><dt>Paid</dt><dd className="stub-total mono">{money(ticket.total_amount)}</dd></div>
            )}
          </dl>
        </div>
      </div>

      <p className="ticket-contact muted">
        {ticket.contact.name}, {ticket.contact.email} — {ticket.contact.phone}
      </p>

      {actionError && <p className="error-banner no-print" role="alert">{actionError}</p>}

      {!cancelled && (
        <div className="ticket-actions no-print">
          <button className="btn btn-amber" onClick={() => window.print()}>Print ticket</button>
          <button className="btn btn-ghost" onClick={() => setModalOpen(true)} disabled={busy}>Cancel booking</button>
        </div>
      )}
      {cancelled && (
        <div className="ticket-actions no-print">
          <button className="btn btn-amber" onClick={() => window.print()}>Print receipt</button>
        </div>
      )}
      {modalOpen && (
        <CancelModal
          ticket={ticket}
          onClose={() => !busy && setModalOpen(false)}
          onConfirm={cancel}
          busy={busy}
          quote={quote}
          quoteError={quoteError}
          confirmError={actionError}
        />
      )}
      <div className="ticket-actions no-print">
        <Link className="btn btn-ghost" to="/">Book another ride</Link>
        <Link className="btn btn-ghost" to="/my-trips">My trips</Link>
      </div>
    </div>
  );
}
