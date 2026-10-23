import { BoxIcon } from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { useEvidenceSections } from '@/hooks/use-evidence-disclosures';
import { EvidenceSection } from './observability-evidence-section';
import { sessionEvidenceItems, type SessionEvidenceSummaryProps } from './session-evidence-items';
import { SESSION_RAIL_SECTIONS, type SessionRailItem } from './session-rail-layout';

/** Compact inventory of the same authoritative evidence used by the full view. */
export function SessionEvidenceSummary(props: SessionEvidenceSummaryProps) {
  return <SessionInventorySummary items={sessionEvidenceItems(props)} scope="evidence-summary" />;
}

export function SessionInventorySummary({
  items,
  scope,
}: {
  items: SessionRailItem[];
  scope: string;
}) {
  const sections = useEvidenceSections(
    scope,
    items.filter((item) => item.defaultOpen !== false).map((item) => item.id),
  );
  return (
    <Accordion type="multiple" {...sections}>
      {items.map((item) => (
        <EvidenceSection
          compact
          key={item.id}
          icon={item.icon ?? BoxIcon}
          label={SESSION_RAIL_SECTIONS.find((section) => section.id === item.id)!.label}
          value={item.id}
          count={item.count ?? 0}
          summary={item.summary}
        >
          {item.content}
        </EvidenceSection>
      ))}
    </Accordion>
  );
}
