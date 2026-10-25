import { useEffect, useRef, useState } from 'react';
import { InputGroup, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** A compact preset picker that switches to a manual editor for custom values. */
export function NumericPresetInput({
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
  const matchedPreset = value.trim()
    ? presets.find((preset) => preset.value === Number(value))
    : undefined;
  const [editingCustom, setEditingCustom] = useState(!matchedPreset);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusCustomInput = useRef(false);
  const localValue = useRef(value);
  const customMode = editingCustom || !matchedPreset;

  useEffect(() => {
    if (customMode && focusCustomInput.current) {
      focusCustomInput.current = false;
      inputRef.current?.focus();
    }
  }, [customMode]);

  useEffect(() => {
    if (localValue.current !== value) {
      localValue.current = value;
      setEditingCustom(!matchedPreset);
    }
  }, [value, matchedPreset]);

  const change = (next: string) => {
    localValue.current = next;
    onChange(next);
  };

  const chooseValue = (next: string) => {
    if (next === 'custom') {
      focusCustomInput.current = true;
      setEditingCustom(true);
      return;
    }
    const preset = presets.find((option) => String(option.value) === next);
    if (preset) {
      setEditingCustom(false);
      change(String(preset.value));
    }
  };

  return customMode ? (
    <InputGroup className="w-full max-w-72" data-disabled={disabled || undefined}>
      <InputGroupInput
        ref={inputRef}
        aria-label={label}
        disabled={disabled}
        id={id}
        max={maximum}
        min={minimum}
        step={step}
        type="number"
        value={value}
        onChange={(event) => change(event.target.value)}
      />
      {unit ? <InputGroupText>{unit}</InputGroupText> : null}
      <Select value="custom" disabled={disabled} onValueChange={chooseValue}>
        <SelectTrigger
          aria-label={`Choose ${label.toLowerCase()} preset`}
          className="h-7 w-auto shrink-0 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
        >
          <span>Presets</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="custom">Custom value</SelectItem>
          {presets.map((preset) => (
            <SelectItem key={preset.value} value={String(preset.value)}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </InputGroup>
  ) : (
    <Select value={String(matchedPreset.value)} disabled={disabled} onValueChange={chooseValue}>
      <SelectTrigger
        aria-label={`Choose ${label.toLowerCase()} preset`}
        className="w-full max-w-72 justify-between"
        id={id}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {presets.map((preset) => (
          <SelectItem key={preset.value} value={String(preset.value)}>
            {preset.label}
          </SelectItem>
        ))}
        <SelectItem value="custom">Custom…</SelectItem>
      </SelectContent>
    </Select>
  );
}
