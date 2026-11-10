import type { SourceMode } from '@clio/core/v3';

/** How the files reach the agent: a link to the originals or a downloaded copy. */
export type SourceUse = 'link' | 'transfer';

/** The Access the user chose in the Connect dialog, which using the source follows. */
export interface SourceAccessIntent {
  mode: SourceMode;
  use: SourceUse;
  /** The user allowed a read and write link to change the originals. */
  confirmed: boolean;
}

const intents = new Map<string, SourceAccessIntent>();

export function rememberSourceAccess(sourceId: string, intent: SourceAccessIntent) {
  intents.set(sourceId, intent);
}

export function rememberedSourceAccess(sourceId: string): SourceAccessIntent | undefined {
  return intents.get(sourceId);
}

/**
 * A read and write link always links; an editable download prefers a copy and
 * read only prefers the originals, each falling back to what the source offers.
 */
export function defaultSourceUse(
  mode: SourceMode,
  uses: readonly SourceUse[],
): SourceUse | undefined {
  if (mode === 'write_enabled') return uses.includes('link') ? 'link' : undefined;
  const preferred: SourceUse = mode === 'working_copy' ? 'transfer' : 'link';
  return uses.includes(preferred) ? preferred : uses[0];
}
