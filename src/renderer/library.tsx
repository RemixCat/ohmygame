import { StudioLibraryView } from "./studio-library.js";
import { SidebarPageHeader, SidebarPageLayout } from "./sidebar-page.js";
import type { AppNavigationTarget } from "./routes.js";
import { t } from "./i18n.js";
export function LibraryPage({ onNavigate }: { onNavigate: (page: AppNavigationTarget) => void }) {
  return <SidebarPageLayout active="library" onNavigate={onNavigate}><SidebarPageHeader title={t("library.title")} /><StudioLibraryView /></SidebarPageLayout>;
}
export { filterLibraryAssets } from "./library-assets.js";
