import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { DocumentApplication } from '@/tauri/documents';
import { AssociatedApplicationIcon } from './associated-application-icon';
import { t, ph } from '@lingui/core/macro';

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
          ? t`Finding apps…`
          : error
            ? t`Could not read associated apps`
            : t`No associated apps`}
      </DropdownMenuItem>
    );
  return applications.map((app) => (
    <DropdownMenuItem
      key={app.id}
      aria-label={`${app.name}${app.is_default ? ' (default)' : ''}`}
      title={pdfCopy ? t`Open a PDF copy in ${ph({ name: app.name })}` : app.name}
      disabled={disabled}
      onSelect={() => onSelect(app)}
    >
      <AssociatedApplicationIcon application={app} />
      <span className="min-w-0 flex-1 truncate">{app.name}</span>
      {app.is_default ? (
        <span className="ml-auto text-xs text-muted-foreground">{t`Default`}</span>
      ) : null}
    </DropdownMenuItem>
  ));
}
