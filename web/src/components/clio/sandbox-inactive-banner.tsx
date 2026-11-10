import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldAlertIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { QUERY_RESULT_FIELDS } from '@/lib/query-notify';
import { SANDBOX_INACTIVE_POLL_MS, SANDBOX_RESOLVING_POLL_MS } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { TruncatedText } from './primitives/truncate';
import { sandboxVerdict, type SandboxInactive } from './sandbox-acknowledgement';

const sentence = (text: string) => text.trim().replace(/[.\s]+$/u, '');

/**
 * Every start that leaves the OS write fence off asks the person to
 * acknowledge it, as `clio start` does on a terminal: agent commands then run
 * with only the advisory permission layer. The acknowledgement lasts for this
 * app start and this verdict; a new server boot or a different verdict asks
 * again, and the banner clears once protection is active.
 */
export function SandboxInactiveBanner() {
  const repository = useRepository();
  const { credentialsReady, settings } = useConnectionSettings();
  const endpoint = settings.endpoint;
  const sandbox = useQuery({
    queryKey: queryKeys.key('sandbox-status', endpoint),
    queryFn: ({ signal }) => repository.sandboxStatus(signal),
    enabled: credentialsReady,
    refetchInterval: (query) => {
      const verdict = sandboxVerdict(query.state.data);
      if (query.state.data?.resolved === false) return SANDBOX_RESOLVING_POLL_MS;
      return typeof verdict === 'object' ? SANDBOX_INACTIVE_POLL_MS : false;
    },
  });
  // A service without the sandbox route still reports the row in its health.
  const health = useQuery({
    queryKey: queryKeys.key('service-health', endpoint),
    queryFn: ({ signal }) => repository.serviceHealth(signal),
    enabled: credentialsReady && sandbox.isError && !sandbox.data,
    notifyOnChangeProps: QUERY_RESULT_FIELDS,
  });
  const verdict = sandboxVerdict(
    sandbox.data ??
      (sandbox.isError
        ? health.data?.integrations.find((row) => row.name === 'sandbox')
        : undefined),
  );
  const current = typeof verdict === 'object' ? `${endpoint}\u0000${verdict.key}` : null;
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  // A rebooting (resolving) or protected service forgets the acknowledgement.
  if (
    acknowledged !== null &&
    (sandbox.data?.resolved === false || (verdict !== 'pending' && current !== acknowledged))
  ) {
    setAcknowledged(null);
  }
  if (!credentialsReady || typeof verdict !== 'object' || current === acknowledged) return null;
  return <SandboxInactiveStrip verdict={verdict} onAcknowledge={() => setAcknowledged(current)} />;
}

/** The strip itself: what is off, why, the next step, and the explicit acknowledgement. */
export function SandboxInactiveStrip({
  verdict,
  onAcknowledge,
}: {
  verdict: SandboxInactive;
  onAcknowledge: () => void;
}) {
  const navigate = useNavigate();
  const warning = verdict.warning ?? `${vocab.agent} will run commands without OS isolation.`;
  const detail = [
    verdict.reason ? sentence(verdict.reason) : undefined,
    verdict.nextAction ? `Next step: ${sentence(verdict.nextAction)}` : undefined,
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <section
      aria-label="Protected execution is off"
      className="flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-l-2 border-l-warning bg-warning/10 py-2 pr-1.5 pl-3 text-[12.5px]"
      data-slot="sandbox-inactive-banner"
      role="alert"
    >
      <ShieldAlertIcon aria-hidden="true" className="size-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 basis-[min(100%,20rem)]">
        <TruncatedText className="font-medium text-foreground">{warning}</TruncatedText>
        {detail ? (
          // The next step is the point of the strip, so it wraps rather than truncating.
          <p className="text-pretty break-words text-muted-foreground">{`${detail}.`}</p>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button onClick={() => navigate('/infrastructure/agent')} type="button" variant="ghost">
          Details
        </Button>
        <Button onClick={onAcknowledge} type="button" variant="outline">
          Continue without protection
        </Button>
      </div>
    </section>
  );
}
