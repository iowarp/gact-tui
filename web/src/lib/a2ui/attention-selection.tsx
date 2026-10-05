import type { A2UISurface, ContentSelection } from '@clio/core/v3';
import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { structuredAttentionSelection } from './attention-selection-coordinates';

type Region = Extract<ContentSelection['selection'], { kind?: 'image_region' }>;
interface SurfaceAttention {
  structured: (componentId: string | undefined, query: unknown, label: string) => Promise<void>;
  image: (componentId: string | undefined, source: string, region: Region) => Promise<void>;
}
// oxlint-disable-next-line react/only-export-components
export const SurfaceAttentionContext = createContext<SurfaceAttention | undefined>(undefined);

/** Only recorded transcript surfaces can produce a revision-bound attention reference. */
export function SurfaceAttentionProvider({
  surface,
  children,
}: {
  surface: A2UISurface;
  children: ReactNode;
}) {
  const registry = useContext(SelectionActionsContext);
  return registry && surface.part_id ? (
    <BoundSurface surface={surface}>{children}</BoundSurface>
  ) : (
    children
  );
}

function BoundSurface({ surface, children }: { surface: A2UISurface; children: ReactNode }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const registry = useContext(SelectionActionsContext);
  const scope = JSON.stringify([
    connectionScope(settings),
    surface.session_id,
    surface.id,
    surface.revision,
  ]);
  const lifetime = useRef<AbortController | undefined>(undefined);
  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, [scope]);
  const value = useMemo<SurfaceAttention>(() => {
    async function add(
      componentId: string | undefined,
      source: string,
      selection: Extract<ContentSelection['selection'], { kind?: 'image_region' | 'structured' }>,
      label: string,
    ) {
      if (!componentId) throw new Error('This view has no stable component identity.');
      const signal = lifetime.current?.signal;
      const reference = await repository.attentionSurfaceSelection(
        surface.session_id,
        surface.id,
        {
          revision: surface.revision,
          component_id: componentId,
          source_ref: source,
          selection,
        },
        signal,
      );
      if (signal?.aborted)
        throw new Error('The connection or surface changed. Select its current view again.');
      if (
        reference.session_id !== surface.session_id ||
        reference.part_id !== surface.part_id ||
        reference.surface?.surface_id !== surface.id ||
        reference.surface?.component_id !== componentId ||
        reference.surface?.revision !== surface.revision
      ) {
        throw new Error('The returned reference belongs to another transcript part.');
      }
      const target = { kind: 'transcript-content' as const, reference, text: label };
      const action = registry?.actionsFor(target).find((action) => action.id === 'attention-set');
      if (!action || action.run(target) === false)
        throw new Error('This selection could not be added to the active attention set.');
    }
    return {
      structured: async (componentId, query, label) => {
        if (!componentId) throw new Error('This view has no stable component identity.');
        const selection = structuredAttentionSelection(surface.id, componentId, query);
        await add(componentId, selection.source_ref, selection, label);
      },
      image: (componentId, source, region) =>
        add(componentId, source, region, 'Selected image region'),
    };
  }, [
    registry,
    repository,
    surface.id,
    surface.session_id,
    surface.part_id,
    surface.revision,
  ]);
  return (
    <SurfaceAttentionContext.Provider value={value}>{children}</SurfaceAttentionContext.Provider>
  );
}
