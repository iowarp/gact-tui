import type {
  AttentionLookupDirection,
  AttentionAvailable,
  AttentionLookupResult,
  AttentionProfile,
  ContentSelection,
} from '@clio/core/v3';
import { LayersIcon, RadarIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useRepository } from '@/hooks/use-repository';
import { useSelectionAction } from '@/hooks/use-selection-action';
import type { SelectionAction, SelectionTarget } from '@/lib/selection-actions';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AttentionProfileEditor } from './attention-profile-editor';
import { AttentionLookupResults } from './attention-lookup-results';
import { InfoTip } from './info-tip';
import { readAttentionInspector, saveAttentionInspector } from '@/lib/attention-inspector-state';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  readAttentionEvidence,
  type AttentionEvidenceInspection,
} from '@/lib/attention-evidence-navigation';

type Item = { reference: ContentSelection; label: string };
function itemFor(target: SelectionTarget): Item | undefined {
  if (target.kind === 'data-surface-zone' || !target.reference) return;
  return { reference: target.reference, label: target.text.slice(0, 120) };
}

/** One connected-session basket; results never cross an endpoint or session switch. */
export function AttentionLookupPanel({
  sessionId,
  onHeatChange,
}: {
  sessionId: string;
  onHeatChange?: (data: AttentionAvailable | undefined) => void;
}) {
  const { settings } = useConnectionSettings();
  // Never persist the credential. Its digest separates authenticated users on one endpoint.
  const identity = bytesToHex(sha256(utf8ToBytes(settings.token ?? '')));
  const scope = `clio:attention-inspector:${JSON.stringify([settings.endpoint, identity, sessionId])}`;
  return (
    <ScopedAttentionLookup
      key={scope}
      scope={scope}
      sessionId={sessionId}
      onHeatChange={onHeatChange}
    />
  );
}

function ScopedAttentionLookup({
  sessionId,
  scope,
  onHeatChange,
}: {
  sessionId: string;
  scope: string;
  onHeatChange?: (data: AttentionAvailable | undefined) => void;
}) {
  const repository = useRepository();
  const [restored] = useState(() => readAttentionInspector(scope));
  const [items, setItems] = useState<Item[]>(restored.items);
  const [direction, setDirection] = useState<AttentionLookupDirection>(restored.direction);
  const [result, setResult] = useState<AttentionLookupResult>();
  const [profile, setProfile] = useState<AttentionProfile | undefined>(restored.profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [heatCall, setHeatCall] = useState<string>();
  useEffect(() => {
    onHeatChange?.(undefined);
  }, [items, direction, profile, onHeatChange]);
  const request = useRef<AbortController | undefined>(undefined);
  const expectedEvidence = useRef<AttentionEvidenceInspection | undefined>(undefined);
  const inspectedHash = useRef('');
  const leaveEvidenceLink = useCallback(() => {
    expectedEvidence.current = undefined;
    if (readAttentionEvidence(window.location.hash, sessionId)) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
      inspectedHash.current = '';
    }
  }, [sessionId]);
  useEffect(
    () => () => {
      request.current?.abort();
      inspectedHash.current = '';
    },
    [],
  );
  useEffect(
    () => saveAttentionInspector(scope, { items, direction, profile }),
    [scope, items, direction, profile],
  );
  const inspect = useCallback(
    async (
      selected: Item[],
      mode: AttentionLookupDirection,
      nextProfile = profile,
      cursor = 0,
      expected?: AttentionEvidenceInspection,
    ) => {
      request.current?.abort();
      if (!expected) leaveEvidenceLink();
      expectedEvidence.current = expected;
      const controller = new AbortController();
      request.current = controller;
      setBusy(true);
      setHeatCall(undefined);
      onHeatChange?.(undefined);
      setError('');
      if (!cursor) setResult(undefined);
      try {
        const data = await repository.lookupAttention(
          sessionId,
          {
            selections: selected.map((item) => item.reference),
            direction: mode,
            cursor,
            ...(expected ? { lm_call_id: expected.lm_call_id } : {}),
            ...(nextProfile ? { profile: nextProfile } : {}),
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (
          expected &&
          (!('views' in data) ||
            data.profile_revision !== expected.profile_revision ||
            !data.views.some(
              (view) =>
                view.lm_call_id === expected.lm_call_id &&
                view.capture_sha256 === expected.capture_sha256,
            ))
        ) {
          setResult(undefined);
          setError(
            'The referenced capture or aggregation profile is unavailable. No replacement was selected.',
          );
          return;
        }
        setResult((previous) =>
          cursor && previous && 'views' in previous && 'views' in data
            ? {
                ...data,
                views: [...previous.views, ...data.views],
                unavailable: [...previous.unavailable, ...data.unavailable],
              }
            : data,
        );
        if ('profile' in data) setProfile(data.profile);
        if (expected) setHeatCall(expected.lm_call_id);
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : 'Attention lookup failed.');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [profile, repository, sessionId, onHeatChange, leaveEvidenceLink],
  );
  useEffect(() => {
    const expected = expectedEvidence.current;
    if (!expected || !result || !('views' in result)) return;
    const view = result.views.find(
      (item) =>
        item.lm_call_id === expected.lm_call_id && item.capture_sha256 === expected.capture_sha256,
    );
    if (!view || result.profile_revision !== expected.profile_revision) return;
    onHeatChange?.(
      (view.kind === 'generated' ? view : view.heat) as AttentionAvailable | undefined,
    );
  }, [result, onHeatChange]);
  useEffect(() => {
    const restore = () => {
      if (inspectedHash.current === window.location.hash) return;
      inspectedHash.current = window.location.hash;
      const link = readAttentionEvidence(window.location.hash, sessionId);
      if (!link) return;
      const selected = link.selections.map((reference) => ({
        reference,
        label: `Evidence · ${reference.field ?? 'content'}`,
      }));
      setItems(selected);
      setDirection(link.direction);
      setProfile(link.profile);
      void inspect(selected, link.direction, link.profile, 0, link);
    };
    restore();
    const reopen = () => {
      inspectedHash.current = '';
      restore();
    };
    window.addEventListener('hashchange', restore);
    window.addEventListener('clio:inspect-attention', reopen);
    return () => {
      window.removeEventListener('hashchange', restore);
      window.removeEventListener('clio:inspect-attention', reopen);
    };
  }, [inspect, sessionId]);
  const add = useCallback(
    (target: SelectionTarget, trace = false) => {
      const item = itemFor(target);
      if (!item) return false;
      const unique = new Map(items.map((entry) => [JSON.stringify(entry.reference), entry]));
      unique.set(JSON.stringify(item.reference), item);
      const next = [...unique.values()];
      if (next.length > 32) {
        setError('Inspect up to 32 selections at a time.');
        return false;
      }
      request.current?.abort();
      leaveEvidenceLink();
      setBusy(false);
      setResult(undefined);
      setItems(next);
      if (trace) {
        setDirection('source_to_generation');
        void inspect(next, 'source_to_generation');
      }
      return true;
    },
    [items, inspect, leaveEvidenceLink],
  );
  const actions = useMemo<SelectionAction[]>(
    () => [
      {
        id: 'attention-set',
        label: 'Add to attention set',
        icon: LayersIcon,
        order: 31,
        kinds: ['agent-answer-text', 'transcript-content'],
        isAvailable: (target) => itemFor(target)?.reference.session_id === sessionId,
        run: (target) => add(target),
      },
      {
        id: 'attention-later-use',
        label: 'Trace later use',
        icon: RadarIcon,
        order: 32,
        kinds: ['agent-answer-text', 'transcript-content'],
        isAvailable: (target) => itemFor(target)?.reference.session_id === sessionId,
        run: (target) => add(target, true),
      },
    ],
    [add, sessionId],
  );
  useSelectionAction(actions[0]!);
  useSelectionAction(actions[1]!);
  if (!items.length) return null;
  return (
    <section
      aria-label="Attention inspector"
      className="max-h-[45vh] shrink-0 overflow-y-auto border-b bg-muted/20 px-4 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Attention set · {items.length}</span>
        <InfoTip label="About attention selections">
          Select more transcript passages to combine them. Overlapping captured tokens count once.
          Heat is a measurement, not evidence of intent or poisoning.
        </InfoTip>
        <Button
          variant={direction === 'generated_to_source' ? 'secondary' : 'ghost'}
          size="sm"
          disabled={busy}
          onClick={() => {
            setDirection('generated_to_source');
            void inspect(items, 'generated_to_source');
          }}
        >
          Inspect sources
        </Button>
        <Button
          variant={direction === 'source_to_generation' ? 'secondary' : 'ghost'}
          size="sm"
          disabled={busy}
          onClick={() => {
            setDirection('source_to_generation');
            void inspect(items, 'source_to_generation');
          }}
        >
          Trace later use
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            request.current?.abort();
            leaveEvidenceLink();
            setItems([]);
            setResult(undefined);
            setBusy(false);
            setError('');
          }}
        >
          Clear
        </Button>
        {busy ? <Spinner aria-label="Reading captures" /> : null}
      </div>
      <div className="my-1 flex flex-wrap gap-1">
        {items.map((item, index) => (
          <Button
            key={JSON.stringify(item.reference)}
            size="sm"
            variant="outline"
            className="max-w-56 text-xs"
            aria-label={`Remove selection ${index + 1}: ${item.label}`}
            onClick={() => {
              request.current?.abort();
              leaveEvidenceLink();
              setBusy(false);
              setResult(undefined);
              setItems(items.filter((_, i) => i !== index));
            }}
          >
            <span className="truncate">{item.label}</span>
            <span aria-hidden>×</span>
          </Button>
        ))}
      </div>
      {profile ? (
        <AttentionProfileEditor
          profile={profile}
          onApply={(next) => {
            setProfile(next);
            void inspect(items, direction, next);
          }}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {result ? (
        <AttentionLookupResults
          result={result}
          heatCall={heatCall}
          onShowHeat={(view) => {
            const data = view.kind === 'generated' ? view : view.heat;
            setHeatCall(view.lm_call_id);
            onHeatChange?.(data as AttentionAvailable | undefined);
          }}
        />
      ) : null}
      {result && 'next_cursor' in result && result.next_cursor !== null ? (
        <Button
          disabled={busy}
          size="sm"
          variant="outline"
          onClick={() => void inspect(items, direction, profile, result.next_cursor!)}
        >
          Inspect more model calls
        </Button>
      ) : null}
    </section>
  );
}
