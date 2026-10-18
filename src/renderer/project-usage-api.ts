import type {
  ConversationUsage,
  ProjectStatistics,
} from "../shared/project-usage.js";
import { request } from "./api.js";
export const getConversationUsage = (
  projectId: string,
  conversationId: string,
  signal?: AbortSignal,
): Promise<ConversationUsage> =>
  request(
    `/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}/usage`,
    { signal },
  );
export const getProjectStatistics = (
  projectId: string,
  range: {
    from?: string;
    to?: string;
    timezone: string;
    conversationId?: string;
  },
  signal?: AbortSignal,
): Promise<ProjectStatistics> => {
  const query = new URLSearchParams({
    timezone: range.timezone,
    ...(range.conversationId ? { conversationId: range.conversationId } : {}),
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
  });
  return request(
    `/projects/${encodeURIComponent(projectId)}/statistics?${query}`,
    { signal },
  );
};
