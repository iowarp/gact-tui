import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type {
  AttentionHeatUnit,
  AttentionHeatView,
  AttentionHeatReduction,
} from '@/lib/attention-segment-heat';
import { InfoTip } from './info-tip';

/** The chosen option reads at a glance, in light and dark. */
const SELECTED = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

const UNITS: readonly { value: AttentionHeatUnit; label: string; title: string }[] = [
  { value: 'line', label: 'Lines', title: 'One band per source line' },
  {
    value: 'word',
    label: 'Words',
    title: "One band per word, as the tokenizer's first level cuts it",
  },
  { value: 'token', label: 'Tokens', title: 'One highlight per model token' },
];

const REDUCTIONS: readonly { value: AttentionHeatReduction; label: string; title: string }[] = [
  { value: 'max', label: 'Max', title: 'Its hottest measured token (SPOTTER)' },
  { value: 'mean', label: 'Mean', title: 'The average of its measured tokens' },
];

/**
 * How the conversation paints heat. Lines follow SPOTTER's text map: each
 * source line of a message is one band, so a paragraph wrapped over several
 * lines in the source carries several bands. Words follow its pre-token map:
 * one band per word as the tokenizer's first level cuts it, before BPE splits
 * it further. Tokens show the model's own pieces. For lines and words, Max or
 * Mean combines the segment's measured tokens.
 */
export function AttentionHeatViewControls({
  view,
  onChange,
}: {
  view: AttentionHeatView;
  onChange: (view: AttentionHeatView) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-slot="attention-heat-view">
      <span className="text-muted-foreground">Heat by</span>
      <ToggleGroup
        aria-label="Heat by"
        onValueChange={(next) => {
          const unit = UNITS.find((option) => option.value === next)?.value;
          if (unit) onChange({ ...view, unit });
        }}
        size="sm"
        spacing={0}
        type="single"
        value={view.unit}
        variant="outline"
      >
        {UNITS.map((option) => (
          <ToggleGroupItem
            className={SELECTED}
            key={option.value}
            title={option.title}
            value={option.value}
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {view.unit !== 'token' ? (
        <>
          <span className="text-muted-foreground">Value</span>
          <ToggleGroup
            aria-label="Value"
            onValueChange={(next) => {
              const reduction = REDUCTIONS.find((option) => option.value === next)?.value;
              if (reduction) onChange({ ...view, reduction });
            }}
            size="sm"
            spacing={0}
            type="single"
            value={view.reduction}
            variant="outline"
          >
            {REDUCTIONS.map((option) => (
              <ToggleGroupItem
                className={SELECTED}
                key={option.value}
                title={option.title}
                value={option.value}
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </>
      ) : null}
      <InfoTip label="About heat by line, word or token">
        Lines follow SPOTTER&apos;s text map: each line of a message as it was written is one band,
        so a paragraph written over several lines shows several bands. Words are the pieces the
        tokenizer first cuts text into (a word with its leading space, a number, a run of
        punctuation), before it splits them into model tokens. Both are scaled to the hottest band
        on levels 1 to 9. Tokens the capture did not keep are not counted, so a band without any is
        left blank.
      </InfoTip>
    </div>
  );
}
