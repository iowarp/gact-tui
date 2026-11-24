/**
 * Raw A2UI actions a kernel component holds outside the binder (a table's row
 * menu, a dialog's footer, a picker's onPick, a toast's Undo), resolved and
 * dispatched the way the binder does it for a Button at the moment of a click.
 */

export interface RawActionContext {
  dataContext: { resolveDynamicValue(value: unknown): unknown };
  dispatchAction(action: unknown): Promise<unknown> | void;
}

/** Resolves `{path}` and `{call}` bindings anywhere in an action's literal context. */
export function resolveRawValue(
  value: unknown,
  dataContext: RawActionContext['dataContext'],
): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if ('path' in value || 'call' in value) return dataContext.resolveDynamicValue(value);
  if (Array.isArray(value)) return value.map((entry) => resolveRawValue(entry, dataContext));
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, resolveRawValue(entry, dataContext)]),
  );
}

/** The resolved action, with `extra` merged into its event context. */
export function resolveRawAction(
  raw: unknown,
  dataContext: RawActionContext['dataContext'],
  extra: Record<string, unknown> = {},
): object | undefined {
  const resolved = resolveRawValue(raw, dataContext) as
    | { event?: { context?: object } }
    | undefined;
  if (!resolved || typeof resolved !== 'object') return undefined;
  return resolved.event
    ? {
        ...resolved,
        event: { ...resolved.event, context: { ...resolved.event.context, ...extra } },
      }
    : resolved;
}

/**
 * Sends a raw action with `extra` merged into its event context. The promise
 * settles once the surface's owner has answered (or at once when there is none).
 */
export function fireRawAction(
  context: RawActionContext,
  raw: unknown,
  extra: Record<string, unknown> = {},
): Promise<unknown> {
  const action = resolveRawAction(raw, context.dataContext, extra);
  if (!action) return Promise.resolve();
  return Promise.resolve(context.dispatchAction(action));
}
