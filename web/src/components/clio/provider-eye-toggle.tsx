import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import type { ProviderGroup } from './model-picker-model';
import { t, ph } from '@lingui/core/macro';

/** The eye: rendered ONLY while managing visibility (the caller does not
 * mount this at all outside that mode -- normal mode is `name heartbeat
 * count ›`, no eye) -- BESIDE the heartbeat, never replacing it.
 *
 * `asStaticElement` renders the SAME Toggle onto a `<span>` instead of its
 * default `<button>` (Radix `asChild`) -- needed exactly when this row is
 * itself already a real `<button>` (a non-active Cascader column; see
 * `providerRowsAreTrailButtons` above). A `<button>` nested in a `<button>`
 * is invalid HTML; a `<span>` keeps the identical look, click and
 * `onPressedChange` behaviour (Radix drives both from its own props, not
 * from the child's tag), consistent with every row here already being
 * `tabIndex={-1}` -- these controls are activated by click, never by an
 * independent Tab stop. */
export function ProviderEyeToggle({
  asStaticElement,
  group,
  hidden,
  onToggle,
}: {
  asStaticElement: boolean;
  group: ProviderGroup;
  hidden: boolean;
  onToggle: () => void;
}) {
  const icon = hidden ? (
    <EyeOffIcon aria-hidden="true" className="size-3.5" />
  ) : (
    <EyeIcon aria-hidden="true" className="size-3.5" />
  );
  return (
    <Toggle
      aria-label={
        hidden
          ? t`Show ${ph({ name: group.name })} in this picker`
          : t`Hide ${ph({ name: group.name })} in this picker`
      }
      asChild={asStaticElement}
      className="size-6 min-w-0 p-0"
      data-slot="provider-visibility-toggle"
      onClick={(event) => event.stopPropagation()}
      onPressedChange={onToggle}
      pressed={hidden}
      size="sm"
      title={hidden ? t`Show ${ph({ name: group.name })}` : t`Hide ${ph({ name: group.name })}`}
    >
      {asStaticElement ? (
        <span role="button" tabIndex={-1}>
          {icon}
        </span>
      ) : (
        icon
      )}
    </Toggle>
  );
}
