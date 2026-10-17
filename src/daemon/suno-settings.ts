import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export class SunoSettingsStore {
  readonly #file: string;
  #key?: string;
  #mutations: Promise<void> = Promise.resolve();

  constructor(dataDirectory: string) {
    this.#file = path.join(dataDirectory, "suno-mumu.json");
  }
  async load(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.#file, "utf8"));
      if (value.version !== 1 || typeof value.apiKey !== "string")
        throw new Error("Invalid Suno settings");
      this.#key = value.apiKey;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
    }
  }
  get(): { configured: boolean } {
    return { configured: Boolean(this.#key) };
  }
  key(): string | undefined {
    return this.#key;
  }
  async update(apiKey: string): Promise<{ configured: boolean }> {
    const key = apiKey.trim();
    if (!key || key.length > 10_000 || !/^[\x21-\x7E]+$/.test(key))
      throw new Error(
        "Suno API key must contain only printable ASCII characters",
      );
    await this.#mutate(async () => {
      await mkdir(path.dirname(this.#file), { recursive: true });
      const temporary = `${this.#file}.${randomUUID()}.tmp`;
      try {
        await writeFile(
          temporary,
          `${JSON.stringify({ version: 1, apiKey: key })}\n`,
          { mode: 0o600 },
        );
        await rename(temporary, this.#file);
        this.#key = key;
      } finally {
        await rm(temporary, { force: true });
      }
    });
    return this.get();
  }
  async clear(): Promise<void> {
    await this.#mutate(async () => {
      await rm(this.#file, { force: true });
      this.#key = undefined;
    });
  }
  async #mutate(operation: () => Promise<void>): Promise<void> {
    const pending = this.#mutations.then(operation);
    this.#mutations = pending.catch(() => undefined);
    await pending;
  }
}
