// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import {
  readStudioDraft,
  writeStudioDraft,
  clearStudioDraft,
} from "../src/renderer/studio-drafts.js";
afterEach(() => localStorage.clear());
it("restores per-project drafts and preserves their original disk revision", () => {
  writeStudioDraft("production:first", {
    value: { draft: "Fox" },
    revision: "before-external-edit",
  });
  writeStudioDraft("production:second", {
    value: { draft: "Owl" },
    revision: "other",
  });
  expect(readStudioDraft("production:first")).toEqual({
    value: { draft: "Fox" },
    revision: "before-external-edit",
  });
  clearStudioDraft("production:first");
  expect(readStudioDraft("production:first")).toBeUndefined();
  expect(readStudioDraft("production:second")).toBeDefined();
});
