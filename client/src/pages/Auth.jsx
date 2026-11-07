import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { useLang } from "../lang.jsx";

export function Auth() {
  const { t } = useLang();
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
        <h1>{mode === "login" ? t("Assalamu alaikum again") : t("Join Riders")}</h1>
        <p className="step-sub muted">
          {mode === "login"
            ? t("Sign in to track bookings and cancel from your dashboard.")
            : t("One account for all your bus tickets across Bangladesh.")}
        </p>
      </header>

      <div className="auth-tabs" role="tablist">
        <button role="tab" aria-selected={mode === "login"} className={`auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>
          {t("Sign in")}
        </button>
        <button role="tab" aria-selected={mode === "register"} className={`auth-tab ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>
          {t("Create account")}
        </button>
      </div>

      <form className="modal auth-form" onSubmit={submit} style={{ maxWidth: 440 }}>
        {mode === "register" && (
          <label className="field">
            <span className="field-label">{t("Full name")}</span>
            <input id="f-name" value={form.name} onChange={set("name")} autoComplete="name" required minLength={2} maxLength={80} />
          </label>
        )}
        <label className="field">
          <span className="field-label">{t("Email")}</span>
          <input id="f-email" type="email" value={form.email} onChange={set("email")} autoComplete="email" required placeholder="you@example.com" />
        </label>
        <label className="field">
          <span className="field-label">{t("Password")}</span>
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
          <p className="hint-line">{t("At least 8 characters. Stored salted and bcrypt-hashed.")}</p>
        )}
        {error && <p className="error-banner" role="alert">{error}</p>}
        <button className="btn btn-amber" type="submit" disabled={busy}>
          {busy ? t("Working…") : mode === "login" ? t("Sign in") : t("Create account")}
        </button>
      </form>
    </div>
  );
}
