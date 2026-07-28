import { afterEach, describe, expect, it } from 'vitest';
import { ensurePdfJsRuntimeCompatibility } from '../../src/components/pdfJsCompatibility.js';

const originals = {
  bytes: Object.getOwnPropertyDescriptor(Uint8Array.prototype, 'toHex'),
  map: Object.getOwnPropertyDescriptor(Map.prototype, 'getOrInsertComputed'),
  promise: Object.getOwnPropertyDescriptor(Promise, 'try'),
  set: Object.getOwnPropertyDescriptor(Set.prototype, 'intersection'),
};

function restore(target: object, name: string, descriptor?: PropertyDescriptor): void {
  if (descriptor) Object.defineProperty(target, name, descriptor);
  else delete (target as Record<string, unknown>)[name];
}

afterEach(() => {
  restore(Uint8Array.prototype, 'toHex', originals.bytes);
  restore(Map.prototype, 'getOrInsertComputed', originals.map);
  restore(Promise, 'try', originals.promise);
  restore(Set.prototype, 'intersection', originals.set);
});

describe('PDF.js shipped-browser compatibility', () => {
  it('installs idempotent standards-compatible primitives', async () => {
    restore(Uint8Array.prototype, 'toHex');
    restore(Map.prototype, 'getOrInsertComputed');
    restore(Promise, 'try');
    restore(Set.prototype, 'intersection');

    ensurePdfJsRuntimeCompatibility();
    ensurePdfJsRuntimeCompatibility();

    const bytes = new Uint8Array([0, 15, 255]) as Uint8Array & {
      toHex: () => string;
    };
    expect(bytes.toHex()).toBe('000fff');

    const map = new Map<string, number>() as Map<string, number> & {
      getOrInsertComputed: (key: string, callback: (key: string) => number) => number;
    };
    expect(map.getOrInsertComputed('answer', () => 42)).toBe(42);
    expect(map.getOrInsertComputed('answer', () => 0)).toBe(42);

    const promiseTry = (
      Promise as PromiseConstructor & {
        try: (callback: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown>;
      }
    ).try;
    await expect(promiseTry((value) => Number(value) + 1, 2)).resolves.toBe(3);
    await expect(
      promiseTry(() => {
        throw new Error('captured');
      }),
    ).rejects.toThrow('captured');

    const values = new Set([1, 2, 3]) as Set<number> & {
      intersection: (other: ReadonlySet<number>) => Set<number>;
    };
    expect([...values.intersection(new Set([2, 4]))]).toEqual([2]);
  });
});
