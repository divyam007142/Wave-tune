import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Headphones, LockKeyhole, X } from "lucide-react";

export function GuestLimitModal({ open, onClose, onLogin }: {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const loginButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    loginButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && <motion.div
        className="guest-limit-backdrop"
        role="presentation"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <motion.section
          className="guest-limit-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="guest-limit-title"
          initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
        >
          <button className="guest-limit-close" onClick={onClose} aria-label="Close guest limit message"><X size={17} /></button>
          <div className="guest-limit-art" aria-hidden="true">
            <div className="guest-limit-disc"><Headphones size={31} /></div>
            <span className="guest-limit-spark spark-one">♪</span>
            <span className="guest-limit-spark spark-two">♫</span>
          </div>
          <span className="guest-limit-eyebrow"><LockKeyhole size={12} /> DAILY GUEST PASS COMPLETE</span>
          <h2 id="guest-limit-title">That’s a wrap for today.</h2>
          <p>You’ve played your 5 guest songs. Come back tomorrow for a fresh wave, or log in now to keep listening and save your music.</p>
          <button ref={loginButtonRef} className="guest-limit-login" onClick={onLogin}>Log in &amp; keep listening <ArrowRight size={16} /></button>
          <button className="guest-limit-later" onClick={onClose}>I’ll be back tomorrow</button>
          <div className="guest-limit-meter" aria-label="5 of 5 guest songs used">
            {Array.from({ length: 5 }, (_, index) => <i key={index} />)}
          </div>
        </motion.section>
      </motion.div>}
    </AnimatePresence>,
    document.body,
  );
}
