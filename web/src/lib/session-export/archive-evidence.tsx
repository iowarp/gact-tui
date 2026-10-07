import { useState } from 'react';
import { GroundedMessageResponse } from '@/components/clio/grounded-message-response';
import { RecordedValue, type RecordedTool } from './archive-timeline';

interface EvidenceRow {
  session: { id: string };
  loaded_skills: { event_id: string; skill_id?: string; content?: string }[];
  tool_records: RecordedTool[];
  recording: unknown;
}
/** Format only when expanded, so large traces do not crowd or stall the review. */
export function ExactRecord({ value, label }: { value: unknown; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium">{label}</summary>
      {open && (
        <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </details>
  );
}
/** Keep recorded skill bodies and exact records inside the self-contained HTML. */
export function ArchiveEvidence({
  rows,
  transcript,
  omissions,
}: {
  rows: EvidenceRow[];
  transcript: unknown;
  omissions: unknown;
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Evidence & skills</h2>
      <p className="text-sm text-muted-foreground">
        These instructions and records were saved during this session. Expand an item to read it.
      </p>
      {rows.map((row) => (
        <section key={row.session.id} className="space-y-4">
          <h3 className="text-lg font-semibold">Loaded skill instructions</h3>
          {row.loaded_skills.map((skill, i) => (
            <article key={skill.event_id ?? i} className="rounded-xl border p-4">
              <h4 className="mb-2 font-semibold">{skill.skill_id || 'Loaded skill'}</h4>
              <details>
                <summary className="cursor-pointer text-sm">Show loaded skill instructions</summary>
                <div className="mt-3 max-h-96 overflow-auto">
                  <GroundedMessageResponse
                    components={{ a: ({ children }) => <span>{children}</span> }}
                  >
                    {skill.content ?? 'The original body was not recorded.'}
                  </GroundedMessageResponse>
                </div>
              </details>
            </article>
          ))}
          <h3 className="text-lg font-semibold">Exact tool records</h3>
          {row.tool_records.map((tool) => (
            <article key={tool.call_id} className="rounded-xl border p-4">
              <ExactRecord
                value={tool}
                label={`${tool.tool ?? 'Historical tool'} · ${tool.status ?? 'recorded'} · show exact record`}
              />
            </article>
          ))}
          <h3 className="text-lg font-semibold">Recording coverage</h3>
          <RecordedValue value={row.recording} />
        </section>
      ))}
      <ExactRecord value={transcript} label="Show complete raw transcript and traces" />
      <ExactRecord value={omissions} label="Show unavailable or excluded files" />
    </div>
  );
}
