import Notification, {
  NOTIFICATION_TYPES,
} from "../models/notification.model.js";

export async function createNotification({
  userId,
  title,
  body = "",
  type = "general",
  link = null,
}) {
  if (!userId) return null;
  // Type lạ vẫn phải gửi được thông báo, không để rơi im lặng vì lỗi enum
  let safeType = type;
  if (!NOTIFICATION_TYPES.includes(safeType)) {
    console.warn(`[notification] unknown type "${type}", fallback to general`);
    safeType = "general";
  }
  return Notification.create({ userId, title, body, type: safeType, link });
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
