import { vocab } from './brand-vocabulary';

/**
 * Product names for the installed services exposed in the inventory. A named
 * instance (`vllm@spotter`) reads "vLLM · spotter".
 */
export function infrastructureServiceName(id: string): string {
  const [engine, instance] = id.split('@', 2);
  if (instance) return `${infrastructureServiceName(engine!)} · ${instance}`;
  const names: Record<string, string> = {
    searxng: 'SearXNG',
    web_search: `${vocab.agent} Web Search`,
    relay: `${vocab.agent} Relay`,
    vllm: 'vLLM',
    llama_cpp: 'llama.cpp',
    ollama: 'Ollama',
    flowcept: 'Flowcept',
    cmf: 'HPE CMF',
  };
  return names[id] ?? id.replaceAll('_', ' ');
}

/** Human wording for computer transport, separate from service lifecycle. */
export function computerConnectionLabel(state: string): string {
  return (
    (
      {
        connected: 'Connected',
        connecting: 'Connecting',
        disconnected: 'Disconnected',
        awaiting_input: 'Sign-in needed',
        failed: 'Connection failed',
        state_unknown: 'Not checked',
        reconnecting: 'Reconnecting',
        reauthentication_required: 'Sign-in needed',
      } as Record<string, string>
    )[state] || 'Not checked'
  );
}
