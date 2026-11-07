const BASE = "/api";

// Current UI language ("en" | "bn"), kept in sync by LangProvider.
// money/fmtDate/fmtDuration read it so ৳ fares, dates and durations render
// natively in either mode.
let uiLang = "en";
export const setUiLang = (l) => { uiLang = l === "bn" ? "bn" : "en"; };

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
  cancelQuote: (pnr) => request(`/bookings/${pnr}/cancel-quote`),
  cancel: (pnr) => request(`/bookings/${pnr}/cancel`, { method: "POST" }),
  myBookings: (email) => request(`/my-bookings${email ? `?email=${encodeURIComponent(email)}` : ""}`),
  register: (payload) => request("/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),
  adminLogin: (password) =>
    request("/admin/login", { method: "POST", body: JSON.stringify({ password }) }),
  adminLogout: () => request("/admin/logout", { method: "POST" }),
  adminMe: () => request("/admin/me"),
  adminStats: () => request("/admin/stats"),
  adminBookings: (q = "") => request(`/admin/bookings${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  adminCheckIn: (pnr) => request(`/admin/bookings/${pnr}/checkin`, { method: "POST" }),
  adminStaff: () => request("/admin/staff"),
  adminCreateStaff: (payload) => request("/admin/staff", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateStaff: (id, patch) => request(`/admin/staff/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  adminRemoveStaff: (id) => request(`/admin/staff/${id}`, { method: "DELETE", body: JSON.stringify({}) }),
  adminFleet: () => request("/admin/fleet"),
  adminCreateBus: (payload) => request("/admin/fleet", { method: "POST", body: JSON.stringify(payload) }),
  adminRemoveBus: (id) => request(`/admin/fleet/${id}`, { method: "DELETE", body: JSON.stringify({}) }),
  adminTrips: () => request("/admin/trips"),
  adminCreateTrip: (payload) => request("/admin/trips", { method: "POST", body: JSON.stringify(payload) }),
  adminUpdateTrip: (id, patch) => request(`/admin/trips/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  adminRemoveTrip: (id) => request(`/admin/trips/${id}`, { method: "DELETE", body: JSON.stringify({}) }),
};

import { bnDigits, BN_DAYS, BN_MONTHS } from "./bn.js";

export const money = (n) => {
  const f = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
  return uiLang === "bn" ? "৳" + bnDigits(f) : "৳" + f;
};

export function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (uiLang === "bn") {
    return m === 0 ? `${bnDigits(h)}ঘ` : `${bnDigits(h)}ঘ ${bnDigits(m)}মি`;
  }
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (uiLang === "bn") {
    return `${BN_DAYS[dt.getDay()]}, ${bnDigits(d)} ${BN_MONTHS[m - 1]}`;
  }
  return `${DAYS[dt.getDay()]}, ${d} ${MONTHS[m - 1]}`;
}
