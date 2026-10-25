import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { MemoryScopePicker, type MemoryScopeOptions } from './memory-scope-picker';

function ArchiveImport({ onDone }: { onDone: () => void }) {
  const repository = useRepository();
  const client = useQueryClient();
  const [file, setFile] = useState<File>();
  const run = useMutation({
    mutationFn: async (chosen: File) =>
      repository.importMemoryArchive(new Uint8Array(await chosen.arrayBuffer())),
    onSuccess: (report) => {
      void client.invalidateQueries({ queryKey: ['memory'] });
      toast.success(
        `Imported: ${report.added} added, ${report.updated} updated, ${report.skipped} unchanged`,
      );
      onDone();
    },
  });
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (file) run.mutate(file);
      }}
    >
      <Label htmlFor="memory-archive">Memory export (.zip)</Label>
      <Input
        accept=".zip,application/zip"
        id="memory-archive"
        onChange={(event) => setFile(event.target.files?.[0])}
        type="file"
      />
      <p className="text-xs text-muted-foreground">
        Facts merge by id. Importing the same export twice changes nothing.
      </p>
      {run.error ? (
        <p className="text-sm text-destructive" role="alert">
          {run.error.message}
        </p>
      ) : null}
      <Button className="w-fit" disabled={!file || run.isPending} type="submit">
        {run.isPending ? 'Importing…' : 'Import'}
      </Button>
    </form>
  );
}

function AssistantImport({
  onDone,
  open,
  ...scopeOptions
}: MemoryScopeOptions & { onDone: () => void; open: boolean }) {
  const repository = useRepository();
  const client = useQueryClient();
  const [text, setText] = useState('');
  const [scope, setScope] = useState('user');
  const prompt = useQuery({
    queryKey: ['memory', 'assistant-prompt'],
    queryFn: ({ signal }) => repository.assistantImportPrompt(signal),
    enabled: open,
    staleTime: Infinity,
  });
  const run = useMutation({
    mutationFn: () => repository.importFromAssistant(text, scope),
    onSuccess: (report) => {
      void client.invalidateQueries({ queryKey: ['memory'] });
      toast.success(
        report.candidates
          ? `${report.candidates} candidate facts found. Memory creation is running.`
          : 'No facts found in the pasted text.',
      );
      setText('');
      onDone();
    },
  });
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Paste another assistant's notes. This uses your background memory models and follows the
        review policy in Memory settings.
      </p>
      <details>
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Get a prompt for another assistant
        </summary>
        <div className="relative mt-2">
          <Textarea
            aria-label="Prompt to give your other assistant"
            className="pr-10 text-xs"
            readOnly
            rows={5}
            value={prompt.data ?? 'Loading…'}
          />
          <Button
            aria-label="Copy the prompt"
            className="absolute top-1 right-1"
            disabled={!prompt.data}
            onClick={() => {
              if (!prompt.data) return;
              void navigator.clipboard.writeText(prompt.data).then(() => toast.success('Copied'));
            }}
            size="icon"
            variant="ghost"
          >
            <CopyIcon aria-hidden="true" />
          </Button>
        </div>
      </details>
      <MemoryScopePicker
        id="memory-import-scope"
        value={scope}
        onChange={setScope}
        disabled={run.isPending}
        {...scopeOptions}
      />
      <Label htmlFor="memory-assistant-text">Their answer</Label>
      <Textarea
        id="memory-assistant-text"
        onChange={(event) => setText(event.target.value)}
        rows={8}
        value={text}
        disabled={run.isPending}
      />
      {run.error ? (
        <p className="text-sm text-destructive" role="alert">
          {run.error.message}
        </p>
      ) : null}
      <Button
        className="w-fit"
        disabled={!text.trim() || run.isPending}
        onClick={() => run.mutate()}
      >
        {run.isPending ? 'Reading…' : 'Import notes'}
      </Button>
    </div>
  );
}

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
  onStarted?: () => void;
}) {
  const done = () => onOpenChange(false);
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import memory</DialogTitle>
          <DialogDescription>
            Bring in an export, or another assistant&apos;s notes.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="archive">
          <TabsList>
            <TabsTrigger value="archive">Memory export</TabsTrigger>
            <TabsTrigger value="assistant">From another assistant</TabsTrigger>
          </TabsList>
          <TabsContent className="pt-3" value="archive">
            <ArchiveImport onDone={done} />
          </TabsContent>
          <TabsContent className="pt-3" value="assistant">
            <AssistantImport
              onDone={() => {
                done();
                onStarted?.();
              }}
              open={open}
              workspaces={workspaces}
              {...scopeOptions}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
