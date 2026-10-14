import { useState } from "react";
import { t } from "./i18n.js";

export interface StudioNameRequest {
  label: string;
  initial?: string;
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
  return (
    <div
      className="studio-modal nokey"
      role="dialog"
      aria-modal="true"
      aria-label={request.label}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <form
        className="studio-comparison"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) {
            request.action(name.trim());
            onClose();
          }
        }}
      >
        <h3>{request.label}</h3>
        <input
          autoFocus
          aria-label={t("productionStudio.name")}
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={!name.trim()}>
          {t("common.save")}
        </button>
        <button type="button" onClick={onClose}>
          {t("common.cancel")}
        </button>
      </form>
    </div>
  );
}
