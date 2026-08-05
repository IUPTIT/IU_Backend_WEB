import Notification from "../models/notification.model.js";

export async function createNotification({
  userId,
  title,
  body = "",
  type = "general",
  link = null,
}) {
  if (!userId) return null;
  return Notification.create({ userId, title, body, type, link });
}

export function listForUser(userId, { limit = 30 } = {}) {
  return Notification.find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 30, 50));
}

export async function markRead(userId, notificationId) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { readAt: new Date() } },
    { new: true },
  );
}

export async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: new Date() } },
  );
  return { updated: result.modifiedCount };
}

export function countUnread(userId) {
  return Notification.countDocuments({ userId, readAt: null });
}
