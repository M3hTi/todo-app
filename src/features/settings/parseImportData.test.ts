import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseImportData } from "./parseImportData";

// parseImportData is schema-agnostic; this representative export-shaped schema
// exercises the success / wrong-shape branches without importing the React
// component (whose store touches `window` and can't load in the node test env).
const schema = z.object({
  version: z.literal(1),
  tasks: z.array(z.object({ id: z.string() })),
});

describe("parseImportData", () => {
  it("returns success with the parsed data for a valid file", () => {
    const raw = JSON.stringify({ version: 1, tasks: [{ id: "a" }] });
    expect(parseImportData(raw, schema)).toEqual({
      ok: true,
      data: { version: 1, tasks: [{ id: "a" }] },
    });
  });

  it("flags malformed JSON as invalid-json", () => {
    expect(parseImportData("{ not valid json", schema)).toEqual({
      ok: false,
      reason: "invalid-json",
    });
  });

  it("flags valid JSON with the wrong shape as wrong-shape", () => {
    const raw = JSON.stringify({ version: 2, tasks: "nope" }); // parses, violates schema
    expect(parseImportData(raw, schema)).toEqual({
      ok: false,
      reason: "wrong-shape",
    });
  });
});
