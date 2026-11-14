import { vocab } from './brand-vocabulary';
import { t } from '@lingui/core/macro';

const { agent } = vocab;

/**
 * Product names for the installed services exposed in the inventory. A named
 * instance (`vllm@spotter`) reads "vLLM (spotter)".
 */
export function infrastructureServiceName(id: string): string {
  const [engine, instance] = id.split('@', 2);
  if (instance) return `${infrastructureServiceName(engine!)} (${instance})`;
  const names: Record<string, string> = {
    relay: t`${agent} Relay`,
    vllm: 'vLLM',
    llama_cpp: 'llama.cpp',
    ollama: 'Ollama',
    flowcept: 'Flowcept',
    // i18n-ignore: product name
    cmf: 'HPE CMF',
    clio_agent: vocab.agent,
  };
  return names[id] ?? id.replaceAll('_', ' ');
}

/** Human wording for computer transport, separate from service lifecycle. */
export function computerConnectionLabel(state: string): string {
  return (
    (
      {
        connected: t`Connected`,
        connecting: t`Connecting`,
        disconnected: t`Disconnected`,
        awaiting_input: t`Sign-in needed`,
        failed: t`Connection failed`,
        state_unknown: t`Not checked`,
        reconnecting: t`Reconnecting`,
        reauthentication_required: t`Sign-in needed`,
      } as Record<string, string>
    )[state] || t`Not checked`
  );
}
