import { createComponentImplementation } from '@a2ui/react/v0_9';
import { ButtonApi } from '@a2ui/web_core/v0_9/basic_catalog';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { a2uiAccessibilityLabel } from './a2ui-accessibility';
import { NamedTooltip } from './primitives/icon-button';

/** Render standard A2UI actions with the same affordances as CLIO's own controls. */
export const ClioA2UIButton = createComponentImplementation(
  ButtonApi,
  ({ props, context, buildChild }) => {
    const label = a2uiAccessibilityLabel(props.accessibility);
    const childId = typeof props.child === 'string' ? props.child : undefined;
    // A lone glyph (a gear that opens a dialog) is a square icon button named by its label.
    const iconOnly =
      label !== undefined &&
      childId !== undefined &&
      context.surfaceComponents.get(childId)?.type === 'Icon';
    const button = (
      <Button
        type="button"
        variant={
          props.variant === 'primary'
            ? 'default'
            : props.variant === 'borderless'
              ? 'ghost'
              : 'outline'
        }
        aria-label={label}
        size={iconOnly ? 'icon' : undefined}
        className={cn(
          'max-w-full self-start [&_p]:m-0',
          iconOnly
            ? 'self-center text-muted-foreground hover:text-foreground'
            : 'h-auto min-h-9 px-4 py-2 whitespace-normal',
        )}
        style={typeof props.weight === 'number' ? { flex: props.weight, minWidth: 0 } : undefined}
        onClick={props.action}
        disabled={props.isValid === false}
      >
        {props.child ? buildChild(props.child) : null}
      </Button>
    );
    if (!iconOnly) return button;
    return (
      <TooltipProvider>
        <NamedTooltip label={label}>{button}</NamedTooltip>
      </TooltipProvider>
    );
  },
);
