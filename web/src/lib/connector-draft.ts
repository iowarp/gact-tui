import type { ConnectorNeed, ConnectorValues } from '@clio/core/v3';

/** What the person typed, by need key. A key that is absent keeps the saved value. */
export type ConnectorDraft = Readonly<Record<string, string>>;

/**
 * The values a draft changes. A secret left empty keeps the stored one; an address
 * or value emptied clears it. Nothing that equals the saved value is sent.
 */
export function draftValues(
  needs: readonly ConnectorNeed[],
  draft: ConnectorDraft,
): ConnectorValues {
  const values: ConnectorValues = {};
  for (const need of needs) {
    if (need.kind === 'sign-in' || !(need.key in draft)) continue;
    const typed = draft[need.key]!.trim();
    if (need.kind === 'secret') {
      if (typed) values[need.key] = typed;
      continue;
    }
    if (typed === (need.value ?? '')) continue;
    values[need.key] = typed || null;
  }
  return values;
}

/** A required row the person has neither saved nor typed. Sign-in rows complete elsewhere. */
export function unfilledRequired(needs: readonly ConnectorNeed[], draft: ConnectorDraft) {
  return needs.filter((need) => {
    if (!need.required) return false;
    if (need.kind === 'sign-in') return !need.has_value;
    const typed = draft[need.key];
    if (typed !== undefined) return !typed.trim() && !(need.kind === 'secret' && need.has_value);
    return !need.has_value && !need.value;
  });
}

/**
 * A conversation card's answer: the values it changes and the keys that also become the
 * person's defaults ("Save as default"). A row marked to save that the person did not
 * change sends its current value, so the default takes it.
 */
export function conversationAnswer(
  needs: readonly ConnectorNeed[],
  draft: ConnectorDraft,
  saveAsDefault: Readonly<Record<string, boolean>>,
): { values: ConnectorValues; save_as_default: string[] } {
  const values = { ...draftValues(needs, draft) };
  const keys: string[] = [];
  for (const need of needs) {
    if (!saveAsDefault[need.key] || !perConversation(need)) continue;
    const value = need.key in values ? values[need.key] : need.value;
    if (!value) continue;
    values[need.key] = value;
    keys.push(need.key);
  }
  return { values, save_as_default: keys };
}

/** An address or value need: set per conversation, with a "Save as default" choice. */
export function perConversation(need: ConnectorNeed) {
  return need.kind === 'address' || need.kind === 'value';
}
