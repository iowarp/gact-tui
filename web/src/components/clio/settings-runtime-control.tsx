import type { RuntimeSetting } from '@clio/core/v3';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { IconButton } from './primitives/icon-button';
import {
  SettingsLimitInput,
  SettingsNumberInput,
  SettingsPresetInput,
} from './settings-runtime-number';
import { ph, t } from '@lingui/core/macro';

/** The control for one runtime setting, sized to the right column of its setting row. */
export function RuntimeSettingControl({
  setting,
  id,
  value,
  disabled,
  canReset,
  resetDisabled,
  onChange,
}: {
  setting: RuntimeSetting;
  id: string;
  value: string | boolean;
  disabled: boolean;
  /** Offer "Use inherited value" for a saved override. */
  canReset: boolean;
  resetDisabled: boolean;
  onChange: (value: string | boolean | null) => void;
}) {
  const unitFactor = setting.unit === 'percent' ? 100 : 1;
  const unit = setting.unit === 'percent' ? '%' : (setting.unit ?? undefined);
  const scaled = (limit: number | null) => (limit === null ? undefined : limit * unitFactor);
  const step = setting.kind === 'integer' ? 1 : 'any';
  return (
    <div className="flex w-full min-w-0 items-center justify-end gap-1.5">
      {setting.kind === 'choice' ? (
        <Select disabled={disabled} onValueChange={(next) => onChange(next)} value={String(value)}>
          <SelectTrigger
            aria-label={setting.title}
            className="h-[1.875rem] w-full min-w-0 text-menu"
            id={id}
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {setting.choices.map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : setting.kind === 'text' ? (
        <Input
          aria-label={setting.title}
          autoComplete="off"
          className="h-[1.875rem] w-full min-w-0 text-menu"
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t`Not set`}
          spellCheck={false}
          title={String(value) || undefined}
          type="text"
          value={String(value)}
        />
      ) : setting.kind === 'boolean' ? (
        <Switch
          checked={Boolean(value)}
          disabled={disabled}
          id={id}
          onCheckedChange={(next) => onChange(next)}
        />
      ) : setting.presets?.length ? (
        <SettingsPresetInput
          disabled={disabled}
          id={id}
          label={setting.title}
          maximum={scaled(setting.maximum)}
          minimum={scaled(setting.minimum)}
          onChange={(next) => onChange(next)}
          presets={setting.presets.map((preset) => ({
            label: preset.label,
            value: preset.value * unitFactor,
          }))}
          step={step}
          unit={unit}
          value={String(value)}
        />
      ) : setting.unlimited_value === 0 ? (
        <SettingsLimitInput
          defaultValue={Number(setting.default_value)}
          disabled={disabled}
          id={id}
          label={setting.title}
          onChange={(next) => onChange(next)}
          unit={unit}
          value={String(value)}
        />
      ) : (
        <SettingsNumberInput
          disabled={disabled}
          id={id}
          label={setting.title}
          maximum={scaled(setting.maximum)}
          minimum={scaled(setting.minimum)}
          onChange={(next) => onChange(next)}
          step={step}
          unit={unit}
          value={String(value)}
        />
      )}
      {canReset ? (
        <IconButton
          disabled={resetDisabled}
          icon={<RetryIcon />}
          label={t`Use inherited ${ph({ setting: setting.title.toLowerCase() })}`}
          onClick={() => onChange(null)}
          size="sm"
        />
      ) : null}
    </div>
  );
}
