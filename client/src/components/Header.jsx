import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export function Header() {
  const { user, signOut } = useAuth();
  const { pathname } = useLocation();

  return (
    <header className="site-head no-print">
      <Link to="/" className="wordmark">
        <span className="wordmark-bus" aria-hidden="true">🚌</span>
        Riders
      </Link>
      <nav className="site-nav">
        <Link to="/" className="nav-link">Search buses</Link>
        <Link to="/my-trips" className="nav-link">My trips</Link>
        <Link to="/admin" className="nav-link nav-link--quiet">Admin</Link>
        {user ? (
          <span className="user-chip">
            <span className="user-name" title={user.email}>
              {user.name.split(" ")[0]}
              {(user.role === "owner" || user.role === "admin" || user.role === "counter_operator") && (
                <span className="role-badge">{user.role === "counter_operator" ? "counter" : "owner"}</span>
              )}
            </span>
            <button className="link-btn" onClick={signOut}>Sign out</button>
          </span>
        ) : pathname !== "/login" ? (
          <Link to="/login" state={{ from: pathname }} className="btn btn-amber btn--small">Sign in</Link>
        ) : null}
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
