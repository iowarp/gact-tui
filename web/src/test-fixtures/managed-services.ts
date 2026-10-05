import type { ManagedServiceDefinition } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';

const serviceLabels: Array<[ManagedServiceDefinition['id'], string]> = [
  ['vllm', 'vLLM'],
  ['llama_cpp', 'llama.cpp'],
  ['web_search', `${vocab.agent} Web Search`],
  ['relay', `${vocab.agent} Relay`],
];

export const services = serviceLabels.map<ManagedServiceDefinition>(([id, label]) => ({
  id,
  category:
    id === 'vllm' || id === 'llama_cpp'
      ? 'model_runtime'
      : id === 'relay'
        ? 'remote_access'
        : 'scientific_service',
  label,
  description: `${label} deployment`,
  supports_api_key: id === 'vllm' || id === 'llama_cpp',
  recommended_variant: `${id}-default`,
  supports_stop: id !== 'relay',
  state: id === 'web_search' ? 'running' : 'not_installed',
  connection_url: id === 'web_search' ? 'http://127.0.0.1:8089' : undefined,
  configuration_fields: [],
  parameters: [],
  effective_parameters: [],
  configuration: {},
  owned_resources: [],
  variants: [
    {
      id: `${id}-default`,
      label: 'Recommended',
      version: 'pinned',
      install_type: 'container',
      artifact: `example/${id}:pinned`,
      compatible: true,
      reason: 'Compatible with target',
    },
  ],
}));

services[0].configuration_fields = [
  {
    id: 'reasoning_parser',
    label: 'Reasoning parser',
    placeholder: 'Automatic for common reasoning models',
    required: false,
    options: ['qwen3', 'deepseek_r1'],
  },
];
