import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  checkMissedReminders,
  ensureNotificationPermission,
  startReminderLoop,
} from "@/lib/reminders";

/**
 * Startup reminder wiring: requests permission, surfaces missed reminders as
 * one grouped toast, then runs the minute-interval reminder loop until unmount.
 */
export function useReminders(): void {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      await ensureNotificationPermission();
      const missed = await checkMissedReminders();
      if (missed > 0) {
        toast(`You have ${missed} missed reminder${missed === 1 ? "" : "s"}`);
      }
      if (!disposed) {
        cleanupRef.current = startReminderLoop();
      }
    })();

    return () => {
      disposed = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);
}
