import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, fmtDuration, fmtDate } from "../api.js";
import { bnCity } from "../bn.js";
import { useLang } from "../lang.jsx";

function DayPicker({ date, onChange }) {
  const { t } = useLang();
  const options = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    options.push({ iso, label: i === 0 ? t("Today") : i === 1 ? t("Tomorrow") : fmtDate(iso) });
  }
  return (
    <select className="field-select" value={date} onChange={(e) => onChange(e.target.value)} aria-label={t("Travel date")}>
      {options.map((o) => (
        <option key={o.iso} value={o.iso}>{o.label}</option>
      ))}
    </select>
  );
}

export function TripRow({ trip, date }) {
  const { t } = useLang();
  const [depH, depM] = trip.depart_time.split(":").map(Number);
  const arr = new Date();
  arr.setHours(depH, depM + trip.duration_min, 0, 0);
  const arrText = `${String(arr.getHours()).padStart(2, "0")}:${String(arr.getMinutes()).padStart(2, "0")}`;
  return (
    <article className="trip-row">
      <div className="trip-times">
        <div>
          <span className="trip-time">{trip.depart_time}</span>
          <span className="trip-city">{trip.from_city}</span>
        </div>
        <div className="trip-bar" aria-hidden="true">
          <span className="trip-duration">{fmtDuration(trip.duration_min)}</span>
        </div>
        <div>
          <span className="trip-time">{arrText}</span>
          <span className="trip-city">{trip.to_city}</span>
        </div>
      </div>
      <div className="trip-meet">
        <span className="chip chip-type">{t(trip.type)}</span>
        <span className="trip-operator">
          <strong>{trip.operator}</strong> {trip.bus_name}
        </span>
      </div>
      <div className="trip-buy">
        <span className={
          trip.available_seats > 10 ? "trip-seats trip-seats--ok" :
          trip.available_seats > 0 ? "trip-seats trip-seats--low" : "trip-seats trip-seats--out"
        }>
          {trip.available_seats > 0 ? t("{n} of {m} seats free", { n: trip.available_seats, m: trip.total_seats }) : t("Sold out")}
        </span>
        <span className="trip-price">{money(trip.price)}</span>
        <Link
          to={`/trips/${trip.id}/seatmap?date=${date}`}
          className="btn btn-amber"
          aria-disabled={trip.available_seats === 0}
        >
          {trip.available_seats > 0 ? t("Choose seats") : t("Unavailable")}
        </Link>
      </div>
    </article>
  );
}

export function Home() {
  const { t } = useLang();
  const [cities, setCities] = useState([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.cities().then((list) => {
      setCities(list);
      const fromCity = list.find((c) => c.name === "Dhaka") || list[0];
      const toCity =
        list.find((c) => c.name === "Chattogram") ||
        list.find((c) => c.name !== fromCity.name) ||
        list[1];
      if (fromCity && toCity) {
        setFrom(fromCity.name);
        setTo(toCity.name);
      }
    });
  }, []);

  function swap() {
    setFrom(to);
    setTo(from);
    setSearched(false);
  }

  function search(e) {
    e.preventDefault();
    if (!from || !to) return;
    if (from === to) {
      setError(t("Pick two different cities."));
      return;
    }
    setError("");
    setLoading(true);
    api.trips(from, to, date)
      .then(setTrips)
      .then(() => setSearched(true))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  return (
    <>
      <section className="hero no-print">
        <h1>
          <span className="hero-bn">শহর থেকে শহর</span>
          <span className="hero-en">{t("Night coaches, window seats, all across Bangladesh")}</span>
        </h1>
      </section>

      <form className="search-bar no-print" onSubmit={search}>
        <label className="field">
          <span className="field-label">{t("From")}</span>
          <select className="field-select" value={from} onChange={(e) => setFrom(e.target.value)}>
            {cities.map((c) => <option key={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button type="button" className="swap" onClick={swap} title={t("Swap cities")} aria-label={t("Swap cities")}>⇄</button>
        <label className="field">
          <span className="field-label">{t("To")}</span>
          <select className="field-select" value={to} onChange={(e) => setTo(e.target.value)}>
            {cities.map((c) => <option key={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field field-date">
          <span className="field-label">{t("On")}</span>
          <DayPicker date={date} onChange={setDate} />
        </label>
        <button type="submit" className="btn btn-amber btn-big" disabled={loading || !from || !to}>
          {loading ? t("Looking…") : t("Find buses")}
        </button>
      </form>
      {error && <p className="error-banner">{error}</p>}

      {searched && !error && (
        <section className="results">
          <h2 className="results-head">
            <span className="results-cities">{bnCity(from)} → {bnCity(to)}</span>
            <span className="muted results-sub">{from} → {to} · {fmtDate(date)}</span>
          </h2>
          {trips.length === 0
            ? <p className="empty-line">{t("No buses run this route on {date}. Try another day or city.", { date: fmtDate(date) })}</p>
            : trips.map((tr) => <TripRow key={tr.id} trip={tr} date={date} />)}
        </section>
      )}

      {!searched && (
        <p className="hint-line no-print">
          {t("Popular right now: {pair}. Pick a route above.", {
            pair: cities[0] && cities[1] ? `${cities[0].name} ↔ ${cities[1].name}` : "…",
          })}
        </p>
      )}
    </>
  );
}
