import type { AuthorizationHealth } from "./index.js";
const unknown = (reason: string): AuthorizationHealth => ({
  upstreamConnected: null,
  authorizationStatus: "unknown",
  authorizationReason: reason,
  authorizationCheckedAt: new Date().toISOString(),
});
/** Each active probe gets its own network budget; queue waiting cannot consume it. */
export class AuthorizationProbeQueue {
  private active = 0;
  private waiting: Array<() => void> = [];
  private pending = new Map<string, Promise<AuthorizationHealth>>();
  constructor(
    private readonly options = {
      concurrency: 8,
      networkMs: 5_000,
      queueMs: 30_000,
      maxPending: 256,
    },
  ) {}
  probe(
    key: string,
    lookup: (signal: AbortSignal) => Promise<AuthorizationHealth>,
  ): Promise<AuthorizationHealth> {
    const existing = this.pending.get(key);
    if (existing) return existing;
    if (this.pending.size >= this.options.maxPending)
      return Promise.resolve(unknown("checks_busy"));
    let settle!: (value: AuthorizationHealth) => void;
    const result = new Promise<AuthorizationHealth>((resolve) => {
      settle = resolve;
    });
    this.pending.set(key, result);
    let finished = false;
    let started = false;
    const controller = new AbortController();
    const finish = (health: AuthorizationHealth) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (!started) this.pending.delete(key);
      if (!started) this.waiting = this.waiting.filter((item) => item !== run);
      settle(health);
    };
    let timer = setTimeout(
      () => finish(unknown("checks_busy")),
      this.options.queueMs,
    );
    const run = () => {
      if (finished) return;
      started = true;
      this.active++;
      clearTimeout(timer);
      timer = setTimeout(() => {
        controller.abort();
        finish(unknown("check_timed_out"));
      }, this.options.networkMs);
      void Promise.resolve()
        .then(() => lookup(controller.signal))
        .then(finish, () => finish(unknown("provider_unavailable")))
        .finally(() => {
          // An abort-ignoring transport retains its slot until it actually ends.
          this.pending.delete(key);
          this.active--;
          this.drain();
        });
    };
    this.waiting.push(run);
    this.drain();
    return result;
  }
  private drain() {
    while (this.active < this.options.concurrency && this.waiting.length)
      this.waiting.shift()!();
  }
}
