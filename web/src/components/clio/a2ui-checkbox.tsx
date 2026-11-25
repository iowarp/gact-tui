import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CheckBoxApi } from '@a2ui/web_core/v0_9/basic_catalog';
import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

/**
 * Render an A2UI CheckBox as CLIO's own checkbox. The whole row (box and label) is the
 * hit target, at least 36 px tall and 44 px on touch; the upstream control was a bare
 * 13 px native box with its bold label against it (live 2026-11-18).
 */
export const ClioCheckBox = createComponentImplementation(CheckBoxApi, ({ props }) => {
  const id = useId();
  const error = props.validationErrors?.[0];
  return (
    <div className="min-w-0 self-start" data-slot="a2ui-checkbox">
      <label
        htmlFor={id}
        className={cn(
          'flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm',
          'hover:bg-muted/60 pointer-coarse:min-h-11',
          error && 'text-destructive',
        )}
      >
        <Checkbox
          id={id}
          checked={props.value === true}
          onCheckedChange={(checked) => props.setValue(checked === true)}
          aria-invalid={error ? true : undefined}
          className="pointer-coarse:size-5"
        />
        <span className="min-w-0 break-words">{props.label}</span>
      </label>
      {error ? (
        <p role="alert" className="px-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
});
