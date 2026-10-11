import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { signalProcessTree } from "../dist/daemon/process-lifecycle.js";

const executable = path.resolve(process.argv[2] ?? "");
assert(process.argv[2], "Pass the packaged desktop executable");
const directory = await mkdtemp(path.join(tmpdir(), "ohmygame-package-smoke-"));
const server = createServer();
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const environment = Object.fromEntries(
  ["PATH", "HOME", "USERPROFILE", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "APPDATA", "LOCALAPPDATA"]
    .filter(key => process.env[key] !== undefined)
    .map(key => [key, process.env[key]]),
);
const child = spawn(executable, ["--inspect=127.0.0.1:" + port, "--user-data-dir=" + path.join(directory, "user")], {
  env: { ...environment, OHMYGAME_DATA_DIR: path.join(directory, "data"), PI_CODING_AGENT_DIR: path.join(directory, "pi-agent") },
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output = (output + chunk).slice(-16000); });
let spawnError;
child.on("error", error => { spawnError = error; });
const exited = new Promise(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
let socket;
let failure;
try {
  const target = await waitFor(async () => {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error("Desktop exited during startup: " + child.exitCode);
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/list", { signal: AbortSignal.timeout(500) });
      return (await response.json())[0];
    } catch { return undefined; }
  }, 15000);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const pending = new Map();
  let sequence = 0;
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  async function evaluate(expression) {
    const id = ++sequence;
    const response = await Promise.race([
      new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression, awaitPromise: true, returnByValue: true } }));
      }),
      timeout(90000, "Packaged UI smoke test timed out"),
    ]);
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  }
  const result = await evaluate("(" + exerciseDesktop.toString() + ")(" + JSON.stringify(process.argv.includes("--canvas") ? "canvas" : "playable") + ")");
  // Releasing the inspector before quit avoids Node's debugger-disconnect wait.
  await evaluate("setTimeout(() => globalThis.__packageSmokeApp.quit(), 100); true");
  socket.close();
  const stopped = await Promise.race([exited, timeout(45000, "Packaged desktop did not quit")]);
  assert.equal(stopped.code, 0, "Packaged desktop must exit successfully");
  assert(output.includes("[package-smoke] renderer-save-acknowledged"), "Quit must wait for renderer save acknowledgement");
  assert(!output.includes("[package-smoke] renderer-save-error"), "Renderer must not reject saving");
  let daemonStopped = false;
  try { await fetch(result.daemonUrl + "/health", { signal: AbortSignal.timeout(1000) }); } catch { daemonStopped = true; }
  assert(daemonStopped, "Daemon must stop before desktop exit");
  const layout = JSON.parse(await readFile(path.join(result.workspace, ...(result.boardId ? ["canvas", "editor", result.boardId + ".json"] : ["editor", "layout.json"])), "utf8"));
  assert(Math.abs(layout.viewport.zoom - result.zoom) < 0.001, "Pending canvas viewport must be saved before quit: " + JSON.stringify({ expected: result.zoom, saved: layout.viewport.zoom }));
  if (result.boardId) {
    const board = JSON.parse(await readFile(path.join(result.workspace, "canvas", "boards", result.boardId + ".json"), "utf8"));
    assert.equal(board.nodes[0].data.text, "Saved immediately before close");
  }
  console.log(JSON.stringify({ platform: process.platform, packaged: result.packaged, mode: result.boardId ? "canvas" : "playable", savedZoom: layout.viewport.zoom, gracefulExit: true }));
} catch (error) {
  failure = error;
  console.error(output);
} finally {
  socket?.close();
  if (child.pid && child.exitCode === null && child.signalCode === null) {
    await signalProcessTree(child.pid, true);
    await Promise.race([exited, timeout(5000, "Could not stop package smoke test")]);
  }
  if (!failure) await rm(directory, { recursive: true, force: true });
  else console.error("Smoke workspace retained:", directory);
}
if (failure) throw failure;

function timeout(milliseconds, message) {
  return new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error(message)), milliseconds); timer.unref(); });
}
async function waitFor(check, milliseconds) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Packaged desktop inspector did not start");
}

// Runs in the packaged Electron main process, through its local Node inspector.
async function exerciseDesktop(mode) {
  const require = process.getBuiltinModule("module").createRequire(process.resourcesPath + "/app.asar/package.json");
  const { app, BrowserWindow, ipcMain } = require("electron");
  const assert = require("node:assert/strict");
  const fs = require("node:fs/promises");
  const path = require("node:path");
  const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  async function until(check, message) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) { if (await check()) return; await pause(100); }
    throw new Error(message);
  }
  assert(app.isPackaged, "Smoke test must exercise a packaged application");
  await until(() => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("index.html")), "Main window did not load");
  const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes("index.html"));
  const renderer = expression => window.webContents.executeJavaScript(expression);
  await until(() => renderer('Boolean(document.querySelector(".desktop-close-content"))'), "Renderer did not mount");
  const runtime = await renderer("window.ohMyGameDesktop.runtime");
  async function request(route, method = "GET", body) {
    const response = await fetch(runtime.daemonUrl + route, {
      method, headers: { authorization: "Bearer " + runtime.token, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
    });
    assert(response.ok, method + " " + route + " failed: " + response.status);
    return response.json();
  }
  ipcMain.on("ohmygame:ready-to-close", (_event, _id, error) => {
    console.log(error ? "[package-smoke] renderer-save-error" : "[package-smoke] renderer-save-acknowledged");
  });
  globalThis.__packageSmokeApp = app;
  if (mode === "canvas") {
    const project = await request("/projects", "POST", { name: "Canvas packaged close check", type: "asset-canvas" });
    const workspace = await request("/projects/" + project.id + "/canvas/workspace");
    const boardId = workspace.boards[0].id;
    const detail = await request("/projects/" + project.id + "/canvas/boards/" + boardId);
    detail.board.nodes = [{ id: "smoke-text", type: "text", position: { x: 96, y: 96 }, data: { text: "Before close", instruction: "" } }];
    detail.board.editorLayout.nodes = { "smoke-text": { x: 96, y: 96 } };
    await request("/projects/" + project.id + "/canvas/boards/" + boardId, "PUT", detail);
    await renderer("window.location.hash = " + JSON.stringify("#/projects/" + project.id));
    await until(() => renderer(`Boolean(document.querySelector('textarea[aria-label="Text output"]'))`), "Canvas text did not mount");
    await pause(500);
    await renderer(`document.querySelector('.react-flow__node[data-id="smoke-text"]').click()`);
    await until(() => renderer(`!document.querySelector('textarea[aria-label="Text output"]').readOnly`), "Text node was not selected");
    await renderer(`(() => {
      const text = document.querySelector('textarea[aria-label="Text output"]');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(text, "Saved immediately before close");
      text.dispatchEvent(new Event("input", { bubbles: true }));
      document.querySelector('.story-canvas-zoom button[aria-label="Zoom in"]').click();
    })()`);
    const zoom = await renderer('new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".react-flow__viewport")).transform).a');
    return { packaged: app.isPackaged, workspace: project.workspacePath, zoom, daemonUrl: runtime.daemonUrl, boardId };
  }
  const project = await request("/projects", "POST", { name: "Packaged desktop check", type: "interactive-story" });
  for (const [id, preset] of [["menu", "main-menu"], ["hotspot", "hotspot"], ["blank", "blank"]]) {
    await request("/projects/" + project.id + "/playable/nodes", "POST", { id, preset });
  }
  // Opening a legacy project must restore missing styles without a developer checkout.
  await fs.rm(path.join(project.workspacePath, "shared"), { recursive: true });
  await fs.rm(path.join(project.workspacePath, "schemas", "project-style.version.json"));
  await request("/projects/" + project.id + "/playable/codebase");
  await fs.access(path.join(project.workspacePath, "shared", "style", "components.js"));
  const projectLiteral = JSON.stringify(project.id);
  const cancelled = await renderer('(async () => { const bridge = window.ohMyGameDesktop; const pending = ["menu", "hotspot", "blank"].map(id => bridge.captureNodeThumbnail(' + projectLiteral + ', id, { width: 1280, height: 720 }, "smoke-cancel")); await bridge.cancelNodeThumbnails("smoke-cancel"); return Promise.all(pending); })()');
  assert.deepEqual(cancelled, [false, false, false]);
  const captured = await renderer('Promise.all(["menu", "hotspot"].map(id => window.ohMyGameDesktop.captureNodeThumbnail(' + projectLiteral + ', id, { width: 1280, height: 720 }, "smoke-capture")))');
  assert.deepEqual(captured, [true, true]);
  const { thumbnails } = await request("/projects/" + project.id + "/playable/thumbnails");
  assert(thumbnails.menu?.hash && thumbnails.hotspot?.hash);
  for (const id of ["menu", "hotspot"]) {
    const routeLiteral = JSON.stringify("/projects/" + project.id + "/playable/thumbnails/" + id);
    const image = await renderer('(async () => { const runtime = window.ohMyGameDesktop.runtime; const response = await fetch(runtime.daemonUrl + ' + routeLiteral + ', { headers: { authorization: "Bearer " + runtime.token } }); const blob = await response.blob(); const image = await createImageBitmap(blob); const result = { width: image.width, height: image.height, size: blob.size }; image.close(); return result; })()');
    // Windows can constrain hidden windows to its screen; capture preserves aspect and caps width.
    assert(image.width >= 240 && image.width <= 1280, "Thumbnail width: " + image.width);
    assert(Math.abs(image.width / image.height - 1280 / 720) < 0.01, "Thumbnail aspect: " + JSON.stringify(image));
    assert(image.size > 1000);
  }
  await renderer("window.location.hash = " + JSON.stringify("#/projects/" + project.id));
  await until(() => renderer('Boolean(document.querySelector(".playable-editor-workspace .story-canvas-zoom-value"))'), "Playable canvas did not mount");
  const before = await renderer('document.querySelector(".story-canvas-zoom-value").textContent');
  await renderer('document.querySelector(\'.story-canvas-zoom button[aria-label="Zoom in"]\').click()');
  await until(async () => (await renderer('document.querySelector(".story-canvas-zoom-value").textContent')) !== before, "Canvas zoom did not change");
  const zoom = await renderer('new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".react-flow__viewport")).transform).a');
  return { packaged: app.isPackaged, workspace: project.workspacePath, zoom, daemonUrl: runtime.daemonUrl };
}
