/** Readable schema fields shared by the tool catalog and MCP inventories. */
export function SchemaSection({
  empty,
  schema,
  title,
}: {
  empty: string;
  schema: Record<string, unknown>;
  title: string;
}) {
  const properties = schemaProperties(schema);
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  return (
    <section className="grid gap-2">
      {title ? (
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          {schemaType(schema) ? (
            <code className="text-xs text-muted-foreground">{schemaType(schema)}</code>
          ) : null}
        </div>
      ) : null}
      {properties.length ? (
        <dl className="divide-y divide-border/50">
          {properties.map(([name, value]) => (
            <div
              className="grid items-start gap-2 py-3 sm:grid-cols-[minmax(10rem,0.4fr)_minmax(0,1fr)]"
              key={name}
            >
              <dt className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <code className="break-all text-sm font-medium text-foreground">{name}</code>
                {required.has(name) ? (
                  <span className="text-xs text-muted-foreground">required</span>
                ) : (
                  <span className="text-xs text-muted-foreground">optional</span>
                )}
              </dt>
              <dd className="min-w-0 text-sm leading-6">
                <code className="mr-2 text-xs text-muted-foreground">{schemaType(value)}</code>
                {schemaDescription(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : Object.keys(schema).length ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {schemaDescription(schema) ||
            `Declared as ${schemaType(schema) || 'a structured value'}.`}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

function schemaProperties(
  schema: Record<string, unknown>,
): Array<[string, Record<string, unknown>]> {
  const value = schema.properties;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([name, property]) => [
    name,
    property && typeof property === 'object' && !Array.isArray(property)
      ? (property as Record<string, unknown>)
      : {},
  ]);
}

function schemaType(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  if (typeof schema.type === 'string') {
    if (schema.type === 'array' && schema.items && typeof schema.items === 'object') {
      return `${schemaType(schema.items as Record<string, unknown>) || 'value'}[]`;
    }
    return schema.type;
  }
  if (Array.isArray(schema.enum)) return schema.enum.map(String).join(' | ');
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf
      .filter(
        (value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object',
      )
      .map(schemaType)
      .filter(Boolean)
      .join(' | ');
  }
  return '';
}

function schemaDescription(schema: Record<string, unknown>): string {
  const description = typeof schema.description === 'string' ? schema.description.trim() : '';
  const choices = Array.isArray(schema.enum)
    ? `Options: ${schema.enum.map(String).join(', ')}.`
    : '';
  const fallback = schema.default === undefined ? '' : `Default: ${String(schema.default)}.`;
  return [description, choices, fallback].filter(Boolean).join(' ');
}
