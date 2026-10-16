import type { ClioModelOption } from '@/lib/model-options';
import { modelCapabilityTagsFromOption } from '@/lib/model-capability-tags';
import { modelFactsFromOption } from '@/lib/model-facts';
import { modelFilterTokens, providerFilterToken } from '@/lib/model-filter-tokens';

const cache = new WeakMap<ClioModelOption, ReturnType<typeof calculate>>();
function calculate(choice: ClioModelOption) {
  const tags = modelCapabilityTagsFromOption(choice);
  const tokens = modelFilterTokens(tags, { chatSelectable: choice.chatSelectable !== false });
  tokens.add(providerFilterToken(choice.providerId));
  return { tags, tokens, facts: modelFactsFromOption(choice) };
}
export function cachedModelFacts(choice: ClioModelOption) {
  let value = cache.get(choice);
  if (!value) {
    value = calculate(choice);
    cache.set(choice, value);
  }
  return value;
}
export function modelsPrepared(choices: readonly ClioModelOption[]): boolean {
  return choices.every((choice) => cache.has(choice));
}
