import { useMemo } from 'react';
import { useLiveStore } from '@/store/live-store';

/**
 * The live store's normalized entities the workspace reads, each selected on
 * its own so an unrelated entity kind changing does not rebuild the set.
 */
export function useLiveEntities() {
  const entityArtifacts = useLiveStore((state) => state.entities.artifacts);
  const entityContext = useLiveStore((state) => state.entities.context);
  const entityRuns = useLiveStore((state) => state.entities.runs);
  const entitySessions = useLiveStore((state) => state.entities.sessions);
  const entitySurfaces = useLiveStore((state) => state.entities.surfaces);
  const entityActionLifecycles = useLiveStore((state) => state.entities.a2ui_action_lifecycles);
  const entitySubagents = useLiveStore((state) => state.entities.subagents);
  const entityTasks = useLiveStore((state) => state.entities.tasks);
  const entityTools = useLiveStore((state) => state.entities.tools);
  const entityWorkspaces = useLiveStore((state) => state.entities.workspaces);
  return useMemo(
    () => ({
      artifacts: entityArtifacts,
      context: entityContext,
      runs: entityRuns,
      sessions: entitySessions,
      surfaces: entitySurfaces,
      a2ui_action_lifecycles: entityActionLifecycles,
      subagents: entitySubagents,
      tasks: entityTasks,
      tools: entityTools,
      workspaces: entityWorkspaces,
    }),
    [
      entityArtifacts,
      entityContext,
      entityRuns,
      entitySessions,
      entitySurfaces,
      entityActionLifecycles,
      entitySubagents,
      entityTasks,
      entityTools,
      entityWorkspaces,
    ],
  );
}
