/**
 * Session semantic-defaults model: blueprint/expert-pack selection types and
 * the load/empty helpers backing the new-session defaults UI. Pure, no DOM.
 */
export interface SessionSemanticOption {
  id: string;
  label: string;
  description?: string;
}

export interface SessionSemanticsSelection {
  blueprintId: string;
  expertPackId: string;
}

export const SESSION_DEFAULT_BLUEPRINT_KEY =
  'clio.session-defaults.blueprint-id.v1';
export const SESSION_DEFAULT_EXPERT_PACK_KEY =
  'clio.session-defaults.expert-pack-id.v1';

export function emptySessionSemantics(): SessionSemanticsSelection {
  return { blueprintId: '', expertPackId: '' };
}

export function loadSessionSemanticsDefaults(): SessionSemanticsSelection {
  if (typeof localStorage === 'undefined') return emptySessionSemantics();
  return {
    blueprintId: localStorage.getItem(SESSION_DEFAULT_BLUEPRINT_KEY) ?? '',
    expertPackId: localStorage.getItem(SESSION_DEFAULT_EXPERT_PACK_KEY) ?? '',
  };
}

export function saveSessionSemanticsDefaults(
  selection: SessionSemanticsSelection,
): void {
  if (typeof localStorage === 'undefined') return;
  if (selection.blueprintId) {
    localStorage.setItem(SESSION_DEFAULT_BLUEPRINT_KEY, selection.blueprintId);
  } else {
    localStorage.removeItem(SESSION_DEFAULT_BLUEPRINT_KEY);
  }
  if (selection.expertPackId) {
    localStorage.setItem(
      SESSION_DEFAULT_EXPERT_PACK_KEY,
      selection.expertPackId,
    );
  } else {
    localStorage.removeItem(SESSION_DEFAULT_EXPERT_PACK_KEY);
  }
}

export function sanitizeSessionSemantics(
  selection: SessionSemanticsSelection,
  blueprints: SessionSemanticOption[],
  expertPacks: SessionSemanticOption[],
): SessionSemanticsSelection {
  return {
    blueprintId: blueprints.some((b) => b.id === selection.blueprintId)
      ? selection.blueprintId
      : '',
    expertPackId: expertPacks.some((p) => p.id === selection.expertPackId)
      ? selection.expertPackId
      : '',
  };
}
