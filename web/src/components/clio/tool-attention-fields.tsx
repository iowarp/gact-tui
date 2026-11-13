import type { AttentionBlock, ToolInvocation } from '@clio/core/v3';
import { segmentLevel } from '@/lib/attention-segment-heat';
import { maxRunValue } from '@/lib/attention-text';
import { bindTranscriptText } from '@/lib/transcript-content-selection';
import { verifiedToolField } from '@/lib/verified-tool-field';
import { t } from '@lingui/core/macro';

/**
 * The conversation's heat ramp (SPOTTER levels 1..9 on the signal hue), as utility
 * classes for plain spans. Level 0 is not painted.
 */
const LEVEL_CLASSES = [
  '',
  'bg-chart-5/8',
  'bg-chart-5/16',
  'bg-chart-5/24',
  'bg-chart-5/32',
  'bg-chart-5/40',
  'bg-chart-5/48',
  'bg-chart-5/56 text-foreground',
  'bg-chart-5/64 text-foreground',
  'bg-chart-5/72 text-foreground',
];

/**
 * Exact raw fields keep Unicode-point heat coordinates valid inside the details dialog.
 * Each kept token is painted on the same levels as the conversation's token heat.
 */
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
        {t`Attention is unavailable for this changed or unloaded field.`}
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
  const changes = new Map<number, [number, number][]>();
  for (const [lo, hi, value] of runs) {
    changes.set(lo, [...(changes.get(lo) ?? []), [value, 1]]);
    changes.set(hi, [...(changes.get(hi) ?? []), [value, -1]]);
  }
  const active = new Map<number, number>();
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium uppercase text-muted-foreground">
        {block.field === 'input' ? t`Attention on arguments` : t`Attention on result`}
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
          const level = segmentLevel(Math.max(0, ...active.keys()), maximum);
          return (
            <span
              className={LEVEL_CLASSES[level] || undefined}
              data-heat-level={level || undefined}
              key={lo}
            >
              {points.slice(lo, hi).join('')}
            </span>
          );
        })}
      </pre>
    </section>
  );
}
