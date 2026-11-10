import { ServerIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DialogFrame } from '@/components/clio/primitives/dialog-frame';
import { SettingsRow } from '@/components/clio/settings-row';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { normalizeEndpoint, type SavedConnection } from '@/lib/connection';
import { DeleteIcon, EditIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { deployNameError, type KnownServiceName } from './deploy-name';
import { CONNECTION_FIELD, endpointError } from './settings-connection-runtime';

const DIALOG_FIELD = 'w-60 max-w-full';

/** Save another agent to switch to later; it is not connected to yet. */
export function AddAgentDialog({
  open,
  onOpenChange,
  known,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  known: readonly KnownServiceName[];
  onAdd: (connection: SavedConnection, name: string) => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [touched, setTouched] = useState(false);
  const normalized = endpointError(address) ? undefined : normalizeEndpoint(address.trim());
  const nameError = deployNameError(name, known, () => false);
  const addressError =
    endpointError(address) ??
    (known.some((service) => service.endpoint === normalized)
      ? 'This agent is already saved.'
      : undefined);
  const close = (next: boolean) => {
    if (!next) {
      setName('');
      setAddress('');
      setTouched(false);
    }
    onOpenChange(next);
  };
  const add = () => {
    setTouched(true);
    if (nameError || addressError || !normalized) return;
    onAdd({ endpoint: normalized }, name.trim());
    close(false);
  };
  return (
    <DialogFrame
      className="w-[clamp(460px,44vw,600px)]"
      open={open}
      onOpenChange={close}
      icon={<ServerIcon className="size-4" />}
      title="Add an agent"
      description="Save another agent to switch to. Nothing changes until you switch."
      confirm={{
        label: 'Add',
        onConfirm: add,
        disabled: touched && Boolean(nameError || addressError),
      }}
      secondary={
        <Button asChild className="mr-auto px-1.5" variant="link">
          <Link to="/?intent=connect">More ways to connect…</Link>
        </Button>
      }
    >
      <SettingsRow
        inlineControl
        title="Name"
        htmlFor="add-agent-name"
        error={touched ? nameError : undefined}
      >
        <Input
          className={cn(CONNECTION_FIELD, DIALOG_FIELD)}
          id="add-agent-name"
          onChange={(event) => setName(event.target.value)}
          placeholder="ares-genesis"
          value={name}
        />
      </SettingsRow>
      <SettingsRow
        inlineControl
        title="Address"
        htmlFor="add-agent-address"
        info="The agent’s full address, including http or https."
        error={touched ? addressError : undefined}
      >
        <Input
          autoCapitalize="off"
          autoCorrect="off"
          className={cn(CONNECTION_FIELD, DIALOG_FIELD, 'font-mono')}
          id="add-agent-address"
          inputMode="url"
          onChange={(event) => setAddress(event.target.value)}
          placeholder="https://agent.example.org"
          spellCheck={false}
          value={address}
        />
      </SettingsRow>
    </DialogFrame>
  );
}

/** Give a saved agent another name. */
export function RenameAgentDialog({
  connection,
  known,
  onOpenChange,
  onRename,
}: {
  connection?: { endpoint: string; label?: string };
  known: readonly KnownServiceName[];
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const value = draft ?? connection?.label ?? '';
  const error = connection
    ? deployNameError(value, known, (other) => other.endpoint === connection.endpoint)
    : undefined;
  const close = (next: boolean) => {
    if (!next) setDraft(undefined);
    onOpenChange(next);
  };
  return (
    <DialogFrame
      open={Boolean(connection)}
      onOpenChange={close}
      icon={<EditIcon className="size-4" />}
      title="Rename agent"
      description={connection?.endpoint}
      confirm={{
        label: 'Rename',
        disabled: Boolean(error),
        onConfirm: () => {
          if (error) return;
          onRename(value.trim());
          close(false);
        },
      }}
    >
      <SettingsRow
        inlineControl
        title="Name"
        htmlFor="rename-agent-name"
        error={draft === undefined ? undefined : error}
      >
        <Input
          className={cn(CONNECTION_FIELD, DIALOG_FIELD)}
          data-initial-focus=""
          id="rename-agent-name"
          onChange={(event) => setDraft(event.target.value)}
          value={value}
        />
      </SettingsRow>
    </DialogFrame>
  );
}

/** Forget a saved agent on this computer; the agent itself is untouched. */
export function RemoveAgentDialog({
  connection,
  onOpenChange,
  onRemove,
}: {
  connection?: { endpoint: string; name: string };
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <DialogFrame
      open={Boolean(connection)}
      onOpenChange={onOpenChange}
      icon={<DeleteIcon className="size-4" />}
      title={`Remove ${connection?.name ?? 'agent'}?`}
      description="Forgets its address and saved access on this computer. The agent keeps running."
      confirm={{
        label: 'Remove',
        tone: 'destructive',
        onConfirm: () => {
          onRemove();
          onOpenChange(false);
        },
      }}
    />
  );
}
