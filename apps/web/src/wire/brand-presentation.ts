/**
 * Brand-scoped presentation helpers for backend-provided semantic labels.
 */
import { brand } from '@brand';

export function blueprintControlLabel(): string {
  return brand.sessionSemantics.blueprintLabel || 'Agent blueprint';
}

export function showExpertPackPicker(): boolean {
  return brand.sessionSemantics.showExpertPackPicker;
}

export function presentBlueprintLabel(label: string, id?: string): string {
  const displayNames = brand.sessionSemantics.blueprintDisplayNames;
  const cleanLabel = label.trim();
  const cleanId = id?.trim() ?? '';
  return (
    (cleanId ? displayNames[cleanId] : undefined) ??
    (cleanLabel ? displayNames[cleanLabel] : undefined) ??
    cleanLabel
  );
}
