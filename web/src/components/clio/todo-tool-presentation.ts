import type { ToolInvocation } from '@clio/core/v3';
import { plural, t } from '@lingui/core/macro';

/** Keep retained checklist calls distinct from asynchronous task controls. */
export function withTodoPresentation(tool: ToolInvocation): ToolInvocation {
  if (tool.name !== 'write_todos') return tool;
  return {
    ...tool,
    title: t`Update Todos`,
    presentation: tool.presentation
      ? {
          ...tool.presentation,
          action: t`Update Todos`,
          summary: todoSummary(tool.presentation.summary),
        }
      : undefined,
  };
}

/** The agent's English count line ("3 todos changed"; older agents say "tasks"), in the person's language. */
function todoSummary(summary: string): string {
  const changed = /^(\d+) (?:tasks?|todos?) changed$/u.exec(summary.trim());
  if (changed) {
    const count = Number(changed[1]);
    return plural(count, { one: '# todo changed', other: '# todos changed' });
  }
  if (/^No (?:tasks|todos) in this list$/u.test(summary.trim())) return t`No todos in this list`;
  return summary;
}
