import type { PluginDef } from '../../src/plugins.js';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_PLUGIN_FORM,
  buildPluginDef,
  pluginArgsFromText,
  pluginFormValuesFromDef,
  pluginIdFromName,
} from '../../src/routes/discovery/PluginRegistryPanelsModel.js';

describe('PluginRegistryPanelsModel', () => {
  it('hydrates empty and editing form values', () => {
    expect(pluginFormValuesFromDef(null)).toEqual(EMPTY_PLUGIN_FORM);

    const def: PluginDef = {
      id: 'plugin_lint',
      name: 'lint',
      path: '/usr/bin/eslint',
      args: ['--fix', '--format=json'],
      trigger: '/lint',
      description: 'run lint',
      timeoutMs: 2500,
    };
    expect(pluginFormValuesFromDef(def)).toEqual({
      name: 'lint',
      path: '/usr/bin/eslint',
      argsText: '--fix\n--format=json',
      trigger: '/lint',
      description: 'run lint',
      timeoutMs: '2500',
    });
  });

  it('normalizes args and generated ids', () => {
    expect(pluginArgsFromText(' --fix \n\n --format=json ')).toEqual([
      '--fix',
      '--format=json',
    ]);
    expect(pluginIdFromName('Lint Repo!', 'abc123')).toBe('lint-repo--abc123');
  });

  it('builds a plugin definition with trimmed optional fields', () => {
    expect(
      buildPluginDef(
        null,
        {
          name: ' lint ',
          path: ' /usr/bin/eslint ',
          argsText: ' --fix \n --format=json ',
          trigger: ' /lint ',
          description: ' repo lint ',
          timeoutMs: '3000',
        },
        'seed',
      ),
    ).toEqual({
      id: 'lint-seed',
      name: 'lint',
      path: '/usr/bin/eslint',
      args: ['--fix', '--format=json'],
      trigger: '/lint',
      description: 'repo lint',
      timeoutMs: 3000,
    });

    expect(
      buildPluginDef(
        {
          id: 'plugin_existing',
          name: 'old',
          path: 'old',
          args: [],
        },
        {
          name: ' updated ',
          path: ' /bin/true ',
          argsText: '',
          trigger: '',
          description: '',
          timeoutMs: '0',
        },
        'ignored',
      ),
    ).toEqual({
      id: 'plugin_existing',
      name: 'updated',
      path: '/bin/true',
      args: [],
    });

    expect(buildPluginDef(null, { ...EMPTY_PLUGIN_FORM, path: '/bin/true' }, 'seed')).toBeNull();
  });
});
