import type { CommonSchemas } from '@a2ui/web_core/v0_9';
import type { z } from 'zod';

/**
 * Split out of `kernel-catalog.tsx` (not inlined there, and not exported
 * from it) purely so this guard can be unit-tested directly:
 * `kernel-catalog.tsx` also re-exports `A2uiSurface`, and oxlint's
 * `react(only-export-components)` rule (fast refresh) refuses a second,
 * non-component export from a file that already exports something
 * component-shaped. A plain function has nowhere else to live without
 * tripping that, so it gets its own owner module instead of an inline
 * disable comment.
 *
 * `action`'s declared type is `CommonSchemas.Action`'s pre-binding JSON
 * shape (`{ event: {...} }` or a function-call union) -- the payload the
 * agent sends. By render time the generic binder has already walked the
 * `cardAction` array in `kernel-catalog.tsx` and resolved each `action`
 * field into a zero-arg closure (`GenericBinder.bindAction`,
 * `@a2ui/web_core`), the same transformation a component's own top-level
 * `action` prop gets (which is why `Callout`/`Diff` in `kernel-catalog.tsx`
 * call `props.action?.()` directly, not `dispatchAction(props.action)` --
 * #1549 G1). `@a2ui/react`'s `ResolveA2uiProps` type utility just doesn't
 * propagate that transformation through a field nested inside `z.array(...)`,
 * so the static type here still names the untransformed shape; this
 * reflects the real, runtime-confirmed contract instead of re-introducing
 * G1's bug.
 *
 * Adversarial review of #514, item 5: that runtime contract holds for every
 * literal `actions` array under the kernel's `cardAction` schema
 * (`CommonSchemas.Action` carries the binder's own
 * `REF:common_types.json#/$defs/Action` marker, so `scrapeSchemaBehavior`
 * always classifies the field as `ACTION` and wraps it, whichever union
 * member the agent sent) -- but trusting it blindly at the one call site
 * that matters, a user click, means any future binder change or malformed
 * payload that breaks the contract crashes the whole surface instead of
 * just this button. Guard it: a non-function reports a local resolution
 * problem the same way `kernel-catalog-functions.ts`'s
 * `openArtifact`/`openUrl` guards do (`surface.dispatchError` with a code
 * other than `VALIDATION_FAILED`, which `a2ui-surface.tsx`'s
 * `handleValidationFailed` routes straight to the visible `localNotice`
 * card, never posted to the server).
 *
 * The real binder contract above means a non-function value can't be
 * produced through a live `MessageProcessor` render without also breaking
 * schema validation first, so the only honest way to exercise the
 * defensive branch is to call this function the way the click handler does
 * -- see `kernel-catalog.test.tsx`.
 */
export interface CardActionDispatchContext {
  readonly dataContext: {
    readonly surface: {
      dispatchError(error: { code: string; message: string }): Promise<void>;
    };
  };
}

export function resolvedCardAction(
  action: z.infer<typeof CommonSchemas.Action>,
  context: CardActionDispatchContext,
): () => void {
  if (typeof action === 'function') {
    return action as unknown as () => void;
  }
  return () => {
    void context.dataContext.surface.dispatchError({
      code: 'ACTION_UNAVAILABLE',
      message: 'This action is not available right now.',
    });
  };
}
