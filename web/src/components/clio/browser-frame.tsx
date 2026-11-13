import {
  ArrowLeftIcon,
  ArrowRightIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FolderDownIcon,
  ImageIcon,
  LinkIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { copyText } from '@/lib/clipboard';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { openExternalUrl } from '@/tauri/external-url';
import { showDownloads } from './show-downloads';
import { FrameTalkTake, TakeMenuRows } from './file-viewer-take';
import { attempt, type OpenTake, type TakeRow } from './file-viewer-take-hooks';
import { FrameBar } from './primitives/frame-bar';
import { IconButton } from './primitives/icon-button';
import { downloadBytes } from './surface-export';
import { identifierInputProps } from '@/lib/identifier-input';
import { t } from '@lingui/core/macro';

export interface BrowserNavigation {
  back: () => void;
  forward: () => void;
  reload: () => void;
}

const NO_PAGE = t`Open a page first`;

async function pngOf(image: Blob): Promise<Blob> {
  if (image.type === 'image/png') return image;
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The screenshot did not draw.'))),
      'image/png',
    ),
  );
}

function screenshotName(url: string) {
  let host = 'page';
  try {
    host = new URL(url).hostname || host;
  } catch {
    // An address that does not parse keeps the plain name.
  }
  return `${host}-${new Date().toISOString().slice(0, 19).replace(/[:T]/gu, '-')}.png`;
}

/**
 * The page's address as the frame's Where: it reads as the path and edits as
 * the address field. Enter opens what was typed; Escape puts the page's back.
 */
function BrowserAddress({
  url,
  editable,
  autoFocus,
  invalid,
  describedBy,
  onGo,
}: {
  url: string;
  editable: boolean;
  autoFocus?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onGo: (address: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const address = (draft ?? url).trim();
    if (!address) return;
    onGo(address);
    if (url) {
      setDraft(null);
      input.current?.blur();
    }
  };
  return (
    <form className="flex min-w-0 flex-1" onSubmit={submit}>
      <input
        {...identifierInputProps}
        ref={input}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-label={t`Address`}
        autoComplete="off"
        autoFocus={autoFocus}
        className="h-6 w-full min-w-0 truncate rounded-[5px] border border-transparent bg-transparent px-1.5 font-mono text-meta text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground hover:border-border focus:border-ring focus:bg-background aria-invalid:border-destructive read-only:hover:border-transparent"
        inputMode="url"
        onBlur={() => {
          // A blank page keeps what was typed; a page shows its address again.
          if (url) setDraft(null);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => {
          if (!editable) return;
          setDraft((current) => current ?? url);
          event.currentTarget.select();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || draft === null) return;
          event.preventDefault();
          event.stopPropagation();
          setDraft(url ? null : '');
          if (url) event.currentTarget.blur();
        }}
        placeholder={t`Enter a URL`}
        readOnly={!editable}
        spellCheck={false}
        title={url || undefined}
        value={draft ?? url}
      />
    </form>
  );
}

/**
 * One browser page in the workbench's one frame row: Back, Forward and Reload
 * (the load shows in Reload's place), the address filling the row, then @,
 * Comments, Downloads, Open ▾ and the … menu (Copy and the screenshot). A
 * blank New page and an open page draw the same row, so the tab does not move
 * when the page opens.
 */
export function BrowserFrame({
  url,
  title,
  editable,
  autoFocus,
  loading,
  loadingLabel = t`Loading`,
  navigation,
  navigationReason = NO_PAGE,
  facts,
  comments,
  screenshot,
  invalid,
  describedBy,
  onGo,
  label,
  children,
}: {
  url: string;
  title?: string;
  editable: boolean;
  autoFocus?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  navigation?: BrowserNavigation;
  navigationReason?: string;
  facts?: ReactNode;
  comments: ReactNode;
  screenshot?: () => Blob | null;
  invalid?: boolean;
  describedBy?: string;
  onGo: (address: string) => void;
  label: string;
  children: ReactNode;
}) {
  const pageReason = url ? undefined : NO_PAGE;
  const shotReason = pageReason ?? (screenshot?.() ? undefined : t`The page has not drawn yet`);
  const shot = async () => {
    const image = screenshot?.();
    if (!image) throw new Error('The page has not drawn yet.');
    return pngOf(image);
  };
  const openOutside = () =>
    void attempt(async () => {
      if (!url) throw new Error('There is no page yet.');
      await openExternalUrl(url);
    });
  const downloadShot = () =>
    void attempt(async () => downloadBytes(await shot(), 'image/png', screenshotName(url)));
  const desktop = inTauri();
  const open: OpenTake = {
    face: {
      label: t`Open in your browser`,
      run: openOutside,
      icon: <ExternalLinkIcon aria-hidden="true" />,
    },
    busy: false,
    rows: [
      {
        id: 'browser',
        label: t`In your browser`,
        icon: <ExternalLinkIcon />,
        accelerator: 'B',
        reason: pageReason,
        onSelect: openOutside,
      },
      {
        id: 'screenshot-file',
        label: t`Save a screenshot`,
        icon: <DownloadIcon />,
        accelerator: 'S',
        reason: shotReason,
        onSelect: downloadShot,
      },
    ],
  };
  const menu: TakeRow[] = [
    {
      id: 'copy-url',
      label: t`Copy the address`,
      icon: <LinkIcon />,
      accelerator: 'U',
      reason: pageReason,
      onSelect: () => void attempt(() => copyText(url), t`Copied the address.`),
    },
    {
      id: 'copy-link',
      label: t`Copy a link with its title`,
      icon: <LinkIcon />,
      accelerator: 'L',
      reason: pageReason,
      onSelect: () =>
        void attempt(() => copyText(`[${title || url}](${url})`), t`Copied the link.`),
    },
    {
      id: 'copy-screenshot',
      label: t`Copy a screenshot`,
      icon: <ImageIcon />,
      accelerator: 'P',
      reason: shotReason,
      onSelect: () =>
        void attempt(
          async () => {
            const image = await shot();
            await navigator.clipboard.write([new ClipboardItem({ [image.type]: image })]);
          },
          t`Copied a screenshot of the page.`,
        ),
    },
  ];
  return (
    <div
      aria-label={t`Browser: ${label}`}
      className="flex h-full min-h-0 min-w-0 flex-col bg-background"
      data-slot="file-viewer"
      role="region"
    >
      <TooltipProvider delayDuration={200}>
        <FrameBar
          label={t`Browser`}
          className="[&>div:first-child]:gap-1"
          where={
            <>
              <IconButton
                label={t`Back`}
                icon={<ArrowLeftIcon aria-hidden="true" />}
                disabledReason={navigation ? undefined : navigationReason}
                className="[&_svg]:size-3.5"
                onClick={() => navigation?.back()}
              />
              <IconButton
                label={t`Forward`}
                icon={<ArrowRightIcon aria-hidden="true" />}
                disabledReason={navigation ? undefined : navigationReason}
                className="[&_svg]:size-3.5"
                onClick={() => navigation?.forward()}
              />
              {loading ? (
                <IconButton
                  label={loadingLabel}
                  icon={
                    <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
                  }
                  aria-busy
                  disabledReason={t`On its way`}
                  className="[&_svg]:size-3.5"
                  onClick={() => undefined}
                />
              ) : (
                <IconButton
                  label={t`Reload`}
                  icon={<RefreshIcon aria-hidden="true" />}
                  disabledReason={navigation ? undefined : navigationReason}
                  className="[&_svg]:size-3.5"
                  onClick={() => navigation?.reload()}
                />
              )}
              <BrowserAddress
                autoFocus={autoFocus}
                describedBy={describedBy}
                editable={editable}
                invalid={invalid}
                onGo={onGo}
                url={url}
              />
            </>
          }
          what={facts}
          actions={
            <FrameTalkTake
              addToMessage={{
                reason: t`Comment on the page to add it to a message`,
                onSelect: () => undefined,
              }}
              comments={
                <>
                  {comments}
                  <IconButton
                    label={t`Downloads`}
                    icon={<FolderDownIcon aria-hidden="true" />}
                    shortcut={desktop ? 'downloads' : undefined}
                    disabledReason={
                      desktop ? undefined : t`Your web browser lists its own downloads`
                    }
                    className="[&_svg]:size-3.5"
                    onClick={showDownloads}
                  />
                </>
              }
              open={open}
              menu={<TakeMenuRows rows={menu} />}
              menuLetters="ULP"
            />
          }
        />
      </TooltipProvider>
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
