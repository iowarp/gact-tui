import type { ModelFacts } from '@clio/core/v3';
import type { ClioModelOption } from './model-options';

/**
 * A model's descriptive facts in ONE normalized shape, read from the service's
 * `model_facts` record (clio-schemas `ModelFacts`): what it is, when it was
 * released (and whether that is recent), what one input token costs, and how
 * many parameters it has. A fact no source stated is absent -- nothing here is
 * guessed, and nothing is read off a model's name.
 */
export interface ModelFactSummary {
  description?: { plain: string; links: readonly { text: string; url: string }[] };
  /** The first day the stated release date can mean (`2026-02` -> Feb 1st). */
  releasedOn?: Date;
  /** The release is within the service's recent window (6 months) of `recentAsOf`. */
  recent?: boolean;
  /** The day the service judged "recent" against (what `released:` compares to). */
  asOf?: Date;
  /** Input price: USD per 1M tokens, or a price that is not a number. */
  inputPrice?: { kind: 'usd'; per1m: number } | { kind: 'variable' | 'subscription' };
  parameters?: {
    total?: number;
    active?: number;
    expertsTotal?: number;
    expertsActive?: number;
    rounded: boolean;
  };
}

/** `YYYY`, `YYYY-MM` or `YYYY-MM-DD` as the first day it can mean (UTC). */
export function earliestDay(value: string): Date | undefined {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/u.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month ?? 1) - 1, Number(day ?? 1)));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function positive(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && value > 0 ? value : undefined;
}

/** The normalized facts of one record (absent record: no facts). */
export function modelFactSummary(facts: ModelFacts | undefined): ModelFactSummary {
  if (!facts) return {};
  const summary: ModelFactSummary = {};
  const description = facts.description?.value;
  if (description?.plain) {
    summary.description = {
      plain: description.plain,
      links: (description.links ?? []).map((link) => ({ text: link.text, url: link.url })),
    };
  }
  const released = facts.released_at?.value.date;
  if (released) summary.releasedOn = earliestDay(released);
  if (facts.recent) {
    summary.recent = facts.recent.value;
    summary.asOf = earliestDay(facts.recent.as_of);
  }
  const input = facts.pricing?.value.input;
  if (input) {
    summary.inputPrice =
      input.kind === 'usd' && typeof input.per_1m === 'number'
        ? { kind: 'usd', per1m: input.per_1m }
        : input.kind === 'usd'
          ? undefined
          : { kind: input.kind };
  }
  const parameters = facts.parameters?.value;
  if (parameters) {
    summary.parameters = {
      total: positive(parameters.total),
      active: positive(parameters.active),
      expertsTotal: positive(parameters.experts_total),
      expertsActive: positive(parameters.experts_active),
      rounded: parameters.precision === 'rounded',
    };
  }
  return summary;
}

/** The facts of one model option. */
export function modelFactsFromOption(option: ClioModelOption): ModelFactSummary {
  return modelFactSummary(option.modelFacts);
}

/** "70B", "7.6B", "1.2T", "350M": a parameter count as people say it. */
export function formatParameterCount(count: number): string {
  const units: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [scale, unit] of units) {
    if (count >= scale) {
      const scaled = count / scale;
      // Truncated, as model names do: 70.55B parameters is a "70B" model.
      const text = scaled >= 10 ? String(Math.floor(scaled)) : String(Math.floor(scaled * 10) / 10);
      return `${text}${unit}`;
    }
  }
  return String(count);
}

/**
 * A size tag's text: the total ("70B"), or for a mixture-of-experts model whose
 * active count is known, "A3B / 30B" (active / total). `undefined` when no
 * source stated a total.
 */
export function parameterSizeLabel(parameters: ModelFactSummary['parameters']): string | undefined {
  if (!parameters?.total) return undefined;
  const total = formatParameterCount(parameters.total);
  return parameters.active ? `A${formatParameterCount(parameters.active)} / ${total}` : total;
}

/** "$0.15", "$3", "$0.004": a price per 1M tokens as people say it. */
export function formatPricePer1m(per1m: number): string {
  if (per1m === 0) return 'Free';
  const digits = per1m >= 10 ? 0 : per1m >= 1 ? 2 : per1m >= 0.01 ? 2 : 4;
  return `$${Number(per1m.toFixed(digits))}`;
}
