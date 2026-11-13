import { AddIcon, CloseIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { concreteSchema, record, type NDPRecord } from './ndp-endpoint-data';
import { NDPQueryFields } from './ndp-query-fields';
import { ph, t } from '@lingui/core/macro';

/** Nested resource/metadata fields stay structured; users never have to write request JSON. */
export function NDPNestedFields({
  schema: original,
  value,
  onChange,
  prefix,
  depth = 0,
}: {
  schema: NDPRecord;
  value: unknown;
  onChange: (value: unknown) => void;
  prefix: string;
  depth?: number;
}) {
  const schema = concreteSchema(original);
  if (depth > 4)
    return (
      <p className="text-xs text-muted-foreground">
        {t`This deeply nested field is available in Advanced API tools.`}
      </p>
    );
  if (schema.type === 'array') {
    const items = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <NDPNestedFields
                schema={record(schema.items)}
                value={item}
                onChange={(next) =>
                  onChange(items.map((current, i) => (i === index ? next : current)))
                }
                prefix={`${prefix}-${index}`}
                depth={depth + 1}
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t`Remove item ${ph({ number: index + 1 })}`}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              <CloseIcon />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...items, concreteSchema(record(schema.items)).type === 'object' ? {} : ''])
          }
        >
          <AddIcon /> {t`Add item`}
        </Button>
      </div>
    );
  }
  if (schema.type === 'object') {
    const fields = record(schema.properties);
    if (!Object.keys(fields).length)
      return <NDPQueryFields title={t`Metadata`} onChange={onChange} />;
    const values = record(value);
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(fields)
          .filter(([name]) => !/password|secret|token|authorization/i.test(name))
          .map(([name, shape]) => (
            <div key={name} className="space-y-1">
              <Label htmlFor={`${prefix}-${name}`}>{String(record(shape).title ?? name)}</Label>
              <NDPNestedFields
                schema={{
                  ...record(shape),
                  required: Array.isArray(schema.required) && schema.required.includes(name),
                }}
                value={values[name]}
                onChange={(next) => onChange({ ...values, [name]: next })}
                prefix={`${prefix}-${name}`}
                depth={depth + 1}
              />
            </div>
          ))}
      </div>
    );
  }
  return (
    <Input
      id={prefix}
      required={schema.required === true}
      type={['integer', 'number'].includes(String(schema.type)) ? 'number' : 'text'}
      step={schema.type === 'number' ? 'any' : schema.type === 'integer' ? 1 : undefined}
      value={String(value ?? '')}
      onChange={(event) =>
        onChange(
          ['integer', 'number'].includes(String(schema.type))
            ? Number(event.target.value)
            : event.target.value,
        )
      }
    />
  );
}
