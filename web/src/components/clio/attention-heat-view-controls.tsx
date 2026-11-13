import type {
  AttentionHeatUnit,
  AttentionHeatView,
  AttentionHeatReduction,
} from '@/lib/attention-segment-heat';
import { InfoTip } from './info-tip';
import { SegmentedControl } from './primitives/segmented-control';
import { t } from '@lingui/core/macro';

const UNITS: readonly { value: AttentionHeatUnit; label: string; title: string }[] = [
  { value: 'line', label: t`Lines`, title: t`One band per source line` },
  {
    value: 'word',
    label: t`Words`,
    title: t`One band per word, as the tokenizer's first level cuts it`,
  },
  { value: 'token', label: t`Tokens`, title: t`One highlight per model token` },
];

const REDUCTIONS: readonly { value: AttentionHeatReduction; label: string; title: string }[] = [
  { value: 'max', label: t`Max`, title: t`Its hottest kept token (SPOTTER)` },
  {
    value: 'mean',
    label: t`Mean`,
    title: t`The average over all of its tokens, counting the ones the capture did not keep as zero`,
  },
];

const MEAN_UNAVAILABLE = t`This result does not list every token, so a line or word cannot be averaged`;

/**
 * How the conversation paints heat. Lines follow SPOTTER's text map: each
 * source line of a message is one band, so a paragraph wrapped over several
 * lines in the source carries several bands. Words follow its pre-token map:
 * one band per word as the tokenizer's first level cuts it, before BPE splits
 * it further. Tokens show the model's own pieces. All three share one scale.
 * For lines and words, Max takes the hottest kept token and Mean averages all
 * of the segment's tokens, which needs the result to list every token
 * (`meanAvailable`).
 */
export function AttentionHeatViewControls({
  view,
  onChange,
  meanAvailable = true,
}: {
  view: AttentionHeatView;
  onChange: (view: AttentionHeatView) => void;
  meanAvailable?: boolean;
}) {
  // The frame bar's two text segments (runs-attention 08): Lines Words Tokens, then Max Mean.
  return (
    <div className="flex shrink-0 items-center gap-1.5" data-slot="attention-heat-view">
      <SegmentedControl
        label={t`Heat by`}
        onValueChange={(unit) => onChange({ ...view, unit })}
        options={UNITS}
        value={view.unit}
      />
      {view.unit !== 'token' ? (
        <SegmentedControl
          label={meanAvailable ? t`Value` : t`Value. Mean: ${MEAN_UNAVAILABLE}`}
          onValueChange={(reduction) => onChange({ ...view, reduction })}
          options={REDUCTIONS.map((option) =>
            option.value === 'mean' && !meanAvailable ? { ...option, disabled: true } : option,
          )}
          value={view.reduction}
        />
      ) : null}
      <InfoTip label={t`About heat by line, word or token`}>
        {t`Lines follow SPOTTER's text map: each line of a message as it was written is one band, so a paragraph written over several lines shows several bands. Words are the pieces the tokenizer first cuts text into (a word with its leading space, a number, a run of punctuation), before it splits them into model tokens. Lines, words and tokens are all scaled to the hottest band on levels 1 to 9, so a band below half a level is left blank. The capture keeps only the top 10% of tokens in each part of the prompt. Max takes the hottest kept token; Mean averages every token of the line or word, counting the ones not kept as zero, so it is a lower bound. A band with no kept token is left blank.`}
        {meanAvailable ? null : ` ${MEAN_UNAVAILABLE}.`}
      </InfoTip>
    </div>
  );
}
