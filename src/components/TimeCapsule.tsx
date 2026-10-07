import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, Clock3, Headphones, LockKeyhole, RotateCw } from "lucide-react";
import { accountService, type TimeCapsuleStats } from "../services/account";
import type { Track } from "../types/music";

function durationLabel(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes) return `${minutes}m ${String(remaining).padStart(2, "0")}s`;
  return `${remaining}s`;
}

function dateLabel(day: string, options: Intl.DateTimeFormatOptions) {
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(date);
}

function capsuleArtwork(track: Track) {
  return track.artwork || "";
}

export function TimeCapsule({ isSignedIn, onLogin }: { isSignedIn: boolean; onLogin: () => void }) {
  const [days, setDays] = useState<7 | 30>(7);
  const [stats, setStats] = useState<TimeCapsuleStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isSignedIn) {
      setStats(null);
      setError("");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    accountService.getTimeCapsule(days)
      .then((result) => { if (active) setStats(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Your listening record could not be opened."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [days, isSignedIn, attempt]);

  const chartDays = stats?.daily ?? [];
  const maximum = Math.max(0, ...chartDays.map((item) => item.seconds));
  const tallestLabel = durationLabel(maximum);

  return <div className="page capsule-page">
    <header className="capsule-heading">
      <div>
        <span className="eyebrow">SOUND CAPSULE · {stats?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "LOCAL TIME"}</span>
        <h1>Sound Capsule</h1>
        <p>A small record of where your listening days have gone.</p>
      </div>
      <div className="capsule-stamp" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M8 26v-4m6 10V16m6 17V14m6 23V11m6 24V15m6 18V18m6 10v-5" /></svg></div>
    </header>

    {!isSignedIn ? <section className="capsule-gate">
      <div className="capsule-gate-mark"><LockKeyhole size={20} /></div>
      <span className="eyebrow">PRIVATE BY DESIGN</span>
      <h2>Your listening, kept close.</h2>
      <p>Sign in to open your listening record. Sound Capsule uses account activity only; it never adds sample listening.</p>
      <button className="primary-button" type="button" onClick={onLogin}><Headphones size={15} /> Sign in to view your capsule <ArrowUpRight size={14} /></button>
      <small>Per-day and per-song play tracking starts now. Your legacy lifetime listening time remains available in Settings.</small>
    </section> : <>
      <div className="capsule-period-row">
        <div className="capsule-period-copy"><span className="eyebrow">THE RECORD</span><strong>{days} days, ending today</strong></div>
        <div className="capsule-period-switch" role="group" aria-label="Sound Capsule period">
          <button type="button" className={days === 7 ? "is-active" : ""} aria-pressed={days === 7} onClick={() => setDays(7)}>7 days</button>
          <button type="button" className={days === 30 ? "is-active" : ""} aria-pressed={days === 30} onClick={() => setDays(30)}>30 days</button>
        </div>
      </div>

      {loading && <section className="capsule-loading" role="status" aria-label="Loading your listening record">
        <div className="capsule-skeleton-title" />
        <div className="capsule-skeleton-chart">{Array.from({ length: days }, (_, index) => <i key={index} />)}</div>
        <div className="capsule-skeleton-metrics"><i /><i /><i /><i /></div>
      </section>}

      {!loading && error && <section className="capsule-error" role="alert">
        <Activity size={22} /><span className="eyebrow">THE RECORD IS OUT OF REACH</span><h2>Couldn’t load your capsule.</h2><p>{error}</p>
        <button className="secondary-button" type="button" onClick={() => setAttempt((value) => value + 1)}><RotateCw size={14} /> Try again</button>
      </section>}

      {!loading && !error && stats && <>
        <aside className="capsule-note"><span className="capsule-note-mark"><Clock3 size={16} /></span><p><strong>A note on the timeline</strong> Per-day and per-song play tracking starts now. The longer lifetime listening total below still includes your legacy history.</p></aside>
        <section className="capsule-chart-panel">
          <div className="capsule-chart-head"><div><span className="eyebrow">DAILY LISTENING</span><h2>Minutes that found their way here</h2><p>{dateLabel(stats.startDay, { month: "short", day: "numeric" })} — {dateLabel(stats.today, { month: "short", day: "numeric", year: "numeric" })} · {stats.timeZone}</p></div><span className="capsule-chart-total">{durationLabel(stats.periodSeconds)}<small>in this period</small></span></div>
          <div className="capsule-chart-scroll">
            <div className="capsule-chart" role="group" aria-label={`Daily listening duration over ${stats.days} days. Tallest day is ${tallestLabel}.`}>
              <div className="capsule-y-axis" aria-hidden="true"><span>{tallestLabel}</span><span>{durationLabel(Math.floor(maximum / 2))}</span><span>0</span></div>
              <div className={`capsule-bars ${stats.days === 30 ? "is-month" : ""}`}>
                {chartDays.map((day, index) => {
                  const height = maximum ? Math.min(100, day.seconds / maximum * 100) : 0;
                  const label = dateLabel(day.day, stats.days === 7 ? { weekday: "short" } : { day: "numeric" });
                  const dayDescription = `${dateLabel(day.day, { weekday: "long", month: "long", day: "numeric" })}: ${durationLabel(day.seconds)} · ${day.plays} ${day.plays === 1 ? "play" : "plays"}`;
                  return <div className={`capsule-day ${day.day === stats.today ? "is-today" : ""}`} key={`${day.day}-${index}`} title={dayDescription} aria-label={dayDescription}>
                    <span className="capsule-bar-track"><i style={{ height: `${height}%` }} /></span>
                    <span className="capsule-day-label">{label}</span>
                    {stats.days === 7 && <span className="capsule-day-value">{day.seconds ? durationLabel(day.seconds) : "—"}</span>}
                  </div>;
                })}
              </div>
            </div>
          </div>
          <div className="capsule-chart-foot"><span><i /> Listening time</span><span>Duration shown in local days</span></div>
        </section>

        <section className="capsule-metrics" aria-label="Listening summary">
          <article className="capsule-metric capsule-metric-major"><span className="eyebrow">LIFETIME · LEGACY INCLUDED</span><strong>{durationLabel(stats.allTimeSeconds)}</strong><small>Total listening time on your account</small></article>
          <article className="capsule-metric"><span className="eyebrow">TODAY</span><strong>{durationLabel(stats.todaySeconds)}</strong><small>Across {stats.daily.find((item) => item.day === stats.today)?.plays ?? 0} plays</small></article>
          <article className="capsule-metric"><span className="eyebrow">ACTIVE DAYS</span><strong>{stats.activeDays}<em> / {stats.days}</em></strong><small>{stats.currentStreak} day current streak</small></article>
          <article className="capsule-metric"><span className="eyebrow">REPEAT LISTENS</span><strong>{stats.repeats}</strong><small>Returning to familiar songs</small></article>
        </section>

        <section className="capsule-bottom">
          <div className="capsule-song-spread">
          <article className="capsule-song-note">
            <div className="capsule-section-label"><span className="eyebrow">THE ONE YOU RETURNED TO</span><span>{stats.mostPlayed ? `${stats.mostPlayed.plays} plays` : "No song tracked yet"}</span></div>
            {stats.mostPlayed ? <div className="capsule-most-played">
              {capsuleArtwork(stats.mostPlayed) ? <img src={capsuleArtwork(stats.mostPlayed)} alt={`${stats.mostPlayed.title} artwork`} /> : <span className="capsule-art-fallback">WT</span>}
              <div><strong>{stats.mostPlayed.title}</strong><span>{stats.mostPlayed.artist}</span><small>{durationLabel(stats.mostPlayed.seconds)} listened · {stats.mostPlayed.repeats} repeats</small></div>
            </div> : <div className="capsule-no-song"><Headphones size={18} /><p>Song-by-song details will appear as new listening is recorded.</p></div>}
          </article>
          <article className="capsule-top-tracks">
            <div className="capsule-section-label"><span className="eyebrow">TOP TRACKS</span><span>ranked by plays</span></div>
            {stats.topTracks.length ? <ol className="capsule-track-ranking">
              {stats.topTracks.map((track, index) => <li className="capsule-rank-row" key={track.id}>
                <span className="capsule-rank-number">{String(index + 1).padStart(2, "0")}</span>
                {track.artwork ? <img className="capsule-rank-art" src={track.artwork} alt="" loading="lazy" /> : <span className="capsule-rank-art capsule-rank-art-fallback" style={{ background: track.accent || undefined }}>WT</span>}
                <span className="capsule-rank-copy"><strong title={track.title}>{track.title}</strong><small title={track.artist}>{track.artist}</small></span>
                <span className="capsule-rank-stats"><strong>{track.plays}</strong><small>{track.plays === 1 ? "play" : "plays"}</small><em>{durationLabel(track.seconds)} · {track.repeats} repeats</em></span>
              </li>)}
            </ol> : <div className="capsule-ranking-empty"><Headphones size={17} /><p>Per-song rankings will take shape as new listening is recorded.</p></div>}
          </article>
          </div>
          <article className="capsule-play-count"><span className="eyebrow">PLAY COUNT</span><strong>{stats.totalPlays}</strong><small>plays across {stats.activeDays} active {stats.activeDays === 1 ? "day" : "days"}</small><div className="capsule-rule" /><p>The details are new; the habit may be much older.</p></article>
        </section>
      </>}
    </>}
  </div>;
}
