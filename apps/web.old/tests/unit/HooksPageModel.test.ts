import { describe, expect, it } from 'vitest';
import {
  HOOK_EVENTS,
  buildCreateHookBody,
  capabilityFlagBag,
  runtimeHookBackend,
  runtimeHookEvents,
} from '../../src/routes/discovery/HooksPageModel.js';

describe('HooksPageModel', () => {
  it('lists every supported declarative hook event', () => {
    expect(HOOK_EVENTS).toEqual([
      'pre_tool',
      'post_tool',
      'pre_message',
      'post_message',
      'semantic_event',
      'on_error',
    ]);
  });

  it('builds the create-hook wire body for command and url handlers', () => {
    expect(buildCreateHookBody('pre_message', 'command', ' echo hi ')).toEqual({
      event: 'pre_message',
      command: 'echo hi',
    });
    expect(buildCreateHookBody('post_tool', 'url', ' http://localhost/hook ')).toEqual({
      event: 'post_tool',
      url: 'http://localhost/hook',
    });
    expect(buildCreateHookBody('post_tool', 'url', '   ')).toBeNull();
  });

  it('reads runtime hook fields from nested or top-level capabilities', () => {
    const nested = capabilityFlagBag({
      capabilities: {
        x_clio_hook_backend: 'local_python',
        x_clio_hook_events: { pre_message: 2 },
      },
    });
    expect(runtimeHookBackend(nested)).toBe('local_python');
    expect(runtimeHookEvents(nested)).toEqual({ pre_message: 2 });

    const topLevel = capabilityFlagBag({ x_clio_hook_backend: 'none' });
    expect(runtimeHookBackend(topLevel)).toBe('none');
    expect(runtimeHookEvents(topLevel)).toEqual({});
    expect(runtimeHookBackend(undefined)).toBe('none');
  });
});
