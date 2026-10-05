import { useContext, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { FileTextIcon, ImageIcon, LayersIcon, WrenchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { connectionScope } from '@/lib/connection-scope';
import type { SelectionTarget } from '@/lib/selection-actions';
import { InfoTip } from './info-tip';

/** Select exact stored parts even when tool cards or media are collapsed. */
export function TranscriptContentPicker(props: { sessionId: string; messageId: string }) {
  const registry = useContext(SelectionActionsContext);
  return registry ? <ScopedContentPicker {...props} /> : null;
}

function ScopedContentPicker(props: { sessionId: string; messageId: string }) {
  const { settings } = useConnectionSettings();
  return <ContentPicker key={connectionScope(settings)} {...props} />;
}

function ContentPicker({ sessionId, messageId }: { sessionId: string; messageId: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const registry = useContext(SelectionActionsContext);
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const content = useInfiniteQuery({
    queryKey: ['attention-content', connectionScope(settings), sessionId, messageId],
    queryFn: ({ pageParam, signal }) =>
      repository.attentionContent(sessionId, messageId, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: open,
  });
  if (!registry) return null;
  const rows = content.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) setAdded(new Set());
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Select content for attention">
          <LayersIcon aria-hidden="true" className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select content</DialogTitle>
          <DialogDescription>
            Add whole blocks to the attention set, including collapsed activity.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1 max-h-[55dvh]">
          <div className="space-y-1 pr-3">
            {rows.map((row) => {
              const key = JSON.stringify(row.reference);
              const target: SelectionTarget = {
                kind: 'transcript-content',
                reference: row.reference,
                text: `${row.label}: ${row.preview}`,
              };
              const action = registry
                .actionsFor(target)
                .find((item) => item.id === 'attention-set');
              const Icon =
                row.kind.includes('tool') || row.kind === 'thought'
                  ? WrenchIcon
                  : row.kind === 'image'
                    ? ImageIcon
                    : FileTextIcon;
              return (
                <div key={key} className="flex min-w-0 items-center gap-2 rounded-md border p-2">
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{row.label}</p>
                    <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                      {row.preview || 'Recorded content reference'}
                    </p>
                  </div>
                  {row.explanation ? (
                    <InfoTip label={`Mapping availability for ${row.label}`}>
                      {row.explanation}
                    </InfoTip>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!action || added.has(key)}
                    onClick={() => {
                      if (action?.run(target) !== false)
                        setAdded((previous) => new Set([...previous, key]));
                    }}
                  >
                    {added.has(key) ? 'Added' : 'Add'}
                  </Button>
                </div>
              );
            })}
            {content.isPending ? (
              <p role="status" className="text-sm">
                Loading content…
              </p>
            ) : null}
            {content.error ? (
              <p role="alert" className="text-sm text-destructive">
                {content.error.message}
              </p>
            ) : null}
            {!content.isPending && !content.error && !rows.length ? (
              <p className="text-sm">No completed content is available.</p>
            ) : null}
          </div>
        </ScrollArea>
        <div className="flex justify-between gap-2">
          {content.hasNextPage ? (
            <Button
              variant="outline"
              disabled={content.isFetchingNextPage}
              onClick={() => void content.fetchNextPage()}
            >
              More content
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={() => setOpen(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
