/**
 * View-model / pure logic for Policies Page: state shaping and helpers, no DOM. Key export `PolicyDocument`.
 */
export type PolicyDocument = Record<string, unknown> | unknown[];

export type PolicyParseResult =
  | { ok: true; value: PolicyDocument }
  | { ok: false; error: string };

export function policyDocumentFromResponse(value: unknown): PolicyDocument {
  const policies = (value as { policies?: unknown } | null)?.policies;
  if (Array.isArray(policies)) return policies;
  if (policies && typeof policies === 'object') {
    return policies as Record<string, unknown>;
  }
  return [];
}

export function policyEntries(doc: PolicyDocument): Array<[string, unknown]> {
  return Array.isArray(doc)
    ? doc.map((value, index) => [String(index), value])
    : Object.entries(doc);
}

export function policyDraft(doc: PolicyDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function parsePolicyDraft(draft: string): PolicyParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(draft);
  } catch (e) {
    return {
      ok: false,
      error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!Array.isArray(parsed) && (!parsed || typeof parsed !== 'object')) {
    return {
      ok: false,
      error: 'Invalid JSON: policies must be an object or array',
    };
  }
  return { ok: true, value: parsed as PolicyDocument };
}
