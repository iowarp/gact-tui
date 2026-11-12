import type { ManagedServiceDefinition } from '@clio/core/v3';
import type { ComponentProps } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { InstallExpectation } from './install-expectation';
import type { ServiceAction } from './service-management-types';

/** Confirms a destructive or slow lifecycle verb before it runs on the host. */
export function ServiceConfirmDialog({
  service,
  confirmation,
  fromScratch,
  changed,
  llama,
  retainsData,
  expectation,
  hostLabel,
  labels,
  onDismiss,
  onConfirm,
}: {
  service: ManagedServiceDefinition;
  confirmation?: ServiceAction;
  fromScratch: boolean;
  changed: boolean;
  llama: boolean;
  retainsData: boolean;
  expectation: ComponentProps<typeof InstallExpectation>;
  hostLabel: string;
  labels: Record<ServiceAction, string>;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={Boolean(confirmation)}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {fromScratch
              ? `Reinstall ${service.label} from scratch?`
              : confirmation === 'delete_data'
                ? `Delete retained ${service.label} data?`
                : confirmation === 'reinstall'
                  ? changed
                    ? `Apply ${service.label} configuration?`
                    : `Reinstall ${service.label}${llama ? ' runtime' : ''}?`
                  : `Remove ${service.label} runtime?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {fromScratch
              ? 'This installs again without reusing anything already on the host: images are pulled, environments rebuilt and models downloaded again. It can take much longer.'
              : confirmation === 'delete_data'
                ? 'This permanently deletes this deployment’s databases, environment cache, logs and captured evidence. Separately downloaded models are retained.'
                : confirmation === 'reinstall'
                  ? 'This stops and reinstalls the runtime on the selected host. Existing verification expires; run Verify setup again afterward.'
                  : retainsData
                    ? 'Stop and remove the runtime, retaining its databases, models, logs and evidence.'
                    : 'Stop and remove this deployment and the resources listed under Storage.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {fromScratch || confirmation === 'reinstall' ? (
          <InstallExpectation {...expectation} />
        ) : null}
        <p className="break-all font-mono text-xs">
          {hostLabel} {service.configuration['storage.service_directory']}
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel>
            {confirmation === 'delete_data' ? 'Keep data' : 'Cancel'}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {fromScratch
              ? 'Reinstall from scratch'
              : confirmation
                ? labels[confirmation]
                : 'Continue'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
