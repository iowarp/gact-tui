import type { AttentionDomain } from '@clio/core/v3';

/**
 * One CSS color per attention domain, drawn entirely from existing theme
 * tokens (the chart palette, `--primary`, `--muted-foreground`) so the
 * breakdown reads correctly in light and dark without a second palette to
 * maintain. Low-signal domains (formatting, tool definitions, other) share
 * the muted tone; `tool_result` gets the palette's warm hue, since it is the
 * one domain the breakdown calls out as a possible poisoning signal.
 */
const DOMAIN_COLOR_VAR: Record<AttentionDomain, string> = {
  user: 'var(--chart-1)',
  tool_call: 'var(--chart-2)',
  thinking: 'var(--chart-3)',
  system: 'var(--chart-4)',
  tool_result: 'var(--chart-5)',
  assistant_output: 'var(--primary)',
  tool_definitions: 'var(--muted-foreground)',
  other: 'var(--muted-foreground)',
  template: 'var(--muted-foreground)',
};

export function attentionDomainColor(domain: string): string {
  return DOMAIN_COLOR_VAR[domain as AttentionDomain] ?? 'var(--muted-foreground)';
}
