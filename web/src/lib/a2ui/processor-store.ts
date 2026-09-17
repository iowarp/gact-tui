import {
  A2uiCatalogRegistry,
  buildA2uiClientCapabilities,
  setA2uiClientMetadataProvider,
} from '@clio/core/v3';
import type { A2UISurface } from '@clio/core/v3';
import {
  MessageProcessor,
  type A2uiClientAction,
  type A2uiMessage,
  type Catalog,
  type SurfaceModel,
} from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';
import { wrapKernelComponentWithPresets } from './kernel-presets';

const KERNEL = { components: KERNEL_COMPONENTS, functions: KERNEL_FUNCTIONS };

/**
 * Resolves this session's producible catalogs against the kernel and
 * advertises `supportedCatalogIds` for every repository door
 * (`packages/core/src/v3/a2ui/client-metadata.ts`) for as long as a surface
 * from this session is mounted.
 */
export function useA2uiCatalogRegistry(sessionId: string): {
  registry: A2uiCatalogRegistry<ReactComponentImplementation>;
  catalogs: Catalog<ReactComponentImplementation>[];
  isLoading: boolean;
} {
  const repository = useRepository();
  // Lazy `useState` initializer: created once, never touched again except
  // through its own methods (never reassigned), so this is not a "ref read
  // during render" — it is ordinary state identity.
  const [registry] = useState(
    () => new A2uiCatalogRegistry<ReactComponentImplementation>(KERNEL, wrapKernelComponentWithPresets),
  );

  const { data: rows, isLoading } = useQuery({
    queryKey: ['a2ui-catalogs', sessionId],
    queryFn: ({ signal }) => repository.a2uiCatalogs(sessionId, signal),
    enabled: Boolean(sessionId),
    staleTime: 60_000,
  });

  const catalogs = useMemo(() => {
    registry.load(rows ?? []);
    return registry.catalogs();
  }, [registry, rows]);

  useLayoutEffect(() => {
    const supportedCatalogIds = registry.supportedCatalogIds();
    setA2uiClientMetadataProvider((requestedSessionId) =>
      requestedSessionId === sessionId
        ? { a2uiClientCapabilities: buildA2uiClientCapabilities(supportedCatalogIds) }
        : {},
    );
    return () => setA2uiClientMetadataProvider(undefined);
  }, [sessionId, registry, catalogs]);

  return { registry, catalogs, isLoading: isLoading && !rows };
}

export interface A2uiProcessorFailure {
  code: 'processor_error';
  message: string;
}

export interface A2uiProcessorResult {
  model?: SurfaceModel<ReactComponentImplementation>;
  failure?: A2uiProcessorFailure;
}

interface ProcessorEntry {
  processor: MessageProcessor<ReactComponentImplementation>;
  catalogsKey: string;
  appliedCount: number;
  errorSubscribed: boolean;
  errorUnsubscribe: () => void;
}

const EMPTY_RESULT: A2uiProcessorResult = {};

/**
 * One `MessageProcessor` per surface id, incremental (`processMessages` runs
 * only on messages beyond the last applied index) and persistent across
 * revisions — the caller no longer remounts on `surface.revision`
 * (`docs/design/a2ui-compat-campaign-2026-09.md` S6 deletion: the
 * revision-keyed remount that wiped unsubmitted form state). `onError` is
 * wired exactly once per processor to `onValidationFailed`, so a component's
 * `surface.dispatchError` (the URL-scheme guard, `checks`, or any other
 * client-detected violation) reaches the server the same way a processor
 * throw during `processMessages` reaches the UI: one pipe, no duplicate
 * wiring.
 *
 * All mutable state lives behind a ref and is only ever touched inside
 * `useLayoutEffect` (never during the render body itself) so the surface's
 * own commit still lands before paint — no visible flash — while keeping
 * render pure.
 */
export function useA2uiSurfaceModel(
  surface: A2UISurface,
  catalogs: Catalog<ReactComponentImplementation>[],
  catalogsLoading: boolean,
  handleAction: (action: A2uiClientAction) => void | Promise<void>,
  onValidationFailed: (error: { code: string; path?: string; message: string }) => void,
): A2uiProcessorResult {
  const entryRef = useRef<ProcessorEntry | undefined>(undefined);
  const [result, setResult] = useState<A2uiProcessorResult>(EMPTY_RESULT);
  const catalogIds = catalogs.map((catalog) => catalog.id).join(',');

  useLayoutEffect(() => {
    return () => {
      entryRef.current?.errorUnsubscribe();
      entryRef.current = undefined;
    };
    // Torn down only when the surface identity itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface.id]);

  useLayoutEffect(() => {
    // The registry has not resolved this session's catalogs yet — an empty
    // `catalogs` array right now says nothing about whether the surface's own
    // catalogId will resolve, so no attempt (and no failure) is recorded
    // until the first real answer arrives.
    if (catalogsLoading) {
      setResult(EMPTY_RESULT);
      return;
    }

    if (!entryRef.current || entryRef.current.catalogsKey !== catalogIds) {
      entryRef.current?.errorUnsubscribe();
      const processor = new MessageProcessor<ReactComponentImplementation>(catalogs, handleAction, {
        version: `v${surface.protocol_version}`,
      });
      entryRef.current = {
        processor,
        catalogsKey: catalogIds,
        appliedCount: 0,
        errorSubscribed: false,
        errorUnsubscribe: () => undefined,
      };
    }
    const entry = entryRef.current;

    try {
      const pending = surface.messages.slice(entry.appliedCount) as A2uiMessage[];
      if (pending.length > 0) {
        entry.processor.processMessages(pending);
        entry.appliedCount = surface.messages.length;
      }
    } catch (error) {
      setResult({
        failure: {
          code: 'processor_error',
          message:
            error instanceof Error ? error.message : 'The interactive surface could not be validated.',
        },
      });
      return;
    }

    const model = entry.processor.model.getSurface(surface.id);
    if (model && !entry.errorSubscribed) {
      entry.errorSubscribed = true;
      const subscription = model.onError.subscribe(
        (error: { code?: string; path?: string; message?: string }) => {
          onValidationFailed({
            code: typeof error.code === 'string' ? error.code : 'VALIDATION_FAILED',
            path: typeof error.path === 'string' ? error.path : undefined,
            message:
              typeof error.message === 'string'
                ? error.message
                : 'The interactive surface reported an error.',
          });
        },
      );
      entry.errorUnsubscribe = () => subscription.unsubscribe();
    }

    setResult({ model });
    // `surface` (not just its id/messages) intentionally drives this effect:
    // a new message array reference is the signal that there is pending work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, catalogs, catalogIds, catalogsLoading, handleAction, onValidationFailed]);

  return result;
}
