import type { MemoryFact } from '@clio/core/v3';
import { DownloadIcon, SparklesIcon, UserRoundIcon, WrenchIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { t, ph } from '@lingui/core/macro';

const SOURCES = {
  user: { icon: UserRoundIcon, label: t`You said this` },
  inferred: { icon: SparklesIcon, label: t`Inferred from a conversation` },
  imported: { icon: DownloadIcon, label: t`Imported` },
  tool: { icon: WrenchIcon, label: t`From a tool result` },
} as const;

/** A fact's provenance as an icon, with who said it, when and where on hover. */
export function MemorySourceIcon({
  fact,
  sessionHref,
}: {
  fact: Pick<MemoryFact, 'source' | 'session' | 'at' | 'message'>;
  sessionHref?: string;
}) {
  const source = SOURCES[fact.source];
  const Icon = source.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={`${source.label}, ${fact.at}`}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground"
          role="img"
        >
          <Icon aria-hidden="true" className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="grid gap-1 px-[9px] py-1.5 text-xs">
        <span className="font-medium">{source.label}</span>
        <span>{t`Recorded ${ph({ at: fact.at })}`}</span>
        {sessionHref ? (
          <Link className="underline" to={sessionHref}>
            {t`Open the conversation`}
          </Link>
        ) : fact.source === 'imported' ? (
          <span>{t`Imported notes`}</span>
        ) : fact.session && fact.session !== 'memory_page' ? (
          <span>{t`Conversation ${ph({ session: fact.session })}`}</span>
        ) : (
          <span>{t`Edited on the memory page`}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Where a review-required proposal's facts came from, spelled out. */
export function ReviewMarker({ sources }: { sources: string[] }) {
  const tool = sources.includes('tool');
  const imported = sources.includes('imported');
  if (!tool && !imported) return null;
  const Icon = tool ? WrenchIcon : DownloadIcon;
  const label = tool
    ? t`Rests on a tool result: review before it applies`
    : t`Imported: review before it applies`;
  return (
    <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground">
      <Icon aria-hidden="true" className="size-3" />
      {label}
    </span>
  );
}
