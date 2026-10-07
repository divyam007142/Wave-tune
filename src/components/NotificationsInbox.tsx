import { Bell, BellRing, CheckCheck, Music2, Trash2, Waves } from "lucide-react";
import type { InboxNotification } from "../types/notifications";

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function NotificationsInbox({
  notifications,
  onMarkAllRead,
  onClear,
}: {
  notifications: InboxNotification[];
  onMarkAllRead: () => void;
  onClear: () => void;
}) {
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return <div className="page notification-inbox-page">
    <header className="page-heading notification-inbox-heading">
      <span className="eyebrow">WAVE TUNE · YOUR UPDATES</span>
      <h1>Notifications</h1>
      <p>New songs and listening streaks, collected as you listen.</p>
    </header>
    <div className="notification-inbox-toolbar">
      <span>{notifications.length} {notifications.length === 1 ? "update" : "updates"}{unreadCount ? ` · ${unreadCount} unread` : ""}</span>
      <div>
        {unreadCount > 0 && <button type="button" onClick={onMarkAllRead}><CheckCheck size={14} /> Mark all read</button>}
        {notifications.length > 0 && <button type="button" onClick={onClear}><Trash2 size={14} /> Clear inbox</button>}
      </div>
    </div>
    {notifications.length ? <ol className="notification-inbox-list">
      {notifications.map((notification) => <li key={notification.id} className={!notification.read ? "is-unread" : ""}>
        <span className="notification-inbox-type" aria-hidden="true">
          {notification.type === "streak" ? <Waves size={17} /> : notification.artwork
            ? <img src={notification.artwork} alt="" />
            : <Music2 size={17} />}
        </span>
        <span className="notification-inbox-copy">
          <strong>{notification.title}</strong>
          <span>{notification.body}</span>
          <time dateTime={notification.createdAt}>{dateLabel(notification.createdAt)}</time>
        </span>
        {!notification.read && <span className="notification-inbox-unread" aria-label="Unread" />}
      </li>)}
    </ol> : <section className="notification-inbox-empty">
      <span><BellRing size={20} /></span>
      <h2>You’re all caught up</h2>
      <p>When you play music or reach a listening streak, updates will appear here.</p>
      <span className="notification-inbox-hint"><Bell size={13} /> Browser notifications can be managed from the bell in the toolbar.</span>
    </section>}
  </div>;
}
