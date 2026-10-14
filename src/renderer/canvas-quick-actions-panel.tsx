import type {
  AgentModel,
  AgentModelRef,
  AssetCanvasNode,
  CanvasQuickAction,
  ImageModel,
  ImageModelRef,
  ToolJob,
} from "../shared/contracts.js";
import { t } from "./i18n.js";
import { quickImageSettings } from "../shared/canvas-quick-actions.js";
import { settingsHash } from "./routes.js";
import { X } from "./icons.js";
import "./canvas-quick-actions.css";

export interface QuickActionMember {
  id: string;
  title?: string;
  data: { prompt?: string; assetId?: string };
}
export function CanvasQuickActionsPanel({
  node,
  members,
  textModels,
  defaultTextModel,
  imageModels,
  defaultImageModel,
  jobs,
  pending,
  busy,
  recognizing,
  error,
  sourceAvailable,
  onChange,
  onRecognize,
  onRun,
  onCancel,
  onRetry,
  onPrompt,
  onClose,
}: {
  node: AssetCanvasNode & { quickAction: CanvasQuickAction };
  members: QuickActionMember[];
  textModels: AgentModel[];
  defaultTextModel?: AgentModelRef;
  imageModels: ImageModel[];
  defaultImageModel?: ImageModelRef;
  jobs: Record<string, ToolJob>;
  pending: ReadonlySet<string>;
  busy: boolean;
  recognizing: boolean;
  error?: string;
  sourceAvailable: boolean;
  onChange: (
    value: CanvasQuickAction,
    text?: string,
    model?: AgentModelRef,
  ) => void;
  onRecognize: (model: AgentModelRef) => void;
  onRun: (retryOnly: boolean) => void;
  onCancel: () => void;
  onRetry: (id: string) => void;
  onPrompt: (id: string, prompt: string) => void;
  onClose: () => void;
}) {
  const action = node.quickAction;
  const objects = action.objects ?? [];
  const settings = quickImageSettings(action, imageModels, defaultImageModel);
  const model = settings.model;
  const textModel =
    node.type === "text"
      ? (node.data.model ?? defaultTextModel)
      : defaultTextModel;
  const missingModel = !settings.reference
    ? t("canvasQuick.missingImageModel")
    : !model?.supportsReferenceImage
      ? t("canvasQuick.unsupportedImageModel")
      : undefined;
  const hasFailures = members.some(
    (member) =>
      jobs[member.id]?.status === "failed" ||
      jobs[member.id]?.status === "cancelled",
  );
  const status = (member: QuickActionMember) =>
    pending.has(member.id)
      ? "queued"
      : (jobs[member.id]?.status ??
        (member.data.assetId ? "succeeded" : "ready"));
  const updateObject = (id: string, patch: Partial<(typeof objects)[number]>) =>
    onChange({
      ...action,
      objects: objects.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  return (
    <aside
      className="canvas-quick-panel nowheel nodrag nokey"
      aria-label={t("canvasQuick.title")}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header>
        <strong>{node.title ?? t(`canvasQuick.${action.kind}`)}</strong>
        <button type="button" aria-label={t("common.close")} onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <p>
        {t(
          action.kind === "objects"
            ? "canvasQuick.objectHint"
            : "canvasQuick.viewHint",
        )}
      </p>
      {!sourceAvailable ? (
        <p role="alert" className="canvas-quick-error">
          {t("canvasQuick.missingSource")}
        </p>
      ) : null}
      {action.kind === "objects" ? (
        <>
          <label>
            {t("canvasQuick.languageModel")}
            <select
              disabled={recognizing || busy}
              value={JSON.stringify(textModel ?? null)}
              onChange={(event) =>
                onChange(
                  action,
                  undefined,
                  JSON.parse(event.target.value) as AgentModelRef,
                )
              }
            >
              <option value="null" disabled>
                {t("canvasQuick.missingTextModel")}
              </option>
              {textModels.map((model) => (
                <option
                  key={`${model.provider}:${model.id}`}
                  value={JSON.stringify({
                    provider: model.provider,
                    id: model.id,
                  })}
                >
                  {model.providerName} · {model.name}
                </option>
              ))}
            </select>
          </label>
          {!textModel ? (
            <p role="alert">{t("canvasQuick.missingTextModel")}</p>
          ) : null}
          <button
            type="button"
            disabled={busy || recognizing || !textModel || !sourceAvailable}
            onClick={() => {
              if (textModel) onRecognize(textModel);
            }}
          >
            {t(
              recognizing ? "canvasQuick.recognizing" : "canvasQuick.recognize",
            )}
          </button>
          {!objects.length ? (
            <p>
              {t(
                node.type === "text" && node.data.text
                  ? "canvasQuick.noObjects"
                  : "canvasQuick.empty",
              )}
            </p>
          ) : null}
          <div className="canvas-quick-objects">
            {objects.map((item) => (
              <fieldset key={item.id} disabled={busy || recognizing}>
                <div className="canvas-quick-object-heading">
                  <input
                    type="checkbox"
                    aria-label={t("canvasQuick.select", { name: item.name })}
                    checked={item.selected}
                    onChange={(event) =>
                      updateObject(item.id, { selected: event.target.checked })
                    }
                  />
                  <input
                    maxLength={200}
                    aria-label={t("common.name")}
                    value={item.name}
                    onChange={(event) =>
                      updateObject(item.id, { name: event.target.value })
                    }
                  />
                  <button
                    type="button"
                    aria-label={t("canvasQuick.remove")}
                    onClick={() =>
                      onChange({
                        ...action,
                        objects: objects.filter(
                          (candidate) => candidate.id !== item.id,
                        ),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
                <label>
                  {t("canvasQuick.description")}
                  <textarea
                    maxLength={2000}
                    value={item.description}
                    onChange={(event) =>
                      updateObject(item.id, { description: event.target.value })
                    }
                  />
                </label>
                <label>
                  {t("canvasQuick.prompt")}
                  <textarea
                    maxLength={4000}
                    value={item.prompt}
                    onChange={(event) =>
                      updateObject(item.id, { prompt: event.target.value })
                    }
                  />
                </label>
              </fieldset>
            ))}
          </div>
        </>
      ) : (
        <label>
          {t("canvasQuick.shared")}
          <textarea
            disabled={busy}
            value={node.type === "text" ? node.data.text : ""}
            onChange={(event) => onChange(action, event.target.value)}
          />
        </label>
      )}
      <fieldset disabled={busy || recognizing}>
        <legend>{t("canvasQuick.sharedSettings")}</legend>
        <label>
          {t("canvasQuick.imageModel")}
          <select
            value={JSON.stringify(action.imageModel ?? null)}
            onChange={(event) => {
              const ref = JSON.parse(
                event.target.value,
              ) as AgentModelRef | null;
              if (!ref) {
                const { imageModel: _override, ...rest } = action;
                onChange(rest);
                return;
              }
              const selected = imageModels.find(
                (candidate) =>
                  candidate.provider === ref.provider &&
                  candidate.id === ref.id,
              );
              const option = selected?.generationOptions[0];
              onChange({
                ...action,
                imageModel: ref,
                ...(option ? option : {}),
              });
            }}
          >
            <option value="null">
              {t("canvasQuick.useDefault", {
                name:
                  imageModels.find(
                    (candidate) =>
                      candidate.provider === defaultImageModel?.provider &&
                      candidate.id === defaultImageModel.id,
                  )?.name ??
                  defaultImageModel?.id ??
                  t("canvasQuick.notConfigured"),
              })}
            </option>
            {imageModels.map((model) => (
              <option
                key={`${model.provider}:${model.id}`}
                value={JSON.stringify({
                  provider: model.provider,
                  id: model.id,
                })}
              >
                {model.providerName} · {model.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("canvasQuick.dimensions")}
          <select
            disabled={!model?.generationOptions.length}
            value={`${settings.resolution}/${settings.aspectRatio}`}
            onChange={(event) => {
              const option = model?.generationOptions.find(
                (option) =>
                  `${option.resolution}/${option.aspectRatio}` ===
                  event.target.value,
              );
              if (option) onChange({ ...action, ...option });
            }}
          >
            {model?.generationOptions.map((option) => (
              <option
                key={`${option.resolution}/${option.aspectRatio}`}
                value={`${option.resolution}/${option.aspectRatio}`}
              >
                {option.resolution} · {option.aspectRatio}
              </option>
            ))}
          </select>
        </label>
        {action.kind === "objects" ? (
          <label>
            {t("canvasQuick.background")}
            <select
              value={action.background ?? "plain"}
              onChange={(event) =>
                onChange({
                  ...action,
                  background: event.target.value as "plain" | "transparent",
                })
              }
            >
              <option value="plain">{t("canvasQuick.plain")}</option>
              <option value="transparent">
                {t("canvasQuick.transparent")}
              </option>
            </select>
          </label>
        ) : null}
      </fieldset>
      {action.background === "transparent" ? (
        <p>{t("canvasQuick.transparentHint")}</p>
      ) : null}
      {missingModel ? (
        <p role="alert" className="canvas-quick-error">
          {missingModel}
        </p>
      ) : null}
      <a href={settingsHash("providers")}>{t("canvasQuick.configure")}</a>
      {error ? (
        <p role="alert" className="canvas-quick-error">
          {error}
        </p>
      ) : null}
      <div className="canvas-quick-buttons">
        <button
          type="button"
          disabled={
            busy ||
            recognizing ||
            !sourceAvailable ||
            Boolean(missingModel) ||
            (action.kind === "objects" &&
              !objects.some(
                (item) =>
                  item.selected && item.name.trim() && item.prompt.trim(),
              ))
          }
          onClick={() => onRun(false)}
        >
          {t(
            action.kind === "objects"
              ? "canvasQuick.run"
              : "canvasQuick.runViews",
          )}
        </button>
        <button
          type="button"
          disabled={
            busy || !hasFailures || Boolean(missingModel) || !sourceAvailable
          }
          onClick={() => onRun(true)}
        >
          {t("canvasQuick.retryFailed")}
        </button>
        {busy ? (
          <button type="button" onClick={onCancel}>
            {t("canvasQuick.cancel")}
          </button>
        ) : null}
      </div>
      <p>{t("canvasQuick.batchHint")}</p>
      <ul className="canvas-quick-results">
        {members.map((member) => (
          <li key={member.id}>
            <div>
              <strong>{member.title ?? t("canvasQuick.result")}</strong>
              <span data-status={status(member)}>
                {t(`canvasQuick.${status(member)}`)}
              </span>
            </div>
            {action.kind === "views" ? (
              <label>
                {t("canvasQuick.prompt")}
                <textarea
                  disabled={busy}
                  value={member.data.prompt ?? ""}
                  onChange={(event) => onPrompt(member.id, event.target.value)}
                />
              </label>
            ) : null}
            {jobs[member.id]?.error ? (
              <p role="alert" className="canvas-quick-error">
                {jobs[member.id]?.error}
              </p>
            ) : null}
            {status(member) === "failed" || status(member) === "cancelled" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onRetry(member.id)}
              >
                {t("canvasQuick.retry")}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </aside>
  );
}
