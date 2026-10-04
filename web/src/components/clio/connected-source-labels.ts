import type { SourceMode } from '@clio/core/v3';

export const sourceModeNames: Record<SourceMode, string> = {
  read_only: 'Read only',
  working_copy: 'Working copy',
  write_enabled: 'Write enabled',
};
