import type { ConnectedSourceState, SourceProvider } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { CheckIcon, CircleAlertIcon, TriangleAlertIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { ConnectedAccountActions } from './connected-account-actions';
import { connectedSourceErrorMessage } from './connected-source-error';
import { DesktopFolderUpload } from './desktop-folder-upload';
import { NDPSourcePicker } from './ndp-source-picker';
import { ObsidianSourceForm, type ObsidianChoice } from './obsidian-source-form';
import { SourceFields } from './source-fields';
import { useSourceFields } from './use-source-fields';
import {
  AccessRows,
  ProviderSwitch,
  SourceProviderGlyph,
  SourceStatusLine,
  type SourceChoiceId,
} from './source-form-parts';
import { accessModes, unavailableAccess, type SourceAccess } from './source-access';
import { useSourceFrameFooter } from './use-source-frame-footer';
import { SourceProviderInfo } from './source-provider-info';
import { t, ph } from '@lingui/core/macro';

const order: SourceChoiceId[] = [
  'local',
  'upload',
  'sftp',
  'github',
  'google_drive',
  'globus',
  'obsidian',
  'ndp',
  's3',
];

const signInSentences: Partial<Record<SourceProvider['id'], string>> = {
  github: t`Public repositories don't need sign-in.`,
  google_drive: t`Sign in to Google Drive to reach your folders.`,
  globus: t`Sign in to Globus to reach your collections.`,
  ndp: t`Sign in for private datasets and your groups.`,
};

/**
 * The spec's one connect form: a row of providers, and the chosen provider's
 * own fields under it. Every provider keeps its full setup: SSH hosts, GitHub
 * revisions, Globus receiving storage, Obsidian vaults, the NDP catalog and
 * desktop folder uploads.
 */
export function ConnectedSourceForm({
  workspaceId,
  providers,
  initialChoice,
  localConnection,
  hostLabel,
  browseStartPath,
  obsidianChoice,
  uploadFiles,
  onConnected,
  onConnectedMany,
  onSignIn,
  onBack,
}: {
  workspaceId: string;
  providers: SourceProvider[];
  initialChoice?: SourceChoiceId;
  /** This app runs on the computer CLIO runs on, so a folder is a local folder. */
  localConnection: boolean;
  hostLabel: string;
  browseStartPath?: string;
  obsidianChoice?: ObsidianChoice;
  /** Files dropped on the picker: start on Upload with them. */
  uploadFiles?: File[];
  onConnected: (source: ConnectedSourceState) => void;
  onConnectedMany: (sources: ConnectedSourceState[]) => void;
  onSignIn: (provider: SourceProvider) => void;
  /** Return to the list it was opened from. */
  onBack?: () => void;
}) {
  const options = order.flatMap((id): { id: SourceChoiceId; name: string }[] => {
    if (id === 'upload')
      return localConnection && !uploadFiles?.length
        ? []
        : [{ id, name: t`Upload from this computer` }];
    const provider = providers.find((row) => row.id === id);
    if (!provider) return [];
    return [
      {
        id,
        name:
          id === 'local'
            ? localConnection
              ? t`This computer`
              : t`Folder on ${hostLabel}`
            : provider.name,
      },
    ];
  });
  const fallback = options[0]?.id ?? 'local';
  const [choice, setChoice] = useState<SourceChoiceId>(
    initialChoice && options.some((option) => option.id === initialChoice)
      ? initialChoice
      : uploadFiles?.length
        ? 'upload'
        : fallback,
  );
  // A provider requested before the provider list arrives is taken once it is listed.
  const [requested, setRequested] = useState(initialChoice !== choice ? initialChoice : undefined);
  if (requested && options.some((option) => option.id === requested)) {
    setRequested(undefined);
    setChoice(requested);
  }
  const provider = providers.find((row) => row.id === choice);
  return (
    <div className="flex flex-col gap-[13px]">
      <ProviderSwitch
        options={options}
        value={choice}
        onChange={(id) => {
          setRequested(undefined);
          setChoice(id);
        }}
        aside={provider ? <SourceProviderInfo provider={provider} /> : undefined}
      />
      {choice === 'upload' ? (
        <DesktopFolderUpload
          initialFiles={uploadFiles}
          workspaceId={workspaceId}
          hostLabel={hostLabel}
          onBack={onBack}
          onComplete={onConnected}
        />
      ) : !provider ? null : provider.id === 'ndp' ? (
        <>
          <ProviderAccount provider={provider} onSignIn={onSignIn} />
          <NDPSourcePicker
            workspaceId={workspaceId}
            provider={provider}
            onConnected={onConnectedMany}
            onBack={onBack}
          />
        </>
      ) : provider.id === 'obsidian' ? (
        <ObsidianSourceForm
          initialChoice={obsidianChoice}
          workspaceId={workspaceId}
          hostLabel={hostLabel}
          browseStartPath={browseStartPath}
          onConnected={onConnected}
          onBack={onBack}
        />
      ) : (
        <ProviderForm
          key={provider.id}
          workspaceId={workspaceId}
          provider={provider}
          hostLabel={hostLabel}
          browseStartPath={browseStartPath}
          onConnected={onConnected}
          onSignIn={onSignIn}
          onBack={onBack}
        />
      )}
    </div>
  );
}

/** A browser-signed account as the spec's status line: who is signed in, or a Sign in action. */
export function ProviderAccount({
  provider,
  onSignIn,
}: {
  provider: SourceProvider;
  onSignIn: (provider: SourceProvider) => void;
}) {
  if (!provider.configured && provider.setup_requirement)
    return (
      <SourceStatusLine tone="warning" icon={<TriangleAlertIcon />}>
        {provider.setup_requirement}
      </SourceStatusLine>
    );
  if (provider.authentication !== 'browser') return null;
  if (provider.authenticated)
    return (
      <SourceStatusLine
        tone="ok"
        icon={<CheckIcon />}
        actions={<ConnectedAccountActions provider={provider} />}
      >
        {provider.account_name
          ? t`Signed in as ${ph({ account: provider.account_name })}`
          : t`Signed in`}
      </SourceStatusLine>
    );
  return (
    <SourceStatusLine
      icon={<UserGlyph />}
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t`Sign in to ${ph({ name: provider.name })}`}
          onClick={() => onSignIn(provider)}
        >
          <SourceProviderGlyph provider={provider.id} className="size-3.5" />
          {t`Sign in`}
        </Button>
      }
    >
      {signInSentences[provider.id] ?? t`Sign in to ${ph({ name: provider.name })}.`}
    </SourceStatusLine>
  );
}

function UserGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function ProviderForm({
  workspaceId,
  provider,
  hostLabel,
  browseStartPath,
  onConnected,
  onSignIn,
  onBack,
}: {
  workspaceId: string;
  provider: SourceProvider;
  hostLabel: string;
  browseStartPath?: string;
  onConnected: (source: ConnectedSourceState) => void;
  onSignIn: (provider: SourceProvider) => void;
  onBack?: () => void;
}) {
  const formId = useId();
  const repository = useRepository();
  const fields = useSourceFields(provider);
  const unavailable = unavailableAccess(provider);
  const [access, setAccess] = useState<SourceAccess>('read_only');
  const connect = useMutation({
    mutationFn: () =>
      repository.createConnectedSource(workspaceId, fields.input(accessModes[access])),
    onSuccess: onConnected,
  });
  const submit = () => {
    if (fields.ready && !connect.isPending) connect.mutate();
  };
  const footer = useSourceFrameFooter({
    confirm: {
      label: connect.isPending ? t`Connecting…` : t`Connect`,
      disabled: !fields.ready || connect.isPending,
    },
    onConfirm: submit,
    start: onBack
      ? { label: t`Back`, back: true, onClick: onBack, disabled: connect.isPending }
      : undefined,
  });
  return (
    <>
      <form
        id={formId}
        hidden
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      />
      <SourceFields
        fields={fields}
        hostLabel={hostLabel}
        browseStartPath={browseStartPath}
        formId={formId}
        disabled={connect.isPending}
      />
      <AccessRows
        value={access}
        onChange={setAccess}
        unavailable={unavailable}
        disabled={connect.isPending}
      />
      <ProviderAccount provider={provider} onSignIn={onSignIn} />
      {connect.error ? (
        <SourceStatusLine role="alert" tone="error" icon={<CircleAlertIcon />}>
          {connectedSourceErrorMessage(connect.error)}
        </SourceStatusLine>
      ) : null}
      {footer}
    </>
  );
}
