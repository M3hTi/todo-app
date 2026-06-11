import type { AppSettings } from "@/types";
import { getDb, withDb } from "@/lib/db";

const DEFAULTS: AppSettings = {
  theme: "System",
  defaultPriority: "Medium",
  defaultReminderMinutesBefore: 15,
  notificationsEnabled: true,
};

interface SettingRow {
  key: string;
  value: string;
}

/** Reads all settings rows (JSON-encoded values) and merges them over defaults. */
export async function getSettings(): Promise<AppSettings> {
  return withDb("getSettings", async () => {
    const rows = await getDb().select<SettingRow[]>("SELECT key, value FROM settings");
    const stored: Partial<Record<keyof AppSettings, unknown>> = {};
    for (const row of rows) {
      try {
        const value: unknown = JSON.parse(row.value);
        // null marks a cleared optional setting — fall back to the default.
        if (value !== null) {
          stored[row.key as keyof AppSettings] = value;
        }
      } catch {
        // Ignore unparsable rows; the default for that key applies.
      }
    }
    return { ...DEFAULTS, ...stored } as AppSettings;
  });
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  return withDb("setSetting", async () => {
    await getDb().execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, JSON.stringify(value ?? null)],
    );
  });
}
