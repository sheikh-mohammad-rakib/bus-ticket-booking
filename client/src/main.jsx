import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { AuthProvider } from "./auth.jsx";
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
  return (
    <div className="step-shell">
      <div className="error-page">
        <p className="error-page-code">404</p>
        <h1 className="step-title">Page not found</h1>
        <p className="muted">
          The page you're looking for doesn't exist. It may have moved, or the
          link might be wrong.
        </p>
        <div className="error-page-actions">
          <Link to="/" className="btn btn-amber">Back to home</Link>
          <Link to="/my-trips" className="btn btn-ghost">My trips</Link>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
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
          Riders — a demo bus booking app. Payments are simulated; no card is charged.
        </footer>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
