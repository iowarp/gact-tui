import { expect, it } from 'vitest';
import { TaskRepository } from './task-repository.js';
import type { ClioTransport, TransportRequest } from './transport.js';

it('addresses exact owned lifecycle targets and retains cancellation as a separate operation', async () => {
  const requests: TransportRequest<unknown>[] = [];
  const transport: ClioTransport = {
    async request<T>(request: TransportRequest<T>): Promise<T> {
      requests.push(request as TransportRequest<unknown>);
      return request.decode({ handle: 'task_new', session_id: 'recipient', status: 'paused' });
    },
    async *stream() {},
  };
  const repository = new TaskRepository(transport);
  const signal = new AbortController().signal;
  for (const action of ['pause', 'resume', 'restart'] as const) {
    await repository.controlSubagent('parent / id', 'task / id', action, signal);
  }
  expect(
    requests.map(({ method, path, body, signal: seen }) => ({ method, path, body, seen })),
  ).toEqual(
    ['pause', 'resume', 'restart'].map((action) => ({
      method: 'POST',
      path: `/v1/sessions/parent%20%2F%20id/agent-controls/task%20%2F%20id/${action}`,
      body: { fresh: false },
      seen: signal,
    })),
  );
});

it('rejects lifecycle acknowledgement without a durable handle', async () => {
  const transport: ClioTransport = {
    async request<T>(request: TransportRequest<T>): Promise<T> {
      return request.decode({ session_id: 'recipient', status: 'paused' });
    },
    async *stream() {},
  };
  await expect(
    new TaskRepository(transport).controlSubagent('parent', 'task', 'pause'),
  ).rejects.toThrow();
});

it("reads the assignment a person's message was delivered into", async () => {
  const requests: string[] = [];
  const answers: unknown[] = [
    { id: 'msg_1', metadata: { recipient_input: { assignment_id: 'task_run', turn_id: 't' } } },
    { id: 'msg_2', metadata: { recipient_input: null } },
  ];
  const transport: ClioTransport = {
    async request<T>(request: TransportRequest<T>): Promise<T> {
      requests.push(`${request.method} ${request.path}`);
      return request.decode(answers.shift());
    },
    async *stream() {},
  };
  const repository = new TaskRepository(transport);
  expect(await repository.messageAssignment('sess / 1', 'msg_1')).toBe('task_run');
  expect(await repository.messageAssignment('sess / 1', 'msg_2')).toBeNull();
  expect(requests[0]).toBe('GET /v1/sessions/sess%20%2F%201/messages/msg_1');
});
