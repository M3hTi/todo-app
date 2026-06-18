export type AutostartAction = "enable" | "disable" | "none";

/** Pure: decides what a launch-on-startup toggle should do, given the actual
 *  OS state. Returns "none" when already in the target state — the autostart
 *  plugin's disable() throws when the registry entry is absent, which would
 *  otherwise wedge the toggle in a stuck, un-syncable state. */
export function autostartAction(target: boolean, current: boolean): AutostartAction {
  if (target === current) return "none";
  return target ? "enable" : "disable";
}
