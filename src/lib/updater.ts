import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

/**
 * Checks the GitHub release feed for a newer version and offers a one-click
 * install. Called once per launch; failures are silent by design — the app is
 * offline-first and an unreachable endpoint is not a user-facing problem.
 */
export async function checkForUpdate(): Promise<void> {
  try {
    const update = await check();
    if (!update) return;
    toast(`Version ${update.version} is available`, {
      description: "Download and install it without leaving the app.",
      duration: Infinity,
      action: { label: "Install & restart", onClick: () => void install(update) },
    });
  } catch {
    // ponytail: offline, no endpoint, or running under `npm run dev` — next launch retries.
  }
}

async function install(update: Update): Promise<void> {
  const id = toast.loading("Downloading update…");
  try {
    await update.downloadAndInstall();
    toast.success("Update installed — restarting.", { id });
    await relaunch();
  } catch {
    toast.error("Update failed. Install the latest release from GitHub instead.", { id });
  }
}
