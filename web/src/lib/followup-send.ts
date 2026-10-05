import { messageBehaviorSchema, type MessageSubmissionInput, type Session } from '@clio/core/v3';
import { z } from 'zod';
import { SendIdentities } from './send-identity';

const pendingSchema = z
  .object({
    fingerprint: z.string(),
    input: z
      .object({
        parts: z.tuple([z.object({ type: z.literal('text'), text: z.string() })]),
        client_message_id: z.string().min(1),
        idempotency_key: z.string().min(1),
        delivery: z.literal('auto'),
        behavior: messageBehaviorSchema,
      })
      .strict(),
  })
  .strict();
type Pending = z.infer<typeof pendingSchema>;
const held = new Map<string, Pending>();

/** Keep an uncertain send identical across closing, reopening and reloading its panel. */
export class FollowupSend {
  private readonly key: string;

  public constructor(scope: string) {
    this.key = `clio:followup-send:${scope}`;
  }

  public prepare(text: string, session: Session): MessageSubmissionInput {
    let pending = held.get(this.key);
    let saved: string | null = null;
    try {
      saved = window.sessionStorage.getItem(this.key);
    } catch {
      /* In-memory fallback. */
    }
    if (saved) {
      const parsed = pendingSchema.safeParse(JSON.parse(saved));
      if (!parsed.success)
        throw new Error(
          'The saved retry is unreadable. Reopen this conversation centrally to check whether it was delivered.',
        );
      pending = parsed.data;
    }
    const fingerprint = text.trim();
    if (pending?.fingerprint === fingerprint) return pending.input;
    const executionMode = { edit: 'execute', plan: 'plan', architect: 'deep_research' };
    const behavior = messageBehaviorSchema.safeParse({
      execution_mode: executionMode[session.mode as keyof typeof executionMode],
      confirmation_policy: session.approval_mode,
      reasoning_effort: session.effort,
    });
    if (!behavior.success)
      throw new Error(
        'This conversation uses behavior settings this version cannot send. Open it centrally to review its settings.',
      );
    const identity = new SendIdentities().forSend(fingerprint);
    pending = {
      fingerprint,
      input: {
        parts: [{ type: 'text', text: fingerprint }],
        client_message_id: identity.clientMessageId,
        idempotency_key: identity.idempotencyKey,
        delivery: 'auto',
        behavior: behavior.data,
      },
    };
    held.set(this.key, pending);
    try {
      window.sessionStorage.setItem(this.key, JSON.stringify(pending));
    } catch {
      /* In-memory fallback. */
    }
    return pending.input;
  }

  public accepted(): void {
    held.delete(this.key);
    try {
      window.sessionStorage.removeItem(this.key);
    } catch {
      /* In-memory fallback. */
    }
  }
}
