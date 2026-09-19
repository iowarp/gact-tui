import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LoaderCircleIcon, RotateCcwIcon, ServerIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { ServiceIntegrationHealth } from '@clio/core/v3';
import { queryKeys } from '@/lib/query-keys';
import { SANDBOX_SETUP_POLL_MS } from '@/lib/runtime-limits';
import { ClioStatus } from '@/components/clio/status';
import { humanizeProtocolValue } from '@/components/clio/presentation-labels';
import { TechnicalDetails } from '@/components/clio/technical-details';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { restartClio } from '@/tauri/managed-backend';
import { vocab } from '@/lib/brand-vocabulary';
import { foundationSummary, foundationTitle, integrationStatus, integrationStatusLabel } from './infrastructure-foundation';

/** The typed reason tokens (clio_agent.runtime.sandbox / sandbox_codex) this row words specifically. */
const SANDBOX_REASON_LABELS: Record<string, string> = {
  codex_enforcement_unverified: 'Not verified yet on this computer',
  sandbox_fence_pending_restart: `Set up, restart ${vocab.agent} to activate`,
};

/** Never poll forever: 600 × SANDBOX_SETUP_POLL_MS (10 minutes) is well past any real UAC/provisioning wait. */
const MAX_SANDBOX_SETUP_POLLS = 600;
/** Three straight failed polls means the connection (not the setup run) is the problem — stop and say so. */
const MAX_CONSECUTIVE_POLL_ERRORS = 3;

/**
 * "Protected execution": backed by GET /v1/system/sandbox instead of the
 * plain /v1/health entry, because it alone needs the extra desktop-panel
 * fields (`reason`, `setup_in_progress`) and a "Set up protected execution"
 * action (POST /v1/system/sandbox/setup). `integration` (from /v1/health) is
 * the pre-fetch fallback so the row has something honest to show before this
 * row's own query resolves.
 */
export function SandboxFoundationRow({ integration }: { integration: ServiceIntegrationHealth }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  const desktop = inTauri();
  const [setupUnsupported, setSetupUnsupported] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const sandboxKey = queryKeys.key('sandbox-status', settings.endpoint);
  // Counts polls while setup_in_progress stays true; reset the moment it
  // isn't, and on every fresh "Set up" click (see the mutation's onMutate
  // below). Only ever read/written from inside callbacks (refetchInterval,
  // onMutate) — never in the render body, which is what `pollExhausted`
  // (real state, flipped from inside refetchInterval) is for.
  const pollAttempts = useRef(0);
  const [pollExhausted, setPollExhausted] = useState(false);

  // Derived, not stored: the row's own setup_in_progress (refreshed by the
  // poll this same flag enables) is the single source of truth for whether a
  // setup run is still going — the poll turns itself off the moment a
  // refetch reports setup_in_progress: false, hits the attempt cap, or hits
  // MAX_CONSECUTIVE_POLL_ERRORS straight failures (query.state.fetchFailureCount,
  // TanStack's own consecutive-failure counter — resets on any success).
  const sandbox = useQuery({
    queryKey: sandboxKey,
    queryFn: ({ signal }) => repository.sandboxStatus(signal),
    refetchInterval: (query) => {
      if (!query.state.data?.setup_in_progress) {
        pollAttempts.current = 0;
        return false;
      }
      if (query.state.fetchFailureCount >= MAX_CONSECUTIVE_POLL_ERRORS) return false;
      pollAttempts.current += 1;
      if (pollAttempts.current >= MAX_SANDBOX_SETUP_POLLS) {
        setPollExhausted(true);
        return false;
      }
      return SANDBOX_SETUP_POLL_MS;
    },
  });
  const row = sandbox.data;
  const pollGaveUpOnErrors = sandbox.failureCount >= MAX_CONSECUTIVE_POLL_ERRORS;
  const polling = (row?.setup_in_progress ?? false) && !pollGaveUpOnErrors && !pollExhausted;

  const setup = useMutation({
    mutationFn: () => repository.setupSandbox(),
    onMutate: () => {
      // A fresh, explicit attempt always gets a fresh poll budget, even
      // right after a previous run gave up on the error/attempt cap.
      pollAttempts.current = 0;
      setPollExhausted(false);
    },
    onSuccess: (result) => {
      // 501: nothing to provision on this platform — hide the button rather
      // than offer a fix that can never work here.
      if (result.reason === 'sandbox_setup_unsupported') setSetupUnsupported(true);
      // No other branch here: the 409/501 `row` this call itself returns
      // does not carry setup_in_progress/reason/codex_source — only the
      // dedicated GET does. onSettled below always re-fetches that GET, and
      // if it reports setup_in_progress: true (whether this call started
      // the run or found one already in flight), the poll above picks it
      // up from there — one path for both cases instead of two.
    },
    onError: (error) =>
      toast.error('Could not set up protected execution', { description: error.message }),
    onSettled: () => {
      // Unconditional and on BOTH outcomes: the desktop bridge's own
      // request timeout is generous (SANDBOX_SETUP_TIMEOUT_MS, for the UAC
      // prompt) but not infinite, so a client-side timeout on a setup that
      // is actually still running server-side must still flip this row
      // into the same poll a clean 409 would have.
      void queryClient.invalidateQueries({ queryKey: sandboxKey });
    },
  });

  const restart = async () => {
    setRestarting(true);
    try {
      await restartClio();
    } catch (error) {
      toast.error(`Could not restart ${vocab.agent}`, {
        description: error instanceof Error ? error.message : String(error),
      });
      setRestarting(false);
    }
    // No `finally`: a successful restart tears down and re-establishes this
    // same connection, so the row simply stays in its "restarting" state
    // until the page's own reconnect picks the fresh service back up.
  };

  const status = integrationStatus(row?.status ?? integration.status);
  const reasonLabel = row?.reason
    ? (SANDBOX_REASON_LABELS[row.reason] ?? humanizeProtocolValue(row.reason))
    : undefined;
  const pendingRestart = row?.reason === 'sandbox_fence_pending_restart';
  const summary = row?.summary || row?.detail || foundationSummary(integration);

  return (
    <details className="group px-1 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <ServerIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {foundationTitle(integration.name)}
        </span>
        <ClioStatus
          label={reasonLabel ?? integrationStatusLabel(status)}
          value={status === 'healthy' ? 'healthy' : polling ? 'connecting' : status}
        />
      </summary>
      <div className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground">
        <p>{summary}</p>
        {status !== 'healthy' && !setupUnsupported ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-foreground">
            <Button
              disabled={setup.isPending || polling}
              onClick={() => setup.mutate()}
              size="sm"
              variant="outline"
            >
              {setup.isPending || polling ? (
                <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
              ) : null}
              Set up protected execution
            </Button>
            {polling ? (
              <span role="status">Waiting for Windows permission prompt…</span>
            ) : null}
            {!polling && (pollGaveUpOnErrors || pollExhausted) ? (
              <span className="text-destructive" role="status">
                {pollGaveUpOnErrors
                  ? `Lost touch with ${vocab.agent} while waiting: ${sandbox.error instanceof Error ? sandbox.error.message : 'connection failed'}. Try again once it reconnects.`
                  : 'Still waiting — this is taking longer than expected. Check ' +
                    `${vocab.agent} directly, or try again.`}
              </span>
            ) : null}
          </div>
        ) : null}
        {pendingRestart ? (
          desktop ? (
            <Button
              className="mt-2"
              disabled={restarting}
              onClick={() => void restart()}
              size="sm"
              variant="outline"
            >
              <RotateCcwIcon
                aria-hidden="true"
                className={restarting ? 'motion-safe:animate-spin' : undefined}
              />
              Restart {vocab.agent}
            </Button>
          ) : (
            <p className="mt-2 text-foreground">
              Restart {vocab.agent} to activate protected execution for background tool processes
              already running.
            </p>
          )
        ) : null}
        {integration.summary || integration.detail || integration.config_source ? (
          <TechnicalDetails className="mt-2" title="Technical details">
            <div className="mt-2 grid gap-1 break-words font-mono text-[10px]">
              {integration.summary || integration.detail ? (
                <p>{integration.summary || integration.detail}</p>
              ) : null}
              {integration.config_source ? <p>{integration.config_source}</p> : null}
            </div>
          </TechnicalDetails>
        ) : null}
      </div>
    </details>
  );
}
