import { describe, expect, it } from 'vitest';
import { infrastructureServiceName } from './infrastructure-service-labels';

describe('infrastructureServiceName', () => {
  it('names an engine and a named instance of it', () => {
    expect(infrastructureServiceName('vllm')).toBe('vLLM');
    expect(infrastructureServiceName('vllm@spotter')).toBe('vLLM · spotter');
    expect(infrastructureServiceName('llama_cpp@judge')).toBe('llama.cpp · judge');
  });
});
