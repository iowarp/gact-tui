import type { PromptDefinition } from '@clio/core/v3';

/** What a reminder's frontmatter declares (docs/design/sdk/reminders.md in clio-agent). */
export interface ReminderMeta {
  active: boolean;
  trigger: string;
  variables: string[];
  params: Record<string, string>;
  /** Why the reminder cannot be switched off (it carries data the agent needs). */
  required: string;
}

const OFF = new Set(['false', '0', 'no', 'off']);

function list(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return items.map((item) => String(item).trim()).filter(Boolean);
}

/**
 * A reminder is a prompt whose frontmatter says ``x_kind: reminder``. The server strips
 * the ``x_`` prefix; frontmatter is flat, so ``variables`` is a comma-separated string and
 * each setting is its own ``param_<name>`` key.
 */
export function reminderMeta(prompt: PromptDefinition): ReminderMeta | null {
  const profile = prompt.profiles[prompt.default_profile ?? 'default'];
  const meta = { ...prompt.metadata, ...(profile?.metadata ?? {}) } as Record<string, unknown>;
  if (meta.kind !== 'reminder') return null;
  const required = typeof meta.required === 'string' ? meta.required.trim() : '';
  const params = Object.fromEntries(
    Object.entries(meta)
      .filter(([key]) => key.startsWith('param_'))
      .map(([key, value]) => [key.slice('param_'.length), String(value)]),
  );
  return {
    active: Boolean(required) || !OFF.has(String(meta.active ?? 'true').trim().toLowerCase()),
    trigger: typeof meta.trigger === 'string' ? meta.trigger : '',
    variables: list(meta.variables),
    params,
    required,
  };
}
