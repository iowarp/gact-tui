import type { TargetFacts } from '@clio/core/v3';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RUNTIME_NAMES, hostSummary, runtimeFactLines } from './managed-service-target-utils';

/**
 * What an inspected computer offers, in plain sentences: the system and GPU,
 * then one line per container runtime. A runtime's own error text is never
 * the message; it sits behind "Show details" for whoever needs it.
 */
export function ManagedServiceHostFacts({ facts }: { facts: TargetFacts }) {
  const [open, setOpen] = useState(false);
  const lines = runtimeFactLines(facts);
  const details = lines.filter((line) => line.detail);
  return (
    <div className="mt-4 space-y-1 text-sm text-muted-foreground">
      <p>{hostSummary(facts)}</p>
      <ul className="space-y-1">
        {lines.map((line) => (
          <li key={line.name}>{line.text}</li>
        ))}
      </ul>
      {details.length ? (
        <Collapsible onOpenChange={setOpen} open={open}>
          <CollapsibleTrigger asChild>
            <Button
              className="-ml-2 h-7 gap-1 px-2 text-xs"
              size="sm"
              type="button"
              variant="ghost"
            >
              {open ? 'Hide details' : 'Show details'}
              <ChevronDownIcon
                aria-hidden="true"
                className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="mt-1 space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
              {details.map((line) => (
                <div key={line.name}>
                  <dt className="font-medium text-foreground">{RUNTIME_NAMES[line.name]}</dt>
                  <dd className="mt-0.5 break-words font-mono">{line.detail}</dd>
                </div>
              ))}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
