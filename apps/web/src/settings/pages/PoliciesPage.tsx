import { useEffect, useState } from 'react';
import type { Client, PoliciesDocument } from '@clio/core';
import type { ApprovalMode } from '../../composer/Composer';
import { EmptyState, ErrorNote, LoadingNote, PageHeader } from './common';

function readAllowRules(doc: PoliciesDocument): unknown[] {
  // GET /v1/policies always returns a flat list of {scope, action, kind, ...}
  // rules (clio_agent.gact.runtime.permission_policies) — there is no
  // enclosing document shape with a nested `allow_rules` field on any real
  // backend. `Array.isArray` covers the one real shape; the object branch is
  // dead against a real server but kept so a genuinely malformed response
  // degrades to an empty list instead of throwing.
  if (Array.isArray(doc)) return doc;
  const rules = (doc as Record<string, unknown> | undefined)?.['allow_rules'];
  return Array.isArray(rules) ? rules : [];
}

/**
 * Policies — tool-permission rules.
 *
 * "Default approval mode" is NOT a field on the policies document (GET
 * /v1/policies never carried a `default_approval_mode` key — the prior
 * version of this page read one anyway, so the row always rendered
 * unchecked). The prototype's own subtitle names the real source correctly:
 * "The composer approval toggle sets the per-session default" — the ACTIVE
 * session's real `approval_mode`, the same value/setter Composer's own
 * picker already reads and writes via `PATCH /v1/sessions/{id}`.
 *
 * The real approval_mode is a 4-way enum (ask / auto-edits / bypass /
 * ai-review — clio's actual permission model), not the prototype mock's
 * binary ask/execute. "Ask" reflects `approvalMode === 'ask'` and writes
 * for real: moving TO 'ask' is always the safe direction regardless of which
 * of the other 3 modes was active. "Execute" reflects the real non-ask state
 * honestly (checked whenever the session is in any of the 3 less-strict
 * modes) but does not write — there is no single unambiguous target among
 * auto-edits/bypass/ai-review to pick on the user's behalf, so the reason is
 * on its title rather than silently guessing one.
 *
 * The allow-rules list stays read-only: PUT /v1/policies replaces the whole
 * document, and this pane cannot know its full real shape well enough to
 * safely round-trip it against a backend other reviewers are relying on.
 */
export function PoliciesPage({
  client,
  approvalMode,
  onApprovalModeChange,
}: {
  client: Client;
  approvalMode?: ApprovalMode;
  onApprovalModeChange?: (mode: ApprovalMode) => void;
}) {
  const [doc, setDoc] = useState<PoliciesDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client
      .policies()
      .then(({ policies }) => {
        if (!cancelled) setDoc(policies);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const header = (
    <PageHeader
      title="Policies"
      subtitle="Tool-permission rules. The composer approval toggle sets the per-session default."
    />
  );

  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (doc === null) return (<>{header}<LoadingNote /></>);

  const rules = readAllowRules(doc);
  const isAsk = approvalMode === 'ask';
  const knownMode = approvalMode !== undefined;

  return (
    <>
      {header}
      <div className="settings__field">
        <span className="settings__fieldlabel">Default approval mode</span>
        <div className="settings__actions">
          <button
            type="button"
            className="settings__btn"
            disabled={!knownMode || !onApprovalModeChange || isAsk}
            onClick={() => onApprovalModeChange?.('ask')}
            title={
              knownMode
                ? "Sets this session's real approval mode to 'ask' (PATCH /v1/sessions/{id}) — the same write the composer's own approval picker makes."
                : 'No active session to read or set the approval mode for.'
            }
            style={isAsk ? { borderColor: 'var(--t-cy)', color: 'var(--t-cy)' } : undefined}
          >
            Ask {isAsk ? '✓' : ''}
          </button>
          <button
            type="button"
            className="settings__btn"
            disabled
            title={
              knownMode
                ? `This session's real mode is honestly reflected here (currently '${approvalMode}'), but 'Execute' has no single unambiguous target among the real auto-edits / bypass / ai-review modes to write on your behalf — pick a specific one from the composer's own approval control.`
                : 'No active session to read the approval mode for.'
            }
            style={
              knownMode && !isAsk ? { borderColor: 'var(--t-cy)', color: 'var(--t-cy)' } : undefined
            }
          >
            Execute {knownMode && !isAsk ? '✓' : ''}
          </button>
        </div>
      </div>
      {rules.length === 0 ? (
        <EmptyState
          title="No persistent allow rules"
          body="Rules created with allow-session / allow-workspace during approval prompts appear here."
        />
      ) : (
        <div className="settings__list" data-gap="tight" style={{ maxWidth: 560 }}>
          {rules.map((rule, i) => (
            <div className="settings__row" key={i}>
              <span className="settings__rowsub">{JSON.stringify(rule)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
