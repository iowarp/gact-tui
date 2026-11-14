import { ph, plural, t } from '@lingui/core/macro';
import { FlipHorizontal2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { RetryIcon } from '@/lib/icon-vocabulary';
import type { PartFacts } from './cad-parts';
import type { PartFocus } from './cad-scene';
import type { SectionAxis, SectionState } from './cad-section';
import { formatBox, formatLength, type LengthUnit } from './cad-units';
import { CadToolPanel } from './cad-tool-panel';

const AXES: SectionAxis[] = ['x', 'y', 'z'];

/** Section: the axis, where the plane crosses it, and which side is kept. */
export function CadSectionPanel({
  state,
  range,
  unit,
  onAxis,
  onChange,
  onClose,
}: {
  state: SectionState;
  range: [number, number];
  unit: LengthUnit;
  onAxis: (axis: SectionAxis) => void;
  onChange: (state: SectionState) => void;
  onClose: () => void;
}) {
  const axisName = state.axis.toUpperCase();
  const position = formatLength(state.position, unit, 'size');
  const step = Math.max((range[1] - range[0]) / 400, 0.01);
  return (
    <CadToolPanel onClose={onClose} slot="cad-section" title={t`Section`}>
      <div className="flex items-center gap-2">
        <ToggleGroup
          aria-label={t`Cut across`}
          onValueChange={(next) => next && onAxis(next as SectionAxis)}
          size="sm"
          type="single"
          value={state.axis}
          variant="outline"
        >
          {AXES.map((axis) => (
            <ToggleGroupItem aria-label={t`Cut across ${ph({ axis: axis.toUpperCase() })}`} key={axis} value={axis}>
              {axis.toUpperCase()}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Button
          aria-pressed={state.flipped}
          className="ml-auto h-7 gap-1 px-2 text-caption"
          onClick={() => onChange({ ...state, flipped: !state.flipped })}
          size="sm"
          variant={state.flipped ? 'secondary' : 'ghost'}
        >
          <FlipHorizontal2Icon aria-hidden="true" className="size-3.5" />
          {t`Flip`}
        </Button>
      </div>
      <Slider
        aria-label={t`Section position`}
        max={range[1]}
        min={range[0]}
        onValueChange={([value]) => value !== undefined && onChange({ ...state, position: value })}
        step={step}
        thumbProps={() => ({
          'aria-label': t`Section position`,
          'aria-valuetext': t`${ph({ axis: axisName })} at ${ph({ position })}`,
        })}
        value={[state.position]}
      />
      <p className="text-caption text-muted-foreground tabular-nums" role="status">
        {state.flipped
          ? t`Plane at ${ph({ axis: axisName })} = ${ph({ position })}, keeping the side above. Cut faces are filled.`
          : t`Plane at ${ph({ axis: axisName })} = ${ph({ position })}, keeping the side below. Cut faces are filled.`}
      </p>
    </CadToolPanel>
  );
}

/** Explode: how far the parts move apart, and back together. */
export function CadExplodePanel({
  amount,
  onChange,
  onCommit,
  onClose,
}: {
  amount: number;
  onChange: (amount: number) => void;
  /** The slider is let go (or a key step ends): the view frames the parts. */
  onCommit: (amount: number) => void;
  onClose: () => void;
}) {
  const percent = Math.round(amount * 100);
  return (
    <CadToolPanel onClose={onClose} slot="cad-explode" title={t`Exploded view`}>
      <div className="flex items-center gap-2">
        <Slider
          aria-label={t`Explode distance`}
          className="flex-1"
          max={100}
          min={0}
          onValueChange={([value]) => value !== undefined && onChange(value / 100)}
          onValueCommit={([value]) => value !== undefined && onCommit(value / 100)}
          step={1}
          thumbProps={() => ({ 'aria-label': t`Explode distance`, 'aria-valuetext': t`${ph({ percent })} %` })}
          value={[percent]}
        />
        <span className="w-10 text-right text-caption text-muted-foreground tabular-nums">{t`${ph({ percent })} %`}</span>
        <Button
          aria-label={t`Put the parts back together`}
          className="size-7"
          disabled={amount === 0}
          onClick={() => {
            onChange(0);
            onCommit(0);
          }}
          size="icon"
          variant="ghost"
        >
          <RetryIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">
        {t`Each part moves out from the assembly's centre.`}
      </p>
    </CadToolPanel>
  );
}

/** The selected part: its name, size and triangles, and how the other parts show. */
export function CadSelectionPanel({
  part,
  unit,
  focus,
  multipart,
  onFocus,
  onClose,
}: {
  part: PartFacts;
  unit: LengthUnit;
  focus: PartFocus;
  multipart: boolean;
  onFocus: (focus: PartFocus) => void;
  onClose: () => void;
}) {
  const name = part.name || t`Part ${ph({ number: part.index + 1 })}`;
  return (
    <CadToolPanel onClose={onClose} slot="cad-selection" title={t`Selected part`}>
      <div className="flex flex-col">
        <span className="truncate font-medium">{name}</span>
        <span className="text-caption text-muted-foreground tabular-nums">
          {formatBox(part.size, unit)}
        </span>
        <span className="text-caption text-muted-foreground tabular-nums">
          {plural(part.triangles, { one: '# triangle', other: '# triangles' })}
        </span>
      </div>
      {multipart ? (
        <ToggleGroup
          aria-label={t`Other parts`}
          className="w-full"
          onValueChange={(next) => next && onFocus(next as PartFocus)}
          size="sm"
          type="single"
          value={focus}
          variant="outline"
        >
          <ToggleGroupItem className="flex-1" value="normal">{t`Show all`}</ToggleGroupItem>
          <ToggleGroupItem className="flex-1" value="ghost">{t`Ghost others`}</ToggleGroupItem>
          <ToggleGroupItem className="flex-1" value="isolate">{t`Isolate`}</ToggleGroupItem>
        </ToggleGroup>
      ) : null}
    </CadToolPanel>
  );
}

