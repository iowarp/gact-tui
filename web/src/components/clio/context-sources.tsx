import type { ContextFile, ContextFrame, ToolInvocation, WorkspaceResource } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ContextDisclosure } from './context-disclosure';
import { getToolSummary } from './tool-presentation';
import { formatBytes } from '@/lib/format';

/** Inventory is available context; inclusion is shown only when the snapshot records it. */
export function ContextSources({
  files,
  frame,
  resources = [],
  tools = [],
  onOpenFile,
  onOpenResource,
}: {
  files: readonly ContextFile[];
  frame?: ContextFrame;
  resources?: readonly WorkspaceResource[];
  tools?: readonly ToolInvocation[];
  onOpenFile?: (path: string) => void;
  onOpenResource?: (resource: WorkspaceResource) => void;
}) {
  const [shown, setShown] = useState(6);
  const receipts = new Map<string, string>();
  for (const tool of tools) {
    const presentation = tool.presentation;
    const action = presentation?.blocks.find((block) => block.id === 'request-action');
    const summary = getToolSummary(tool)?.match(/^(\d[\d,]*) stream records captured$/)?.[1];
    for (const block of presentation?.blocks ?? []) {
      if (block.type === 'link' && block.target === 'resource' && block.uri) {
        receipts.set(
          block.uri.replace(/^resource:\/\//, ''),
          [
            action?.label,
            summary ? `${summary} ${summary === '1' ? 'record' : 'records'}` : undefined,
          ]
            .filter(Boolean)
            .join(' · '),
        );
      }
    }
  }
  const rows = [
    ...files.map((file) => ({
      id: file.path,
      label: file.display_path || file.path,
      detail: `${file.mode === 'edit' ? 'Editable' : file.mode === 'pin' ? 'Pinned' : 'Read only'} · ${frame?.items.some((item) => item.path === file.path && item.included) ? 'In last request' : 'Attached to agent'}`,
      open: onOpenFile ? () => onOpenFile(file.path) : undefined,
    })),
    ...resources
      .filter((resource) => !files.some((file) => file.path === resource.workspace_path))
      .map((resource) => ({
        id: resource.id,
        label: resource.name,
        detail: [
          receipts.get(resource.id),
          formatBytes(resource.received_size),
          resource.state !== 'ready'
            ? resource.state
            : frame?.items.some(
                  (item) =>
                    item.included &&
                    (item.source_id === resource.id ||
                      item.metadata.resource_id === resource.id ||
                      (resource.workspace_path && item.path === resource.workspace_path)),
                )
              ? 'Referenced in last request'
              : 'Available in workspace',
        ]
          .filter(Boolean)
          .join(' · '),
        open: onOpenResource ? () => onOpenResource(resource) : undefined,
      })),
  ];
  return (
    <ContextDisclosure label="Sources" count={rows.length}>
      <p className="mb-2 text-xs text-muted-foreground">
        Files available to this agent. Availability does not mean the full file is in the prompt.
      </p>
      {rows.length ? (
        <ul className="grid gap-1">
          {rows.slice(0, shown).map((row) => (
            <li key={row.id} className="min-w-0 py-1">
              {row.open ? (
                <button
                  onClick={row.open}
                  className="block w-full break-words text-left text-sm hover:underline"
                >
                  {row.label}
                </button>
              ) : (
                <p className="break-words text-sm">{row.label}</p>
              )}
              <p className="text-xs text-muted-foreground">{row.detail}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No sources attached.</p>
      )}
      {rows.length > shown ? (
        <Button size="sm" variant="ghost" className="mt-2 px-0" onClick={() => setShown(shown + 6)}>
          Show more sources ({rows.length - shown})
        </Button>
      ) : null}
    </ContextDisclosure>
  );
}
