import { expect, it } from 'vitest';
import { sessionOwnFlow } from './plugin-domain.js';

it('names the flow a session runs as its own work', () => {
  expect(
    sessionOwnFlow({
      metadata: { agent_flow: { id: 'deep-research', options: { max_rounds: 1 } } },
    }),
  ).toEqual({ id: 'deep-research', options: { max_rounds: 1 } });
  expect(sessionOwnFlow({ metadata: { agent_flow: { id: 'council' } } })).toEqual({
    id: 'council',
    options: {},
  });
});

it('leaves a started flow to the card of the conversation that started it', () => {
  const started = { id: 'council', options: {}, input: 'task', depth: 1 };
  expect(sessionOwnFlow({ metadata: { agent_flow: started } })).toBeNull();
  expect(sessionOwnFlow({ metadata: {} })).toBeNull();
  expect(sessionOwnFlow(undefined)).toBeNull();
});
