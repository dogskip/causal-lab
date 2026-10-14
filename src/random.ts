export class DeterministicRandom {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  clone(): DeterministicRandom {
    return new DeterministicRandom(this.#state);
  }

  copyFrom(other: DeterministicRandom): void {
    this.#state = other.#state;
  }

  next(): number {
    this.#state = (this.#state + 0x6d2b_79f5) >>> 0;
    let value = this.#state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  integer(minimum: number, maximum: number): number {
    return minimum + Math.floor(this.next() * (maximum - minimum + 1));
  }
}
