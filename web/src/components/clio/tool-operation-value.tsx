import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { asRecord } from './tool-result-shared';
import { PresentationLink } from './presentation-link';

function FieldsDisclosure({ value, depth }: { value: unknown; depth: number }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm">All fields</summary>
      {open ? <ToolOperationValue value={value} depth={depth} /> : null}
    </details>
  );
}

/** Bounded literal data reader shared by provider, connection, search and unknown results. */
export function ToolOperationValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [page, setPage] = useState(0);
  const [all, setAll] = useState(false);
  const size = 12;
  if (value === undefined) return null;
  if (value === null || typeof value !== 'object') {
    const text = value === null ? 'null' : value === '' ? 'Empty text' : String(value);
    return (
      <div className="min-w-0">
        <p className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
          {all || text.length <= 1600 ? text : `${text.slice(0, 1600)}…`}
        </p>
        {text.length > 1600 ? (
          <Button
            variant="link"
            className="h-auto p-0"
            onClick={() => setAll(!all)}
            aria-expanded={all}
          >
            {all ? 'Show less' : 'Show more'}
          </Button>
        ) : null}
      </div>
    );
  }
  if (depth >= 2)
    return (
      <details onToggle={(event) => setAll(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm">
          {Array.isArray(value)
            ? `${value.length} ${value.length === 1 ? 'item' : 'items'}`
            : `${Object.keys(value).length} ${Object.keys(value).length === 1 ? 'field' : 'fields'}`}
        </summary>
        {all ? <ToolOperationValue value={value} /> : null}
      </details>
    );
  if (Array.isArray(value)) {
    const rows = value.slice(page * size, (page + 1) * size);
    const records = rows.map(asRecord);
    const keys = [...new Set(records.flatMap((row) => Object.keys(row ?? {})))].slice(0, 6);
    const hasExtraFields = records.some((row) =>
      Object.keys(row ?? {}).some((key) => !keys.includes(key)),
    );
    const tabular = records.every(Boolean) && keys.length > 0;
    return (
      <div className="min-w-0 space-y-2" data-slot="operation-data">
        {!value.length ? (
          <p className="text-sm text-muted-foreground">No matches</p>
        ) : tabular ? (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {keys.map((key) => (
                    <th className="border-b px-2 py-2 font-medium text-muted-foreground" key={key}>
                      {key.replaceAll('_', ' ')}
                    </th>
                  ))}
                  {hasExtraFields ? (
                    <th className="border-b px-2 py-2 font-medium text-muted-foreground">
                      Details
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {records.map((row, index) => (
                  <tr key={index}>
                    {keys.map((key) => (
                      <td
                        key={key}
                        className="max-w-80 border-b px-2 py-2 align-top [overflow-wrap:anywhere]"
                      >
                        <ToolOperationValue value={row?.[key]} depth={depth + 1} />
                      </td>
                    ))}
                    {hasExtraFields ? (
                      <td className="border-b px-2 py-2 align-top">
                        <FieldsDisclosure value={row} depth={depth + 1} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((item, index) => (
              <li className="py-2" key={index}>
                <ToolOperationValue value={item} depth={depth + 1} />
              </li>
            ))}
          </ul>
        )}
        {value.length > size ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="mr-auto">
              {page * size + 1}–{Math.min((page + 1) * size, value.length)} of {value.length}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={(page + 1) * size >= value.length}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </div>
    );
  }
  const row = asRecord(value)!;
  const url =
    typeof row.url === 'string' ? row.url : typeof row.uri === 'string' ? row.uri : undefined;
  const fields = Object.entries(row);
  const visible = all ? fields : fields.slice(0, 12);
  return (
    <div className="min-w-0 space-y-2">
      {url && /^https?:\/\//iu.test(url) ? (
        <PresentationLink
          block={{
            id: 'result-url',
            type: 'link',
            target: 'url',
            uri: url,
            label:
              typeof row.title === 'string'
                ? row.title
                : typeof row.name === 'string'
                  ? row.name
                  : url,
          }}
        />
      ) : null}
      <dl className="min-w-0 space-y-2">
        {visible
          .filter(([key]) => !url || !['url', 'uri'].includes(key))
          .map(([key, item]) => (
            <div
              className="grid min-w-0 gap-1 sm:grid-cols-[minmax(6rem,25%)_1fr] sm:gap-4"
              key={key}
            >
              <dt className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {key.replaceAll('_', ' ')}
              </dt>
              <dd className="min-w-0">
                <ToolOperationValue value={item} depth={depth + 1} />
              </dd>
            </div>
          ))}
      </dl>
      {fields.length > 12 ? (
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={() => setAll(!all)}
          aria-expanded={all}
        >
          {all ? 'Show less' : `Show all ${fields.length} fields`}
        </Button>
      ) : null}
    </div>
  );
}
