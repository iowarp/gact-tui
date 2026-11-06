import type { AttentionItemsRequest, AttentionProfile } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AttentionItemFocus } from '@/hooks/use-attention-mode';
import { useRepository } from '@/hooks/use-repository';
import { attentionSelectionBody } from '@/lib/attention-selection-body';
import { truncate } from '@/lib/format';
import type { AgentAnswerTextSelection } from '@/lib/selection-actions';
import { InfoTip } from './info-tip';
import { downloadBlob } from './surface-export';

/** The answer-item delimiter `attn_analytics.py` reads (`NIL 373; DIVERGES` is two items). */
const DEFAULT_DELIMITER = ';';
const ITEM_LABEL_CHARS = 40;

/**
 * The SPOTTER answer items of a selection, shown on the transcript itself:
 * choosing an item repaints the transcript heat and the heat scroller with
 * that item's own attention, its first decode step weighted most and scaled
 * to its own maximum. "Whole selection" returns to the selection's heat.
 */
export function AttentionItemChips({
  selection,
  profile,
  focus,
  onFocus,
  children,
}: {
  /** Controls shown first in the same row, e.g. the heat profile. */
  children?: ReactNode;
  selection: AgentAnswerTextSelection;
  profile?: AttentionProfile;
  focus?: AttentionItemFocus;
  onFocus: (focus: AttentionItemFocus | undefined) => void;
}) {
  const repository = useRepository();
  const [delimiter, setDelimiter] = useState(DEFAULT_DELIMITER);
  const [exporting, setExporting] = useState(false);
  // The items and their spans do not depend on the heat profile; only the exported scores do.
  const request = useMemo<AttentionItemsRequest>(
    () => ({ items: [attentionSelectionBody(selection)], split: delimiter }),
    [delimiter, selection],
  );
  const items = useQuery({
    queryKey: ['attention-items', selection.sessionId, selection.messageId, request],
    queryFn: ({ signal }) =>
      repository.getAttentionItems(selection.sessionId, selection.messageId, request, signal),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const data = items.data?.available ? items.data : undefined;
  const download = async () => {
    setExporting(true);
    try {
      const result = await repository.exportAttentionItems(
        selection.sessionId,
        selection.messageId,
        { ...request, ...(profile ? { profile } : {}) },
      );
      if (!result.available) toast.error('Export is unavailable', { description: result.message });
      else downloadBlob(new Blob([result.csv], { type: 'text/csv' }), result.filename);
    } catch (error) {
      toast.error('Export is unavailable', {
        description: error instanceof Error ? error.message : 'The service rejected it.',
      });
    } finally {
      setExporting(false);
    }
  };
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs"
      data-slot="attention-item-chips"
    >
      {children}
      <Label htmlFor="attention-item-delimiter" className="text-xs text-muted-foreground">
        Answer items split at
      </Label>
      <Input
        id="attention-item-delimiter"
        className="h-6 w-10 px-1.5 font-mono text-xs"
        maxLength={8}
        value={delimiter}
        onChange={(event) => {
          setDelimiter(event.target.value);
          onFocus(undefined);
        }}
      />
      <InfoTip label="About answer items">
        Each item is scored on its own decode steps, the first step weighted most, and its heat is
        scaled to its own maximum. Choose an item to see where it looked.
      </InfoTip>
      {data && data.items.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Answer items">
          <Button
            aria-pressed={!focus}
            onClick={() => onFocus(undefined)}
            size="xs"
            variant={focus ? 'outline' : 'secondary'}
          >
            Whole selection
          </Button>
          {data.items.map((item) => {
            const selected = focus?.index === item.index;
            return (
              <Button
                aria-pressed={selected}
                key={item.index}
                onClick={() =>
                  onFocus({
                    index: item.index,
                    span: {
                      text: item.text,
                      part_id: item.part_id,
                      field: item.field,
                      start: item.start,
                      end: item.end,
                      ...(selection.contentRevision
                        ? { content_revision: selection.contentRevision }
                        : {}),
                    },
                  })
                }
                size="xs"
                title={`${item.text} (decode steps ${item.decode_steps[0]} to ${item.decode_steps[item.decode_steps.length - 1]})`}
                variant={selected ? 'secondary' : 'outline'}
              >
                <span className="font-mono">{item.index + 1}</span>
                {truncate(item.text, ITEM_LABEL_CHARS)}
              </Button>
            );
          })}
        </div>
      ) : data ? (
        <span className="text-muted-foreground">One item</span>
      ) : items.data && !items.data.available ? (
        <span className="text-muted-foreground">{items.data.message}</span>
      ) : null}
      <Button
        className="ml-auto"
        disabled={!data || exporting}
        onClick={() => void download()}
        size="xs"
        variant="outline"
      >
        <DownloadIcon aria-hidden="true" />
        Download CSV
      </Button>
    </div>
  );
}
