/** Coalesces concurrent reads and rejects results from an invalidated session. */
export class AsyncCache<T> {
  private value: { key: string; data: T; until: number } | null = null;
  private pending: { key: string; promise: Promise<T> } | null = null;
  private generation = 0;

  constructor(private readonly ttl: number, private readonly now = Date.now) {}

  clear() { this.generation++; this.value = null; this.pending = null; }

  async get(key: string, load: () => Promise<T>): Promise<T> {
    if (this.value?.key === key && this.value.until > this.now()) return this.value.data;
    if (this.pending?.key === key) return this.pending.promise;
    const generation = this.generation;
    const promise = load().then((data) => {
      if (generation !== this.generation) throw new Error('The signed-in account changed. Please try again.');
      this.value = { key, data, until: this.now() + this.ttl };
      return data;
    }).finally(() => { if (this.pending?.promise === promise) this.pending = null; });
    this.pending = { key, promise };
    return promise;
  }
}
