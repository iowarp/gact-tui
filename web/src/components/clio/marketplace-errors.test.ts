import { expect, it } from 'vitest';
import { marketplaceErrorSummary } from './marketplace-errors';

it('names the failing blueprint without repeating every missing tool', () => {
  const error =
    'blueprint installation failed: Blueprint "Cluster Operator" (cluster-operator): Staged blueprint runtime is invalid: operator: unknown tool reference: relay_observe; operator: unknown tool reference: jarvis_run';
  const summary = marketplaceErrorSummary(error);
  expect(summary).toContain('Cluster Operator needs tools');
  expect(summary).toContain('Existing installations were kept');
  expect(summary).not.toContain('relay_observe');
});
