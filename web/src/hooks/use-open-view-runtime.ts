import type { Artifact, ClioRepository } from '@clio/core/v3';
import { useEffect } from 'react';
import { toast } from 'sonner';
import type { ClioWorkbenchOpenRequest } from '@/components/clio/workbench';
import {
  activeA2uiOpenViewRuntime,
  requestViewSelection,
  setActiveA2uiOpenViewRuntime,
  useStudyViewFocus,
  type A2uiOpenViewRuntime,
  type ViewSelection,
} from '@/lib/a2ui/open-view';
import { artifactDetailVersionEntity } from '@/lib/session-artifacts';

type OpenViewRepository = Pick<ClioRepository, 'artifactDetail' | 'dashboard' | 'scienceLog'>;

/** Open a study view: the Science log tab, in Views, on that view. */
async function openStudyView(
  repository: OpenViewRepository,
  sessionId: string,
  entry: string,
  selection: ViewSelection | undefined,
  reveal: (request: ClioWorkbenchOpenRequest) => void,
): Promise<void> {
  const study = await repository.scienceLog(sessionId);
  const view = study.in_study ? study.views.find((row) => row.entry === entry) : undefined;
  if (!view) {
    toast.error("That view is not one of this conversation's study views.");
    return;
  }
  if (selection) requestViewSelection(view.session_id, view.surface_id, selection);
  useStudyViewFocus.getState().focus(entry);
  reveal({ kind: 'science-log' });
}

/** Open a saved dashboard of any conversation of the workspace, as published ones open. */
async function openDashboard(
  repository: OpenViewRepository,
  artifactId: string,
  selection: ViewSelection | undefined,
  openArtifact: (artifact: Artifact) => void,
): Promise<void> {
  const detail = await repository.artifactDetail(artifactId);
  const owner = detail.resolved.producer.session_id;
  if (detail.resolved.producer.designation !== 'dashboard-report' || typeof owner !== 'string') {
    toast.error('That artifact is not a saved dashboard.');
    return;
  }
  if (selection) {
    const report = await repository.dashboard(owner, artifactId);
    requestViewSelection(owner, report.surface.id, selection);
  }
  openArtifact(artifactDetailVersionEntity(detail, artifactId, owner));
}

/**
 * Registers the `openView` catalog function's runtime for the viewed conversation,
 * for as long as the workspace page that calls it stays mounted.
 */
export function useOpenViewRuntime(
  repository: OpenViewRepository,
  sessionId: string,
  openArtifact: (artifact: Artifact) => void,
  reveal: (request: ClioWorkbenchOpenRequest) => void,
): void {
  useEffect(() => {
    const runtime: A2uiOpenViewRuntime = {
      openView: (view, selection) => {
        const artifactId = /^artifact:\/\/(artifact_[A-Za-z0-9_-]+)$/u.exec(view)?.[1];
        const opened = artifactId
          ? openDashboard(repository, artifactId, selection, openArtifact)
          : openStudyView(repository, sessionId, view, selection, reveal);
        opened.catch((error: unknown) =>
          toast.error(
            `The view could not be opened: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      },
    };
    setActiveA2uiOpenViewRuntime(runtime);
    return () => {
      if (activeA2uiOpenViewRuntime() === runtime) setActiveA2uiOpenViewRuntime(undefined);
    };
  }, [repository, sessionId, openArtifact, reveal]);
}
