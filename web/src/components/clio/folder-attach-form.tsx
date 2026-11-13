import type { ConnectedSourceState, WorkspaceReference } from '@clio/core/v3';
import { useMutation } from '@tanstack/react-query';
import { CircleAlertIcon } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { connectedSourceErrorMessage } from './connected-source-error';
import { DesktopFolderUpload } from './desktop-folder-upload';
import { HostPathPicker } from './host-path-picker';
import { RingSpinner } from './primitives/ring-spinner';
import { FolderFace, SourceField, SourceStatusLine, folderTriggerClass } from './source-form-parts';
import { useSourceFrameFooter } from './use-source-frame-footer';
import { t, ph } from '@lingui/core/macro';

export type FolderPlacement = 'in_place' | 'copy';

/**
 * Attach a folder with no size limit, in one of two ways side by side: use the
 * original folder in place, or make a full copy. In place needs CLIO to run on
 * the computer that has the folder; otherwise the copy is uploaded.
 */
export function FolderAttachForm({
  workspaceId,
  localConnection,
  hostLabel,
  browseStartPath,
  initialFiles,
  onAttached,
  onUploaded,
  onBack,
}: {
  workspaceId: string;
  /** This app runs on the computer CLIO runs on. */
  localConnection: boolean;
  hostLabel: string;
  browseStartPath?: string;
  /** Files dropped on the picker: a copy upload starts with them. */
  initialFiles?: File[];
  onAttached: (reference: WorkspaceReference) => void;
  onUploaded: (source: ConnectedSourceState) => void;
  onBack?: () => void;
}) {
  const uploadOnly = !localConnection || Boolean(initialFiles?.length);
  const [placement, setPlacement] = useState<FolderPlacement>(uploadOnly ? 'copy' : 'in_place');
  return (
    <div className="flex flex-col gap-[13px]">
      <PlacementChoice
        value={placement}
        onChange={setPlacement}
        inPlaceUnavailable={
          uploadOnly
            ? t`Not available here. ${ph({ agent: vocab.agent })} runs on another computer, so it can't open a folder on yours. Use a full copy.`
            : undefined
        }
      />
      {uploadOnly ? (
        <DesktopFolderUpload
          initialFiles={initialFiles}
          workspaceId={workspaceId}
          hostLabel={hostLabel}
          onBack={onBack}
          onComplete={onUploaded}
        />
      ) : (
        <HostFolderFields
          key={placement}
          workspaceId={workspaceId}
          placement={placement}
          hostLabel={hostLabel}
          browseStartPath={browseStartPath}
          onAttached={onAttached}
          onBack={onBack}
        />
      )}
    </div>
  );
}

const placementRows: ReadonlyArray<{ value: FolderPlacement; title: string }> = [
  { value: 'in_place', title: t`Use in place` },
  { value: 'copy', title: t`Full copy` },
];

/** The spec's `.c3r` ring and name, as two bordered cards each with a full explanation. */
function PlacementChoice({
  value,
  onChange,
  inPlaceUnavailable,
}: {
  value: FolderPlacement;
  onChange: (value: FolderPlacement) => void;
  inPlaceUnavailable?: string;
}) {
  const explanation: Record<FolderPlacement, string> = {
    in_place: t`${ph({ agent: vocab.agent })} reads and changes your original folder. Nothing is copied, so it is ready at once, and every change affects your originals.`,
    copy: t`${ph({ agent: vocab.agent })} makes its own copy to work on. Your originals stay untouched. Copying a large folder takes time and needs as much free disk space as the folder.`,
  };
  return (
    <SourceField label={t`How to attach`}>
      <RadioGroupPrimitive.Root
        aria-label={t`How to attach`}
        value={value}
        onValueChange={(next) => onChange(next as FolderPlacement)}
        className="grid grid-cols-2 gap-2"
      >
        {placementRows.map((row) => {
          const reason = row.value === 'in_place' ? inPlaceUnavailable : undefined;
          return (
            <RadioGroupPrimitive.Item
              key={row.value}
              value={row.value}
              disabled={Boolean(reason)}
              className="group flex min-w-0 flex-col gap-1.5 rounded-[8px] border border-input px-2.5 py-2 text-left outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:hover:bg-transparent data-[state=checked]:border-primary"
            >
              <span className="flex items-center gap-[9px] text-menu text-foreground group-disabled:text-faint">
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-full shadow-[inset_0_0_0_1.5px_var(--faint)] group-data-[state=checked]:shadow-[inset_0_0_0_4px_var(--primary)]"
                />
                {row.title}
              </span>
              <span className="text-caption leading-[1.45] text-faint">
                {reason ?? explanation[row.value]}
              </span>
            </RadioGroupPrimitive.Item>
          );
        })}
      </RadioGroupPrimitive.Root>
    </SourceField>
  );
}

function HostFolderFields({
  workspaceId,
  placement,
  hostLabel,
  browseStartPath,
  onAttached,
  onBack,
}: {
  workspaceId: string;
  placement: FolderPlacement;
  hostLabel: string;
  browseStartPath?: string;
  onAttached: (reference: WorkspaceReference) => void;
  onBack?: () => void;
}) {
  const repository = useRepository();
  const [path, setPath] = useState('');
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const attach = useMutation({
    mutationFn: async () => {
      const abort = new AbortController();
      controller.current = abort;
      const resource = await repository.attachHostFolder(
        workspaceId,
        path,
        placement,
        '',
        abort.signal,
      );
      const name =
        path
          .replace(/[/\\]+$/, '')
          .split(/[/\\]/)
          .pop() || path;
      onAttached({
        kind: 'resource',
        id: resource.id,
        label: name,
        detail: placement === 'in_place' ? t`Folder, in place` : t`Folder, full copy`,
        media_type: resource.detected_mime,
        revision: String(resource.revision),
        navigation: {
          resource_id: resource.id,
          source_kind: 'host_folder',
          source_path: path,
          placement,
        },
      });
    },
  });
  const footer = useSourceFrameFooter({
    confirm: {
      label: attach.isPending
        ? placement === 'copy'
          ? t`Copying…`
          : t`Attaching…`
        : placement === 'copy'
          ? t`Copy and attach`
          : t`Attach folder`,
      disabled: !path || attach.isPending,
    },
    onConfirm: () => attach.mutate(),
    start: onBack ? { label: t`Back`, back: true, onClick: onBack } : undefined,
  });
  return (
    <section className="flex flex-col gap-[13px]" aria-label={t`Folder on this computer`}>
      <SourceField
        label={t`Folder`}
        hint={
          placement === 'in_place'
            ? t`Read and write. No size limit.`
            : t`Copied into this workspace on ${hostLabel}. No size limit.`
        }
      >
        <FolderFace path={path}>
          <HostPathPicker
            targetId="local"
            hostLabel={hostLabel}
            label={t`Folder to attach`}
            triggerLabel={t`Choose…`}
            triggerClassName={folderTriggerClass}
            startPath={browseStartPath}
            path={path}
            onChoose={(next) => {
              setPath(next);
              attach.reset();
            }}
            disabled={attach.isPending}
          />
        </FolderFace>
      </SourceField>
      {attach.isPending && placement === 'copy' && (
        <SourceStatusLine role="status" icon={<RingSpinner />}>
          {t`Copying the folder. Large folders take a while.`}
        </SourceStatusLine>
      )}
      {attach.error && (
        <SourceStatusLine role="alert" tone="error" icon={<CircleAlertIcon />}>
          {connectedSourceErrorMessage(attach.error)}
        </SourceStatusLine>
      )}
      {footer}
    </section>
  );
}
