import { LogsIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PREVIEW_ROW_LIMIT } from '@/lib/runtime-limits';
import { parseCsvPreview } from './csv-preview';
import { FileDataGrid } from './file-data-grid';

/** Parses a bounded CSV sample and renders it in the dense file grid. */
export function ClioCsvView({ content, title }: { content: string; title: string }) {
  const preview = useMemo(() => parseCsvPreview(content), [content]);
  const fact = `${preview.rows.length.toLocaleString()}${preview.truncated ? '+' : ''} rows`;
  return (
    <FileDataGrid
      columns={preview.columns}
      fact={fact}
      label={title}
      rows={preview.rows}
      status={
        preview.truncated || preview.errors.length ? (
          <>
            {preview.truncated ? (
              <span className="min-w-0 truncate">
                Preview limited to the first {PREVIEW_ROW_LIMIT.toLocaleString()} rows.
              </span>
            ) : null}
            {preview.errors.length ? <CsvParseLog errors={preview.errors} /> : null}
          </>
        ) : undefined
      }
    />
  );
}

function CsvParseLog({ errors }: { errors: readonly string[] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="ml-auto flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          type="button"
        >
          <LogsIcon aria-hidden="true" className="size-3.5" />
          CSV parse log ({errors.length.toLocaleString()})
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] text-xs">
        <p className="font-medium">CSV parse log</p>
        <ol className="mt-2 grid max-h-28 gap-1 overflow-y-auto font-mono whitespace-pre-wrap">
          {errors.map((error, index) => (
            <li key={`${index}:${error}`}>{error}</li>
          ))}
        </ol>
        <p className="mt-2 text-muted-foreground">
          Generated locally while parsing the bounded browser preview. These diagnostics do not
          modify the source file or hide successfully parsed rows.
        </p>
      </PopoverContent>
    </Popover>
  );
}
