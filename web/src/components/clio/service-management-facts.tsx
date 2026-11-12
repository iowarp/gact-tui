import type { ManagedServiceDefinition } from '@clio/core/v3';
import type { ReactNode } from 'react';
import {
  ActivityIcon,
  CpuIcon,
  HardDriveIcon,
  LayersIcon,
  LinkIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  ShieldIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { InfoTip } from './info-tip';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';

const ACCESS_WORDS: Record<NonNullable<ManagedServiceDefinition['access']>['mode'], string> = {
  api_key: 'Protected by a key',
  shared: 'Shared, no key',
  unprotected: 'Not protected',
};

/** A verification fact: plain words, its colour only reinforcing them, and the ⓘ behind it. */
function Verified({
  children,
  ok,
  okLabel,
  tip,
}: {
  children: ReactNode;
  ok?: boolean;
  okLabel: string;
  tip: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={ok ? 'text-success' : undefined}>{ok ? okLabel : 'Not verified yet'}</span>
      <InfoTip className="size-5" label={tip}>
        {children}
      </InfoTip>
    </span>
  );
}

/** The status tab's facts: profile, revision, model, address, access and verification. */
export function ServiceFacts({
  service,
  variant,
  monitoring,
  running,
}: {
  service: ManagedServiceDefinition;
  variant: string;
  monitoring: boolean;
  running: boolean;
}) {
  const variantRow = service.variants.find((row) => row.id === variant);
  const model =
    service.configuration.hf_model ||
    service.configuration.model ||
    service.configuration.model_path;
  const revision = service.observation?.configuration_revision;
  const facts = (
    [
      variantRow
        ? {
            label: 'Compatibility profile',
            icon: <ShieldIcon aria-hidden="true" />,
            value: variantRow.label,
            title: `${variantRow.label} (${variantRow.id})`,
          }
        : undefined,
      revision
        ? {
            label: 'Configuration revision',
            icon: <LayersIcon aria-hidden="true" />,
            value: revision.length > 12 ? revision.slice(0, 12) : revision,
            title: revision,
            mono: true,
          }
        : undefined,
      model
        ? {
            label: 'Model',
            icon: <CpuIcon aria-hidden="true" />,
            value: model,
            mono: true,
            title: model,
          }
        : undefined,
      service.connection_url && running
        ? {
            label: 'Address',
            icon: <LinkIcon aria-hidden="true" />,
            value: service.connection_url,
            mono: true,
            title: service.connection_url,
          }
        : undefined,
      service.access
        ? {
            label: 'Access',
            icon: <ShieldCheckIcon aria-hidden="true" />,
            value: (
              <span
                className={service.access.mode === 'unprotected' ? 'text-warning' : undefined}
                data-mode={service.access.mode}
                data-slot="service-access"
              >
                {ACCESS_WORDS[service.access.mode]}
              </span>
            ),
            title: service.access.detail,
          }
        : undefined,
      service.observation?.evidence_directory
        ? {
            label: 'Evidence on this host',
            icon: <ScrollTextIcon aria-hidden="true" />,
            value: service.observation.evidence_directory,
            mono: true,
            title: service.observation.evidence_directory,
          }
        : undefined,
      monitoring
        ? {
            label: 'Provenance',
            icon: <ActivityIcon aria-hidden="true" />,
            value: (
              <Verified
                ok={service.observation?.provenance_ingesting}
                okLabel="Write/readback verified"
                tip="About provenance verification"
              >
                Verify setup writes a fresh test record and reads it back. CMF also checks input and
                output artifact lineage. Restarting or changing configuration requires a fresh
                check.
              </Verified>
            ),
          }
        : undefined,
      monitoring || (service.category === 'model_runtime' && service.observation)
        ? {
            label: 'Attention',
            icon: <TriangleAlertIcon aria-hidden="true" />,
            value: (
              <Verified
                ok={service.observation?.attention_verified}
                okLabel="Verified"
                tip="About attention verification"
              >
                Installing the connector or serving a model does not verify attention. A fresh
                inference must produce a validated capture and token mapping.
              </Verified>
            ),
          }
        : undefined,
    ] as (KeyValueItem | undefined)[]
  ).filter((item): item is KeyValueItem => Boolean(item));
  return facts.length ? (
    <KeyValueGrid
      aria-label={`${service.label} details`}
      className="-mx-2"
      items={facts}
      variant="card"
    />
  ) : null;
}

/** Where the service keeps its data, images, downloads and pinned artifacts on the host. */
export function ServiceStorageFacts({
  service,
  hostLabel,
}: {
  service: ManagedServiceDefinition;
  hostLabel: string;
}) {
  return (
    <KeyValueGrid
      items={(
        [
          service.configuration['storage.service_directory']
            ? {
                label: `Service data on ${hostLabel}`,
                icon: <HardDriveIcon aria-hidden="true" />,
                value: String(service.configuration['storage.service_directory']),
                mono: true,
                title: String(service.configuration['storage.service_directory']),
              }
            : undefined,
          service.observation?.evidence_directory
            ? {
                label: 'Retained evidence',
                icon: <ScrollTextIcon aria-hidden="true" />,
                value: service.observation.evidence_directory,
                mono: true,
                title: service.observation.evidence_directory,
              }
            : undefined,
          service.configuration['storage.container_images']
            ? {
                label: `Container images on ${hostLabel}`,
                icon: <LayersIcon aria-hidden="true" />,
                value: String(service.configuration['storage.container_images']),
                mono: true,
                title: String(service.configuration['storage.container_images']),
              }
            : undefined,
          service.configuration['storage.container_downloads']
            ? {
                label: 'Download scratch space',
                icon: <HardDriveIcon aria-hidden="true" />,
                value: String(service.configuration['storage.container_downloads']),
                mono: true,
                title: String(service.configuration['storage.container_downloads']),
              }
            : undefined,
          ...Object.entries(service.observation?.effective_artifacts ?? {}).map(
            ([name, digest]) => ({
              label: name,
              icon: <ShieldIcon aria-hidden="true" />,
              value: digest,
              mono: true,
              title: digest,
            }),
          ),
        ] as (KeyValueItem | undefined)[]
      ).filter((item): item is KeyValueItem => Boolean(item))}
      variant="card"
    />
  );
}
