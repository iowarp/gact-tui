import type { ManagedServiceDefinition } from '@clio/core/v3';
import { InfoTip } from './info-tip';

/** Inspectable requested/effective deployment evidence without credential values. */
export function ManagedServiceReceipt({ service }: { service: ManagedServiceDefinition }) {
  const observation = service.observation;
  if (!observation) return null;
  const monitoring = service.category === 'monitoring';
  return (
    <details>
      <summary className="cursor-pointer text-sm font-medium">Deployment receipt</summary>
      <dl className="mt-3 space-y-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Compatibility profile</dt>
          <dd className="break-all font-mono">{observation.definition_version}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Configuration revision</dt>
          <dd className="break-all font-mono">{observation.configuration_revision}</dd>
        </div>
        {service.configuration.model ? (
          <div>
            <dt className="text-muted-foreground">Model</dt>
            <dd className="break-all font-mono">{service.configuration.model}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-foreground">Evidence on this host</dt>
          <dd className="break-all font-mono">{observation.evidence_directory}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt>{monitoring ? 'Provenance' : 'Attention'}</dt>
          <dd>
            {monitoring
              ? observation.provenance_ingesting
                ? 'Write/readback verified'
                : 'Not verified'
              : observation.attention_verified
                ? 'Verified'
                : 'Not verified'}
          </dd>
          <InfoTip
            label={monitoring ? 'About provenance verification' : 'About attention verification'}
          >
            {monitoring
              ? 'Verify setup writes a fresh test record and reads it back. CMF also checks input and output artifact lineage. Restarting or changing configuration requires a fresh check.'
              : 'Installing the connector or serving a model does not verify attention. A fresh inference must produce a validated capture and token mapping.'}
          </InfoTip>
        </div>
        {Object.entries(observation.effective_artifacts ?? {}).map(([name, digest]) => (
          <div key={name}>
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="break-all font-mono">{digest}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
