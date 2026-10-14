export class EventHeap<T extends Readonly<{ at: number; sequence: number }>> {
  readonly #items: T[] = [];

  get size(): number {
    return this.#items.length;
  }

  peek(): T | undefined {
    return this.#items[0];
  }

  push(event: T): void {
    this.#items.push(event);
    this.#siftUp(this.#items.length - 1);
  }

  pop(): T | undefined {
    const top = this.#items[0];
    const last = this.#items.pop();
    if (last !== undefined && this.#items.length > 0) {
      this.#items[0] = last;
      this.#siftDown(0);
    }
    return top;
  }

  #less(a: T, b: T): boolean {
    return a.at < b.at || (a.at === b.at && a.sequence < b.sequence);
  }

  #siftUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = (current - 1) >>> 1;
      const parentEvent = this.#items[parent];
      const currentEvent = this.#items[current];
      if (parentEvent === undefined || currentEvent === undefined) {
        return;
      }
      if (this.#less(parentEvent, currentEvent)) {
        return;
      }
      this.#items[parent] = currentEvent;
      this.#items[current] = parentEvent;
      current = parent;
    }
  }

  #siftDown(index: number): void {
    let current = index;
    const length = this.#items.length;
    for (;;) {
      const left = current * 2 + 1;
      const right = current * 2 + 2;
      let smallest = current;
      const smallestEvent = this.#items[smallest];
      if (smallestEvent === undefined) {
        return;
      }
      if (left < length) {
        const leftEvent = this.#items[left];
        if (leftEvent !== undefined && this.#less(leftEvent, smallestEvent)) {
          smallest = left;
        }
      }
      if (right < length) {
        const rightEvent = this.#items[right];
        const smallestAfterLeft = this.#items[smallest];
        if (
          rightEvent !== undefined &&
          smallestAfterLeft !== undefined &&
          this.#less(rightEvent, smallestAfterLeft)
        ) {
          smallest = right;
        }
      }
      if (smallest === current) {
        return;
      }
      const a = this.#items[current];
      const b = this.#items[smallest];
      if (a === undefined || b === undefined) {
        return;
      }
      this.#items[current] = b;
      this.#items[smallest] = a;
      current = smallest;
    }
  }
}
