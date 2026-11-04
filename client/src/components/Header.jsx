import { Link } from "react-router-dom";

export function Header() {
  return (
    <header className="site-head no-print">
      <Link to="/" className="wordmark">
        <span className="wordmark-bus" aria-hidden="true">🚌</span>
        Riders
      </Link>
      <nav className="site-nav">
        <Link to="/" className="nav-link">Search buses</Link>
        <Link to="/my-trips" className="nav-link">My trips</Link>
      </nav>
    </header>
  );
}

export function Stepper({ step }) {
  const steps = ["Seats", "Passengers", "Payment", "Ticket"];
  return (
    <ol className="stepper no-print" aria-label="Booking progress">
      {steps.map((label, i) => (
        <li
          key={label}
          className={`stepper-step ${i + 1 < step ? "done" : ""} ${i + 1 === step ? "current" : ""}`}
          aria-current={i + 1 === step ? "step" : undefined}
        >
          <span className="stepper-num">{i + 1 < step ? "✓" : i + 1}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
