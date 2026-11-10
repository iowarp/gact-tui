import {
  AtSignIcon,
  ClipboardCopyIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { Fragment, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
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

/** Open's rows without Download, which the frame shows as its own button. */
function otherOpenRows(rows: readonly TakeRow[]): TakeRow[] {
  const index = rows.findIndex((row) => row.id === 'download');
  if (index < 0) return [...rows];
  const rest = rows.filter((_, position) => position !== index);
  const next = rest[index];
  if (next && rows[index].separatorBefore) rest[index] = { ...next, separatorBefore: true };
  return rest;
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

/** The file's one download of its original bytes, beside Open ?. */
export function FrameDownloadButton({ take }: { take: OpenTake }) {
  const row = take.rows.find((candidate) => candidate.id === 'download');
  if (!row) return null;
  return (
    <IconButton
      label="Download"
      icon={<DownloadIcon aria-hidden="true" />}
      disabledReason={row.reason ?? (take.busy ? 'Working on it' : undefined)}
      className="[&_svg]:size-3.5"
      onClick={() => row.onSelect?.()}
    />
  );
}

/** Rows re-lettered so none reuses a letter the menu already gives another row. */
function relettered(rows: readonly TakeRow[], used: Set<string>): TakeRow[] {
  return rows.map((row) => {
    const preferred = row.accelerator?.toLocaleUpperCase();
    const accelerator =
      preferred && !used.has(preferred)
        ? preferred
        : assignJumpLetters([row.label], used)[0] || undefined;
    if (accelerator) used.add(accelerator);
    return { ...row, accelerator };
  });
}

/**
 * Copy and Open in the … menu once the frame is too narrow for their buttons:
 * submenus, or on a phone, where a submenu has no room beside the menu, the
 * rows themselves under a heading. `taken` holds the letters of the menu's other rows.
 */
export function FoldedTakeRows({
  copy,
  open,
  taken = '',
}: {
  copy?: CopyTake;
  open?: OpenTake;
  taken?: string;
}) {
  const inline = useMediaQuery('(max-width: 599px)');
  if (inline) {
    const used = new Set([...taken.toLocaleUpperCase()]);
    const copyRows = copy ? relettered(copy.rows, used) : [];
    const openRows = open ? relettered(otherOpenRows(open.rows), used) : [];
    return (
      <>
        {copy ? (
          <DropdownMenuGroup aria-label="Copy">
            <DropdownMenuLabel>Copy</DropdownMenuLabel>
            <TakeMenuRows rows={copyRows} />
          </DropdownMenuGroup>
        ) : null}
        {copy && open ? <DropdownMenuSeparator /> : null}
        {open ? (
          <DropdownMenuGroup aria-label="Open">
            <DropdownMenuLabel>Open</DropdownMenuLabel>
            <TakeMenuRows rows={openRows} />
          </DropdownMenuGroup>
        ) : null}
      </>
    );
  }
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
 * Copy ▾, Download, Open ▾ and the … menu. As the frame narrows, Open, Copy
 * and @ fold into the … menu in that order; Download, the comments and the …
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
          if (!next) return;
          const modes = foldedFrameModes(menuRef.current);
          const tools = foldedFrameTools(menuRef.current);
          setFold({
            talk: folded(talkRef.current),
            copy: folded(copyRef.current),
            open: folded(openRef.current),
            modes,
            tools,
            // Modes first, then tools, in menu order; @, Copy and Open keep their own.
            letters: assignJumpLetters(
              [
                ...modes.flatMap((group) => group.modes.map((mode) => mode.label)),
                ...tools.map((tool) => tool.label),
              ],
              `@CO${menuLetters}`,
            ),
          });
        }}
      >
        <span
          ref={menuRef}
          data-frame-modes-menu=""
          className={menu ? 'contents' : 'hidden group-data-[fold-open]/frame:contents'}
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
        <DropdownMenuContent align="end" className="w-64" onKeyDown={menuAcceleratorKeyDown}>
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
              data-accelerator="@"
              disabled={Boolean(addToMessage.reason)}
              onSelect={addToMessage.onSelect}
            >
              <MenuRow
                icon={<AtSignIcon />}
                label="Add to message"
                description={addToMessage.reason}
                wrapDescription
                accelerator="@"
                shortcut="add-to-message"
              />
            </DropdownMenuItem>
          ) : null}
          <FoldedTakeRows
            copy={fold.copy ? copy : undefined}
            open={fold.open ? open : undefined}
            taken={`@${fold.letters.join('')}${menuLetters}`}
          />
          {anyFolded && menu ? <DropdownMenuSeparator /> : null}
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
