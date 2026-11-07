import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { AuthProvider } from "./auth.jsx";
import { LangProvider, useLang } from "./lang.jsx";
import "./styles.css";
import { Header } from "./components/Header.jsx";
import { Home } from "./pages/Home.jsx";
import { SeatMap } from "./pages/SeatMap.jsx";
import { Passengers } from "./pages/Passengers.jsx";
import { Ticket } from "./pages/Ticket.jsx";
import { MyTrips } from "./pages/MyTrips.jsx";
import { Admin } from "./pages/Admin.jsx";
import { Auth } from "./pages/Auth.jsx";

function NotFound() {
  const { t } = useLang();
  return (
    <div className="step-shell">
      <div className="error-page">
        <p className="error-page-code">404</p>
        <h1 className="step-title">{t("Page not found")}</h1>
        <p className="muted">{t("The page you're looking for doesn't exist. It may have moved, or the link might be wrong.")}</p>
        <div className="error-page-actions">
          <Link to="/" className="btn btn-amber">{t("Back to home")}</Link>
          <Link to="/my-trips" className="btn btn-ghost">{t("My trips")}</Link>
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { t } = useLang();
  return (
    <>
      <Header />
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/trips/:tripId/seatmap" element={<SeatMap />} />
          <Route path="/book" element={<Passengers />} />
          <Route path="/ticket/:pnr" element={<Ticket />} />
          <Route path="/my-trips" element={<MyTrips />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/login" element={<Auth />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="site-foot">
        {t("Riders — a demo bus booking app. Payments are simulated; no card is charged.")}
      </footer>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LangProvider>
          <Shell />
        </LangProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
