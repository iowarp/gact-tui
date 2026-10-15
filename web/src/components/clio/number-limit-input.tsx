import { useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

/** A finite positive limit or an explicit Unlimited choice, retaining the last number. */
export function NumberLimitInput({
  id,
  label,
  value,
  defaultValue,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  defaultValue: number;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const previous = useRef(defaultValue > 0 ? String(defaultValue) : '1');
  const unlimited = value === '0';
  return (
    <div className="grid w-full justify-items-center gap-2">
      <Input
        id={id}
        aria-label={label}
        className="w-28 text-center"
        type="number"
        min={1}
        step={1}
        value={unlimited ? '' : value}
        placeholder={unlimited ? 'Unlimited' : undefined}
        disabled={disabled || unlimited}
        onChange={(event) => {
          const next = event.target.value;
          if (Number(next) > 0) previous.current = next;
          onChange(next);
        }}
      />
      <label className="flex items-center gap-2 text-xs" htmlFor={`${id}-unlimited`}>
        <Switch
          id={`${id}-unlimited`}
          aria-label={`Unlimited ${label.toLowerCase()}`}
          checked={unlimited}
          disabled={disabled}
          onCheckedChange={(checked) => {
            if (checked && Number(value) > 0) previous.current = value;
            onChange(checked ? '0' : previous.current);
          }}
        />
        Unlimited
      </label>
    </div>
  );
}
