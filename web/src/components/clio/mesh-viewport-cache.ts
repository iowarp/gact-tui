import { MESH_CACHE_MAX_BYTES } from '@/lib/runtime-limits';
import type { ParsedFeaMesh } from './mesh-viewport-mesh';

/** Bytes a parsed mesh holds in typed arrays: geometry, index maps, and every field. */
export function parsedMeshBytes(mesh: ParsedFeaMesh): number {
  let total =
    mesh.positions.byteLength +
    mesh.triangles.byteLength +
    mesh.nodeIndex.byteLength +
    (mesh.cellA?.byteLength ?? 0) +
    (mesh.cellB?.byteLength ?? 0);
  for (const field of mesh.fields) total += field.data.byteLength;
  return total;
}

/**
 * A least-recently-used store of parsed meshes with a byte budget.
 *
 * Every mesh it drops is reported through `console.debug` with the reason, so
 * a viewport that has to download a mesh again can be traced to the budget.
 */
export class ParsedMeshCache {
  private readonly entries = new Map<string, { mesh: ParsedFeaMesh; bytes: number }>();
  private total = 0;

  public constructor(private readonly budgetBytes: number) {}

  public get size(): number {
    return this.entries.size;
  }

  public get bytes(): number {
    return this.total;
  }

  /** The cached mesh, marked most recently used, or undefined. */
  public get(key: string): ParsedFeaMesh | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.mesh;
  }

  /** Keep `mesh` under `key`, evicting the least recently used meshes past the budget. */
  public set(key: string, mesh: ParsedFeaMesh): void {
    const bytes = parsedMeshBytes(mesh);
    const previous = this.entries.get(key);
    if (previous) {
      this.entries.delete(key);
      this.total -= previous.bytes;
    }
    if (bytes > this.budgetBytes) {
      console.debug(
        `mesh cache skip key=${key} reason=larger_than_budget bytes=${bytes} budget=${this.budgetBytes}`,
      );
      return;
    }
    this.entries.set(key, { mesh, bytes });
    this.total += bytes;
    for (const [oldest, entry] of this.entries) {
      if (this.total <= this.budgetBytes) break;
      this.entries.delete(oldest);
      this.total -= entry.bytes;
      console.debug(
        `mesh cache evict key=${oldest} reason=budget_exceeded bytes=${entry.bytes} total=${this.total} budget=${this.budgetBytes}`,
      );
    }
  }

  public clear(): void {
    this.entries.clear();
    this.total = 0;
  }
}

/** The tab's one mesh cache (see `MESH_CACHE_MAX_BYTES`). */
export const parsedMeshCache = new ParsedMeshCache(MESH_CACHE_MAX_BYTES);
