import { useState } from 'react';
import type { NDPEndpointOperation } from '@clio/core/v3';
import { Input } from '@/components/ui/input';
import { ndpSearchText } from './use-ndp-catalog';
import { t, plural } from '@lingui/core/macro';

/** Search action names immediately; selecting an action never submits a data query. */
export function NDPActionPicker({
  operations,
  value,
  onChange,
}: {
  operations: NDPEndpointOperation[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const words = ndpSearchText(query).split(/\s+/).filter(Boolean);
  const choices = operations.filter((row) =>
    words.every((word) =>
      ndpSearchText(`${row.summary} ${row.id} ${row.description}`).includes(word),
    ),
  );
  return (
    <div className="space-y-2">
      <Input
        aria-label={t`Search endpoint actions`}
        placeholder={t`Search API actions…`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div role="status" className="space-y-1 text-xs text-muted-foreground">
        <p>{plural(choices.length, { one: '# action', other: '# actions' })}</p>
        <p>{t`Search action names, then enter data filters below.`}</p>
      </div>
      <div
        role="group"
        aria-label={t`Available endpoint actions`}
        className="max-h-44 overflow-y-auto overscroll-contain divide-y divide-border/50"
      >
        {choices.map((row) => (
          <button
            key={row.id}
            type="button"
            aria-pressed={value === row.id}
            className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent aria-pressed:bg-accent"
            onClick={() => onChange(row.id)}
          >
            <span className="min-w-0 flex-1 break-words">{row.summary}</span>
            <span className="mt-0.5 shrink-0 font-mono text-[0.625rem] text-muted-foreground">
              {row.method}
            </span>
          </button>
        ))}
        {!choices.length ? (
          <p className="py-3 text-sm text-muted-foreground">
            {t`No matching actions. Try “station” or “stream”.`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
