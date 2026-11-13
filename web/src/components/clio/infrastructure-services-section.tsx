import type { ProvenanceConnectionInput } from '@clio/core/v3';
import { ActivityIcon, ArrowRightIcon, CpuIcon, LinkIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { InfraList, InfraRow } from './infrastructure-row';
import { ManagedServices } from './managed-services';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton, NamedTooltip } from './primitives/icon-button';
import { ProvenanceConnections } from './provenance-connections';
import { t, ph } from '@lingui/core/macro';

/**
 * The Services tab: services CLIO runs on the chosen computer, provenance
 * connections, and the dialog that attaches a service run elsewhere.
 */
export function InfrastructureServicesSection() {
  const { settings } = useConnectionSettings();
  const [connectServiceOpen, setConnectServiceOpen] = useState(false);
  const [returnToChooser, setReturnToChooser] = useState(false);
  const provenanceScope = connectionScope(settings);
  const [connectProvenance, setConnectProvenance] = useState<{
    scope: string;
    input: ProvenanceConnectionInput;
  }>();
  const openProvenance = (input: ProvenanceConnectionInput) =>
    setConnectProvenance({ scope: provenanceScope, input });
  return (
    <>
      <ManagedServices
        connectedAgentLabel={settings.label}
        connectedAgentLocation={settings.location}
        onConnectExistingService={() => {
          setReturnToChooser(true);
          setConnectServiceOpen(true);
        }}
        onConnectProvenance={(input) => {
          setReturnToChooser(false);
          openProvenance(input);
        }}
      />
      <ProvenanceConnections
        onBack={
          returnToChooser
            ? () => {
                setConnectProvenance(undefined);
                setConnectServiceOpen(true);
              }
            : undefined
        }
        connect={connectProvenance?.scope === provenanceScope ? connectProvenance.input : undefined}
        onClose={() =>
          setConnectProvenance((current) =>
            current?.scope === provenanceScope ? undefined : current,
          )
        }
      />
      <ConnectExistingServiceDialog
        agentLabel={settings.label || vocab.agent}
        open={connectServiceOpen}
        onOpenChange={setConnectServiceOpen}
        onProvenance={(input) => {
          setConnectServiceOpen(false);
          openProvenance(input);
        }}
      />
    </>
  );
}

const PROVENANCE_SERVICES = [
  // i18n-ignore: product names
  { id: 'flowcept', title: 'Flowcept', description: t`Record execution provenance.` },
  // i18n-ignore: product names
  { id: 'cmf', title: 'HPE CMF', description: t`Track artifact lineage.` },
] as const;

/** Attach a service whose deployment stays under the user's control. */
function ConnectExistingServiceDialog({
  agentLabel,
  open,
  onOpenChange,
  onProvenance,
}: {
  agentLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProvenance: (input: ProvenanceConnectionInput) => void;
}) {
  return (
    <DialogFrame
      description={t`Attach a service to ${agentLabel}. Its deployment remains under your control.`}
      icon={<LinkIcon />}
      onOpenChange={onOpenChange}
      open={open}
      title={t`Connect an existing service`}
    >
      <InfraList label={t`Services you can connect`} meta={0}>
        {PROVENANCE_SERVICES.map((service) => (
          <InfraRow
            description={service.description}
            icon={<ActivityIcon />}
            key={service.id}
            primaryAction={
              <IconButton
                icon={<LinkIcon />}
                label={t`Connect ${ph({ title: service.title })}`}
                onClick={() =>
                  onProvenance({ service_id: service.id, label: service.title, url: '' })
                }
                size="sm"
              />
            }
            status={{ tone: 'idle', label: t`Not checked` }}
            title={service.title}
          />
        ))}
        <InfraRow
          description={t`A hosted or self-run model API.`}
          icon={<CpuIcon />}
          primaryAction={
            <NamedTooltip label={t`Connect an inference provider`}>
              <Button
                asChild
                className="rounded-[5px] text-muted-foreground hover:bg-hover hover:text-foreground [&_svg:not([class*=size-])]:size-3.5"
                size="icon-xs"
                variant="ghost"
              >
                <Link aria-label={t`Connect an inference provider`} to="/settings/providers">
                  <ArrowRightIcon aria-hidden="true" />
                </Link>
              </Button>
            </NamedTooltip>
          }
          title={t`Inference provider`}
        />
      </InfraList>
    </DialogFrame>
  );
}
