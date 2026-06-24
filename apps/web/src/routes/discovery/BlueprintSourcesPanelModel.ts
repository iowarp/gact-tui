/**
 * View-model / pure logic for Blueprint Sources Panel: state shaping and helpers, no DOM. Key export `buildAddBlueprintSourceInput`.
 */
import type { AddBlueprintSourceInput, BlueprintSource } from '@clio/core';

export function buildAddBlueprintSourceInput(
  sourceText: string,
  refText: string,
  nameText: string,
): AddBlueprintSourceInput | null {
  const source = sourceText.trim();
  if (!source) return null;
  const body: AddBlueprintSourceInput = { source };
  const ref = refText.trim();
  const name = nameText.trim();
  if (ref) body.ref = ref;
  if (name) body.name = name;
  return body;
}

export function blueprintSourceName(source: BlueprintSource): string {
  return source.name || source.source;
}

export function blueprintSourceStatus(source: BlueprintSource): string {
  return source.status || 'unknown';
}

export function blueprintSourceDotClass(status?: string): string {
  if (status === 'ok' || status === 'ready') return 'bps__dot bps__dot--ok';
  if (status === 'error') return 'bps__dot bps__dot--error';
  return 'bps__dot bps__dot--unknown';
}
