import agenda from "../config/agenda.js";
import SlotHold from "../models/slotHold.model.js";

export const JOB_RELEASE_SLOT_HOLD = "releaseSlotHold";

export function defineReleaseSlotHoldJob() {
  agenda.define(JOB_RELEASE_SLOT_HOLD, { concurrency: 1 }, async (_job) => {
    try {
      // Fallback TTL: xoá hold đã hết hạn (index TTL có thể trễ ~60s)
      const result = await SlotHold.deleteMany({
        expiresAt: { $lt: new Date() },
      });
      if (result.deletedCount > 0) {
        console.log(
          `[job:${JOB_RELEASE_SLOT_HOLD}] Released ${result.deletedCount} expired holds`,
        );
      }
    } catch (err) {
      console.error(
        `[job:${JOB_RELEASE_SLOT_HOLD}] Error releasing slot holds:`,
        err.message,
      );
      throw err;
    }
  });
}
