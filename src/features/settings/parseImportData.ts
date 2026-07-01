import { z } from "zod";

/** Result of parsing a raw import file: success with data, or a typed failure. */
export type ParseImportResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "invalid-json" | "wrong-shape" };

/**
 * Pure: maps raw import-file text to a discriminated result, distinguishing a
 * file that isn't valid JSON from valid JSON that doesn't match the export
 * schema. No fs / toast / React — the testable seam for import-error reporting.
 */
export function parseImportData<S extends z.ZodTypeAny>(
  raw: string,
  schema: S,
): ParseImportResult<z.infer<S>> {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return { ok: false, reason: "wrong-shape" };
  }
  return { ok: true, data: result.data };
}
