import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./styles.css";
import { Header } from "./components/Header.jsx";
import { Home } from "./pages/Home.jsx";
import { SeatMap } from "./pages/SeatMap.jsx";
import { Passengers } from "./pages/Passengers.jsx";
import { Ticket } from "./pages/Ticket.jsx";
import { MyTrips } from "./pages/MyTrips.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Header />
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/trips/:tripId/seatmap" element={<SeatMap />} />
          <Route path="/book" element={<Passengers />} />
          <Route path="/ticket/:pnr" element={<Ticket />} />
          <Route path="/my-trips" element={<MyTrips />} />
          <Route path="*" element={<p className="muted">Page not found.</p>} />
        </Routes>
      </main>
      <footer className="site-foot">
        Riders — a demo bus booking app. Payments are simulated; no card is charged.
      </footer>
    </BrowserRouter>
  </React.StrictMode>
);
