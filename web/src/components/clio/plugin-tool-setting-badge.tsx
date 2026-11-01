import type { ToolCallers, ToolPermission } from '@clio/core/v3';
import {
  ArrowLeftRightIcon,
  BotIcon,
  CircleCheckIcon,
  CodeIcon,
  OctagonXIcon,
  type LucideIcon,
} from 'lucide-react';
import { HelpIcon } from '@/lib/icon-vocabulary';
import { CALLERS_TEXT, PERMISSION_TEXT } from './plugin-tool-settings-text';

const ICONS: Record<ToolPermission | ToolCallers, LucideIcon> = {
  allow: CircleCheckIcon,
  ask: HelpIcon,
  deny: OctagonXIcon,
  direct: BotIcon,
  code: CodeIcon,
  both: ArrowLeftRightIcon,
};

/**
 * One setting's value: an icon and its name in words. A value that comes from a
 * default (the plugin's, the deployment's, or what the flags and approval mode do)
 * carries a small "D" on its icon and says "default" to assistive technology; a
 * value the person chose has no mark.
 */
export function SettingBadge({
  value,
  isDefault,
  muted = false,
}: {
  value: ToolPermission | ToolCallers | '';
  isDefault: boolean;
  muted?: boolean;
}) {
  if (!value) return <span className="text-muted-foreground">Not known yet</span>;
  const Icon = ICONS[value];
  const label =
    value in PERMISSION_TEXT
      ? PERMISSION_TEXT[value as ToolPermission].label
      : CALLERS_TEXT[value as ToolCallers].label;
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 ${muted ? 'text-muted-foreground' : ''}`}
      aria-label={isDefault ? `${label}, default` : label}
      title={isDefault ? `${label} (default; choose a value to override it)` : label}
    >
      <span aria-hidden className="inline-flex shrink-0 items-end">
        <Icon className={`size-4 ${value === 'deny' ? 'text-destructive' : ''}`} />
        {isDefault ? (
          <sub className="-ml-0.5 text-[10px] leading-none font-semibold text-muted-foreground">
            D
          </sub>
        ) : null}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}
