/**
 * Inspector 'Tasks' tab: lists the session's tasks. Exports {@link TasksTab}.
 */
import { For } from 'solid-js';
import type { SessionTask } from '@clio/core';

export interface TasksTabProps {
  tasks: SessionTask[];
  onCycleTaskStatus?: (taskId: string, next: SessionTask['status']) => void | Promise<void>;
}

export function TasksTab(props: TasksTabProps) {
  return (
    <section class="inspector__sect">
      <div class="inspector__sect-title">Tasks ({props.tasks.length})</div>
      <ul class="inspector__tasks">
        <For each={props.tasks}>
          {(task) => (
            <li
              class={'inspector__task inspector__task--' + task.status}
              data-testid={`inspector-task-${task.id}`}
              onClick={() => {
                if (!props.onCycleTaskStatus) return;
                const order: SessionTask['status'][] = ['pending', 'running', 'completed'];
                const i = Math.max(0, order.indexOf(task.status));
                const next = order[(i + 1) % order.length]!;
                void props.onCycleTaskStatus(task.id, next);
              }}
              style={props.onCycleTaskStatus ? 'cursor: pointer' : ''}
              title={props.onCycleTaskStatus ? 'Click to cycle status' : undefined}
            >
              <span class={'inspector__task-pip inspector__task-pip--' + task.status} />
              <span class="inspector__task-title">{task.title}</span>
              <span class="inspector__task-status">{task.status}</span>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
