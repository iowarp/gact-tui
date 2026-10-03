import { z } from 'zod';
import { transcriptSchema } from './repository-decoders.js';
import { messageSchema } from './schemas.js';

const envelopeSchema = transcriptSchema.extend({ messages: z.array(z.unknown()) });
const BATCH_SIZE = 32;

/** Validate long snapshots without blocking streamed updates and browser input. */
export async function decodeTranscript(value: unknown, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const envelope = envelopeSchema.parse(value);
  const messages: z.infer<typeof messageSchema>[] = [];
  const issues: z.ZodIssue[] = [];
  for (let index = 0; index < envelope.messages.length; index += 1) {
    if (index > 0 && index % BATCH_SIZE === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal?.throwIfAborted();
    }
    const result = messageSchema.safeParse(envelope.messages[index]);
    if (result.success) messages.push(result.data);
    else issues.push(...result.error.issues.map((issue) => ({
      ...issue,
      path: ['messages', index, ...issue.path],
    })));
  }
  if (issues.length) throw new z.ZodError(issues);
  signal?.throwIfAborted();
  return { ...envelope, messages };
}
