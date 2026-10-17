import type {
  Model3DGenerationConfig,
  Model3DModel,
  Model3DOperation,
  Model3DOptions,
} from "../shared/contracts.js";
import {
  tripoPolycount,
  TRIPO_TEXTURE_MODELS,
} from "../shared/tripo-options.js";
import { CanvasChipSelect } from "./canvas-chip-select.js";
import { t } from "./i18n.js";

/** The fields are stored with the board and sent to the same API used by agents. */
export function TripoControls({
  model,
  operation,
  options = {},
  config,
  imageCount,
  disabled,
  onChange,
  onPolycount,
}: {
  model: Model3DModel;
  operation: Model3DOperation;
  options?: Model3DOptions;
  config: Model3DGenerationConfig;
  imageCount: number;
  disabled?: boolean;
  onChange: (options: Model3DOptions) => void;
  onPolycount: (value: number) => void;
}) {
  const generation = operation === "image" || operation === "text";
  const texturing = operation === "retexture" || (generation && config.texture);
  const h3 = ["v3.1-20260211", "v3.0-20250812"].includes(model.id);
  const legacy = model.id === "v2.5-20250123";
  const textureModel =
    options.textureModel ??
    (operation === "retexture"
      ? "v3.5-20260815"
      : legacy
        ? model.id
        : "v3.0-20250812");
  const range = tripoPolycount(model.polycount, model.id, operation, options);
  const update = (value: Partial<Model3DOptions>) =>
    onChange({ ...options, ...value });
  const toggle = (
    key:
      | "adaptivePolycount"
      | "smartLowPoly"
      | "quad"
      | "smartUv"
      | "bake"
      | "delight"
      | "imageAutofix"
      | "autoSize"
      | "exportUv",
    fallback = false,
  ) => (
    <label className="tripo-option-toggle">
      <input
        type="checkbox"
        checked={Boolean(options[key] ?? fallback)}
        onChange={(event) => update({ [key]: event.target.checked })}
      />
      {t(`assetCanvas.tripo.${key}`)}
    </label>
  );
  const seed = (key: "modelSeed" | "textureSeed" | "imageSeed") => (
    <label className="tripo-option-field">
      {t(`assetCanvas.tripo.${key}`)}
      <input
        type="number"
        min={0}
        max={2147483647}
        step={1}
        value={options[key] ?? ""}
        placeholder={t("assetCanvas.tripo.random")}
        onChange={(event) => {
          const value =
            event.target.value === "" ? undefined : Number(event.target.value);
          if (
            value === undefined ||
            (Number.isInteger(value) && value >= 0 && value <= 2147483647)
          )
            update({ [key]: value });
        }}
      />
    </label>
  );
  const select = (
    key: "textureAlignment" | "orientation" | "geometryQuality" | "remeshModel",
    values: (
      | "standard"
      | "detailed"
      | "original_image"
      | "geometry"
      | "default"
      | "align_image"
      | "none"
      | "v3.0"
      | "v2.0"
      | "v1.0"
    )[],
    fallback: string,
  ) => (
    <CanvasChipSelect
      label={t(`assetCanvas.tripo.${key}`)}
      value={String(options[key] ?? fallback)}
      disabled={disabled}
      options={values.map((value) => ({
        value,
        label: t(
          `assetCanvas.tripo.values.${value === "v3.0" ? "version3" : value === "v2.0" ? "version2" : value === "v1.0" ? "version1" : value}`,
        ),
      }))}
      onChange={(value) => {
        if (key === "remeshModel")
          update({
            remeshModel: value as Model3DOptions["remeshModel"],
            smartUv: undefined,
            bake: undefined,
            ...(value === "v1.0" ? { adaptivePolycount: false } : {}),
          });
        else update({ [key]: value });
      }}
    />
  );
  return (
    <details className="tripo-options nodrag nowheel">
      <summary>{t("assetCanvas.tripo.advanced")}</summary>
      <fieldset disabled={disabled}>
        {operation !== "retexture" && (
          <section>
            <h4>{t("assetCanvas.tripo.geometry")}</h4>
            <div className="tripo-option-row">
              {!(operation === "remesh" && options.remeshModel === "v1.0") &&
                toggle("adaptivePolycount")}
              {!options.adaptivePolycount && (
                <label className="tripo-option-field">
                  {t("assetCanvas.tripo.customFaces")}
                  <input
                    aria-label={t("assetCanvas.tripo.customFaces")}
                    type="number"
                    min={range.min}
                    max={range.max}
                    step={1}
                    defaultValue={config.targetPolycount}
                    key={config.targetPolycount}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (
                        Number.isInteger(value) &&
                        value >= range.min &&
                        value <= range.max
                      )
                        onPolycount(value);
                      else event.target.value = String(config.targetPolycount);
                    }}
                  />
                </label>
              )}
              {generation && h3 && (
                <>
                  {select(
                    "geometryQuality",
                    ["standard", "detailed"],
                    "standard",
                  )}
                  {toggle("smartLowPoly")}
                </>
              )}
              {(operation === "remesh" || model.id === "P2-20260801") &&
                toggle("quad")}
              {operation === "remesh" && (
                <>
                  {select("remeshModel", ["v3.0", "v2.0", "v1.0"], "v3.0")}
                  {(options.remeshModel ?? "v3.0") === "v3.0" &&
                    toggle("smartUv")}
                  {options.remeshModel !== "v1.0" && toggle("bake", true)}
                </>
              )}
              {generation && seed("modelSeed")}
            </div>
          </section>
        )}
        {texturing && (
          <section>
            <h4>{t("assetCanvas.tripo.material")}</h4>
            <div className="tripo-option-row">
              <CanvasChipSelect
                label={t("assetCanvas.textureVersion")}
                value={textureModel}
                options={TRIPO_TEXTURE_MODELS.map((value) => ({
                  value,
                  label: value,
                }))}
                disabled={disabled}
                onChange={(textureModel) =>
                  update({
                    textureModel,
                    delight: undefined,
                    ...(textureModel !== "v3.5-20260815" &&
                    options.textureQuality === "fast"
                      ? { textureQuality: "standard" }
                      : {}),
                  })
                }
              />
              {(!legacy || operation === "retexture") && (
                <CanvasChipSelect
                  label={t("assetCanvas.textureQuality")}
                  value={options.textureQuality ?? "standard"}
                  options={(textureModel === "v3.5-20260815"
                    ? (["fast", "standard", "detailed", "extreme"] as const)
                    : (["standard", "detailed", "extreme"] as const)
                  ).map((value) => ({
                    value,
                    label: t(`assetCanvas.textureQualities.${value}`),
                  }))}
                  disabled={disabled}
                  onChange={(value) =>
                    update({
                      textureQuality: value as Model3DOptions["textureQuality"],
                    })
                  }
                />
              )}
              {(operation === "image" || operation === "retexture") &&
                select(
                  "textureAlignment",
                  ["original_image", "geometry"],
                  "original_image",
                )}
              {textureModel === "v3.5-20260815" && toggle("delight", true)}
              {operation === "retexture" && toggle("bake", true)}
              {seed("textureSeed")}
            </div>
            <p>{t("assetCanvas.tripo.textureCost")}</p>
          </section>
        )}
        {generation && (
          <section>
            <h4>{t("assetCanvas.tripo.inputOutput")}</h4>
            <div className="tripo-option-row">
              {operation === "image" &&
                imageCount <= 1 &&
                toggle("imageAutofix")}
              {operation === "image" &&
                config.texture &&
                select("orientation", ["default", "align_image"], "default")}
              {!legacy && toggle("autoSize")}
              {toggle("exportUv", true)}
              {operation === "text" && seed("imageSeed")}
            </div>
            {operation === "text" && (
              <label className="tripo-option-field">
                {t("assetCanvas.tripo.negativePrompt")}
                <textarea
                  maxLength={255}
                  rows={2}
                  value={options.negativePrompt ?? ""}
                  onChange={(event) =>
                    update({ negativePrompt: event.target.value || undefined })
                  }
                />
              </label>
            )}
          </section>
        )}
      </fieldset>
    </details>
  );
}
