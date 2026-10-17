import { describe, expect, it } from "vitest";
import { undoShortcut } from "../src/renderer/editor-canvas.js";

const key = (value: string, modifiers: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

describe("undoShortcut", () => {
  it("reads undo and redo on macOS and other systems", () => {
    expect(undoShortcut(key("z", { metaKey: true }))).toBe("undo");
    expect(undoShortcut(key("Z", { metaKey: true, shiftKey: true }))).toBe("redo");
    expect(undoShortcut(key("z", { ctrlKey: true }))).toBe("undo");
    expect(undoShortcut(key("y", { ctrlKey: true }))).toBe("redo");
  });

  it("ignores other keys and modifiers", () => {
    expect(undoShortcut(key("z"))).toBeUndefined();
    expect(undoShortcut(key("z", { metaKey: true, altKey: true }))).toBeUndefined();
    expect(undoShortcut(key("y", { metaKey: true }))).toBeUndefined();
    expect(undoShortcut(key("c", { metaKey: true }))).toBeUndefined();
  });
});

it("chooses the nearest card in screen pixels and leaves empty canvas alone", async () => {
  const { nearestConnectionTarget } = await import("../src/renderer/editor-canvas.js");
  const a = { id: "a", bounds: { left: 100, top: 100, right: 300, bottom: 300 } };
  const b = { id: "b", bounds: { left: 350, top: 100, right: 500, bottom: 300 } };
  expect(nearestConnectionTarget({ x: 150, y: 150 }, [a, b])).toBe(a);
  expect(nearestConnectionTarget({ x: 320, y: 150 }, [a, b])).toBe(a);
  expect(nearestConnectionTarget({ x: 335, y: 150 }, [a, b])).toBe(b);
  expect(nearestConnectionTarget({ x: 50, y: 150 }, [a, b])).toBeUndefined();
});
