import { Select as SelectPrimitive } from 'radix-ui';
import { Select, SelectContent, SelectItem } from '@/components/ui/select';
import { SettingsSelectField } from './model-select-field';

export type ObsidianSyncMode = 'pull-only' | 'bidirectional';

const directions: ReadonlyArray<{ value: ObsidianSyncMode; label: string }> = [
  { value: 'pull-only', label: 'Download remote changes' },
  { value: 'bidirectional', label: 'Sync changes both ways' },
];

/** The synced vault's direction: the shared select field over the shared menu. */
export function ObsidianSyncDirection({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: ObsidianSyncMode;
  onChange: (value: ObsidianSyncMode) => void;
  disabled?: boolean;
}) {
  const current = directions.find((direction) => direction.value === value);
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={(next) => onChange(next as ObsidianSyncMode)}
    >
      <SelectPrimitive.Trigger asChild>
        <SettingsSelectField id={id} title={current?.label} value={current?.label} />
      </SelectPrimitive.Trigger>
      <SelectContent>
        {directions.map((direction) => (
          <SelectItem key={direction.value} value={direction.value}>
            {direction.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
