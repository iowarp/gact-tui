'use client';

// Copyright 2023 Vercel, Inc. Licensed under Apache-2.0.
// Source: vercel/ai-elements packages/elements/src/inline-citation.tsx at
// 6a9d5b1822ffb10bba4bd97175f01edd7d8651cd.
// Workspace import aliases are adapted; the trigger also accepts an explicit label/link child.
// See LICENSE-APACHE-2.0.txt in this directory for the license terms.

import { Badge } from '@/components/ui/badge';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';

export type InlineCitationProps = ComponentProps<'span'>;

export const InlineCitation = ({ className, ...props }: InlineCitationProps) => (
  <span className={cn('group inline items-center gap-1', className)} {...props} />
);

export type InlineCitationCardProps = ComponentProps<typeof HoverCard>;

export const InlineCitationCard = (props: InlineCitationCardProps) => (
  <HoverCard closeDelay={0} openDelay={0} {...props} />
);

export type InlineCitationCardTriggerProps = ComponentProps<typeof Badge> & {
  sources: string[];
};

export const InlineCitationCardTrigger = ({
  sources,
  className,
  children,
  ...props
}: InlineCitationCardTriggerProps) => (
  <HoverCardTrigger asChild>
    <Badge className={cn('ml-1 rounded-full', className)} variant="secondary" {...props}>
      {children ??
        (sources[0] ? (
          <>
            {new URL(sources[0]).hostname} {sources.length > 1 && `+${sources.length - 1}`}
          </>
        ) : (
          'unknown'
        ))}
    </Badge>
  </HoverCardTrigger>
);

export type InlineCitationCardBodyProps = ComponentProps<'div'>;

export const InlineCitationCardBody = ({ className, ...props }: InlineCitationCardBodyProps) => (
  <HoverCardContent className={cn('relative w-80 p-0', className)} {...props} />
);

export type InlineCitationSourceProps = ComponentProps<'div'> & {
  title?: string;
  url?: string;
  description?: string;
};

export const InlineCitationSource = ({
  title,
  url,
  description,
  className,
  children,
  ...props
}: InlineCitationSourceProps) => (
  <div className={cn('space-y-1', className)} {...props}>
    {title && <h4 className="truncate font-medium text-sm leading-tight">{title}</h4>}
    {url && <p className="truncate break-all text-muted-foreground text-xs">{url}</p>}
    {description && (
      <p className="line-clamp-3 text-muted-foreground text-sm leading-relaxed">{description}</p>
    )}
    {children}
  </div>
);
