import type { FlowRunUsage } from '@clio/core/v3';
import { formatTokens } from '@/lib/fleet-usage';
import { shortModel } from '@/lib/flow-run-usage';

/**
 * The run's usage in one line under its title: the models it used with their
 * share of its tokens, and the busiest window of each account it ran on
 * ("haiku 61% · sonnet 39% · Claude 5-hour 42% used").
 */
export function FlowUsageSummary({ usage }: { usage?: FlowRunUsage }) {
  if (!usage?.models.length) return null;
  const tokens = usage.models.reduce((sum, row) => sum + row.tokens, 0);
  const cost = usage.models.reduce((sum, row) => sum + row.cost_usd, 0);
  const parts = [
    ...usage.models.map((row) => `${shortModel(row.model)} ${Math.round(row.share * 100)}%`),
    ...usage.windows.map(
      (row) => `${row.label || row.account} ${row.window} ${Math.round(row.used_percent)}% used`,
    ),
  ];
  return (
    <p aria-label="Models this run used" className="min-w-0 text-xs text-muted-foreground">
      {parts.join(' · ')} · {formatTokens(tokens)} tokens
      {cost >= 0.01 ? ` · $${cost.toFixed(2)}` : cost > 0 ? ' · under $0.01' : ''}
    </p>
  );
}
