/**
 * Pure helpers for the session-semantics modal: builds the blueprint/expert
 * selection and resolves the description of the chosen semantic option.
 */
import type {
  SessionSemanticOption,
  SessionSemanticsSelection,
} from '../session-semantics.js';

export function buildSessionSemanticsSelection(
  blueprintId: string,
  expertPackId: string,
): SessionSemanticsSelection {
  return { blueprintId, expertPackId };
}

export function selectedSessionSemanticDescription(
  options: SessionSemanticOption[],
  selectedId: string,
): string | undefined {
  if (!selectedId) return undefined;
  return options.find((option) => option.id === selectedId)?.description;
}
