import { useEffect, useState } from "react";
import type { ProjectState } from "../shared/contracts.js";
import { getProject, updateProjectWorkspace } from "./api.js";
import { t } from "./i18n.js";
import { ProjectSettingsDialogFrame } from "./project-settings-dialog.js";
import { workspaceVersion } from "./workspace-version.js";

export function ProjectWorkspaceDialog({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectState;
  onClose: () => void;
  onSaved: (project: ProjectState) => void;
}) {
  const [current, setCurrent] = useState<ProjectState>();
  const [version, setVersion] = useState<string>();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    void getProject(project.id)
      .then((value) => {
        if (disposed) return;
        setCurrent(value);
        setVersion(workspaceVersion(project.id));
      })
      .catch((cause) => {
        if (!disposed) setError(String(cause.message ?? cause));
      });
    return () => {
      disposed = true;
    };
  }, [project.id]);
  async function choose() {
    const select = window.ohMyGameDesktop?.selectProjectDirectory;
    if (!select) {
      setError(t("createDialog.restartForFolders"));
      return;
    }
    setSelecting(true);
    setError("");
    try {
      const folder = await select();
      if (folder) setSelected(folder);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSelecting(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!current || version === undefined || busy || selecting || !selected)
      return;
    setBusy(true);
    setError("");
    try {
      onSaved(await updateProjectWorkspace(project.id, selected, version));
    } catch (cause) {
      setError(
        (cause as { code?: string }).code === "workspace_busy"
          ? t("projectWorkspace.busy")
          : (cause as { code?: string }).code === "workspace_stale"
            ? t("projectWorkspace.stale")
            : cause instanceof Error
              ? cause.message
              : String(cause),
      );
      setBusy(false);
    }
  }
  return (
    <ProjectSettingsDialogFrame
      title={t("projectWorkspace.title")}
      busy={busy || selecting}
      onClose={onClose}
    >
      <form
        className="project-workspace-form"
        onSubmit={(event) => void save(event)}
      >
        <p>{t("projectWorkspace.description", { name: project.name })}</p>
        <label>
          {t("projectWorkspace.current")}
          <input
            readOnly
            value={current?.workspacePath ?? project.workspacePath}
          />
        </label>
        <label>
          {t("projectWorkspace.selected")}
          <input
            readOnly
            value={selected}
            placeholder={t("projectWorkspace.placeholder")}
          />
        </label>
        <button
          className="project-settings-browser"
          type="button"
          disabled={!current || busy || selecting}
          onClick={() => void choose()}
        >
          {selecting ? t("createDialog.opening") : t("creator.chooseFolder")}
        </button>
        <p className="settings-detail-hint">
          {t("projectWorkspace.filesHint")}
        </p>
        <p className="settings-detail-hint">
          {t("projectWorkspace.historyHint")}
        </p>
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy || selecting} onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="project-settings-submit"
            type="submit"
            disabled={
              !current ||
              !selected ||
              selected === current.workspacePath ||
              busy ||
              selecting
            }
          >
            {busy ? t("common.saving") : t("projectWorkspace.apply")}
          </button>
        </footer>
      </form>
    </ProjectSettingsDialogFrame>
  );
}
