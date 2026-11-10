import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CircleAlertIcon, FileCode2Icon, ListTreeIcon, TriangleAlertIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { TooltipProvider } from '@/components/ui/tooltip';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { FileModeControls, type FileMode } from './file-mode-controls';
import { FileViewerFactsRegistry } from './file-viewer-facts';
import { plural, type LatexProblem, type LatexView } from './latex-model';
import { FrameBar, FrameCrumbs } from './primitives/frame-bar';
import { useFrameTool } from './primitives/frame-modes';
import { NamedTooltip } from './primitives/icon-button';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';
import { WorkbenchTabListToggle } from './workbench-tab-list';

/**
 * The paper's facts in the frame bar's What. Registered in place, so a later
 * build's time keeps its place ahead of the PDF's page; rendered before the
 * panes so it registers first.
 */
export function LatexFacts({ facts }: { facts: readonly string[] }) {
  const register = useContext(FileViewerFactsRegistry);
  const id = useId();
  const key = facts.join('\u0000');
  useEffect(() => () => register?.(id), [register, id]);
  useEffect(() => {
    register?.(id, key.split('\u0000').filter(Boolean));
  }, [register, id, key]);
  return null;
}

/**
 * The problems count after a warning (or error) mark, so it never reads by
 * colour alone; the list opens on click. Like the renderer's icons it leaves
 * the bar for a … menu row at the narrowest fold. Beside the workbench's list,
 * which shows the same problems, it leaves earlier, with the modes, so the
 * paper keeps its name.
 */
function ProblemsButton({
  problems,
  onClick,
  besideList = false,
}: {
  problems: readonly LatexProblem[];
  onClick: () => void;
  besideList?: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const errors = problems.filter((problem) => problem.severity === 'error').length;
  const Icon = errors ? CircleAlertIcon : TriangleAlertIcon;
  const label = `${plural(problems.length, 'problem')}${errors ? `, ${plural(errors, 'error')}` : ''}`;
  useFrameTool(
    button,
    problems.length
      ? {
          label,
          icon: (
            <Icon
              aria-hidden="true"
              className={errors ? 'text-destructive' : 'text-warning'}
            />
          ),
        }
      : null,
  );
  if (!problems.length) return null;
  return (
    <TooltipProvider delayDuration={200}>
      <NamedTooltip label={label}>
        <button
          aria-label={label}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-[11.5px] whitespace-nowrap text-foreground tabular-nums outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring',
            besideList && 'group-data-[fold-modes]/frame:hidden',
          )}
          data-frame-tool=""
          data-slot="latex-problems"
          onClick={onClick}
          ref={button}
          type="button"
        >
          <Icon
            aria-hidden="true"
            className={cn('size-3.5 shrink-0', errors ? 'text-destructive' : 'text-warning')}
          />
          {problems.length}
          {/* The spec draws the mark and its count; the word goes with the first fold. */}
          <span className="group-data-[fold-facts]/frame:hidden">
            {problems.length === 1 ? ' problem' : ' problems'}
          </span>
        </button>
      </NamedTooltip>
    </TooltipProvider>
  );
}

/** Which project file the source shows, for a paper made of several. */
function SourceFileMenu({
  files,
  file,
  problems,
  onFile,
}: {
  files: readonly string[];
  file: string;
  problems: readonly LatexProblem[];
  onFile: (file: string) => void;
}) {
  if (files.length < 2) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToolbarAction label={`Source file: ${file}`}>
          <FileCode2Icon aria-hidden="true" />
        </ToolbarAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={file} onValueChange={onFile}>
          {files.map((name) => {
            const count = problems.filter((problem) => problem.file === name).length;
            return (
              <DropdownMenuRadioItem key={name} value={name}>
                <span className="font-mono text-[12px]">{name}</span>
                {count ? (
                  <span className="ml-auto pl-3 text-[11.5px] text-muted-foreground">
                    {plural(count, 'problem')}
                  </span>
                ) : null}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The LaTeX tab's Format: Render / Source / Side by side, the source file,
 * Rebuild, the problems count, then the list's toggle. Inside the workbench the
 * problems count shows the list beside the tabs; elsewhere the list opens here.
 */
export function LatexFormat({
  modes,
  view,
  onView,
  files,
  file,
  onFile,
  building,
  onRebuild,
  problems,
  inWorkbench,
  onShowProblems,
  list,
}: {
  modes: readonly FileMode[];
  view: LatexView;
  onView: (view: LatexView) => void;
  files: readonly string[];
  file: string;
  onFile: (file: string) => void;
  building: boolean;
  /** Absent where the paper cannot be built (no conversation). */
  onRebuild?: () => void;
  problems: readonly LatexProblem[];
  inWorkbench: boolean;
  /** Shows the list's problems (beside the tabs, or here). */
  onShowProblems: () => void;
  /** The list, for a paper outside the workbench; opens over the frame. */
  list?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rebuild = onRebuild && (
    <ToolbarAction
      aria-busy={building || undefined}
      label="Rebuild"
      data-slot="latex-rebuild"
      onClick={onRebuild}
    >
      <RefreshIcon aria-hidden="true" className={building ? 'motion-safe:animate-spin' : ''} />
    </ToolbarAction>
  );
  const head = (
    <>
      <FileModeControls
        label="Paper views"
        modes={modes}
        value={view}
        onChange={(next) => onView(next as LatexView)}
      />
      {view === 'pdf' ? null : (
        <SourceFileMenu file={file} files={files} onFile={onFile} problems={problems} />
      )}
      {rebuild}
    </>
  );
  if (inWorkbench || !list)
    return (
      <>
        {head}
        <ProblemsButton besideList={inWorkbench} problems={problems} onClick={onShowProblems} />
        <WorkbenchTabListToggle />
      </>
    );
  return (
    <>
      {head}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <span className="inline-flex shrink-0 items-center gap-0.5">
            <ProblemsButton
              problems={problems}
              onClick={() => {
                onShowProblems();
                setOpen(true);
              }}
            />
            <ToolbarAction label="Outline" aria-expanded={open} onClick={() => setOpen(!open)}>
              <ListTreeIcon aria-hidden="true" />
            </ToolbarAction>
          </span>
        </PopoverAnchor>
        <PopoverContent
          align="end"
          className="max-h-[70dvh] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto p-0"
        >
          {list}
        </PopoverContent>
      </Popover>
    </>
  );
}

/**
 * Where the Format goes: into the enclosing frame bar's Format host, or, for a
 * paper shown on its own, into its own frame bar with its crumbs and fact.
 */
export function LatexFrame({
  ownFrame,
  crumbs,
  fact,
  factInFormat,
  format,
  onHost,
}: {
  ownFrame: boolean;
  crumbs: readonly string[];
  fact: string;
  /** No frame takes the fact (a document's own row): it leads the Format instead. */
  factInFormat: boolean;
  format: ReactNode;
  /** Its own frame's host, where the PDF's zoom and other renderer controls go. */
  onHost?: (host: HTMLDivElement | null) => void;
}) {
  if (ownFrame)
    return (
      <FrameBar
        label="Paper"
        where={<FrameCrumbs parts={crumbs.map((label) => ({ label }))} />}
        what={
          <span className="tabular-nums" data-frame-position="">
            {fact}
          </span>
        }
        format={
          <>
            {format}
            <div
              className="flex shrink-0 items-center gap-0.5 empty:hidden"
              data-slot="frame-format-host"
              ref={onHost}
            />
          </>
        }
      />
    );
  return (
    <ViewerToolbarContent>
      {factInFormat ? (
        <span className="shrink-0 px-1 text-[11px] text-muted-foreground tabular-nums">{fact}</span>
      ) : null}
      {format}
    </ViewerToolbarContent>
  );
}
