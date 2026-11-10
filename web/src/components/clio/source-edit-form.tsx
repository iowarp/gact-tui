import type { ConnectedSourceState, SourceProvider } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { CircleAlertIcon } from 'lucide-react';
import { useId } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { connectedSourceErrorMessage } from './connected-source-error';
import { SourceFields } from './source-fields';
import { useSourceFields } from './use-source-fields';
import { SourceStatusLine } from './source-form-parts';
import { useSourceFrameFooter } from './use-source-frame-footer';

/**
 * A source's Edit: the connect form's own fields for its provider, in the same
 * frame, with Save once something changed.
 */
export function SourceEditForm({
  workspaceId,
  provider,
  source,
  hostLabel,
  browseStartPath,
  onSaved,
  onDone,
}: {
  workspaceId: string;
  provider: SourceProvider;
  source: ConnectedSourceState;
  hostLabel: string;
  browseStartPath?: string;
  onSaved: (source: ConnectedSourceState) => void;
  onDone: () => void;
}) {
  const formId = useId();
  const repository = useRepository();
  const fields = useSourceFields(provider, source);
  const save = useMutation({
    mutationFn: () =>
      repository.updateConnectedSource(
        workspaceId,
        source.id,
        fields.input(source.mode ?? 'read_only'),
      ),
    onSuccess: (updated) => {
      onSaved(updated);
      onDone();
    },
  });
  const submit = () => {
    if (fields.dirty && fields.ready && !save.isPending) save.mutate();
  };
  const footer = useSourceFrameFooter({
    confirm: {
      label: save.isPending ? 'Saving…' : 'Save',
      disabled: !fields.dirty || !fields.ready || save.isPending,
    },
    onConfirm: submit,
    start: { label: 'Back', back: true, onClick: onDone, disabled: save.isPending },
  });
  return (
    <div className="flex min-w-0 flex-col gap-[13px]">
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
        disabled={save.isPending}
        initialFocus
      />
      {save.error ? (
        <SourceStatusLine role="alert" tone="error" icon={<CircleAlertIcon />}>
          {connectedSourceErrorMessage(save.error)}
        </SourceStatusLine>
      ) : null}
      {footer}
    </div>
  );
}
