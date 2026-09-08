import { z } from 'zod';
import { McpAppRepository } from './mcp-app-repository.js';
import { sessionWorkSchema, type SessionWork } from './work-state.js';

const pageSchema = z.object({
  text: z.string(),
  cursor: z.number().int().nonnegative(),
  next_cursor: z.number().int().nonnegative().nullable(),
  total_chars: z.number().int().nonnegative(),
});

/** On-demand semantic content transport; independent of model observations. */
export class PresentationRepository extends McpAppRepository {
  /** Read retained work state without changing the agent's execution. */
  public sessionWork(sessionId: string, cursor = 0, signal?: AbortSignal): Promise<SessionWork> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/work?cursor=${cursor}`,
      decode: (value) => sessionWorkSchema.parse(value),
      signal,
    });
  }

  public toolPresentationContent(
    sessionId: string,
    callId: string,
    blockId: string,
    cursor: number,
    signal?: AbortSignal,
  ) {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/tools/${encodeURIComponent(callId)}/presentation/${encodeURIComponent(blockId)}?cursor=${cursor}`,
      decode: (value) => pageSchema.parse(value),
      signal,
    });
  }
}
