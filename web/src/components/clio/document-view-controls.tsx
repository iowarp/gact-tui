import { BookOpenIcon, FileCode2Icon, MessageSquareTextIcon, ShieldCheckIcon } from 'lucide-react';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { useContext, useMemo } from 'react';
import { FileViewerActionRegistry, useFileViewerActions } from './file-viewer-action-context';
import { FileModeControls } from './file-mode-controls';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToolbarAction } from './viewer-toolbar';

/** Documents contribute their capabilities to the same representation control as other files. */
export function DocumentViewControls({
  markdown,
  html = false,
  latex = false,
  reviewCount,
  value,
  onChange,
}: {
  markdown: boolean;
  html?: boolean;
  latex?: boolean;
  reviewCount: number;
  value: string;
  onChange: (view: string) => void;
}) {
  const views = [
    ...(!latex
      ? [{ value: 'preview', label: html ? 'HTML preview' : 'Read document', icon: BookOpenIcon }]
      : []),
    ...(markdown || html || latex ? [{ value: 'raw', label: 'Source', icon: FileCode2Icon }] : []),
  ];
  const registry = useContext(FileViewerActionRegistry);
  const secondary = useMemo(
    () => [
      {
        kind: 'view' as const,
        label: `Reviews${reviewCount ? `, ${reviewCount}` : ''}`,
        icon: MessageSquareTextIcon,
        selected: value === 'reviews',
        onSelect: () => onChange('reviews'),
      },
      {
        kind: 'view' as const,
        label: 'Document safety',
        icon: ShieldCheckIcon,
        selected: value === 'policy',
        onSelect: () => onChange('policy'),
      },
    ],
    [reviewCount, value, onChange],
  );
  useFileViewerActions(secondary);
  const OnlyIcon = views[0].icon;
  return (
    <>
      {views.length === 1 && value !== views[0].value ? (
        <ToolbarAction label={views[0].label} onClick={() => onChange(views[0].value)}>
          <OnlyIcon aria-hidden="true" />
        </ToolbarAction>
      ) : (
        <FileModeControls
          modes={views}
          value={value}
          onChange={onChange}
          label="File representations"
        />
      )}
      {!registry ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarAction label="Document actions">
              <MoreIcon aria-hidden="true" />
            </ToolbarAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {secondary.map(({ label, icon: Icon, selected, onSelect }) => (
              <DropdownMenuCheckboxItem key={label} checked={selected} onSelect={onSelect}>
                <Icon />
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
