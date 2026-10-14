import type { ToolJob } from "../shared/contracts.js";

/** Slots are held until completion, rather than just until the HTTP start returns. */
export class CanvasBatchRunner {
  readonly controller = new AbortController();
  readonly active = new Map<string, ToolJob>();
  readonly starting = new Set<string>();
  readonly cancelled = new Set<string>();
  readonly pending: Set<string>;
  private cancellations: Promise<unknown>[] = [];
  constructor(
    readonly ids: string[],
    readonly start: (id: string) => Promise<ToolJob>,
    readonly jobs: () => Promise<ToolJob[]>,
    readonly cancelJob: (id: string) => Promise<unknown>,
    readonly changed: () => void,
    readonly failed: (id: string, error: unknown) => void,
    readonly pause = (signal: AbortSignal) =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, 1000);
        signal.addEventListener("abort", done, { once: true });
        if (signal.aborted) done();
      }),
  ) {
    this.pending = new Set(ids);
  }
  async run(): Promise<void> {
    const worker = async () => {
      while (!this.controller.signal.aborted) {
        const id = this.pending.values().next().value as string | undefined;
        if (!id) return;
        this.pending.delete(id);
        this.starting.add(id);
        this.changed();
        try {
          const job = await this.start(id);
          this.starting.delete(id);
          this.active.set(id, job);
          this.changed();
          // Cancellation can arrive while the start request is in flight.
          if (this.controller.signal.aborted) {
            if (this.cancelRemote) await this.cancelJob(job.id);
            return;
          }
          let status = job.status;
          while (status === "running" && !this.controller.signal.aborted) {
            await this.pause(this.controller.signal);
            if (this.controller.signal.aborted) break;
            // A temporary polling error must not free a still-running provider slot.
            try {
              const latest = (await this.jobs()).find(
                (entry) => entry.id === job.id,
              );
              if (latest) status = latest.status;
            } catch {
              /* Keep waiting for this job or explicit cancellation. */
            }
          }
        } catch (error) {
          this.failed(id, error);
        } finally {
          this.starting.delete(id);
          this.active.delete(id);
          this.changed();
        }
      }
    };
    await Promise.all([worker(), worker()]);
    await Promise.allSettled(this.cancellations);
  }
  private cancelRemote = false;
  stop(cancelRemote: boolean): void {
    this.cancelRemote = cancelRemote;
    if (cancelRemote) for (const id of this.pending) this.cancelled.add(id);
    this.controller.abort();
    this.pending.clear();
    if (cancelRemote)
      for (const [id, job] of this.active)
        this.cancellations.push(
          this.cancelJob(job.id).catch((error) => this.failed(id, error)),
        );
    this.changed();
  }
}
