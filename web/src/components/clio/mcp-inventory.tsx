import { WrenchIcon } from 'lucide-react';
import { ClioInteractiveRow } from './interactive-row';
import { SchemaSection } from './tool-schema-section';
import { humanizeToolName } from './tool-presentation';

function inventoryTitle(row: Record<string, unknown>) {
  if (typeof row.title === 'string' && row.title) return row.title;
  if (typeof row.name === 'string' && row.name) return humanizeToolName(row.name);
  const value = row.uri ?? row.id;
  return typeof value === 'string' && value ? value : 'Untitled item';
}

function inventoryIdentifier(row: Record<string, unknown>) {
  return typeof row.name === 'string' && row.name !== inventoryTitle(row) ? row.name : '';
}

function inventoryDescription(row: Record<string, unknown>) {
  const value = row.description ?? row.mimeType ?? row.mime_type;
  return typeof value === 'string' ? value : '';
}

/** Inspect provider capabilities with one description and optional readable inputs. */
export function InventoryList({
  rows,
  fallback = [],
  empty,
  icon: Icon,
}: {
  rows?: Array<Record<string, unknown>>;
  fallback?: Array<Record<string, unknown>>;
  empty: string;
  icon: typeof WrenchIcon;
}) {
  const items = rows?.length ? rows : fallback;
  if (!items.length)
    return <p className="rounded-lg border p-5 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="grid max-h-[52vh] gap-2 overflow-y-auto">
      {items.map((row, index) => (
        <ClioInteractiveRow key={`${inventoryTitle(row)}:${index}`}>
          <div className="flex items-start gap-3">
            <Icon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium" title={inventoryIdentifier(row)}>
                {inventoryTitle(row)}
              </p>
              {inventoryDescription(row) ? (
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {inventoryDescription(row)}
                </p>
              ) : null}
              {row.inputSchema && typeof row.inputSchema === 'object' ? (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer">Inputs</summary>
                  <div className="mt-3">
                    <SchemaSection
                      title=""
                      schema={row.inputSchema as Record<string, unknown>}
                      empty="No inputs declared."
                    />
                  </div>
                </details>
              ) : null}
            </div>
          </div>
        </ClioInteractiveRow>
      ))}
    </div>
  );
}
