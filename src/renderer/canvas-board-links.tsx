import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TopicNode } from "../shared/canvas-diagram.js";
import { ProjectSettingsDialogFrame } from "./project-settings-dialog.js";
import { t } from "./i18n.js";

type BoardEntry = { id: string; name: string };
export interface CanvasTopicBoards {
  boards: BoardEntry[];
  busy: boolean;
  open(id: string): Promise<void>;
  create(name: string): Promise<string>;
}

/** Save before every transition; retain an in-session trail rather than a parent hierarchy. */
export function useCanvasBoardNavigation(options: {
  activeId?: string;
  flush(): Promise<void>;
  loadBoards(): Promise<BoardEntry[]>;
  activate(id: string): void;
}) {
  const current = useRef(options);
  current.current = options;
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [trail, setTrail] = useState<string[]>([]);
  const history = useRef(trail);
  function update(next: string[]) {
    history.current = next;
    setTrail(next);
  }
  async function navigate(id?: string, linked = true) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await current.current.flush();
      const boards = await current.current.loadBoards();
      const exists = (id: string) => boards.some((b) => b.id === id);
      const source = current.current.activeId;
      const valid = history.current.filter(exists);
      while (valid.at(-1) === source && valid.length) valid.pop();
      const target = id ?? valid.at(-1);
      if (!target || !exists(target)) {
        if (!id) update([]);
        throw new Error(t("canvasBoardLinks.missing"));
      }
      if (target === source) return;
      current.current.activate(target);
      update(
        id
          ? linked && source
            ? [...history.current, source].slice(-50)
            : []
          : valid.slice(0, -1),
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    trail,
    open: navigate,
    back: () => navigate(),
    clear: () => update([]),
  };
}

export function CanvasTopicBoardDialog({
  topic,
  projectId,
  currentBoardId,
  boards,
  disabled = false,
  onChange,
  onClose,
}: {
  topic: TopicNode;
  projectId: string;
  currentBoardId: string;
  boards: CanvasTopicBoards;
  disabled?: boolean;
  onChange(link: TopicNode["data"]["boardLink"]): void;
  onClose(): void;
}) {
  const [selected, setSelected] = useState(
    topic.data.boardLink?.projectId === projectId
      ? topic.data.boardLink.boardId
      : "",
  );
  const [name, setName] = useState(topic.data.text.trim().slice(0, 120));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  // Retain the created ID across a failed refresh/save; retry must not create another board.
  const created = useRef<string | undefined>(undefined);
  const busy = boards.busy || creating || disabled;
  const choices = boards.boards.filter((b) => b.id !== currentBoardId);
  return createPortal(
    <ProjectSettingsDialogFrame
      title={t("canvasBoardLinks.title")}
      busy={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="canvas-diagram-dialog canvas-board-link-dialog nokey">
        <p>{t("canvasBoardLinks.help")}</p>
        {topic.data.boardLink && (
          <p>
            {topic.data.boardLink.projectId !== projectId
              ? t("canvasBoardLinks.foreign")
              : (boards.boards.find(
                  (b) => b.id === topic.data.boardLink?.boardId,
                )?.name ?? t("canvasBoardLinks.missing"))}
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || !choices.some((b) => b.id === selected)) return;
            onChange({ projectId, boardId: selected });
            onClose();
          }}
        >
          <label>
            {t("canvasBoardLinks.existing")}
            <select
              aria-label={t("canvasBoardLinks.existing")}
              value={choices.some((b) => b.id === selected) ? selected : ""}
              disabled={busy}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">{t("canvasBoardLinks.choose")}</option>
              {choices.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !choices.some((b) => b.id === selected)}
          >
            {t("canvasBoardLinks.link")}
          </button>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || inFlight.current || !name.trim()) return;
            inFlight.current = true;
            setCreating(true);
            setError("");
            void (async () => {
              try {
                created.current ??= await boards.create(name.trim());
                onChange({ projectId, boardId: created.current });
                onClose();
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : String(cause),
                );
              } finally {
                inFlight.current = false;
                setCreating(false);
              }
            })();
          }}
        >
          <label>
            {t("canvasBoardLinks.newName")}
            <input
              aria-label={t("canvasBoardLinks.newName")}
              maxLength={120}
              required
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !name.trim()}>
            {creating ? t("common.saving") : t("canvasBoardLinks.create")}
          </button>
        </form>
        {error && (
          <p role="alert" className="project-settings-error">
            {error}
          </p>
        )}
        <footer>
          {topic.data.boardLink && (
            <button
              disabled={busy}
              onClick={() => {
                onChange(undefined);
                onClose();
              }}
            >
              {t("canvasBoardLinks.unlink")}
            </button>
          )}
          <button disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </button>
        </footer>
      </div>
    </ProjectSettingsDialogFrame>,
    document.body,
  );
}
