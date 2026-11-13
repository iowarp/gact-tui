import {
  AtSignIcon,
  ChevronLeftIcon,
  ClipboardCopyIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMediaQuery } from '@/hooks/use-media-query';
import { copyText } from '@/lib/clipboard';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { useShortcut } from '@/lib/shortcuts/hooks';
import {
  attempt,
  type AddToMessage,
  type CopyTake,
  type OpenTake,
  type TakeRow,
} from './file-viewer-take-hooks';
import { FileModeMenuItem } from './file-mode-controls';
import {
  foldedFrameModes,
  foldedFrameTools,
  type FrameModesEntry,
  type FrameToolEntry,
} from './primitives/frame-modes';
import { IconButton } from './primitives/icon-button';
import { MenuRow, assignJumpLetters, menuAcceleratorKeyDown } from './primitives/menu-row';
import { SplitButton } from './primitives/split-button';
import { ToolbarAction } from './viewer-toolbar';

/** The rows of a Take menu, each with its accelerator letter. */
export function TakeMenuRows({ rows }: { rows: readonly TakeRow[] }) {
  return rows.map((row) => {
    const separator = row.separatorBefore ? <DropdownMenuSeparator /> : null;
    if (row.submenu)
      return (
        <Fragment key={row.id}>
          {separator}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger data-accelerator={row.accelerator} className="[&>svg]:hidden">
              <MenuRow icon={row.icon} label={row.label} accelerator={row.accelerator} submenu />
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-56 max-w-72">
              {row.submenu}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </Fragment>
      );
    return (
      <Fragment key={row.id}>
        {separator}
        <DropdownMenuItem
          data-accelerator={row.accelerator}
          disabled={Boolean(row.reason)}
          onSelect={row.onSelect}
        >
          <MenuRow
            icon={row.icon}
            label={row.label}
            description={row.reason}
            wrapDescription
            accelerator={row.accelerator}
            shortcut={row.shortcut}
          />
        </DropdownMenuItem>
      </Fragment>
    );
  });
}

/** The frame's Ctrl+C: with nothing selected, focus in the frame copies what the Copy face copies. */
function useFrameCopyKey(run: () => void) {
  const anchor = useRef<HTMLSpanElement>(null);
  const region = useMemo<RefObject<Element | null>>(
    () => ({
      get current() {
        return anchor.current?.closest('[data-slot="frame-bar"]')?.parentElement ?? null;
      },
    }),
    [],
  );
  useShortcut('copy', run, {
    region,
    when: () => {
      const selection = window.getSelection();
      return !selection || selection.isCollapsed || !selection.toString();
    },
  });
  return <span ref={anchor} hidden />;
}

export function FrameCopyButton({ take, className }: { take: CopyTake; className?: string }) {
  const anchor = useFrameCopyKey(take.face.run);
  return (
    <>
      {anchor}
      <SplitButton
        label={take.face.label}
        icon={<CopyIcon aria-hidden="true" />}
        onClick={take.face.run}
        menuLabel="Copy options"
        shortcut="copy"
        className={className}
      >
        <TakeMenuRows rows={take.rows} />
      </SplitButton>
    </>
  );
}

/** Copy ▾ for text shown without a file's custody: the face and its one row copy the text. */
export function FrameContentsCopyButton({
  read,
}: {
  read: () => string | undefined | Promise<string | undefined>;
}) {
  const copy = () =>
    void attempt(async () => {
      const text = await read();
      if (text === undefined) throw new Error('The text is not available yet.');
      await copyText(text);
    }, 'Copied the contents.');
  const anchor = useFrameCopyKey(copy);
  return (
    <>
      {anchor}
      <SplitButton
        label="Copy contents"
        icon={<CopyIcon aria-hidden="true" />}
        onClick={copy}
        menuLabel="Copy options"
        shortcut="copy"
      >
        <TakeMenuRows
          rows={[
            {
              id: 'contents',
              label: 'Contents',
              icon: <FileTextIcon />,
              accelerator: 'C',
              shortcut: 'copy',
              onSelect: copy,
            },
          ]}
        />
      </SplitButton>
    </>
  );
}

/**
 * Open's rows without Download and the Export to… rows, which are the variants of the
 * frame's own Download ▾.
 */
function otherOpenRows(rows: readonly TakeRow[]): TakeRow[] {
  const index = rows.findIndex((row) => row.id === 'download');
  if (index < 0) return rows.filter((row) => !isExportRow(row));
  const rest = rows.filter((_, position) => position !== index);
  const next = rest[index];
  if (next && rows[index].separatorBefore) rest[index] = { ...next, separatorBefore: true };
  return rest.filter((row) => !isExportRow(row));
}

function isExportRow(row: TakeRow) {
  return row.id.startsWith('export:');
}

/** Open ?: the face opens the file; the menu holds the other places and Export to?. */
export function FrameOpenButton({ take, className }: { take: OpenTake; className?: string }) {
  return (
    <SplitButton
      label={take.face.label}
      icon={take.face.icon}
      onClick={take.face.run}
      menuLabel="Open options"
      menuKey
      disabled={take.busy}
      className={className}
    >
      <TakeMenuRows rows={otherOpenRows(take.rows)} />
    </SplitButton>
  );
}

/**
 * The file's one download of its original bytes, beside Open ▾. A renderer that declares
 * other formats makes it Download ▾: the face still downloads the original, and the
 * chevron adds Export to PDF and the like.
 */
export function FrameDownloadButton({ take }: { take: OpenTake }) {
  const row = take.rows.find((candidate) => candidate.id === 'download');
  if (!row) return null;
  const exports = take.rows.filter(isExportRow);
  const reason = row.reason ?? (take.busy ? 'Working on it' : undefined);
  if (exports.length)
    return (
      <SplitButton
        label="Download"
        icon={<DownloadIcon aria-hidden="true" className="size-3.5" />}
        onClick={() => row.onSelect?.()}
        menuLabel="Download options"
        disabled={Boolean(reason)}
        menuDisabled={take.busy}
        faceProps={{ title: row.reason }}
      >
        <TakeMenuRows
          rows={[
            // Its own letter, underlined like Export's, not the download row's D.
            { ...row, label: 'Original', accelerator: 'O', separatorBefore: false },
            ...exports.map((entry, index) => ({
              ...entry,
              accelerator: entry.accelerator ?? (index === 0 ? 'E' : undefined),
              separatorBefore: index === 0,
            })),
          ]}
        />
      </SplitButton>
    );
  return (
    <IconButton
      label="Download"
      icon={<DownloadIcon aria-hidden="true" />}
      disabledReason={reason}
      className="[&_svg]:size-3.5"
      onClick={() => row.onSelect?.()}
    />
  );
}

type FoldedTake = 'copy' | 'open';

/** A folded Take's row on a phone: it shows that Take's rows in place of the menu's. */
function DrillRow({
  icon,
  label,
  accelerator,
  take,
  onDrill,
}: {
  icon: ReactNode;
  label: string;
  accelerator: string;
  take: FoldedTake;
  onDrill: () => void;
}) {
  return (
    <DropdownMenuItem
      data-accelerator={accelerator}
      data-drill={take}
      aria-haspopup="menu"
      onSelect={(event) => {
        event.preventDefault();
        onDrill();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowRight') return;
        event.preventDefault();
        onDrill();
      }}
    >
      <MenuRow icon={icon} label={label} accelerator={accelerator} submenu />
    </DropdownMenuItem>
  );
}

/**
 * A folded Take's rows, drilled into on a phone: Back, then the rows the
 * submenu holds at wider widths, under its name.
 */
function DrilledTakeRows({
  take,
  copy,
  open,
  onBack,
}: {
  take: FoldedTake;
  copy?: CopyTake;
  open?: OpenTake;
  onBack: () => void;
}) {
  const label = take === 'copy' ? 'Copy' : 'Open';
  const rows = take === 'copy' ? (copy?.rows ?? []) : otherOpenRows(open?.rows ?? []);
  return (
    <>
      <DropdownMenuItem
        onSelect={(event) => {
          event.preventDefault();
          onBack();
        }}
      >
        <MenuRow icon={<ChevronLeftIcon />} label="Back" />
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuGroup aria-label={label}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <TakeMenuRows rows={rows} />
      </DropdownMenuGroup>
    </>
  );
}

/**
 * Copy and Open in the … menu once the frame is too narrow for their buttons,
 * as rows that open their submenu. On a phone a submenu has no room beside the
 * menu, so the row drills in instead (`onDrill`): the menu shows that submenu's
 * rows, with Back.
 */
export function FoldedTakeRows({
  copy,
  open,
  onDrill,
}: {
  copy?: CopyTake;
  open?: OpenTake;
  onDrill?: (take: FoldedTake) => void;
}) {
  if (onDrill)
    return (
      <>
        {copy ? (
          <DrillRow
            icon={<ClipboardCopyIcon />}
            label="Copy"
            accelerator="C"
            take="copy"
            onDrill={() => onDrill('copy')}
          />
        ) : null}
        {open ? (
          <DrillRow
            icon={<ExternalLinkIcon />}
            label="Open"
            accelerator="O"
            take="open"
            onDrill={() => onDrill('open')}
          />
        ) : null}
      </>
    );
  return (
    <>
      {copy ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-accelerator="C" className="[&>svg]:hidden">
            <MenuRow icon={<ClipboardCopyIcon />} label="Copy" accelerator="C" submenu />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-56" onKeyDown={menuAcceleratorKeyDown}>
            <TakeMenuRows rows={copy.rows} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
      {open ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-accelerator="O" className="[&>svg]:hidden">
            <MenuRow icon={<ExternalLinkIcon />} label="Open" accelerator="O" submenu />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-56" onKeyDown={menuAcceleratorKeyDown}>
            <TakeMenuRows rows={otherOpenRows(open.rows)} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
    </>
  );
}

/** Whether the frame bar has folded a control away. */
function folded(element: HTMLElement | null) {
  return element !== null && getComputedStyle(element).display === 'none';
}

/**
 * Talk and Take, the end of every frame bar: @ Add to message, Comments,
 * Copy ▾, Download, Open ▾ and the … menu. As the frame narrows, the
 * renderer's Format icons, then Open, Copy and @ fold into the … menu in that order; Download, the comments and the …
 * menu never leave, so the original bytes are always one click away.
 * Without menu rows of its own the … menu shows only while something is folded.
 */
export function FrameTalkTake({
  addToMessage,
  comments,
  copy,
  open,
  menu,
  menuLabel = 'More actions',
  menuLetters = '',
  pending = false,
}: {
  addToMessage?: AddToMessage;
  /** The frame's Comments icon (or its place). */
  comments?: ReactNode;
  copy?: CopyTake;
  open?: OpenTake;
  /** Rows the … menu always holds, after any folded ones. */
  menu?: ReactNode;
  menuLabel?: string;
  /** The jump letters `menu`'s rows use, kept off the folded modes and tools. */
  menuLetters?: string;
  pending?: boolean;
}) {
  const [fold, setFold] = useState<{
    talk: boolean;
    copy: boolean;
    open: boolean;
    modes: FrameModesEntry[];
    tools: FrameToolEntry[];
    letters: string[];
  }>({ talk: false, copy: false, open: false, modes: [], tools: [], letters: [] });
  const talkRef = useRef<HTMLSpanElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const openRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const phone = useMediaQuery('(max-width: 599px)');
  const [drill, setDrill] = useState<FoldedTake | null>(null);
  const [moves, setMoves] = useState(0);
  const drilledFrom = useRef<FoldedTake | null>(null);
  const drillTo = (take: FoldedTake | null) => {
    if (take) drilledFrom.current = take;
    setDrill(take);
    setMoves((count) => count + 1);
  };
  // The drilled rows replace the focused one: focus their first. Back returns
  // focus to the row that was drilled into.
  useLayoutEffect(() => {
    if (!moves) return;
    const content = contentRef.current;
    const from = drill ? null : drilledFrom.current;
    const row =
      (from ? content?.querySelector<HTMLElement>(`[data-drill="${from}"]`) : null) ??
      content?.querySelector<HTMLElement>('[role^="menuitem"]:not([data-disabled])');
    row?.focus();
  }, [drill, moves]);
  const busy = pending || Boolean(open?.busy);
  const anyFolded = fold.talk || fold.copy || fold.open;
  return (
    <>
      {addToMessage ? (
        <span ref={talkRef} className="contents group-data-[fold-talk]/frame:hidden">
          <IconButton
            label="Add to message"
            icon={<AtSignIcon aria-hidden="true" />}
            shortcut="add-to-message"
            disabledReason={addToMessage.reason}
            className="[&_svg]:size-3.5"
            onClick={addToMessage.onSelect}
          />
        </span>
      ) : null}
      {comments}
      {copy ? (
        <span ref={copyRef} className="contents group-data-[fold-copy]/frame:hidden">
          <FrameCopyButton take={copy} />
        </span>
      ) : null}
      {open ? <FrameDownloadButton take={open} /> : null}
      {open ? (
        <span ref={openRef} className="contents group-data-[fold-open]/frame:hidden">
          <FrameOpenButton take={open} />
        </span>
      ) : null}
      <DropdownMenu
        onOpenChange={(next) => {
          setDrill(null);
          if (!next) return;
          const modes = foldedFrameModes(menuRef.current);
          const tools = foldedFrameTools(menuRef.current);
          setFold({
            talk: folded(talkRef.current),
            copy: folded(copyRef.current),
            open: folded(openRef.current),
            modes,
            tools,
            // Modes first, then tools, in menu order; Add to message, Copy and Open keep their own.
            letters: assignJumpLetters(
              [
                ...modes.flatMap((group) => group.modes.map((mode) => mode.label)),
                ...tools.map((tool) => tool.label),
              ],
              `ACO${menuLetters}`,
            ),
          });
        }}
      >
        <span
          ref={menuRef}
          data-frame-modes-menu=""
          className={
            menu
              ? 'contents'
              : // Shown once something has folded into it: the Format icons, else Open.
                'hidden group-data-[fold-open]/frame:contents [[data-fold-tools]:has([data-slot=frame-format-host]:not(.hidden)_[data-frame-tool])_&]:contents'
          }
        >
          <DropdownMenuTrigger asChild>
            <ToolbarAction label={menuLabel} aria-busy={busy}>
              {busy ? (
                <LoaderCircleIcon
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <MoreIcon aria-hidden="true" />
              )}
            </ToolbarAction>
          </DropdownMenuTrigger>
        </span>
        <DropdownMenuContent
          ref={contentRef}
          align="end"
          className="w-64"
          onKeyDown={(event) => {
            if (drill && event.key === 'ArrowLeft') {
              event.preventDefault();
              drillTo(null);
              return;
            }
            menuAcceleratorKeyDown(event);
          }}
        >
          {drill ? (
            <DrilledTakeRows take={drill} copy={copy} open={open} onBack={() => drillTo(null)} />
          ) : (
            <>
          {fold.modes.map((group, index) => (
            <Fragment key={`${index}:${group.label}`}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuRadioGroup
                aria-label={group.label}
                value={group.value}
                onValueChange={group.onChange}
              >
                {group.modes.map((mode, modeIndex) => (
                  <FileModeMenuItem
                    key={mode.value}
                    mode={mode}
                    accelerator={
                      fold.letters[
                        fold.modes
                          .slice(0, index)
                          .reduce((count, earlier) => count + earlier.modes.length, modeIndex)
                      ]
                    }
                  />
                ))}
              </DropdownMenuRadioGroup>
            </Fragment>
          ))}
          {fold.tools.length > 0 ? (
            <>
              {fold.modes.length > 0 ? <DropdownMenuSeparator /> : null}
              {fold.tools.map((tool, index) => {
                const letter =
                  fold.letters[
                    fold.modes.reduce((count, group) => count + group.modes.length, index)
                  ] || undefined;
                const row = (
                  <MenuRow
                    icon={tool.icon}
                    label={tool.label}
                    description={tool.reason}
                    wrapDescription
                    accelerator={letter}
                  />
                );
                // A pressed toggle in the bar (Explorer) stays a checked toggle here.
                return tool.checked === undefined ? (
                  <DropdownMenuItem
                    key={`${index}:${tool.label}`}
                    data-accelerator={letter}
                    disabled={tool.disabled}
                    onSelect={() => tool.button.click()}
                  >
                    {row}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuCheckboxItem
                    key={`${index}:${tool.label}`}
                    data-accelerator={letter}
                    checked={tool.checked}
                    disabled={tool.disabled}
                    onSelect={() => tool.button.click()}
                  >
                    {row}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </>
          ) : null}
          {fold.modes.length + fold.tools.length > 0 && (anyFolded || menu) ? (
            <DropdownMenuSeparator />
          ) : null}
          {fold.talk && addToMessage ? (
            <DropdownMenuItem
              data-accelerator="A"
              disabled={Boolean(addToMessage.reason)}
              onSelect={addToMessage.onSelect}
            >
              <MenuRow
                icon={<AtSignIcon />}
                label="Add to message"
                description={addToMessage.reason}
                wrapDescription
                accelerator="A"
                shortcut="add-to-message"
              />
            </DropdownMenuItem>
          ) : null}
          <FoldedTakeRows
            copy={fold.copy ? copy : undefined}
            open={fold.open ? open : undefined}
            onDrill={phone ? drillTo : undefined}
          />
          {anyFolded && menu ? <DropdownMenuSeparator /> : null}
          {menu}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
