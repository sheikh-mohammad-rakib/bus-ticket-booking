import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

export function Auth() {
  const { signIn, signUp } = useAuth();
  const { state } = useLocation();
  const navigate = useNavigate();
  const [mode, setMode] = useState(state?.mode === "register" ? "register" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const action = mode === "login" ? signIn(form) : signUp(form);
    action
      .then(() => navigate(state?.from || "/", { replace: true }))
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="step-shell">
      <header className="step-head">
        <h1>{mode === "login" ? "Assalamu alaikum again" : "Join Riders"}</h1>
        <p className="step-sub muted">
          {mode === "login"
            ? "Sign in to track bookings and cancel from your dashboard."
            : "One account for all your bus tickets across Bangladesh."}
        </p>
      </header>

      <div className="auth-tabs" role="tablist">
        <button role="tab" aria-selected={mode === "login"} className={`auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>
          Sign in
        </button>
        <button role="tab" aria-selected={mode === "register"} className={`auth-tab ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>
          Create account
        </button>
      </div>

      <form className="modal auth-form" onSubmit={submit} style={{ maxWidth: 440 }}>
        {mode === "register" && (
          <label className="field">
            <span className="field-label">Full name</span>
            <input id="f-name" value={form.name} onChange={set("name")} autoComplete="name" required minLength={2} maxLength={80} />
          </label>
        )}
        <label className="field">
          <span className="field-label">Email</span>
          <input id="f-email" type="email" value={form.email} onChange={set("email")} autoComplete="email" required placeholder="you@example.com" />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input
            id="f-password"
            type="password"
            value={form.password}
            onChange={set("password")}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={mode === "register" ? 8 : undefined}
          />
        </label>
        {mode === "register" && (
          <p className="hint-line">At least 8 characters. Stored salted and bcrypt-hashed.</p>
        )}
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button className="btn btn-amber" type="submit" disabled={busy}>
          {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
