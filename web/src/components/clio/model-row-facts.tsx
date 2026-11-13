import {
  formatContextSize,
  modelCapabilityTagLabel,
  modelCapabilityTagMeaning,
  type ModelCapabilityTag,
} from '@/lib/model-capability-tags';
import { formatPricePer1m, type ModelFactSummary } from '@/lib/model-facts';
import { cn } from '@/lib/utils';
import { createElement } from 'react';
import { tagIcon } from './model-capability-tag-icons';
import { t, ph } from '@lingui/core/macro';

/** Capability icons a row draws before folding the rest into "+n". */
const MAX_ICONS = 4;

interface ModelRowFactsProps {
  contextWindow?: number;
  inputPrice?: ModelFactSummary['inputPrice'];
  /** The row's displayed tags; context and price are drawn as text, the rest as icons. */
  tags: readonly ModelCapabilityTag[];
  className?: string;
}

function tagTitle(tag: ModelCapabilityTag): string {
  return `${modelCapabilityTagLabel(tag)}: ${modelCapabilityTagMeaning(tag)}`;
}

/**
 * A model row's trailing facts on one line: context size, input price (or
 * Free) and capability icons, each named on hover. They are display only, so a
 * click anywhere on the row chooses its model; the facet bar filters by them.
 */
export function ModelRowFacts({ contextWindow, inputPrice, tags, className }: ModelRowFactsProps) {
  const contextTag = tags.find((tag) => tag.axis === 'context');
  const freeTag = tags.find((tag) => tag.axis === 'price');
  const icons = tags.filter(
    (tag) => tag.axis !== 'context' && tag.axis !== 'price' && tag.axis !== 'output_limit',
  );
  const shown = icons.slice(0, MAX_ICONS);
  const folded = icons.slice(MAX_ICONS);
  if (!contextWindow && !inputPrice && !freeTag && !icons.length) return null;
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-2.5 font-mono text-caption whitespace-nowrap text-muted-foreground tabular-nums [&_svg]:size-3',
        className,
      )}
      data-slot="model-row-facts"
    >
      {contextWindow ? (
        <span
          className="inline-flex items-center gap-1"
          data-tag={contextTag ? `context:${contextTag.value}` : undefined}
          title={contextTag ? tagTitle(contextTag) : t`Context window`}
        >
          {contextTag ? createElement(tagIcon(contextTag), { 'aria-hidden': true }) : null}
          {formatContextSize(contextWindow)}
        </span>
      ) : null}
      {freeTag ? (
        <span
          aria-label={modelCapabilityTagLabel(freeTag)}
          className="inline-flex items-center gap-1 text-success"
          data-tag={`${freeTag.axis}:${freeTag.value}`}
          role="img"
          title={tagTitle(freeTag)}
        >
          {createElement(tagIcon(freeTag), { 'aria-hidden': true })}
          {t`free`}
        </span>
      ) : inputPrice?.kind === 'usd' ? (
        <span title={t`Input price per 1M tokens`}>{formatPricePer1m(inputPrice.per1m)}</span>
      ) : null}
      {shown.length ? (
        <span className="inline-flex items-center gap-1.5">
          {shown.map((tag) => {
            const Icon = tagIcon(tag);
            const label = modelCapabilityTagLabel(tag);
            return (
              <span
                aria-label={label}
                className="inline-flex"
                data-tag={`${tag.axis}:${tag.value}`}
                key={`${tag.axis}:${tag.value}`}
                role="img"
                title={tagTitle(tag)}
              >
                <Icon aria-hidden="true" />
              </span>
            );
          })}
          {folded.length ? (
            <span
              aria-label={t`${ph({ count: folded.length })} more: ${ph({ tags: folded.map(modelCapabilityTagLabel).join(', ') })}`}
              role="img"
              title={folded.map(modelCapabilityTagLabel).join(', ')}
            >
              +{folded.length}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
