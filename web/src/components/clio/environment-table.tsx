import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { environmentNameProblem, isEnvironmentComment } from '@/lib/environment-names';
import { AddIcon, RemoveIcon } from '@/lib/icon-vocabulary';

type Row = { name: string; value: string };

function toRows(text: string): Row[] {
  const rows = text
    .split('\n')
    .filter((line) => line.trim() && !isEnvironmentComment(line))
    .map((line) => {
      const separator = line.indexOf('=');
      return separator < 0
        ? { name: line.trim(), value: '' }
        : { name: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() };
    });
  return rows.length ? rows : [{ name: '', value: '' }];
}

function toText(rows: Row[]): string {
  return rows
    .filter((row) => row.name.trim() || row.value.trim())
    .map((row) => `${row.name.trim()}=${row.value}`)
    .join('\n');
}

/**
 * Environment variables for a service's process, as a Variable / Value table
 * (the way an operating system's environment editor shows them), or as raw
 * `NAME=value` lines for pasting. Both edit the same text.
 */
export function EnvironmentTable({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [raw, setRaw] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => toRows(value));
  const problems = (raw ? toRows(value) : rows).flatMap((row) => {
    const name = row.name.trim();
    const problem = name ? environmentNameProblem(name) : '';
    return problem ? [`"${name}" ${problem}.`] : [];
  });
  const update = (next: Row[]) => {
    setRows(next);
    onChange(toText(next));
  };
  return (
    <div className="grid gap-2">
      <label className="flex w-fit items-center gap-2 text-sm">
        <Checkbox
          checked={raw}
          onCheckedChange={(checked) => {
            const nextRaw = checked === true;
            if (!nextRaw) setRows(toRows(value));
            setRaw(nextRaw);
          }}
        />
        Raw input
      </label>
      {raw ? (
        <Textarea
          aria-label="Process settings"
          className="font-mono text-xs"
          id={id}
          onChange={(event) => onChange(event.target.value)}
          placeholder={'NAME=value\nSECOND_NAME=value'}
          rows={5}
          value={value}
        />
      ) : (
        <table className="w-full table-fixed border-separate border-spacing-y-1 text-sm">
          <colgroup>
            <col className="w-[38%]" />
            <col />
            <col className="w-9" />
          </colgroup>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="font-medium" scope="col">
                Variable
              </th>
              <th className="pl-2 font-medium" scope="col">
                Value
              </th>
              <th scope="col">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              // Rows have no identity of their own; their order is the identity.
              // eslint-disable-next-line react/no-array-index-key
              <tr key={index}>
                <td>
                  <Input
                    aria-invalid={Boolean(
                      row.name.trim() && environmentNameProblem(row.name.trim()),
                    )}
                    aria-label={`Variable ${index + 1}`}
                    className="font-mono text-xs"
                    id={index === 0 ? id : undefined}
                    onChange={(event) =>
                      update(
                        rows.map((r, i) => (i === index ? { ...r, name: event.target.value } : r)),
                      )
                    }
                    placeholder="NAME"
                    value={row.name}
                  />
                </td>
                <td className="pl-2">
                  <Input
                    aria-label={`Value ${index + 1}`}
                    className="font-mono text-xs"
                    onChange={(event) =>
                      update(
                        rows.map((r, i) => (i === index ? { ...r, value: event.target.value } : r)),
                      )
                    }
                    placeholder="value"
                    value={row.value}
                  />
                </td>
                <td className="text-right">
                  <Button
                    aria-label={`Remove variable ${index + 1}`}
                    onClick={() => {
                      const next = rows.filter((_, i) => i !== index);
                      update(next.length ? next : [{ name: '', value: '' }]);
                    }}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <RemoveIcon aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {problems.length ? (
        <ul className="grid gap-0.5 text-xs text-destructive" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {raw ? null : (
        <Button
          className="w-fit"
          onClick={() => setRows([...rows, { name: '', value: '' }])}
          size="sm"
          type="button"
          variant="outline"
        >
          <AddIcon aria-hidden="true" /> Add variable
        </Button>
      )}
    </div>
  );
}
