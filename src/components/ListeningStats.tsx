import { useEffect, useState } from "react";
import { Activity, Headphones, Radio } from "lucide-react";
import { accountService, type ListenerStats } from "../services/account";

function formatListeningTime(seconds: number) {
  if (seconds < 60) return "Under 1 min";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min listened`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr listened`;
}

function formatLastSeen(value: string | null) {
  if (!value) return "Not online yet";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} d ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function ListeningStats({ isSignedIn, onLogin }: { isSignedIn: boolean; onLogin: () => void }) {
  const [listeners, setListeners] = useState<ListenerStats[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSignedIn) {
      setListeners([]);
      setError("");
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const result = await accountService.getListenerStats();
        if (active) {
          setListeners(result.listeners);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Listening stats are unavailable.");
      }
    };
    const sendHeartbeat = () => {
      void accountService.updatePresence(true)
        .catch(() => undefined)
        .then(refresh);
    };
    const markOffline = () => {
      void accountService.updatePresence(false, true).catch(() => undefined);
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 30_000);
    window.addEventListener("pagehide", markOffline);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("pagehide", markOffline);
    };
  }, [isSignedIn]);

  return <section className="queue-panel listening-stats-panel">
    <div className="queue-head"><div><span className="eyebrow">YOUR COMMUNITY</span><h2>Listening stats</h2></div><Activity size={15} /></div>
    {!isSignedIn ? <div className="stats-sign-in">
      <Headphones size={19} />
      <p>Sign in to see listener stats.</p>
      <button className="text-button" onClick={onLogin}>Sign in</button>
    </div> : error ? <p className="stats-message">{error}</p> : listeners.length ? <div className="listener-list">
      {listeners.slice(0, 8).map((listener) => {
        const label = listener.nickname || listener.name;
        return <article className="listener-row" key={listener.id}>
          {listener.image
            ? <img className="listener-avatar" src={listener.image} alt="" referrerPolicy="no-referrer" />
            : <span className="listener-avatar listener-avatar-fallback">{label.slice(0, 2).toUpperCase()}</span>}
          <span className="listener-details">
            <strong title={label}>{label}</strong>
            <small>{formatListeningTime(listener.totalListeningSeconds)}</small>
            <small>{listener.isOnline ? "Online now" : `Last online ${formatLastSeen(listener.lastSeenAt)}`}</small>
          </span>
          <span className={`listener-status ${listener.isOnline ? "is-online" : "is-offline"}`} title={listener.isOnline ? "Online" : "Offline"} aria-label={listener.isOnline ? "Online" : "Offline"} />
        </article>;
      })}
    </div> : <div className="stats-sign-in"><Radio size={19} /><p>No listener activity yet.</p></div>}
  </section>;
}
