import type { ActivityItem } from './workbench-activity-model';
import type { WorkbenchTab } from './workbench-shared';

/** The tab that shows one Activity row's details. */
export function activityTab(
  item: Pick<ActivityItem, 'id' | 'kind' | 'name'>,
  sessionId: string,
  workspaceId: string,
): Extract<WorkbenchTab, { kind: 'activity' }> {
  return {
    id: `activity:${sessionId}:${item.id}`,
    kind: 'activity',
    label: item.name,
    itemId: item.id,
    activityKind: item.kind,
    sessionId,
    workspaceId,
  };
}
