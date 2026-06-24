import { beforeEach, describe, expect, it } from 'vitest';
import {
  capabilityActionItems,
  detachedSessionItems,
  permissionModeItems,
  pluginPaletteItems,
  sessionJumpItems,
  staticActionItems,
} from '../../src/routes/chatPaletteItemBuilders.js';
import { PLUGINS_KEY } from '../../src/plugins.js';

describe('chatPaletteItemBuilders', () => {
  beforeEach(() => {
    localStorage.removeItem(PLUGINS_KEY);
  });

  it('builds session and detached-session jump items', () => {
    expect(
      sessionJumpItems([
        { id: 's1', title: 'Alpha', status: 'idle', updatedAt: '', workspace: 'repo-a' },
        { id: 's2', title: 'Beta', status: 'idle', updatedAt: '' },
      ]),
    ).toMatchObject([
      { id: 'jump:s1', trigger: '> Alpha', description: 'Switch to session in repo-a' },
      { id: 'jump:s2', trigger: '> Beta', description: 'Switch to session' },
    ]);

    expect(
      detachedSessionItems(
        [
          { id: 's1', title: 'Already attached', detachedAt: Date.now() },
          { id: 's3', title: 'Detached', detachedAt: Date.now() },
        ],
        [{ id: 's1', title: 'Alpha', status: 'idle', updatedAt: '' }],
      ).map((item) => item.id),
    ).toEqual(['detached:s3']);
  });

  it('omits the current permission mode and gates capability actions', () => {
    expect(permissionModeItems('ask').map((item) => item.id)).not.toContain('perm:ask');
    expect(capabilityActionItems({}).map((item) => item.id)).toEqual([]);
    expect(
      capabilityActionItems({ session_summary: true, skills_extraction: true }).map(
        (item) => item.id,
      ),
    ).toEqual(['summarize-with-instructions', 'extract-agent', 'summarize']);
  });

  it('builds plugin and static action items', () => {
    localStorage.setItem(
      PLUGINS_KEY,
      JSON.stringify([
        {
          id: 'lint',
          name: 'Lint',
          path: 'lint',
          args: [],
          trigger: '/lint',
          description: 'Run lint',
        },
      ]),
    );

    expect(pluginPaletteItems()).toMatchObject([
      { id: 'plugin:lint', trigger: '/lint', description: 'Run lint' },
    ]);
    expect(staticActionItems('session-1', 'summary')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'copy-session-id',
          description: 'Copy session-1',
        }),
        expect.objectContaining({
          id: 'cycle-density',
          description: 'Toggle transcript density (now: summary)',
        }),
      ]),
    );
  });
});
