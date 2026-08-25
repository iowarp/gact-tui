import { FileSpreadsheetIcon, InfoIcon, LogsIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { csvPreviewRowLimit, parseCsvPreview } from './csv-preview';
import { ClioDataTable } from './data-table';

/** Parses a bounded CSV sample and renders it with the shared ReUI data grid. */
export function ClioCsvView({ content, title }: { content: string; title: string }) {
  const preview = useMemo(() => parseCsvPreview(content), [content]);
  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-3 py-2">
        <FileSpreadsheetIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {preview.truncated
              ? `Showing the first ${csvPreviewRowLimit.toLocaleString()} parsed rows.`
              : `${preview.rows.length.toLocaleString()} parsed rows.`}
          </p>
        </div>
      </div>
      <ClioDataTable columns={preview.columns} label="CSV preview" rows={preview.rows} />
      {preview.errors.length ? <CsvParseLog errors={preview.errors} /> : null}
    </div>
  );
}

function CsvParseLog({ errors }: { errors: readonly string[] }) {
  return (
    <Alert role="status">
      <LogsIcon aria-hidden="true" />
      <AlertTitle>CSV parse log</AlertTitle>
      <AlertDescription>
        <ol className="mt-1 grid max-h-28 gap-1 overflow-y-auto font-mono text-xs whitespace-pre-wrap">
          {errors.map((error, index) => (
            <li key={`${index}:${error}`}>{error}</li>
          ))}
        </ol>
      </AlertDescription>
      <AlertAction>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button aria-label="About CSV parse diagnostics" size="icon-xs" variant="ghost">
              <InfoIcon aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-72" side="left">
            Generated locally while parsing the bounded browser preview. These diagnostics do not
            modify the source file or hide successfully parsed rows.
          </TooltipContent>
        </Tooltip>
      </AlertAction>
    </Alert>
  );
}
