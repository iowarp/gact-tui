import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { DocumentApplication } from '@/tauri/documents';
import { AssociatedApplicationIcon } from './associated-application-icon';

/** Shared named app choices and lookup states for every file viewer. */
export function AssociatedApplicationItems({
  applications,
  pending,
  error,
  disabled,
  onSelect,
  pdfCopy = false,
}: {
  applications: readonly DocumentApplication[];
  pending: boolean;
  error?: string;
  disabled: boolean;
  onSelect: (app: DocumentApplication) => void;
  pdfCopy?: boolean;
}) {
  if (pending || error || applications.length === 0)
    return (
      <DropdownMenuItem disabled title={error}>
        {pending
          ? 'Finding apps…'
          : error
            ? 'Could not read associated apps'
            : 'No associated apps'}
      </DropdownMenuItem>
    );
  return applications.map((app) => (
    <DropdownMenuItem
      key={app.id}
      aria-label={`${app.name}${app.is_default ? ' (default)' : ''}`}
      title={pdfCopy ? `Open a PDF copy in ${app.name}` : app.name}
      disabled={disabled}
      onSelect={() => onSelect(app)}
    >
      <AssociatedApplicationIcon application={app} />
      <span className="min-w-0 flex-1 truncate">{app.name}</span>
      {app.is_default ? (
        <span className="ml-auto text-xs text-muted-foreground">Default</span>
      ) : null}
    </DropdownMenuItem>
  ));
}
