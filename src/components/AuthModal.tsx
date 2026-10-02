import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useAuth } from "../context/AuthContext";

const googleErrors: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured yet.",
  google_unavailable: "Google sign-in is temporarily unavailable. Try again.",
  google_failed: "Google sign-in could not be completed. Try again.",
};

export function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [location, setLocation] = useLocation();
  const { login, register } = useAuth();
  const mode = location.startsWith("/sign-up") ? "register" : "login";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (mode === "register" ? nameInput : emailInput).current?.focus();
    const queryError = new URLSearchParams(window.location.search).get("auth_error");
    if (queryError) setError(googleErrors[queryError] ?? "Sign-in could not be completed.");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mode, onClose]);

  const switchMode = () => {
    setError("");
    setPassword("");
    setLocation(mode === "login" ? "/sign-up" : "/sign-in");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      onSuccess();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return createPortal(
    <div className="auth-modal-backdrop" onMouseDown={onBackdropClick}>
      <section className="auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <button className="auth-modal-close" type="button" onClick={onClose} aria-label="Close sign-in">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
        <div className="auth-modal-brand" aria-hidden="true">
          <span className="auth-modal-mark"><i /><i /><i /><i /></span>
          <span className="auth-modal-wordmark">WAVE <b>TUNE</b></span>
          <span className="auth-modal-brand-note">PERSONAL RADIO</span>
        </div>
        <h1 id="auth-modal-title">{mode === "login" ? "WELCOME BACK" : "CREATE ACCOUNT"}</h1>
        <p className="auth-modal-subtitle">
          {mode === "login"
            ? "Login to unlock advanced cards and save your profile"
            : "Create an account to save your music and profile"}
        </p>

        <button
          className="auth-google-button"
          type="button"
          onClick={() => window.location.assign("/api/auth/google/start")}
        >
          <svg className="auth-google-logo" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.14-3.09-.4-4.55H24v9.02h12.91c-.58 2.96-2.26 5.48-4.74 7.18l7.64 5.93C44.27 37.75 46.98 31.7 46.98 24.55z" />
            <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19C.92 16.51 0 20.11 0 24s.92 7.49 2.53 10.78l8-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.64-5.93c-2.13 1.42-4.83 2.26-8.26 2.26-6.34 0-11.72-4.28-13.64-10.03l-8 6.19C6.37 42.59 14.6 48 24 48z" />
          </svg>
          <span>CONTINUE WITH GOOGLE</span>
        </button>

        <div className="auth-modal-divider" aria-hidden="true"><span>OR</span></div>

        <form className="auth-modal-form" onSubmit={submit}>
          {mode === "register" && (
            <label>
              <span>NAME</span>
              <input
                ref={nameInput}
                type="text"
                name="name"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
              />
            </label>
          )}
          <label>
            <span>EMAIL</span>
            <input
              ref={emailInput}
              type="email"
              name="email"
              autoComplete="email"
              placeholder="your@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              required
            />
          </label>
          <label>
            <span>PASSWORD</span>
            <input
              type="password"
              name="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={mode === "register" ? 8 : undefined}
              maxLength={128}
              required
            />
          </label>
          {error && <p className="auth-modal-error" role="alert">{error}</p>}
          <button className="auth-submit-button" type="submit" disabled={busy}>
            {busy ? "PLEASE WAIT…" : mode === "login" ? "LOGIN" : "REGISTER"}
          </button>
        </form>

        <p className="auth-modal-switch">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}
          {" "}
          <button type="button" onClick={switchMode}>
            {mode === "login" ? "REGISTER" : "LOGIN"}
          </button>
        </p>
      </section>
    </div>,
    document.body,
  );
}
