import { useState } from 'react';
import { AddIcon, CloseIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { NDPRecord } from './ndp-endpoint-data';
import { ph, t } from '@lingui/core/macro';

/** Query pairs support service APIs without asking users to author JSON. */
export function NDPQueryFields({
  onChange,
  title,
}: {
  onChange: (value: NDPRecord) => void;
  /** A heading other than the default service filters, without the station hint. */
  title?: string;
}) {
  const [rows, setRows] = useState([{ key: '', value: '' }]);
  const update = (next: typeof rows) => {
    setRows(next);
    onChange(Object.fromEntries(next.filter((row) => row.key).map((row) => [row.key, row.value])));
  };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{title ?? t`Service filters`}</legend>
      {title === undefined ? (
        <p className="text-xs text-muted-foreground">
          {t`For a station service, use net for network, sta for station, and format=text.`}
        </p>
      ) : null}
      {rows.map((row, index) => (
        <div key={index} className="flex gap-2">
          <Input
            aria-label={t`Filter name ${ph({ number: index + 1 })}`}
            placeholder={t`Filter name`}
            value={row.key}
            onChange={(event) =>
              update(
                rows.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)),
              )
            }
          />
          <Input
            aria-label={t`Filter value ${ph({ number: index + 1 })}`}
            placeholder={t`Value`}
            value={row.value}
            onChange={(event) =>
              update(
                rows.map((item, i) =>
                  i === index ? { ...item, value: event.target.value } : item,
                ),
              )
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t`Remove filter ${ph({ number: index + 1 })}`}
            onClick={() => update(rows.filter((_, i) => i !== index))}
          >
            <CloseIcon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setRows([...rows, { key: '', value: '' }])}
      >
        <AddIcon /> {t`Add filter`}
      </Button>
    </fieldset>
  );
}
