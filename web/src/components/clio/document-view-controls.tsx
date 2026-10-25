import { BookOpenIcon, FileCode2Icon, MessageSquareTextIcon, ShieldCheckIcon } from 'lucide-react';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { useContext, useMemo } from 'react';
import { FileViewerActionRegistry, useFileViewerActions } from './file-viewer-action-context';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToolbarAction } from './viewer-toolbar';

/** The same document views as direct tabs or a menu, selected by the actual pane width. */
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
    { value: 'preview', label: html ? 'HTML preview' : 'Read document', icon: BookOpenIcon },
    ...(markdown || html || latex
      ? [
          {
            value: 'raw',
            label: html ? 'HTML source' : latex ? 'LaTeX source' : 'Read raw',
            icon: FileCode2Icon,
          },
        ]
      : []),
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
  const ActiveIcon = views.find((view) => view.value === value)?.icon ?? BookOpenIcon;
  return (
    <>
      {views.length === 1 ? (
        value !== 'preview' ? (
          <ToolbarAction label={views[0].label} onClick={() => onChange('preview')}>
            <BookOpenIcon aria-hidden="true" />
          </ToolbarAction>
        ) : null
      ) : (
        <>
          <TooltipProvider delayDuration={200}>
            <TabsList
              aria-label="Document details"
              className="h-7 shrink-0 gap-0.5 bg-transparent p-0 @max-[480px]/viewer:hidden"
            >
              {views.map(({ value, label, icon: Icon }) => (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>
                    <TabsTrigger aria-label={label} className="size-7 flex-none p-0" value={value}>
                      <Icon aria-hidden="true" />
                      <span className="sr-only">{label}</span>
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{label}</TooltipContent>
                </Tooltip>
              ))}
            </TabsList>
          </TooltipProvider>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ToolbarAction label="Document views" className="@min-[480px]/viewer:hidden">
                <ActiveIcon aria-hidden="true" />
              </ToolbarAction>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
                {views.map(({ value: view, label, icon: Icon }) => (
                  <DropdownMenuRadioItem key={view} value={view}>
                    <Icon aria-hidden="true" />
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
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
