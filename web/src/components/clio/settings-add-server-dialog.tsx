import type { LanguageModelPreset } from '@clio/core/v3';
import { LoaderCircleIcon, ServerIcon } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { useSavedServers } from '@/hooks/use-saved-servers';
import {
  CUSTOM_SERVER_PRESET_ID,
  normalizeServerAddress,
  savedCheckSentence,
} from '@/lib/local-servers';
import { DialogFrame } from './primitives/dialog-frame';
import { SettingsChoice, SettingsRow } from './settings-row';

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
      icon={<ServerIcon className="size-4" />}
      onOpenChange={close}
      open={open}
      srDescription="Add a model server on this computer, another machine or a cluster node."
      title="Add server"
    >
      {added ? (
        <p className="py-2" data-slot="add-server-result" role="status">
          {added.label} was added. {savedCheckSentence(added.check)}
        </p>
      ) : (
        <form
          // The spec's dialog rows (.xdb .xr): label 36%, control the rest, from a 20rem dialog.
          className="[&_[data-slot=settings-row]]:@xs:grid-cols-[36%_minmax(0,1fr)] [&_[data-slot=settings-control]]:@xs:justify-start [&_[data-slot=settings-control]>input]:flex-1"
          data-slot="add-server-dialog"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <SettingsRow
            fullWidth
            info="A known runtime, or Other for any OpenAI-compatible address (vLLM or llama.cpp on a cluster node or another machine)."
            title="Kind"
          >
            <SettingsChoice
              id="add-server-kind"
              label="Server kind"
              onChange={setKind}
              options={kinds}
              value={kind}
            />
          </SettingsRow>
          {runtime ? null : (
            <SettingsRow fullWidth htmlFor="add-server-name" title="Name">
              <Input
                id="add-server-name"
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Optional"
                value={label}
              />
            </SettingsRow>
          )}
          <SettingsRow
            fullWidth
            htmlFor="add-server-address"
            info="On this computer, another machine or a cluster node. It is checked as soon as it is added."
            title="Address"
          >
            <Input
              aria-label="Server address"
              autoComplete="url"
              className="font-mono"
              data-initial-focus=""
              id="add-server-address"
              onChange={(event) => setDraft(event.target.value)}
              placeholder={runtime?.api_base || 'http://my-server:8000/v1'}
              value={draft}
            />
          </SettingsRow>
          {save.isPending ? (
            <p className="flex items-center gap-1.5 pt-2 text-muted-foreground" role="status">
              <LoaderCircleIcon aria-hidden="true" className="size-4 motion-safe:animate-spin" />
              Adding and checking…
            </p>
          ) : save.error ? (
            <p className="truncate pt-2 text-destructive" role="alert" title={save.error.message}>
              {save.error.message}
            </p>
          ) : null}
          <button className="hidden" type="submit" />
        </form>
      )}
    </DialogFrame>
  );
}
