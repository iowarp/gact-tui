import type { AcceptedParameter } from '@clio/core/v3';
import { ChevronRightIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge } from '@/components/reui/badge';
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/reui/number-field';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import {
  INLINE_SETTINGS_LIMIT,
  shownResponseParameters,
  unusedResponseSettings,
  type ModelSettingsValues,
  type ResponseSettingName,
} from './settings-models-form';

const GROUPS: ReadonlyArray<{ id: AcceptedParameter['group']; title: string }> = [
  { id: 'sampling', title: 'Sampling' },
  { id: 'length', title: 'Length' },
  { id: 'advanced', title: 'Advanced' },
];

const PROVIDER_DEFAULT = '__provider_default__';

/** A slider value at the setting's own step precision (0.05, never 0.30000000000000004). */
function atStep(value: number, step: number | null): string {
  const decimals = step && step < 1 ? Math.min(6, String(step).split('.')[1]?.length ?? 0) : 0;
  return String(Number(value.toFixed(decimals)));
}
const SELECTED = 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground';

interface SettingsResponseSettingsProps {
  /** The selected model's accepted settings; undefined while that is unknown. */
  parameters: AcceptedParameter[] | undefined;
  settings: ModelSettingsValues['settings'];
  edited: boolean;
  saving: boolean;
  onEdit: (name: ResponseSettingName, value: string) => void;
  onSave: () => void;
}

/**
 * The response settings the SELECTED model accepts -- nothing else. The
 * service states which settings the model and its endpoint take
 * (`accepted_parameters`, each with its range and default), so a model that
 * takes none shows no section at all, a few show inline, and a local server's
 * long list sits behind one disclosure grouped as Sampling / Length /
 * Advanced. Empty means the default: the model's recommended value when the
 * service names one, else the provider's own, and nothing is sent. A saved
 * value this model does not take is listed as not used by it (and never
 * sent), so switching models loses nothing.
 */
export function SettingsResponseSettings({
  parameters,
  settings,
  edited,
  saving,
  onEdit,
  onSave,
}: SettingsResponseSettingsProps) {
  const [open, setOpen] = useState(false);
  const shown = shownResponseParameters(parameters);
  const unused = unusedResponseSettings(
    settings,
    parameters?.map((parameter) => parameter.name),
  );
  const save = (
    <div className="flex justify-end">
      <Button disabled={!edited || saving} onClick={onSave} size="sm" type="button">
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
  const note = unused.length ? <UnusedNote unused={unused} /> : null;

  if (!shown.length) {
    // No section: this model takes no response settings. A saved value still
    // says so, and it can still be saved away with the model choice.
    return note ? (
      <div className="flex flex-col gap-2" data-slot="response-settings-unused-only">
        {note}
      </div>
    ) : null;
  }

  const controls = (items: typeof shown) => (
    <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((parameter) => (
        <ParameterControl
          key={parameter.name}
          onChange={(value) => onEdit(parameter.name, value)}
          parameter={parameter}
          value={settings[parameter.name] ?? ''}
        />
      ))}
    </div>
  );

  if (shown.length <= INLINE_SETTINGS_LIMIT) {
    return (
      <section
        aria-label="Response settings"
        className="flex flex-col gap-3"
        data-slot="response-settings"
      >
        <h3 className="text-sm font-medium">Response settings</h3>
        {controls(shown)}
        {note}
        {save}
      </section>
    );
  }

  return (
    <Collapsible data-slot="response-settings" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <Button className="-ms-2" size="sm" type="button" variant="ghost">
          <ChevronRightIcon
            aria-hidden="true"
            className={cn(
              'transition-transform motion-reduce:transition-none',
              open && 'rotate-90',
            )}
          />
          Response settings
          <Badge size="sm" variant="secondary">
            {shown.length}
          </Badge>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-5 pt-3">
        {GROUPS.map((group) => {
          const items = shown.filter((parameter) => parameter.group === group.id);
          return items.length ? (
            <section aria-label={group.title} className="flex flex-col gap-3" key={group.id}>
              <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.title}
              </h4>
              {controls(items)}
            </section>
          ) : null;
        })}
        {note}
        {save}
      </CollapsibleContent>
      {!open && note ? <div className="pt-1">{note}</div> : null}
    </Collapsible>
  );
}

function UnusedNote({ unused }: { unused: ReturnType<typeof unusedResponseSettings> }) {
  return (
    <p className="text-xs text-muted-foreground" data-slot="response-settings-unused">
      Saved but not used by this model:{' '}
      {unused.map((item, index) => (
        <span key={item.name}>
          {index ? ', ' : ''}
          {item.label} <span className="tabular-nums">{item.value}</span>
        </span>
      ))}
    </p>
  );
}

function toNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function defaultText(parameter: AcceptedParameter): string {
  return parameter.default === null ? 'Provider default' : `Default ${parameter.default}`;
}

function rangeText(parameter: AcceptedParameter): string {
  const { minimum, maximum } = parameter;
  if (minimum !== null && maximum !== null)
    return `${minimum.toLocaleString()} to ${maximum.toLocaleString()}`;
  if (maximum !== null) return `up to ${maximum.toLocaleString()}`;
  return '';
}

function Setting({
  parameter,
  children,
  aside,
}: {
  parameter: AcceptedParameter;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-parameter={parameter.name}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground" title={parameter.description}>
          {parameter.label}
        </span>
        {aside}
      </div>
      {children}
    </div>
  );
}

function ParameterControl({
  parameter,
  value,
  onChange,
}: {
  parameter: AcceptedParameter;
  value: string;
  onChange: (value: string) => void;
}) {
  if (parameter.kind === 'enum') {
    const options = parameter.options ?? [];
    return (
      <Setting parameter={parameter}>
        <ToggleGroup
          aria-label={parameter.label}
          className="flex-wrap"
          onValueChange={(next) => {
            if (!next) return;
            onChange(next === PROVIDER_DEFAULT ? '' : next);
          }}
          size="sm"
          spacing={0}
          type="single"
          value={value && options.includes(value) ? value : PROVIDER_DEFAULT}
          variant="outline"
        >
          <ToggleGroupItem
            className={SELECTED}
            title={defaultText(parameter)}
            value={PROVIDER_DEFAULT}
          >
            Default
          </ToggleGroupItem>
          {options.map((option) => (
            <ToggleGroupItem className={SELECTED} key={option} value={option}>
              {option}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Setting>
    );
  }

  const numeric = toNumber(value);
  const bounded =
    parameter.kind === 'number' && parameter.minimum !== null && parameter.maximum !== null;
  const field = (
    <NumberField
      aria-label={parameter.label}
      className={cn('gap-0', bounded && 'w-32 shrink-0')}
      max={parameter.maximum ?? undefined}
      min={parameter.minimum ?? undefined}
      onValueChange={(next) => onChange(next === null ? '' : String(next))}
      size="sm"
      step={parameter.step ?? 1}
      value={numeric}
    >
      <NumberFieldGroup>
        <NumberFieldDecrement />
        <NumberFieldInput
          aria-label={parameter.label}
          placeholder={bounded ? 'Default' : defaultText(parameter)}
        />
        <NumberFieldIncrement />
      </NumberFieldGroup>
    </NumberField>
  );
  const range = rangeText(parameter);
  if (!bounded) {
    return (
      <Setting
        aside={
          range ? <span className="text-xs text-muted-foreground tabular-nums">{range}</span> : null
        }
        parameter={parameter}
      >
        {field}
      </Setting>
    );
  }
  const minimum = parameter.minimum as number;
  const maximum = parameter.maximum as number;
  // Unset with a stated default: the thumb rests there (that value is sent).
  // Unset with none: no position is claimed -- the thumb and fill are hidden
  // until the person picks a value.
  const stated = typeof parameter.default === 'number' ? parameter.default : null;
  const hidden = numeric === null && stated === null;
  return (
    <Setting
      aside={
        <span className="text-xs text-muted-foreground tabular-nums">
          {numeric === null ? defaultText(parameter) : range}
        </span>
      }
      parameter={parameter}
    >
      <div className="flex items-center gap-3">
        <Slider
          aria-label={parameter.label}
          className={cn(
            numeric === null && 'opacity-60',
            hidden &&
              '[&_[data-slot=slider-range]]:opacity-0 [&_[data-slot=slider-thumb]]:opacity-0',
          )}
          max={maximum}
          min={minimum}
          onValueChange={([next]) =>
            onChange(next === undefined ? '' : atStep(next, parameter.step))
          }
          step={parameter.step ?? 0.01}
          thumbProps={() => ({ 'aria-label': parameter.label })}
          value={[numeric ?? stated ?? minimum]}
        />
        {field}
      </div>
    </Setting>
  );
}
