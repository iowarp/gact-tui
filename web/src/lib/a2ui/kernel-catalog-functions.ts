import {
  BASIC_FUNCTIONS,
  OpenUrlApi,
  createFunctionImplementation,
} from '@a2ui/web_core/v0_9';
import type { FunctionImplementation } from '@a2ui/web_core/v0_9';
import { checkA2uiUrlScheme } from '@clio/core/v3';
import { z } from 'zod';
import { openExternalUrl } from '@/tauri/external-url';
import { activeA2uiOpenArtifactRuntime } from './kernel-runtime';

/**
 * Catalog FUNCTIONS the kernel renderer implements — split out of
 * `kernel-catalog.tsx` (which owns the JSX component implementations) purely
 * for file size (the 800-line CI ratchet, `scripts/check_frontend_file_size.mjs`).
 */

const openArtifactFunction = createFunctionImplementation(
  {
    name: 'openArtifact',
    returnType: 'void',
    schema: z.object({ uri: z.string() }),
  },
  ({ uri }, context) => {
    // owner decision 11: the same URL-scheme allowlist the kernel media
    // components enforce at render, applied here before anything opens.
    const guard = checkA2uiUrlScheme(uri);
    if (!guard.ok) {
      void context.surface.dispatchError({ code: 'ARTIFACT_UNAVAILABLE', message: guard.reason });
      return;
    }
    const runtime = activeA2uiOpenArtifactRuntime();
    const artifact = runtime?.findArtifact(uri);
    if (!runtime || !artifact) {
      void context.surface.dispatchError({
        code: 'ARTIFACT_UNAVAILABLE',
        message: 'The requested artifact is not available in this session.',
      });
      return;
    }
    runtime.onOpenArtifact(artifact);
  },
);

/**
 * Overrides the official Basic catalog's `openUrl` (`OpenUrlImplementation`,
 * `@a2ui/web_core`): the library allows both `http:` and `https:` (S8 known
 * gap, `contract/SPEC.md`), but owner decision 11's allowlist
 * (`A2UI_ALLOWED_URL_SCHEMES`) excludes plain `http:`. `KERNEL_FUNCTIONS` is
 * keyed by name, so listing this AFTER `...BASIC_FUNCTIONS` replaces the
 * library's entry rather than adding a second `openUrl`. A blocked scheme
 * reports `VALIDATION_FAILED` (the wire-reportable code, unlike
 * `openArtifact`'s local-only `ARTIFACT_UNAVAILABLE`) since this mirrors the
 * render-time media guard's own resolved-value check, and never calls
 * `window.open` — the desktop shell's opener plugin doesn't intercept a raw
 * `window.open()` call (only anchor clicks), so it just silently did nothing
 * there; `openExternalUrl` is the one path every external open goes through.
 * A failed open reuses `VALIDATION_FAILED` too, since that is currently the
 * only wire-reportable error code the client-to-server schema defines.
 */
const openUrlFunction = createFunctionImplementation(OpenUrlApi, (args, context) => {
  const guard = checkA2uiUrlScheme(args.url);
  if (!guard.ok) {
    void context.surface.dispatchError({ code: 'VALIDATION_FAILED', message: guard.reason });
    return;
  }
  openExternalUrl(args.url).catch((error: unknown) => {
    void context.surface.dispatchError({
      code: 'VALIDATION_FAILED',
      message: error instanceof Error ? error.message : `Could not open ${args.url}.`,
    });
  });
});

const selectDataFunction = createFunctionImplementation(
  {
    name: 'selectData',
    returnType: 'void',
    schema: z.object({ rowIds: z.array(z.string()), surfaceId: z.string().optional() }),
  },
  () => {
    // No workspace-level row-selection state exists to update yet; the
    // function still resolves locally and never reaches the server, which is
    // the feature this replaces (`data.select` used to be a LOCAL_ACTIONS
    // no-op too — see docs/design/a2ui-compat-campaign-2026-09.md S6).
  },
);

const focusWorkflowFunction = createFunctionImplementation(
  {
    name: 'focusWorkflow',
    returnType: 'void',
    schema: z.object({ stepId: z.string() }),
  },
  () => {
    // Highlighting is driven by the bound `selected` data-model path today
    // (see the `Workflow` component in kernel-catalog.tsx); this function
    // resolves locally, matching the old `workflow.focus` local action's scope.
  },
);

const KERNEL_FUNCTION_LIST: FunctionImplementation[] = [
  ...BASIC_FUNCTIONS,
  openUrlFunction,
  openArtifactFunction,
  selectDataFunction,
  focusWorkflowFunction,
];

/** Every kernel function implementation this renderer has, keyed by name. */
export const KERNEL_FUNCTIONS: ReadonlyMap<string, FunctionImplementation> = new Map(
  KERNEL_FUNCTION_LIST.map((fn) => [fn.name, fn]),
);
