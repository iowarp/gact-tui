import {
  attentionDomainLabel,
  type AttentionItemsAvailable,
  type AttentionProfile,
  type AttentionPromptLine,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { DownloadIcon, Rows3Icon } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { visibleRows } from '@/lib/attention-prompt-rows';
import { attentionSelectionBody } from '@/lib/attention-selection-body';
import { truncate } from '@/lib/format';
import type { AgentAnswerTextSelection } from '@/lib/selection-actions';
import { downloadBlob } from './surface-export';
import { InfoTip } from './info-tip';

/** The answer-item delimiter `attn_analytics.py` reads (`NIL 373; DIVERGES` is two items). */
const DEFAULT_DELIMITER = ';';
const LINE_CHARS = 220;
const ITEM_LABEL_CHARS = 48;

/**
 * The SPOTTER prompt heat map (`render_heatmap.py`): the whole prompt the model
 * read, one line per row, with one column per answer item. Each column is
 * scaled to that item's own maximum on a 10-level ramp, so it shows where the
 * item looked, not how much attention it drew compared with another item.
 */
export function AttentionPromptMap({
  selection,
  profile,
}: {
  selection: AgentAnswerTextSelection;
  profile?: AttentionProfile;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs">
          <Rows3Icon aria-hidden="true" />
          Prompt heat map
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[90dvh] max-w-[calc(100%-2rem)] flex-col gap-3 sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Prompt heat map</DialogTitle>
          <DialogDescription>
            Every line of the prompt the model read, with one column per answer item.
          </DialogDescription>
        </DialogHeader>
        {open ? <PromptMapBody selection={selection} profile={profile} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PromptMapBody({
  selection,
  profile,
}: {
  selection: AgentAnswerTextSelection;
  profile?: AttentionProfile;
}) {
  const repository = useRepository();
  const [delimiter, setDelimiter] = useState(DEFAULT_DELIMITER);
  const [onlyHeated, setOnlyHeated] = useState(true);
  const [exporting, setExporting] = useState(false);
  const request = useMemo(
    () => ({
      items: [attentionSelectionBody(selection)],
      split: delimiter,
      ...(profile ? { profile } : {}),
    }),
    [delimiter, profile, selection],
  );
  const query = useQuery({
    queryKey: ['attention-items', selection.sessionId, selection.messageId, request],
    queryFn: ({ signal }) =>
      repository.getAttentionItems(selection.sessionId, selection.messageId, request, signal),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const download = async () => {
    setExporting(true);
    try {
      const result = await repository.exportAttentionItems(
        selection.sessionId,
        selection.messageId,
        request,
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
  const data = query.data?.available ? query.data : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-slot="attention-prompt-map">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <Label htmlFor="attention-item-delimiter" className="text-xs">
            Split items at
          </Label>
          <Input
            id="attention-item-delimiter"
            className="h-7 w-14 font-mono text-xs"
            maxLength={8}
            value={delimiter}
            onChange={(event) => setDelimiter(event.target.value)}
          />
          <InfoTip label="About answer items">
            Each item is scored on its own decode steps, the first step weighted most. Leave empty
            to treat the whole selection as one item.
          </InfoTip>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="attention-only-heated" checked={onlyHeated} onCheckedChange={setOnlyHeated} />
          <Label htmlFor="attention-only-heated" className="text-xs">
            Only lines with heat
          </Label>
        </div>
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
      {query.isPending ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" /> Reading the capture
        </div>
      ) : query.isError ? (
        <p className="text-xs text-muted-foreground">
          {query.error instanceof Error ? query.error.message : 'The service rejected it.'}
        </p>
      ) : query.data && !query.data.available ? (
        <p className="text-xs text-muted-foreground" data-slot="attention-items-unavailable">
          {query.data.message}
        </p>
      ) : data ? (
        <PromptMap data={data} onlyHeated={onlyHeated} />
      ) : null}
    </div>
  );
}

function PromptMap({ data, onlyHeated }: { data: AttentionItemsAvailable; onlyHeated: boolean }) {
  const ramp = data.ramp;
  const rows = useMemo(() => visibleRows(data.lines, onlyHeated), [data.lines, onlyHeated]);
  return (
    <>
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs" data-slot="attention-prompt-items">
        {data.items.map((item) => (
          <li className="inline-flex items-baseline gap-1.5" key={item.index} title={item.text}>
            <span className="font-mono font-medium">{item.index + 1}</span>
            <span>{truncate(item.text, ITEM_LABEL_CHARS)}</span>
            <span className="text-muted-foreground">
              steps {item.decode_steps[0]}–{item.decode_steps[item.decode_steps.length - 1]}
            </span>
          </li>
        ))}
        <li className="text-muted-foreground">
          Ramp <span className="font-mono">“{ramp}”</span>, levels 0–9, each column scaled to its
          own maximum
        </li>
      </ol>
      <div
        className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/20 font-mono text-[11px] leading-5"
        role="table"
        aria-label="Prompt heat map"
      >
        <div className="sticky top-0 z-10 flex border-b bg-background" role="row">
          <span className="sticky left-0 flex shrink-0 bg-background" role="columnheader">
            {data.items.map((item) => (
              <span
                className="inline-block w-4 text-center font-medium"
                key={item.index}
                title={item.text}
              >
                {item.index + 1}
              </span>
            ))}
          </span>
          <span className="px-2 font-sans text-muted-foreground" role="columnheader">
            Prompt line
          </span>
        </div>
        {rows.map((row) =>
          row.kind === 'gap' ? (
            <div className="px-2 text-muted-foreground" key={`gap-${row.from}`} role="row">
              <span role="cell">
                {row.count} {row.count === 1 ? 'line' : 'lines'} without heat
              </span>
            </div>
          ) : (
            <PromptLineRow
              domainChanged={row.domainChanged}
              key={row.line.index}
              line={row.line}
              ramp={ramp}
            />
          ),
        )}
      </div>
    </>
  );
}

function PromptLineRow({
  line,
  ramp,
  domainChanged,
}: {
  line: AttentionPromptLine;
  ramp: string;
  domainChanged: boolean;
}) {
  return (
    <>
      {domainChanged && line.domain ? (
        <div
          className="sticky left-0 border-t px-2 pt-1 font-sans text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          role="row"
        >
          <span role="cell">{attentionDomainLabel(line.domain)}</span>
        </div>
      ) : null}
      <div className="flex whitespace-pre" role="row">
        <span className="sticky left-0 flex shrink-0 bg-background/90" role="cell">
          {line.levels.map((level, item) => (
            <span
              className="inline-block w-4 text-center"
              key={item}
              style={heatStyle(level)}
              title={`Item ${item + 1}: level ${level} of 9 (score ${line.values[item]})`}
            >
              {ramp[level] ?? ' '}
            </span>
          ))}
        </span>
        <span className="px-2" role="cell">
          {truncate(line.text, LINE_CHARS)}
        </span>
      </div>
    </>
  );
}

/** The transcript heat's warm `--chart-5` hue, one step per ramp level. */
function heatStyle(level: number): CSSProperties | undefined {
  if (level <= 0) return undefined;
  return {
    backgroundColor: `color-mix(in oklch, var(--chart-5) ${Math.round((level / 9) * 72)}%, transparent)`,
  };
}
