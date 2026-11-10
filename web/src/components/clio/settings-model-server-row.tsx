import type { LanguageModelPreset, SavedServer } from '@clio/core/v3';
import { ServerIcon } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useSavedServers } from '@/hooks/use-saved-servers';
import { useServerCheck } from '@/hooks/use-server-check';
import {
  CloseIcon,
  DeleteIcon,
  EditIcon,
  InfoIcon,
  MoreIcon,
  RefreshIcon,
  RetryIcon,
} from '@/lib/icon-vocabulary';
import {
  isLoopbackAddress,
  normalizeServerAddress,
  serverStatus,
  serverStatusWords,
  shortServerAddress,
} from '@/lib/local-servers';
import { cn } from '@/lib/utils';
import type { ProviderGroup } from './model-picker-model';
import { IconButton } from './primitives/icon-button';
import { ItemRow } from './primitives/item-row';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';

interface ModelServerRowProps {
  /** The preset the server is reached through (a catalog runtime, or `vllm` for a custom one). */
  preset: LanguageModelPreset;
  /** The saved entry: a runtime's changed address, or a custom server. */
  saved: SavedServer | undefined;
  group: ProviderGroup | undefined;
  /** This server is the model new work starts with. */
  isDefault: boolean;
  applying: boolean;
  /** Make this server the default, with `model` when one was found. */
  onUse: (address: string, model: string | undefined) => void;
  /** Open this server's details beside the list. */
  onDetails: () => void;
  /** Its details are open. */
  selected?: boolean;
}

type Mode = 'view' | 'edit' | 'remove';

/**
 * One model server (Ollama, LM Studio, llama.cpp, vLLM, or one the person
 * added) as an item row: name and address, its one status in words, hover
 * actions and one slot button. A stopped server on this computer is a grey
 * "Not running", never an error; a server elsewhere that does not answer is
 * "Can't reach". ↵ edits the address in place, Delete asks inline, Shift F10
 * opens the menu.
 */
/** The item row's slot button (.xi .btn): 26 px, 12 px. */
const SLOT_BUTTON = 'h-[1.625rem] px-2.5 text-xs';

export function ModelServerRow({
  preset,
  saved,
  group,
  isDefault,
  applying,
  onUse,
  onDetails,
  selected = false,
}: ModelServerRowProps) {
  const custom = saved?.custom ?? false;
  const address = saved?.address || preset.api_base || '';
  const label = custom && saved ? saved.label : preset.label;
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState(address);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string>();
  const rowRef = useRef<HTMLDivElement>(null);
  const toDetails = useRef(false);
  const { save, check, remove } = useSavedServers();
  const localCheck = useServerCheck(preset.id);
  const typed = normalizeServerAddress(draft, preset.provider === 'ollama' ? '/' : '/v1');
  const pending = save.isPending || check.isPending || localCheck.isPending || remove.isPending;
  const latest =
    localCheck.data ??
    (saved?.check ? { reachable: saved.check.reachable, models: saved.check.models } : undefined);
  const status = serverStatus({ custom, group, latest });
  const local = isLoopbackAddress(address);
  const error = save.error ?? check.error ?? localCheck.error ?? remove.error;
  const removable = Boolean(saved);
  const removeLabel = custom ? 'Remove' : 'Reset address';

  const words = serverStatusWords(status, address, label);
  const state: { tone: StatusTone; label: string; hint?: string } = pending
    ? { tone: 'running', label: mode === 'remove' ? 'Removing' : 'Checking' }
    : words;

  const detail = error
    ? error.message
    : notice
      ? notice
      : status.kind === 'running'
        ? `${status.models} ${status.models === 1 ? 'model' : 'models'}`
        : status.kind === 'stopped' && !local
          ? 'No answer at this address'
          : undefined;

  function focusRow() {
    requestAnimationFrame(() => rowRef.current?.focus({ preventScroll: true }));
  }

  function startEdit() {
    setDraft(address);
    setNotice(undefined);
    setMode('edit');
  }

  function cancel() {
    setMode('view');
    focusRow();
  }

  async function runCheck() {
    setNotice(undefined);
    if (saved) {
      const result = await check.mutateAsync(saved.id);
      return result.check
        ? { reachable: result.check.reachable, models: result.check.models }
        : undefined;
    }
    return localCheck.mutateAsync(address);
  }

  async function saveAddress() {
    if (!typed) return;
    localCheck.reset();
    await save.mutateAsync({
      address: typed,
      presetId: custom ? undefined : preset.id,
      serverId: saved?.id,
    });
    setMode('view');
    focusRow();
  }

  async function confirmRemove() {
    if (!saved) return;
    await remove.mutateAsync(saved.id);
    setMode('view');
  }

  async function use() {
    if (status.kind === 'running') {
      onUse(address, latest?.models[0]);
      return;
    }
    const found = await runCheck().catch(() => undefined);
    if (found?.reachable) onUse(address, found.models[0]);
    else setNotice(`Start ${label}, then choose Use`);
  }

  function askRemove() {
    if (!removable) return;
    setNotice(undefined);
    setMode('remove');
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (mode === 'remove' && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (event.target !== event.currentTarget || mode !== 'view') return;
    if (event.key === 'Enter') {
      event.preventDefault();
      startEdit();
    } else if (event.key === 'Delete') {
      event.preventDefault();
      askRemove();
    } else if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      event.preventDefault();
      setMenuOpen(true);
    }
  }

  const meta =
    mode === 'edit' ? (
      <Input
        aria-label={`${label} address`}
        autoComplete="url"
        autoFocus
        className="h-5 rounded-[4px] px-1.5 font-mono text-xs md:text-xs"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void saveAddress();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
        }}
        value={draft}
      />
    ) : (
      <span className="flex min-w-0 items-baseline gap-3">
        <span className="min-w-0 truncate font-mono" title={address}>
          {shortServerAddress(address)}
        </span>
        {detail ? (
          <span
            className={cn(
              'min-w-0 shrink-[100] truncate',
              // On a phone the status line under the name says this; the address keeps the width.
              error ? 'text-destructive' : '@max-sm:hidden',
            )}
            role={error ? 'alert' : undefined}
            title={detail}
          >
            {detail}
          </span>
        ) : null}
      </span>
    );

  const actions =
    mode === 'view' ? (
      <>
        <IconButton
          icon={<EditIcon />}
          label="Edit address"
          onClick={startEdit}
          shortcut="menu-pick"
          size="sm"
        />
        {removable ? (
          <IconButton
            disabled={pending}
            icon={custom ? <DeleteIcon /> : <RetryIcon />}
            label={removeLabel}
            onClick={askRemove}
            size="sm"
          />
        ) : null}
        <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
          <DropdownMenuTrigger asChild>
            <IconButton
              icon={<MoreIcon />}
              label={`More for ${label}`}
              shortcut="focused-menu"
              size="sm"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-44"
            onCloseAutoFocus={(event) => {
              // Open the details once the menu has let go of focus, so the pane keeps it.
              if (!toDetails.current) return;
              toDetails.current = false;
              event.preventDefault();
              onDetails();
            }}
          >
            <DropdownMenuItem
              disabled={pending}
              onSelect={() => void runCheck().catch(() => undefined)}
            >
              <RefreshIcon aria-hidden="true" />
              Check again
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                toDetails.current = true;
              }}
            >
              <InfoIcon aria-hidden="true" />
              Details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={startEdit}>
              <EditIcon aria-hidden="true" />
              Edit address
            </DropdownMenuItem>
            {removable ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={askRemove} variant={custom ? 'destructive' : 'default'}>
                  {custom ? <DeleteIcon aria-hidden="true" /> : <RetryIcon aria-hidden="true" />}
                  {removeLabel}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    ) : (
      <IconButton icon={<CloseIcon />} label="Cancel" onClick={cancel} size="sm" />
    );

  const slot =
    mode === 'edit' ? (
      <Button
        disabled={!typed || pending}
        onClick={() => void saveAddress()}
        className={SLOT_BUTTON}
        size="sm"
        type="button"
      >
        Save
      </Button>
    ) : isDefault ? (
      <span
        className="inline-flex items-center rounded-[7px] bg-hover px-2 py-[3px] text-[13px] text-foreground"
        data-slot="server-in-use"
      >
        In use
      </span>
    ) : status.kind === 'running' || (status.kind === 'stopped' && local) ? (
      <Button
        aria-label={`Use ${label}`}
        disabled={applying || pending}
        onClick={() => void use()}
        className={SLOT_BUTTON}
        size="sm"
        type="button"
        variant="outline"
      >
        Use
      </Button>
    ) : (
      <Button
        aria-label={status.kind === 'unknown' ? `Check ${label}` : `Retry ${label}`}
        disabled={pending}
        onClick={() => void runCheck().catch(() => undefined)}
        className={SLOT_BUTTON}
        size="sm"
        type="button"
        variant="outline"
      >
        {status.kind === 'unknown' ? 'Check' : 'Retry'}
      </Button>
    );

  const confirm =
    mode === 'remove' ? (
      <>
        <span className="min-w-0 truncate text-[12.5px] text-destructive" role="alert">
          {custom ? `Remove ${label}?` : `Go back to ${shortServerAddress(preset.api_base ?? '')}?`}
        </span>
        <Button
          autoFocus
          className={SLOT_BUTTON}
          onClick={cancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          Keep
        </Button>
        <Button
          className={SLOT_BUTTON}
          disabled={pending}
          onClick={() => void confirmRemove()}
          size="sm"
          type="button"
          variant={custom ? 'destructive' : 'outline'}
        >
          {custom ? 'Remove' : 'Reset'}
        </Button>
      </>
    ) : undefined;

  return (
    <ItemRow
      actionsWidth={104}
      actions={actions}
      actionsVisible={mode !== 'view' || menuOpen}
      foldActions
      confirm={confirm}
      aria-label={`${label}, ${state.label}`}
      data-provider-id={saved?.id ?? preset.id}
      data-slot="model-server-row"
      icon={<ServerIcon />}
      meta={meta}
      onKeyDown={onKeyDown}
      ref={rowRef}
      selected={selected}
      slot={slot}
      slotWidth={84}
      status={
        <span className="flex min-w-0" title={state.hint}>
          <StatusIndicator label={state.label} tone={state.tone} />
        </span>
      }
      statusWidth={158}
      tabIndex={0}
      title={<span title={label}>{label}</span>}
    />
  );
}
