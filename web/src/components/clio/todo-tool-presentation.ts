import type { ToolInvocation } from '@clio/core/v3';
import { t } from '@lingui/core/macro';

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
          summary: tool.presentation.summary
            .replace(/^(\d+) tasks? changed$/u, '$1 todos changed')
            .replace(/^1 todos changed$/u, '1 todo changed')
            .replace(/^No tasks in this list$/u, 'No todos in this list'),
        }
      : undefined,
  };
}
