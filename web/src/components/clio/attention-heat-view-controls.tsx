import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type {
  AttentionHeatUnit,
  AttentionHeatView,
  AttentionLineReduction,
} from '@/lib/attention-line-heat';
import { InfoTip } from './info-tip';

/** The chosen option reads at a glance, in light and dark. */
const SELECTED = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

const UNITS: readonly { value: AttentionHeatUnit; label: string; title: string }[] = [
  { value: 'line', label: 'Lines', title: 'One band per source line' },
  { value: 'token', label: 'Tokens', title: 'One highlight per model token' },
];

const REDUCTIONS: readonly { value: AttentionLineReduction; label: string; title: string }[] = [
  { value: 'max', label: 'Max', title: "A line's hottest measured token (SPOTTER)" },
  { value: 'mean', label: 'Mean', title: "The average of a line's measured tokens" },
];

/**
 * How the conversation paints heat. Lines follow SPOTTER's text map: each
 * source line of a message is one band, so a paragraph wrapped over several
 * lines in the source carries several bands. Tokens show the model's own
 * pieces. In line mode, Max or Mean combines a line's measured tokens.
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
      {view.unit === 'line' ? (
        <>
          <span className="text-muted-foreground">Line value</span>
          <ToggleGroup
            aria-label="Line value"
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
      <InfoTip label="About heat by line">
        Lines follow SPOTTER&apos;s text map. Each line of a message as it was written is one band,
        scaled to the hottest line on levels 1 to 9. A paragraph written over several lines shows
        several bands. Tokens the capture did not keep are not counted, so a line without any is
        left blank.
      </InfoTip>
    </div>
  );
}
