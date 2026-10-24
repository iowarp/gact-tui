import { BrainIcon } from 'lucide-react';
import { Link, useInRouterContext } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface MemoryUsed {
  read: string[];
  loaded: string[];
}

/** What an answer took from long-term memory, from the turn's ``memory_used`` metadata. */
function memoryUsed(metadata: Record<string, unknown> | undefined): MemoryUsed | undefined {
  const value = metadata?.memory_used;
  if (!value || typeof value !== 'object') return;
  const list = (key: 'read' | 'loaded') => {
    const items = (value as Record<string, unknown>)[key];
    return Array.isArray(items)
      ? items.filter((item): item is string => typeof item === 'string')
      : [];
  };
  const used = { read: list('read'), loaded: list('loaded') };
  return used.read.length || used.loaded.length ? used : undefined;
}

function DocumentList({ title, names }: { title: string; names: string[] }) {
  const routed = useInRouterContext();
  if (!names.length) return null;
  return (
    <section className="grid gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="grid gap-0.5 text-sm">
        {names.map((name) => (
          <li className="truncate" key={name}>
            {routed ? (
              <Link
                className="underline"
                to={`/settings/memory?${new URLSearchParams({ doc: name })}`}
              >
                {name}
              </Link>
            ) : (
              name
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A footer action naming the memory documents this answer read or had loaded. */
export function MemoryUsedAction({ metadata }: { metadata?: Record<string, unknown> }) {
  const used = memoryUsed(metadata);
  if (!used) return null;
  const count = new Set([...used.read, ...used.loaded]).size;
  const label = `Used ${count} memory ${count === 1 ? 'document' : 'documents'}`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button aria-label={label} size="icon-sm" title={label} type="button" variant="ghost">
          <BrainIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-72 gap-3">
        <p className="text-sm font-medium">{label}</p>
        <DocumentList names={used.read} title="Read while answering" />
        <DocumentList names={used.loaded} title="Loaded at the start of the conversation" />
      </PopoverContent>
    </Popover>
  );
}
