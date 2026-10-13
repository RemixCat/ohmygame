import { describe, expect, it } from "vitest";
import { canvasBoundsVisible, undoShortcut } from "../src/renderer/editor-canvas.js";

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

describe("canvasBoundsVisible", () => {
  const node = { x: 100, y: 100, width: 300, height: 200 };

  it("recognizes content in a translated and zoomed viewport", () => {
    expect(canvasBoundsVisible(node, { x: -50, y: -50, zoom: 0.5 }, 800, 600)).toBe(true);
  });

  it("recognizes content beyond every edge of the viewport", () => {
    expect(canvasBoundsVisible(node, { x: -1_000, y: 0, zoom: 1 }, 800, 600)).toBe(false);
    expect(canvasBoundsVisible(node, { x: 1_000, y: 0, zoom: 1 }, 800, 600)).toBe(false);
    expect(canvasBoundsVisible(node, { x: 0, y: -1_000, zoom: 1 }, 800, 600)).toBe(false);
    expect(canvasBoundsVisible(node, { x: 0, y: 1_000, zoom: 1 }, 800, 600)).toBe(false);
  });

  it("keeps a partially visible node recoverable without a false warning", () => {
    expect(canvasBoundsVisible(node, { x: -399, y: -150, zoom: 1 }, 800, 600)).toBe(true);
  });
});
