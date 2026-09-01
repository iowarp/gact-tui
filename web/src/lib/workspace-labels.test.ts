import type { Workspace } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { workspaceLabels, workspaceLabelText } from './workspace-labels';

function workspace(id: string, path: string, connection = 'local'): Workspace {
  return {
    id,
    name: 'campaign',
    display_name: 'campaign',
    path,
    connection_id: connection,
    pinned: false,
  };
}

describe('workspaceLabels', () => {
  it('uses the server display name without exposing a unique full path', () => {
    const labels = workspaceLabels([workspace('ws_1', 'D:\\science\\flat-NDP')]);

    expect(labels.get('ws_1')).toEqual({ name: 'campaign', qualifiers: [] });
    expect(workspaceLabelText(labels.get('ws_1')!)).not.toContain('D:\\science');
  });

  it('disambiguates duplicate names with the shortest useful parent', () => {
    const labels = workspaceLabels([
      workspace('ws_1', 'D:\\science\\flat-NDP'),
      workspace('ws_2', 'D:\\campaigns\\flat-NDP'),
    ]);

    expect(labels.get('ws_1')).toEqual({ name: 'campaign', qualifiers: ['science'] });
    expect(labels.get('ws_2')).toEqual({ name: 'campaign', qualifiers: ['campaigns'] });
    expect(
      [...labels.values()].every((label) => !workspaceLabelText(label).includes('D:\\')),
    ).toBe(true);
  });
});
