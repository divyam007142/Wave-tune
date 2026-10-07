import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext";

type GoogleCredentialResponse = { credential?: string };

type GoogleIdentityApi = {
  initialize: (options: {
    client_id: string;
    nonce: string;
    ux_mode: "popup";
    callback: (response: GoogleCredentialResponse) => void;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      theme: "outline";
      size: "large";
      type: "standard";
      text: "continue_with";
      shape: "rectangular";
      logo_alignment: "left";
      width: number;
    },
  ) => void;
  cancel?: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentityApi } };
  }
}

let googleIdentityScript: Promise<void> | undefined;

function loadGoogleIdentityScript() {
  if (window.google?.accounts.id) return Promise.resolve();
  if (googleIdentityScript) return googleIdentityScript;

  googleIdentityScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => window.google?.accounts.id
      ? resolve()
      : reject(new Error("Google sign-in could not be loaded. Try again."));
    script.onerror = () => {
      script.remove();
      googleIdentityScript = undefined;
      reject(new Error("Google sign-in could not be loaded. Try again."));
    };
    document.head.append(script);
  });
  return googleIdentityScript;
}

export function AuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { signInWithGoogle, signInWithPassword, registerWithPassword } = useAuth();
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busyAction, setBusyAction] = useState<"google" | "password" | null>(null);
  const busy = busyAction !== null;
  const googleButton = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    const initializeGoogleSignIn = async () => {
      try {
        const configResponse = await fetch("/api/auth/google/config", { credentials: "same-origin" });
        const config = await configResponse.json().catch(() => ({})) as {
          clientId?: string;
          nonce?: string;
          error?: string;
        };
        if (!configResponse.ok || !config.clientId || !config.nonce) {
          throw new Error(config.error || "Google sign-in could not be configured.");
        }

        await loadGoogleIdentityScript();
        if (!active || !googleButton.current || !window.google) return;

        const buttonContainer = googleButton.current;
        window.google.accounts.id.initialize({
          client_id: config.clientId,
          nonce: config.nonce,
          ux_mode: "popup",
          callback: (credentialResponse) => {
            if (!active) return;
            if (!credentialResponse.credential) {
              setError("Google did not return a verified account. Try again.");
              return;
            }
            setError("");
            setBusyAction("google");
            void signInWithGoogle(credentialResponse.credential)
              .then(() => {
                if (active) onSuccess();
              })
              .catch((requestError: unknown) => {
                if (active) {
                  setError(requestError instanceof Error ? requestError.message : "Could not sign in with Google.");
                }
              })
              .finally(() => {
                if (active) setBusyAction(null);
              });
          },
        });
        buttonContainer.replaceChildren();
        window.google.accounts.id.renderButton(buttonContainer, {
          theme: "outline",
          size: "large",
          type: "standard",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: Math.min(400, Math.max(200, Math.floor(buttonContainer.clientWidth))),
        });
      } catch (requestError) {
        if (active) {
          googleButton.current?.classList.add("is-unavailable");
          setError(requestError instanceof Error ? requestError.message : "Google sign-in is unavailable.");
        }
      }
    };

    void initializeGoogleSignIn();
    return () => {
      active = false;
      window.google?.accounts.id.cancel?.();
    };
  }, [onSuccess, signInWithGoogle]);

  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const switchMode = (nextMode: "signin" | "register") => {
    setMode(nextMode);
    setError("");
    setPassword("");
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (mode === "register" && password.length < 12) {
      setError("Use a password that is at least 12 characters long.");
      return;
    }

    setError("");
    setBusyAction("password");
    try {
      if (mode === "register") {
        await registerWithPassword(email.trim(), password);
      } else {
        await signInWithPassword(email.trim(), password);
      }
      onSuccess();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We couldn't complete your request. Please try again.");
    } finally {
      setBusyAction(null);
    }
  };

  return createPortal(
    <div className="auth-modal-backdrop" onMouseDown={onBackdropClick}>
      <section
        className="auth-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        aria-busy={busy}
      >
        <button className="auth-modal-close" type="button" onClick={onClose} aria-label="Close sign-in dialog">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
        <div className="auth-modal-kicker">Wave Tune <span>·</span> Personal radio</div>
        <h1 id="auth-modal-title">{mode === "signin" ? "WELCOME BACK" : "TUNE IN, TOGETHER"}</h1>
        <p className="auth-modal-subtitle">
          {mode === "signin"
            ? "Sign in to find your saved music and playlists right where you left them."
            : "Create an account to keep your discoveries and playlists close."}
        </p>
        <div
          ref={googleButton}
          className={`auth-google-button${busy ? " is-busy" : ""}`}
          role="group"
          aria-label="Continue with Google"
          aria-busy={busy}
        >
          <button className="auth-google-fallback" type="button" disabled>
            Continue with Google
          </button>
        </div>
        {busy && (
          <p className="auth-modal-status" role="status">
            {busyAction === "google"
              ? "Verifying your Google account…"
              : mode === "register" ? "Creating your account…" : "Signing you in…"}
          </p>
        )}
        <div className="auth-modal-divider" aria-hidden="true">OR USE EMAIL</div>
        <form className="auth-form" onSubmit={handlePasswordSubmit} noValidate={false}>
          <label className="auth-field" htmlFor="auth-email">
            <span>Email</span>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@email.com"
              maxLength={254}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (error) setError("");
              }}
              required
              disabled={busy}
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <span className="password-input-wrap">
              <input
                id="auth-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                placeholder="Enter your password"
                maxLength={128}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (error) setError("");
                }}
                aria-invalid={mode === "register" && password.length > 0 && password.length < 12}
                aria-describedby={mode === "register" ? "auth-password-help" : undefined}
                required
                disabled={busy}
              />
              <button
                type="button"
                className="password-visibility"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={busy}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
          {mode === "register" && (
            <p className="auth-password-help" id="auth-password-help">
              Use at least 12 characters for your password.
            </p>
          )}
          <button className="auth-submit" type="submit" disabled={busy}>
            {busy && <span className="spinner spinner-dark" aria-hidden="true" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        {error && <p className="auth-modal-error" role="alert">{error}</p>}
        <p className="auth-modal-footnote">
          {mode === "signin" ? "New to Wave Tune?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => switchMode(mode === "signin" ? "register" : "signin")}
            disabled={busy}
          >
            {mode === "signin" ? "REGISTER" : "LOG IN"}
          </button>
        </p>
      </section>
    </div>,
    document.body,
  );
}
