import type { AcceptedParameter } from '@clio/core/v3';
import { ChevronRightIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import {
  INLINE_SETTINGS_LIMIT,
  shownResponseParameters,
  unusedResponseSettings,
  type ModelSettingsValues,
  type ResponseSettingName,
} from './settings-models-form';
import {
  defaultText,
  rangeText,
  responseSettingError,
  toNumber,
} from './settings-response-setting-error';
import { SettingsChoice, SettingsGroupLabel, SettingsRow } from './settings-row';

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

interface SettingsResponseSettingsProps {
  /** The selected model's accepted settings; undefined while that is unknown. */
  parameters: AcceptedParameter[] | undefined;
  settings: ModelSettingsValues['settings'];
  /** Typed values waiting in the page's save bar. */
  dirty?: ReadonlySet<string>;
  disabled?: boolean;
  onEdit: (name: ResponseSettingName, value: string) => void;
  /** The context size row: after Longest reply when the model takes one, else first. */
  leading?: ReactNode;
}

/**
 * The response settings the SELECTED model accepts -- nothing else -- as
 * setting rows under a "Response" group label. The service states which
 * settings the model and its endpoint take (`accepted_parameters`, each with
 * its range and default), so a model that takes none shows no group at all, a
 * few show inline, and a local server's long list sits behind one disclosure
 * grouped as Sampling / Length / Advanced. Empty means the default: the
 * model's recommended value when the service names one, else the provider's
 * own, and nothing is sent. A saved value this model does not take is listed
 * as not used by it (and never sent), so switching models loses nothing.
 * Typed values wait in the page's save bar.
 */
export function SettingsResponseSettings({
  parameters,
  settings,
  dirty,
  disabled = false,
  onEdit,
  leading,
}: SettingsResponseSettingsProps) {
  const [open, setOpen] = useState(false);
  const shown = shownResponseParameters(parameters);
  const unused = unusedResponseSettings(
    settings,
    parameters?.map((parameter) => parameter.name),
  );
  const note = unused.length ? <UnusedNote unused={unused} /> : null;

  if (!shown.length) {
    // No group: this model takes no response settings. A saved value still
    // says so, and it can still be saved away with the model choice.
    if (leading)
      return (
        <section aria-label="Response settings" data-slot="response-settings">
          <SettingsGroupLabel>Response</SettingsGroupLabel>
          {leading}
          {note}
        </section>
      );
    return note ? <div data-slot="response-settings-unused-only">{note}</div> : null;
  }

  const rows = (items: typeof shown) =>
    items.map((parameter) => (
      <ParameterRow
        dirty={dirty?.has(parameter.name) ?? false}
        disabled={disabled}
        key={parameter.name}
        onChange={(value) => onEdit(parameter.name, value)}
        parameter={parameter}
        value={settings[parameter.name] ?? ''}
      />
    ));

  if (shown.length <= INLINE_SETTINGS_LIMIT) {
    const at = shown.findIndex((parameter) => parameter.name === 'max_tokens') + 1;
    return (
      <section aria-label="Response settings" data-slot="response-settings">
        <SettingsGroupLabel>Response</SettingsGroupLabel>
        {rows(shown.slice(0, at))}
        {leading}
        {rows(shown.slice(at))}
        {note}
      </section>
    );
  }

  return (
    <>
      {leading ? (
        <section aria-label="Response" data-slot="response-leading">
          <SettingsGroupLabel>Response</SettingsGroupLabel>
          {leading}
        </section>
      ) : null}
      <Collapsible data-slot="response-settings" onOpenChange={setOpen} open={open}>
        <div className="mt-4 flex h-7 items-center" data-slot="settings-group-label">
          <CollapsibleTrigger
            className="-ms-1.5 flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-label whitespace-nowrap text-faint outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                'size-3.5 transition-transform motion-reduce:transition-none',
                open && 'rotate-90',
              )}
            />
            Response settings
            <span className="rounded-full bg-muted px-1.5 text-[0.65625rem] tabular-nums text-muted-foreground">
              {shown.length}
            </span>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          {GROUPS.map((group) => {
            const items = shown.filter((parameter) => parameter.group === group.id);
            return items.length ? (
              <section aria-label={group.title} key={group.id}>
                <SettingsGroupLabel className="mt-2">{group.title}</SettingsGroupLabel>
                {rows(items)}
              </section>
            ) : null;
          })}
        </CollapsibleContent>
        {note}
      </Collapsible>
    </>
  );
}

function UnusedNote({ unused }: { unused: ReturnType<typeof unusedResponseSettings> }) {
  return (
    <p className="mt-2 truncate text-xs text-faint" data-slot="response-settings-unused">
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

function ParameterRow({
  parameter,
  value,
  dirty,
  disabled,
  onChange,
}: {
  parameter: AcceptedParameter;
  value: string;
  dirty: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `response-${parameter.name}`;
  const range = rangeText(parameter);
  const info = range ? `Range ${range}.` : undefined;
  if (parameter.kind === 'enum') {
    const options = parameter.options ?? [];
    return (
      <div data-parameter={parameter.name}>
        <SettingsRow description={parameter.description} dirty={dirty} title={parameter.label}>
          <SettingsChoice
            id={id}
            label={parameter.label}
            onChange={(next) => onChange(next === PROVIDER_DEFAULT ? '' : next)}
            options={[
              { value: PROVIDER_DEFAULT, label: 'Default', description: defaultText(parameter) },
              ...options.map((option) => ({ value: option, label: option })),
            ]}
            value={value && options.includes(value) ? value : PROVIDER_DEFAULT}
          />
        </SettingsRow>
      </div>
    );
  }

  const numeric = toNumber(value);
  const error = responseSettingError(parameter, value);
  // A range with no stated default is one field reading "Provider default":
  // a slider would claim a position the provider never stated.
  const bounded =
    parameter.kind === 'number' &&
    parameter.minimum !== null &&
    parameter.maximum !== null &&
    typeof parameter.default === 'number';
  const field = (
    <Input
      aria-describedby={error ? `${id}-error` : undefined}
      aria-invalid={error ? true : undefined}
      aria-label={parameter.label}
      autoComplete="off"
      className={cn(
        'h-[1.875rem] shrink-0 px-2 text-right font-mono text-xs tabular-nums placeholder:font-sans placeholder:text-xs placeholder:text-faint md:text-xs',
        // .xf.num: 72 px beside a slider, 150 px holding "Provider default".
        bounded ? 'w-[4.5rem]' : 'w-[9.375rem]',
      )}
      data-slot="response-setting-input"
      disabled={disabled}
      id={id}
      inputMode={parameter.kind === 'integer' ? 'numeric' : 'decimal'}
      onChange={(event) => onChange(event.target.value)}
      placeholder={bounded ? 'Default' : defaultText(parameter)}
      spellCheck={false}
      value={value}
    />
  );
  const errorLine = error ? <span id={`${id}-error`}>{error}</span> : undefined;
  if (!bounded) {
    return (
      <div data-parameter={parameter.name}>
        <SettingsRow
          description={parameter.description}
          dirty={dirty}
          error={errorLine}
          htmlFor={id}
          info={info}
          title={parameter.label}
        >
          {field}
        </SettingsRow>
      </div>
    );
  }
  const minimum = parameter.minimum as number;
  const maximum = parameter.maximum as number;
  // Unset: the thumb rests on the stated default (that value is sent).
  const stated = parameter.default as number;
  return (
    <div data-parameter={parameter.name}>
      <SettingsRow
        description={parameter.description}
        dirty={dirty}
        error={errorLine}
        htmlFor={id}
        info={info}
        title={parameter.label}
      >
        <span className="shrink-0 text-label text-faint" data-slot="response-default">
          {defaultText(parameter)}
        </span>
        <Slider
          aria-label={parameter.label}
          className={cn('w-[34%] min-w-[5.625rem] shrink-0', numeric === null && 'opacity-60')}
          disabled={disabled}
          max={maximum}
          min={minimum}
          onValueChange={([next]) =>
            onChange(next === undefined ? '' : atStep(next, parameter.step))
          }
          step={parameter.step ?? 0.01}
          thumbProps={() => ({ 'aria-label': parameter.label })}
          value={[Math.min(maximum, Math.max(minimum, numeric ?? stated))]}
        />
        {field}
      </SettingsRow>
    </div>
  );
}
