import type { FlowRunUsage } from '@clio/core/v3';
import { formatTokens } from '@/lib/fleet-usage';
import { shortModel } from '@/lib/flow-run-usage';
import { ph, t } from '@lingui/core/macro';

/**
 * What the run cost, under its title: tokens and money, and the models when more than
 * one ran (each one's share on hover). Account windows belong to Usage, not to a run.
 */
export function FlowUsageSummary({ usage }: { usage?: FlowRunUsage }) {
  if (!usage?.models.length) return null;
  const tokens = usage.models.reduce((sum, row) => sum + row.tokens, 0);
  const cost = usage.models.reduce((sum, row) => sum + row.cost_usd, 0);
  const several = usage.models.length > 1;
  const shares = usage.models
    .map(
      (row) =>
        t`${ph({ model: shortModel(row.model) })}: ${ph({ percent: Math.round(row.share * 100) })}% of tokens`,
    )
    .join(', ');
  return (
    <p
      aria-label={t`What this run used`}
      className="min-w-0 text-xs text-muted-foreground"
      title={several ? shares : undefined}
    >
      {several ? `${usage.models.map((row) => shortModel(row.model)).join(', ')}: ` : ''}
      {/* The run and the work it started, cache reads included: say so beside the count. */}
      {cost >= 0.01
        ? t`${ph({ tokens: formatTokens(tokens) })} tokens with cache reads, $${ph({ cost: cost.toFixed(2) })}`
        : cost > 0
          ? t`${ph({ tokens: formatTokens(tokens) })} tokens with cache reads, under $0.01`
          : t`${ph({ tokens: formatTokens(tokens) })} tokens with cache reads`}
    </p>
  );
}
