import { BookOpenIcon, ChevronDownIcon, ExternalLinkIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export type SourcesProps = ComponentProps<typeof Collapsible>;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <Collapsible className={cn('not-prose text-xs', className)} {...props} />
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export const SourcesTrigger = ({ className, count, children, ...props }: SourcesTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      'group flex items-center gap-1.5 rounded-md py-1 text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        <BookOpenIcon aria-hidden="true" className="size-3.5" />
        <span className="font-medium">
          {count} {count === 1 ? 'source' : 'sources'}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
        />
      </>
    )}
  </CollapsibleTrigger>
);

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({ className, ...props }: SourcesContentProps) => (
  <CollapsibleContent
    className={cn(
      'mt-1.5 flex w-full flex-col gap-1.5 outline-none',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2',
      className,
    )}
    {...props}
  />
);

export type SourceProps = ComponentProps<'a'> & {
  description?: string;
};

function sourceHost(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href).hostname.replace(/^www\./u, '');
  } catch {
    return undefined;
  }
}

export const Source = ({
  className,
  description,
  href,
  title,
  children,
  ...props
}: SourceProps) => {
  const host = sourceHost(href);
  return (
    <a
      className={cn(
        'group/source flex min-w-0 items-start gap-2 rounded-md border bg-card px-2.5 py-2 text-foreground shadow-xs outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      href={href}
      rel="noreferrer"
      target="_blank"
      {...props}
    >
      {children ?? (
        <>
          <BookOpenIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium leading-5">{title || href}</span>
            {description || host ? (
              <span className="mt-0.5 block text-muted-foreground">{description || host}</span>
            ) : null}
          </span>
          <ExternalLinkIcon
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
          />
        </>
      )}
    </a>
  );
};
