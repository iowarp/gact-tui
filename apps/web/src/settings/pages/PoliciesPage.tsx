import { useEffect, useState } from 'react';
import type { Client, PoliciesDocument } from '@clio/core';
import { EmptyState, ErrorNote, LoadingNote, PageHeader } from './common';

function readApprovalMode(doc: PoliciesDocument): 'ask' | 'execute' | null {
  if (!doc || Array.isArray(doc)) return null;
  const value = (doc as Record<string, unknown>)['default_approval_mode'];
  return value === 'ask' || value === 'execute' ? value : null;
}

function readAllowRules(doc: PoliciesDocument): unknown[] {
  if (Array.isArray(doc)) return doc;
  const rules = (doc as Record<string, unknown> | undefined)?.['allow_rules'];
  return Array.isArray(rules) ? rules : [];
}

/**
 * Policies — tool-permission rules. Read-only against the shared demo
 * backend on purpose: PUT /v1/policies replaces the whole document, and this
 * pane cannot know its full real shape well enough to safely round-trip it
 * against a backend other reviewers are relying on. The mode toggle shows
 * the real value; it does not write.
 */
export function PoliciesPage({ client }: { client: Client }) {
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

  const mode = readApprovalMode(doc);
  const rules = readAllowRules(doc);

  return (
    <>
      {header}
      <div className="settings__field">
        <span className="settings__fieldlabel">Default approval mode</span>
        <div className="settings__actions">
          <button
            type="button"
            className="settings__btn"
            disabled
            title="Read-only here — the composer's approval toggle sets this per session."
            style={mode === 'ask' ? { borderColor: 'var(--t-cy)', color: 'var(--t-cy)' } : undefined}
          >
            Ask {mode === 'ask' ? '✓' : ''}
          </button>
          <button
            type="button"
            className="settings__btn"
            disabled
            title="Read-only here — the composer's approval toggle sets this per session."
            style={mode === 'execute' ? { borderColor: 'var(--t-cy)', color: 'var(--t-cy)' } : undefined}
          >
            Execute {mode === 'execute' ? '✓' : ''}
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
