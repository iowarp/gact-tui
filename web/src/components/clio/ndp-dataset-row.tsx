import { useEffect, useId, useRef, useState } from 'react';
import type { NDPDataset } from '@clio/core/v3';
import { ChevronDownIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { sourceBytes } from './connected-source-labels';
import { ph, plural, t } from '@lingui/core/macro';

const RESOURCE_PAGE_SIZE = 10;

/** Browse titles first, then disclose descriptions and bounded resource choices. */
export function NDPDatasetRow({
  dataset,
  selected,
  disabled,
  onChange,
  defaultOpen = false,
}: {
  dataset: NDPDataset;
  selected: string[];
  disabled: boolean;
  onChange: (resourceId: string, checked: boolean) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [resourcesOpen, setResourcesOpen] = useState(true);
  const [resourceLimit, setResourceLimit] = useState(RESOURCE_PAGE_SIZE);
  const title = dataset.title || dataset.name;
  const remaining = dataset.resources.length - resourceLimit;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="py-3">
      <CollapsibleTrigger className="group flex w-full items-start justify-between gap-3 text-left">
        <span className="min-w-0 break-words font-medium">{title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {selected.length > 0 ? (
            <span className="text-xs text-primary">{t`${ph({ count: selected.length })} selected`}</span>
          ) : null}
          {dataset.access ? (
            <Badge variant="outline">
              {dataset.access === 'viewer' ? t`Viewer` : t`Request access`}
            </Badge>
          ) : null}
          <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        {dataset.description ? <DatasetDescription text={dataset.description} /> : null}
        <Collapsible open={resourcesOpen} onOpenChange={setResourcesOpen}>
          <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 py-1 text-left text-sm font-medium">
            <span>{t`Resources (${ph({ count: dataset.resources.length })})`}</span>
            <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent role="group" aria-label={t`Resources in ${title}`}>
            {dataset.resources.slice(0, resourceLimit).map((resource) => (
              <label
                key={resource.id}
                className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted/50"
              >
                <Checkbox
                  aria-label={resource.name}
                  className="mt-0.5"
                  checked={selected.includes(resource.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) => onChange(resource.id, checked === true)}
                />
                <span className="min-w-0 flex-1 break-words">
                  {resource.name}
                  <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    {resource.format ? <span>{resource.format}</span> : null}
                    {resource.size ? <span>{sourceBytes(resource.size)}</span> : null}
                  </span>
                </span>
              </label>
            ))}
            {!dataset.resources.length ? (
              <p className="text-sm text-muted-foreground">{t`No resources in this dataset.`}</p>
            ) : null}
            {remaining > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setResourceLimit((value) => value + RESOURCE_PAGE_SIZE)}
              >
                {plural(Math.min(RESOURCE_PAGE_SIZE, remaining), {
                  one: 'Show # more resource',
                  other: 'Show # more resources',
                })}
              </Button>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DatasetDescription({ text }: { text: string }) {
  const id = useId();
  const paragraph = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = paragraph.current;
    if (!element) return;
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, expanded]);
  return (
    <div>
      <p
        id={id}
        ref={paragraph}
        className={`break-words text-sm text-muted-foreground${expanded ? '' : ' line-clamp-3'}`}
      >
        {text}
      </p>
      {expanded || overflowing ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t`Show less` : t`Show more`}
        </Button>
      ) : null}
    </div>
  );
}
