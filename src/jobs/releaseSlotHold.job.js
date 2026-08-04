import agenda from "../config/agenda.js";

export const JOB_RELEASE_SLOT_HOLD = "releaseSlotHold";

export function defineReleaseSlotHoldJob() {
  agenda.define(JOB_RELEASE_SLOT_HOLD, { concurrency: 1 }, async (_job) => {
    console.log(
      `[job:${JOB_RELEASE_SLOT_HOLD}] Cleaning expired slot holds...`,
    );

    try {
      // TODO: Implement expired slot hold release logic (fallback alongside TTL index)
      // Delete SlotHold documents where expiresAt < now
    } catch (err) {
      console.error(
        `[job:${JOB_RELEASE_SLOT_HOLD}] Error releasing slot holds:`,
        err.message,
      );
      throw err;
    }
  });
}
