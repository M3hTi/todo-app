import { describe, it, expect } from "vitest";
import { autostartAction } from "./autostart";

describe("autostartAction", () => {
  it("enables only when turning on from a disabled state", () => {
    expect(autostartAction(true, false)).toBe("enable");
  });

  it("disables only when turning off from an enabled state", () => {
    expect(autostartAction(false, true)).toBe("disable");
  });

  it("does nothing when the OS already matches the target", () => {
    // The stuck case: turning off when already off must NOT call disable().
    expect(autostartAction(false, false)).toBe("none");
    expect(autostartAction(true, true)).toBe("none");
  });
});
