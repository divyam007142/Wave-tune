import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowDownToLine, Check, ChevronRight, Download, Music2, Plus, Share2, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function InstallAppButton() {
  const reduceMotion = useReducedMotion();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(() =>
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
  );
  const [showGuide, setShowGuide] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setIsIOS(isIOSDevice());
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowGuide(false);
    };
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const onDisplayModeChange = () => {
      if (displayMode.matches) onInstalled();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    displayMode.addEventListener("change", onDisplayModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      displayMode.removeEventListener("change", onDisplayModeChange);
    };
  }, []);

  useEffect(() => {
    if (!showGuide) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowGuide(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [showGuide]);

  const openGuide = () => {
    setMessage("");
    setShowGuide(true);
  };

  const install = async () => {
    if (!installPrompt) return;
    setInstalling(true);
    setMessage("");
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") {
        setInstalled(true);
        setShowGuide(false);
      } else {
        setMessage("No problem. You can install Wave Tune whenever you’re ready.");
      }
    } catch {
      setInstallPrompt(null);
      setMessage("Use your browser’s menu to install Wave Tune.");
    } finally {
      setInstalling(false);
    }
  };

  if (installed) return null;

  return <>
    <button
      type="button"
      className="install-app-button"
      onClick={() => installPrompt ? void install() : openGuide()}
      aria-label={installPrompt ? "Install Wave Tune" : "Show install options for Wave Tune"}
      title={installPrompt ? "Install Wave Tune" : "Show install options"}
    >
      <Download size={15} />
      <span>Install app</span>
    </button>
    {createPortal(
      <AnimatePresence>
        {showGuide && <motion.div
          className="install-guide-backdrop"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowGuide(false);
          }}
        >
          <motion.section
            className="install-guide-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-guide-title"
            initial={reduceMotion ? false : { opacity: 0, y: 18, scale: .96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 10, scale: .98 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
          >
            <div className="install-guide-head">
              <span className="install-guide-kicker"><Sparkles size={12} /> YOUR PERSONAL MUSIC SPACE</span>
              <button ref={closeButtonRef} className="install-guide-close" type="button" onClick={() => setShowGuide(false)} aria-label="Close install instructions"><X size={17} /></button>
            </div>
            <div className="install-guide-brand">
              <span className="install-guide-app-icon"><img src="/wave-tune-icon-192.png" alt="" width={192} height={192} decoding="async" /></span>
              <span><strong>Wave Tune</strong><small>Music that moves with you</small></span>
              <span className="install-guide-live"><i /> {installPrompt ? "INSTALL AVAILABLE" : "INSTALL GUIDE"}</span>
            </div>
            <div className="install-guide-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
            <h2 id="install-guide-title">Your music,<br /><em>one tap away.</em></h2>
            <p className="install-guide-intro">Add Wave Tune to your device for a full-screen player, faster access, and your listening streak right at hand.</p>
            <div className="install-guide-perks">
              <div><span><Music2 size={15} /></span><strong>Your own music space</strong><small>Opens like an app, without browser clutter.</small></div>
              <div><span><Sparkles size={15} /></span><strong>Pick up where you left off</strong><small>Your player is always a tap away.</small></div>
            </div>
            {installPrompt
              ? <button type="button" className="install-guide-install" disabled={installing} onClick={() => void install()}>
                  {installing ? <span className="spinner" /> : <ArrowDownToLine size={17} />}
                  {installing ? "Opening install…" : "Install Wave Tune"}
                  {!installing && <ChevronRight size={16} />}
                </button>
              : <div className="install-guide-steps">
                  {isIOS ? <>
                    <span className="install-guide-step-icon"><Share2 size={16} /></span>
                    <span><strong>Open the Share menu</strong><small>Tap <Share2 size={12} /> Share, then choose <b>Add to Home Screen</b>.</small></span>
                  </> : <>
                    <span className="install-guide-step-icon"><Download size={16} /></span>
                    <span><strong>Open your browser menu</strong><small>Choose <b>Install Wave Tune</b> or <b>Add to Home Screen</b>.</small></span>
                  </>}
                </div>}
            {message && <p className="install-guide-message" role="status"><InfoIcon />{message}</p>}
            <button type="button" className="install-guide-later" onClick={() => setShowGuide(false)}>
              {installPrompt ? "Maybe later" : "Got it"} {!installPrompt && <Check size={14} />}
            </button>
            <span className="install-guide-footnote"><Plus size={11} /> No app-store account needed · Free to install</span>
          </motion.section>
        </motion.div>}
      </AnimatePresence>,
      document.body,
    )}
  </>;
}

function InfoIcon() {
  return <Music2 size={14} aria-hidden="true" />;
}
