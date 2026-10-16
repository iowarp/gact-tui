import type { ToolInvocation } from '@clio/core/v3';

export interface WorkflowStepDescriptor {
  name: string;
  stepId?: string;
  taskId?: string;
  launchState?: 'accepted' | 'not_started' | 'not_launched';
}

export interface WorkflowDescriptor {
  label: string;
  request?: string;
  steps: WorkflowStepDescriptor[];
  status?: string;
  failedStep?: string;
}

/** Reads the workflow definition recorded by run_workflow without inventing a workflow name. */
export function workflowDescriptor(
  tool: ToolInvocation | undefined,
): WorkflowDescriptor | undefined {
  if (tool?.name !== 'run_workflow') return undefined;
  const result = findWorkflowResult(tool.output);
  const steps = Array.isArray(result?.steps)
    ? result.steps.flatMap((value): WorkflowStepDescriptor[] => {
        const step = asRecord(value);
        const name =
          typeof step?.child === 'string'
            ? step.child.trim()
            : typeof step?.step_id === 'string'
              ? step.step_id.trim()
              : '';
        if (!name) return [];
        const launch = step?.launch_state;
        return [
          {
            name,
            stepId: typeof step?.step_id === 'string' ? step.step_id : undefined,
            taskId: typeof step?.task_id === 'string' ? step.task_id : undefined,
            launchState:
              launch === 'accepted' || launch === 'not_started' || launch === 'not_launched'
                ? launch
                : undefined,
          },
        ];
      })
    : [];
  const input = asRecord(tool.input);
  const kwargs = asRecord(input?.kwargs);
  const requestValue = input?.request ?? kwargs?.request;
  const request = typeof requestValue === 'string' ? requestValue.trim() : undefined;
  return {
    label: steps.map((step) => step.name).join(' → ') || 'Workflow',
    request,
    steps,
    status: typeof result?.status === 'string' ? result.status : undefined,
    failedStep: typeof result?.failed_step === 'string' ? result.failed_step : undefined,
  };
}

/** Adds a concise workflow identity and definition to otherwise generic run_workflow rows. */
export function withWorkflowPresentation(tool: ToolInvocation): ToolInvocation {
  const descriptor = workflowDescriptor(tool);
  if (!descriptor) return tool;
  const subjectId = 'workflow-definition';
  const requestId = 'workflow-request';
  const existing = tool.presentation;
  const blocks = (existing?.blocks ?? []).filter(
    (block) => block.id !== subjectId && block.id !== requestId,
  );
  return {
    ...tool,
    presentation: {
      ...existing,
      action: existing?.action || 'Run workflow',
      subject: existing?.subject || subjectId,
      summary:
        existing?.summary?.trim() ||
        (descriptor.steps.length
          ? `${descriptor.steps.length} ordered ${descriptor.steps.length === 1 ? 'step' : 'steps'}`
          : 'Step details unavailable'),
      blocks: [
        ...(existing?.subject
          ? blocks
          : [{ id: subjectId, type: 'text' as const, label: descriptor.label }]),
        ...(descriptor.request && !blocks.some((block) => block.text === descriptor.request)
          ? [{ id: requestId, type: 'text' as const, text: descriptor.request }]
          : []),
      ],
    },
  };
}

function findWorkflowResult(value: unknown, depth = 0): Record<string, unknown> | undefined {
  if (depth > 6) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
    try {
      return findWorkflowResult(JSON.parse(trimmed), depth + 1);
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findWorkflowResult(item, depth + 1);
      if (result) return result;
    }
    return undefined;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  if (Array.isArray(record.steps)) return record;
  for (const child of Object.values(record)) {
    const result = findWorkflowResult(child, depth + 1);
    if (result) return result;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
