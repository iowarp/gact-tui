/**
 * Type model for inspector bindings: binding options, session bindings, and
 * packaged provenance shapes.
 */
export interface BindingOption {
  id: string;
  label: string;
  description?: string;
}

export interface SessionBindings {
  blueprint_id: string | null;
  pack_id: string | null;
  availableBlueprints: BindingOption[];
  availablePacks: BindingOption[];
  /** clio #479/#482 (gap-07): read-only binding provenance. */
  workspace_id?: string;
  blueprint_path?: string;
  overlay?: Record<string, unknown>;
  activation?: Record<string, unknown>;
  /** A7: packaged-component provenance + trust. */
  packaged?: PackagedProvenance;
}

/** A7: read-only packaged-component provenance from the bound blueprint body. */
export interface PackagedProvenance {
  id?: string;
  title?: string;
  version?: string;
  scope?: string;
  enabled?: boolean;
  validation_errors?: string[];
  install?: Record<string, unknown>;
  bootstrap?: Record<string, unknown>;
}

export function selectedBindingDescription(
  id: string | null,
  options: readonly BindingOption[],
): string | undefined {
  if (!id) return undefined;
  return options.find((option) => option.id === id)?.description;
}

export function hasBindingProvenance(bindings: SessionBindings): boolean {
  return (
    !!bindings.workspace_id ||
    !!bindings.blueprint_path ||
    Object.keys(bindings.overlay ?? {}).length > 0 ||
    Object.keys(bindings.activation ?? {}).length > 0
  );
}

export function formatBindingValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function hasPackagedProvenance(p: PackagedProvenance): boolean {
  return (
    p.enabled !== undefined ||
    !!p.version ||
    !!p.scope ||
    Object.keys(p.install ?? {}).length > 0 ||
    Object.keys(p.bootstrap ?? {}).length > 0 ||
    (p.validation_errors?.length ?? 0) > 0
  );
}
