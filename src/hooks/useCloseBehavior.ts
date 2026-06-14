import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettingsStore } from "@/store/useSettingsStore";

/**
 * Reacts to the window close button per the user's setting. Calls `onAsk` when
 * no preference is stored yet so the caller can show the first-run prompt.
 */
export function useCloseBehavior(onAsk: () => void): void {
  useEffect(() => {
    const pending = listen("close-requested", () => {
      const behavior = useSettingsStore.getState().settings.closeBehavior;
      if (behavior === "tray") {
        void getCurrentWindow().hide();
      } else if (behavior === "quit") {
        void invoke("quit_app");
      } else {
        onAsk();
      }
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, [onAsk]);
}
