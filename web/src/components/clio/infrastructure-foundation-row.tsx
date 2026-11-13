import type { ServiceIntegrationHealth } from '@clio/core/v3';
import {
  BrainIcon,
  BrushCleaningIcon,
  CircleArrowUpIcon,
  CircleDotIcon,
  CpuIcon,
  DatabaseIcon,
  FileCogIcon,
  FolderIcon,
  FolderLockIcon,
  GitForkIcon,
  GlobeIcon,
  HardDriveIcon,
  ListTreeIcon,
  MemoryStickIcon,
  MessageSquareTextIcon,
  PackageIcon,
  PlugIcon,
  ScrollTextIcon,
  SearchIcon,
  ServerIcon,
  ShieldCheckIcon,
  WaypointsIcon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyValueGrid, type KeyValueItem } from '@/components/clio/primitives/key-value-grid';
import { INFRA_FACTS_GRID, InfraRow } from '@/components/clio/infrastructure-row';
import { InfraRowChevron, InfraRowToggle } from '@/components/clio/infrastructure-row-toggle';
import { TechnicalDetails } from '@/components/clio/technical-details';
import { Button, buttonVariants } from '@/components/ui/button';
import { AdjustIcon } from '@/lib/icon-vocabulary';
import {
  foundationMeaning,
  foundationSummary,
  foundationTitle,
  integrationStatus,
  integrationStatusLabel,
  integrationTone,
} from '@/routes/infrastructure-foundation';
import { SandboxFoundationRow } from '@/routes/infrastructure-sandbox-row';
import { t } from '@lingui/core/macro';

const FOUNDATION_ICONS: Record<string, LucideIcon> = {
  api: FolderIcon,
  arc: BrainIcon,
  gateway: WaypointsIcon,
  file_policy: FolderLockIcon,
  lm_provider: CpuIcon,
  clio_core: DatabaseIcon,
  clio_core_ram_cap: MemoryStickIcon,
  clio_core_liveness: PlugIcon,
  clio_core_daemon_memory: CircleDotIcon,
  cte_cold_tier_disk: HardDriveIcon,
  cte_store_location: FolderIcon,
  cte_metadata_log: ScrollTextIcon,
  arc_store_format: FileCogIcon,
  store_migrations: CircleArrowUpIcon,
  compaction_prompt: MessageSquareTextIcon,
  browser: GlobeIcon,
  ripgrep: SearchIcon,
  managed_packages: PackageIcon,
  sandbox_conformance: ShieldCheckIcon,
  child_reaper: BrushCleaningIcon,
  child_processes: ListTreeIcon,
  child_parentage: GitForkIcon,
};

export function FoundationRow({ integration }: { integration: ServiceIntegrationHealth }) {
  // Protected execution alone offers a fix (Set up / Restart) instead of
  // only explaining the problem, backed by the dedicated sandbox endpoint;
  // every other row stays the plain /v1/health projection below.
  if (integration.name === 'sandbox') return <SandboxFoundationRow integration={integration} />;
  return <HealthFoundationRow integration={integration} />;
}

/** One /v1/health row: name over what it means, its state, and its facts when opened. */
function HealthFoundationRow({ integration }: { integration: ServiceIntegrationHealth }) {
  const [expanded, setExpanded] = useState(false);
  const status = integrationStatus(integration.status);
  const action = foundationAction(integration);
  const Icon = FOUNDATION_ICONS[integration.name] ?? ServerIcon;
  // A ready row reads only its name and "Ready"; what it means moves into its opened details.
  const nextStep =
    integration.next_action ||
    action?.description ||
    (status === 'healthy' ? foundationMeaning(integration) || integration.summary : undefined);
  const facts: KeyValueItem[] = [
    {
      label: t`Needed by the agent`,
      icon: <ShieldCheckIcon />,
      value: integration.required === false ? t`No` : t`Yes`,
      mono: true,
    },
    ...(integration.endpoint
      ? [{ label: t`Endpoint`, icon: <PlugIcon />, value: integration.endpoint, mono: true }]
      : []),
    ...(integration.config_source
      ? [
          {
            label: t`Configured in`,
            icon: <FolderIcon />,
            value: integration.config_source,
            mono: true,
          },
        ]
      : []),
  ];
  // The raw health record stands in when the server gave no summary, so the
  // row always offers its technical details beside the fix.
  const technical =
    [...new Set([integration.summary, integration.detail].filter(Boolean))].join('\n') ||
    JSON.stringify(integration, null, 2);
  const actionLink = action ? (
    <Button asChild className="px-[9px] text-label" size="xs" variant="outline">
      <Link to={action.to}>
        <AdjustIcon aria-hidden="true" />
        {action.label}
      </Link>
    </Button>
  ) : null;
  return (
    <InfraRow
      className="cursor-pointer"
      description={foundationSummary(integration)}
      details={
        expanded ? (
          <>
            {nextStep ? (
              <p className="text-meta whitespace-normal text-muted-foreground">{nextStep}</p>
            ) : null}
            <KeyValueGrid actionColumn className={INFRA_FACTS_GRID} items={facts} />
            {technical ? (
              <TechnicalDetails
                beside={actionLink}
                className="text-meta"
                summaryClassName={buttonVariants({
                  className: 'px-[9px] text-label text-foreground',
                  size: 'xs',
                  variant: 'ghost',
                })}
                title={t`Technical details`}
              >
                <pre className="clio-scrollbar mt-1 max-h-48 overflow-auto font-mono text-caption whitespace-pre-wrap break-words text-muted-foreground">
                  {technical}
                </pre>
              </TechnicalDetails>
            ) : actionLink ? (
              <div className="flex min-w-0 items-center gap-1">{actionLink}</div>
            ) : null}
          </>
        ) : undefined
      }
      icon={<Icon />}
      onClick={() => setExpanded((open) => !open)}
      primaryAction={<InfraRowChevron expanded={expanded} />}
      status={{ tone: integrationTone(status), label: integrationStatusLabel(status) }}
      title={
        <InfraRowToggle expanded={expanded}>{foundationTitle(integration.name)}</InfraRowToggle>
      }
    />
  );
}

function foundationAction(
  integration: ServiceIntegrationHealth,
): { description: string; label: string; to: string } | undefined {
  if (integrationStatus(integration.status) === 'healthy') return undefined;
  // The server is the sole authority on whether an integration's absence
  // blocks usage; no client-side name-based override. `sandbox` never
  // reaches here: it renders through SandboxFoundationRow instead.
  if (integration.required === false) return undefined;
  if (integration.name === 'arc') {
    return {
      description: t`Use the full conversation-memory service to restore complete agent behavior.`,
      label: t`Memory settings`,
      to: '/settings/memory',
    };
  }
  if (integration.name === 'lm_provider') {
    return {
      description: t`Sign-in is stored locally. Check the provider connection and its available models.`,
      label: t`Provider setup`,
      to: '/settings/providers',
    };
  }
  if (integration.name === 'child_parentage') {
    return {
      description: t`Restart or clean up detached background work on the connected agent.`,
      label: t`System settings`,
      to: '/settings/system',
    };
  }
  return {
    description: t`Review the technical details before using work that depends on this service.`,
    label: t`System settings`,
    to: '/settings/system',
  };
}
