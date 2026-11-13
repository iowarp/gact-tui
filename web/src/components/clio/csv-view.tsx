import { LogsIcon } from 'lucide-react';
import { useContext, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PREVIEW_ROW_LIMIT } from '@/lib/runtime-limits';
import { parseCsvPreview } from './csv-preview';
import { FileDataGrid } from './file-data-grid';
import { FileWindowNoticeShown } from './file-window-context';
import { ph, plural, t } from '@lingui/core/macro';
import { formatNumber } from '@/lib/locale-format';

/** Parses a bounded CSV sample and renders it in the dense file grid. */
export function ClioCsvView({ content, title }: { content: string; title: string }) {
  const preview = useMemo(() => parseCsvPreview(content), [content]);
  const windowed = useContext(FileWindowNoticeShown);
  const fact = preview.truncated
    ? plural(preview.rows.length, { one: '#+ row', other: '#+ rows' })
    : plural(preview.rows.length, { one: '# row', other: '# rows' });
  const limited = preview.truncated && !windowed;
  return (
    <FileDataGrid
      columns={preview.columns}
      fact={fact}
      label={title}
      rows={preview.rows}
      status={
        limited || preview.errors.length ? (
          <>
            {limited ? (
              <span className="min-w-0 truncate">
                {t`Preview limited to the first ${ph({ rows: formatNumber(PREVIEW_ROW_LIMIT) })} rows.`}
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
          {t`CSV parse log (${ph({ count: formatNumber(errors.length) })})`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] text-xs">
        <p className="font-medium">{t`CSV parse log`}</p>
        <ol className="mt-2 grid max-h-28 gap-1 overflow-y-auto font-mono whitespace-pre-wrap">
          {errors.map((error, index) => (
            <li key={`${index}:${error}`}>{error}</li>
          ))}
        </ol>
        <p className="mt-2 text-muted-foreground">
          {t`Generated locally while parsing the bounded browser preview. These diagnostics do not modify the source file or hide successfully parsed rows.`}
        </p>
      </PopoverContent>
    </Popover>
  );
}
