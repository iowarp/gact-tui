import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BotIcon, CircleAlertIcon, CopyIcon, FileArchiveIcon, UploadIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useRepository } from '@/hooks/use-repository';
import { memoryErrorText } from './memory-document-helpers';
import { MemoryPicker, MemoryScopePicker, type MemoryScopeOptions } from './memory-scope-picker';
import { DialogFrame } from './primitives/dialog-frame';
import { SegmentedControl } from './primitives/segmented-control';
import { SettingsRow } from './settings-row';
import { t, ph, plural } from '@lingui/core/macro';

type ImportSource = 'archive' | 'assistant';

/** Import a CLIO memory export, or what another assistant knows about you. */
export function MemoryImportDialog({
  open,
  onOpenChange,
  onStarted,
  workspaces = [],
  ...scopeOptions
}: Partial<MemoryScopeOptions> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The assistant import started a background creation run. */
  onStarted?: () => void;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<ImportSource>('archive');
  // Under 1120 px the 36% dialog is too narrow for both labels; the other choice keeps its name on hover.
  const narrow = useMediaQuery('(max-width: 1119px)');
  const [file, setFile] = useState<File>();
  const [text, setText] = useState('');
  const [scope, setScope] = useState('user');
  const prompt = useQuery({
    queryKey: ['memory', 'assistant-prompt'],
    queryFn: ({ signal }) => repository.assistantImportPrompt(signal),
    enabled: open && source === 'assistant',
    staleTime: Infinity,
  });
  const close = (next: boolean) => {
    onOpenChange(next);
    if (next) return;
    setFile(undefined);
    setText('');
    archive.reset();
    assistant.reset();
  };
  const archive = useMutation({
    mutationFn: async (chosen: File) =>
      repository.importMemoryArchive(new Uint8Array(await chosen.arrayBuffer())),
    onSuccess: (report) => {
      void client.invalidateQueries({ queryKey: ['memory'] });
      toast.success(
        t`Imported: ${ph({ added: report.added })} added, ${ph({ updated: report.updated })} updated, ${ph({ skipped: report.skipped })} unchanged`,
      );
      close(false);
    },
  });
  const assistant = useMutation({
    mutationFn: () => repository.importFromAssistant(text, scope),
    onSuccess: (report) => {
      void client.invalidateQueries({ queryKey: ['memory'] });
      toast.success(
        report.candidates
          ? plural(report.candidates, {
              one: '# candidate fact found. Memory creation is running.',
              other: '# candidate facts found. Memory creation is running.',
            })
          : t`No facts found in the pasted text.`,
      );
      close(false);
      onStarted?.();
    },
  });
  const busy = archive.isPending || assistant.isPending;
  const error = source === 'archive' ? archive.error : assistant.error;
  const ready = source === 'archive' ? Boolean(file) : Boolean(text.trim());
  const confirm = () => {
    if (!ready || busy) return;
    if (source === 'archive' && file) archive.mutate(file);
    else assistant.mutate();
  };
  return (
    <DialogFrame
      confirm={{
        label: busy
          ? source === 'archive'
            ? t`Importing…`
            : t`Reading…`
          : source === 'archive'
            ? t`Import`
            : t`Import notes`,
        disabled: !ready || busy,
        onConfirm: confirm,
      }}
      icon={<UploadIcon />}
      onOpenChange={close}
      open={open}
      title={t`Import memory`}
    >
      <div className="grid">
        <SettingsRow title={t`From`}>
          <SegmentedControl
            iconOnly={narrow ? 'others' : false}
            label={t`Import from`}
            onValueChange={setSource}
            options={[
              {
                value: 'archive',
                label: t`Memory export`,
                icon: narrow ? <FileArchiveIcon /> : undefined,
              },
              {
                value: 'assistant',
                label: t`Another assistant`,
                icon: narrow ? <BotIcon /> : undefined,
              },
            ]}
            value={source}
          />
        </SettingsRow>
        {source === 'archive' ? (
          <SettingsRow
            htmlFor="memory-archive-choose"
            info={t`A .zip saved with Export. Facts merge by id, so importing the same export twice changes nothing.`}
            title={t`File`}
          >
            <div className="flex w-full min-w-0 items-center gap-2">
              <span
                // Wraps whole at narrow widths: a file name breaks anywhere, "No file" between words.
                className="flex min-h-[1.875rem] min-w-0 flex-1 items-center rounded-md border border-input bg-input/30 px-2.5 py-1 font-mono text-meta leading-snug text-foreground"
                title={file?.name}
              >
                {file ? (
                  <span className="min-w-0 [overflow-wrap:anywhere]">{file.name}</span>
                ) : (
                  <span className="min-w-0 break-words text-faint [word-break:auto-phrase] [line-break:strict]">
                    {t`No file`}
                  </span>
                )}
              </span>
              <Button
                className="shrink-0"
                data-initial-focus=""
                disabled={busy}
                id="memory-archive-choose"
                onClick={() => fileInput.current?.click()}
                size="sm"
                variant="outline"
              >
                {t`Choose…`}
              </Button>
              <input
                accept=".zip,application/zip"
                aria-label={t`Memory export (.zip)`}
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0])}
                ref={fileInput}
                tabIndex={-1}
                type="file"
              />
            </div>
          </SettingsRow>
        ) : (
          <SettingsRow
            info={t`Ask your other assistant this, then paste its answer below.`}
            title={t`Prompt`}
          >
            <Button
              className="w-fit"
              data-initial-focus=""
              disabled={!prompt.data}
              onClick={() => {
                if (!prompt.data) return;
                void navigator.clipboard
                  .writeText(prompt.data)
                  .then(() => toast.success(t`Prompt copied`));
              }}
              size="sm"
              variant="outline"
            >
              <CopyIcon aria-hidden="true" />
              {prompt.isPending ? t`Loading prompt…` : t`Copy the prompt`}
            </Button>
          </SettingsRow>
        )}
        <SettingsRow
          htmlFor="memory-import-scope"
          info={
            source === 'archive'
              ? t`An export keeps each memory where it was saved.`
              : t`Uses your background memory models and follows the review policy in Create memories.`
          }
          title={t`Remember in`}
        >
          {source === 'archive' ? (
            <MemoryPicker
              disabled
              id="memory-import-scope"
              label={t`Remember in`}
              onChange={() => undefined}
              options={[]}
              placeholder={t`As in the export`}
              searchPlaceholder={t`Search workspaces…`}
              value=""
            />
          ) : (
            <MemoryScopePicker
              disabled={busy}
              id="memory-import-scope"
              onChange={setScope}
              value={scope}
              workspaces={workspaces}
              {...scopeOptions}
            />
          )}
        </SettingsRow>
        {source === 'assistant' ? (
          <div className="grid gap-1.5 py-2">
            <label className="text-menu font-medium" htmlFor="memory-assistant-text">
              {t`Their answer`}
            </label>
            <Textarea
              className="max-h-48 min-h-24 text-ui"
              disabled={busy}
              id="memory-assistant-text"
              onChange={(event) => setText(event.target.value)}
              rows={5}
              value={text}
            />
          </div>
        ) : null}
        {error ? (
          <p
            className="flex min-w-0 items-center gap-1.5 pt-2 text-destructive"
            role="alert"
            title={memoryErrorText(error)}
          >
            <CircleAlertIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="truncate">{memoryErrorText(error)}</span>
          </p>
        ) : null}
      </div>
    </DialogFrame>
  );
}
