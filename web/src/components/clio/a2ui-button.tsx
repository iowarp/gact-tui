import { createComponentImplementation } from '@a2ui/react/v0_9';
import { ButtonApi } from '@a2ui/web_core/v0_9/basic_catalog';
import { Button } from '@/components/ui/button';

/** Render standard A2UI actions with the same affordances as CLIO's own controls. */
export const ClioA2UIButton = createComponentImplementation(ButtonApi, ({ props, buildChild }) => (
  <Button
    type="button"
    variant={
      props.variant === 'primary' ? 'default' : props.variant === 'borderless' ? 'ghost' : 'outline'
    }
    className="h-auto min-h-9 max-w-full self-start px-4 py-2 whitespace-normal [&_p]:m-0"
    style={typeof props.weight === 'number' ? { flex: props.weight, minWidth: 0 } : undefined}
    onClick={props.action}
    disabled={props.isValid === false}
  >
    {props.child ? buildChild(props.child) : null}
  </Button>
));
