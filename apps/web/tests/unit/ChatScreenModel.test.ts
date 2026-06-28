import { describe, expect, it } from 'vitest';
import type { Capabilities } from '@clio/core';
import { chatBackendFeatureGates, fixtureNameFromUrl } from '../../src/routes/ChatScreenModel.js';

function capabilities(flags: Capabilities['capabilities']): Capabilities {
  return {
    contract_version: '0.2',
    backend: {
      name: 'fixture',
      version: '0.0.0',
      vendor: 'test',
    },
    capabilities: flags,
    transports: {
      events_sse: true,
      events_websocket: false,
    },
    auth: {
      schemes: [],
      current: 'none',
    },
    extensions: [],
  };
}

describe('ChatScreenModel', () => {
  it('reads fixture names from visual/test URLs defensively', () => {
    expect(fixtureNameFromUrl('http://localhost:5173/?route=chat&fixture=earthscope')).toBe(
      'earthscope',
    );
    expect(fixtureNameFromUrl('http://localhost:5173/?route=chat')).toBeNull();
    expect(fixtureNameFromUrl('not a url')).toBeNull();
  });

  it('centralizes backend feature gates from capabilities', () => {
    expect(
      chatBackendFeatureGates(
        capabilities({
          voice: true,
          files: true,
          scheduled_sessions: true,
          x_clio_semantic_events: true,
        }),
      ),
    ).toEqual({
      capsFlags: {
        voice: true,
        files: true,
        scheduled_sessions: true,
        x_clio_semantic_events: true,
      },
      voiceCapable: true,
      contextFilePreviewEnabled: true,
      scheduledSessionsEnabled: true,
      semanticEventsEnabled: true,
    });
  });

  it('preserves legacy context-file preview behavior unless files are explicitly disabled', () => {
    expect(chatBackendFeatureGates(capabilities({})).contextFilePreviewEnabled).toBe(true);
    expect(chatBackendFeatureGates(capabilities({ files: false })).contextFilePreviewEnabled).toBe(
      false,
    );
    expect(chatBackendFeatureGates(undefined)).toMatchObject({
      voiceCapable: false,
      contextFilePreviewEnabled: true,
      scheduledSessionsEnabled: false,
      semanticEventsEnabled: false,
    });
  });
});
