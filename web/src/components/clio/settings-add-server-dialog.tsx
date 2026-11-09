import type { LanguageModelPreset } from '@clio/core/v3';
import { LoaderCircleIcon, ServerIcon } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSavedServers } from '@/hooks/use-saved-servers';
import {
  CUSTOM_SERVER_PRESET_ID,
  normalizeServerAddress,
  savedCheckSentence,
} from '@/lib/local-servers';
import { DialogFrame } from './primitives/dialog-frame';
import { SettingsChoice } from './settings-row';

const OTHER = 'other';

/**
 * Add a model server: one of the known runtimes at its address, or any
 * OpenAI-compatible address (a vLLM or llama.cpp on a cluster node or another
 * machine). The service saves it and checks it at once; the dialog ends on
 * what the check found.
 */
export function SettingsAddServerDialog({
  open,
  onOpenChange,
  runtimes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Known local runtimes (Ollama, LM Studio, llama.cpp); "Other" is always offered. */
  runtimes: readonly LanguageModelPreset[];
}) {
  const [kind, setKind] = useState(OTHER);
  const [label, setLabel] = useState('');
  const [draft, setDraft] = useState('');
  const { save } = useSavedServers();
  const runtime = runtimes.find((preset) => preset.id === kind);
  const address = normalizeServerAddress(draft, runtime?.provider === 'ollama' ? '/' : '/v1');
  const added = save.data;
  const kinds = [
    ...runtimes
      .filter((preset) => preset.id !== CUSTOM_SERVER_PRESET_ID)
      .map((preset) => ({ value: preset.id, label: preset.label })),
    { value: OTHER, label: 'Other', description: 'Any OpenAI-compatible address' },
  ];

  function close(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setKind(OTHER);
      setLabel('');
      setDraft('');
      save.reset();
    }
  }

  function add() {
    if (!address || save.isPending) return;
    save.mutate(
      runtime ? { address, presetId: runtime.id } : { address, label: label.trim() || undefined },
    );
  }

  return (
    <DialogFrame
      cancelLabel={added ? 'Done' : 'Cancel'}
      confirm={
        added ? undefined : { label: 'Add', onConfirm: add, disabled: !address || save.isPending }
      }
      description="A model server on this computer, another machine or a cluster node."
      icon={<ServerIcon className="size-4" />}
      onOpenChange={close}
      open={open}
      title="Add server"
    >
      {added ? (
        <p data-slot="add-server-result" role="status">
          {added.label} was added. {savedCheckSentence(added.check)}
        </p>
      ) : (
        <form
          className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5 text-[0.8125rem]"
          data-slot="add-server-dialog"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <span className="truncate">Kind</span>
          <div className="min-w-0">
            <SettingsChoice
              id="add-server-kind"
              label="Server kind"
              onChange={setKind}
              options={kinds}
              value={kind}
            />
          </div>
          {runtime ? null : (
            <>
              <Label className="truncate text-[0.8125rem] font-normal" htmlFor="add-server-name">
                Name
              </Label>
              <Input
                className="h-[1.875rem] text-[0.78125rem]"
                id="add-server-name"
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Optional"
                value={label}
              />
            </>
          )}
          <Label className="truncate text-[0.8125rem] font-normal" htmlFor="add-server-address">
            Address
          </Label>
          <Input
            aria-label="Server address"
            autoComplete="url"
            className="h-[1.875rem] font-mono text-[0.78125rem]"
            data-initial-focus=""
            id="add-server-address"
            onChange={(event) => setDraft(event.target.value)}
            placeholder={runtime?.api_base || 'http://my-server:8000/v1'}
            value={draft}
          />
          {save.isPending ? (
            <p className="col-span-2 flex items-center gap-1.5 text-muted-foreground" role="status">
              <LoaderCircleIcon aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              Adding and checking…
            </p>
          ) : save.error ? (
            <p
              className="col-span-2 truncate text-destructive"
              role="alert"
              title={save.error.message}
            >
              {save.error.message}
            </p>
          ) : null}
          <button className="hidden" type="submit" />
        </form>
      )}
    </DialogFrame>
  );
}
