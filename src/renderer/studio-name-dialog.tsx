import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ProjectSettingsDialogFrame } from "./project-settings-dialog.js";
import { t } from "./i18n.js";

export interface StudioNameRequest {
  label: string;
  initial?: string;
  validate?(name: string): string | undefined;
  action(name: string): void;
}
export function StudioNameDialog({
  request,
  onClose,
}: {
  request: StudioNameRequest;
  onClose(): void;
}) {
  const [name, setName] = useState(request.initial ?? "");
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  return createPortal(
    <ProjectSettingsDialogFrame
      title={request.label}
      initialFocusRef={input}
      onClose={onClose}
    >
      <form
        className="studio-name-form"
        onSubmit={(e) => {
          e.preventDefault();
          const value = name.trim();
          if (!value || submitted.current) return;
          const invalid = request.validate?.(value);
          if (invalid) {
            setError(invalid);
            return;
          }
          submitted.current = true;
          try {
            request.action(value);
            onClose();
          } catch (cause) {
            submitted.current = false;
            setError(cause instanceof Error ? cause.message : String(cause));
          }
        }}
      >
        <label>
          {t("productionStudio.name")}
          <input
            ref={input}
            maxLength={200}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />
        </label>
        {error && (
          <p className="project-settings-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="project-settings-submit"
            type="submit"
            disabled={!name.trim()}
          >
            {t("common.save")}
          </button>
        </footer>
      </form>
    </ProjectSettingsDialogFrame>,
    document.body,
  );
}

export function StudioConfirmDialog({
  title,
  message,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  onConfirm(): void;
  onClose(): void;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const submitted = useRef(false);
  return createPortal(
    <ProjectSettingsDialogFrame
      title={title}
      initialFocusRef={cancel}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (submitted.current) return;
          submitted.current = true;
          onConfirm();
          onClose();
        }}
      >
        <p className="studio-confirm-copy">{message}</p>
        <footer>
          <button ref={cancel} type="button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="studio-confirm-delete" type="submit">
            {t("common.delete")}
          </button>
        </footer>
      </form>
    </ProjectSettingsDialogFrame>,
    document.body,
  );
}
