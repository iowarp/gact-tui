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
