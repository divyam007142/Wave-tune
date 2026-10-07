export type InboxNotification = {
  id: string;
  type: "track" | "streak";
  title: string;
  body: string;
  createdAt: string;
  artwork?: string;
  read: boolean;
};
