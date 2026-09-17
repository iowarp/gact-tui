import { Catalog } from '@a2ui/web_core/v0_9';
import type { ComponentApi, FunctionImplementation } from '@a2ui/web_core/v0_9';
import { z } from 'zod';

/**
 * One official-shape A2UI catalog document, as returned in a catalog row's
 * `file` field (`GET /v1/sessions/{sid}/a2ui/catalogs`, S2). Components and
 * functions are raw JSON Schema fragments — this module never re-validates
 * them (the server already did, S2); it only reads their names.
 */
export interface A2uiCatalogFile {
  catalogId: string;
  components: Record<string, unknown>;
  functions?: Record<string, unknown>;
}

/** Which renderer kernel implements one catalog component (`catalog.clio.json`). */
export interface A2uiCatalogSidecarImplementation {
  kernel: string;
  presets?: Record<string, string>;
}

/** Where one client action name routes, beyond the default agent lane. */
export interface A2uiCatalogSidecarEventRoute {
  destination?: 'agent' | 'permission' | 'run';
  context_schema?: Record<string, unknown>;
}

/** CLIO packaging metadata for one catalog (`catalog.clio.json`). Never sent on the wire. */
export interface A2uiCatalogSidecar {
  catalogId: string;
  protocolVersion: string;
  trust: { source: 'builtin' | 'pack' };
  implements?: Record<string, A2uiCatalogSidecarImplementation>;
  events?: Record<string, A2uiCatalogSidecarEventRoute>;
  instructions?: string;
}

/**
 * One row of `GET /v1/a2ui/catalogs` or `GET /v1/sessions/{sid}/a2ui/catalogs`
 * (`docs/gact/a2ui-binding.md`, `gact/a2ui_catalogs/routes/a2ui_catalogs.py`).
 * `file`/`instructions` are present only when `producible` is true.
 */
export interface A2uiCatalogRow {
  catalogId: string;
  protocolVersion: string;
  source: 'builtin' | 'blueprint';
  checksum: string;
  componentNames: string[];
  functionNames: string[];
  sidecar: A2uiCatalogSidecar;
  producible: boolean;
  file?: A2uiCatalogFile;
  instructions?: string;
}

/** The kernel implementations this renderer actually has, keyed by kernel name. */
export interface A2uiKernelRegistry<T extends ComponentApi> {
  components: ReadonlyMap<string, T>;
  functions: ReadonlyMap<string, FunctionImplementation>;
}

export type A2uiCatalogUnresolvedReasonCode =
  | 'catalog_component_unimplemented'
  | 'catalog_function_unimplemented'
  | 'catalog_row_missing_file'
  | 'a2ui_catalog_route_unavailable';

/**
 * The official Basic catalog's own id (protocol-stable — not derived from any
 * server) and CLIO's own workspace catalog id (stable, pre-registry
 * constant). Used only as the client's best-effort advertisement when
 * `GET .../a2ui/catalogs` or `.../a2ui/capabilities` is unavailable (an older
 * server, S6 adversarial review item 2a) — the client cannot know that
 * server's actual catalog rows, but these two ids are the protocol/CLIO
 * defaults every renderer of this vintage would still recognize by name.
 */
export const A2UI_BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
export const A2UI_CLIO_WORKSPACE_CATALOG_ID = 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1';

/** A typed, worded reason a catalog row could not become a renderable catalog. */
export interface A2uiCatalogUnresolvedReason {
  code: A2uiCatalogUnresolvedReasonCode;
  catalogId: string;
  detail: string;
}

export interface A2uiCatalogResolution<T extends ComponentApi> {
  catalogId: string;
  catalog: Catalog<T>;
}

export type A2uiCatalogBuildResult<T extends ComponentApi> =
  | { ok: true; resolution: A2uiCatalogResolution<T> }
  | { ok: false; reason: A2uiCatalogUnresolvedReason };

/**
 * Wraps one resolved kernel component under the catalog's own component name,
 * applying the sidecar's `presets` (if any). The registry stays DOM-free by
 * delegating the actual wrapping mechanics to the caller — `kernel-catalog.tsx`
 * supplies the React-aware implementation; tests may supply the identity
 * function.
 */
export type A2uiComponentWrapper<T extends ComponentApi> = (
  kernelComponent: T,
  catalogComponentName: string,
  presets: Record<string, string> | undefined,
) => T;

function identityWrapper<T extends ComponentApi>(
  kernelComponent: T,
  catalogComponentName: string,
): T {
  return { ...kernelComponent, name: catalogComponentName };
}

/**
 * Resolves one catalog row into a renderable `Catalog`, or a typed reason it
 * cannot be built. Every declared component name is resolved through the
 * sidecar's `implements` map (an entry with no sidecar mapping falls back to
 * the catalog's own name, e.g. the CLIO workspace catalog's 1:1 kernel names);
 * every declared function name is looked up directly in the kernel's function
 * map (functions are not renamed — `docs/gact/a2ui-binding.md`'s sidecar has
 * no per-function alias concept).
 */
export function buildA2uiCatalog<T extends ComponentApi>(
  row: A2uiCatalogRow,
  kernel: A2uiKernelRegistry<T>,
  wrapComponent: A2uiComponentWrapper<T> = identityWrapper,
): A2uiCatalogBuildResult<T> {
  if (!row.file) {
    return {
      ok: false,
      reason: {
        code: 'catalog_row_missing_file',
        catalogId: row.catalogId,
        detail: `Catalog ${row.catalogId} is not producible in this session, so its component/function definitions were not returned.`,
      },
    };
  }
  const implementsMap = row.sidecar.implements ?? {};
  const components: T[] = [];
  for (const componentName of Object.keys(row.file.components)) {
    const implementation = implementsMap[componentName];
    const kernelName = implementation?.kernel ?? componentName;
    const kernelComponent = kernel.components.get(kernelName);
    if (!kernelComponent) {
      return {
        ok: false,
        reason: {
          code: 'catalog_component_unimplemented',
          catalogId: row.catalogId,
          detail: `Catalog ${row.catalogId} declares component "${componentName}" (kernel "${kernelName}"), which this renderer does not implement.`,
        },
      };
    }
    components.push(wrapComponent(kernelComponent, componentName, implementation?.presets));
  }

  const functions: FunctionImplementation[] = [];
  for (const functionName of Object.keys(row.file.functions ?? {})) {
    const fn = kernel.functions.get(functionName);
    if (!fn) {
      return {
        ok: false,
        reason: {
          code: 'catalog_function_unimplemented',
          catalogId: row.catalogId,
          detail: `Catalog ${row.catalogId} declares function "${functionName}", which this renderer does not implement.`,
        },
      };
    }
    functions.push(fn);
  }

  return {
    ok: true,
    resolution: { catalogId: row.catalogId, catalog: new Catalog<T>(row.catalogId, components, functions) },
  };
}

const a2uiCatalogSidecarImplementationSchema = z.object({
  kernel: z.string(),
  presets: z.record(z.string(), z.string()).optional(),
});

const a2uiCatalogSidecarEventRouteSchema = z.object({
  destination: z.enum(['agent', 'permission', 'run']).optional(),
  context_schema: z.record(z.string(), z.unknown()).optional(),
});

const a2uiCatalogSidecarSchema = z.object({
  catalogId: z.string(),
  protocolVersion: z.string(),
  trust: z.object({ source: z.enum(['builtin', 'pack']) }),
  implements: z.record(z.string(), a2uiCatalogSidecarImplementationSchema).optional(),
  events: z.record(z.string(), a2uiCatalogSidecarEventRouteSchema).optional(),
  instructions: z.string().optional(),
});

const a2uiCatalogFileSchema = z.object({
  catalogId: z.string(),
  components: z.record(z.string(), z.unknown()),
  functions: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Validates one row of `GET /v1/sessions/{sid}/a2ui/catalogs` (or the
 * session-less `GET /v1/a2ui/catalogs`) — structural shape only; component
 * and function bodies are opaque JSON Schema the server already validated
 * (S2) and this module never re-parses.
 */
export const a2uiCatalogRowSchema: z.ZodType<A2uiCatalogRow> = z.object({
  catalogId: z.string(),
  protocolVersion: z.string(),
  source: z.enum(['builtin', 'blueprint']),
  checksum: z.string(),
  componentNames: z.array(z.string()),
  functionNames: z.array(z.string()),
  sidecar: a2uiCatalogSidecarSchema,
  producible: z.boolean(),
  file: a2uiCatalogFileSchema.optional(),
  instructions: z.string().optional(),
});

export const a2uiCatalogRowListSchema = z.array(a2uiCatalogRowSchema);

/**
 * A live, per-session registry of resolved catalogs. Cached: a row is
 * resolved once and reused until `.reset()` is called (a session-scoped
 * concept, not a process-global cache — the caller owns the instance's
 * lifetime, e.g. one per session id via a memoizing hook).
 */
export class A2uiCatalogRegistry<T extends ComponentApi> {
  private readonly resolved = new Map<string, Catalog<T>>();
  private readonly reasons = new Map<string, A2uiCatalogUnresolvedReason>();

  public constructor(
    private readonly kernel: A2uiKernelRegistry<T>,
    private readonly wrapComponent: A2uiComponentWrapper<T> = identityWrapper,
  ) {}

  /** Resolve every row, replacing any previously resolved state. */
  public load(rows: readonly A2uiCatalogRow[]): void {
    this.resolved.clear();
    this.reasons.clear();
    for (const row of rows) {
      const result = buildA2uiCatalog(row, this.kernel, this.wrapComponent);
      if (result.ok) {
        this.resolved.set(row.catalogId, result.resolution.catalog);
      } else {
        this.reasons.set(row.catalogId, result.reason);
      }
    }
  }

  /** Resolve (or re-resolve) one row without touching the rest of the registry. */
  public upsert(row: A2uiCatalogRow): A2uiCatalogBuildResult<T> {
    const result = buildA2uiCatalog(row, this.kernel, this.wrapComponent);
    if (result.ok) {
      this.resolved.set(row.catalogId, result.resolution.catalog);
      this.reasons.delete(row.catalogId);
    } else {
      this.resolved.delete(row.catalogId);
      this.reasons.set(row.catalogId, result.reason);
    }
    return result;
  }

  /**
   * The registry route(s) this session's server answered with (a non-2xx
   * other than "row missing/unresolvable") are unavailable — an older
   * server, S6 adversarial review item 2a. Clears any resolved catalogs
   * (there is no row data to resolve from) and records the typed reason
   * against the well-known ids, so a surface that later names one still gets
   * `reasonFor()` instead of a bare "not found". Idempotent: calling this
   * again just re-records the same reason, never compounds.
   */
  public markRouteUnavailable(
    detail: string,
    wellKnownCatalogIds: readonly string[] = [A2UI_CLIO_WORKSPACE_CATALOG_ID, A2UI_BASIC_CATALOG_ID],
  ): void {
    this.resolved.clear();
    this.reasons.clear();
    for (const catalogId of wellKnownCatalogIds) {
      this.reasons.set(catalogId, { code: 'a2ui_catalog_route_unavailable', catalogId, detail });
    }
  }

  public get(catalogId: string): Catalog<T> | undefined {
    return this.resolved.get(catalogId);
  }

  public reasonFor(catalogId: string): A2uiCatalogUnresolvedReason | undefined {
    return this.reasons.get(catalogId);
  }

  /** Every resolved catalog, in insertion (preference) order. */
  public catalogs(): Catalog<T>[] {
    return [...this.resolved.values()];
  }

  /**
   * The ids a client should advertise in `a2uiClientCapabilities` —
   * `supportedCatalogIds()` per `docs/gact/a2ui-binding.md`: every catalog
   * whose components and functions all resolve, preference-ordered by the
   * caller's row order (session blueprint packs, then `clio-workspace`, then
   * `basic` — the server route already orders installed catalogs this way).
   */
  public supportedCatalogIds(): string[] {
    return [...this.resolved.keys()];
  }
}
