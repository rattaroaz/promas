/** Fixed-capacity ring buffer (oldest entries dropped). */
export class RingBuffer<T> {
  private buf: T[] = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
  }

  push(item: T): void {
    this.buf.push(item);
    if (this.buf.length > this.capacity) {
      this.buf.splice(0, this.buf.length - this.capacity);
    }
  }

  toArray(): T[] {
    return this.buf.slice();
  }

  clear(): void {
    this.buf = [];
  }

  get size(): number {
    return this.buf.length;
  }
}
