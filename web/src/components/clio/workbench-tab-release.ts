import { useQueryClient, type Query } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { WorkbenchTab } from './workbench-shared';

/**
 * Reads that hold one opened file's, artifact's or resource's content. Once no
 * tab shows that target they are dropped at once instead of sitting in memory
 * for the cache's five-minute collection window.
 */
const TAB_CONTENT_NAMESPACES = new Set<string>([
  'artifact-detail',
  'artifact-image',
  'artifact-lineage',
  'artifact-mesh',
  'artifact-raster',
  'artifact-table-preview',
  'artifact-table-query',
  'artifact-text',
  'comment-crop',
  'comment-threads',
  'document-applications',
  'document-content',
  'document-manifest',
  'document-pdf',
  'hdf5-reference-rows',
  'latex-report',
  'workspace-file',
  'workspace-file-bytes',
  'workspace-file-integrity',
  'workspace-resource-derivative-content',
  'workspace-resource-derivatives',
  'workspace-resource-preview',
  'workspace-resource-structure',
  'workspace-resource-structure-node',
]);

/** What a tab shows: the strings its content reads are keyed by. */
function tabTargets(tab: WorkbenchTab): string[] {
  switch (tab.kind) {
    case 'files':
      return tab.path ? [tab.path, baseName(tab.path)] : [];
    case 'workspace-file':
      return [tab.path, baseName(tab.path)];
    case 'diff':
      return [tab.diff.path, baseName(tab.diff.path)];
    case 'artifact':
      return [tab.artifact.id, tab.artifact.name];
    case 'resource':
      return [tab.resource.id];
    default:
      return [];
  }
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function targetsOf(tabs: readonly WorkbenchTab[]): Set<string> {
  return new Set(tabs.flatMap(tabTargets).filter(Boolean));
}

/**
 * Closed tabs release their data: when a file, artifact or resource leaves every
 * tab (closed, replaced, or a Files preview going Back), its content reads that
 * nothing still renders are removed from the query cache.
 */
export function useReleaseClosedTabData(tabs: readonly WorkbenchTab[]): void {
  const queryClient = useQueryClient();
  const shown = useRef<Set<string>>(undefined);
  useEffect(() => {
    const previous = shown.current;
    const current = targetsOf(tabs);
    shown.current = current;
    if (!previous) return;
    const released = [...previous].filter((target) => !current.has(target));
    if (!released.length) return;
    // After this commit's unmounts, so the closed view's observers are gone.
    window.setTimeout(() => {
      const keyHas = (query: Query, targets: Iterable<string>) => {
        for (const target of targets) if (query.queryKey.includes(target)) return true;
        return false;
      };
      queryClient.removeQueries({
        predicate: (query) =>
          TAB_CONTENT_NAMESPACES.has(String(query.queryKey[0])) &&
          query.getObserversCount() === 0 &&
          keyHas(query, released) &&
          !keyHas(query, current),
      });
    }, 0);
  }, [queryClient, tabs]);
}
