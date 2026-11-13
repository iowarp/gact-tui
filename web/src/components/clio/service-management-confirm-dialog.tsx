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
import { t, ph } from '@lingui/core/macro';

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
              ? t`Reinstall ${ph({ label: service.label })} from scratch?`
              : confirmation === 'delete_data'
                ? t`Delete retained ${ph({ label: service.label })} data?`
                : confirmation === 'reinstall'
                  ? changed
                    ? t`Apply ${ph({ label: service.label })} configuration?`
                    : llama
                      ? t`Reinstall ${ph({ label: service.label })} runtime?`
                      : t`Reinstall ${ph({ label: service.label })}?`
                  : t`Remove ${ph({ label: service.label })} runtime?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {fromScratch
              ? t`This installs again without reusing anything already on the host: images are pulled, environments rebuilt and models downloaded again. It can take much longer.`
              : confirmation === 'delete_data'
                ? t`This permanently deletes this deployment’s databases, environment cache, logs and captured evidence. Separately downloaded models are retained.`
                : confirmation === 'reinstall'
                  ? t`This stops and reinstalls the runtime on the selected host. Existing verification expires; run Verify setup again afterward.`
                  : retainsData
                    ? t`Stop and remove the runtime, retaining its databases, models, logs and evidence.`
                    : t`Stop and remove this deployment and the resources listed under Storage.`}
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
            {confirmation === 'delete_data' ? t`Keep data` : t`Cancel`}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {fromScratch
              ? t`Reinstall from scratch`
              : confirmation
                ? labels[confirmation]
                : t`Continue`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
