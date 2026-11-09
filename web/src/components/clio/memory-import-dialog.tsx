import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlertIcon, CopyIcon, UploadIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { memoryErrorText } from './memory-document-helpers';
import { MemoryPicker, MemoryScopePicker, type MemoryScopeOptions } from './memory-scope-picker';
import { DialogFrame } from './primitives/dialog-frame';
import { SegmentedControl } from './primitives/segmented-control';
import { SettingsRow } from './settings-row';

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
        `Imported: ${report.added} added, ${report.updated} updated, ${report.skipped} unchanged`,
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
          ? `${report.candidates} candidate facts found. Memory creation is running.`
          : 'No facts found in the pasted text.',
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
      className="w-[clamp(500px,40vw,560px)]"
      confirm={{
        label: busy
          ? source === 'archive'
            ? 'Importing…'
            : 'Reading…'
          : source === 'archive'
            ? 'Import'
            : 'Import notes',
        disabled: !ready || busy,
        onConfirm: confirm,
      }}
      icon={<UploadIcon />}
      onOpenChange={close}
      open={open}
      title="Import memory"
    >
      <div className="grid">
        <SettingsRow title="From">
          <SegmentedControl
            label="Import from"
            onValueChange={setSource}
            options={[
              { value: 'archive', label: 'Memory export' },
              { value: 'assistant', label: 'Another assistant' },
            ]}
            value={source}
          />
        </SettingsRow>
        {source === 'archive' ? (
          <SettingsRow
            htmlFor="memory-archive-choose"
            info="A .zip saved with Export. Facts merge by id, so importing the same export twice changes nothing."
            title="File"
          >
            <div className="flex w-full min-w-0 items-center gap-2">
              <span
                className="flex h-[1.875rem] min-w-0 flex-1 items-center truncate rounded-md border border-input bg-input/30 px-2.5 font-mono text-[12px] text-foreground"
                title={file?.name}
              >
                {file ? (
                  <span className="truncate">{file.name}</span>
                ) : (
                  <span className="truncate text-faint">No file chosen</span>
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
                Choose…
              </Button>
              <input
                accept=".zip,application/zip"
                aria-label="Memory export (.zip)"
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
            info="Ask your other assistant this, then paste its answer below."
            title="Prompt"
          >
            <Button
              className="w-fit"
              data-initial-focus=""
              disabled={!prompt.data}
              onClick={() => {
                if (!prompt.data) return;
                void navigator.clipboard
                  .writeText(prompt.data)
                  .then(() => toast.success('Prompt copied'));
              }}
              size="sm"
              variant="outline"
            >
              <CopyIcon aria-hidden="true" />
              {prompt.isPending ? 'Loading prompt…' : 'Copy the prompt'}
            </Button>
          </SettingsRow>
        )}
        <SettingsRow
          htmlFor="memory-import-scope"
          info={
            source === 'archive'
              ? 'An export keeps each memory where it was saved.'
              : 'Uses your background memory models and follows the review policy in Create memories.'
          }
          title="Remember in"
        >
          {source === 'archive' ? (
            <MemoryPicker
              disabled
              id="memory-import-scope"
              label="Remember in"
              onChange={() => undefined}
              options={[]}
              placeholder="Where the export kept each memory"
              searchPlaceholder="Search workspaces…"
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
            <label className="text-[12.5px] font-medium" htmlFor="memory-assistant-text">
              Their answer
            </label>
            <Textarea
              className="max-h-48 min-h-24 text-[13px]"
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
