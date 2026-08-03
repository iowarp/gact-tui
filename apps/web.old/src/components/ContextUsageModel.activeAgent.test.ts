/**
 * Regression lock for fix (a): the semantic-event → active-agent resolver in
 * {@link ContextUsageModel}. These assertions pin the served §7.6 event
 * vocabulary and the exact id/title resolution rules, mirroring the Go
 * projector (`tui/internal/ui/execution_timeline.go` +
 * `execution_timeline_helpers.go`, `executionExpertID` /
 * `executionActorAgentID`).
 *
 * Only `activeAgentFromSemanticEvents` is exported from the module (the
 * per-event `activeAgentForEvent` is module-private), so the single-event
 * cases are exercised through a one-element ledger — which is also exactly how
 * the resolver is fed in production.
 */
import { describe, expect, it } from 'vitest';
import type { SemanticEventPayload } from '@clio/core';
import { activeAgentFromSemanticEvents } from './ContextUsageModel.js';

/** Build a SemanticEventPayload with only the fields under test set. */
function evt(over: Partial<SemanticEventPayload> & { event_type: string }): SemanticEventPayload {
  return {
    event_id: 'sem_test',
    ...over,
  };
}

/** Resolve the active agent from a single event (one-element ledger). */
function activeFor(event: SemanticEventPayload) {
  return activeAgentFromSemanticEvents([event]);
}

describe('activeAgentFromSemanticEvents — expert.lifecycle.started', () => {
  it('resolves the expert id/title from the nested payload.expert_id', () => {
    const ref = activeFor(
      evt({
        event_type: 'expert.lifecycle.started',
        payload: { expert_id: 'data-expert', expert_title: 'Data Expert' },
        actor: { agent_id: 'main', agent_title: 'Main' },
      }),
    );
    // Nested payload.expert_id wins over actor.agent_id (Go FirstNonEmpty).
    expect(ref).toEqual({ id: 'data-expert', title: 'Data Expert' });
  });

  it('falls back to actor.agent_id when payload.expert_id is absent', () => {
    const ref = activeFor(
      evt({
        event_type: 'expert.lifecycle.started',
        payload: {},
        actor: { agent_id: 'hpc-expert', agent_title: 'HPC Expert' },
      }),
    );
    // Mirrors executionExpertID: nested expert_id empty → actor.agent_id.
    expect(ref).toEqual({ id: 'hpc-expert', title: 'HPC Expert' });
  });

  it('falls back to actor.agent_id when payload.expert_id is a redaction sentinel', () => {
    const ref = activeFor(
      evt({
        event_type: 'expert.lifecycle.started',
        payload: { expert_id: '[redacted]:12 chars' },
        actor: { agent_id: 'fallback-expert' },
      }),
    );
    // Redaction sentinels never count as a value; title defaults to the id.
    expect(ref).toEqual({ id: 'fallback-expert', title: 'fallback-expert' });
  });

  it('defaults the title to the resolved id when no title is present', () => {
    const ref = activeFor(
      evt({
        event_type: 'expert.lifecycle.started',
        payload: { expert_id: 'io-expert' },
      }),
    );
    expect(ref).toEqual({ id: 'io-expert', title: 'io-expert' });
  });

  it('returns null when neither payload.expert_id nor actor.agent_id resolve', () => {
    expect(
      activeFor(evt({ event_type: 'expert.lifecycle.started', payload: {}, actor: {} })),
    ).toBeNull();
  });
});

describe('activeAgentFromSemanticEvents — delegation.started (both prefixes)', () => {
  const payload = {
    subject: { agent_id: 'child', agent_title: 'Child Agent' },
    actor: { agent_id: 'parent', agent_title: 'Parent Agent' },
  } as const;

  it('resolves the SUBJECT (the delegatee) as the now-active agent', () => {
    const ref = activeFor(evt({ event_type: 'delegation.started', ...payload }));
    expect(ref).toEqual({ id: 'child', title: 'Child Agent' });
  });

  it('the blueprint.delegation.started prefix resolves identically to the plain one', () => {
    const plain = activeFor(evt({ event_type: 'delegation.started', ...payload }));
    const blueprint = activeFor(evt({ event_type: 'blueprint.delegation.started', ...payload }));
    // Same atom, two prefixes (SPEC §7.6) — must track identically.
    expect(blueprint).toEqual(plain);
    expect(blueprint).toEqual({ id: 'child', title: 'Child Agent' });
  });

  it('falls back to the actor when the subject carries no agent identity', () => {
    const ref = activeFor(
      evt({ event_type: 'delegation.started', subject: {}, actor: { agent_id: 'parent' } }),
    );
    expect(ref).toEqual({ id: 'parent', title: 'parent' });
  });
});

describe('activeAgentFromSemanticEvents — delegation.parent_resumed (both prefixes)', () => {
  const payload = {
    actor: { agent_id: 'parent', agent_title: 'Parent Agent' },
    subject: { agent_id: 'child', agent_title: 'Child Agent' },
  } as const;

  it('resolves the ACTOR (the resuming parent) as the now-active agent', () => {
    const ref = activeFor(evt({ event_type: 'delegation.parent_resumed', ...payload }));
    expect(ref).toEqual({ id: 'parent', title: 'Parent Agent' });
  });

  it('the blueprint.delegation.parent_resumed prefix resolves identically to the plain one', () => {
    const plain = activeFor(evt({ event_type: 'delegation.parent_resumed', ...payload }));
    const blueprint = activeFor(
      evt({ event_type: 'blueprint.delegation.parent_resumed', ...payload }),
    );
    expect(blueprint).toEqual(plain);
    expect(blueprint).toEqual({ id: 'parent', title: 'Parent Agent' });
  });
});

describe('activeAgentFromSemanticEvents — non-active event types do not pin an agent', () => {
  // Served (§7.6 allow-list) but NOT activity markers: even when they carry
  // actor/subject/expert identity, they must NOT change the active agent.
  it.each([
    ['react.step.completed', { payload: { expert_id: 'x' }, actor: { agent_id: 'x' } }],
    ['memory.search.completed', { actor: { agent_id: 'x' }, subject: { agent_id: 'y' } }],
    ['expert.extract.completed', { payload: { expert_id: 'x' } }],
    ['expert.response.completed', { payload: { expert_id: 'x' } }],
    ['delegation.completed', { subject: { agent_id: 'child' } }],
  ])('served-but-non-active %s yields null', (event_type, rest) => {
    expect(activeFor(evt({ event_type, ...(rest as Partial<SemanticEventPayload>) }))).toBeNull();
  });

  it.each([
    ['llm.request.started', { actor: { agent_id: 'x' } }],
    ['tool.call.started', { actor: { agent_id: 'x' }, subject: { agent_id: 'y' } }],
  ])('NON-served dead-case %s yields null', (event_type, rest) => {
    // These strings were never served and are no longer handled — proving the
    // dead cases are gone rather than silently pinning an agent.
    expect(activeFor(evt({ event_type, ...(rest as Partial<SemanticEventPayload>) }))).toBeNull();
  });
});

describe('activeAgentFromSemanticEvents — ordered-ledger reduction', () => {
  it('returns the LAST active-agent-setting event, skipping trailing non-active events', () => {
    const ledger: SemanticEventPayload[] = [
      evt({
        event_type: 'expert.lifecycle.started',
        payload: { expert_id: 'data-expert', expert_title: 'Data Expert' },
      }),
      evt({ event_type: 'react.step.completed', payload: { expert_id: 'noise' } }),
      evt({
        event_type: 'delegation.started',
        subject: { agent_id: 'child', agent_title: 'Child Agent' },
      }),
      evt({ event_type: 'memory.search.completed', actor: { agent_id: 'noise' } }),
      evt({ event_type: 'tool.call.started', actor: { agent_id: 'noise' } }),
    ];
    // The delegation is the last activity marker; the trailing non-active
    // events must be skipped, not treated as idle.
    expect(activeAgentFromSemanticEvents(ledger)).toEqual({ id: 'child', title: 'Child Agent' });
  });

  it('a later expert.lifecycle.started supersedes an earlier delegation', () => {
    const ledger: SemanticEventPayload[] = [
      evt({
        event_type: 'delegation.started',
        subject: { agent_id: 'child', agent_title: 'Child Agent' },
      }),
      evt({
        event_type: 'expert.lifecycle.started',
        payload: { expert_id: 'final-expert', expert_title: 'Final Expert' },
      }),
    ];
    expect(activeAgentFromSemanticEvents(ledger)).toEqual({
      id: 'final-expert',
      title: 'Final Expert',
    });
  });

  it('returns null for an empty ledger', () => {
    expect(activeAgentFromSemanticEvents([])).toBeNull();
  });

  it('returns null for an undefined ledger', () => {
    expect(activeAgentFromSemanticEvents(undefined)).toBeNull();
  });

  it('returns null for a ledger of only non-active events', () => {
    const ledger: SemanticEventPayload[] = [
      evt({ event_type: 'react.step.completed', actor: { agent_id: 'x' } }),
      evt({ event_type: 'tool.call.started', actor: { agent_id: 'y' } }),
      evt({ event_type: 'memory.search.completed', subject: { agent_id: 'z' } }),
    ];
    expect(activeAgentFromSemanticEvents(ledger)).toBeNull();
  });
});
