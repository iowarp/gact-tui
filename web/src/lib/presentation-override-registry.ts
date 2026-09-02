export const PRESENTATION_OVERRIDE_REGISTRY = {
  'child-assignment-fallback': {
    issue: 'https://github.com/iowarp/clio-agent/issues/1264',
  },
  'child-tool-correlation': {
    issue: 'https://github.com/iowarp/clio-agent/issues/1279',
  },
  'tool-name-humanization': {
    issue: 'https://github.com/iowarp/clio-agent/issues/1261',
  },
} as const;

export type PresentationOverrideKind = keyof typeof PRESENTATION_OVERRIDE_REGISTRY;
