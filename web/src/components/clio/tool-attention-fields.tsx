import type { AttentionBlock, ToolInvocation } from '@clio/core/v3';
import { bucketIntensity, maxRunValue } from '@/lib/attention-text';
import { bindTranscriptText } from '@/lib/transcript-content-selection';
import { verifiedToolField } from '@/lib/verified-tool-field';

/** Exact raw fields keep Unicode-point heat coordinates valid inside the details dialog. */
export function ToolAttentionField({
  block,
  tool,
  sessionId,
}: {
  block: AttentionBlock;
  tool: ToolInvocation;
  sessionId?: string;
}) {
  const source = verifiedToolField(block, tool);
  if (source === undefined)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Attention is unavailable for this changed or unloaded field.
      </p>
    );
  const points = [...source];
  const runs = (block.display_runs ?? block.runs).filter(
    ([lo, hi, value]) => lo >= 0 && hi <= points.length && hi > lo && Number.isFinite(value),
  );
  const boundaries = [...new Set([0, points.length, ...runs.flatMap(([lo, hi]) => [lo, hi])])].sort(
    (a, b) => a - b,
  );
  const maximum = block.display_runs ? 1 : maxRunValue([block]);
  const colors = ['bg-primary/10', 'bg-primary/20', 'bg-primary/30', 'bg-primary/45'];
  const changes = new Map<number, [number, number][]>();
  for (const [lo, hi, value] of runs) {
    changes.set(lo, [...(changes.get(lo) ?? []), [value, 1]]);
    changes.set(hi, [...(changes.get(hi) ?? []), [value, -1]]);
  }
  const active = new Map<number, number>();
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium uppercase text-muted-foreground">
        {block.field === 'input' ? 'Arguments' : 'Result'} · attention
      </h4>
      <pre
        className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs"
        data-session-id={sessionId}
        data-message-id={block.message_id}
        data-part-id={block.part_id}
        data-field={block.field}
        data-content-revision={block.content_revision}
        ref={(element) =>
          bindTranscriptText(element, {
            source,
            partId: block.part_id,
            revision: block.content_revision!,
            field: block.field === 'input' ? 'input' : 'result',
            callId: block.call_id,
          })
        }
      >
        {boundaries.slice(0, -1).map((lo, index) => {
          const hi = boundaries[index + 1]!;
          for (const [value, delta] of changes.get(lo) ?? []) {
            const count = (active.get(value) ?? 0) + delta;
            if (count) active.set(value, count);
            else active.delete(value);
          }
          const value = Math.max(0, ...active.keys());
          return (
            <span
              key={lo}
              className={value > 0 ? colors[bucketIntensity(value, maximum)] : undefined}
            >
              {points.slice(lo, hi).join('')}
            </span>
          );
        })}
      </pre>
    </section>
  );
}
