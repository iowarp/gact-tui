import { LogsIcon } from 'lucide-react';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { useMemo } from 'react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PREVIEW_ROW_LIMIT } from '@/lib/runtime-limits';
import { parseCsvPreview } from './csv-preview';
import { ClioDataTable } from './data-table';

/** Parses a bounded CSV sample and renders it with the shared ReUI data grid. */
export function ClioCsvView({ content, title }: { content: string; title: string }) {
  const preview = useMemo(() => parseCsvPreview(content), [content]);
  return (
    <div className="grid gap-3">
      <ClioDataTable
        columns={preview.columns}
        label={title}
        rows={preview.rows}
        showLabel={false}
        showToolbar={false}
      />
      {preview.truncated ? (
        <p className="text-xs text-muted-foreground" role="status">
          Preview limited to the first {PREVIEW_ROW_LIMIT.toLocaleString()} rows.
        </p>
      ) : null}
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
