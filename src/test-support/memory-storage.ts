/**
 * In-memory Storage for tests. `quotaChars` limits the total size of keys plus
 * values; `failOn` makes chosen keys throw on write (change it at any time).
 * Both throw the DOMException a browser throws when storage is full.
 */
export class MemoryStorage implements Storage {
  [name: string]: unknown;
  failOn: (key: string) => boolean = () => false;
  private readonly data = new Map<string, string>();
  private readonly quotaChars: number;

  constructor(quotaChars = Number.POSITIVE_INFINITY) {
    this.quotaChars = quotaChars;
  }

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    let used = key.length + value.length;
    for (const [k, v] of this.data) {
      if (k !== key) {
        used += k.length + v.length;
      }
    }
    if (this.failOn(key) || used > this.quotaChars) {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    }
    this.data.set(key, value);
  }
}
