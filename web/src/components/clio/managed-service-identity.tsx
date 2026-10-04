import type { ManagedServiceDefinition } from '@clio/core/v3';
import { ActivityIcon, NetworkIcon, PackageIcon } from 'lucide-react';
import { ClioStatus } from './status';
import { BrandIcon } from './brand-icon';

/** Packaged provider marks, with a neutral capability icon when no vendor mark exists. */
export function ManagedServiceLogo({ service }: { service: ManagedServiceDefinition }) {
  const marks: Record<string, string> = { vllm: 'vllm', llama_cpp: 'llama-cpp', ollama: 'ollama' };
  const modelLogo = marks[service.id];
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-background p-2">
      {modelLogo ? (
        <span
          className="size-6 bg-current"
          style={{ mask: `url(/provider-logos/${modelLogo}.svg) center / contain no-repeat` }}
          aria-hidden="true"
        />
      ) : service.id === 'flowcept' ? (
        <img src="/provider-logos/flowcept.png" alt="" className="size-7 object-contain" />
      ) : ['web_search', 'relay'].includes(service.id) ? (
        <BrandIcon className="size-7" />
      ) : service.id === 'cmf' ? (
        <NetworkIcon aria-hidden="true" className="size-5 text-primary" />
      ) : (
        <PackageIcon aria-hidden="true" className="size-5" />
      )}
    </span>
  );
}

/** Report observed readiness separately from installation and verification. */
export function ManagedServiceState({ service }: { service: ManagedServiceDefinition }) {
  const observed = service.observation;
  const label = observed
    ? observed.serving
      ? 'Serving'
      : observed.phase === 'installing'
        ? 'Installing'
        : observed.running
          ? 'Starting'
          : observed.installed
            ? 'Installed · stopped'
            : observed.phase === 'not_installed'
              ? 'Runtime removed'
              : observed.phase
    : service.state === 'running'
      ? 'Running'
      : service.state === 'stopped'
        ? 'Stopped'
        : service.variants.some((row) => row.compatible)
          ? 'Not installed'
          : 'Unavailable here';
  return (
    <ClioStatus
      label={label}
      value={
        observed?.serving || (!observed && service.state === 'running') ? 'healthy' : 'degraded'
      }
    />
  );
}

export function VerificationState({ service }: { service: ManagedServiceDefinition }) {
  if (!service.observation?.provenance_ingesting && !service.observation?.attention_verified)
    return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-success">
      <ActivityIcon className="size-3" aria-hidden="true" />
      {service.observation.attention_verified ? 'Attention verified' : 'Provenance verified'}
    </span>
  );
}
