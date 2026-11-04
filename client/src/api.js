const BASE = "/api";

async function request(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  cities: () => request("/cities"),
  trips: (from, to, date) =>
    request(`/trips?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${date}`),
  seatmap: (tripId, date) => request(`/trips/${tripId}/seatmap?date=${date}`),
  book: (payload) => request("/bookings", { method: "POST", body: JSON.stringify(payload) }),
  ticket: (pnr) => request(`/bookings/${pnr}`),
  cancel: (pnr) => request(`/bookings/${pnr}/cancel`, { method: "POST" }),
  myBookings: (email) => request(`/my-bookings?email=${encodeURIComponent(email)}`),
};

export const money = (n) =>
  "৳" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);

export function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]}, ${d} ${MONTHS[m - 1]}`;
}
