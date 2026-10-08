import { z } from 'zod';
import { SystemRepository } from './system-repository.js';

const cancellationReply = z.object({
  results: z.array(
    z.object({ handle: z.string(), cancellation_requested: z.boolean(), status: z.string() }),
  ),
  errors: z.array(z.object({ handle: z.string(), error: z.string() })),
});

/** Shared task controls use their original owner and report per-handle failures. */
export class TaskRepository extends SystemRepository {
  public async cancelTasks(
    sessionId: string,
    tasks: string[],
    signal?: AbortSignal,
  ): Promise<void> {
    const result = await this.transport.request({
      method: 'POST',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/async-tasks/cancel`,
      body: { tasks },
      decode: (value) => cancellationReply.parse(value),
      signal,
    });
    if (result.errors.length)
      throw new Error(result.errors.map((error) => `${error.handle}: ${error.error}`).join('; '));
  }
}
