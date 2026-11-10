import { useEffect, useRef, useState, type Ref } from 'react';
import { InputGroup, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const FIELD = 'h-[1.875rem] rounded-md';
const INPUT = 'h-full text-right font-mono text-[0.78125rem] tabular-nums';
const UNIT = 'pr-2 text-[0.71875rem] text-muted-foreground';

/** A right-aligned mono number with its unit inside the field. */
export function SettingsNumberInput({
  id,
  label,
  value,
  minimum,
  maximum,
  step,
  unit,
  disabled,
  placeholder,
  className,
  inputRef,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  minimum?: number;
  maximum?: number;
  step: number | 'any';
  unit?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
}) {
  return (
    <InputGroup
      className={cn(FIELD, 'w-32 shrink-0', className)}
      data-disabled={disabled || undefined}
    >
      <InputGroupInput
        aria-label={label}
        className={INPUT}
        disabled={disabled}
        id={id}
        max={maximum}
        min={minimum}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        step={step}
        type="number"
        value={value}
      />
      {unit ? <InputGroupText className={UNIT}>{unit}</InputGroupText> : null}
    </InputGroup>
  );
}

/** A finite positive limit beside an inline Unlimited switch, retaining the last number. */
export function SettingsLimitInput({
  id,
  label,
  value,
  defaultValue,
  unit,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  defaultValue: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const previous = useRef(defaultValue > 0 ? String(defaultValue) : '1');
  const unlimited = value === '0';
  return (
    <span className="flex min-w-0 items-center gap-3">
      <label
        className="flex shrink-0 items-center gap-1.5 text-[0.75rem] whitespace-nowrap text-muted-foreground"
        htmlFor={`${id}-unlimited`}
      >
        <Switch
          aria-label={`Unlimited ${label.toLowerCase()}`}
          checked={unlimited}
          disabled={disabled}
          id={`${id}-unlimited`}
          onCheckedChange={(checked) => {
            if (checked && Number(value) > 0) previous.current = value;
            onChange(checked ? '0' : previous.current);
          }}
        />
        Unlimited
      </label>
      <SettingsNumberInput
        disabled={disabled || unlimited}
        id={id}
        label={label}
        minimum={1}
        onChange={(next) => {
          if (Number(next) > 0) previous.current = next;
          onChange(next);
        }}
        step={1}
        unit={unit}
        value={unlimited ? '' : value}
      />
    </span>
  );
}

/** A preset picker filling the control column that switches to a typed value for Custom…. */
export function SettingsPresetInput({
  id,
  label,
  value,
  presets,
  minimum,
  maximum,
  step,
  unit,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  presets: readonly { label: string; value: number }[];
  minimum?: number;
  maximum?: number;
  step: number | 'any';
  unit?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const matched = value.trim()
    ? presets.find((preset) => preset.value === Number(value))
    : undefined;
  const [editingCustom, setEditingCustom] = useState(!matched);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusInput = useRef(false);
  const localValue = useRef(value);
  const custom = editingCustom || !matched;

  useEffect(() => {
    if (custom && focusInput.current) {
      focusInput.current = false;
      inputRef.current?.focus();
    }
  }, [custom]);

  useEffect(() => {
    if (localValue.current !== value) {
      localValue.current = value;
      setEditingCustom(!matched);
    }
  }, [value, matched]);

  const change = (next: string) => {
    localValue.current = next;
    onChange(next);
  };
  const choose = (next: string) => {
    if (next === 'custom') {
      focusInput.current = true;
      setEditingCustom(true);
      return;
    }
    const preset = presets.find((option) => String(option.value) === next);
    if (preset) {
      setEditingCustom(false);
      change(String(preset.value));
    }
  };
  const options = (
    <SelectContent>
      {presets.map((preset) => (
        <SelectItem key={preset.value} value={String(preset.value)}>
          {preset.label}
        </SelectItem>
      ))}
      <SelectItem value="custom">Custom…</SelectItem>
    </SelectContent>
  );

  return (
    <span className="flex w-full min-w-0 items-center justify-end gap-1.5">
      <Select
        disabled={disabled}
        onValueChange={choose}
        value={custom ? 'custom' : String(matched.value)}
      >
        <SelectTrigger
          aria-label={`Choose ${label.toLowerCase()} preset`}
          className={cn(FIELD, 'w-full min-w-0 text-[0.78125rem]', custom && 'w-auto shrink')}
          id={custom ? undefined : id}
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        {options}
      </Select>
      {custom ? (
        <SettingsNumberInput
          disabled={disabled}
          id={id}
          inputRef={inputRef}
          label={label}
          maximum={maximum}
          minimum={minimum}
          onChange={change}
          step={step}
          unit={unit}
          value={value}
        />
      ) : null}
    </span>
  );
}
