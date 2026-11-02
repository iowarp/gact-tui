import type { PromptDefinition } from '@clio/core/v3';

/** What a reminder's frontmatter declares (docs/design/sdk/reminders.md in clio-agent). */
export interface ReminderMeta {
  active: boolean;
  trigger: string;
  variables: string[];
  params: Record<string, unknown>;
}

/** A reminder is a prompt whose frontmatter says ``kind: reminder``. */
export function reminderMeta(prompt: PromptDefinition): ReminderMeta | null {
  const profile = prompt.profiles[prompt.default_profile ?? 'default'];
  const meta = { ...prompt.metadata, ...(profile?.metadata ?? {}) } as Record<string, unknown>;
  if (meta.kind !== 'reminder') return null;
  return {
    active: meta.active !== false && meta.active !== 'false',
    trigger: typeof meta.trigger === 'string' ? meta.trigger : '',
    variables: Array.isArray(meta.variables) ? meta.variables.map(String) : [],
    params:
      meta.params && typeof meta.params === 'object'
        ? (meta.params as Record<string, unknown>)
        : {},
  };
}
