import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const preview = vi.fn(() => ({ url: "blob:loaded-audio" }));
vi.doMock(
  path.resolve("src/renderer/use-workspace-asset-url.ts"),
  async (original) => ({
    ...(await original<
      typeof import("../src/renderer/use-workspace-asset-url.js")
    >()),
    useWorkspaceAssetUrl: preview,
  }),
);
const { AssetThumbnail, assetTypeBadge } =
  await import("../src/renderer/asset-browser.js");
it("renders an audio placeholder and badge even with a cached media URL, without requesting thumbnail bytes", () => {
  const html = renderToStaticMarkup(
    <AssetThumbnail
      asset={{
        path: "song.wav",
        assetId: "music",
        mediaType: "audio",
        size: 20,
      }}
      visible
    />,
  );
  expect(html).toContain("<svg");
  expect(html).not.toContain("blob:loaded-audio");
  expect(preview).toHaveBeenCalledWith(
    undefined,
    "song.wav",
    undefined,
    undefined,
  );
  expect(renderToStaticMarkup(<>{assetTypeBadge("audio")}</>)).toContain(
    "Audio",
  );
});
