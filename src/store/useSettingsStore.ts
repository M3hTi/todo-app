import { create } from "zustand";
import type { AppSettings, Theme } from "@/types";
import { getSettings, setSetting } from "@/lib/queries/settings";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface SettingsStoreState {
  settings: AppSettings;
  loaded: boolean;

  loadSettings: () => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: "System",
  defaultPriority: "Medium",
  defaultReminderMinutesBefore: 15,
  notificationsEnabled: true,
  closeBehavior: "ask",
  launchOnStartup: false,
};

const systemDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(theme: Theme): void {
  const dark = theme === "Dark" || (theme === "System" && systemDarkQuery.matches);
  document.documentElement.classList.toggle("dark", dark);
  // Native Windows title bar follows the OS, not our CSS - tell it explicitly.
  try {
    void getCurrentWindow().setTheme(dark ? "dark" : "light");
  } catch {
    // not running under Tauri (tests / browser dev)
  }
}

// Re-apply when the OS preference flips while theme is "System".
systemDarkQuery.addEventListener("change", () => {
  applyTheme(useSettingsStore.getState().settings.theme);
});

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  loadSettings: async () => {
    const settings = await getSettings();
    set({ settings, loaded: true });
    applyTheme(settings.theme);
  },

  updateSetting: async (key, value) => {
    await setSetting(key, value);
    const settings = { ...get().settings, [key]: value };
    set({ settings });
    if (key === "theme") {
      applyTheme(settings.theme);
    }
  },
}));
