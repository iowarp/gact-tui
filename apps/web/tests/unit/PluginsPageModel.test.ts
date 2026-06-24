import type { PluginDef, PluginInvocationResult } from '../../src/plugins.js';
import { describe, expect, it } from 'vitest';
import {
  findEditingPlugin,
  pluginPageSubtitle,
  pluginRunFailureToast,
  pluginRunResultToast,
  pluginSaveToast,
  removePluginPrompt,
} from '../../src/routes/discovery/PluginsPageModel.js';

const plugin: PluginDef = {
  id: 'lint-1',
  name: 'lint',
  path: '/usr/bin/eslint',
  args: ['--fix'],
};

describe('PluginsPageModel', () => {
  it('describes desktop and web plugin execution modes', () => {
    expect(pluginPageSubtitle(true, 'CLIO')).toContain('desktop shell can run');
    expect(pluginPageSubtitle(false, 'CLIO')).toBe(
      'Registry view — execution needs the CLIO Desktop shell, not the pure-web build.',
    );
  });

  it('finds the plugin currently being edited', () => {
    expect(findEditingPlugin([plugin], 'lint-1')).toBe(plugin);
    expect(findEditingPlugin([plugin], 'missing')).toBeNull();
    expect(findEditingPlugin([plugin], null)).toBeNull();
  });

  it('builds save and remove copy from the selected plugin', () => {
    expect(pluginSaveToast(plugin, false)).toMatchObject({
      tone: 'success',
      title: 'Plugin registered',
      body: 'lint',
    });
    expect(pluginSaveToast(plugin, true).title).toBe('Plugin updated');
    expect(removePluginPrompt(plugin)).toBe(
      'Unregister plugin "lint"? The binary is not touched.',
    );
  });

  it('builds success, timeout, and error run-result toasts', () => {
    const ok: PluginInvocationResult = {
      status: 0,
      stdout: 'done',
      stderr: '',
      duration_ms: 12,
      timed_out: false,
    };
    expect(pluginRunResultToast(plugin, ok)).toMatchObject({
      tone: 'success',
      title: 'lint → exit 0 (12ms)',
      body: 'done',
    });

    expect(
      pluginRunResultToast(plugin, { ...ok, status: 1, stdout: '', stderr: 'bad' }),
    ).toMatchObject({
      tone: 'error',
      title: 'lint → exit 1 (12ms)',
      body: 'bad',
    });

    expect(pluginRunResultToast(plugin, { ...ok, timed_out: true })).toMatchObject({
      tone: 'warn',
      title: 'lint timed out after 12ms',
    });
  });

  it('truncates long plugin output in result toasts', () => {
    const result: PluginInvocationResult = {
      status: 0,
      stdout: 'x'.repeat(300),
      stderr: '',
      duration_ms: 12,
      timed_out: false,
    };
    expect(pluginRunResultToast(plugin, result).body).toHaveLength(240);
  });

  it('formats plugin invocation failures', () => {
    expect(pluginRunFailureToast(new Error('missing binary'))).toMatchObject({
      tone: 'error',
      title: 'Plugin failed',
      body: 'missing binary',
      duration: 5000,
    });
    expect(pluginRunFailureToast('no shell').body).toBe('no shell');
  });
});
