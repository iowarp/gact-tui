/**
 * Pure ChatScreen helpers: derives backend feature gates from capabilities
 * ({@link chatBackendFeatureGates}) and reads the `?fixture=` URL param.
 */
import type { Capabilities, CapabilityFlags } from '@clio/core';

export interface ChatBackendFeatureGates {
  capsFlags?: CapabilityFlags;
  voiceCapable: boolean;
  contextFilePreviewEnabled: boolean;
  scheduledSessionsEnabled: boolean;
  semanticEventsEnabled: boolean;
}

export function fixtureNameFromUrl(href: string): string | null {
  try {
    return new URL(href).searchParams.get('fixture');
  } catch {
    return null;
  }
}

export function chatBackendFeatureGates(
  capabilities: Capabilities | undefined,
): ChatBackendFeatureGates {
  const capsFlags = capabilities?.capabilities;
  return {
    capsFlags,
    voiceCapable: !!capsFlags?.voice,
    contextFilePreviewEnabled: capsFlags?.files !== false,
    scheduledSessionsEnabled: !!capsFlags?.scheduled_sessions,
    semanticEventsEnabled: !!capsFlags?.['x_clio_semantic_events'],
  };
}
