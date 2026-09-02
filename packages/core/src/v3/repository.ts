import { z } from 'zod';
import type {
  Artifact,
  ArtifactDetail,
  ArtifactLineage,
  ArtifactRecord,
  CapabilityNegotiation,
  ApprovalRequest,
  PermissionLedgerItem,
  OperationalRun,
  CreateScheduledTurnInput,
  ScheduledTurn,
  ScheduledTurns,
  Session,
  SessionArtifactListing,
  SessionDefaults,
  TranscriptSnapshot,
  TurnAttempt,
  Workspace,
  WorkspaceFileEntry,
  RelayStatus,
  RelayConnectionInput,
  ToolCatalogItem,
  UserQuestion,
} from './domain.js';
import type { AgentDefinition } from './agent-domain.js';
import {
  capabilitiesSchema,
  operationalRunSchema,
  sessionSchema,
  turnAttemptSchema,
  workspaceSchema,
  relayStatusSchema,
  scheduledTurnSchema,
  scheduledTurnsSchema,
  sessionDefaultsSchema,
  userQuestionSchema,
} from './schemas.js';
import {
  agentListSchema,
  artifactDetailSchema,
  artifactLineageSchema,
  sessionArtifactListingSchema,
  operationalRunListSchema,
  permissionListSchema,
  questionListSchema,
  sessionListSchema,
  toolCatalogSchema,
  transcriptSchema,
  workspaceFileListSchema,
  workspaceListSchema,
} from './repository-decoders.js';
import {
  readArtifactWithCustodyFallback,
  readBytesPath,
  readTextPath,
} from './artifact-custody.js';
import type { ClioTransport, StreamScope, TransportFrame } from './transport.js';
import { ComposerRepository } from './composer-repository.js';

/**
 * Artifact records requested per page while walking a session's registry.
 * Unit: records. Larger pages mean fewer round trips; the backend caps the
 * value it will honour, so raising this alone does not widen a page.
 */
const ARTIFACT_PAGE_SIZE = 200;
/**
 * Pages the walk will follow before it stops and reports a truncated listing.
 * Unit: pages. A runaway backstop against a backend that keeps handing back
 * cursors: at the page size above this is a ceiling of 20,000 records, far
 * past any real session. Reaching it is reported as `page_cap_reached`, never
 * silently swallowed.
 */
const MAX_ARTIFACT_PAGES = 100;

export class ClioRepository extends ComposerRepository {
  public constructor(transport: ClioTransport) {
    super(transport);
  }

  public capabilities(signal?: AbortSignal): Promise<CapabilityNegotiation> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/capabilities',
      decode: (value) => capabilitiesSchema.parse(value),
      signal,
    });
  }

  public async workspaces(signal?: AbortSignal): Promise<Workspace[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/workspaces',
      decode: (value) => workspaceListSchema.parse(value),
      signal,
    });
    return result.workspaces;
  }

  public createWorkspace(
    input: { name: string; root_path: string; pinned?: boolean },
    signal?: AbortSignal,
  ): Promise<Workspace> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/workspaces',
      body: {
        name: input.name,
        root_path: input.root_path,
        metadata: input.pinned === undefined ? {} : { pinned: input.pinned },
      },
      decode: (value) => workspaceSchema.parse(value),
      signal,
    });
  }

  public updateWorkspace(
    workspaceId: string,
    input: { name?: string; pinned?: boolean; root_path?: string },
    signal?: AbortSignal,
  ): Promise<Workspace> {
    return this.transport.request({
      method: 'PATCH',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
      body: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.pinned === undefined ? {} : { metadata: { pinned: input.pinned } }),
        ...(input.root_path === undefined ? {} : { root_path: input.root_path }),
      },
      decode: (value) => workspaceSchema.parse(value),
      signal,
    });
  }

  public grantWorkspaceFolder(
    workspaceId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/grants`,
      body: { kind: 'fs_root', pattern: path },
      decode: (value) => value,
      signal,
    });
  }

  public revokeWorkspaceFolder(
    workspaceId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const query = new URLSearchParams({ kind: 'fs_root', pattern: path });
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/grants?${query.toString()}`,
      decode: (value) => value,
      signal,
    });
  }

  public deleteWorkspace(workspaceId: string, signal?: AbortSignal): Promise<void> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
      decode: () => undefined,
      signal,
    });
  }

  public async sessions(workspaceId: string, signal?: AbortSignal): Promise<Session[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions?workspace_id=${encodeURIComponent(workspaceId)}`,
      decode: (value) => sessionListSchema.parse(value),
      signal,
    });
    return result.sessions;
  }

  public createSession(
    input: {
      workspace_id: string;
      title: string;
      provider_id?: string;
      model_id?: string;
      pinned?: boolean;
      mode?: 'plan' | 'edit' | 'architect';
      routing_mode?: 'auto' | 'chat' | 'experts' | 'reasoning_only';
      approval_mode?: 'ask' | 'auto-edits' | 'bypass' | 'ai-review' | 'spotter-ai';
    },
    signal?: AbortSignal,
  ): Promise<Session> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/sessions',
      body: {
        workspace_id: input.workspace_id,
        title: input.title,
        ...(input.provider_id || input.model_id
          ? { model: { provider_id: input.provider_id ?? '', model_id: input.model_id ?? '' } }
          : {}),
        ...(input.pinned === undefined ? {} : { metadata: { pinned: input.pinned } }),
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.routing_mode ? { routing_mode: input.routing_mode } : {}),
        ...(input.approval_mode ? { approval_mode: input.approval_mode } : {}),
      },
      decode: (value) => sessionSchema.parse(value),
      signal,
    });
  }

  public updateSession(
    sessionId: string,
    input: {
      title?: string;
      pinned?: boolean;
      archived?: boolean;
      mode?: Session['mode'];
      edit_mode?: Session['edit_mode'];
      routing_mode?: Session['routing_mode'];
      approval_mode?: Session['approval_mode'];
      provider_id?: string;
      model_id?: string;
    },
    signal?: AbortSignal,
  ): Promise<Session> {
    return this.transport.request({
      method: 'PATCH',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}`,
      body: {
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.pinned === undefined ? {} : { metadata: { pinned: input.pinned } }),
        ...(input.archived === undefined ? {} : { archived: input.archived }),
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        ...(input.edit_mode === undefined ? {} : { edit_mode: input.edit_mode }),
        ...(input.routing_mode === undefined ? {} : { routing_mode: input.routing_mode }),
        ...(input.approval_mode === undefined ? {} : { approval_mode: input.approval_mode }),
        ...(input.provider_id || input.model_id
          ? { model: { provider_id: input.provider_id ?? '', model_id: input.model_id ?? '' } }
          : {}),
      },
      decode: (value) => sessionSchema.parse(value),
      signal,
    });
  }

  public deleteSession(sessionId: string, signal?: AbortSignal): Promise<void> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}`,
      decode: () => undefined,
      signal,
    });
  }

  public sessionDefaults(signal?: AbortSignal): Promise<SessionDefaults> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/session-defaults',
      decode: (value) => sessionDefaultsSchema.parse(value),
      signal,
    });
  }

  public updateSessionDefaults(
    input: Partial<SessionDefaults>,
    signal?: AbortSignal,
  ): Promise<SessionDefaults> {
    return this.transport.request({
      method: 'PATCH',
      path: '/v1/session-defaults',
      body: input,
      decode: (value) => sessionDefaultsSchema.parse(value),
      signal,
    });
  }

  public async scheduledTurns(sessionId: string, signal?: AbortSignal): Promise<ScheduledTurns> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/schedules`,
      decode: (value) => scheduledTurnsSchema.parse(value),
      signal,
    });
    return {
      schedules: result.schedules,
      timezone: result.cron_timezone,
    };
  }

  public createScheduledTurn(
    sessionId: string,
    input: CreateScheduledTurnInput,
    signal?: AbortSignal,
  ): Promise<ScheduledTurn> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/schedules`,
      body: input,
      decode: (value) => scheduledTurnSchema.parse(value),
      signal,
    });
  }

  public deleteScheduledTurn(scheduleId: string, signal?: AbortSignal): Promise<void> {
    return this.transport.request({
      method: 'DELETE',
      path: `/v1/schedules/${encodeURIComponent(scheduleId)}`,
      decode: () => undefined,
      signal,
    });
  }

  public async allSessions(signal?: AbortSignal): Promise<Session[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/sessions?include_all_workspaces=true',
      decode: (value) => sessionListSchema.parse(value),
      signal,
    });
    return result.sessions;
  }

  public async runs(signal?: AbortSignal): Promise<OperationalRun[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/runs',
      decode: (value) => operationalRunListSchema.parse(value),
      signal,
    });
    return result.runs;
  }

  public async workspaceFiles(
    workspaceId: string,
    signal?: AbortSignal,
  ): Promise<WorkspaceFileEntry[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/files`,
      decode: (value) => workspaceFileListSchema.parse(value),
      signal,
    });
    return result.entries.filter((entry) => !entry.internal) as WorkspaceFileEntry[];
  }

  public readWorkspaceFile(
    workspaceId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/workspaces/${encodeURIComponent(workspaceId)}/files/read?path=${encodeURIComponent(path)}`,
      responseType: 'text',
      decode: (value) => z.string().parse(value),
      signal,
    });
  }

  public readWorkspaceFileBytes(
    workspaceId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return readBytesPath(
      this.transport,
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/files/read?path=${encodeURIComponent(path)}`,
      signal,
    );
  }

  public relayStatus(signal?: AbortSignal): Promise<RelayStatus> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/relay/status',
      decode: (value) => relayStatusSchema.parse(value),
      signal,
    });
  }

  public configureRelay(input: RelayConnectionInput, signal?: AbortSignal): Promise<RelayStatus> {
    return this.transport.request({
      method: 'PUT',
      path: '/v1/relay/configuration',
      body: input,
      decode: (value) => relayStatusSchema.parse(value),
      signal,
    });
  }

  public disconnectRelay(signal?: AbortSignal): Promise<RelayStatus> {
    return this.transport.request({
      method: 'DELETE',
      path: '/v1/relay/configuration',
      decode: (value) => relayStatusSchema.parse(value),
      signal,
    });
  }

  public async tools(signal?: AbortSignal): Promise<ToolCatalogItem[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/tools',
      decode: (value) => toolCatalogSchema.parse(value),
      signal,
    });
    return result.tools as ToolCatalogItem[];
  }

  public async agents(signal?: AbortSignal): Promise<AgentDefinition[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/agents',
      decode: (value) => agentListSchema.parse(value),
      signal,
    });
    return result.agents as AgentDefinition[];
  }

  public async readArtifactText(
    artifactId: string,
    fetchPath?: string,
    signal?: AbortSignal,
  ): Promise<string> {
    return readArtifactWithCustodyFallback(
      artifactId,
      fetchPath,
      (path, requestSignal) => readTextPath(this.transport, path, requestSignal),
      signal,
    );
  }

  public readArtifactBytes(
    artifactId: string,
    fetchPath?: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return readArtifactWithCustodyFallback(
      artifactId,
      fetchPath,
      (path, requestSignal) => readBytesPath(this.transport, path, requestSignal),
      signal,
    );
  }

  /** Reads a registered artifact's bytes through the server's own fetch path. */
  public readArtifactBytesFor(artifact: Artifact, signal?: AbortSignal): Promise<Uint8Array> {
    return this.readArtifactBytes(artifact.id, artifact.fetch_path, signal);
  }

  /** Reads a registered artifact's text through the server's own fetch path. */
  public readArtifactTextFor(artifact: Artifact, signal?: AbortSignal): Promise<string> {
    return this.readArtifactText(artifact.id, artifact.fetch_path, signal);
  }

  public artifactDetail(artifactId: string, signal?: AbortSignal): Promise<ArtifactDetail> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}`,
      decode: (value) => artifactDetailSchema.parse(value),
      signal,
    });
  }

  /** Reads the complete session artifact registry, including descendant outputs and used inputs. */
  public async sessionArtifacts(
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<SessionArtifactListing> {
    const produced = new Map<string, ArtifactRecord>();
    const used = new Map<string, ArtifactRecord>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    let childSessionIds: string[] = [];
    let includeChildren = false;

    for (let pageIndex = 0; pageIndex < MAX_ARTIFACT_PAGES; pageIndex += 1) {
      const query = new URLSearchParams({
        include_children: 'true',
        include_used: 'true',
        limit: String(ARTIFACT_PAGE_SIZE),
      });
      if (cursor) query.set('before', cursor);
      const page = await this.transport.request({
        method: 'GET',
        path: `/v1/sessions/${encodeURIComponent(sessionId)}/artifacts?${query.toString()}`,
        decode: (value) => sessionArtifactListingSchema.parse(value),
        signal,
      });
      includeChildren ||= page.include_children;
      childSessionIds = page.child_session_ids;
      for (const record of page.artifacts) {
        produced.set(`${record.workspace_id}:${record.name}`, record);
      }
      for (const record of page.used) {
        used.set(`${record.workspace_id}:${record.name}`, record);
      }
      if (!page.next_cursor) {
        return {
          artifacts: [...produced.values()],
          used: [...used.values()],
          count: produced.size,
          include_children: includeChildren,
          child_session_ids: childSessionIds,
        };
      }
      if (seenCursors.has(page.next_cursor)) {
        return {
          artifacts: [...produced.values()],
          used: [...used.values()],
          count: produced.size,
          include_children: includeChildren,
          child_session_ids: childSessionIds,
          truncated: 'cursor_cycle_detected',
        };
      }
      seenCursors.add(page.next_cursor);
      cursor = page.next_cursor;
    }
    return {
      artifacts: [...produced.values()],
      used: [...used.values()],
      count: produced.size,
      include_children: includeChildren,
      child_session_ids: childSessionIds,
      truncated: 'page_cap_reached',
    };
  }

  public artifactLineage(
    artifactId: string,
    options: { direction?: 'upstream' | 'downstream' | 'both'; depth?: number } = {},
    signal?: AbortSignal,
  ): Promise<ArtifactLineage> {
    const query = new URLSearchParams({
      direction: options.direction ?? 'both',
      depth: String(options.depth ?? 5),
    });
    return this.transport.request({
      method: 'GET',
      path: `/v1/artifacts/${encodeURIComponent(artifactId)}/lineage?${query.toString()}`,
      decode: (value) => artifactLineageSchema.parse(value),
      signal,
    });
  }

  public exportArtifact(artifactId: string, signal?: AbortSignal): Promise<Uint8Array> {
    return readBytesPath(
      this.transport,
      `/v1/artifacts/${encodeURIComponent(artifactId)}/export`,
      signal,
    );
  }

  public detachRun(handleId: string, signal?: AbortSignal): Promise<OperationalRun> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/runs/${encodeURIComponent(handleId)}/detach`,
      decode: (value) => operationalRunSchema.parse(value),
      signal,
    });
  }

  public dismissRun(handleId: string, signal?: AbortSignal): Promise<void> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/runs/${encodeURIComponent(handleId)}/dismiss`,
      decode: () => undefined,
      signal,
    });
  }

  public cancelAgentTask(taskId: string, signal?: AbortSignal): Promise<void> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/agent-tasks/${encodeURIComponent(taskId)}/cancel`,
      decode: () => undefined,
      signal,
    });
  }

  public async permissions(
    signal?: AbortSignal,
    filters?: { sessionId?: string; status?: string },
  ): Promise<PermissionLedgerItem[]> {
    const query = new URLSearchParams();
    if (filters?.sessionId) query.set('session_id', filters.sessionId);
    if (filters?.status) query.set('status', filters.status);
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/permissions${query.size ? `?${query.toString()}` : ''}`,
      decode: (value) => permissionListSchema.parse(value),
      signal,
    });
    return result.permissions as PermissionLedgerItem[];
  }

  public async pendingApprovals(
    sessionId?: string,
    signal?: AbortSignal,
  ): Promise<ApprovalRequest[]> {
    const permissions = await this.permissions(signal, { sessionId, status: 'pending' });
    return permissions.map((permission) => ({
      id: permission.id,
      session_id: permission.session_id,
      tool_name: permission.tool_name,
      input: permission.input,
      summary: permission.summary,
      reason: permission.reason,
      risk: permission.risk,
      status: 'pending',
      created_at: permission.created_at,
    }));
  }

  public respondPermission(
    permissionId: string,
    action: 'allow' | 'deny' | 'allow_session' | 'allow_workspace',
    signal?: AbortSignal,
  ): Promise<void> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/permissions/${encodeURIComponent(permissionId)}`,
      body: { action },
      decode: () => undefined,
      signal,
    });
  }

  public async questions(
    sessionId: string,
    signal?: AbortSignal,
    status?: UserQuestion['status'],
  ): Promise<UserQuestion[]> {
    const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/questions${suffix}`,
      decode: (value) => questionListSchema.parse(value),
      signal,
    });
    return result.questions;
  }

  /**
   * Reads questions from the unscoped `/v1/questions` endpoint, optionally
   * filtered to one session. Mirrors `permissions`/`pendingApprovals`: the
   * endpoint itself accepts an optional `session_id`, so omitting it reads
   * every session's questions, including sessions this view has not
   * otherwise fetched — the same shape a descendant session's approval
   * already relies on.
   */
  public async allQuestions(
    signal?: AbortSignal,
    filters?: { sessionId?: string; status?: UserQuestion['status'] },
  ): Promise<UserQuestion[]> {
    const query = new URLSearchParams();
    if (filters?.sessionId) query.set('session_id', filters.sessionId);
    if (filters?.status) query.set('status', filters.status);
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/questions${query.size ? `?${query.toString()}` : ''}`,
      decode: (value) => questionListSchema.parse(value),
      signal,
    });
    return result.questions;
  }

  public async pendingQuestions(
    sessionId?: string,
    signal?: AbortSignal,
  ): Promise<UserQuestion[]> {
    return this.allQuestions(signal, { sessionId, status: 'pending' });
  }

  public answerQuestion(
    sessionId: string,
    questionId: string,
    answer: { answer?: string; selected_options?: string[] },
    signal?: AbortSignal,
  ): Promise<UserQuestion> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/answer`,
      body: answer,
      decode: (value) => userQuestionSchema.parse(value),
      signal,
    });
  }

  public cancelQuestion(
    sessionId: string,
    questionId: string,
    signal?: AbortSignal,
  ): Promise<UserQuestion> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/cancel`,
      decode: (value) => userQuestionSchema.parse(value),
      signal,
    });
  }

  public async transcript(sessionId: string, signal?: AbortSignal): Promise<TranscriptSnapshot> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
      decode: (value) => transcriptSchema.parse(value),
      signal,
    });
    return {
      cursor: result.cursor,
      messages: result.messages,
      tools: result.tools,
      tasks: result.tasks,
      subagents: result.subagents,
      artifacts: result.artifacts,
      surfaces: result.surfaces,
    };
  }

  public retryTurn(
    sessionId: string,
    messageId: string,
    input: {
      execute?: boolean;
      notes?: string;
      provider_id?: string;
      model_id?: string;
    } = {},
    signal?: AbortSignal,
  ): Promise<TurnAttempt> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/retry`,
      body: input,
      decode: (value) => turnAttemptSchema.parse(value),
      signal,
    });
  }

  public cancelSession(sessionId: string, signal?: AbortSignal): Promise<void> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/cancel`,
      decode: () => undefined,
      signal,
    });
  }

  public agentTask(
    taskId: string,
    signal?: AbortSignal,
  ): Promise<{ task_id: string; parent_session_id: string; child_session_id: string }> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/agent-tasks/${encodeURIComponent(taskId)}`,
      decode: (value) =>
        z
          .object({
            task_id: z.string(),
            parent_session_id: z.string(),
            child_session_id: z.string(),
          })
          .parse(value),
      signal,
    });
  }

  public a2uiAction(
    sessionId: string,
    message: unknown,
    correlation?: { run_id?: string; message_id?: string; part_id?: string },
    signal?: AbortSignal,
  ): Promise<{ status: string }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/a2ui/actions`,
      body: { message, correlation },
      decode: (value) => z.object({ status: z.string() }).passthrough().parse(value),
      signal,
    });
  }

  public stream(
    scope: StreamScope,
    cursor?: string,
    signal?: AbortSignal,
  ): AsyncIterable<TransportFrame> {
    return this.transport.stream(scope, cursor, signal);
  }
}
