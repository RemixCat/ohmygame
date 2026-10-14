/** Local recovery is independent of the last successful server revision. */
export function readStudioDraft<T>(key: string): T | undefined {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : undefined;
  } catch {
    return undefined;
  }
}
export function writeStudioDraft(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* The user can still explicitly save to disk. */
  }
}
export function clearStudioDraft(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {}
}
