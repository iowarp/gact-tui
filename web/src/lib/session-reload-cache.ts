import {
  a2uiSurfaceSchema,
  artifactSchema,
  messageSchema,
  sessionSchema,
  subagentSchema,
  taskSchema,
  toolInvocationSchema,
  workspaceSchema,
  type TranscriptSnapshot,
  type Session,
  type Workspace,
} from '@clio/core/v3';
import { z } from 'zod';

const CACHE_VERSION = 'v1';
const MAX_TRANSCRIPT_MESSAGES = 16;
const MAX_TRANSCRIPT_CACHE_CHARS = 900_000;

const transcriptCacheSchema = z.object({
  cursor: z.string().optional(),
  messages: z.array(messageSchema),
  tools: z.array(toolInvocationSchema),
  tasks: z.array(taskSchema),
  subagents: z.array(subagentSchema),
  artifacts: z.array(artifactSchema),
  surfaces: z.array(a2uiSurfaceSchema),
});

function cacheKey(endpoint: string, kind: string, id = ''): string {
  return `clio.reload.${CACHE_VERSION}:${encodeURIComponent(endpoint)}:${kind}:${encodeURIComponent(id)}`;
}

function readCache<T>(key: string, schema: z.ZodType<T>): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = window.sessionStorage.getItem(key);
    if (!value) return undefined;
    const parsed = schema.safeParse(JSON.parse(value));
    if (parsed.success) return parsed.data;
    window.sessionStorage.removeItem(key);
  } catch {
    // A stale or unavailable browser cache may never block authoritative reads.
  }
  return undefined;
}

function writeCache(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage limits and privacy modes degrade to the existing network-first path.
  }
}

/** Returns the last validated workspace list for immediate reload chrome. */
export function readReloadWorkspaces(endpoint: string): Workspace[] | undefined {
  return readCache(cacheKey(endpoint, 'workspaces'), workspaceSchema.array()) as
    | Workspace[]
    | undefined;
}

/** Keeps a tab-scoped workspace list available across a browser reload. */
export function writeReloadWorkspaces(endpoint: string, workspaces: readonly Workspace[]): void {
  writeCache(cacheKey(endpoint, 'workspaces'), workspaces);
}

/** Returns the last validated session list for one workspace. */
export function readReloadSessions(endpoint: string, workspaceId: string): Session[] | undefined {
  return readCache(cacheKey(endpoint, 'sessions', workspaceId), sessionSchema.array()) as
    | Session[]
    | undefined;
}

/** Keeps one workspace's navigation and active session metadata warm on reload. */
export function writeReloadSessions(
  endpoint: string,
  workspaceId: string,
  sessions: readonly Session[],
): void {
  writeCache(cacheKey(endpoint, 'sessions', workspaceId), sessions);
}

/** Returns the last cross-workspace session index for immediate navigation. */
export function readReloadAllSessions(endpoint: string): Session[] | undefined {
  return readCache(cacheKey(endpoint, 'all-sessions'), sessionSchema.array()) as
    | Session[]
    | undefined;
}

/** Keeps the cross-workspace session index warm for one browser tab. */
export function writeReloadAllSessions(endpoint: string, sessions: readonly Session[]): void {
  writeCache(cacheKey(endpoint, 'all-sessions'), sessions);
}

/** Returns a bounded, validated transcript tail while the authoritative snapshot loads. */
export function readReloadTranscript(
  endpoint: string,
  sessionId: string,
): TranscriptSnapshot | undefined {
  const cached = readCache(cacheKey(endpoint, 'transcript', sessionId), transcriptCacheSchema);
  return cached as TranscriptSnapshot | undefined;
}

/** Stores complete recent messages and their referenced entities without retaining full history. */
export function writeReloadTranscript(
  endpoint: string,
  sessionId: string,
  transcript: TranscriptSnapshot,
): void {
  let messages = transcript.messages.slice(-MAX_TRANSCRIPT_MESSAGES);
  let candidate = transcriptTail(transcript, messages);
  while (messages.length > 0 && JSON.stringify(candidate).length > MAX_TRANSCRIPT_CACHE_CHARS) {
    messages = messages.slice(1);
    candidate = transcriptTail(transcript, messages);
  }
  writeCache(cacheKey(endpoint, 'transcript', sessionId), candidate);
}

function transcriptTail(
  transcript: TranscriptSnapshot,
  messages: TranscriptSnapshot['messages'],
): TranscriptSnapshot {
  const referenced = new Set(
    messages.flatMap((message) =>
      message.blocks.flatMap((block) =>
        Object.entries(block)
          .filter(([key, value]) => key.endsWith('_id') && typeof value === 'string')
          .map(([, value]) => value as string),
      ),
    ),
  );
  return {
    cursor: transcript.cursor,
    messages,
    tools: transcript.tools.filter((item) => referenced.has(item.id)),
    tasks: transcript.tasks.filter((item) => referenced.has(item.id)),
    subagents: transcript.subagents.filter((item) => referenced.has(item.id)),
    artifacts: transcript.artifacts.filter((item) => referenced.has(item.id)),
    surfaces: transcript.surfaces.filter((item) => referenced.has(item.id)),
  };
}
