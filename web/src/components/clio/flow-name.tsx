import type { FlowInfo } from '@/hooks/use-flow-presentation';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { PluginFlowShape } from './plugin-flow-shape';
import { t, ph } from '@lingui/core/macro';

/**
 * The name of a flow a step or a call runs. When the agent knows the flow, the
 * name opens what it is: its plugin, what it does, and the railroad its author
 * drew. A name the agent does not know stays plain text.
 */
export function FlowName({ name, info }: { name: string; info?: FlowInfo }) {
  if (!info) return <>{name}</>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={t`What the ${ph({ id: info.id })} flow is`}
          className="cursor-pointer font-medium text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-ring"
          data-slot="flow-name"
          type="button"
        >
          {name}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={t`The ${ph({ id: info.id })} flow`}
        className="grid w-[min(28rem,calc(100vw-2rem))] gap-3"
      >
        <PopoverHeader>
          <PopoverTitle>{t`The ${ph({ id: info.id })} flow`}</PopoverTitle>
          {info.plugin ? (
            <PopoverDescription>{t`From the ${ph({ plugin: info.plugin })} plugin`}</PopoverDescription>
          ) : null}
        </PopoverHeader>
        {info.description ? <p className="text-sm">{info.description}</p> : null}
        <PluginFlowShape label={t`What the ${ph({ id: info.id })} flow does`} source={info.shape} />
      </PopoverContent>
    </Popover>
  );
}
