import { useEffect, useState } from "react";
import { useNavigate, useParams, Link, useSearchParams } from "react-router-dom";
import { api, money, fmtDuration, fmtDate } from "../api.js";
import { bnCity } from "../bn.js";
import { useLang } from "../lang.jsx";
import { Stepper } from "../components/Header.jsx";

const MAX_SEATS = 6;

export function SeatMap() {
  const { t } = useLang();
  const { tripId } = useParams();
  const [params] = useSearchParams();
  const date = params.get("date");
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (!date) {
      setError(t("No travel date chosen"));
      setLoading(false);
      return;
    }
    api.seatmap(tripId, date)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [tripId, date]);

  if (loading) return <p className="muted">{t("Loading the bus…")}</p>;
  if (error) return (
    <div className="step-shell">
      <Stepper step={1} />
      <p className="error-banner">{error}</p>
      <Link to="/" className="btn btn-ghost">{t("Back to search")}</Link>
    </div>
  );

  const { trip, layout, sold } = data;
  const soldSet = new Set(sold);
  const total = trip.price * selected.length;

  function toggle(seat) {
    if (soldSet.has(seat)) return;
    setSelected((cur) =>
      cur.includes(seat) ? cur.filter((s) => s !== seat)
      : cur.length >= MAX_SEATS ? cur
      : [...cur, seat]
    );
  }

  return (
    <div className="step-shell">
      <Stepper step={1} />

      <header className="step-head">
        <h1>{bnCity(trip.from_city)} → {bnCity(trip.to_city)}</h1>
        <p className="step-sub muted">
          {trip.from_city} → {trip.to_city} · {trip.operator} · {trip.bus_name} · {t(trip.type)}
        </p>
      </header>

      <div className="seatmap-grid">
        <section className="seatmap-card">
          <div className="driver" aria-hidden="true">
            <span>🚌</span> {t("Front")}
          </div>
          <div className="seatmap" role="group" aria-label={t("Seat map")}>
            {layout.rowsWithSeats.map((row) => (
              <div className="seatmap-row" key={row.label}>
                <span className="seatmap-rowlabel" aria-hidden="true">{row.label}</span>
                {row.seats.map((seat, i) => {
                  const cls = [
                    "seat",
                    soldSet.has(seat) ? "seat-sold" : "",
                    selected.includes(seat) ? "seat-selected" : "",
                    row.aisleAfter?.includes(i + 1) ? "seat-aisle-gap" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <button
                      key={seat}
                      className={cls}
                      onClick={() => toggle(seat)}
                      disabled={soldSet.has(seat)}
                      aria-pressed={selected.includes(seat)}
                      aria-label={soldSet.has(seat)
                        ? t("Seat {seat} (taken)", { seat })
                        : t("Seat {seat}", { seat })}
                    >
                      {seat.replace(row.label, "")}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="seat-legend no-print">
            <span><i className="seat seat-avail" aria-hidden="true" /> {t("Free")}</span>
            <span><i className="seat seat-selected" aria-hidden="true" /> {t("Yours")}</span>
            <span><i className="seat seat-sold" aria-hidden="true" /> {t("Taken")}</span>
          </div>
        </section>

        <aside className="seatmap-side">
          <div className="side-stub">
            <dl className="stub-list">
              <div><dt>{t("Date")}</dt><dd className="mono">{fmtDate(date)}</dd></div>
              <div><dt>{t("Departs")}</dt><dd className="mono">{trip.depart_time}</dd></div>
              <div><dt>{t("On board")}</dt><dd>{fmtDuration(trip.duration_min)}</dd></div>
            </dl>
            <dl className="stub-list">
              <div><dt>{t("Seats")}</dt><dd className="mono">{selected.length ? selected.join(" ") : "—"}</dd></div>
              <div><dt>{t("Fare each")}</dt><dd className="mono">{money(trip.price)}</dd></div>
              <div><dt>{t("Total")}</dt><dd className="stub-total mono">{money(total)}</dd></div>
            </dl>
            {selected.length === MAX_SEATS && (
              <p className="hint-line">{t("Up to {n} seats per booking.", { n: MAX_SEATS })}</p>
            )}
            <button
              className="btn btn-amber btn-block"
              disabled={selected.length === 0}
              onClick={() =>
                navigate("/book", { state: { trip, date, seats: selected, price: trip.price } })
              }
            >
              {t("Continue to passengers")}
            </button>
            <Link to="/" className="btn btn-ghost btn-block no-print">{t("Back to results")}</Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
