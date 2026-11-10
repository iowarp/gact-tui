import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FolderIcon,
  LoaderCircleIcon,
  PlayIcon,
  ShieldCheckIcon,
  ShieldIcon,
  TerminalIcon,
} from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { toast } from 'sonner';
import type { ServiceIntegrationHealth } from '@clio/core/v3';
import { queryKeys } from '@/lib/query-keys';
import { SANDBOX_SETUP_POLL_MS } from '@/lib/runtime-limits';
import { humanizeProtocolValue } from '@/components/clio/presentation-labels';
import { TechnicalDetails } from '@/components/clio/technical-details';
import { sandboxReasonLabel } from '@/components/clio/sandbox-acknowledgement';
import { INFRA_FACTS_GRID, InfraRow, type InfraStatus } from '@/components/clio/infrastructure-row';
import {
  InfraRowChevron,
  InfraRowToggle,
  InfraRowActions,
} from '@/components/clio/infrastructure-row-toggle';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { KeyValueGrid, type KeyValueItem } from '@/components/clio/primitives/key-value-grid';
import { StateView } from '@/components/clio/primitives/state-view';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { restartClio } from '@/tauri/managed-backend';
import { vocab } from '@/lib/brand-vocabulary';
import { formatDuration } from '@/lib/format';
import {
  foundationSummary,
  foundationTitle,
  integrationStatus,
  integrationStatusLabel,
  integrationTone,
} from './infrastructure-foundation';

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
  const [setupOutcome, setSetupOutcome] = useState<string>();
  const [expanded, setExpanded] = useState(false);
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
    mutationKey: queryKeys.key('sandbox-setup', settings.endpoint),
    mutationFn: () => repository.setupSandbox(),
    onMutate: () => {
      // A fresh, explicit attempt always gets a fresh poll budget, even
      // right after a previous run gave up on the error/attempt cap.
      pollAttempts.current = 0;
      setPollExhausted(false);
    },
    onSuccess: (result) => {
      const outcome =
        result.row?.summary ||
        result.row?.detail ||
        (result.reason
          ? humanizeProtocolValue(result.reason)
          : 'Setup finished. Inspect the current status below.');
      setSetupOutcome(outcome);
      toast.message(
        result.row?.setup_progress?.status !== 'failed' &&
          (result.row?.status === 'ready' || result.row?.status === 'healthy')
          ? 'Protected execution is ready'
          : 'Protected execution setup finished',
        {
          id: `sandbox-setup:${settings.endpoint}`,
          description: result.row?.next_action || outcome,
        },
      );
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
      toast.message('Setup request disconnected', {
        id: `sandbox-setup:${settings.endpoint}`,
        description: `${vocab.agent} may still be setting up protection. Checking its status. ${error.message}`,
      }),
    onSettled: () => {
      // Unconditional and on BOTH outcomes: the desktop bridge's own
      // request timeout is generous (SANDBOX_SETUP_TIMEOUT_MS, for the UAC
      // prompt) but not infinite, so a client-side timeout on a setup that
      // is actually still running server-side must still flip this row
      // into the same poll a clean 409 would have.
      void queryClient.invalidateQueries({ queryKey: sandboxKey });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.key('service-health', settings.endpoint),
      });
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
  const reasonLabel = row?.reason ? sandboxReasonLabel(row.reason) : undefined;
  const pendingRestart = row?.reason === 'sandbox_fence_pending_restart';
  const summary = pendingRestart
    ? `Setup finished. Restart ${vocab.agent} to protect tool processes that were already running.`
    : row?.reason === 'codex_enforcement_unverified'
      ? 'Protection has not been verified on this computer. Complete setup before retrying commands.'
      : row?.summary || row?.detail || foundationSummary(integration);

  const working = setup.isPending || polling;
  const setupOffered = (status !== 'healthy' || working) && !setupUnsupported;
  const rowStatus: InfraStatus = working
    ? { tone: 'running', label: 'Setting up' }
    : status === 'healthy'
      ? { tone: 'success', label: 'Ready' }
      : row?.reason === 'codex_enforcement_unverified'
        ? { tone: 'idle', label: 'Not verified' }
        : pendingRestart
          ? { tone: 'warning', label: 'Restart needed' }
          : { tone: integrationTone(status), label: integrationStatusLabel(status) };
  const facts: KeyValueItem[] = [
    {
      label: 'Needed by the agent',
      icon: <ShieldCheckIcon />,
      value: (row?.required ?? integration.required) === false ? 'No' : 'Yes',
      mono: true,
    },
    ...(row?.codex_source
      ? [
          {
            label: 'Codex',
            icon: <TerminalIcon />,
            value: row.codex_source === 'bundled' ? 'Bundled' : 'PATH',
            mono: true,
          },
        ]
      : []),
    ...(integration.config_source
      ? [
          {
            label: 'Configured in',
            icon: <FolderIcon />,
            value: integration.config_source,
            mono: true,
          },
        ]
      : []),
  ];
  const startSetup = () => {
    setExpanded(true);
    setup.mutate();
  };

  return (
    <InfraRow
      className="cursor-pointer"
      description={reasonLabel ?? summary}
      details={
        expanded ? (
          <>
            <p className="text-[12px] whitespace-normal text-muted-foreground">{summary}</p>
            {row?.next_action ? (
              <p className="text-[12px] whitespace-normal text-muted-foreground">
                {row.next_action}
              </p>
            ) : null}
            <KeyValueGrid actionColumn className={INFRA_FACTS_GRID} items={facts} />
            {setupOutcome ? (
              <p className="text-[12px] whitespace-normal text-foreground" role="status">
                {setupOutcome}
              </p>
            ) : null}
            {setupOffered || (pendingRestart && desktop) ? (
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                {setupOffered ? (
                  <Button
                    className="px-[9px] text-[11.5px]"
                    disabled={working}
                    onClick={startSetup}
                    size="xs"
                    variant="outline"
                  >
                    {working ? (
                      <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
                    ) : (
                      <PlayIcon aria-hidden="true" />
                    )}
                    {working ? 'Setting up protected execution…' : 'Set up protected execution'}
                  </Button>
                ) : null}
                {pendingRestart && desktop ? (
                  <Button
                    className="px-[9px] text-[11.5px]"
                    disabled={restarting}
                    onClick={() => void restart()}
                    size="xs"
                    variant="outline"
                  >
                    <RetryIcon
                      aria-hidden="true"
                      className={restarting ? 'motion-safe:animate-spin' : undefined}
                    />
                    Restart {vocab.agent}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {working ? (
              <div className="text-[12px] whitespace-normal text-muted-foreground" role="status">
                <p>{row?.setup_progress?.detail || 'Starting setup…'}</p>
                <p>
                  {row?.setup_progress
                    ? `${formatDuration(row.setup_progress.elapsed_seconds * 1000)} elapsed. `
                    : ''}
                  Setup continues if you leave this page. {vocab.agent} will notify you when it
                  finishes.
                </p>
              </div>
            ) : null}
            {!polling && (pollGaveUpOnErrors || pollExhausted) ? (
              <StateView
                action={{ label: 'Try again', onClick: () => setup.mutate() }}
                kind="error"
                size="row"
                title={
                  pollGaveUpOnErrors
                    ? `Lost touch with ${vocab.agent} while waiting: ${sandbox.error instanceof Error ? sandbox.error.message : 'connection failed'}. Try again once it reconnects.`
                    : `Still waiting. This is taking longer than expected. Check ${vocab.agent} directly, or try again.`
                }
              />
            ) : null}
            {pendingRestart && !desktop ? (
              <p className="text-[12px] whitespace-normal text-foreground">
                Restart {vocab.agent} to activate protected execution for background tool processes
                already running.
              </p>
            ) : null}
            {integration.summary || integration.detail ? (
              <TechnicalDetails className="text-[12px]" title="Technical details">
                <pre className="clio-scrollbar mt-1 max-h-48 overflow-auto font-mono text-[11px] whitespace-pre-wrap break-words text-muted-foreground">
                  {[integration.summary, integration.detail].filter(Boolean).join('\n')}
                </pre>
              </TechnicalDetails>
            ) : null}
          </>
        ) : undefined
      }
      icon={<ShieldIcon />}
      onClick={() => setExpanded((open) => !open)}
      primaryAction={
        setupOffered && !pendingRestart ? (
          <InfraRowActions>
            <IconButton
              disabled={working}
              icon={
                working ? <LoaderCircleIcon className="motion-safe:animate-spin" /> : <PlayIcon />
              }
              label="Set up"
              onClick={startSetup}
              size="sm"
            />
          </InfraRowActions>
        ) : (
          <InfraRowChevron expanded={expanded} />
        )
      }
      status={rowStatus}
      title={
        <InfraRowToggle expanded={expanded}>{foundationTitle(integration.name)}</InfraRowToggle>
      }
    />
  );
}
