import { FileSpreadsheetIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
      {preview.errors.length ? (
        <Alert>
          <AlertTitle>Some rows need attention</AlertTitle>
          <AlertDescription>{preview.errors.join(' ')}</AlertDescription>
        </Alert>
      ) : null}
      <ClioDataTable columns={preview.columns} label="CSV preview" rows={preview.rows} />
    </div>
  );
}
