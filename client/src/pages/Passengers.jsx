import { useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { api, money, fmtDuration, fmtDate } from "../api.js";
import { bnCity } from "../bn.js";
import { Stepper } from "../components/Header.jsx";

function formatCard(v) {
  return v.replace(/\D/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(v) {
  const d = v.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return d.slice(0, 2) + "/" + d.slice(2);
}

export function Passengers() {
  const { state } = useLocation();
  if (!state?.trip) {
    return (
      <div className="step-shell">
        <Stepper step={2} />
        <p className="error-banner">Pick seats first.</p>
        <Link to="/" className="btn btn-ghost">Search buses</Link>
      </div>
    );
  }
  return <BookingForm trip={state.trip} date={state.date} seats={state.seats} price={state.price} />;
}

function BookingForm({ trip, date, seats, price }) {
  const navigate = useNavigate();
  const total = price * seats.length;

  const [passengers, setPassengers] = useState(seats.map(() => ""));
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allNamed = passengers.every((n) => n.trim().length >= 2);
  const filled = contact.name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email) && contact.phone.trim();

  function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    api.book({
      trip_id: trip.id,
      date,
      seats,
      contact_name: contact.name,
      email: contact.email,
      phone: contact.phone,
      payment: { card_number: card.number.replace(/\s/g, ""), expiry: card.expiry, cvv: card.cvv },
    })
      .then((bk) => navigate(`/ticket/${bk.pnr}`, { replace: true, state: { fresh: true } }))
      .catch((err) => {
        setError(err.message);
        setBusy(false);
      });
  }

  return (
    <div className="step-shell">
      <Stepper step={2} />
      <header className="step-head">
        <h1>Who's riding?</h1>
        <p className="step-sub muted">
          {bnCity(trip.from_city)} → {bnCity(trip.to_city)} · <span className="mono">{fmtDate(date)} {trip.depart_time}</span> ·{" "}
          <span className="mono">{seats.join(" ")}</span>
        </p>
      </header>

      <form className="book-grid" onSubmit={submit}>
        <section className="book-main">
          <fieldset className="panel">
            <legend>Passengers</legend>
            {seats.map((seat, i) => (
              <label className="field" key={seat}>
                <span className="field-label">Seat <span className="mono">{seat}</span></span>
                <input
                  required
                  minLength={2}
                  value={passengers[i]}
                  onChange={(e) =>
                    setPassengers((cur) => cur.map((c, j) => (j === i ? e.target.value : c)))
                  }
                  placeholder="Full name"
                />
              </label>
            ))}
          </fieldset>

          <fieldset className="panel">
            <legend>Contact</legend>
            <label className="field">
              <span className="field-label">Name</span>
              <input required minLength={2} value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="Who should we call" />
            </label>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Email</span>
                <input required type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="you@example.com" />
              </label>
              <label className="field">
                <span className="field-label">Phone</span>
                <input required type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="+880 1xxx-xxxxxx" />
              </label>
            </div>
          </fieldset>

          <fieldset className="panel">
            <legend>Payment</legend>
            <label className="field">
              <span className="field-label">Card number</span>
              <input required inputMode="numeric" autoComplete="cc-number" value={card.number} onChange={(e) => setCard({ ...card, number: formatCard(e.target.value) })} placeholder="4111 1111 1111 1111" />
            </label>
            <div className="field-row">
              <label className="field">
                <span className="field-label">Expiry</span>
                <input required inputMode="numeric" autoComplete="cc-exp" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })} placeholder="MM/YY" />
              </label>
              <label className="field">
                <span className="field-label">CVV</span>
                <input required inputMode="numeric" autoComplete="cc-csc" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="123" />
              </label>
            </div>
            <p className="hint-line">Demo checkout — no real charge. Try <span className="mono">4111 1111 1111 1111</span>; cards ending <span className="mono">0000</span> are declined.</p>
          </fieldset>
        </section>

        <aside className="book-side">
          <div className="side-stub">
            <dl className="stub-list">
              <div><dt>Seats</dt><dd className="mono">{seats.join(" ")}</dd></div>
              <div><dt>Date</dt><dd className="mono">{fmtDate(date)}</dd></div>
              <div><dt>Departs</dt><dd className="mono">{trip.depart_time}</dd></div>
              <div><dt>On board</dt><dd>{fmtDuration(trip.duration_min)}</dd></div>
              <div><dt>Total</dt><dd className="stub-total mono">{money(total)}</dd></div>
            </dl>
            {error && <p className="error-banner" role="alert">{error}</p>}
            <button
              type="submit"
              className="btn btn-amber btn-block"
              disabled={busy || !allNamed || !filled}
            >
              {busy ? "Paying…" : `Pay ${money(total)}`}
            </button>
            <Link to="/" className="btn btn-ghost btn-block no-print">Cancel booking</Link>
          </div>
        </aside>
      </form>
    </div>
  );
}
