/** Install the current PDF.js runtime primitives missing from shipped browsers. */
export function ensurePdfJsRuntimeCompatibility(): void {
  const bytePrototype = Uint8Array.prototype as typeof Uint8Array.prototype & {
    toHex?: (this: Uint8Array) => string;
  };
  if (typeof bytePrototype.toHex !== 'function') {
    Object.defineProperty(bytePrototype, 'toHex', {
      configurable: true,
      value(this: Uint8Array): string {
        return Array.from(this, (value) => value.toString(16).padStart(2, '0')).join('');
      },
      writable: true,
    });
  }
  const mapPrototype = Map.prototype as typeof Map.prototype & {
    getOrInsertComputed?: (
      this: Map<unknown, unknown>,
      key: unknown,
      callback: (key: unknown) => unknown,
    ) => unknown;
  };
  if (typeof mapPrototype.getOrInsertComputed !== 'function') {
    Object.defineProperty(mapPrototype, 'getOrInsertComputed', {
      configurable: true,
      value(
        this: Map<unknown, unknown>,
        key: unknown,
        callback: (key: unknown) => unknown,
      ): unknown {
        if (this.has(key)) return this.get(key);
        const value = callback(key);
        this.set(key, value);
        return value;
      },
      writable: true,
    });
  }
  const promiseConstructor = Promise as PromiseConstructor & {
    try?: (callback: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown>;
  };
  if (typeof promiseConstructor.try !== 'function') {
    Object.defineProperty(promiseConstructor, 'try', {
      configurable: true,
      value(callback: (...args: unknown[]) => unknown, ...args: unknown[]) {
        return new Promise((resolve) => resolve(callback(...args)));
      },
      writable: true,
    });
  }
  const setPrototype = Set.prototype as typeof Set.prototype & {
    intersection?: (this: Set<unknown>, other: ReadonlySet<unknown>) => Set<unknown>;
  };
  if (typeof setPrototype.intersection !== 'function') {
    Object.defineProperty(setPrototype, 'intersection', {
      configurable: true,
      value(this: Set<unknown>, other: ReadonlySet<unknown>) {
        const result = new Set<unknown>();
        for (const value of this) {
          if (other.has(value)) result.add(value);
        }
        return result;
      },
      writable: true,
    });
  }
}
