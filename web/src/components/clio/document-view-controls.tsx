import { BookOpenIcon, FileCode2Icon, MessageSquareTextIcon, ShieldCheckIcon } from 'lucide-react';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToolbarAction } from './viewer-toolbar';

/** The same document views as direct tabs or a menu, selected by the actual pane width. */
export function DocumentViewControls({
  markdown,
  reviewCount,
  value,
  onChange,
}: {
  markdown: boolean;
  reviewCount: number;
  value: string;
  onChange: (view: string) => void;
}) {
  const views = [
    { value: 'preview', label: 'Read document', icon: BookOpenIcon },
    ...(markdown ? [{ value: 'raw', label: 'Read raw', icon: FileCode2Icon }] : []),
    {
      value: 'reviews',
      label: `Reviews${reviewCount ? `, ${reviewCount}` : ''}`,
      icon: MessageSquareTextIcon,
    },
    { value: 'policy', label: 'Document safety', icon: ShieldCheckIcon },
  ];
  return (
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
            <MoreIcon aria-hidden="true" />
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
  );
}
