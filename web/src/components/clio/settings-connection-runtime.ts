import { useQuery } from '@tanstack/react-query';
import { brand } from '@brand';
import { useCallback } from 'react';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';
import { useRepository } from '@/hooks/use-repository';
import { latestPublishedRelease, ReleaseFeedRateLimited } from '@/lib/github-releases';
import { queryKeys } from '@/lib/query-keys';
import { compareReleaseVersions, displayReleaseVersion } from '@/lib/release-version';
import { QUERY_RETRY_COUNT } from '@/lib/runtime-limits';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { useUpdateChannel } from '@/lib/update-channel';
import { useConnectionSettings } from '@/providers/connection-provider';
import { normalizeEndpoint } from '@/lib/connection';
import { agentCheckIssue } from './version-check-issue';

export const CONNECTION_FIELD =
  'h-[1.875rem] w-full rounded-md px-[9px] text-[0.78125rem] placeholder:text-faint md:text-[0.78125rem]';

/** The address error in words, or undefined when it can be used. */
export function endpointError(value: string): string | undefined {
  if (!value.trim()) return 'Enter the agent’s address.';
  try {
    normalizeEndpoint(value.trim());
    return undefined;
  } catch (error) {
    return error instanceof Error && !(error instanceof TypeError)
      ? error.message
      : 'Enter a full address, such as https://agent.example.org.';
  }
}

export interface ConnectionRuntime {
  /** The connected agent's release, when it reports one. */
  version?: string;
  latestVersion?: string;
  status: { tone: StatusTone; label: string; detail: string };
  /** The capabilities request failed: the row shows the error and a Retry. */
  unreachable: boolean;
  /** Features this agent lacks, in plain words; internal protocol gaps are left out. */
  degradations: string[];
  checking: boolean;
  recheck: () => void;
}

/** Product names for the capability flags an agent can report as missing. */
const FEATURE_NAMES: Record<string, string> = {
  a2ui: 'Rich results',
  agent_routing: 'Agent routing',
  agent_write: 'Creating and editing agents',
  attachments_upload: 'Attachment upload',
  commands: 'Commands',
  cost_tracking: 'Cost tracking',
  diffs: 'Change review',
  edit_modes: 'Edit modes',
  files: 'Files',
  hooks: 'Hooks',
  integration_health: 'Integration health',
  lsp: 'Code intelligence',
  mcp: 'MCP servers',
  memory: 'Memory',
  metrics: 'Usage',
  multimodal_image_parts: 'Images in messages',
  permissions: 'Permissions',
  plan_mode: 'Plan mode',
  providers: 'Providers',
  scheduled_sessions: 'Scheduled work',
  search_messages: 'Message search',
  session_branching: 'Branching conversations',
  session_export: 'Conversation export',
  session_sharing: 'Conversation sharing',
  session_summary: 'Conversation summaries',
  session_tasks: 'Tasks',
  sessions: 'Conversations',
  skills_extraction: 'Skill extraction',
  subagents: 'Subagents',
  thinking_blocks: 'Thinking',
  voice: 'Voice input',
  workspaces: 'Workspaces',
};

/**
 * The missing features a person can act on, named as the product names them.
 * Protocol extensions (`x_*`) and unmapped transport flags are not features.
 */
export function unavailableFeatures(
  degradations: { code: string; reason: string; capability?: string }[],
): string[] {
  const names = degradations.flatMap((item) => {
    if (item.code === 'capability_projection_dropped') return [];
    if (!item.capability) return item.code === 'capability_unavailable' ? [] : [item.reason];
    const name = FEATURE_NAMES[item.capability];
    return name ? [name] : [];
  });
  return [...new Set(names)];
}

/** This app's build version, stamped by `vite.config.ts`. */
export function interfaceVersion(): string | undefined {
  const stamped: unknown = import.meta.env.VITE_CLIO_WORKSPACE_VERSION;
  return displayReleaseVersion(typeof stamped === 'string' ? stamped : undefined);
}

/** How the app reaches the agent, as the CLIO menu names it. */
export function connectionTransport(infrastructureRoute: boolean): 'Bridge' | 'Direct' | 'SSH' {
  if (infrastructureRoute) return 'SSH';
  return inTauri() ? 'Bridge' : 'Direct';
}

/**
 * The connected agent's runtime and whether a newer release exists. Uses the
 * same query entries as the version status in the navigation, so this page
 * never adds a request when the answer is cached.
 */
export function useConnectionRuntime(): ConnectionRuntime {
  const repository = useRepository();
  const updateChannel = useUpdateChannel();
  const { credentialsReady = true, settings } = useConnectionSettings();
  const capabilities = useQuery({
    enabled: credentialsReady,
    queryKey: queryKeys.key('capabilities', settings.endpoint),
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  const latest = useQuery({
    enabled: credentialsReady,
    queryKey: [...queryKeys.key('latest-release', settings.endpoint), updateChannel],
    queryFn: async ({ signal }) => {
      if (updateChannel === 'stable') return repository.latestRelease(signal);
      if (!brand.agentReleaseUrl) throw new Error('No beta release feed is configured.');
      const release = await latestPublishedRelease(brand.agentReleaseUrl, updateChannel, signal);
      return {
        version: release.tag_name,
        source: `${brand.agentReleaseUrl}/tag/${release.tag_name}`,
        checked_at: new Date().toISOString(),
        degradation: null,
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: (failures, error) =>
      !(error instanceof ReleaseFeedRateLimited) && failures < QUERY_RETRY_COUNT,
  });
  const { refetch: refetchCapabilities } = capabilities;
  const { refetch: refetchLatest } = latest;
  const recheck = useCallback(() => {
    void refetchCapabilities();
    void refetchLatest();
  }, [refetchCapabilities, refetchLatest]);

  const version = displayReleaseVersion(capabilities.data?.service?.version);
  const latestVersion = displayReleaseVersion(latest.data?.version ?? undefined);
  const checking = capabilities.isFetching || latest.isFetching;
  const issue = agentCheckIssue(latest.data, latest.isError, latest.error);
  const status = ((): ConnectionRuntime['status'] => {
    if (capabilities.isError) {
      return {
        tone: 'error',
        label: 'Not reachable',
        detail: 'The agent did not answer. Check that it is running, then retry.',
      };
    }
    if (capabilities.isPending || latest.isPending) {
      return { tone: 'running', label: 'Checking', detail: 'Checking for a newer release.' };
    }
    if (version && latestVersion && compareReleaseVersions(version, latestVersion) < 0) {
      return {
        tone: 'info',
        label: 'Update available',
        detail: `${latestVersion} is available.`,
      };
    }
    if (version && latestVersion) {
      return { tone: 'success', label: 'Up to date', detail: `${latestVersion} is the latest.` };
    }
    return {
      tone: 'idle',
      label: 'Not checked',
      detail: issue?.text ?? 'No release to compare with.',
    };
  })();
  return {
    version,
    latestVersion,
    status,
    unreachable: capabilities.isError,
    degradations: unavailableFeatures(capabilities.data?.degradations ?? []),
    checking,
    recheck,
  };
}
