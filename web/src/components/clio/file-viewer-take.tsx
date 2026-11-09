import {
  AtSignIcon,
  ClipboardCopyIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { copyText } from '@/lib/clipboard';
import { MoreIcon } from '@/lib/icon-vocabulary';
import {
  attempt,
  type AddToMessage,
  type CopyTake,
  type OpenTake,
  type TakeRow,
} from './file-viewer-take-hooks';
import { IconButton } from './primitives/icon-button';
import { MenuRow } from './primitives/menu-row';
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
            accelerator={row.accelerator}
          />
        </DropdownMenuItem>
      </Fragment>
    );
  });
}

export function FrameCopyButton({ take, className }: { take: CopyTake; className?: string }) {
  return (
    <SplitButton
      label={take.face.label}
      icon={<CopyIcon aria-hidden="true" />}
      onClick={take.face.run}
      menuLabel="Copy options"
      className={className}
    >
      <TakeMenuRows rows={take.rows} />
    </SplitButton>
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
  return (
    <SplitButton
      label="Copy contents"
      icon={<CopyIcon aria-hidden="true" />}
      onClick={copy}
      menuLabel="Copy options"
    >
      <TakeMenuRows
        rows={[
          {
            id: 'contents',
            label: 'Contents',
            icon: <FileTextIcon />,
            accelerator: 'C',
            onSelect: copy,
          },
        ]}
      />
    </SplitButton>
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

/** Copy and Open as submenus of the … menu once the frame is too narrow for their buttons. */
export function FoldedTakeRows({ copy, open }: { copy?: CopyTake; open?: OpenTake }) {
  return (
    <>
      {copy ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="[&>svg]:hidden">
            <MenuRow icon={<ClipboardCopyIcon />} label="Copy" submenu />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-56">
            <TakeMenuRows rows={copy.rows} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
      {open ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="[&>svg]:hidden">
            <MenuRow icon={<ExternalLinkIcon />} label="Open" submenu />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-56">
            <TakeMenuRows rows={open.rows} />
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
 * Copy ▾, Open ▾ and the … menu. As the frame narrows, Open, Copy and @ fold
 * into the … menu in that order; the comments and the … menu never leave.
 * Without menu rows of its own the … menu shows only while something is folded.
 */
export function FrameTalkTake({
  addToMessage,
  comments,
  copy,
  open,
  menu,
  menuLabel = 'More actions',
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
  pending?: boolean;
}) {
  const [fold, setFold] = useState({ talk: false, copy: false, open: false });
  const talkRef = useRef<HTMLSpanElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const openRef = useRef<HTMLSpanElement>(null);
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
      {open ? (
        <span ref={openRef} className="contents group-data-[fold-open]/frame:hidden">
          <FrameDownloadButton take={open} />
          <FrameOpenButton take={open} />
        </span>
      ) : null}
      <DropdownMenu
        onOpenChange={(next) => {
          if (next)
            setFold({
              talk: folded(talkRef.current),
              copy: folded(copyRef.current),
              open: folded(openRef.current),
            });
        }}
      >
        <span className={menu ? 'contents' : 'hidden group-data-[fold-open]/frame:contents'}>
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
        <DropdownMenuContent align="end" className="w-64">
          {fold.talk && addToMessage ? (
            <DropdownMenuItem
              disabled={Boolean(addToMessage.reason)}
              onSelect={addToMessage.onSelect}
            >
              <MenuRow
                icon={<AtSignIcon />}
                label="Add to message"
                description={addToMessage.reason}
                shortcut="add-to-message"
              />
            </DropdownMenuItem>
          ) : null}
          <FoldedTakeRows copy={fold.copy ? copy : undefined} open={fold.open ? open : undefined} />
          {anyFolded && menu ? <DropdownMenuSeparator /> : null}
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
